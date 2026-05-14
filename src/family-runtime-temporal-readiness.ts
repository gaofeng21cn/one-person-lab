import {
  DEFAULT_TEMPORAL_TASK_QUEUE,
  resolveTemporalAddress,
  resolveTemporalNamespace,
  resolveTemporalTaskQueue,
} from './family-runtime-temporal.ts';

export type TemporalWorkerReadinessStatus =
  | 'not_configured'
  | 'server_unreachable'
  | 'worker_not_ready'
  | 'ready';

type TemporalWorkerReadinessInput = {
  address?: string | null;
  addressSource?: string | null;
  namespace?: string | null;
  taskQueue?: string | null;
  workerEnabled?: string | null;
  workerStatus?: string | null;
  serverReachable?: boolean | null;
  liveProbeStartedWorker?: boolean | null;
  unreachableReason?: string | null;
  managedWorkerPid?: number | null;
  managedWorkerStatePath?: string | null;
  temporalServiceLifecycle?: Record<string, unknown> | null;
};

type ResolvedTemporalWorkerReadiness = {
  address: string | null;
  addressSource: string;
  namespace: string;
  taskQueue: string;
  serverReachable: boolean | null;
  workerReady: boolean;
  readinessStatus: TemporalWorkerReadinessStatus;
};

function buildTemporalWorkerRepairAction(input: {
  readinessStatus: TemporalWorkerReadinessStatus;
  address?: string | null;
  namespace?: string | null;
  taskQueue?: string | null;
}) {
  const repairCommands = {
    start_local_temporal_service:
      'opl family-runtime service start --provider temporal',
    configure_temporal_address:
      'export OPL_TEMPORAL_ADDRESS=127.0.0.1:7233',
    verify_temporal_server:
      'opl family-runtime worker status --provider temporal',
    start_managed_worker:
      'opl family-runtime worker start --provider temporal',
    rerun_production_proof:
      'opl family-runtime residency proof --provider temporal --production',
  };
  const actionByStatus: Record<TemporalWorkerReadinessStatus, string> = {
    not_configured: 'configure_temporal_service',
    server_unreachable: 'repair_temporal_service',
    worker_not_ready: 'start_temporal_worker',
    ready: 'none',
  };
  const nextCommandByStatus: Record<TemporalWorkerReadinessStatus, string | null> = {
    not_configured: repairCommands.start_local_temporal_service,
    server_unreachable: repairCommands.start_local_temporal_service,
    worker_not_ready: repairCommands.start_managed_worker,
    ready: repairCommands.rerun_production_proof,
  };
  return {
    surface_kind: 'temporal_worker_repair_action',
    provider_kind: 'temporal',
    action_id: actionByStatus[input.readinessStatus],
    required_env: ['OPL_TEMPORAL_ADDRESS or managed local service state'],
    current_address: input.address ?? null,
    namespace: input.namespace ?? null,
    task_queue: input.taskQueue ?? null,
    next_command: nextCommandByStatus[input.readinessStatus],
    repair_commands: repairCommands,
  };
}

function envFlagReady(value: string | null) {
  return value?.trim() === '1' || value?.trim() === 'ready';
}

function resolveTemporalWorkerReady(input: {
  address: string | null;
  serverReachable: boolean | null;
  workerEnabled: string | null;
  workerStatus: string | null;
}) {
  return Boolean(input.address)
    && input.serverReachable !== false
    && (envFlagReady(input.workerEnabled) || envFlagReady(input.workerStatus));
}

function buildTemporalWorkerBlockers(input: {
  address: string | null;
  serverReachable: boolean | null;
  workerReady: boolean;
}) {
  const blockers: string[] = [];
  if (!input.address) {
    blockers.push('temporal_runtime_not_configured');
  }
  if (input.address && input.serverReachable === false) {
    blockers.push('temporal_server_unreachable');
  }
  if (input.address && input.serverReachable !== false && !input.workerReady) {
    blockers.push('temporal_worker_not_ready');
  }
  return blockers;
}

function resolveTemporalWorkerReadinessInput(
  input: TemporalWorkerReadinessInput,
): ResolvedTemporalWorkerReadiness {
  const address = input.address ?? resolveTemporalAddress();
  const addressSource = input.addressSource ?? (address ? 'environment' : 'not_configured');
  const namespace = input.namespace ?? resolveTemporalNamespace();
  const taskQueue = input.taskQueue ?? resolveTemporalTaskQueue();
  const workerEnabled = input.workerEnabled ?? process.env.OPL_TEMPORAL_WORKER_ENABLED ?? null;
  const workerStatus = input.workerStatus ?? process.env.OPL_TEMPORAL_WORKER_STATUS ?? null;
  const serverReachable = input.serverReachable ?? null;
  const workerReady = resolveTemporalWorkerReady({
    address,
    serverReachable,
    workerEnabled,
    workerStatus,
  });
  const readinessStatus = resolveTemporalWorkerReadinessStatus({
    address,
    serverReachable,
    workerReady,
  });

  return {
    address,
    addressSource,
    namespace,
    taskQueue,
    serverReachable,
    workerReady,
    readinessStatus,
  };
}

export function resolveTemporalWorkerReadinessStatus(input: {
  address?: string | null;
  serverReachable?: boolean | null;
  workerReady?: boolean | null;
}): TemporalWorkerReadinessStatus {
  if (!input.address) {
    return 'not_configured';
  }
  if (input.serverReachable === false) {
    return 'server_unreachable';
  }
  if (!input.workerReady) {
    return 'worker_not_ready';
  }
  return 'ready';
}

export function buildTemporalWorkerLifecycleContract() {
  return {
    surface_kind: 'temporal_worker_lifecycle_contract',
    provider_kind: 'temporal',
    workflow_name: 'StageAttemptWorkflow',
    task_queue: resolveTemporalTaskQueue(),
    default_task_queue: DEFAULT_TEMPORAL_TASK_QUEUE,
    namespace: resolveTemporalNamespace(),
    worker_helper: 'runTemporalStageAttemptWorkerUntil',
    fail_closed_when_unconfigured: true,
    required_env: ['OPL_TEMPORAL_ADDRESS'],
    activities: [
      'codexStageActivity',
      'domainSidecarDispatchActivity',
    ],
    authority_boundary: {
      opl: 'worker_lifecycle_and_activity_transport_only',
      domain: 'truth_quality_artifact_gate_owner',
    },
  };
}

export function buildTemporalWorkerReadiness(input: TemporalWorkerReadinessInput = {}) {
  const readiness = resolveTemporalWorkerReadinessInput(input);
  const blockers = buildTemporalWorkerBlockers(readiness);
  const repairAction = buildTemporalWorkerRepairAction({
    readinessStatus: readiness.readinessStatus,
    address: readiness.address,
    namespace: readiness.namespace,
    taskQueue: readiness.taskQueue,
  });
  return {
    surface_kind: 'temporal_worker_readiness',
    provider_kind: 'temporal',
    readiness_status: readiness.readinessStatus,
    worker_ready: readiness.workerReady,
    server_reachable: readiness.serverReachable,
    address: readiness.address,
    address_source: readiness.addressSource,
    namespace: readiness.namespace,
    task_queue: readiness.taskQueue,
    default_task_queue: DEFAULT_TEMPORAL_TASK_QUEUE,
    live_probe_started_worker: input.liveProbeStartedWorker ?? false,
    unreachable_reason: input.unreachableReason ?? null,
    managed_worker_pid: input.managedWorkerPid ?? null,
    managed_worker_state_path: input.managedWorkerStatePath ?? null,
    temporal_service_lifecycle: input.temporalServiceLifecycle ?? null,
    blockers,
    repair_action: repairAction,
    lifecycle: buildTemporalWorkerLifecycleContract(),
    authority_boundary: {
      opl: 'worker_lifecycle_readiness_projection_only',
      domain: 'truth_quality_artifact_gate_owner',
    },
  };
}
