import {
  buildOplWorkspaceRootStatus,
  writeOplWorkspaceRoot,
} from '../../../kernel/system-preferences.ts';

export function buildOplWorkspaceRootSurface() {
  return buildOplWorkspaceRootStatus();
}

export function writeOplWorkspaceRootSurface(workspaceRoot: string) {
  return {
    version: 'g2',
    workspace_root: writeOplWorkspaceRoot(workspaceRoot),
  };
}
