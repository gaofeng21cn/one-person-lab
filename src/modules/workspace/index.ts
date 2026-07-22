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
export {
  assertRepoSourceByproductsClean,
  fixRepoSourceByproducts,
  inspectRepoSourceByproducts,
} from './repo-source-byproduct-guard.ts';
export { buildWorkspaceCatalog, getActiveWorkspaceBinding, inspectWorkspacePathCurrentness, listWorkspaceBindings, pruneWorkspaceRegistry, resolveWorkspaceLocator } from './workspace-registry.ts';
export type { WorkspaceBinding, WorkspacePathCurrentness } from './workspace-registry.ts';
export {
  assertSameExecutionScope,
  createProjectScopeId,
  createWorkItemExecutionScopeSnapshot,
  deriveLegacyProjectScopeId,
  deriveWorkItemScopeId,
  executionScopeEnvironment,
  EXECUTION_SCOPE_SNAPSHOT_VERSION,
  executionScopeSnapshotVersion,
  LEGACY_EXECUTION_SCOPE_SNAPSHOT_VERSION,
  requireLegacyWorkItemExecutionScopeSnapshot,
  requireWorkItemExecutionScopeSnapshot,
  resolveWorkItemIdentity,
  WORK_ITEM_IDENTITY_ALIAS_FIELDS,
} from './execution-scope.ts';
export type {
  ExecutionScopeKind,
  ExecutionScopeRequirement,
  LegacyWorkItemExecutionScopeSnapshot,
  NonWorkItemExecutionScopeRequirement,
  ResolvedWorkItemIdentity,
  WorkItemExecutionScopeRequirement,
  WorkItemExecutionScopeSnapshot,
} from './execution-scope.ts';
export { WORKSPACE_TOPOLOGY_PROFILE_CONTRACT } from './workspace-topology.ts';
export { resolveWorkItemInventoryBinding } from './work-item-inventory-binding.ts';
export {
  captureWorkItemRootIdentity,
  readStableWorkItemFile,
  requireWorkItemRootIdentity,
  WORK_ITEM_ROOT_IDENTITY_VERSION,
  WorkItemFileBoundaryError,
} from './work-item-file-boundary.ts';
export type {
  StableWorkItemFileObservation,
  WorkItemFileBoundaryFailureCode,
  WorkItemRootIdentity,
} from './work-item-file-boundary.ts';
export {
  commitStandardAgentActionOutput,
  inspectStandardAgentActionRunOutput,
  inspectStoredStandardAgentActionRunOutput,
  prepareStandardAgentActionRunRequest,
  STANDARD_AGENT_ACTION_RUNS_RELATIVE_ROOT,
} from './standard-agent-action-output.ts';
export type {
  StandardAgentActionRunRequest,
  StandardAgentActionRunOutput,
  StandardAgentActionRunStoredBytes,
} from './standard-agent-action-output.ts';
export * from './agent-default-caller-delete-read-model.ts';
export * from './agent-platform-surface-ownership.ts';
export * from './default-caller-retirement-guard.ts';
export * from './default-caller-surface-gates.ts';
export * from './domain-private-platform-tail-matrix.ts';
export * from './family-agent-conformance-probe.ts';
export * from './family-domain-agent-skeleton.ts';
export * from './standard-agent-check.ts';
export * from './standard-agent-source-closure.ts';
export * from './standard-domain-agent-conformance.ts';
export * from './standard-domain-agent-source-behavior.ts';
