export const OPL_WORKSPACE_SOURCE_MODULE = {
  moduleId: 'workspace',
  brandName: 'OPL Workspace',
  contractRef: 'contracts/opl-framework/source-module-map.json#modules.workspace',
  physicalRoot: 'src/modules/workspace',
} as const;

// Public cross-module surface generated from existing module consumers.
export { buildEvidenceGroundedWorkspaceSubstrate } from './evidence-grounded-substrate.ts';
export { buildAgentWorkspaceNormChecks, buildAgentWorkspaceNormProjection } from './agent-workspace-norm.ts';
export { resolveDefaultFamilyWorkspaceRoot, resolveFamilyWorkspaceRootFromRepoRoot } from '../../kernel/family-workspace-root.ts';
export {
  adoptWorkspace,
  DEFAULT_WORKSPACE_DIAGNOSTIC_POLICY,
  doctorWorkspace,
  materializeFindings,
  validateWorkspace,
} from './workspace-diagnostics.ts';
export { ensureWorkspace, initializeWorkspace } from './workspace-initializer.ts';
export { archiveWorkspaceProject, deleteWorkspaceProject, exportWorkspaceMap, inspectWorkspace, updateWorkspaceProjectLifecycle, upgradeWorkspace, workspaceFleetReport, workspaceHealth, workspaceInventory, workspaceReport } from './workspace-lifecycle.ts';
export { ingestWorkspaceSourceMaterial } from './workspace-source-material.ts';
export {
  DEFAULT_DOMAIN_WORKSPACE_GITIGNORE_ENTRIES,
  ensureDomainWorkspaceGitBoundary,
  fingerprintDomainSource,
  materializeDomainSources,
  renderDomainWorkspaceGitignore,
} from './domain-source-runtime.ts';
export type { DomainSourceInput } from './domain-source-runtime.ts';
export { assertRepoSourceByproductsClean, inspectRepoSourceByproducts } from './repo-source-byproduct-guard.ts';
export { buildWorkspaceCatalog, getActiveWorkspaceBinding, inspectWorkspacePathCurrentness, listWorkspaceBindings, pruneWorkspaceRegistry, resolveWorkspaceLocator } from './workspace-registry.ts';
export type { WorkspaceBinding, WorkspacePathCurrentness } from './workspace-registry.ts';
export { WORKSPACE_TOPOLOGY_PROFILE_CONTRACT } from './workspace-topology.ts';
export {
  commitStandardAgentActionOutput,
  inspectStandardAgentActionRunOutput,
  prepareStandardAgentActionRunRequest,
  STANDARD_AGENT_ACTION_RUNS_RELATIVE_ROOT,
} from './standard-agent-action-output.ts';
export type {
  StandardAgentActionRunRequest,
  StandardAgentActionRunOutput,
  StandardAgentActionRunStoredBytes,
} from './standard-agent-action-output.ts';
