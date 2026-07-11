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
  runOplFlowIntelligenceEnhancementAction,
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
import { syncFamilySkillPacks } from '../../connect/index.ts';
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
  scholarskillsQuestRootPayload,
  scholarskillsWorkspaceRootPayload,
  settingsReloadCodexSurfacePayload,
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
      delegatedSurface: managedUpdateCommand('apply', 'capability_packages', { json: false }),
      result: options.dryRun
        ? await buildManagedUpdateKernelProjection(contracts, {
            operation: 'plan',
            componentId: 'capability_packages',
          })
        : await runManagedUpdateApply(contracts, 'capability_packages'),
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

  const intelligenceEnhancementActions = {
    intelligence_enhancement_status: 'status',
    intelligence_enhancement_enable: 'enable',
    intelligence_enhancement_disable: 'disable',
    intelligence_enhancement_repair: 'repair',
    intelligence_enhancement_uninstall: 'uninstall',
  } as const;
  if (options.actionId in intelligenceEnhancementActions) {
    const action = intelligenceEnhancementActions[
      options.actionId as keyof typeof intelligenceEnhancementActions
    ];
    return {
      delegatedSurface: `opl flow intelligence-enhancement ${action}`,
      result: await runOplFlowIntelligenceEnhancementAction(action, options.payload, options.dryRun),
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
      delegatedSurface: managedUpdateCommand('apply', 'capability_packages', { json: false }),
      result: options.dryRun
        ? await buildManagedUpdateControlCenterDryRun(contracts, options, 'capability_packages')
        : await runManagedUpdateApply(contracts, 'capability_packages'),
    };
  }

  if (options.actionId === 'settings_apply_opl_packages') {
    return {
      delegatedSurface: managedUpdateCommand('apply', 'capability_packages', { json: false }),
      result: options.dryRun
        ? await buildManagedUpdateControlCenterDryRun(contracts, options, 'capability_packages')
        : await runManagedUpdateApply(contracts, 'capability_packages'),
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
      result: runOplAgentPackageRepair({
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
        delegatedSurface: `opl connect agent-packages ${preferencesPayload.exposureAction} --package-id <package_id>`,
        result: runOplAgentPackageExposureAction(preferencesPayload.exposureAction, {
          packageId: preferencesPayload.packageId,
          dryRun: options.dryRun,
        }),
      };
    }
    return {
      delegatedSurface: 'opl connect agent-packages home-shortcut-preferences set --package-id <package_id> --shortcut-id <shortcut_id>',
      result: runOplAgentPackageHomeShortcutPreferencesSet({
        packageId: preferencesPayload.packageId,
        shortcutId: preferencesPayload.shortcutId,
        visible: preferencesPayload.visible,
        sortOrder: preferencesPayload.sortOrder,
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
    const projection = await buildManagedUpdateKernelProjection(contracts, {
      operation: 'status',
      componentId: 'installation_carrier',
    });
    return {
      delegatedSurface: managedUpdateCommand('status', 'installation_carrier', { json: false }),
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
      delegatedSurface: managedUpdateCommand(MANAGED_UPDATE_OWNER_ACTIONS.revert, 'runtime_substrate', { json: false }),
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
