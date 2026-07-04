import { FrameworkContractError, isRecord } from '../../../kernel/contract-validation.ts';
import { parseJsonText } from '../../../kernel/json-file.ts';
import { runRuntimeOperatorActionExecute } from '../../runway/index.ts';
import {
  runOplAgentPackageExposureAction,
  runOplAgentPackageInstall,
  runOplAgentPackageRegistryRefresh,
  runOplAgentPackageRepair,
  runOplAgentPackageRollback,
  runOplAgentPackageUninstall,
  runOplAgentPackageUpdate,
  runOplModuleAction,
} from '../../connect/index.ts';
import { runOplSystemAction } from '../../connect/index.ts';
import { writeOplWorkspaceRootSurface } from '../../connect/index.ts';
import { runFamilyRuntime } from '../../runway/index.ts';
import { runOplEngineAction } from '../../connect/index.ts';
import { type OplEngineAction, type OplModuleAction, type OplModuleId } from '../../connect/index.ts';
import { MANAGED_UPDATE_OWNER_ACTIONS, managedUpdateCommand } from '../../connect/index.ts';
import { executeWorkspaceAppAction } from '../app-state-workspace-actions.ts';
import { syncFamilySkillPacks } from '../../connect/index.ts';
import type { FrameworkContracts } from '../../../kernel/types.ts';
import { settingsControlCenterActionById } from '../app-state-settings-control-center.ts';
import { buildOplDockerWebuiDoctor } from '../../connect/index.ts';
import { runOplTurnkeyInstall } from '../../connect/index.ts';
import { buildRuntimeTraySnapshot } from '../runtime-tray-snapshot.ts';
import {
  dockerWebuiSeedEnv,
  modulePayload,
  parseCodexAction,
  parseModuleAction,
  releaseChannelPayload,
  schedulerTickArgs,
  scholarskillsQuestRootPayload,
  scholarskillsWorkspaceRootPayload,
  settingsReloadCodexSurfacePayload,
  stringPayloadField,
  workspaceRootPayload,
} from './action-execute-payloads.ts';

type JsonRecord = Record<string, unknown>;

export type AppActionExecuteOptions = {
  actionId: string;
  payload: JsonRecord;
  dryRun: boolean;
};

function parseJsonObject(value: string, context: string): JsonRecord {
  const parsed = parseJsonText(value);
  if (!isRecord(parsed)) {
    throw new FrameworkContractError('cli_usage_error', `${context} must be a JSON object.`, {
      context,
    });
  }
  return parsed;
}

export function parseAppActionExecuteArgs(args: string[]): AppActionExecuteOptions {
  let actionId = '';
  let payload: JsonRecord = {};
  let payloadSet = false;
  let dryRun = false;

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    const value = args[index + 1];

    if (token === '--action' && value) {
      actionId = value;
      index += 1;
      continue;
    }

    if (token === '--payload' && value) {
      if (payloadSet) {
        throw new FrameworkContractError('cli_usage_error', 'Use --payload only once.', {
          option: '--payload',
        });
      }
      payload = parseJsonObject(value, '--payload');
      payloadSet = true;
      index += 1;
      continue;
    }

    if (token === '--dry-run') {
      dryRun = true;
      continue;
    }

    throw new FrameworkContractError('cli_usage_error', `Unknown app action execute option: ${token}.`, {
      option: token,
      usage: 'opl app action execute --action <action_id> [--payload <json>] [--dry-run]',
    });
  }

  if (!actionId) {
    throw new FrameworkContractError('cli_usage_error', 'app action execute requires --action.', {
      required: ['--action'],
    });
  }

  return { actionId, payload, dryRun };
}

function buildDryRunUnresolvedAction(options: AppActionExecuteOptions) {
  return {
    runtime_operator_action_execution: {
      surface_kind: 'opl_runtime_operator_action_execution',
      action_id: options.actionId,
      dry_run: true,
      route: null,
      execution: {
        execution_status: 'dry_run_unresolved',
        execution_kind: 'unresolved_action_route',
        route_ref: null,
        action_kind: null,
        executed_runtime_command: null,
        result: null,
      },
      authority_boundary: {
        opl: 'app_action_execute_preflight',
        can_write_domain_truth: false,
        can_read_memory_body: false,
        can_read_artifact_body: false,
        can_authorize_quality_verdict: false,
        can_authorize_export_verdict: false,
        provider_completion_is_domain_ready: false,
      },
      non_goals: [
        'does_not_write_domain_truth',
        'does_not_read_or_store_memory_body',
        'does_not_read_or_mutate_artifact_body',
        'does_not_authorize_quality_readiness_or_export_verdict',
      ],
    },
  };
}

function dryRunEngineAction(action: OplEngineAction) {
  return {
    engine_action: {
      engine_id: 'codex',
      action,
      status: 'dry_run',
    },
  };
}

function dryRunModuleAction(action: OplModuleAction, moduleId: OplModuleId) {
  return {
    module_action: {
      module_id: moduleId,
      action,
      status: 'dry_run',
    },
  };
}

function buildTaskActionReceiptPreview(payload: JsonRecord) {
  const taskId = stringPayloadField(payload, 'task_id')
    ?? stringPayloadField(payload, 'taskId')
    ?? 'unbound_task';
  const actionRef = stringPayloadField(payload, 'action_ref')
    ?? stringPayloadField(payload, 'actionRef')
    ?? null;
  return {
    task_action_receipt_preview: {
      surface_kind: 'opl_app_task_action_receipt_preview.v1',
      action_id: 'task_action_receipt_preview',
      status: 'dry_run_refs_only',
      task_id: taskId,
      action_ref: actionRef,
      receipt_ref: `opl://app-action-previews/${encodeURIComponent(taskId)}/receipt`,
      plan: {
        summary: 'Preview task action receipt refs for App confirmation.',
        required_mode: 'dry_run',
        owner_route: 'domain_owner_route_required_for_execute',
      },
      write_targets: [],
      risk: {
        danger_level: 'medium',
        mutation_policy: 'no_writes_preview_only',
      },
      expected_output: {
        receipt_ref: `opl://app-action-previews/${encodeURIComponent(taskId)}/receipt`,
        content_policy: 'refs_only_no_action_receipt_body',
      },
      command_preview: [
        'opl',
        'app',
        'action',
        'execute',
        '--action',
        'task_action_receipt_preview',
        '--payload',
        '<json>',
        '--dry-run',
      ],
      authority_boundary: {
        can_write_domain_truth: false,
        can_mutate_artifact_body: false,
        can_read_artifact_body: false,
        can_create_owner_receipt: false,
        can_sign_domain_receipt: false,
        can_authorize_quality_verdict: false,
        can_authorize_export_verdict: false,
        execution_requires_domain_owner_route: true,
        temporal_is_diagnostics_only: true,
      },
    },
  };
}

function buildTaskExportBundlePreview(payload: JsonRecord) {
  const taskId = stringPayloadField(payload, 'task_id')
    ?? stringPayloadField(payload, 'taskId')
    ?? 'unbound_task';
  const exportBundleRef = stringPayloadField(payload, 'export_bundle_ref')
    ?? stringPayloadField(payload, 'exportBundleRef')
    ?? `opl://domains/unbound/tasks/${encodeURIComponent(taskId)}/export-bundles/latest`;
  return {
    task_export_bundle_preview: {
      surface_kind: 'opl_app_task_export_bundle_preview.v1',
      action_id: 'task_export_bundle_preview',
      status: 'dry_run_refs_only',
      task_id: taskId,
      export_bundle_ref: exportBundleRef,
      receipt_ref: `opl://app-action-previews/${encodeURIComponent(taskId)}/export-bundle-receipt`,
      plan: {
        summary: 'Preview reproducibility export bundle receipt refs for App confirmation.',
        required_mode: 'dry_run',
        owner_route: 'domain_owner_export_bundle_action_required_for_execute',
      },
      write_targets: [],
      risk: {
        danger_level: 'medium',
        mutation_policy: 'no_writes_preview_only',
      },
      expected_output: {
        export_bundle_ref: exportBundleRef,
        receipt_ref: `opl://app-action-previews/${encodeURIComponent(taskId)}/export-bundle-receipt`,
        content_policy: 'refs_only_no_export_bundle_body',
      },
      command_preview: [
        'opl',
        'app',
        'action',
        'execute',
        '--action',
        'task_export_bundle_preview',
        '--payload',
        '<json>',
        '--dry-run',
      ],
      authority_boundary: {
        can_generate_domain_export_bundle: false,
        can_write_domain_truth: false,
        can_mutate_artifact_body: false,
        can_read_artifact_body: false,
        can_create_owner_receipt: false,
        can_sign_domain_receipt: false,
        can_authorize_quality_verdict: false,
        can_authorize_export_verdict: false,
        execution_requires_domain_owner_route: true,
        temporal_is_diagnostics_only: true,
      },
    },
  };
}

function buildSettingsControlCenterDryRun(actionId: string, payload: JsonRecord) {
  const action = settingsControlCenterActionById(actionId);
  return {
    settings_control_center_action: {
      surface_kind: 'opl_settings_control_center_action_preflight.v1',
      action_id: actionId,
      label: action?.label ?? actionId,
      status: 'dry_run',
      read_model_ref: 'app_state.settings_control_center.app_settings_read_model',
      task_kind: action?.task_kind ?? 'unknown',
      taxonomy: action?.taxonomy ?? null,
      requested: payload,
      payload_fields: action?.payload_fields ?? [],
      mutates: action?.mutates ?? 'unknown',
      confirmation_required: action?.confirmation_required ?? false,
      danger_level: action?.danger_level ?? 'unknown',
      impact: action?.impact ?? null,
      rollback_action_id: action?.rollback_action_id ?? null,
      follow_up_action_ids: action?.follow_up_action_ids ?? [],
      verify_action_id: action?.verify_action_id ?? null,
      command_preview: ['opl', 'app', 'action', 'execute', '--action', actionId],
      authority_boundary: {
        can_write_domain_truth: false,
        can_sign_domain_receipt: false,
        can_create_owner_receipt: false,
        can_create_typed_blocker: false,
        can_write_runtime_queue: false,
        can_write_provider_queue: false,
        can_read_memory_body: false,
        can_read_artifact_body: false,
        can_authorize_quality_verdict: false,
        can_claim_app_release_ready: false,
        can_claim_production_ready: false,
      },
    },
  };
}

function settingsVerifyWorkspacePayload(payload: JsonRecord) {
  const workspacePath = stringPayloadField(payload, 'workspace_path')
    ?? stringPayloadField(payload, 'workspacePath')
    ?? stringPayloadField(payload, 'workspace')
    ?? stringPayloadField(payload, 'path');
  if (!workspacePath) {
    throw new FrameworkContractError('cli_usage_error', 'settings_verify_workspace action requires payload.workspace_path.', {
      action_id: 'settings_verify_workspace',
      required: ['workspace_path'],
    });
  }
  return workspacePath;
}

function buildSettingsPruneRuntimeRootsPlan() {
  return {
    settings_runtime_roots_cleanup_plan: {
      surface_kind: 'opl_settings_runtime_roots_cleanup_plan.v1',
      status: 'dry_run_plan_only',
      action_id: 'settings_prune_runtime_roots_dry_run',
      inspected_roots: [
        'OPL_STATE_DIR',
        'OPL_MODULES_ROOT',
        'OPL_FAMILY_WORKSPACE_ROOT',
        'configured_workspace_root',
      ],
      allowed_operation: 'report_candidates_only',
      forbidden_operations: [
        'delete_files',
        'write_domain_truth',
        'write_runtime_queue',
        'sign_owner_receipt',
        'create_typed_blocker',
      ],
      verify_surface: 'opl app state --profile full --json#settings_control_center',
      authority_boundary: {
        can_write_domain_truth: false,
        can_sign_domain_receipt: false,
        can_create_owner_receipt: false,
        can_create_typed_blocker: false,
        can_write_runtime_queue: false,
        can_delete_runtime_roots: false,
      },
    },
  };
}

function agentPackageRegistryUrlPayload(payload: JsonRecord) {
  const registryUrl = stringPayloadField(payload, 'registry_url')
    ?? stringPayloadField(payload, 'registryUrl')
    ?? stringPayloadField(payload, 'url');
  if (!registryUrl) {
    throw new FrameworkContractError('cli_usage_error', 'refresh_registry action requires payload.registry_url.', {
      action_id: 'refresh_registry',
      required: ['registry_url'],
    });
  }
  return registryUrl;
}

function agentPackageInstallPayload(payload: JsonRecord) {
  const manifestUrl = stringPayloadField(payload, 'manifest_url')
    ?? stringPayloadField(payload, 'manifestUrl');
  const registryUrl = stringPayloadField(payload, 'registry_url')
    ?? stringPayloadField(payload, 'registryUrl');
  const packageId = stringPayloadField(payload, 'package_id')
    ?? stringPayloadField(payload, 'packageId');
  const trustTier = stringPayloadField(payload, 'trust_tier')
    ?? stringPayloadField(payload, 'trustTier');
  const sourceKind = stringPayloadField(payload, 'source_kind')
    ?? stringPayloadField(payload, 'sourceKind');
  if (!manifestUrl && !(registryUrl && packageId)) {
    throw new FrameworkContractError('cli_usage_error', 'install_from_manifest_url action requires payload.manifest_url or payload.registry_url + payload.package_id.', {
      action_id: 'install_from_manifest_url',
      required: ['manifest_url or registry_url + package_id'],
    });
  }
  return {
    manifestUrl,
    registryUrl,
    packageId,
    trustTier,
    sourceKind: sourceKind as Parameters<typeof runOplAgentPackageInstall>[0]['sourceKind'],
  };
}

function agentPackageIdPayload(actionId: string, payload: JsonRecord) {
  const packageId = stringPayloadField(payload, 'package_id')
    ?? stringPayloadField(payload, 'packageId');
  if (!packageId) {
    throw new FrameworkContractError('cli_usage_error', `${actionId} action requires payload.package_id.`, {
      action_id: actionId,
      required: ['package_id'],
    });
  }
  return { packageId };
}

function buildDockerWebuiSettingsManualAction(actionId: string, commandPreview: string[], payload: JsonRecord) {
  const action = settingsControlCenterActionById(actionId);
  return {
    settings_control_center_action: {
      surface_kind: 'opl_settings_control_center_action_preflight.v1',
      action_id: actionId,
      label: action?.label ?? actionId,
      status: 'manual_command_preview',
      task_kind: action?.task_kind ?? 'unknown',
      taxonomy: action?.taxonomy ?? null,
      requested: payload,
      payload_fields: action?.payload_fields ?? [],
      mutates: action?.mutates ?? 'unknown',
      confirmation_required: action?.confirmation_required ?? false,
      danger_level: action?.danger_level ?? 'unknown',
      impact: action?.impact ?? null,
      rollback_action_id: action?.rollback_action_id ?? null,
      follow_up_action_ids: action?.follow_up_action_ids ?? [],
      verify_action_id: action?.verify_action_id ?? null,
      command_preview: commandPreview,
      authority_boundary: {
        carries_api_key_secret: false,
        can_write_domain_truth: false,
        can_sign_domain_receipt: false,
        can_create_owner_receipt: false,
        can_create_typed_blocker: false,
        can_write_runtime_queue: false,
        can_write_provider_queue: false,
        can_claim_app_release_ready: false,
        can_claim_runtime_ready: false,
        can_claim_production_ready: false,
      },
    },
  };
}

async function withTemporaryEnv<T>(updates: Record<string, string | null>, run: () => Promise<T>) {
  const previous = Object.fromEntries(
    Object.keys(updates).map((key) => [key, process.env[key]]),
  );
  for (const [key, value] of Object.entries(updates)) {
    if (value === null) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    return await run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function dryRunFamilyRuntimeResult(surface: string, args: string[]) {
  const commandPreview = ['opl', 'family-runtime', ...args];
  if (surface === 'scheduler_tick') {
    return {
      family_runtime_scheduler_tick: {
        action: 'tick',
        provider_kind: 'temporal',
        status: 'dry_run',
        command_preview: commandPreview,
      },
    };
  }
  if (surface === 'scheduler_cadence') {
    return {
      family_runtime_scheduler_cadence: {
        action: args[1],
        provider_kind: 'temporal',
        status: 'dry_run',
        command_preview: commandPreview,
      },
    };
  }
  if (surface === 'provider_repair') {
    return {
      family_runtime_provider: {
        action: 'repair',
        provider_kind: 'temporal',
        status: 'dry_run',
        command_preview: commandPreview,
      },
    };
  }
  return {
    family_runtime_worker: {
      action: args[1],
      provider_kind: 'temporal',
      status: 'dry_run',
      command_preview: commandPreview,
    },
  };
}

async function executeDirectAppAction(
  contracts: FrameworkContracts,
  options: AppActionExecuteOptions,
) {
  const codexAction = parseCodexAction(options.actionId);
  if (codexAction) {
    return {
      delegatedSurface: `opl engine ${codexAction} --engine codex`,
      result: options.dryRun
        ? dryRunEngineAction(codexAction)
        : await runOplEngineAction(contracts, codexAction, 'codex'),
    };
  }

  const moduleAction = parseModuleAction(options.actionId);
  if (moduleAction) {
    const moduleId = modulePayload(options.payload);
    return {
      delegatedSurface: `opl connect ${moduleAction} --module ${moduleId}`,
      result: options.dryRun
        ? dryRunModuleAction(moduleAction, moduleId)
        : runOplModuleAction(moduleAction, moduleId),
    };
  }

  if (options.actionId === 'module_sync') {
    return {
      delegatedSurface: 'opl connect reconcile-modules',
      result: options.dryRun
        ? {
            system_action: {
              action: 'reconcile_modules',
              status: 'dry_run',
            },
          }
        : await runOplSystemAction(contracts, 'reconcile_modules'),
    };
  }

  if (options.actionId === 'developer_supervisor') {
    return {
      delegatedSurface: 'opl system developer-supervisor',
      result: options.dryRun
        ? {
            system_action: {
              action: 'developer_supervisor',
              status: 'dry_run',
              requested: options.payload,
            },
          }
        : await runOplSystemAction(contracts, 'developer_supervisor', {
          developerSupervisorEnabled: stringPayloadField(options.payload, 'developerSupervisorEnabled') as 'auto' | 'on' | 'off' | undefined,
          developerSupervisorMode: stringPayloadField(options.payload, 'developerSupervisorMode') as 'external_observe' | 'developer_apply_safe' | undefined,
          developerSupervisorAutoEnableGithubLogin:
            stringPayloadField(options.payload, 'developerSupervisorAutoEnableGithubLogin') ?? undefined,
        }),
    };
  }

  if (options.actionId === 'developer_supervisor_refresh') {
    return {
      delegatedSurface: 'opl system developer-supervisor',
      result: options.dryRun
        ? {
            system_action: {
              action: 'developer_supervisor',
              status: 'dry_run',
              requested: {},
            },
          }
        : await runOplSystemAction(contracts, 'developer_supervisor'),
    };
  }

  if (options.actionId === 'update_channel') {
    return {
      delegatedSurface: 'opl system update-channel',
      result: options.dryRun
        ? {
            system_action: {
              action: 'update_channel',
              status: 'dry_run',
              details: releaseChannelPayload(options.payload),
            },
          }
        : await runOplSystemAction(contracts, 'update_channel', releaseChannelPayload(options.payload)),
    };
  }

  if (options.actionId === 'workspace_root_set') {
    const workspaceRoot = workspaceRootPayload(options.payload);
    return {
      delegatedSurface: 'opl workspace root set',
      result: options.dryRun
        ? {
            workspace_root: {
              selected_path: workspaceRoot,
              status: 'dry_run',
            },
          }
        : writeOplWorkspaceRootSurface(workspaceRoot),
    };
  }

  if (options.actionId === 'task_action_receipt_preview') {
    if (!options.dryRun) {
      throw new FrameworkContractError('cli_usage_error', 'task_action_receipt_preview is a dry-run App preview only; execute through the domain owner route.', {
        action_id: options.actionId,
        required_mode: 'dry_run',
        can_write_domain_truth: false,
        can_mutate_artifact_body: false,
        can_create_owner_receipt: false,
      });
    }
    return {
      delegatedSurface: 'opl app action execute --action task_action_receipt_preview --dry-run',
      result: buildTaskActionReceiptPreview(options.payload),
    };
  }

  if (options.actionId === 'task_export_bundle_preview') {
    if (!options.dryRun) {
      throw new FrameworkContractError('cli_usage_error', 'task_export_bundle_preview is a dry-run App preview only; generate bundles through the domain owner route.', {
        action_id: options.actionId,
        required_mode: 'dry_run',
        can_generate_domain_export_bundle: false,
        can_write_domain_truth: false,
        can_create_owner_receipt: false,
      });
    }
    return {
      delegatedSurface: 'opl app action execute --action task_export_bundle_preview --dry-run',
      result: buildTaskExportBundlePreview(options.payload),
    };
  }

  if (options.actionId === 'settings_repair_model_access') {
    return {
      delegatedSurface: 'opl system developer-supervisor',
      result: options.dryRun
        ? buildSettingsControlCenterDryRun(options.actionId, options.payload)
        : await runOplSystemAction(contracts, 'developer_supervisor', {
          developerSupervisorEnabled: stringPayloadField(options.payload, 'developerSupervisorEnabled') as 'auto' | 'on' | 'off' | undefined,
          developerSupervisorMode: stringPayloadField(options.payload, 'developerSupervisorMode') as 'external_observe' | 'developer_apply_safe' | undefined,
          developerSupervisorAutoEnableGithubLogin:
            stringPayloadField(options.payload, 'developerSupervisorAutoEnableGithubLogin') ?? undefined,
        }),
    };
  }

  if (options.actionId === 'settings_verify_workspace') {
    const workspacePath = settingsVerifyWorkspacePayload(options.payload);
    return {
      delegatedSurface: 'opl workspace health',
      result: options.dryRun
        ? buildSettingsControlCenterDryRun(options.actionId, options.payload)
        : executeWorkspaceAppAction(contracts, {
          actionId: 'workspace_health',
          payload: { workspace_path: workspacePath },
          dryRun: false,
        })?.result,
    };
  }

  if (options.actionId === 'settings_sync_capabilities') {
    return {
      delegatedSurface: 'opl connect reconcile-modules',
      result: options.dryRun
        ? buildSettingsControlCenterDryRun(options.actionId, options.payload)
        : await runOplSystemAction(contracts, 'reconcile_modules'),
    };
  }

  if (options.actionId === 'settings_apply_opl_packages') {
    return {
      delegatedSurface: 'opl connect update --module <all-default-modules>',
      result: options.dryRun
        ? buildSettingsControlCenterDryRun(options.actionId, options.payload)
        : await Promise.all([
          runOplModuleAction('update', 'medautoscience'),
          runOplModuleAction('update', 'medautogrant'),
          runOplModuleAction('update', 'redcube'),
          runOplModuleAction('update', 'oplmetaagent'),
          runOplModuleAction('update', 'oplbookforge'),
        ]),
    };
  }

  if (options.actionId === 'refresh_registry' || options.actionId === 'agent_registry_refresh') {
    const registryUrl = agentPackageRegistryUrlPayload(options.payload);
    return {
      delegatedSurface: 'opl connect agent-packages registry refresh --registry-url <registry_url>',
      result: options.dryRun
        ? buildSettingsControlCenterDryRun(options.actionId, options.payload)
        : await runOplAgentPackageRegistryRefresh({ registryUrl }),
    };
  }

  if (
    options.actionId === 'install_from_manifest_url'
    || options.actionId === 'agent_package_install_from_manifest_url'
  ) {
    const installPayload = agentPackageInstallPayload(options.payload);
    return {
      delegatedSurface: 'opl connect agent-packages install --manifest-url <manifest_url>',
      result: await runOplAgentPackageInstall({
        ...installPayload,
        dryRun: options.dryRun,
      }),
    };
  }

  if (options.actionId === 'agent_package_update') {
    const installPayload = agentPackageInstallPayload(options.payload);
    return {
      delegatedSurface: 'opl connect agent-packages update --manifest-url <manifest_url>',
      result: await runOplAgentPackageUpdate({
        ...installPayload,
        dryRun: options.dryRun,
      }),
    };
  }

  if (options.actionId === 'agent_package_rollback') {
    const installPayload = agentPackageInstallPayload(options.payload);
    return {
      delegatedSurface: 'opl connect agent-packages rollback --manifest-url <manifest_url>',
      result: await runOplAgentPackageRollback({
        ...installPayload,
        dryRun: options.dryRun,
      }),
    };
  }

  if (options.actionId === 'agent_package_repair') {
    return {
      delegatedSurface: 'opl connect agent-packages repair --package-id <package_id>',
      result: runOplAgentPackageRepair({
        ...agentPackageIdPayload(options.actionId, options.payload),
        dryRun: options.dryRun,
      }),
    };
  }

  if (options.actionId === 'agent_package_uninstall') {
    return {
      delegatedSurface: 'opl connect agent-packages uninstall --package-id <package_id>',
      result: runOplAgentPackageUninstall({
        ...agentPackageIdPayload(options.actionId, options.payload),
        dryRun: options.dryRun,
      }),
    };
  }

  const exposureActions = {
    agent_package_hide: 'hide',
    agent_package_unhide: 'unhide',
    agent_package_enable: 'enable',
    agent_package_disable: 'disable',
  } as const;
  if (options.actionId in exposureActions) {
    const action = exposureActions[options.actionId as keyof typeof exposureActions];
    return {
      delegatedSurface: `opl connect agent-packages ${action} --package-id <package_id>`,
      result: runOplAgentPackageExposureAction(action, {
        ...agentPackageIdPayload(options.actionId, options.payload),
        dryRun: options.dryRun,
      }),
    };
  }

  if (options.actionId === 'settings_reload_codex_surface') {
    const reload = settingsReloadCodexSurfacePayload(options.payload);
    return {
      delegatedSurface: reload.scope === 'workspace'
        ? 'opl connect sync-skills --domain mas-scholar-skills --scope workspace --target-workspace <target_path>'
        : 'opl connect sync-skills --domain mas-scholar-skills --scope quest --target-quest <target_path>',
      result: options.dryRun
        ? buildSettingsControlCenterDryRun(options.actionId, options.payload)
        : syncFamilySkillPacks({
            domains: ['scholarskills'],
            scope: reload.scope,
            targetWorkspace: reload.scope === 'workspace' ? reload.targetPath : undefined,
            targetQuest: reload.scope === 'quest' ? reload.targetPath : undefined,
          }),
    };
  }

  if (options.actionId === 'settings_check_app_update') {
    const dryRun = buildSettingsControlCenterDryRun(options.actionId, options.payload);
    return {
      delegatedSurface: 'one-person-lab-app installation_carrier.macos_app status',
      result: {
        settings_control_center_action: dryRun.settings_control_center_action,
        installation_carrier_status: {
          carrier_type: 'macos_app',
          carrier_variant: 'installation_carrier.macos_app',
          status_source: 'one-person-lab-app',
          update_route: 'electron_standard_updater_or_homebrew_cask',
          framework_managed_update_kernel_owned: false,
          opl_update_apply_allowed: false,
        },
      },
    };
  }

  if (options.actionId === 'settings_prune_runtime_roots_dry_run') {
    return {
      delegatedSurface: 'opl settings control-center cleanup_plan --dry-run',
      result: buildSettingsPruneRuntimeRootsPlan(),
    };
  }

  if (options.actionId === 'settings_rollback_runtime_substrate') {
    return {
      delegatedSurface: managedUpdateCommand(MANAGED_UPDATE_OWNER_ACTIONS.revert, 'runtime_substrate', { json: false }),
      result: buildSettingsControlCenterDryRun(options.actionId, options.payload),
    };
  }

  if (options.actionId === 'settings_install_docker_webui') {
    return {
      delegatedSurface: 'opl install --skip-gui-open',
      result: options.dryRun
        ? buildDockerWebuiSettingsManualAction(options.actionId, ['opl', 'install', '--skip-gui-open', '--json'], options.payload)
        : await runOplTurnkeyInstall(contracts, { skipGuiOpen: true }),
    };
  }

  if (options.actionId === 'settings_configure_webui_api_key') {
    return {
      delegatedSurface: 'printf <api-key> | opl system configure-codex --api-key-stdin',
      result: buildDockerWebuiSettingsManualAction(
        options.actionId,
        ['printf', '<api-key>', '|', 'opl', 'system', 'configure-codex', '--api-key-stdin', '--json'],
        options.payload,
      ),
    };
  }

  if (options.actionId === 'settings_select_webui_seed') {
    const seed = dockerWebuiSeedEnv(options.payload);
    return {
      delegatedSurface: 'OPL_IMAGE_MANIFEST_PATH=<manifest> OPL_IMAGE_SEED_DIR=<seed> opl system startup-maintenance --json',
      result: options.dryRun
        ? buildDockerWebuiSettingsManualAction(options.actionId, seed.commandPreview, options.payload)
        : await withTemporaryEnv({
          OPL_IMAGE_MANIFEST_PATH: seed.imageManifestPath,
          OPL_IMAGE_SEED_DIR: seed.imageSeedDir,
        }, () => runOplSystemAction(contracts, 'startup_maintenance')),
    };
  }

  if (options.actionId === 'settings_run_webui_startup_maintenance') {
    return {
      delegatedSurface: 'opl system startup-maintenance',
      result: options.dryRun
        ? buildDockerWebuiSettingsManualAction(options.actionId, ['opl', 'system', 'startup-maintenance', '--json'], options.payload)
        : await runOplSystemAction(contracts, 'startup_maintenance'),
    };
  }

  if (options.actionId === 'settings_open_docker_webui') {
    const doctor = buildOplDockerWebuiDoctor();
    return {
      delegatedSurface: 'opl system docker-webui doctor --json#docker_webui_doctor.browser.url',
      result: {
        docker_webui_browser_entry: {
          surface_kind: 'opl_docker_webui_browser_entry.v1',
          action_id: options.actionId,
          status: doctor.docker_webui_doctor.browser.url ? 'url_available' : 'url_not_visible',
          browser_url: doctor.docker_webui_doctor.browser.url,
          verify_action_id: 'settings_diagnose_docker_webui',
          doctor_summary: doctor.docker_webui_doctor.diagnostic_summary,
          authority_boundary: {
            mutates: 'none_read_only',
            shell_owns_browser_navigation: true,
            can_claim_runtime_ready: false,
            can_claim_app_release_ready: false,
          },
        },
      },
    };
  }

  if (options.actionId === 'settings_diagnose_docker_webui') {
    return {
      delegatedSurface: 'opl system docker-webui doctor',
      result: buildOplDockerWebuiDoctor(),
    };
  }

  if (options.actionId === 'scholarskills_workspace_sync') {
    const workspaceRoot = scholarskillsWorkspaceRootPayload(options.payload);
    return {
      delegatedSurface: 'opl connect sync-skills --domain mas-scholar-skills --scope workspace --target-workspace <workspace_root>',
      result: options.dryRun
        ? {
            skill_sync: {
              surface_id: 'opl_skill_sync',
              status: 'dry_run',
              domain_id: 'scholarskills',
              scope: 'workspace',
              target_workspace: workspaceRoot,
              target_skill_path: `${workspaceRoot}/.codex/skills/mas-scholar-skills`,
              command: `opl connect sync-skills --domain mas-scholar-skills --scope workspace --target-workspace ${workspaceRoot} --json`,
              authority_boundary: {
                can_write_domain_truth: false,
                can_sign_owner_receipt: false,
                can_create_typed_blocker: false,
                can_write_runtime_queue: false,
                can_write_owner_receipt: false,
                can_write_paper_body: false,
                can_write_artifact_authority: false,
                can_authorize_publication_readiness: false,
              },
            },
          }
        : syncFamilySkillPacks({
            domains: ['scholarskills'],
            scope: 'workspace',
            targetWorkspace: workspaceRoot,
          }),
    };
  }

  if (options.actionId === 'scholarskills_quest_sync') {
    const questRoot = scholarskillsQuestRootPayload(options.payload);
    return {
      delegatedSurface: 'opl connect sync-skills --domain mas-scholar-skills --scope quest --target-quest <quest_root>',
      result: options.dryRun
        ? {
            skill_sync: {
              surface_id: 'opl_skill_sync',
              status: 'dry_run',
              domain_id: 'scholarskills',
              scope: 'quest',
              target_quest: questRoot,
              target_skill_path: `${questRoot}/.codex/skills/mas-scholar-skills`,
              command: `opl connect sync-skills --domain mas-scholar-skills --scope quest --target-quest ${questRoot} --json`,
              authority_boundary: {
                can_write_domain_truth: false,
                can_sign_owner_receipt: false,
                can_create_typed_blocker: false,
                can_write_runtime_queue: false,
                can_write_owner_receipt: false,
                can_write_paper_body: false,
                can_write_artifact_authority: false,
                can_authorize_publication_readiness: false,
              },
            },
          }
        : syncFamilySkillPacks({
            domains: ['scholarskills'],
            scope: 'quest',
            targetQuest: questRoot,
          }),
    };
  }

  const workspaceAction = executeWorkspaceAppAction(contracts, options);
  if (workspaceAction) {
    return workspaceAction;
  }

  if (options.actionId === 'provider_scheduler_status') {
    return {
      delegatedSurface: 'opl family-runtime scheduler status --provider temporal',
      result: options.dryRun
        ? {
            family_runtime_scheduler_cadence: {
              action: 'status',
              provider_kind: 'temporal',
              status: 'dry_run',
            },
          }
        : await runFamilyRuntime(['scheduler', 'status', '--provider', 'temporal']),
    };
  }

  if (options.actionId === 'provider_scheduler_install') {
    const args = ['scheduler', 'install', '--provider', 'temporal'];
    return {
      delegatedSurface: 'opl family-runtime scheduler install --provider temporal',
      result: options.dryRun ? dryRunFamilyRuntimeResult('scheduler_cadence', args) : await runFamilyRuntime(args),
    };
  }

  if (options.actionId === 'provider_scheduler_trigger') {
    const args = ['scheduler', 'trigger', '--provider', 'temporal'];
    return {
      delegatedSurface: 'opl family-runtime scheduler trigger --provider temporal',
      result: options.dryRun ? dryRunFamilyRuntimeResult('scheduler_cadence', args) : await runFamilyRuntime(args),
    };
  }

  if (options.actionId === 'provider_scheduler_tick') {
    const args = schedulerTickArgs(options.payload);
    return {
      delegatedSurface: 'opl family-runtime scheduler tick --provider temporal',
      result: options.dryRun ? dryRunFamilyRuntimeResult('scheduler_tick', args) : await runFamilyRuntime(args),
    };
  }

  if (options.actionId === 'provider_worker_status') {
    return {
      delegatedSurface: 'opl family-runtime worker status --provider temporal',
      result: options.dryRun
        ? {
            family_runtime_worker: {
              action: 'status',
              provider_kind: 'temporal',
              status: 'dry_run',
            },
          }
        : await runFamilyRuntime(['worker', 'status', '--provider', 'temporal']),
    };
  }

  if (options.actionId === 'provider_worker_start') {
    const args = ['worker', 'start', '--provider', 'temporal'];
    return {
      delegatedSurface: 'opl family-runtime worker start --provider temporal',
      result: options.dryRun ? dryRunFamilyRuntimeResult('worker', args) : await runFamilyRuntime(args),
    };
  }

  if (options.actionId === 'provider_worker_restart') {
    const args = ['repair', '--provider', 'temporal'];
    return {
      delegatedSurface: 'opl family-runtime repair --provider temporal',
      result: options.dryRun
        ? dryRunFamilyRuntimeResult('provider_repair', args)
        : await runFamilyRuntime(args),
    };
  }

  return null;
}

export async function runOplAppActionExecute(
  contracts: FrameworkContracts,
  options: AppActionExecuteOptions,
) {
  const direct = await executeDirectAppAction(contracts, options);
  if (direct) {
    return {
      version: 'g2',
      app_action_execution: {
        surface_kind: 'opl_app_action_execution.v1',
        action_id: options.actionId,
        dry_run: options.dryRun,
        delegated_surface: direct.delegatedSurface,
        result: direct.result,
        authority_boundary: {
          opl: 'app_action_boundary_and_runtime_route_delegate',
          app_repo: 'gui_product_truth_and_release_gate_owner',
          shell: 'implementation_adapter_only',
          can_write_domain_truth: false,
          can_read_memory_body: false,
          can_read_artifact_body: false,
        },
      },
    };
  }

  let result: unknown;
  try {
    result = await runRuntimeOperatorActionExecute(contracts, [
      '--action',
      options.actionId,
      ...(Object.keys(options.payload).length > 0 ? ['--payload', JSON.stringify(options.payload)] : []),
      ...(options.dryRun ? ['--dry-run'] : []),
    ], {
      runtimeSnapshotProvider: buildRuntimeTraySnapshot,
    });
  } catch (error) {
    if (!options.dryRun) {
      throw error;
    }
    if (!(error instanceof FrameworkContractError) || error.code !== 'cli_usage_error') {
      throw error;
    }
    result = buildDryRunUnresolvedAction(options);
  }

  return {
    version: 'g2',
    app_action_execution: {
      surface_kind: 'opl_app_action_execution.v1',
      action_id: options.actionId,
      dry_run: options.dryRun,
      delegated_surface: 'opl runtime action execute',
      result,
      authority_boundary: {
        opl: 'app_action_boundary_and_runtime_route_delegate',
        app_repo: 'gui_product_truth_and_release_gate_owner',
        shell: 'implementation_adapter_only',
        can_write_domain_truth: false,
        can_read_memory_body: false,
        can_read_artifact_body: false,
      },
    },
  };
}
