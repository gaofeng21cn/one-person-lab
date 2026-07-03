export const OPL_WORKSPACE_SOURCE_MODULE = {
  moduleId: 'workspace',
  brandName: 'OPL Workspace',
  contractRef: 'contracts/opl-framework/source-module-map.json#modules.workspace',
  physicalRoot: 'src/modules/workspace',
} as const;

// Public cross-module surface generated from existing module consumers.
export { buildAgentWorkspaceNormChecks, buildAgentWorkspaceNormProjection } from './agent-workspace-norm.ts';
export { validateAgentWorkspaceNorm } from './agent-workspace-norm-contract.ts';
export { resolveDefaultFamilyWorkspaceRoot, resolveFamilyWorkspaceRootFromRepoRoot } from './family-workspace-root.ts';
export { adoptWorkspace, doctorWorkspace, validateWorkspace } from './workspace-diagnostics.ts';
export { ensureWorkspace, initializeWorkspace } from './workspace-initializer.ts';
export { archiveWorkspaceProject, deleteWorkspaceProject, exportWorkspaceMap, inspectWorkspace, updateWorkspaceProjectLifecycle, upgradeWorkspace, workspaceFleetReport, workspaceHealth, workspaceInventory, workspaceReport } from './workspace-lifecycle.ts';
export { buildWorkspaceCatalog, getActiveWorkspaceBinding, resolveWorkspaceLocator } from './workspace-registry.ts';
export type { WorkspaceBinding } from './workspace-registry.ts';
