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
  inspectTemporalServiceLifecycle,
  resolveTemporalAddressForPaths,
} from '../family-runtime-temporal-service.ts';
import type {
  TemporalServiceSupervisorStateRuntime,
} from '../family-runtime-temporal-service-supervisor-state.ts';
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

export async function inspectTemporalWorkerLifecycleFast(
  paths: TemporalWorkerPaths,
  input: {
    providerModuleUrl?: string;
    serviceRuntime?: TemporalServiceSupervisorStateRuntime;
  } = {},
) {
  const resolved = resolveTemporalAddressForPaths(paths);
  const { address, addressSource } = resolved;
  const service = await inspectTemporalServiceLifecycle(paths, input.serviceRuntime);
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
  const serviceStatus = service.service_status;
  const serviceReady = service.server_reachable === true
    && (serviceStatus === 'running' || serviceStatus === 'external_running');
  const readiness = buildTemporalWorkerReadiness({
    address,
    addressSource,
    namespace,
    taskQueue,
    workerEnabled: envWorkerReady ? '1' : null,
    workerStatus: workerStatusReady ? 'ready' : null,
    serverReachable: service.server_reachable,
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
      ...service,
      inspection_detail: 'fast',
      authority_boundary: {
        ...service.authority_boundary,
        inspection: 'fresh_tcp_probe_with_compact_projection',
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
