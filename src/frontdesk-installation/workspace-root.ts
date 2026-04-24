import {
  buildFrontDeskWorkspaceRootStatus,
  writeFrontDeskWorkspaceRoot,
} from '../frontdesk-preferences.ts';

export function buildFrontDeskWorkspaceRootSurface() {
  return buildFrontDeskWorkspaceRootStatus();
}

export function writeFrontDeskWorkspaceRootSurface(workspaceRoot: string) {
  return {
    version: 'g2',
    workspace_root: writeFrontDeskWorkspaceRoot(workspaceRoot),
  };
}
