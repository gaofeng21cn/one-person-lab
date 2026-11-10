import type { FrameworkContracts } from '../../../kernel/types.ts';
import { executeSoftwareSourceAppAction } from './action-execute-sources.ts';
import { executeKnowledgeSourceAppAction } from './action-execute-knowledge-sources.ts';
import { executeConnectionAppAction } from './action-execute-connections.ts';
import { executeProviderAppAction } from './action-execute-provider.ts';
import { executeEnvironmentAppAction } from './action-execute-environment.ts';
import type { AppActionExecuteOptions } from './action-execute-parser.ts';
import {
  executeAutomationAppAction,
} from './action-execute-automation.ts';
import {
  executeAgentPackageAppAction,
  executePackageContributionAppAction,
} from './action-execute-packages.ts';
import { executeRuntimeWorkItemAppAction } from './action-execute-runtime.ts';
import {
  executeModuleAppAction,
  executeModuleSyncAppAction,
} from './action-execute-modules.ts';
import { executeSystemAppAction } from './action-execute-system.ts';
import { executeTaskPreviewAppAction } from './action-execute-task.ts';
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
  executeWorkspaceAppAction,
  executeWorkspaceVerificationAppAction,
} from './action-execute-workspace.ts';
import { executeGatewayAppAction } from './action-execute-gateway.ts';
import {
  executeExternalOwnerManagedUpdateAppAction,
} from './action-execute-managed-update.ts';
import type { AppActionExecuteServices } from './action-execute-types.ts';

export type {
  AutomationProviderHostActions,
  AppActionExecuteServices,
} from './action-execute-types.ts';

export async function executeDirectAppAction(
  contracts: FrameworkContracts,
  options: AppActionExecuteOptions,
  services: AppActionExecuteServices,
) {
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
