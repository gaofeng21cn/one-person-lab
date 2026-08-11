import { registerAgentPackageReadinessPort } from '../../kernel/agent-package-readiness-port.ts';
import { runOplAgentPackageStatus } from './agent-package-registry.ts';
import { resolveAgentPackageEffectiveSourcePolicy } from './agent-package-registry-parts/source-policy.ts';
import { refreshInstalledAgentPackageWorkspaceSkills } from './agent-package-registry-parts/skill-projection.ts';

registerAgentPackageReadinessPort({
  readStatus: runOplAgentPackageStatus,
  readSourcePolicy: resolveAgentPackageEffectiveSourcePolicy,
  refreshWorkspaceSkills: refreshInstalledAgentPackageWorkspaceSkills,
});

export const OPL_CONNECT_SOURCE_MODULE = {
  moduleId: 'connect',
  brandName: 'OPL Connect',
  contractRef: 'contracts/opl-framework/source-module-map.json#modules.connect',
  physicalRoot: 'src/modules/connect',
} as const;

export {
  createOplConnection,
  deleteOplConnection,
  listOplConnections,
  setDefaultOplConnection,
  testOplConnection,
  updateOplConnection,
} from './connection-registry.ts';
export type {
  CreateOplConnectionInput,
  OplConnection,
  OplConnectionStatus,
  UpdateOplConnectionInput,
} from './connection-registry.ts';
export { assertCredentialHandleOnlyPayload } from './connection-registry-parts/credential-handle.ts';
export {
  completeOplGatewaySetup,
  disconnectOplGatewayAccount,
  loginOplGatewayAccount,
  readOplGatewayAccount,
  refreshOplGatewayAccount,
  repairOplGatewayAccount,
  useOplGatewayForModelAccess,
} from './opl-gateway-account.ts';

// Public cross-module surface generated from existing module consumers.
export { buildEvidenceGroundedConnectSubstrate } from './evidence-grounded-substrate.ts';
export {
  buildCapabilityRegistryReadout,
  resolveCapabilityForCurrentDelta,
} from './capability-registry-resolver.ts';
export type {
  CapabilityBindingKind,
  CapabilityHardBoundary,
  CapabilityRegistryCatalog,
  CapabilityRegistryEntry,
  CapabilityRegistryReadout,
  CapabilityRegistryResolution,
  CurrentOwnerDeltaCapabilityBinding,
  CurrentOwnerDeltaCapabilityRequirement,
} from './capability-registry-resolver.ts';
export {
  listOplAgentPackages,
  readOplFlowDefaultUserInstructions,
  readOplFlowManagedDependencyIds,
  runOplAgentPackageExposureAction,
  runOplAgentPackageFrameworkLink,
  runOplAgentPackageHomeShortcutPreferencesSet,
  runOplAgentPackageInstall,
  runOplAgentPackageRepair,
  runOplAgentPackageStatus,
  runOplAgentPackageActivate,
  runOplAgentPackageUninstall,
  runOplAgentPackageUpdate,
} from './agent-package-registry.ts';
export type {
  AgentPackageHomeShortcutPreferencesSetInput,
  AgentPackageInstallInput,
  AgentPackageManifestValidateInput,
  AgentPackagePackageActionInput,
  AgentPackageRepairInput,
} from './agent-package-registry.ts';
export {
  agentPackageSkillProjectionFromUnknown,
  assertAgentPackageSkillProjection,
  materializeAgentPackageWorkspaceSkillProjection,
  projectionFiles,
  refreshInstalledAgentPackageWorkspaceSkills,
} from './agent-package-registry-parts/skill-projection.ts';
export type {
  AgentPackageSkillProjection,
  AgentPackageWorkspaceSkillRefresh,
} from './agent-package-registry-parts/types.ts';
export {
  readInstalledStandardAgentDescriptorForPackage,
  readPackageManagedStandardAgentDescriptor,
  readStandardAgentDescriptorForDomain,
  resolveStandardAgentContractCheckout,
  standardAgentProgressDeltaKeySet,
  standardAgentProgressDeltaKeys,
} from './standard-agent-interface-discovery.ts';
export type {
  StandardAgentContractCheckout,
  StandardAgentProgressDeltaKeySet,
} from './standard-agent-interface-discovery.ts';
export {
  inspectStandardAgentFrameworkImports,
  materializeStandardAgentFrameworkLink,
} from './standard-agent-framework-link.ts';
export { canonicalAgentPackageId } from './agent-package-identity.ts';
export {
  agentPackageDelegatedSurface,
  listAgentPackageSettingsActions,
} from './agent-package-actions.ts';
export {
  discoverInstalledPackageDescriptors,
} from './agent-package-registry-parts/installed-codex-plugin-directory.ts';
export type {
  InstalledPackageDescriptor,
  InstalledPackageCarrierReadback,
  InstalledPackageReadiness,
} from './agent-package-registry-parts/installed-codex-plugin-directory.ts';
export { readBundledCodexDefaultProfile, readLocalCodexAccessState, readLocalCodexDefaultsIfAvailable } from '../../kernel/local-codex-defaults.ts';
export type { LocalCodexDefaults } from '../../kernel/local-codex-defaults.ts';
export { listManagedInstallUpdateReceipts } from './managed-install-update-ledger.ts';
export { MANAGED_UPDATE_OWNER_ACTIONS, managedUpdateCommand } from './managed-update-owner-boundary.ts';
export { buildManagedUpdateKernelProjection } from './managed-update-kernel.ts';
export { runManagedUpdateKernelOperation } from './managed-update-kernel-runner.ts';
export {
  listExternalOwnerDelegatedUpdateActions,
  runExternalOwnerDelegatedUpdate,
} from './external-dependency-currentness.ts';
export { buildManagedShellCommandEnv, prepareManagedShellCommandCwd } from '../../kernel/managed-shell-command-env.ts';
export { buildOplReleaseTag, getOplReleaseRepo, getOplReleaseVersion } from './opl-release.ts';
export { resolveDefaultFamilyWorkspaceRoot, syncFamilySkillPacks } from './opl-skills.ts';
export { canonicalOwnerId } from './owner-id.ts';
export { parseGithubRepoFromUrl } from './developer-mode-source-policy.ts';
export {
  buildScientificConnectorProviderRegistryReadback,
  runOplConnectScientificSearch,
  scientificConnectorProviderIds,
} from './opl-connect-scientific.ts';
export type {
  ScientificConnectorProviderId,
  ScientificConnectorSearchInput,
} from './opl-connect-scientific.ts';
export { buildOplDeveloperModeSurface } from './system-installation/developer-mode.ts';
export { buildOplDockerWebuiDoctor } from './system-installation/docker-webui-doctor.ts';
export {
  buildManagedComputerUseActionCatalog,
  inspectManagedComputerUse,
  MANAGED_COMPUTER_USE_ACTION_IDS,
  readManagedComputerUseLock,
  reconcileManagedComputerUse,
} from './managed-computer-use.ts';
export type {
  ManagedComputerUseActionId,
  ManagedComputerUseInspection,
  ManagedComputerUseLock,
} from './managed-computer-use.ts';
export { registerOplManagedMcpServer } from './system-installation/codex-plugin-registry.ts';
export { runOplEngineAction } from './system-installation/engine-actions.ts';
export { resolveCodexVersion } from './system-installation/engine-helpers.ts';
export {
  buildOplModules,
  inspectOplModule,
  listDefaultOplDomainModuleSpecs,
  resolveOplDomainModuleSpec,
  resolveOplModuleExecCommand,
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
  compactStorageOwnerProjection,
  readStorageOwnerInventorySnapshot,
  webuiHostActionRequired,
} from './storage-owner-inventory-snapshot.ts';
