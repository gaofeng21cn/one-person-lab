// Public cross-module surface generated from existing module consumers.
export { buildEvidenceGroundedWorkspaceSubstrate } from './evidence-grounded-substrate.ts';
export { resolveDefaultFamilyWorkspaceRoot, resolveFamilyWorkspaceRootFromRepoRoot } from '../../kernel/family-workspace-root.ts';
export {
  adoptWorkspace,
  DEFAULT_WORKSPACE_DIAGNOSTIC_POLICY,
  doctorWorkspace,
  materializeFindings,
  validateWorkspace,
} from './workspace-diagnostics.ts';
export {
  ensureWorkspace,
  initializeWorkspace,
  type WorkspaceSkillProjectionRefresher,
} from './workspace-initializer.ts';
export { archiveWorkspaceProject, deleteWorkspaceProject, exportWorkspaceMap, inspectWorkspace, updateWorkspaceProjectLifecycle, upgradeWorkspace, workspaceFleetReport, workspaceHealth, workspaceInventory, workspaceReport } from './workspace-lifecycle.ts';
import {
  buildWorkspaceCatalog,
  inspectWorkspacePathCurrentness,
  pruneWorkspaceRegistry,
  getActiveWorkspaceBinding,
  resolveWorkspaceLocator,
} from './workspace-registry.ts';
export {
  buildWorkspaceCatalog,
  inspectWorkspacePathCurrentness,
  pruneWorkspaceRegistry,
};
export { getActiveWorkspaceBinding, listWorkspaceBindings, resolveWorkspaceLocator } from './workspace-registry.ts';
export type {
  WorkspaceBinding,
  WorkspaceLocator,
  WorkspaceLocatorService,
} from './workspace-registry.ts';
export type {
  WorkspaceLocator as CordisWorkspaceLocator,
  WorkspaceLocatorService as CordisWorkspaceLocatorService,
} from './workspace-registry.ts';
export {
  createWorkItemExecutionScopeSnapshot,
  executionScopeEnvironment,
  requireWorkItemExecutionScopeSnapshot,
} from './execution-scope.ts';
export type {
  WorkItemExecutionScopeSnapshot,
} from './execution-scope.ts';
export {
  captureWorkItemRootIdentity,
  attestWorkItemRootIdentity,
  reattestWorkItemRootIdentity,
  workItemRootIdentityContinues,
  readStableWorkItemFile,
  requireWorkItemRootIdentity,
  WorkItemFileBoundaryError,
} from './work-item-file-boundary.ts';
export type {
  WorkItemRootIdentity,
  WorkItemRootIdentityContinuation,
} from './work-item-file-boundary.ts';
export * from './agent-default-caller-delete-read-model.ts';
export * from './agent-platform-surface-ownership.ts';
export {
  DEFAULT_CALLER_OWNER_DECISION_ACCEPTED_RESULT_SHAPES,
  DEFAULT_CALLER_PRIVATE_PLATFORM_CLEANUP_ALLOWED_DISPOSITIONS,
  DEFAULT_CALLER_PRIVATE_PLATFORM_CLEANUP_LANE_ID,
  DEFAULT_CALLER_PRIVATE_PLATFORM_RESIDUE_TARGET_KINDS,
  DEFAULT_CALLER_RETIREMENT_MANDATORY_GATE_IDS,
  DEFAULT_CALLER_RETIREMENT_NON_AUTHORIZING_SURFACES,
  DEFAULT_CALLER_RETIREMENT_TARGET_CLASSES,
  DEFAULT_CALLER_SAME_WORK_UNIT_LIVE_EVIDENCE_SCOPE,
  DEFAULT_CALLER_STATIC_RETIREMENT_PREREQUISITE_GATE_IDS,
  aggregateDefaultCallerOwnerDecisionResultShape,
  buildDefaultCallerOwnerDecisionReadModel,
} from '../../kernel/default-caller-retirement-guard.ts';
export type {
  DefaultCallerPrivatePlatformCleanupDisposition,
  DefaultCallerPrivatePlatformResidueTargetKind,
} from '../../kernel/default-caller-retirement-guard.ts';
export {
  defaultCallerSurfaceGates,
} from '../../kernel/default-caller-surface-gates.ts';
export * from './domain-private-platform-tail-matrix.ts';
export * from './family-agent-conformance-probe.ts';
export * from './family-domain-agent-skeleton.ts';
export * from './standard-agent-check.ts';
export * from './standard-agent-source-closure.ts';
export * from './standard-domain-agent-conformance.ts';
export * from './standard-domain-agent-source-behavior.ts';
