export type {
  FrontDeskEngineAction,
  FrontDeskEngineId,
  FrontDeskModuleAction,
  FrontDeskModuleId,
  FrontDeskSystemAction,
} from './system-installation/shared.ts';

export { buildFrontDeskEnvironment } from './system-installation/environment.ts';
export { runFrontDeskEngineAction } from './system-installation/engine-actions.ts';
export { buildFrontDeskInitialize } from './system-installation/initialize.ts';
export { buildFrontDeskModules, runFrontDeskModuleAction } from './system-installation/modules.ts';
export { runFrontDeskSystemAction } from './system-installation/system-actions.ts';
export { runFrontDeskTurnkeyInstall } from './system-installation/turnkey.ts';
export {
  buildFrontDeskWorkspaceRootSurface,
  writeFrontDeskWorkspaceRootSurface,
} from './system-installation/workspace-root.ts';
