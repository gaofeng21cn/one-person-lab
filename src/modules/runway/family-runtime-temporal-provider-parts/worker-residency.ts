import type { TemporalWorkerPaths } from '../family-runtime-temporal-client.ts';
import {
  temporalWorkerLogRefs,
  writeTemporalWorkerExitState,
  writeTemporalWorkerState,
  type TemporalWorkerState,
} from './worker-state.ts';

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export type TemporalResidentWorkerLoopInput = {
  paths: TemporalWorkerPaths;
  baseState: Omit<TemporalWorkerState, 'status'>;
  runWorkerOnce: () => Promise<void>;
  isShutdownRequested: () => boolean;
  restartDelayMs?: number;
};

export function buildTemporalWorkerBaseState(input: {
  paths: TemporalWorkerPaths;
  pid: number;
  address: string;
  namespace: string;
  taskQueue: string;
  sourceVersion: string;
  workflowBundlePath?: string;
  workflowBundleVersion?: string;
  workflowBundleSourceVersion?: string;
}) {
  return {
    provider_kind: 'temporal' as const,
    pid: input.pid,
    address: input.address,
    namespace: input.namespace,
    task_queue: input.taskQueue,
    started_at: new Date().toISOString(),
    source_version: input.sourceVersion,
    workflow_bundle_path: input.workflowBundlePath,
    workflow_bundle_version: input.workflowBundleVersion,
    workflow_bundle_source_version: input.workflowBundleSourceVersion,
    log_refs: temporalWorkerLogRefs(input.paths),
  };
}

export function writeTemporalWorkerStartingState(
  paths: TemporalWorkerPaths,
  baseState: Omit<TemporalWorkerState, 'status'>,
) {
  writeTemporalWorkerState(paths, {
    ...baseState,
    status: 'starting',
  });
}

export function writeTemporalWorkerFailedExit(
  paths: TemporalWorkerPaths,
  baseState: Omit<TemporalWorkerState, 'status'>,
  error: unknown,
) {
  writeTemporalWorkerExitState(paths, {
    ...baseState,
    status: 'ready',
  }, {
    exit_status: 'worker_run_failed',
    exited_at: new Date().toISOString(),
    message: error instanceof Error ? error.message : String(error),
  });
}

export async function runTemporalWorkerResidentLoop(input: TemporalResidentWorkerLoopInput) {
  let residentRestartCount = 0;
  while (true) {
    if (input.isShutdownRequested()) {
      writeTemporalWorkerExitState(input.paths, {
        ...input.baseState,
        status: 'ready',
        resident_restart_count: residentRestartCount,
      }, {
        exit_status: 'worker_shutdown_requested',
        exited_at: new Date().toISOString(),
      });
      return;
    }
    writeTemporalWorkerState(input.paths, {
      ...input.baseState,
      status: 'ready',
      resident_restart_count: residentRestartCount,
    });
    await input.runWorkerOnce();
    if (input.isShutdownRequested()) {
      writeTemporalWorkerExitState(input.paths, {
        ...input.baseState,
        status: 'ready',
        resident_restart_count: residentRestartCount,
      }, {
        exit_status: 'worker_shutdown_requested',
        exited_at: new Date().toISOString(),
      });
      return;
    }
    residentRestartCount += 1;
    writeTemporalWorkerState(input.paths, {
      ...input.baseState,
      status: 'ready',
      resident_restart_count: residentRestartCount,
    });
    await sleep(input.restartDelayMs ?? 1_000);
  }
}
