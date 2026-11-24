import {
  createOplAgentPackageStatusReader,
  listOplAgentPackages,
  runOplAgentPackageStatus,
} from './agent-package-registry/registry-status-projection.ts';
import {
  runOplAgentPackageBulkUpdate,
  runOplAgentPackageExposureAction,
  runOplAgentPackageFrameworkLink,
  runOplAgentPackageHomeShortcutPreferencesSet,
  runOplAgentPackageInstall,
  runOplAgentPackageRepair,
  runOplAgentPackageUninstall,
  runOplAgentPackageUpdate,
} from './agent-package-registry/registry-lifecycle-actions.ts';
import {
  readOplFlowDefaultUserInstructions,
  readOplFlowManagedDependencies,
  readOplFlowManagedDependencyIds,
  readOplFlowManagedPolicyDependencies,
} from './agent-package-registry/registry-flow-policy.ts';

export type {
  OplAgentPackageStatusInput,
} from './agent-package-registry/registry-status-projection.ts';
export type {
  AgentPackageHomeShortcutPreferencesSetInput,
  AgentPackageInstallInput,
  AgentPackagePackageActionInput,
  AgentPackageRepairInput,
} from './agent-package-registry/types.ts';

export {
  createOplAgentPackageStatusReader,
  listOplAgentPackages,
  readOplFlowDefaultUserInstructions,
  readOplFlowManagedDependencies,
  readOplFlowManagedDependencyIds,
  readOplFlowManagedPolicyDependencies,
  runOplAgentPackageBulkUpdate,
  runOplAgentPackageExposureAction,
  runOplAgentPackageFrameworkLink,
  runOplAgentPackageHomeShortcutPreferencesSet,
  runOplAgentPackageInstall,
  runOplAgentPackageRepair,
  runOplAgentPackageStatus,
  runOplAgentPackageUninstall,
  runOplAgentPackageUpdate,
};
