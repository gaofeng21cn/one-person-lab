import {
  resolveTemporalNamespace,
} from '../family-runtime-temporal.ts';
import {
  buildTemporalWorkerReadiness,
} from '../family-runtime-temporal-readiness.ts';
import {
  buildTemporalStageAttemptVisibilityReadiness,
} from '../family-runtime-temporal-visibility.ts';
import {
  type TemporalWorkerPaths,
} from '../family-runtime-temporal-client.ts';
import {
  resolveTemporalAddressForPaths,
} from '../family-runtime-temporal-service.ts';
import {
  processIsAlive,
  readTemporalWorkerState,
  temporalWorkerStatePath,
  workerSourceVersionsEquivalent,
} from './worker-state.ts';
import {
  buildTemporalWorkerMutationGuard,
} from './worker-source-guard.ts';
import {
  resolveTemporalWorkerTaskQueue,
} from './worker-task-queue.ts';
import {
  expectedWorkerSourceVersionForState,
} from './worker-source-currentness.ts';

export function inspectTemporalWorkerLifecycleFast(
  paths: TemporalWorkerPaths,
  input: { providerModuleUrl?: string } = {},
) {
  const resolved = resolveTemporalAddressForPaths(paths);
  const { address, addressSource, serviceState } = resolved;
  const namespace = resolveTemporalNamespace();
  const taskQueue = resolveTemporalWorkerTaskQueue(paths);
  const state = readTemporalWorkerState(paths);
  const stateMatchesConfig =
    state !== null
    && state.address === address
    && state.namespace === namespace
    && state.task_queue === taskQueue;
  const stateProcessAlive = state ? processIsAlive(state.pid) : false;
  const statePidAlive = stateMatchesConfig && stateProcessAlive;
  const expectedWorkerSourceVersion = statePidAlive && state
    ? expectedWorkerSourceVersionForState(state, input.providerModuleUrl ?? import.meta.url)
    : null;
  const stateSourceCurrent = statePidAlive && state
    ? workerSourceVersionsEquivalent(state.source_version, expectedWorkerSourceVersion)
    : null;
  const envWorkerReady = process.env.OPL_TEMPORAL_WORKER_ENABLED?.trim() === '1'
    || process.env.OPL_TEMPORAL_WORKER_STATUS?.trim() === 'ready';
  const workerStatusReady = (statePidAlive && stateSourceCurrent === true) || envWorkerReady;
  const workerMutationGuard = buildTemporalWorkerMutationGuard({
    moduleUrl: input.providerModuleUrl ?? import.meta.url,
    paths,
  });
  const visibilityReadiness = buildTemporalStageAttemptVisibilityReadiness({
    address,
    addressSource,
    namespace,
    taskQueue,
  });
  const serviceStatus = addressSource === 'managed_local_service_state'
    ? 'running'
    : addressSource === 'environment'
      ? 'configured_external_unverified'
      : serviceState
        ? 'stale_state_unverified'
        : 'not_configured';
  const serviceReady = serviceStatus === 'running'
    ? true
    : serviceStatus === 'configured_external_unverified'
      ? null
      : false;
  const readiness = buildTemporalWorkerReadiness({
    address,
    addressSource,
    namespace,
    taskQueue,
    workerEnabled: envWorkerReady ? '1' : null,
    workerStatus: workerStatusReady ? 'ready' : null,
    serverReachable: null,
    serviceReady,
    managedWorkerPid: statePidAlive && state ? state.pid : null,
    managedWorkerStatePath: temporalWorkerStatePath(paths),
    managedWorkerSourceVersion: state?.source_version ?? null,
    expectedWorkerSourceVersion,
    managedWorkerSourceCurrent: stateSourceCurrent,
    managedWorkerWorkflowBundlePath: state?.workflow_bundle_path ?? null,
    managedWorkerWorkflowBundleVersion: state?.workflow_bundle_version ?? null,
    managedWorkerWorkflowBundleSourceVersion: state?.workflow_bundle_source_version ?? null,
    staleWorkerPid: statePidAlive && stateSourceCurrent === false && state ? state.pid : null,
    temporalServiceLifecycle: {
      surface_kind: 'temporal_service_lifecycle_status',
      provider_kind: 'temporal',
      inspection_detail: 'fast',
      service_status: serviceStatus,
      address,
      address_source: addressSource,
      server_reachable: null,
      managed_service_pid: addressSource === 'managed_local_service_state'
        ? serviceState?.pid ?? null
        : null,
      service_kind: serviceState?.service_kind ?? null,
      command: serviceState?.command ?? null,
      blockers: [
        ...(!address ? ['temporal_runtime_not_configured'] : []),
        ...(serviceStatus === 'stale_state_unverified' ? ['temporal_local_service_stale_state_unverified'] : []),
      ],
      repair_action: {
        surface_kind: 'temporal_service_repair_action',
        provider_kind: 'temporal',
        action_id: address ? 'none' : 'start_local_temporal_service',
        next_command: address
          ? 'opl family-runtime worker start --provider temporal'
          : 'opl family-runtime service start --provider temporal',
        required_launcher: ['temporal CLI on PATH', 'OPL_TEMPORAL_SERVICE_START_COMMAND'],
      },
      authority_boundary: {
        opl: 'temporal_local_service_lifecycle_fast_projection_only',
        domain: 'truth_quality_artifact_gate_owner',
      },
    },
    visibilityReadiness,
    workerMutationGuard,
  });
  return {
    ...readiness,
    surface_kind: 'temporal_worker_lifecycle_status',
    lifecycle_status: readiness.readiness_status,
    inspection_detail: 'fast',
  };
}
