export const OPL_CONNECT_SOURCE_MODULE = {
  moduleId: 'connect',
  brandName: 'OPL Connect',
  contractRef: 'contracts/opl-framework/source-module-map.json#modules.connect',
  physicalRoot: 'src/modules/connect',
} as const;


// Public cross-module surface generated from existing module consumers.
export { DeveloperModeCloseoutReceipt, listDeveloperModeCloseoutReceipts } from './developer-mode-closeout-ledger.ts';
export { LocalCodexDefaults, readBundledCodexDefaultProfile, readLocalCodexAccessState, readLocalCodexDefaultsIfAvailable } from './local-codex-defaults.ts';
export { listManagedInstallUpdateReceipts } from './managed-install-update-ledger.ts';
export { buildManagedShellCommandEnv, buildManagedShellEnvWithUvCacheRecovery, buildManagedShellRecoveryTmpRoot, prepareManagedShellCommandCwd, recordManagedShellUvCacheRecovery } from './managed-shell-command-env.ts';
export { buildOplReleaseTag, getOplReleaseRepo, getOplReleaseVersion } from './opl-release.ts';
export { resolveDefaultFamilyWorkspaceRoot, syncFamilySkillPacks } from './opl-skills.ts';
export { canonicalOwnerId } from './owner-id.ts';
export { buildOplDeveloperModeSurface } from './system-installation/developer-mode.ts';
export { buildOplDockerWebuiDoctor } from './system-installation/docker-webui-doctor.ts';
export { runOplEngineAction } from './system-installation/engine-actions.ts';
export { resolveCodexVersion } from './system-installation/engine-helpers.ts';
export { buildOplModules, resolveOplModuleExecCommand, runOplModuleAction } from './system-installation/modules.ts';
export { ModuleInspection, OplEngineAction, OplModuleAction, OplModuleId } from './system-installation/shared.ts';
export { runOplSystemAction } from './system-installation/system-actions.ts';
export { runOplTurnkeyInstall } from './system-installation/turnkey.ts';
export { writeOplWorkspaceRootSurface } from './system-installation/workspace-root.ts';
