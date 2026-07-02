import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  DEFAULT_TEMPORAL_TASK_QUEUE,
} from '../family-runtime-temporal.ts';
import type { TemporalWorkerPaths } from '../family-runtime-temporal-client.ts';

export type TemporalWorkerTaskQueueSource =
  | 'explicit_env'
  | 'default_shared_state_root'
  | 'isolated_worker_root';

function normalize(value: string) {
  try {
    return fs.realpathSync(value);
  } catch {
    return path.resolve(value);
  }
}

function defaultSharedFamilyRuntimeRoot() {
  const home = process.env.HOME?.trim() || '';
  return home
    ? path.join(home, 'Library', 'Application Support', 'OPL', 'state', 'family-runtime')
    : null;
}

function isolatedTaskQueueForRoot(root: string) {
  const digest = crypto.createHash('sha256').update(normalize(root)).digest('hex');
  return `${DEFAULT_TEMPORAL_TASK_QUEUE}-isolated-${digest.slice(0, 12)}`;
}

export function resolveTemporalWorkerTaskQueueDetail(paths: TemporalWorkerPaths) {
  const explicit = process.env.OPL_TEMPORAL_TASK_QUEUE?.trim();
  const defaultSharedRoot = defaultSharedFamilyRuntimeRoot();
  const normalizedRoot = normalize(paths.root);
  const normalizedDefaultSharedRoot = defaultSharedRoot ? normalize(defaultSharedRoot) : null;
  const usesDefaultSharedStateRoot = Boolean(
    normalizedDefaultSharedRoot && normalizedRoot === normalizedDefaultSharedRoot,
  );
  if (explicit) {
    return {
      surface_kind: 'temporal_worker_task_queue_resolution',
      provider_kind: 'temporal',
      task_queue: explicit,
      task_queue_source: 'explicit_env' as const,
      worker_root: normalizedRoot,
      default_shared_state_root: normalizedDefaultSharedRoot,
      uses_default_shared_state_root: usesDefaultSharedStateRoot,
    };
  }
  if (usesDefaultSharedStateRoot) {
    return {
      surface_kind: 'temporal_worker_task_queue_resolution',
      provider_kind: 'temporal',
      task_queue: DEFAULT_TEMPORAL_TASK_QUEUE,
      task_queue_source: 'default_shared_state_root' as const,
      worker_root: normalizedRoot,
      default_shared_state_root: normalizedDefaultSharedRoot,
      uses_default_shared_state_root: true,
    };
  }
  return {
    surface_kind: 'temporal_worker_task_queue_resolution',
    provider_kind: 'temporal',
    task_queue: isolatedTaskQueueForRoot(normalizedRoot),
    task_queue_source: 'isolated_worker_root' as const,
    worker_root: normalizedRoot,
    default_shared_state_root: normalizedDefaultSharedRoot,
    uses_default_shared_state_root: false,
  };
}

export function resolveTemporalWorkerTaskQueue(paths: TemporalWorkerPaths) {
  return resolveTemporalWorkerTaskQueueDetail(paths).task_queue;
}
