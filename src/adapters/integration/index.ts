import { registerAgentPackageReadinessPort } from '../../kernel/agent-package-readiness-port.ts';
import type { FrameworkContracts } from '../../kernel/types.ts';
import { runOplAgentPackageBulkUpdate, runOplAgentPackageStatus } from './agent-package-registry.ts';
import {
  runManagedUpdateKernelOperation as runManagedUpdateKernelOperationWithOwners,
} from './managed-update-kernel-runner.ts';
import type { ManagedUpdateKernelInput } from './managed-update-owner-boundary.ts';
import { resolveAgentPackageEffectiveSourcePolicy } from './agent-package-registry-parts/source-policy.ts';
import { refreshInstalledAgentPackageWorkspaceSkills } from './agent-package-registry-parts/skill-projection.ts';
import { discoverInstalledPackageDescriptors } from './agent-package-registry-parts/installed-codex-plugin-directory.ts';
import {
  readInstalledStandardAgentDescriptorForPackage,
  readPackageManagedStandardAgentDescriptor,
  readStandardAgentDescriptorForDomain,
  resolveStandardAgentContractCheckout,
  standardAgentProgressDeltaKeySet,
} from './standard-agent-interface-discovery.ts';

registerAgentPackageReadinessPort({
  readStatus: runOplAgentPackageStatus,
  readSourcePolicy: resolveAgentPackageEffectiveSourcePolicy,
  refreshWorkspaceSkills(input) {
    return refreshInstalledAgentPackageWorkspaceSkills({
      ...input,
      descriptorDiscovery: { discover: discoverInstalledPackageDescriptors },
    });
  },
  readInstalledStandardAgentDescriptorForPackage,
  readPackageManagedStandardAgentDescriptor,
  readStandardAgentDescriptorForDomain,
  resolveStandardAgentContractCheckout: (domainId) => resolveStandardAgentContractCheckout(
    domainId,
    undefined,
    undefined,
    { result: 'typed_resolution' },
  ),
  standardAgentProgressDeltaKeySet,
});

export function runManagedUpdateKernelOperation(
  contracts: FrameworkContracts,
  input: ManagedUpdateKernelInput,
) {
  return runManagedUpdateKernelOperationWithOwners(contracts, input, {
    runAgentPackageBulkUpdate: runOplAgentPackageBulkUpdate,
  });
}

export {
  createOplConnection,
  deleteOplConnection,
  listOplConnections,
  setDefaultOplConnection,
  testOplConnection,
  updateOplConnection,
} from './connection-registry.ts';
export type { CordisConnectDescriptorDiscoveryService } from './public/descriptor-discovery.ts';
export { loadInstalledChannelProviders } from './public/channel-provider-entrypoints.ts';
export {
  loadInstalledRemoteCompanionConnectors,
} from './public/remote-companion-connector-entrypoints.ts';
export {
  admitReleaseBundleOperation,
  buildReleaseBundle,
  buildReleaseBundleConsumerEnvelope,
  exportReleaseBundleCheckpoint,
  freezeReleaseBundle,
  importReleaseBundleCheckpoint,
  publishReleaseBundle,
  readReleaseBundleEvents,
  readReleaseBundleStatus,
  reconcileReleaseBundle,
  verifyReleaseBundle,
} from './release-bundle/index.ts';
export { assertCredentialHandleOnlyPayload } from './connection-registry-parts/credential-handle.ts';
export {
  completeOplGatewaySetup,
  disconnectOplGatewayAccount,
  refreshOplGatewayAccount,
  repairOplGatewayAccount,
  useOplGatewayForModelAccess,
} from './opl-gateway-account.ts';

// Public cross-module surface generated from existing module consumers.
export { buildEvidenceGroundedConnectSubstrate } from './evidence-grounded-substrate.ts';
export {
  buildCapabilityRegistryReadout,
} from './capability-registry-resolver.ts';
export type {
  CapabilityHardBoundary,
  CapabilityRegistryReadout,
  CapabilityRegistryResolution,
  CurrentOwnerDeltaCapabilityBinding,
  CurrentOwnerDeltaCapabilityRequirement,
} from './capability-registry-resolver.ts';
export {
  listOplAgentPackages,
  readOplFlowDefaultUserInstructions,
  runOplAgentPackageExposureAction,
  runOplAgentPackageFrameworkLink,
  runOplAgentPackageHomeShortcutPreferencesSet,
  runOplAgentPackageInstall,
  runOplAgentPackageRepair,
  runOplAgentPackageStatus,
  runOplAgentPackageUninstall,
  runOplAgentPackageUpdate,
} from './agent-package-registry.ts';
export type {
  AgentPackageHomeShortcutPreferencesSetInput,
  AgentPackageInstallInput,
  AgentPackagePackageActionInput,
  AgentPackageRepairInput,
} from './agent-package-registry.ts';
export {
  refreshInstalledAgentPackageWorkspaceSkills,
} from './agent-package-registry-parts/skill-projection.ts';
export {
  readStandardAgentDescriptorForDomain,
  resolveStandardAgentContractCheckout,
  standardAgentProgressDeltaKeySet,
} from './standard-agent-interface-discovery.ts';
export type {
  StandardAgentProgressDeltaKeySet,
} from './standard-agent-interface-discovery.ts';
export { canonicalAgentPackageId } from './agent-package-identity.ts';
export {
  agentPackageDelegatedSurface,
  listAgentPackageSettingsActions,
} from './agent-package-actions.ts';
export {
  discoverInstalledPackageDescriptors,
  installedDescriptorHasExpectedCodexExposure,
  installedDescriptorSupportsFrameworkCalls,
} from './agent-package-registry-parts/installed-codex-plugin-directory.ts';
export type {
  InstalledPackageDescriptor,
} from './agent-package-registry-parts/installed-codex-plugin-directory.ts';
export type { LocalCodexDefaults } from '../../kernel/local-codex-defaults.ts';
export { MANAGED_UPDATE_OWNER_ACTIONS, managedUpdateCommand } from './managed-update-owner-boundary.ts';
export { buildManagedUpdateKernelProjection } from './managed-update-kernel.ts';
export {
  listExternalOwnerDelegatedUpdateActions,
  runExternalOwnerDelegatedUpdate,
} from './external-dependency-currentness.ts';
export { buildManagedShellCommandEnv, prepareManagedShellCommandCwd } from '../../kernel/managed-shell-command-env.ts';
export { buildOplDockerWebuiDoctor } from './system-installation/docker-webui-doctor.ts';
export {
  buildManagedComputerUseActionCatalog,
  createManagedComputerUseProvider,
  inspectManagedComputerUse,
  MANAGED_COMPUTER_USE_ACTION_IDS,
  reconcileManagedComputerUse,
} from './managed-computer-use.ts';
export type {
  ManagedComputerUseActionId,
} from './managed-computer-use.ts';
export {
  buildManagedBrowserAutomationActionCatalog,
  createManagedBrowserAutomationProvider,
  inspectManagedBrowserAutomation,
  MANAGED_BROWSER_AUTOMATION_ACTION_IDS,
  reconcileManagedBrowserAutomation,
} from './managed-browser-automation.ts';
export type {
  ManagedBrowserAutomationActionId,
} from './managed-browser-automation.ts';
export { runOplEngineAction } from './system-installation/engine-actions.ts';
export {
  buildOplModules,
  resolveOplDomainModuleSpec,
  runOplModuleAction,
} from './system-installation/modules.ts';
export type { OplEngineAction, OplModuleAction, OplModuleId } from './system-installation/shared.ts';
export { runOplSystemAction } from './system-installation/system-actions.ts';
export { runOplTurnkeyInstall } from './system-installation/turnkey.ts';
export { writeOplWorkspaceRootSurface } from './system-installation/workspace-root.ts';
export {
  buildAgentPackageStoreStorageInventory,
  buildWebuiDataVolumeStorageInventory,
} from './storage-owner-inventory.ts';
export {
  agentPackageStorageNavigationAction,
  compactStorageOwnerInventorySnapshot,
  webuiHostActionRequired,
} from './storage-owner-inventory-snapshot.ts';
