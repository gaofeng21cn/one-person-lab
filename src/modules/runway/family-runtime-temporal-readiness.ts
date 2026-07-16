import {
  DEFAULT_TEMPORAL_TASK_QUEUE,
  buildTemporalFirstRuntimeContract,
  resolveTemporalAddress,
  resolveTemporalNamespace,
  resolveTemporalTaskQueue,
  TEMPORAL_STAGE_ATTEMPT_SEARCH_ATTRIBUTE_NAMES,
} from './family-runtime-temporal.ts';
import {
  workerSourceVersionDiagnostic,
  workerSourceVersionsEquivalent,
} from './family-runtime-temporal-provider-parts/worker-state.ts';
import type {
  TemporalStageAttemptVisibilityReadiness,
} from './family-runtime-temporal-visibility.ts';

export type TemporalWorkerReadinessStatus =
  | 'not_configured'
  | 'server_unreachable'
  | 'worker_dependency_unavailable'
  | 'duplicate_worker'
  | 'worker_source_stale'
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
  serviceReady?: boolean | null;
  liveProbeStartedWorker?: boolean | null;
  unreachableReason?: string | null;
  managedWorkerPid?: number | null;
  managedWorkerProcessAlive?: boolean | null;
  managedWorkerStatePath?: string | null;
  managedWorkerSourceVersion?: string | null;
  expectedWorkerSourceVersion?: string | null;
  managedWorkerSourceCurrent?: boolean | null;
  managedWorkerWorkflowBundlePath?: string | null;
  managedWorkerWorkflowBundleVersion?: string | null;
  managedWorkerWorkflowBundleSourceVersion?: string | null;
  workerDependencyHealth?: Record<string, unknown> | null;
  managedWorkerProcessExited?: boolean | null;
  crashDiagnostic?: Record<string, unknown> | null;
  staleWorkerPid?: number | null;
  duplicateWorkerPids?: number[] | null;
  temporalServiceLifecycle?: Record<string, unknown> | null;
  visibilityReadiness?: TemporalStageAttemptVisibilityReadiness | null;
  workerMutationGuard?: Record<string, unknown> | null;
};

export type TemporalVisibilityReadiness = {
  surface_kind: 'temporal_visibility_readiness';
  provider_kind: 'temporal';
  namespace: string;
  required_search_attributes: string[];
  present_search_attributes: string[];
  missing_search_attributes: string[];
  readiness_status: 'ready' | 'missing_search_attributes';
  repair_action: {
    surface_kind: 'temporal_visibility_repair_action';
    provider_kind: 'temporal';
    action_id: 'none' | 'install_temporal_search_attributes';
    next_command: string | null;
    required_before: 'searchable_stage_attempt_visibility';
  };
  authority_boundary: {
    opl: 'temporal_visibility_metadata_readiness_only';
    domain: 'truth_quality_artifact_gate_owner';
  };
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

function dependencyRepairCommand() {
  return 'npm install --include=optional --ignore-scripts=false';
}

function buildTemporalWorkerRepairAction(input: {
  readinessStatus: TemporalWorkerReadinessStatus;
  address?: string | null;
  namespace?: string | null;
  taskQueue?: string | null;
}) {
  const supervisorAwareRestartCommand = 'opl family-runtime worker stop --provider temporal';
  const repairCommands = {
    start_local_temporal_service:
      'opl family-runtime service start --provider temporal',
    configure_temporal_address:
      'export OPL_TEMPORAL_ADDRESS=127.0.0.1:7233',
    verify_temporal_server:
      'opl family-runtime worker status --provider temporal',
    repair_worker_runtime_dependencies:
      dependencyRepairCommand(),
    start_managed_worker:
      'opl family-runtime worker start --provider temporal',
    restart_worker_with_supervisor:
      supervisorAwareRestartCommand,
    restart_worker_without_supervisor:
      'opl family-runtime worker stop --provider temporal && opl family-runtime worker start --provider temporal',
    rerun_production_proof:
      'opl family-runtime residency proof --provider temporal --production',
  };
  const actionByStatus: Record<TemporalWorkerReadinessStatus, string> = {
    not_configured: 'configure_temporal_service',
    server_unreachable: 'repair_temporal_service',
    worker_dependency_unavailable: 'repair_temporal_worker_runtime_dependencies',
    duplicate_worker: 'restart_temporal_worker',
    worker_source_stale: 'restart_temporal_worker',
    worker_not_ready: 'start_temporal_worker',
    ready: 'none',
  };
  const nextCommandByStatus: Record<TemporalWorkerReadinessStatus, string | null> = {
    not_configured: repairCommands.start_local_temporal_service,
    server_unreachable: repairCommands.start_local_temporal_service,
    worker_dependency_unavailable: repairCommands.repair_worker_runtime_dependencies,
    duplicate_worker: supervisorAwareRestartCommand,
    worker_source_stale: supervisorAwareRestartCommand,
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
    restart_strategy: input.readinessStatus === 'duplicate_worker'
      || input.readinessStatus === 'worker_source_stale'
        ? 'supervisor_aware_stop_then_supervisor_or_manual_start'
        : null,
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
  workerDependencyUnavailable?: boolean | null;
  duplicateWorker?: boolean | null;
  workerSourceStale?: boolean | null;
}) {
  return Boolean(input.address)
    && input.serverReachable !== false
    && input.workerDependencyUnavailable !== true
    && input.duplicateWorker !== true
    && input.workerSourceStale !== true
    && (envFlagReady(input.workerEnabled) || envFlagReady(input.workerStatus));
}

function buildTemporalWorkerBlockers(input: {
  address: string | null;
  serverReachable: boolean | null;
  workerReady: boolean;
  workerDependencyUnavailable?: boolean | null;
  workerProcessExited?: boolean | null;
  duplicateWorker?: boolean | null;
  workerSourceStale?: boolean | null;
}) {
  const blockers: string[] = [];
  if (!input.address) {
    blockers.push('temporal_runtime_not_configured');
  }
  if (input.address && input.serverReachable === false) {
    blockers.push('temporal_server_unreachable');
  }
  if (input.address && input.serverReachable !== false && input.workerDependencyUnavailable === true) {
    blockers.push('temporal_worker_dependency_unavailable');
    return blockers;
  }
  if (input.address && input.serverReachable !== false && input.duplicateWorker === true) {
    blockers.push('temporal_worker_duplicate_foreground');
    return blockers;
  }
  if (input.address && input.serverReachable !== false && input.workerProcessExited === true) {
    blockers.push('temporal_worker_process_exited');
    return blockers;
  }
  if (input.address && input.serverReachable !== false && input.workerSourceStale === true) {
    blockers.push('temporal_worker_source_stale');
    return blockers;
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
  const workerDependencyUnavailable =
    input.workerDependencyHealth?.status === 'blocked';
  const duplicateWorker = Boolean(input.duplicateWorkerPids?.length);
  const workerSourceStale = input.managedWorkerSourceCurrent === false;
  const workerReady = resolveTemporalWorkerReady({
    address,
    serverReachable,
    workerEnabled,
    workerStatus,
    workerDependencyUnavailable,
    duplicateWorker,
    workerSourceStale,
  });
  const readinessStatus = resolveTemporalWorkerReadinessStatus({
    address,
    serverReachable,
    workerReady,
    workerDependencyUnavailable,
    duplicateWorker,
    workerSourceStale,
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

function resolveTemporalWorkerReadinessStatus(input: {
  address?: string | null;
  serverReachable?: boolean | null;
  workerReady?: boolean | null;
  workerDependencyUnavailable?: boolean | null;
  duplicateWorker?: boolean | null;
  workerSourceStale?: boolean | null;
}): TemporalWorkerReadinessStatus {
  if (!input.address) {
    return 'not_configured';
  }
  if (input.serverReachable === false) {
    return 'server_unreachable';
  }
  if (input.workerDependencyUnavailable === true) {
    return 'worker_dependency_unavailable';
  }
  if (input.duplicateWorker === true) {
    return 'duplicate_worker';
  }
  if (input.workerSourceStale === true) {
    return 'worker_source_stale';
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
    temporal_first_runtime_contract: buildTemporalFirstRuntimeContract(),
    task_queue: resolveTemporalTaskQueue(),
    default_task_queue: DEFAULT_TEMPORAL_TASK_QUEUE,
    namespace: resolveTemporalNamespace(),
    worker_helper: 'runTemporalStageAttemptWorkerUntil',
    fail_closed_when_unconfigured: true,
    required_env: ['OPL_TEMPORAL_ADDRESS'],
    activities: [
      'codexStageActivity',
      'domainHandlerDispatchActivity',
    ],
    required_search_attributes: [...TEMPORAL_STAGE_ATTEMPT_SEARCH_ATTRIBUTE_NAMES],
    visibility_payload_policy: 'refs_and_indexable_summary_only_no_transcript_artifact_memory_or_domain_body',
    workflow_bundle_policy: {
      production_worker_uses_prebuilt_bundle: true,
      workflows_path_allowed_for_managed_worker: false,
      workflow_bundle_source_version_tied_to_worker_source_version: true,
    },
    authority_boundary: {
      opl: 'worker_lifecycle_and_activity_transport_only',
      domain: 'truth_quality_artifact_gate_owner',
    },
  };
}

export function buildTemporalVisibilityReadiness(input: {
  namespace?: string | null;
  presentSearchAttributes?: string[] | null;
} = {}): TemporalVisibilityReadiness {
  const namespace = input.namespace ?? resolveTemporalNamespace();
  const present = input.presentSearchAttributes ?? [];
  const missing = TEMPORAL_STAGE_ATTEMPT_SEARCH_ATTRIBUTE_NAMES
    .filter((name) => !present.includes(name));
  const ready = missing.length === 0;
  return {
    surface_kind: 'temporal_visibility_readiness',
    provider_kind: 'temporal',
    namespace,
    required_search_attributes: [...TEMPORAL_STAGE_ATTEMPT_SEARCH_ATTRIBUTE_NAMES],
    present_search_attributes: present,
    missing_search_attributes: missing,
    readiness_status: ready ? 'ready' : 'missing_search_attributes',
    repair_action: {
      surface_kind: 'temporal_visibility_repair_action',
      provider_kind: 'temporal',
      action_id: ready ? 'none' : 'install_temporal_search_attributes',
      next_command: ready ? null : 'opl family-runtime provider repair --provider temporal',
      required_before: 'searchable_stage_attempt_visibility',
    },
    authority_boundary: {
      opl: 'temporal_visibility_metadata_readiness_only',
      domain: 'truth_quality_artifact_gate_owner',
    },
  };
}

export function buildTemporalWorkerReadiness(input: TemporalWorkerReadinessInput = {}) {
  const readiness = resolveTemporalWorkerReadinessInput(input);
  const sourceVersionDiagnostic = workerSourceVersionDiagnostic(
    input.managedWorkerSourceVersion,
    input.expectedWorkerSourceVersion,
  );
  const blockers = buildTemporalWorkerBlockers({
    ...readiness,
    workerDependencyUnavailable: input.workerDependencyHealth?.status === 'blocked',
    workerProcessExited: input.managedWorkerProcessExited === true,
    duplicateWorker: Boolean(input.duplicateWorkerPids?.length),
    workerSourceStale: input.managedWorkerSourceCurrent === false,
  });
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
    service_ready: input.serviceReady ?? null,
    address: readiness.address,
    address_source: readiness.addressSource,
    namespace: readiness.namespace,
    task_queue: readiness.taskQueue,
    default_task_queue: DEFAULT_TEMPORAL_TASK_QUEUE,
    live_probe_started_worker: input.liveProbeStartedWorker ?? false,
    unreachable_reason: input.unreachableReason ?? null,
    managed_worker_pid: input.managedWorkerPid ?? null,
    managed_worker_process_alive: input.managedWorkerProcessAlive ?? (input.managedWorkerPid !== null && input.managedWorkerPid !== undefined),
    duplicate_worker_pids: input.duplicateWorkerPids ?? [],
    managed_worker_state_path: input.managedWorkerStatePath ?? null,
    managed_worker_source_version: input.managedWorkerSourceVersion ?? null,
    expected_worker_source_version: input.expectedWorkerSourceVersion ?? null,
    managed_worker_source_current: input.managedWorkerSourceCurrent ?? null,
    operator_diagnostic: {
      surface_kind: 'temporal_worker_operator_diagnostic',
      source_version: sourceVersionDiagnostic,
      provider_ready_unchanged_by_source_root_equivalence:
        sourceVersionDiagnostic.diagnostic_id === 'same_content_hash_different_source_root',
    },
    managed_worker_workflow_bundle_path: input.managedWorkerWorkflowBundlePath ?? null,
    managed_worker_workflow_bundle_version: input.managedWorkerWorkflowBundleVersion ?? null,
    managed_worker_workflow_bundle_source_version: input.managedWorkerWorkflowBundleSourceVersion ?? null,
    worker_dependency_health: input.workerDependencyHealth ?? null,
    crash_diagnostic: input.crashDiagnostic ?? null,
    managed_worker_workflow_bundle_source_current:
      input.managedWorkerWorkflowBundleSourceVersion && input.expectedWorkerSourceVersion
        ? workerSourceVersionsEquivalent(input.managedWorkerWorkflowBundleSourceVersion, input.expectedWorkerSourceVersion)
        : null,
    stale_worker_pid: input.staleWorkerPid ?? null,
    temporal_service_lifecycle: input.temporalServiceLifecycle ?? null,
    visibility_readiness: input.visibilityReadiness ?? null,
    worker_mutation_guard: input.workerMutationGuard ?? null,
    blockers,
    repair_action: repairAction,
    lifecycle: buildTemporalWorkerLifecycleContract(),
    authority_boundary: {
      opl: 'worker_lifecycle_readiness_projection_only',
      domain: 'truth_quality_artifact_gate_owner',
    },
  };
}
