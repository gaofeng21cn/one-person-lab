import {
  buildTemporalWorkerLifecycleContract,
} from '../../../../src/modules/runway/family-runtime-temporal-provider.ts';
import {
  buildTemporalStageAttemptVisibilityReadiness,
} from '../../../../src/modules/runway/family-runtime-temporal-visibility.ts';

export type TemporalWorkerStatusKind =
  | 'worker_not_ready'
  | 'worker_source_stale'
  | 'worker_dependency_unavailable'
  | 'ready';

export function temporalWorkerStatus(
  status: TemporalWorkerStatusKind,
  input: {
    mutationGuardStatus?: string;
    mutationGuardAllowed?: boolean;
    serverReachable?: boolean;
  } = {},
) {
  const serverReachable = input.serverReachable ?? true;
  const mutationGuardStatus = input.mutationGuardStatus ?? 'allowed';
  const mutationGuardAllowed = input.mutationGuardAllowed ?? true;
  const visibilityReadiness = buildTemporalStageAttemptVisibilityReadiness({
    namespace: 'default',
    observedCustomAttributes: {
      OplStageAttemptId: 'Keyword',
      OplDomainId: 'Keyword',
      OplStageId: 'Keyword',
      OplAttemptStatus: 'Keyword',
      OplTaskId: 'Keyword',
      OplExecutorKind: 'Keyword',
    },
  });
  const lifecycle = {
    ...buildTemporalWorkerLifecycleContract(),
    task_queue: 'opl-stage-attempts',
    namespace: 'default',
  };
  return {
    surface_kind: 'temporal_worker_lifecycle_status',
    provider_kind: 'temporal',
    lifecycle_status: status,
    inspection_detail: 'full',
    readiness_status: status,
    worker_ready: status === 'ready',
    server_reachable: serverReachable,
    service_ready: serverReachable,
    address: '127.0.0.1:7233',
    address_source: 'managed_local_service_state',
    namespace: 'default',
    task_queue: 'opl-stage-attempts',
    default_task_queue: 'opl-stage-attempts',
    live_probe_started_worker: false,
    unreachable_reason: null,
    managed_worker_pid: status === 'ready' ? 12345 : null,
    managed_worker_process_alive: status === 'ready',
    duplicate_worker_pids: [],
    managed_worker_state_path: '/tmp/temporal-worker.json',
    managed_worker_source_version: status === 'worker_not_ready' ? null : status === 'worker_source_stale' ? 'worker-runtime:old' : 'worker-runtime:test',
    expected_worker_source_version: 'worker-runtime:test',
    managed_worker_source_current: status === 'worker_source_stale' ? false : status === 'ready' ? true : null,
    operator_diagnostic: {
      surface_kind: 'temporal_worker_operator_diagnostic',
      source_version: {
        diagnostic_id: 'worker_source_version_unparsed',
        same_content_hash: null,
        different_source_root: null,
        provider_ready_effect: 'none',
      },
      provider_ready_unchanged_by_source_root_equivalence: false,
    },
    managed_worker_workflow_bundle_path: status === 'ready' ? '/tmp/temporal-workflow-bundle/stage-attempt.js' : null,
    managed_worker_workflow_bundle_version: status === 'ready' ? 'workflow-bundle:sha256:test' : null,
    managed_worker_workflow_bundle_source_version: status === 'ready' ? 'worker-runtime:test' : null,
    managed_worker_workflow_bundle_source_current: status === 'ready' ? true : null,
    worker_dependency_health: status === 'worker_dependency_unavailable'
      ? {
          surface_kind: 'temporal_worker_runtime_dependency_health',
          provider_kind: 'temporal',
          status: 'blocked',
          blocker: {
            blocker_id: 'temporal_worker_swc_native_binding_unavailable',
            repair_command: 'npm install --include=optional --ignore-scripts=false',
          },
        }
      : { surface_kind: 'temporal_worker_runtime_dependency_health', provider_kind: 'temporal', status: 'ready' },
    crash_diagnostic: null,
    stale_worker_pid: status === 'worker_source_stale' ? 12344 : null,
    temporal_service_lifecycle: {
      surface_kind: 'temporal_service_lifecycle_status',
      provider_kind: 'temporal',
      service_status: 'running',
      address: '127.0.0.1:7233',
      server_reachable: serverReachable,
    },
    visibility_readiness: visibilityReadiness,
    worker_mutation_guard: {
      surface_kind: 'temporal_worker_mutation_guard',
      mutation_guard_status: mutationGuardStatus,
      allowed: mutationGuardAllowed,
      state_dir_explicit: true,
      explicit_developer_override: false,
    },
    blockers: status === 'ready'
      ? []
      : status === 'worker_dependency_unavailable'
      ? ['temporal_worker_dependency_unavailable']
      : status === 'worker_source_stale'
      ? ['temporal_worker_source_stale']
      : ['temporal_worker_not_ready'],
    repair_action: {
      surface_kind: 'temporal_worker_repair_action',
      provider_kind: 'temporal',
      action_id: status === 'ready'
        ? 'none'
        : status === 'worker_dependency_unavailable'
        ? 'repair_temporal_worker_runtime_dependencies'
        : status === 'worker_source_stale'
        ? 'restart_temporal_worker'
        : 'start_temporal_worker',
      required_env: ['OPL_TEMPORAL_ADDRESS or managed local service state'],
      current_address: '127.0.0.1:7233',
      namespace: 'default',
      task_queue: 'opl-stage-attempts',
      next_command: status === 'ready'
        ? 'opl family-runtime residency proof --provider temporal --production'
        : status === 'worker_dependency_unavailable'
        ? 'npm install --include=optional --ignore-scripts=false'
        : status === 'worker_source_stale'
        ? 'opl family-runtime worker stop --provider temporal'
        : 'opl family-runtime worker start --provider temporal',
      restart_strategy: status === 'worker_source_stale'
        ? 'supervisor_aware_stop_then_supervisor_or_manual_start'
        : null,
      repair_commands: {
        start_local_temporal_service:
          'opl family-runtime service start --provider temporal',
        configure_temporal_address:
          'export OPL_TEMPORAL_ADDRESS=127.0.0.1:7233',
        verify_temporal_server:
          'opl family-runtime worker status --provider temporal',
        repair_worker_runtime_dependencies:
          'npm install --include=optional --ignore-scripts=false',
        start_managed_worker:
          'opl family-runtime worker start --provider temporal',
        restart_worker_with_supervisor:
          'opl family-runtime worker stop --provider temporal',
        restart_worker_without_supervisor:
          'opl family-runtime worker stop --provider temporal && opl family-runtime worker start --provider temporal',
        rerun_production_proof:
          'opl family-runtime residency proof --provider temporal --production',
      },
    },
    lifecycle,
    authority_boundary: {
      opl: 'worker_lifecycle_readiness_projection_only',
      domain: 'truth_quality_artifact_gate_owner',
    },
  };
}
