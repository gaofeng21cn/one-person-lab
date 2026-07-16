import {
  currentWorkerSourceVersion,
  processIsAlive,
  type TemporalWorkerState,
} from './worker-state.ts';
import {
  temporalForegroundWorkerCommand,
  temporalForegroundWorkerModulePathFromCommand,
} from './worker-process.ts';

export function expectedWorkerSourceVersionForState(
  state: TemporalWorkerState | null,
  providerModuleUrl: string,
) {
  if (!state || !processIsAlive(state.pid)) {
    return currentWorkerSourceVersion(providerModuleUrl);
  }
  const command = temporalForegroundWorkerCommand(state.pid);
  const workerModulePath = temporalForegroundWorkerModulePathFromCommand(command);
  return workerModulePath
    ? currentWorkerSourceVersion(new URL(workerModulePath, 'file://').href)
    : currentWorkerSourceVersion(providerModuleUrl);
}
