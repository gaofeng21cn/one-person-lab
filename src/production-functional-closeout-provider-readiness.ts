import fs from 'node:fs';
import path from 'node:path';

import { isRecord, optionalString } from './domain-manifest/shared-utils.ts';
import type { familyRuntimePaths } from './family-runtime-store.ts';
import { buildTemporalWorkerReadiness } from './family-runtime-temporal-readiness.ts';
import { DEFAULT_TEMPORAL_TASK_QUEUE, resolveTemporalNamespace, resolveTemporalTaskQueue } from './family-runtime-temporal.ts';
import { probeTemporalServer, resolveTemporalAddressForPaths } from './family-runtime-temporal-service.ts';

type FamilyRuntimePaths = ReturnType<typeof familyRuntimePaths>;

function processIsAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readJsonRecord(filePath: string) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function readTemporalWorkerState(paths: FamilyRuntimePaths) {
  const statePath = path.join(paths.root, 'temporal-worker.json');
  const state = readJsonRecord(statePath);
  if (!state) {
    return { state_path: statePath, state: null, pid_alive: false };
  }
  const pid = typeof state.pid === 'number' && Number.isInteger(state.pid) ? state.pid : null;
  return {
    state_path: statePath,
    state,
    pid_alive: pid !== null ? processIsAlive(pid) : false,
  };
}

export async function buildProviderReadiness(paths: FamilyRuntimePaths) {
  const addressResolution = resolveTemporalAddressForPaths(paths);
  const address = addressResolution.address;
  const serverReachable = address ? await probeTemporalServer(address) : false;
  const workerState = readTemporalWorkerState(paths);
  const namespace = resolveTemporalNamespace();
  const taskQueue = resolveTemporalTaskQueue();
  const state = workerState.state;
  const workerStateMatches =
    Boolean(state)
    && optionalString(state?.address) === address
    && optionalString(state?.namespace) === namespace
    && optionalString(state?.task_queue) === taskQueue;
  const envWorkerReady = process.env.OPL_TEMPORAL_WORKER_ENABLED?.trim() === '1'
    || process.env.OPL_TEMPORAL_WORKER_STATUS?.trim() === 'ready';
  const workerReady = Boolean(serverReachable && (envWorkerReady || (workerStateMatches && workerState.pid_alive)));
  const temporalReadiness = buildTemporalWorkerReadiness({
    address,
    addressSource: addressResolution.addressSource,
    namespace,
    taskQueue,
    workerEnabled: envWorkerReady ? '1' : null,
    workerStatus: workerStateMatches && workerState.pid_alive ? 'ready' : null,
    serverReachable,
    managedWorkerPid:
      workerState.pid_alive && typeof workerState.state?.pid === 'number'
        ? workerState.state.pid
        : null,
    managedWorkerStatePath: workerState.state_path,
    temporalServiceLifecycle: addressResolution.serviceState,
  });
  const readinessStatus = temporalReadiness.readiness_status;

  return {
    surface_kind: 'opl_production_temporal_provider_readiness',
    canonical_readiness_surface_ref: 'src/family-runtime-temporal-readiness.ts#buildTemporalWorkerReadiness',
    canonical_worker_readiness: temporalReadiness,
    provider_kind: 'temporal',
    readiness_status: readinessStatus,
    production_provider_ready: readinessStatus === 'ready',
    address,
    address_source: addressResolution.addressSource,
    server_reachable: serverReachable,
    namespace,
    task_queue: taskQueue,
    default_task_queue: DEFAULT_TEMPORAL_TASK_QUEUE,
    worker_ready: workerReady,
    worker_state_path: workerState.state_path,
    managed_worker_pid:
      workerState.pid_alive && typeof workerState.state?.pid === 'number'
        ? workerState.state.pid
        : null,
    managed_worker_state_matches: workerStateMatches,
    service_state: addressResolution.serviceState,
    repair_action: temporalReadiness.repair_action,
    typed_blocker:
      readinessStatus === 'ready'
        ? null
        : {
            blocker_kind: 'temporal_readiness',
            blocker_id: `temporal_provider_${readinessStatus}`,
            owner: 'opl_provider_runtime',
            source_surface: 'opl_production_temporal_provider_readiness',
            repair_command: temporalReadiness.repair_action.next_command,
            next_action: 'Bring the managed local Temporal service and worker to ready, then rerun production proof.',
          },
    authority_boundary: {
      opl: 'provider_readiness_and_repair_projection_only',
      domain: 'truth_quality_artifact_gate_owner',
    },
  };
}
