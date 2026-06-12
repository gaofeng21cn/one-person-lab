import { syncFamilySkillPacks } from './opl-skills.ts';
import {
  buildOplModules,
  resolveManagedModuleCheckoutPath,
  resolveOplDomainModuleSpec,
  runOplModuleAction,
} from './system-installation/modules.ts';
import { rollbackManagedModulePackageChannel } from './system-installation/module-package-channel.ts';
import { runOplSystemAction } from './system-installation/system-actions.ts';
import { runOplStartupMaintenance } from './system-installation/startup-maintenance.ts';
import type { FrameworkContracts } from './types.ts';
import {
  buildManagedUpdateKernelProjection,
  type ManagedUpdateKernelInput,
  type ManagedUpdateOperation,
  type ManagedUpdateProviderAdapterId,
} from './managed-update-kernel.ts';
import {
  acquireManagedUpdateLock,
  MANAGED_UPDATE_LOCK_STALE_AFTER_SECONDS,
} from './managed-update-lock.ts';
import {
  managedUpdateComponentReceiptLedgerFilePath,
  recordManagedUpdateComponentReceipts,
  type ManagedUpdateComponentReceiptInput,
  type ManagedUpdatePostApplyActionReceipt,
  type ManagedUpdateReceiptApplyMode,
  type ManagedUpdateReceiptStatusDetail,
  type ManagedUpdateReloadGuidance,
} from './managed-update-component-receipts.ts';

type ManagedUpdateProjection = Awaited<ReturnType<typeof buildManagedUpdateKernelProjection>>;
type ManagedUpdateProjectionComponent = ManagedUpdateProjection['managed_update']['components'][number];

type AdapterPostApplyAction = {
  action_id: string;
  command_ref: string;
  status: 'completed' | 'skipped' | 'manual_required' | 'failed';
  result_ref: string | null;
  result: Record<string, unknown> | null;
};

type AdapterExecutionResult = {
  component_id: string;
  adapter_id: ManagedUpdateProviderAdapterId;
  status: 'completed' | 'skipped' | 'manual_required' | 'failed';
  reason: string;
  result_ref: string | null;
  result: Record<string, unknown> | null;
  error: Record<string, unknown> | null;
  apply_mode?: ManagedUpdateReceiptApplyMode;
  status_detail?: ManagedUpdateReceiptStatusDetail;
  reload_guidance?: ManagedUpdateReloadGuidance;
  post_apply_actions?: AdapterPostApplyAction[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

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

function adapterResultRef(componentId: string, operation: ManagedUpdateOperation, payload: Record<string, unknown> | null) {
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

function runtimeAdapterReceiptRef(operation: ManagedUpdateOperation) {
  return adapterResultRef('runtime_toolchain', operation, null);
}

function runtimeRollbackRef(receiptRef: string) {
  return `opl://managed-update/runtime_toolchain/rollback/${encodeURIComponent(receiptRef)}`;
}

function systemActionStatus(value: unknown): AdapterExecutionResult['status'] {
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

function normalizeError(error: unknown) {
  if (error && typeof error === 'object' && 'toJSON' in error && typeof error.toJSON === 'function') {
    return error.toJSON() as Record<string, unknown>;
  }
  return {
    code: 'managed_update_adapter_failed',
    message: error instanceof Error ? error.message : String(error),
  };
}

function componentMatches(component: ManagedUpdateProjectionComponent, componentId: string) {
  return component.component_id === componentId || component.provider_id === componentId;
}

function selectedComponentIds(input: ManagedUpdateKernelInput, projection: ManagedUpdateProjection) {
  const ids = projection.managed_update.components.map((component) => component.component_id);
  return input.componentId ? ids : ids.filter((id) => id !== 'app_binary');
}

async function runRuntimeToolchainAdapter(
  contracts: FrameworkContracts,
  operation: ManagedUpdateOperation,
): Promise<AdapterExecutionResult> {
  const receiptRef = runtimeAdapterReceiptRef(operation);
  const rollbackRef = runtimeRollbackRef(receiptRef);
  if (operation === 'rollback') {
    return {
      component_id: 'runtime_toolchain',
      adapter_id: 'runtime_toolchain_adapter',
      status: 'manual_required',
      reason: 'startup_maintenance_runtime_toolchain_adapter',
      result_ref: receiptRef,
      result: {
        surface_kind: 'runtime_toolchain_adapter_result',
        action: operation,
        status: 'manual_required',
        receipt_ref: receiptRef,
        rollback_ref: rollbackRef,
        repair_action: 'restart_app_with_previous_runtime_pointer_or_run_startup_maintenance',
        manual_required_reason: 'runtime_pointer_rollback_requires_app_runtime_pointer_support',
      },
      error: null,
    };
  }

  const result = await runOplStartupMaintenance(contracts, { scope: 'runtime_toolchain' });
  const systemAction = result.system_action as Record<string, unknown>;
  return {
    component_id: 'runtime_toolchain',
    adapter_id: 'runtime_toolchain_adapter',
    status: systemActionStatus(systemAction),
    reason: 'startup_maintenance_runtime_toolchain_adapter',
    result_ref: receiptRef,
    result: {
      surface_kind: 'runtime_toolchain_adapter_result',
      action: operation,
      status: systemActionStatus(systemAction),
      receipt_ref: receiptRef,
      rollback_ref: rollbackRef,
      repair_action: 'run_startup_maintenance',
      startup_maintenance: systemAction,
    },
    error: null,
  };
}

function moduleStatus(result: unknown) {
  return isRecord(result) && result.status === 'completed' ? 'completed' : 'manual_required';
}

function buildAgentPackagePostApplyActions(
  operation: ManagedUpdateOperation,
  reconcileResult: Record<string, unknown>,
): AdapterPostApplyAction[] {
  if (operation === 'rollback') {
    return [
      {
        action_id: 'rollback_package_channel',
        command_ref: 'opl update rollback --component agent_package_channel --json',
        status: nestedRecord(reconcileResult, 'summary') ? 'completed' : 'manual_required',
        result_ref: adapterResultRef('agent_package_channel', operation, reconcileResult),
        result: reconcileResult,
      },
    ];
  }

  const skillSync = syncFamilySkillPacks({
    companionMode: 'observe',
    superpowersProfile: 'keep',
  }) as unknown as Record<string, unknown>;
  const skillSyncPayload = nestedRecord(skillSync, 'skill_sync');
  const skillSyncSummary = nestedRecord(skillSyncPayload, 'summary');
  const skippedCount = Number(skillSyncSummary?.skipped ?? 0);
  const syncedCount = Number(skillSyncSummary?.synced ?? 0);
  const skillSyncStatus: AdapterPostApplyAction['status'] = skippedCount > 0 && syncedCount === 0
    ? 'manual_required'
    : 'completed';

  return [
    {
      action_id: 'reconcile_modules',
      command_ref: 'opl connect reconcile-modules --json',
      status: 'completed',
      result_ref: adapterResultRef('agent_package_channel', operation, reconcileResult),
      result: reconcileResult,
    },
    {
      action_id: 'sync_skills',
      command_ref: 'opl connect sync-skills --json',
      status: skillSyncStatus,
      result_ref: adapterResultRef('capability_exposure', operation, skillSyncPayload),
      result: skillSyncPayload,
    },
    {
      action_id: 'capability_exposure',
      command_ref: 'opl update status --component capability_exposure --json',
      status: skillSyncStatus,
      result_ref: adapterResultRef('capability_exposure', operation, skillSyncPayload),
      result: {
        source: 'agent_package_channel_post_apply',
        skill_sync_summary: skillSyncSummary,
      },
    },
  ];
}

function agentPackageReloadGuidance(operation: ManagedUpdateOperation, status: AdapterExecutionResult['status']): ManagedUpdateReloadGuidance {
  if (status !== 'completed' || operation === 'rollback') {
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

function postApplyActionReceipt(action: AdapterPostApplyAction): ManagedUpdatePostApplyActionReceipt {
  return {
    action_id: action.action_id,
    status: action.status,
    result_ref: action.result_ref,
  };
}

function postApplyStatus(actions: AdapterPostApplyAction[], fallbackStatus: AdapterExecutionResult['status']): ManagedUpdateReceiptStatusDetail['post_apply_status'] {
  if (fallbackStatus === 'failed') {
    return 'failed';
  }
  if (fallbackStatus === 'manual_required') {
    return 'manual_required';
  }
  if (actions.length === 0) {
    return fallbackStatus === 'skipped' ? 'skipped' : 'not_run';
  }
  if (actions.some((entry) => entry.status === 'failed')) {
    return 'failed';
  }
  if (actions.some((entry) => entry.status === 'manual_required')) {
    return 'manual_required';
  }
  return 'completed';
}

function reloadStatus(guidance: ManagedUpdateReloadGuidance, fallbackStatus: AdapterExecutionResult['status']): ManagedUpdateReceiptStatusDetail['reload_status'] {
  if (fallbackStatus === 'manual_required') {
    return 'manual_required';
  }
  if (guidance.reload_required) {
    return 'required';
  }
  if (guidance.reload_recommended) {
    return 'recommended';
  }
  return 'not_required';
}

function buildAgentPackageStatusDetail(input: {
  componentState: string;
  applyMode: ManagedUpdateReceiptApplyMode;
  completedCount: number;
  manualCount: number;
  postApplyActions: AdapterPostApplyAction[];
  reloadGuidance: ManagedUpdateReloadGuidance;
  status: AdapterExecutionResult['status'];
}): ManagedUpdateReceiptStatusDetail {
  return {
    component_state: input.componentState,
    auto_apply_eligible: input.applyMode === 'auto_apply',
    app_background_safe: input.applyMode === 'auto_apply',
    clean_managed_targets_count: input.completedCount,
    manual_required_targets_count: input.manualCount,
    post_apply_status: postApplyStatus(input.postApplyActions, input.status),
    reload_status: reloadStatus(input.reloadGuidance, input.status),
  };
}

function runAgentPackageAdapter(operation: ManagedUpdateOperation): AdapterExecutionResult {
  if (operation === 'rollback') {
    const modules = buildOplModules().modules.modules.filter((module) => module.default_install);
    const targets: Record<string, unknown>[] = [];
    for (const module of modules) {
      if (module.install_origin !== 'managed_root' || module.health_status !== 'ready') {
        targets.push({
          target_type: 'module',
          target_id: module.module_id,
          status: 'manual_required',
          reason: 'rollback_requires_clean_managed_package_root',
          action: 'rollback',
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
          action: 'rollback',
          result,
        });
      } catch (error) {
        const normalized = normalizeError(error);
        targets.push({
          target_type: 'module',
          target_id: module.module_id,
          status: 'manual_required',
          reason: 'package_channel_rollback_unavailable',
          action: 'rollback',
          result: null,
          error: normalized,
        });
      }
    }
    const manualCount = targets.filter((target) => target.status === 'manual_required').length;
    const completedCount = targets.filter((target) => target.status === 'completed').length;
    const status: AdapterExecutionResult['status'] = completedCount > 0 && manualCount === 0 ? 'completed' : 'manual_required';
    const reloadGuidance = agentPackageReloadGuidance(operation, status);
    const result = {
      surface_kind: 'agent_package_channel_rollback_result',
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
      component_id: 'agent_package_channel',
      adapter_id: 'agent_package_channel_adapter',
      status,
      reason: completedCount > 0 && manualCount === 0
        ? 'package_channel_previous_roots_restored'
        : 'package_channel_rollback_partially_available_or_missing_previous_roots',
      result_ref: completedCount > 0 ? adapterResultRef('agent_package_channel', operation, result) : null,
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

  const modules = buildOplModules().modules.modules.filter((module) => module.default_install);
  const targets: Record<string, unknown>[] = [];
  for (const module of modules) {
    if (!module.installed || module.install_origin === 'missing') {
      const result = runOplModuleAction('install', module.module_id).module_action as Record<string, unknown>;
      targets.push({
        target_type: 'module',
        target_id: module.module_id,
        status: moduleStatus(result),
        reason: 'module_missing',
        action: 'install',
        result,
      });
      continue;
    }
    if (
      module.install_origin !== 'managed_root'
      || module.health_status === 'dirty'
      || module.health_status === 'invalid_checkout'
      || module.git?.dirty
      || module.git?.sync_status === 'ahead'
      || module.git?.sync_status === 'diverged'
      || module.git?.sync_status === 'unknown'
    ) {
      targets.push({
        target_type: 'module',
        target_id: module.module_id,
        status: 'manual_required',
        reason: 'developer_or_dirty_checkout_visible',
        action: null,
        result: null,
      });
      continue;
    }

    const action = module.recommended_action === 'update' && module.available_actions.includes('update')
      ? 'update'
      : 'sync';
    const result = runOplModuleAction(action, module.module_id).module_action as Record<string, unknown>;
    targets.push({
      target_type: 'module',
      target_id: module.module_id,
      status: moduleStatus(result),
      reason: action === 'update' ? 'agent_package_channel_refresh' : 'agent_package_channel_post_apply_sync',
      action,
      result,
    });
  }

  const manualCount = targets.filter((target) => target.status === 'manual_required').length;
  const completedCount = targets.filter((target) => target.status === 'completed').length;
  const status: AdapterExecutionResult['status'] = manualCount > 0 ? 'manual_required' : 'completed';
  const applyMode: ManagedUpdateReceiptApplyMode = manualCount > 0 ? 'manual_required' : 'auto_apply';
  const postApplyActions = manualCount > 0 ? [] : buildAgentPackagePostApplyActions(operation, {
    surface_kind: 'agent_package_channel_adapter_result',
    targets,
    summary: {
      total_targets_count: targets.length,
      completed_targets_count: completedCount,
      manual_required_targets_count: manualCount,
    },
  });
  const reloadGuidance = agentPackageReloadGuidance(operation, status);
  const statusDetail = buildAgentPackageStatusDetail({
    componentState: status === 'completed' ? 'current' : 'skipped_manual_required',
    applyMode,
    completedCount,
    manualCount,
    postApplyActions,
    reloadGuidance,
    status,
  });
  const result = {
    surface_kind: 'agent_package_channel_adapter_result',
    apply_mode: applyMode,
    app_background_safe: applyMode === 'auto_apply',
    auto_apply_scope: 'clean_opl_managed_module_roots_only',
    status_detail: statusDetail,
    reload_guidance: reloadGuidance,
    read_model_guidance: {
      status_plane: 'opl update status --component agent_package_channel --json',
      component_receipt_ledger: managedUpdateComponentReceiptLedgerFilePath(),
      app_consumer: 'App may call this apply path only when auto_apply.eligible is true and manual_required_targets_count is 0.',
    },
    targets,
    summary: {
      total_targets_count: targets.length,
      completed_targets_count: completedCount,
      manual_required_targets_count: manualCount,
    },
  };
  return {
    component_id: 'agent_package_channel',
    adapter_id: 'agent_package_channel_adapter',
    status,
    reason: manualCount > 0 ? 'manual_review_required' : 'managed_modules_reconciled_and_capability_exposure_synced',
    result_ref: adapterResultRef('agent_package_channel', operation, result),
    result,
    error: null,
    apply_mode: applyMode,
    status_detail: statusDetail,
    reload_guidance: reloadGuidance,
    post_apply_actions: postApplyActions,
  };
}

async function runCapabilityExposureAdapter(
  contracts: FrameworkContracts,
  operation: ManagedUpdateOperation,
): Promise<AdapterExecutionResult> {
  if (operation === 'rollback') {
    return {
      component_id: 'capability_exposure',
      adapter_id: 'codex_exposure_status_adapter',
      status: 'skipped',
      reason: 'capability_exposure_is_derived_projection',
      result_ref: null,
      result: null,
      error: null,
    };
  }

  const result = await runOplSystemAction(contracts, 'reconcile_modules');
  return {
    component_id: 'capability_exposure',
    adapter_id: 'codex_exposure_status_adapter',
    status: result.system_action.status === 'completed' ? 'completed' : 'manual_required',
    reason: 'reconcile_modules_refreshes_codex_capability_exposure',
    result_ref: adapterResultRef('capability_exposure', operation, result.system_action as Record<string, unknown>),
    result: result.system_action as Record<string, unknown>,
    error: null,
  };
}

function runAppBinaryAdapter(operation: ManagedUpdateOperation): AdapterExecutionResult {
  return {
    component_id: 'app_binary',
    adapter_id: 'electron_standard_updater',
    status: 'manual_required',
    reason: operation === 'rollback'
      ? 'desktop_app_rollback_is_app_standard_updater_owned'
      : 'desktop_app_update_is_app_standard_updater_owned',
    result_ref: null,
    result: {
      repair_action: 'use_one_person_lab_app_standard_updater_or_release_assets',
    },
    error: null,
  };
}

async function runAdapter(
  contracts: FrameworkContracts,
  operation: ManagedUpdateOperation,
  componentId: string,
): Promise<AdapterExecutionResult> {
  try {
    if (componentId === 'runtime_toolchain') {
      return await runRuntimeToolchainAdapter(contracts, operation);
    }
    if (componentId === 'agent_package_channel') {
      return runAgentPackageAdapter(operation);
    }
    if (componentId === 'capability_exposure') {
      return await runCapabilityExposureAdapter(contracts, operation);
    }
    return runAppBinaryAdapter(operation);
  } catch (error) {
    const adapterId: ManagedUpdateProviderAdapterId =
      componentId === 'runtime_toolchain'
        ? 'runtime_toolchain_adapter'
        : componentId === 'agent_package_channel'
          ? 'agent_package_channel_adapter'
          : componentId === 'capability_exposure'
            ? 'codex_exposure_status_adapter'
            : 'electron_standard_updater';
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

function receiptInput(
  operation: ManagedUpdateOperation,
  component: ManagedUpdateProjectionComponent,
  result: AdapterExecutionResult,
): ManagedUpdateComponentReceiptInput {
  const postApplyActions = result.post_apply_actions ?? [];
  const reloadGuidance = result.reload_guidance ?? component.receipt.reload_guidance;
  const statusDetail = result.status_detail ?? {
    ...component.receipt.status_detail,
    post_apply_status: postApplyStatus(postApplyActions, result.status),
    reload_status: reloadStatus(reloadGuidance, result.status),
  };
  return {
    operation,
    component_id: component.component_id,
    provider_id: component.provider_id,
    adapter_id: component.adapter_id,
    source_manifest_ref: component.receipt.source_manifest_ref,
    from_version: component.receipt.from_version,
    from_digest: component.receipt.from_digest,
    to_version: component.receipt.to_version,
    to_digest: component.receipt.to_digest,
    verify_result: result.status === 'failed' ? 'failed' : result.status === 'manual_required' ? 'unknown' : 'passed',
    post_apply_hooks: component.post_apply_hooks,
    rollback_ref: result.status === 'completed'
      ? `opl://managed-update/${component.component_id}/rollback/${encodeURIComponent(result.result_ref ?? 'previous')}`
      : component.receipt.rollback_ref,
    repair_action: result.status === 'failed' || result.status === 'manual_required'
      ? component.receipt.repair_action ?? component.plan.command_refs[0]?.action_id ?? null
      : component.receipt.repair_action,
    adapter_result_ref: result.result_ref,
    apply_mode: result.apply_mode ?? component.receipt.apply_mode,
    status_detail: statusDetail,
    post_apply_action_statuses: postApplyActions.map(postApplyActionReceipt),
    reload_guidance: reloadGuidance,
  };
}

function executionStatus(results: AdapterExecutionResult[]) {
  if (results.some((entry) => entry.status === 'failed')) {
    return 'failed_with_repair';
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
        can_mutate_app_owned_runtime_root: results.some((entry) => entry.component_id === 'runtime_toolchain'),
        can_silently_update_clean_managed_modules: results.some((entry) => entry.component_id === 'agent_package_channel'),
        can_sync_codex_plugin_skill_projection: results.some((entry) =>
          entry.component_id === 'agent_package_channel' || entry.component_id === 'capability_exposure'
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
    const componentIds = selectedComponentIds(input, initialProjection);
    const results: AdapterExecutionResult[] = [];
    for (const componentId of componentIds) {
      results.push(await runAdapter(contracts, input.operation, componentId));
    }
    const componentsById = new Map(
      initialProjection.managed_update.components.map((component) => [component.component_id, component]),
    );
    const receipts = results
      .map((result) => {
        const component = componentsById.get(result.component_id);
        return component ? receiptInput(input.operation, component, result) : null;
      })
      .filter((receipt): receipt is ManagedUpdateComponentReceiptInput => Boolean(receipt));
    const receiptRecord = recordManagedUpdateComponentReceipts(receipts);
    lock.release();
    const refreshedProjection = await buildManagedUpdateKernelProjection(contracts, input);
    const selectedIds = new Set(componentIds);
    const selectedComponents = refreshedProjection.managed_update.components.filter((component) =>
      selectedIds.has(component.component_id)
      || (input.componentId ? componentMatches(component, input.componentId) : false)
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
