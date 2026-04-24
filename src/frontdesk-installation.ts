export type {
  FrontDeskEngineAction,
  FrontDeskEngineId,
  FrontDeskModuleAction,
  FrontDeskModuleId,
  FrontDeskSystemAction,
} from './frontdesk-installation/shared.ts';

export { buildFrontDeskEnvironment } from './frontdesk-installation/environment.ts';
export { runFrontDeskEngineAction } from './frontdesk-installation/engine-actions.ts';
export { buildFrontDeskInitialize } from './frontdesk-installation/initialize.ts';
export { buildFrontDeskModules, runFrontDeskModuleAction } from './frontdesk-installation/modules.ts';
export { runFrontDeskSystemAction } from './frontdesk-installation/system-actions.ts';
export {
  buildFrontDeskWorkspaceRootSurface,
  writeFrontDeskWorkspaceRootSurface,
} from './frontdesk-installation/workspace-root.ts';
