import type { runFamilyRuntime } from '../../../adapters/execution/index.ts';
import {
  cancelPackageOperation,
  completeOplGatewaySetup,
  disconnectOplGatewayAccount,
  executeOplSoftwareSourceAction,
  executeSoftwareInstallationAction,
  packageDownloadPlan,
  packageOperationStatus,
  refreshInstalledAgentPackageWorkspaceSkills,
  refreshOplGatewayAccount,
  repairOplGatewayAccount,
  runOplModuleAction,
  runOplSystemAction,
  SOFTWARE_INSTALLATION_ACTION_ID,
  SOFTWARE_SOURCE_ACTION_IDS,
  startPackageOperation,
  useOplGatewayForModelAccess,
  validatePackageOperationRequest,
  type CordisConnectDescriptorDiscoveryService,
  type SoftwareSourceActionId,
} from '../../../adapters/integration/index.ts';
import {
  executeKnowledgeSourceAction,
  KNOWLEDGE_SOURCE_ACTION_IDS,
} from '../../../authority/packages/index.ts';
import { listWorkspaceBindings } from '../../../authority/workspace/public/app-state.ts';
import { FrameworkContractError, isRecord } from '../../../kernel/contract-validation.ts';
import type { FrameworkContracts } from '../../../kernel/types.ts';
import { executeWorkspaceAppAction as runWorkspaceAppAction } from '../app-state-workspace-actions.ts';
import { executeConnectionAppAction } from './action-execute-connections.ts';
import { executeProviderAppAction } from './action-execute-provider.ts';
import type { AppActionExecuteOptions } from './action-execute-parser.ts';
import {
  executeAutomationAppAction,
} from './action-execute-automation.ts';
import {
  executeAgentPackageAppAction,
  executePackageContributionAppAction,
} from './action-execute-packages.ts';
import {
  dockerWebuiSeedEnv,
  modulePayload,
  parseModuleAction,
  settingsVerifyWorkspacePayload,
  stringPayloadField,
} from './action-execute-payloads.ts';
import {
  buildDockerWebuiSettingsManualAction,
  buildSettingsControlCenterDryRun,
  buildTaskActionReceiptPreview,
  buildTaskExportBundlePreview,
  dryRunModuleAction,
} from './action-execute-previews.ts';
import { executeRuntimeWorkItemAppAction } from './action-execute-runtime.ts';
import { executeSystemAppAction } from './action-execute-system.ts';
import {
  executeSettingsManagedUpdateApplyAction,
  executeSettingsManagedUpdateCheckAction,
  executeSettingsManagedUpdateRollbackAction,
  executeSettingsPostPackageAction,
  executeSettingsRepairAppAction,
} from './action-execute-settings.ts';
import {
  executeDockerWebuiOperationalAction,
  executeDockerWebuiSetupAction,
} from './action-execute-docker-webui.ts';
import {
  executeExternalOwnerManagedUpdateAppAction,
  executeModuleSyncManagedUpdateAppAction,
} from './action-execute-managed-update.ts';

export type AutomationProviderHostActions = Readonly<{
  inspect(input: Readonly<{
    provider_id?: string;
    automation_kind?: 'computer_use' | 'browser_automation';
    runExternalChecks?: boolean;
  }>): Promise<Readonly<Record<string, unknown>>>;
  execute(input: Readonly<{
    provider_id?: string;
    automation_kind?: 'computer_use' | 'browser_automation';
    action_id: string;
    dry_run?: boolean;
  }>): Promise<Readonly<Record<string, unknown>>>;
}>;

export type AppActionExecuteServices = {
  descriptorDiscovery: Pick<CordisConnectDescriptorDiscoveryService, 'discover'>;
  familyRuntime: typeof runFamilyRuntime;
  automationProviderHost?: AutomationProviderHostActions | null;
};

type DescriptorDiscovery = Pick<CordisConnectDescriptorDiscoveryService, 'discover'>;

type EnvironmentAppActionResult = {
  delegatedSurface: string;
  result: unknown;
};

async function executePackageOperationAppAction(options: AppActionExecuteOptions) {
  const delegatedSurface = 'opl packages native lifecycle with observable transfer';
  if (options.actionId === 'package_operation_status') {
    const id = options.payload.operation_id;
    if (id !== undefined && typeof id !== 'string') throw new Error('invalid_package_operation_id');
    return { delegatedSurface, result: { operations: packageOperationStatus(id) } };
  }
  if (options.actionId === 'package_operation_cancel') {
    if (typeof options.payload.operation_id !== 'string') throw new Error('invalid_package_operation_id');
    return { delegatedSurface, result: options.dryRun ? { operations: packageOperationStatus(options.payload.operation_id) } : cancelPackageOperation(options.payload.operation_id) };
  }
  if (options.actionId !== 'package_operation_start') return null;
  const { actionId, packageId } = validatePackageOperationRequest(options.payload.action_id, options.payload.package_id);
  if (options.dryRun) {
    const preview = await executeAgentPackageAppAction({ actionId, payload: { package_id: packageId }, dryRun: true });
    const result = isRecord(preview?.result) ? preview.result : {};
    const lifecycle = Object.values(result).find(value => isRecord(value) && Array.isArray(value.required_dependency_install_results));
    const dependencies = isRecord(lifecycle) && Array.isArray(lifecycle.required_dependency_install_results) ? lifecycle.required_dependency_install_results : [];
    const ids = new Set([packageId, ...dependencies.filter(isRecord).filter(item => item.native_carrier_action !== 'not_dispatched').map(item => String(item.package_id))]);
    return { delegatedSurface, result: { download_plan: [...ids].map(id => packageDownloadPlan(id)), native_preview: preview?.result } };
  }
  return { delegatedSurface, result: { operation: await startPackageOperation(actionId, packageId) } };
}

export function executeKnowledgeSourceAppAction(options: AppActionExecuteOptions) {
  const actionId = options.actionId as (typeof KNOWLEDGE_SOURCE_ACTION_IDS)[number];
  if (!KNOWLEDGE_SOURCE_ACTION_IDS.includes(actionId)) return null;
  if (options.dryRun && !['knowledge_source_list', 'knowledge_source_check'].includes(actionId)) {
    throw new FrameworkContractError('cli_usage_error', 'Knowledge source changes do not support dry-run.', {
      reason_code: 'knowledge_source_dry_run_unsupported',
    });
  }
  return {
    delegatedSurface: `opl knowledge source-${actionId.slice('knowledge_source_'.length)}`,
    result: executeKnowledgeSourceAction(actionId, options.payload, { workspaceBindings: listWorkspaceBindings() }),
  };
}

async function executeSoftwareSourceAppAction(options: AppActionExecuteOptions) {
  if (options.actionId === SOFTWARE_INSTALLATION_ACTION_ID) {
    if (options.dryRun) throw new FrameworkContractError('cli_usage_error', 'Installation changes require exact owner readback and confirmation.');
    return { delegatedSurface: 'installed_package_owner_installation_cli', result: await executeSoftwareInstallationAction(options.payload) };
  }
  if (!SOFTWARE_SOURCE_ACTION_IDS.includes(options.actionId as SoftwareSourceActionId)) return null;
  if (options.dryRun && options.actionId !== 'source_list') {
    throw new FrameworkContractError('cli_usage_error', 'Software source changes and checks do not support dry-run.', { reason_code: 'software_source_dry_run_unsupported' });
  }
  return {
    delegatedSurface: `opl sources ${options.actionId.slice('source_'.length)}`,
    result: await executeOplSoftwareSourceAction(options.actionId as SoftwareSourceActionId, options.payload),
  };
}

function executeModuleAppAction(options: AppActionExecuteOptions) {
  const moduleAction = parseModuleAction(options.actionId);
  if (!moduleAction) return null;

  const moduleId = modulePayload(options.payload);
  return {
    delegatedSurface: `opl connect ${moduleAction} --module ${moduleId}`,
    result: options.dryRun
      ? dryRunModuleAction(moduleAction, moduleId)
      : runOplModuleAction(moduleAction, moduleId),
  };
}

function executeModuleSyncAppAction(
  contracts: FrameworkContracts,
  options: AppActionExecuteOptions,
) {
  return executeModuleSyncManagedUpdateAppAction(contracts, options);
}

function executeTaskPreviewAppAction(options: AppActionExecuteOptions) {
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

  return null;
}

function refreshWorkspaceSkills(
  descriptorDiscovery: DescriptorDiscovery,
  input: Omit<Parameters<typeof refreshInstalledAgentPackageWorkspaceSkills>[0], 'descriptorDiscovery'>,
) {
  return refreshInstalledAgentPackageWorkspaceSkills({
    ...input,
    descriptorDiscovery,
  });
}

function executeWorkspaceVerificationAppAction(
  contracts: FrameworkContracts,
  options: AppActionExecuteOptions,
  descriptorDiscovery: DescriptorDiscovery,
) {
  if (options.actionId !== 'settings_verify_workspace') return null;
  const workspacePath = settingsVerifyWorkspacePayload(options.payload);
  return {
    delegatedSurface: 'opl workspace health',
    result: options.dryRun
      ? buildSettingsControlCenterDryRun(options.actionId, options.payload)
      : runWorkspaceAppAction(contracts, {
        actionId: 'workspace_health',
        payload: { workspace_path: workspacePath },
        dryRun: false,
      }, {
        refreshWorkspaceSkills: (input) => refreshWorkspaceSkills(descriptorDiscovery, input),
      })?.result,
  };
}

function executeWorkspaceAppAction(
  contracts: FrameworkContracts,
  options: AppActionExecuteOptions,
  descriptorDiscovery: DescriptorDiscovery,
) {
  const workspaceAction = runWorkspaceAppAction(contracts, options, {
    refreshWorkspaceSkills: (input) => refreshWorkspaceSkills(descriptorDiscovery, input),
  });
  if (!workspaceAction) return null;
  return workspaceAction;
}

async function withTemporaryEnv<T>(
  updates: Record<string, string | null>,
  run: () => Promise<T>,
) {
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

async function executeEnvironmentAppAction(
  contracts: FrameworkContracts,
  options: AppActionExecuteOptions,
): Promise<EnvironmentAppActionResult | null> {
  if (options.actionId !== 'settings_select_webui_seed') {
    return null;
  }
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

async function executeGatewayAppAction(options: AppActionExecuteOptions) {
  const gatewayActions = new Set([
    'gateway_account_complete_setup',
    'gateway_account_refresh',
    'gateway_account_repair',
    'gateway_account_use_for_model_access',
    'gateway_account_disconnect',
  ]);
  if (!gatewayActions.has(options.actionId)) return null;

  if (options.dryRun) {
    throw new FrameworkContractError('cli_usage_error', 'OPL Gateway account actions do not support dry-run.', {
      reason_code: 'gateway_account_dry_run_unsupported',
    });
  }
  const allowedFields = options.actionId === 'gateway_account_complete_setup' || options.actionId === 'gateway_account_repair'
    ? new Set(['group_id'])
    : new Set<string>();
  const extraFields = Object.keys(options.payload).filter((field) => !allowedFields.has(field));
  if (extraFields.length > 0) {
    throw new FrameworkContractError('cli_usage_error', 'OPL Gateway account actions reject secret or unknown payload fields.', {
      reason_code: 'gateway_account_payload_forbidden',
      fields: extraFields,
    });
  }
  if (options.actionId === 'gateway_account_complete_setup') {
    const groupId = stringPayloadField(options.payload, 'group_id');
    if (!groupId) {
      throw new FrameworkContractError('cli_usage_error', 'gateway_account_complete_setup requires payload.group_id.', {
        reason_code: 'gateway_group_required',
      });
    }
    return { delegatedSurface: 'opl connect gateway complete-setup --group-id <id>', result: await completeOplGatewaySetup(groupId) };
  }
  if (options.actionId === 'gateway_account_refresh') {
    return { delegatedSurface: 'opl connect gateway refresh', result: await refreshOplGatewayAccount() };
  }
  if (options.actionId === 'gateway_account_repair') {
    const groupId = typeof options.payload.group_id === 'string' ? options.payload.group_id : undefined;
    return { delegatedSurface: 'opl connect gateway repair', result: await repairOplGatewayAccount(groupId) };
  }
  if (options.actionId === 'gateway_account_use_for_model_access') {
    return { delegatedSurface: 'opl connect gateway use-for-model-access', result: await useOplGatewayForModelAccess() };
  }
  return { delegatedSurface: 'opl connect gateway disconnect', result: await disconnectOplGatewayAccount() };
}

export async function executeDirectAppAction(
  contracts: FrameworkContracts,
  options: AppActionExecuteOptions,
  services: AppActionExecuteServices,
) {
  const packageOperation = await executePackageOperationAppAction(options);
  if (packageOperation) return packageOperation;

  const knowledgeSourceAction = executeKnowledgeSourceAppAction(options);
  if (knowledgeSourceAction) return knowledgeSourceAction;

  const sourceAction = await executeSoftwareSourceAppAction(options);
  if (sourceAction) return sourceAction;

  const connectionAction = await executeConnectionAppAction(options);
  if (connectionAction) return connectionAction;

  const automationAction = await executeAutomationAppAction(options, services);
  if (automationAction) return automationAction;

  const packageContributionAction = executePackageContributionAppAction(options, services);
  if (packageContributionAction) return packageContributionAction;

  const runtimeWorkItemAction = await executeRuntimeWorkItemAppAction(
    contracts,
    options,
    services.familyRuntime,
  );
  if (runtimeWorkItemAction) return runtimeWorkItemAction;

  const externalManagedUpdateAction = executeExternalOwnerManagedUpdateAppAction(options);
  if (externalManagedUpdateAction) return externalManagedUpdateAction;

  const moduleAction = executeModuleAppAction(options);
  if (moduleAction) return moduleAction;

  const moduleSyncAction = await executeModuleSyncAppAction(contracts, options);
  if (moduleSyncAction) return moduleSyncAction;

  const systemAction = await executeSystemAppAction(contracts, options);
  if (systemAction) return systemAction;

  const taskPreviewAction = executeTaskPreviewAppAction(options);
  if (taskPreviewAction) return taskPreviewAction;

  const settingsRepairAction = await executeSettingsRepairAppAction(contracts, options);
  if (settingsRepairAction) return settingsRepairAction;

  const workspaceVerificationAction = executeWorkspaceVerificationAppAction(
    contracts,
    options,
    services.descriptorDiscovery,
  );
  if (workspaceVerificationAction) return workspaceVerificationAction;

  const settingsManagedUpdateApplyAction = await executeSettingsManagedUpdateApplyAction(contracts, options);
  if (settingsManagedUpdateApplyAction) return settingsManagedUpdateApplyAction;

  const agentPackageAction = await executeAgentPackageAppAction(options);
  if (agentPackageAction) return agentPackageAction;

  const settingsManagedUpdateCheckAction = await executeSettingsManagedUpdateCheckAction(contracts, options);
  if (settingsManagedUpdateCheckAction) return settingsManagedUpdateCheckAction;

  const settingsPostPackageAction = executeSettingsPostPackageAction(options);
  if (settingsPostPackageAction) return settingsPostPackageAction;

  const settingsManagedUpdateRollbackAction = executeSettingsManagedUpdateRollbackAction(options);
  if (settingsManagedUpdateRollbackAction) return settingsManagedUpdateRollbackAction;

  const dockerWebuiSetupAction = await executeDockerWebuiSetupAction(contracts, options);
  if (dockerWebuiSetupAction) return dockerWebuiSetupAction;

  const environmentAction = await executeEnvironmentAppAction(contracts, options);
  if (environmentAction) return environmentAction;

  const dockerWebuiOperationalAction = await executeDockerWebuiOperationalAction(contracts, options);
  if (dockerWebuiOperationalAction) return dockerWebuiOperationalAction;

  const workspaceAction = executeWorkspaceAppAction(
    contracts,
    options,
    services.descriptorDiscovery,
  );
  if (workspaceAction) return workspaceAction;

  const gatewayAction = await executeGatewayAppAction(options);
  if (gatewayAction) return gatewayAction;

  const providerAction = await executeProviderAppAction(options, services.familyRuntime);
  if (providerAction) return providerAction;

  return null;
}
