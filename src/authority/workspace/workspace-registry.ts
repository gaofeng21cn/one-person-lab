import { resolveWorkspaceLocator as resolveWorkspaceLocatorImpl } from './workspace-registry/lifecycle.ts';
import type { WorkspaceBinding } from './workspace-registry/types.ts';

export type {
  WorkspaceBinding,
  WorkspaceCatalogAction,
  WorkspacePathCurrentness,
} from './workspace-registry/types.ts';

export {
  inspectWorkspacePathCurrentness,
  pruneWorkspaceRegistry,
} from './workspace-registry/maintenance.ts';
export { buildWorkspaceCatalog } from './workspace-registry/catalog.ts';
export {
  activateWorkspaceBinding,
  archiveWorkspaceBinding,
  bindWorkspace,
  getActiveWorkspaceBinding,
  listWorkspaceBindings,
  preflightWorkspaceProjectScope,
  resolveWorkspaceBinding,
} from './workspace-registry/lifecycle.ts';

export function resolveWorkspaceLocator(projectId: string, explicitWorkspacePath?: string) {
  return resolveWorkspaceLocatorImpl(projectId, explicitWorkspacePath);
}

export type WorkspaceLocator = ReturnType<typeof resolveWorkspaceLocator>;

export type WorkspaceLocatorService = {
  resolve(projectId: string, explicitWorkspacePath?: string): WorkspaceLocator;
  active(projectId: string): WorkspaceBinding | null;
  list(): WorkspaceBinding[];
};
