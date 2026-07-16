import { syncFamilySkillPacks } from './opl-skills.ts';
import { runOplAgentPackageBulkUpdate } from './agent-package-registry.ts';
import { reconcileBaseManagedDependencies } from './base-managed-dependencies.ts';
import {
  buildOplModules,
  resolveManagedModuleCheckoutPath,
  resolveOplDomainModuleSpec,
  runOplModuleAction,
} from './system-installation/modules.ts';
import { rollbackManagedModulePackageChannel } from './system-installation/module-package-channel.ts';
import { runOplStartupMaintenance } from './system-installation/startup-maintenance.ts';
import { isRecord } from '../../kernel/contract-validation.ts';
import type { FrameworkContracts } from '../../kernel/types.ts';
import {
  buildManagedUpdateKernelProjection,
} from './managed-update-kernel.ts';
import {
  bindOwnerExecutionResult,
  MANAGED_UPDATE_OWNER_ACTIONS,
  managedUpdateCommand,
  managedUpdateComponentMatches,
  managedUpdateComponentReceiptInput,
  managedUpdatePostApplyStatus,
  managedUpdateReloadStatus,
  ownerBoundaryRef,
  selectedManagedUpdateComponentIds,
  type ManagedUpdateComponentReceiptInput,
  type ManagedUpdateKernelInput,
  type ManagedUpdateOwnerExecutionReceiptResult,
  type ManagedUpdateOwnerExecutionStatus,
  type ManagedUpdateOwnerPostApplyAction,
  type ManagedUpdateProviderAdapterId,
  type ManagedUpdateReceiptApplyMode,
  type ManagedUpdateReceiptStatusDetail,
  type ManagedUpdateReloadGuidance,
} from './managed-update-owner-boundary.ts';
import { resolveFrameworkUpdateTargetRoot, runOplFrameworkSelfRollback } from './system-installation/framework-self-update.ts';
import { rollbackCodexRuntimeGeneration } from './system-installation/engine-helpers.ts';
import { resolveProjectRoot } from './system-installation/shared.ts';
import {
  acquireManagedUpdateLock,
  MANAGED_UPDATE_LOCK_STALE_AFTER_SECONDS,
} from './managed-update-lock.ts';
import {
  managedUpdateComponentReceiptLedgerFilePath,
  recordManagedUpdateComponentReceipts,
} from './managed-update-component-receipts.ts';

type ManagedUpdateProjection = Awaited<ReturnType<typeof buildManagedUpdateKernelProjection>>;

type AdapterExecutionResult = ManagedUpdateOwnerExecutionReceiptResult & {
  reason: string;
  result: Record<string, unknown> | null;
  error: Record<string, unknown> | null;
  write_receipt?: boolean;
};

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function records(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> => isRecord(entry))
    : [];
}

function nestedRecord(value: unknown, key: string) {
  return isRecord(value) && isRecord(value[key]) ? value[key] : null;
}

function nestedString(value: unknown, key: string) {
  return isRecord(value) ? stringValue(value[key]) : null;
}

function readSkipReason(entry: Record<string, unknown>) {
  const installerResult = nestedRecord(entry, 'installer_result');
  const workspaceOrQuest = nestedRecord(installerResult, 'workspace_or_quest_local_skill');
  return nestedString(workspaceOrQuest, 'skip_reason');
}

function isExpectedTargetBoundScholarSkillsSkip(entry: Record<string, unknown>) {
  return nestedString(entry, 'domain_id') === 'scholarskills'
    && nestedString(entry, 'sync_status') === 'skipped'
    && readSkipReason(entry) === 'workspace_or_quest_target_required';
}

function adapterResultRef(componentId: string, operation: ManagedUpdateKernelInput['operation'], payload: Record<string, unknown> | null) {
  const explicitRef = nestedString(payload, 'receipt_ref');
  if (explicitRef) {
    return explicitRef;
  }
  const resultRef = nestedString(payload, 'result_ref');
  if (resultRef) {
    return resultRef;
  }
  return `opl://managed-update-adapter/${componentId}/${operation}/${new Date().toISOString()}`;
}

function runtimeAdapterReceiptRef(operation: ManagedUpdateKernelInput['operation']) {
  return adapterResultRef('runtime_substrate', operation, null);
}

function runtimeRollbackRef(receiptRef: string) {
  return ownerBoundaryRef('opl://managed-update', 'runtime_substrate', MANAGED_UPDATE_OWNER_ACTIONS.revert, receiptRef);
}

function systemActionStatus(value: unknown): ManagedUpdateOwnerExecutionStatus {
  const status = nestedString(value, 'status');
  if (status === 'completed') {
    return 'completed';
  }
  if (status === 'skipped') {
    return 'skipped';
  }
  if (status === 'failed') {
    return 'failed';
  }
  return 'manual_required';
}

function moduleStatus(result: unknown) {
  return isRecord(result) && result.status === 'completed' ? 'completed' : 'manual_required';
}

function reconcileLegacyChannelTargets() {
  if (!process.env.OPL_PACKAGE_CHANNEL_MANIFEST_REF?.trim()) return [];
  return buildOplModules().modules.modules.filter((module) => module.default_install).map((module) => {
    if (!module.installed || module.install_origin === 'missing') {
      const result = runOplModuleAction('install', module.module_id).module_action as Record<string, unknown>;
      return { target_type: 'module', target_id: module.module_id, status: moduleStatus(result), reason: 'module_missing', action: 'install', result };
    }
    if (module.install_origin !== 'managed_root' || module.health_status === 'dirty'
      || module.health_status === 'invalid_checkout' || module.git?.dirty
      || ['ahead', 'diverged', 'unknown'].includes(module.git?.sync_status ?? '')) {
      return { target_type: 'module', target_id: module.module_id, status: 'manual_required', reason: 'developer_or_dirty_checkout_visible', action: null, result: null };
    }
    const action = module.recommended_action === 'update' && module.available_actions.includes('update') ? 'update' : 'sync';
    const result = runOplModuleAction(action, module.module_id).module_action as Record<string, unknown>;
    return { target_type: 'module', target_id: module.module_id, status: moduleStatus(result), reason: action === 'update' ? 'capability_packages_refresh' : 'capability_packages_post_apply_sync', action, result };
  });
}

function normalizeError(error: unknown) {
  if (error && typeof error === 'object' && 'toJSON' in error && typeof error.toJSON === 'function') {
    return error.toJSON() as Record<string, unknown>;
  }
  return {
    code: 'managed_update_adapter_failed',
    message: error instanceof Error ? error.message : String(error),
  };
}

async function runRuntimeSubstrateAdapter(
  contracts: FrameworkContracts,
  operation: ManagedUpdateKernelInput['operation'],
): Promise<AdapterExecutionResult> {
  const receiptRef = runtimeAdapterReceiptRef(operation);
  const rollbackRef = runtimeRollbackRef(receiptRef);
  if (operation === MANAGED_UPDATE_OWNER_ACTIONS.revert) {
    const frameworkRollback = runOplFrameworkSelfRollback({
      targetRoot: resolveFrameworkUpdateTargetRoot(resolveProjectRoot()),
    });
    const status = systemActionStatus(frameworkRollback);
    const codexRollback = rollbackCodexRuntimeGeneration();
    return {
      component_id: 'opl_base',
      adapter_id: 'runtime_substrate_adapter',
      status,
      reason: 'startup_maintenance_runtime_substrate_adapter',
      result_ref: receiptRef,
      result: {
        surface_kind: 'runtime_substrate_adapter_result',
        action: operation,
        status,
        receipt_ref: receiptRef,
        rollback_ref: rollbackRef,
        repair_action: status === 'completed'
          ? 'run_startup_maintenance'
          : 'restart_app_with_previous_runtime_pointer_or_run_startup_maintenance',
        framework_rollback: frameworkRollback,
        codex_runtime_rollback: codexRollback,
        manual_required_reason: status === 'manual_required'
          ? frameworkRollback.reason
          : null,
      },
      error: null,
    };
  }

  const result = await runOplStartupMaintenance(contracts, { scope: 'runtime_substrate' });
  const systemAction = result.system_action as Record<string, unknown>;
  const dependencyReconcile = reconcileBaseManagedDependencies(process.env.HOME?.trim() || process.cwd());
  return {
    component_id: 'opl_base',
    adapter_id: 'runtime_substrate_adapter',
    status: systemActionStatus(systemAction),
    reason: 'startup_maintenance_runtime_substrate_adapter',
    result_ref: receiptRef,
    result: {
      surface_kind: 'runtime_substrate_adapter_result',
      action: operation,
      status: systemActionStatus(systemAction),
      receipt_ref: receiptRef,
      rollback_ref: rollbackRef,
      repair_action: 'run_startup_maintenance',
      startup_maintenance: systemAction,
      dependency_reconcile: dependencyReconcile,
    },
    error: null,
  };
}

function buildAgentPackagePostApplyActions(
  operation: ManagedUpdateKernelInput['operation'],
  reconcileResult: Record<string, unknown>,
): ManagedUpdateOwnerPostApplyAction[] {
  if (operation === MANAGED_UPDATE_OWNER_ACTIONS.revert) {
    return [
      {
        action_id: 'rollback_package_channel',
        command_ref: managedUpdateCommand(MANAGED_UPDATE_OWNER_ACTIONS.revert, 'opl_packages'),
        status: nestedRecord(reconcileResult, 'summary') ? 'completed' : 'manual_required',
        result_ref: adapterResultRef('capability_packages', operation, reconcileResult),
        result: reconcileResult,
      },
    ];
  }

  const skillSync = syncFamilySkillPacks({
    companionMode: 'observe',
  }) as unknown as Record<string, unknown>;
  const skillSyncPayload = nestedRecord(skillSync, 'skill_sync');
  const skillSyncSummary = nestedRecord(skillSyncPayload, 'summary');
  const skillSyncPacks = records(skillSyncPayload?.packs);
  const unexpectedSkippedCount = skillSyncPacks
    .filter((entry) => nestedString(entry, 'sync_status') === 'skipped')
    .filter((entry) => !isExpectedTargetBoundScholarSkillsSkip(entry))
    .length;
  const syncedCount = Number(skillSyncSummary?.synced ?? 0);
  const skillSyncStatus: ManagedUpdateOwnerPostApplyAction['status'] = unexpectedSkippedCount > 0 && syncedCount === 0
          ? 'manual_required'
          : 'completed';

  return [
    {
      action_id: 'reconcile_packages',
      command_ref: 'opl packages update --json',
      status: 'completed',
      result_ref: adapterResultRef('capability_packages', operation, reconcileResult),
      result: reconcileResult,
    },
    {
      action_id: 'sync_skills',
      command_ref: 'opl packages status --json',
      status: skillSyncStatus,
      result_ref: adapterResultRef('opl_packages', operation, skillSyncPayload),
      result: skillSyncPayload,
    },
    {
      action_id: 'sync_codex_skill_plugin_projection',
      command_ref: 'opl packages status --json',
      status: skillSyncStatus,
      result_ref: adapterResultRef('opl_packages', operation, skillSyncPayload),
      result: {
        source: 'capability_packages_post_apply',
        scholarskills_source: {
          source: 'capability_packages_target',
          status: 'maintained_by_package_update',
          package_channel_auto_update: true,
        },
        skill_sync_summary: skillSyncSummary,
        target_bound_package_scope_activation: {
          status: skillSyncPacks.some(isExpectedTargetBoundScholarSkillsSkip)
            ? 'automatic_on_workspace_or_quest_activation'
            : 'not_applicable',
          lifecycle_owner: 'opl_packages',
          status_command_ref: 'opl packages status --package-id mas --scope <workspace|quest> --json',
          repair_command_ref: 'opl packages repair mas --scope <workspace|quest> --json',
        },
      },
    },
  ];
}

function agentPackageReloadGuidance(
  operation: ManagedUpdateKernelInput['operation'],
  changedCount: number,
): ManagedUpdateReloadGuidance {
  if (changedCount === 0 || operation === MANAGED_UPDATE_OWNER_ACTIONS.revert) {
    return {
      reload_required: false,
      reload_recommended: false,
      reload_targets: [],
      command_ref: null,
      reason: null,
    };
  }
  return {
    reload_required: false,
    reload_recommended: true,
    reload_targets: ['one_person_lab_app', 'codex_plugin_cache'],
    command_ref: 'Reload One Person Lab App or Codex plugin cache',
    reason: 'Post-apply skill and plugin metadata can be cached until the App/Codex plugin cache reloads.',
  };
}

function buildAgentPackageStatusDetail(input: {
  componentState: string;
  applyMode: ManagedUpdateReceiptApplyMode;
  completedCount: number;
  currentCount?: number;
  changedCount?: number;
  manualCount: number;
  failedCount?: number;
  appBackgroundSafe?: boolean;
  postApplyActions: ManagedUpdateOwnerPostApplyAction[];
  reloadGuidance: ManagedUpdateReloadGuidance;
  status: ManagedUpdateOwnerExecutionStatus;
}): ManagedUpdateReceiptStatusDetail {
  return {
    component_state: input.componentState,
    auto_apply_eligible: input.applyMode === 'auto_apply',
    app_background_safe: input.appBackgroundSafe ?? input.applyMode === 'auto_apply',
    clean_managed_targets_count: input.completedCount,
    current_targets_count: input.currentCount ?? 0,
    changed_targets_count: input.changedCount ?? input.completedCount,
    manual_required_targets_count: input.manualCount,
    failed_targets_count: input.failedCount ?? 0,
    post_apply_status: managedUpdatePostApplyStatus(input.postApplyActions, input.status),
    reload_status: managedUpdateReloadStatus(input.reloadGuidance, input.status),
  };
}

async function runAgentPackageAdapter(operation: ManagedUpdateKernelInput['operation']): Promise<AdapterExecutionResult> {
  if (operation === MANAGED_UPDATE_OWNER_ACTIONS.revert) {
    const modules = buildOplModules().modules.modules.filter((module) => module.default_install);
    const targets: Record<string, unknown>[] = [];
    for (const module of modules) {
      if (module.install_origin !== 'managed_root' || module.health_status !== 'ready') {
        targets.push({
          target_type: 'module',
          target_id: module.module_id,
          status: 'manual_required',
          reason: 'rollback_requires_clean_managed_package_root',
          action: MANAGED_UPDATE_OWNER_ACTIONS.revert,
          result: null,
        });
        continue;
      }
      try {
        const spec = resolveOplDomainModuleSpec(module.module_id);
        const result = rollbackManagedModulePackageChannel(
          spec,
          resolveManagedModuleCheckoutPath(spec),
        ) as unknown as Record<string, unknown>;
        targets.push({
          target_type: 'module',
          target_id: module.module_id,
          status: 'completed',
          reason: 'package_channel_previous_root_restored',
          action: MANAGED_UPDATE_OWNER_ACTIONS.revert,
          result,
        });
      } catch (error) {
        const normalized = normalizeError(error);
        targets.push({
          target_type: 'module',
          target_id: module.module_id,
          status: 'manual_required',
          reason: 'package_channel_rollback_unavailable',
          action: MANAGED_UPDATE_OWNER_ACTIONS.revert,
          result: null,
          error: normalized,
        });
      }
    }
    const manualCount = targets.filter((target) => target.status === 'manual_required').length;
    const completedCount = targets.filter((target) => target.status === 'completed').length;
    const status: AdapterExecutionResult['status'] = completedCount > 0 && manualCount === 0 ? 'completed' : 'manual_required';
    const reloadGuidance = agentPackageReloadGuidance(operation, completedCount);
    const result = {
      surface_kind: 'capability_packages_rollback_result',
      apply_mode: 'manual_required',
      app_background_safe: false,
      reload_guidance: reloadGuidance,
      targets,
      summary: {
        total_targets_count: targets.length,
        completed_targets_count: completedCount,
        manual_required_targets_count: manualCount,
      },
    };
    const postApplyActions = buildAgentPackagePostApplyActions(operation, result);
    return {
      component_id: 'opl_packages',
      adapter_id: 'capability_packages_adapter',
      status,
      reason: completedCount > 0 && manualCount === 0
        ? 'package_channel_previous_roots_restored'
        : 'package_channel_rollback_partially_available_or_missing_previous_roots',
      result_ref: completedCount > 0 ? adapterResultRef('capability_packages', operation, result) : null,
      result,
      error: null,
      apply_mode: 'manual_required',
      status_detail: buildAgentPackageStatusDetail({
        componentState: status === 'completed' ? 'current' : 'skipped_manual_required',
        applyMode: 'manual_required',
        completedCount,
        manualCount,
        postApplyActions,
        reloadGuidance,
        status,
      }),
      reload_guidance: reloadGuidance,
      post_apply_actions: postApplyActions,
    };
  }

  const bulkUpdate = await runOplAgentPackageBulkUpdate();
  const bulkResult = bulkUpdate.opl_agent_package_bulk_update;
  const packageTargets = bulkResult.targets as Record<string, unknown>[];
  const targets: Record<string, unknown>[] = packageTargets.length > 0
    ? [...packageTargets]
    : reconcileLegacyChannelTargets();
  const manualCount = targets.filter((target) => target.status === 'manual_required').length;
  const completedCount = targets.filter((target) => target.status === 'completed').length;
  const validatedCount = targets.filter((target) => target.status === 'validated').length;
  const changedCount = completedCount + validatedCount;
  const currentCount = targets.filter((target) => target.status === 'current').length;
  const failedCount = targets.filter((target) => target.status === 'failed').length;
  const baseStatus: AdapterExecutionResult['status'] = failedCount > 0
    ? changedCount > 0 ? 'partial_failure' : 'failed'
    : manualCount > 0
      ? changedCount > 0 ? 'partial_success' : 'manual_required'
      : changedCount > 0
        ? 'completed'
        : 'skipped';
  const applyMode: ManagedUpdateReceiptApplyMode = changedCount > 0
    ? 'auto_apply'
    : manualCount > 0 || failedCount > 0
      ? 'manual_required'
      : 'projection_only';
  const postApplyActions = changedCount > 0 ? buildAgentPackagePostApplyActions(operation, {
    surface_kind: 'capability_packages_adapter_result',
    targets,
    summary: {
      total_targets_count: targets.length,
      current_targets_count: currentCount,
      completed_targets_count: completedCount,
      changed_targets_count: changedCount,
      manual_required_targets_count: manualCount,
      failed_targets_count: failedCount,
    },
  }) : [];
  const postApplyFailed = postApplyActions.some((entry) => entry.status === 'failed');
  const postApplyManual = postApplyActions.some((entry) => entry.status === 'manual_required');
  const status: AdapterExecutionResult['status'] = postApplyFailed
    ? changedCount > 0 ? 'partial_failure' : 'failed'
    : postApplyManual && baseStatus === 'completed'
      ? 'partial_success'
      : baseStatus;
  const reloadGuidance = agentPackageReloadGuidance(operation, changedCount);
  const componentState = failedCount > 0 || postApplyFailed
    ? 'failed_with_repair'
    : manualCount > 0 || postApplyManual
      ? 'skipped_manual_required'
      : 'current';
  const statusDetail = buildAgentPackageStatusDetail({
    componentState,
    applyMode,
    completedCount,
    currentCount,
    changedCount,
    manualCount,
    failedCount,
    appBackgroundSafe: applyMode === 'auto_apply' && failedCount === 0 && !postApplyFailed,
    postApplyActions,
    reloadGuidance,
    status,
  });
  const result = {
    surface_kind: 'capability_packages_adapter_result',
    apply_mode: applyMode,
    app_background_safe: applyMode === 'auto_apply' && failedCount === 0 && !postApplyFailed,
    auto_apply_scope: packageTargets.length > 0
      ? 'clean_digest_locked_installed_root_packages_only'
      : 'legacy_explicit_channel_roots_only',
    status_detail: statusDetail,
    reload_guidance: reloadGuidance,
    read_model_guidance: {
      status_plane: 'opl packages status --json',
      component_receipt_ledger: managedUpdateComponentReceiptLedgerFilePath(),
      app_consumer: 'App may apply eligible targets when auto_apply.eligible is true and must surface manual or failed targets separately.',
    },
    targets,
    summary: {
      total_targets_count: targets.length,
      current_targets_count: currentCount,
      completed_targets_count: completedCount,
      changed_targets_count: changedCount,
      manual_required_targets_count: manualCount,
      failed_targets_count: failedCount,
      manual_required_reasons: targets
        .filter((target) => target.status === 'manual_required')
        .map((target) => ({ target_id: target.target_id, reason: target.reason })),
    },
  };
  return {
    component_id: 'opl_packages',
    adapter_id: 'capability_packages_adapter',
    status,
    reason: status === 'skipped'
      ? 'package_targets_current_noop'
      : status === 'partial_success'
        ? 'eligible_package_targets_updated_manual_targets_remain'
        : status === 'partial_failure'
          ? 'eligible_package_targets_partially_updated_failures_remain'
          : status === 'manual_required'
            ? 'manual_review_required'
            : status === 'failed'
              ? 'package_update_failed_with_repair'
              : 'managed_modules_reconciled_and_codex_surface_synced',
    result_ref: changedCount > 0 || failedCount > 0 || manualCount > 0
      ? adapterResultRef('capability_packages', operation, result)
      : null,
    result,
    error: null,
    apply_mode: applyMode,
    status_detail: statusDetail,
    reload_guidance: reloadGuidance,
    post_apply_actions: postApplyActions,
    write_receipt: changedCount > 0 || failedCount > 0 || manualCount > 0,
  };
}

async function runAdapter(
  contracts: FrameworkContracts,
  operation: ManagedUpdateKernelInput['operation'],
  componentId: string,
): Promise<AdapterExecutionResult> {
  try {
    if (componentId === 'opl_base') {
      return await runRuntimeSubstrateAdapter(contracts, operation);
    }
    if (componentId === 'opl_packages') {
      return await runAgentPackageAdapter(operation);
    }
    return {
      component_id: componentId,
      adapter_id: 'installation_carrier_status_adapter',
      status: 'manual_required',
      reason: 'unknown_managed_update_component',
      result_ref: null,
      result: {
        requested_component_id: componentId,
      },
      error: null,
    };
  } catch (error) {
    const adapterId: ManagedUpdateProviderAdapterId =
      componentId === 'opl_base'
        ? 'runtime_substrate_adapter'
        : componentId === 'opl_packages'
          ? 'capability_packages_adapter'
          : 'installation_carrier_status_adapter';
    return {
      component_id: componentId,
      adapter_id: adapterId,
      status: 'failed',
      reason: 'adapter_execution_failed',
      result_ref: null,
      result: null,
      error: normalizeError(error),
    };
  }
}

function executionStatus(results: AdapterExecutionResult[]) {
  if (results.some((entry) => entry.status === 'failed' || entry.status === 'partial_failure')) {
    if (results.some((entry) => entry.status === 'partial_failure')) {
      return 'partial_failure';
    }
    return 'failed_with_repair';
  }
  if (results.some((entry) => entry.status === 'partial_success')) {
    return 'partial_success';
  }
  if (results.some((entry) => entry.status === 'manual_required')) {
    return 'manual_required';
  }
  if (results.some((entry) => entry.status === 'completed')) {
    return 'completed';
  }
  return 'skipped';
}

function applyExecutionToProjection(
  projection: ManagedUpdateProjection,
  results: AdapterExecutionResult[],
  receiptRecord: ReturnType<typeof recordManagedUpdateComponentReceipts>,
  lock: {
    lock_id: string;
    lock_file: string;
    acquired_at: string;
  },
) {
  const receiptsByComponent = new Map(
    receiptRecord.receipts.map((receipt) => [receipt.component_id, receipt]),
  );
  const components = projection.managed_update.components.map((component) => {
    const receipt = receiptsByComponent.get(component.component_id);
    if (!receipt) {
      return component;
    }
    return {
      ...component,
      receipt: {
        ...component.receipt,
        last_receipt_ref: receipt.receipt_ref,
        verify_result: receipt.verify_result,
        activated_at: receipt.activated_at,
        rollback_ref: receipt.rollback_ref,
        repair_action: receipt.repair_action,
        apply_mode: receipt.apply_mode,
        status_detail: receipt.status_detail,
        post_apply_action_statuses: receipt.post_apply_action_statuses,
        reload_guidance: receipt.reload_guidance,
      },
      status_detail: receipt.status_detail,
      auto_apply: {
        ...component.auto_apply,
        eligible: receipt.status_detail.auto_apply_eligible ?? component.auto_apply.eligible,
        app_background_safe: receipt.status_detail.app_background_safe ?? component.auto_apply.app_background_safe,
      },
      post_apply_guidance: {
        ...component.post_apply_guidance,
        reload_guidance: receipt.reload_guidance,
      },
    };
  });

  return {
    ...projection,
    managed_update: {
      ...projection.managed_update,
      operation_mode: `controlled_${projection.managed_update.operation}` as const,
      idempotency_lock: {
        ...projection.managed_update.idempotency_lock,
        status: 'released',
        lock_file: lock.lock_file,
        acquired_at: lock.acquired_at,
        released_at: new Date().toISOString(),
      },
      summary: {
        ...projection.managed_update.summary,
        execution_status: executionStatus(results),
      },
      components,
      receipts: {
        ...projection.managed_update.receipts,
        write_policy: 'recorded_component_receipt',
        component_receipt_ledger_file: managedUpdateComponentReceiptLedgerFilePath(),
      },
      execution: {
        surface_kind: 'opl_managed_update_execution',
        status: executionStatus(results),
        adapter_results: results,
        receipt_record: receiptRecord,
      },
      authority_boundary: {
        ...projection.managed_update.authority_boundary,
        can_mutate_app_owned_runtime_root: results.some((entry) => entry.component_id === 'opl_base'),
        can_silently_update_clean_managed_modules: results.some((entry) => entry.component_id === 'opl_packages'),
        can_sync_codex_plugin_skill_projection: results.some((entry) =>
          entry.component_id === 'opl_packages'
        ),
      },
    },
  };
}

export async function runManagedUpdateKernelOperation(
  contracts: FrameworkContracts,
  input: ManagedUpdateKernelInput,
) {
  const initialProjection = await buildManagedUpdateKernelProjection(contracts, input);
  const lock = acquireManagedUpdateLock({
    operation: input.operation,
    componentId: input.componentId,
    receiptId: input.receiptId,
  });
  try {
    const componentIds = selectedManagedUpdateComponentIds(input, initialProjection.managed_update.components);
    const results: AdapterExecutionResult[] = [];
    const componentsById = new Map(
      initialProjection.managed_update.components.map((component) => [component.component_id, component]),
    );
    for (const componentId of componentIds) {
      const component = componentsById.get(componentId);
      const result = await runAdapter(contracts, input.operation, componentId);
      results.push(component ? bindOwnerExecutionResult(component, result) : result);
    }
    const receipts = results
      .filter((result) => result.write_receipt !== false)
      .map((result) => {
        const component = componentsById.get(result.component_id);
        return component ? managedUpdateComponentReceiptInput({
          operation: input.operation,
          component,
          result,
        }) : null;
      })
      .filter((receipt): receipt is ManagedUpdateComponentReceiptInput => Boolean(receipt));
    const receiptRecord = recordManagedUpdateComponentReceipts(receipts);
    lock.release();
    const refreshedProjection = await buildManagedUpdateKernelProjection(contracts, {
      ...input,
      refreshReleaseCatalog: false,
    });
    const selectedIds = new Set(componentIds);
    const selectedComponents = refreshedProjection.managed_update.components.filter((component) =>
      selectedIds.has(component.component_id)
      || (input.componentId ? managedUpdateComponentMatches(component, input.componentId) : false)
    );
    return applyExecutionToProjection(
      {
        ...refreshedProjection,
        managed_update: {
          ...refreshedProjection.managed_update,
          components: selectedComponents,
          summary: {
            total_components_count: selectedComponents.length,
            current_components_count: selectedComponents.filter((entry) => entry.state === 'current').length,
            update_available_components_count: selectedComponents.filter((entry) => entry.state === 'update_available').length,
            staged_components_count: selectedComponents.filter((entry) => entry.state === 'staged').length,
            restart_required_components_count: selectedComponents.filter((entry) => entry.state === 'needs_restart').length,
            reload_required_components_count: selectedComponents.filter((entry) => entry.state === 'needs_reload').length,
            failed_with_repair_components_count: selectedComponents.filter((entry) => entry.state === 'failed_with_repair').length,
            skipped_manual_required_components_count: selectedComponents.filter((entry) => entry.state === 'skipped_manual_required').length,
          },
        },
      },
      results,
      receiptRecord,
      lock,
    );
  } catch (error) {
    lock.release();
    throw error;
  }
}

export function managedUpdateKernelLockProjection() {
  return {
    stale_after_seconds: MANAGED_UPDATE_LOCK_STALE_AFTER_SECONDS,
  };
}
