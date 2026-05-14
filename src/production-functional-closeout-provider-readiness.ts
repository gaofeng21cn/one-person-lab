import fs from 'node:fs';
import path from 'node:path';

import { isRecord, optionalString } from './domain-manifest/shared-utils.ts';
import type { familyRuntimePaths } from './family-runtime-store.ts';
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

function temporalRepairAction(readinessStatus: string) {
  const repairCommands = {
    start_local_temporal_service: 'opl family-runtime service start --provider temporal',
    configure_temporal_address: 'export OPL_TEMPORAL_ADDRESS=127.0.0.1:7233',
    verify_temporal_server: 'opl family-runtime worker status --provider temporal',
    start_managed_worker: 'opl family-runtime worker start --provider temporal',
    rerun_production_proof: 'opl family-runtime residency proof --provider temporal --production',
  };
  const nextCommandByStatus: Record<string, string | null> = {
    not_configured: repairCommands.start_local_temporal_service,
    server_unreachable: repairCommands.start_local_temporal_service,
    worker_not_ready: repairCommands.start_managed_worker,
    ready: repairCommands.rerun_production_proof,
  };
  return {
    surface_kind: 'temporal_worker_repair_action',
    provider_kind: 'temporal',
    action_id:
      readinessStatus === 'ready'
        ? 'none'
        : readinessStatus === 'worker_not_ready'
          ? 'start_temporal_worker'
          : readinessStatus === 'server_unreachable'
            ? 'repair_temporal_service'
            : 'configure_temporal_service',
    next_command: nextCommandByStatus[readinessStatus] ?? repairCommands.start_local_temporal_service,
    repair_commands: repairCommands,
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
  const readinessStatus =
    !address
      ? 'not_configured'
      : !serverReachable
        ? 'server_unreachable'
        : !workerReady
          ? 'worker_not_ready'
          : 'ready';

  return {
    surface_kind: 'opl_production_temporal_provider_readiness',
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
    repair_action: temporalRepairAction(readinessStatus),
    typed_blocker:
      readinessStatus === 'ready'
        ? null
        : {
            blocker_kind: 'temporal_readiness',
            blocker_id: `temporal_provider_${readinessStatus}`,
            owner: 'opl_provider_runtime',
            source_surface: 'opl_production_temporal_provider_readiness',
            repair_command: temporalRepairAction(readinessStatus).next_command,
            next_action: 'Bring the managed local Temporal service and worker to ready, then rerun production proof.',
          },
    authority_boundary: {
      opl: 'provider_readiness_and_repair_projection_only',
      domain: 'truth_quality_artifact_gate_owner',
    },
  };
}
