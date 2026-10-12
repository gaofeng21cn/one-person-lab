import path from 'node:path';
import { resolveOplStatePaths } from '../../kernel/runtime-state-paths.ts';
import { resolveTemporalWorkerTaskQueue } from './family-runtime-temporal-provider-parts/worker-task-queue.ts';

export const OPL_PACKAGED_LOCAL_TEMPORAL_ADDRESS = '127.0.0.1:7233';
export const OPL_PACKAGED_LOCAL_TEMPORAL_ADDRESS_SOURCE = 'packaged_local_default';

export function resolveTemporalAddressProvenance(env: NodeJS.ProcessEnv = process.env) {
  const oplAddress = env.OPL_TEMPORAL_ADDRESS?.trim() || null;
  const fallbackAddress = env.TEMPORAL_ADDRESS?.trim() || null;
  const source = env.OPL_TEMPORAL_ADDRESS_SOURCE?.trim() || null;
  return {
    address: oplAddress ?? fallbackAddress,
    source,
    managed_packaged_local_default:
      oplAddress === OPL_PACKAGED_LOCAL_TEMPORAL_ADDRESS
      && source === OPL_PACKAGED_LOCAL_TEMPORAL_ADDRESS_SOURCE
      && fallbackAddress === null,
  };
}

export function resolveTemporalAddress(env: NodeJS.ProcessEnv = process.env) {
  return resolveTemporalAddressProvenance(env).address;
}

export function resolveTemporalNamespace() {
  return process.env.OPL_TEMPORAL_NAMESPACE?.trim() || 'default';
}

export function resolveTemporalTaskQueue(paths?: { root: string }) {
  return resolveTemporalWorkerTaskQueue(paths ?? {
    root: path.join(resolveOplStatePaths().state_dir, 'family-runtime'),
  });
}
