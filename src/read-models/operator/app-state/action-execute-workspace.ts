import {
  refreshInstalledAgentPackageWorkspaceSkills,
  type CordisConnectDescriptorDiscoveryService,
} from '../../../adapters/integration/index.ts';
import type { FrameworkContracts } from '../../../kernel/types.ts';
import { executeWorkspaceAppAction as runWorkspaceAppAction } from '../app-state-workspace-actions.ts';
import { settingsVerifyWorkspacePayload } from './action-execute-payloads.ts';
import { buildSettingsControlCenterDryRun } from './action-execute-previews.ts';
import type { AppActionExecuteOptions } from './action-execute-parser.ts';

type DescriptorDiscovery = Pick<CordisConnectDescriptorDiscoveryService, 'discover'>;

function refreshWorkspaceSkills(
  descriptorDiscovery: DescriptorDiscovery,
  input: Omit<Parameters<typeof refreshInstalledAgentPackageWorkspaceSkills>[0], 'descriptorDiscovery'>,
) {
  return refreshInstalledAgentPackageWorkspaceSkills({
    ...input,
    descriptorDiscovery,
  });
}

export function executeWorkspaceVerificationAppAction(
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

export function executeWorkspaceAppAction(
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
