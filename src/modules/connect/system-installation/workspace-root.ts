import {
  buildOplWorkspaceRootStatus,
  writeOplWorkspaceRoot,
} from '../../console/index.ts';

export function buildOplWorkspaceRootSurface() {
  return buildOplWorkspaceRootStatus();
}

export function writeOplWorkspaceRootSurface(workspaceRoot: string) {
  return {
    version: 'g2',
    workspace_root: writeOplWorkspaceRoot(workspaceRoot),
  };
}
