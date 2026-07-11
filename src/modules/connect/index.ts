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
  runOplAgentPackageExposureAction,
  runOplAgentPackageFrameworkLink,
  runOplAgentPackageHomeShortcutPreferencesSet,
  runOplAgentPackageInstall,
  runOplAgentPackageManifestValidate,
  runOplAgentPackageRegistryRefresh,
  runOplAgentPackageRepair,
  runOplAgentPackageStatus,
  runOplAgentPackageUninstall,
  runOplAgentPackageUpdate,
} from './agent-package-registry.ts';
export type {
  AgentPackageHomeShortcutPreferencesSetInput,
  AgentPackageInstallInput,
  AgentPackageManifestValidateInput,
  AgentPackagePackageActionInput,
} from './agent-package-registry.ts';
export {
  agentPackageDelegatedSurface,
  listAgentPackageSettingsActions,
} from './agent-package-actions.ts';
export { readBundledCodexDefaultProfile, readLocalCodexAccessState, readLocalCodexDefaultsIfAvailable } from '../../kernel/local-codex-defaults.ts';
export type { LocalCodexDefaults } from '../../kernel/local-codex-defaults.ts';
export { listManagedInstallUpdateReceipts } from './managed-install-update-ledger.ts';
export { MANAGED_UPDATE_OWNER_ACTIONS, managedUpdateCommand } from './managed-update-owner-boundary.ts';
export { buildManagedUpdateKernelProjection } from './managed-update-kernel.ts';
export { runManagedUpdateKernelOperation } from './managed-update-kernel-runner.ts';
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
export { runOplFlowIntelligenceEnhancementAction } from './codexcont-intelligence-mode.ts';
export { buildOplDeveloperModeSurface } from './system-installation/developer-mode.ts';
export { buildOplDockerWebuiDoctor } from './system-installation/docker-webui-doctor.ts';
export { runOplEngineAction } from './system-installation/engine-actions.ts';
export { resolveCodexVersion } from './system-installation/engine-helpers.ts';
export {
  buildOplModules,
  listDefaultOplDomainModuleSpecs,
  resolveOplDomainModuleSpec,
  resolveOplModuleExecCommand,
  runOplModuleAction,
} from './system-installation/modules.ts';
export type { OplEngineAction, OplModuleAction, OplModuleId } from './system-installation/shared.ts';
export { runOplSystemAction } from './system-installation/system-actions.ts';
export { runOplTurnkeyInstall } from './system-installation/turnkey.ts';
export { writeOplWorkspaceRootSurface } from './system-installation/workspace-root.ts';
