import { FrameworkContractError, isRecord } from '../../../kernel/contract-validation.ts';
import { parseJsonText } from '../../../kernel/json-file.ts';
import { runRuntimeOperatorActionExecute } from '../../runway/index.ts';
import {
  runOplAgentPackageExposureAction,
  runOplAgentPackageHomeShortcutPreferencesSet,
  runOplAgentPackageInstall,
  runOplAgentPackageRegistryRefresh,
  runOplAgentPackageRepair,
  runOplAgentPackageUninstall,
  runOplAgentPackageUpdate,
  runOplAgentPackageActivate,
  runOplModuleAction,
  agentPackageDelegatedSurface,
  buildManagedUpdateKernelProjection,
  runManagedUpdateKernelOperation,
} from '../../connect/index.ts';
import { runOplSystemAction } from '../../connect/index.ts';
import { writeOplWorkspaceRootSurface } from '../../connect/index.ts';
import { runFamilyRuntime } from '../../runway/index.ts';
import { runOplEngineAction } from '../../connect/index.ts';
import { MANAGED_UPDATE_OWNER_ACTIONS, managedUpdateCommand } from '../../connect/index.ts';
import { executeWorkspaceAppAction } from '../app-state-workspace-actions.ts';
import type { FrameworkContracts } from '../../../kernel/types.ts';
import { buildOplDockerWebuiDoctor } from '../../connect/index.ts';
import { runOplTurnkeyInstall } from '../../connect/index.ts';
import { buildRuntimeTraySnapshot } from '../runtime-tray-snapshot.ts';
import {
  agentPackageIdPayload,
  agentPackageInstallPayload,
  agentPackagePreferencesPayload,
  agentPackageRegistryUrlPayload,
  dockerWebuiSeedEnv,
  modulePayload,
  parseCodexAction,
  parseModuleAction,
  releaseChannelPayload,
  agentPackageActivationPayload,
  settingsVerifyWorkspacePayload,
  stringPayloadField,
  workspaceRootPayload,
} from './action-execute-payloads.ts';
import {
  buildDockerWebuiSettingsManualAction,
  buildDryRunUnresolvedAction,
  buildSettingsControlCenterDryRun,
  buildSettingsPruneRuntimeRootsPlan,
  buildTaskActionReceiptPreview,
  buildTaskExportBundlePreview,
  dryRunEngineAction,
  dryRunFamilyRuntimeResult,
  dryRunModuleAction,
} from './action-execute-previews.ts';
import { executeConnectionAppAction } from './action-execute-connections.ts';

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

function requireAgentPackageDelegatedSurface(actionId: string) {
  const delegatedSurface = agentPackageDelegatedSurface(actionId);
  if (!delegatedSurface) {
    throw new FrameworkContractError('contract_shape_invalid', `Unknown Agent Package action catalog entry: ${actionId}.`, {
      action_id: actionId,
    });
  }
  return delegatedSurface;
}

async function buildManagedUpdateControlCenterDryRun(
  contracts: FrameworkContracts,
  options: AppActionExecuteOptions,
  componentId: string,
  operation: 'status' | 'plan' = 'plan',
) {
  const projection = await buildManagedUpdateKernelProjection(contracts, {
    operation,
    componentId,
  });
  return {
    ...buildSettingsControlCenterDryRun(options.actionId, options.payload),
    managed_update: projection.managed_update,
  };
}

function runManagedUpdateApply(contracts: FrameworkContracts, componentId: string) {
  return runManagedUpdateKernelOperation(contracts, {
    operation: 'apply',
    componentId,
  });
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

async function executeDirectAppAction(
  contracts: FrameworkContracts,
  options: AppActionExecuteOptions,
) {
  const connectionAction = await executeConnectionAppAction(options);
  if (connectionAction) return connectionAction;

  if (options.actionId === 'runtime_archive_attempt' || options.actionId === 'runtime_restore_attempt') {
    const stageAttemptId = stringPayloadField(options.payload, 'stage_attempt_id');
    if (!stageAttemptId) {
      throw new FrameworkContractError('cli_usage_error', `${options.actionId} requires stage_attempt_id.`, {
        action_id: options.actionId,
        required_payload_fields: ['stage_attempt_id'],
      });
    }
    const archive = options.actionId === 'runtime_archive_attempt';
    const reason = stringPayloadField(options.payload, 'reason') ?? (archive ? 'user_archived' : 'user_restored');
    const args = [
      'attempt',
      archive ? 'archive' : 'restore',
      stageAttemptId,
      '--reason',
      reason,
      '--source',
      'opl-app',
    ];
    return {
      delegatedSurface: `opl family-runtime ${args.join(' ')}`,
      result: options.dryRun
        ? {
            surface_kind: 'opl_runtime_attempt_archive_preflight',
            action: archive ? 'archive' : 'restore',
            stage_attempt_id: stageAttemptId,
            reason,
            status: 'dry_run',
          }
        : await runFamilyRuntime(args),
    };
  }

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
      delegatedSurface: managedUpdateCommand('apply', 'opl_packages', { json: false }),
      result: options.dryRun
        ? await buildManagedUpdateKernelProjection(contracts, {
            operation: 'plan',
            componentId: 'opl_packages',
          })
        : await runManagedUpdateApply(contracts, 'opl_packages'),
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
          developerSupervisorModuleId:
            stringPayloadField(options.payload, 'developerSupervisorModuleId') ?? undefined,
          developerSupervisorModuleSource:
            stringPayloadField(options.payload, 'developerSupervisorModuleSource') as
              | 'auto'
              | 'managed'
              | 'developer'
              | undefined,
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
      delegatedSurface: managedUpdateCommand('apply', 'opl_packages', { json: false }),
      result: options.dryRun
        ? await buildManagedUpdateControlCenterDryRun(contracts, options, 'opl_packages')
        : await runManagedUpdateApply(contracts, 'opl_packages'),
    };
  }

  if (options.actionId === 'settings_apply_opl_packages') {
    return {
      delegatedSurface: managedUpdateCommand('apply', 'opl_packages', { json: false }),
      result: options.dryRun
        ? await buildManagedUpdateControlCenterDryRun(contracts, options, 'opl_packages')
        : await runManagedUpdateApply(contracts, 'opl_packages'),
    };
  }

  if (options.actionId === 'refresh_registry' || options.actionId === 'agent_registry_refresh') {
    const registryUrl = agentPackageRegistryUrlPayload(options.payload);
    return {
      delegatedSurface: requireAgentPackageDelegatedSurface(options.actionId),
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
      delegatedSurface: requireAgentPackageDelegatedSurface(options.actionId),
      result: await runOplAgentPackageInstall({
        ...installPayload,
        dryRun: options.dryRun,
      }),
    };
  }

  if (options.actionId === 'agent_package_update') {
    const installPayload = agentPackageInstallPayload(options.payload, { allowPackageOnly: true });
    return {
      delegatedSurface: requireAgentPackageDelegatedSurface(options.actionId),
      result: await runOplAgentPackageUpdate({
        ...installPayload,
        dryRun: options.dryRun,
      }),
    };
  }

  if (options.actionId === 'agent_package_repair') {
    return {
      delegatedSurface: requireAgentPackageDelegatedSurface(options.actionId),
      result: await runOplAgentPackageRepair({
        ...agentPackageIdPayload(options.actionId, options.payload),
        dryRun: options.dryRun,
      }),
    };
  }

  if (options.actionId === 'agent_package_uninstall') {
    return {
      delegatedSurface: requireAgentPackageDelegatedSurface(options.actionId),
      result: runOplAgentPackageUninstall({
        ...agentPackageIdPayload(options.actionId, options.payload),
        dryRun: options.dryRun,
      }),
    };
  }

  if (options.actionId === 'agent_package_preferences_set') {
    const preferencesPayload = agentPackagePreferencesPayload(options.payload);
    if (preferencesPayload.exposureAction) {
      return {
        delegatedSurface: `opl packages ${preferencesPayload.exposureAction} --package-id <package_id>`,
        result: runOplAgentPackageExposureAction(preferencesPayload.exposureAction, {
          packageId: preferencesPayload.packageId,
          dryRun: options.dryRun,
        }),
      };
    }
    return {
      delegatedSurface: 'opl packages preferences set --package-id <package_id> --shortcut-id <shortcut_id>',
      result: runOplAgentPackageHomeShortcutPreferencesSet({
        packageId: preferencesPayload.packageId,
        shortcutId: preferencesPayload.shortcutId,
        visible: preferencesPayload.visible,
        sortOrder: preferencesPayload.sortOrder,
        dryRun: options.dryRun,
      }),
    };
  }

  if (options.actionId === 'agent_package_activate') {
    const activation = agentPackageActivationPayload(options.payload);
    return {
      delegatedSurface: requireAgentPackageDelegatedSurface(options.actionId),
      result: await runOplAgentPackageActivate({
        ...activation,
        dryRun: options.dryRun,
      }),
    };
  }

  if (options.actionId === 'settings_check_app_update') {
    const dryRun = buildSettingsControlCenterDryRun(options.actionId, options.payload);
    const projection = await buildManagedUpdateKernelProjection(contracts, {
      operation: 'status',
      componentId: 'opl_app',
    });
    return {
      delegatedSurface: managedUpdateCommand('status', 'opl_app', { json: false }),
      result: {
        settings_control_center_action: dryRun.settings_control_center_action,
        managed_update: projection.managed_update,
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
      delegatedSurface: managedUpdateCommand(MANAGED_UPDATE_OWNER_ACTIONS.revert, 'opl_base', { json: false }),
      result: buildSettingsControlCenterDryRun(options.actionId, options.payload),
    };
  }

  if (options.actionId === 'settings_install_docker_webui') {
    return {
      delegatedSurface: 'opl install --headless',
      result: options.dryRun
        ? buildDockerWebuiSettingsManualAction(options.actionId, ['opl', 'install', '--headless', '--json'], options.payload)
        : await runOplTurnkeyInstall(contracts, { headless: true }),
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
