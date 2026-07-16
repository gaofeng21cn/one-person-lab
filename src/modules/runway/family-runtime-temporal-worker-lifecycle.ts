import { fileURLToPath } from 'node:url';

import {
  resolveTemporalNamespace,
} from './family-runtime-temporal.ts';
import {
  buildTemporalWorkerReadiness,
} from './family-runtime-temporal-readiness.ts';
import {
  inspectTemporalStageAttemptVisibilityReadiness,
} from './family-runtime-temporal-visibility.ts';
import {
  type TemporalWorkerPaths,
} from './family-runtime-temporal-client.ts';
import {
  inspectTemporalServiceLifecycle,
  probeTemporalServer,
  resolveTemporalAddressForPaths,
} from './family-runtime-temporal-service.ts';
import {
  buildTemporalWorkerCrashDiagnostic,
  processIsAlive,
  readTemporalWorkerState,
  temporalWorkerStatePath,
  workerSourceVersionsEquivalent,
} from './family-runtime-temporal-provider-parts/worker-state.ts';
import {
  findTemporalForegroundWorkerPids,
} from './family-runtime-temporal-provider-parts/worker-process.ts';
import {
  expectedWorkerSourceVersionForState,
} from './family-runtime-temporal-provider-parts/worker-source-currentness.ts';
import {
  inspectTemporalWorkerLifecycleFast,
} from './family-runtime-temporal-provider-parts/worker-lifecycle-fast.ts';
import {
  inspectTemporalWorkerRuntimeDependencies,
} from './family-runtime-temporal-provider-parts/worker-dependencies.ts';
import {
  buildTemporalWorkerMutationGuard,
} from './family-runtime-temporal-provider-parts/worker-source-guard.ts';
import {
  resolveTemporalWorkerTaskQueue,
} from './family-runtime-temporal-provider-parts/worker-task-queue.ts';

type TemporalLifecycleInspectionDetail = 'fast' | 'full';

function temporalProviderModuleUrl() {
  const extension = import.meta.url.endsWith('.js') ? 'js' : 'ts';
  return new URL(`./family-runtime-temporal-provider.${extension}`, import.meta.url).href;
}

export async function inspectTemporalWorkerLifecycle(paths: TemporalWorkerPaths) {
  return inspectTemporalWorkerLifecycleWithDetail(paths, { detail: 'full' });
}

export async function inspectTemporalWorkerLifecycleWithDetail(
  paths: TemporalWorkerPaths,
  input: { detail?: TemporalLifecycleInspectionDetail } = {},
) {
  const detail = input.detail ?? 'full';
  const providerModuleUrl = temporalProviderModuleUrl();
  if (detail === 'fast') {
    return inspectTemporalWorkerLifecycleFast(paths, { providerModuleUrl });
  }
  const service = await inspectTemporalServiceLifecycle(paths);
  const { address, addressSource } = resolveTemporalAddressForPaths(paths);
  const namespace = resolveTemporalNamespace();
  const taskQueue = resolveTemporalWorkerTaskQueue(paths);
  const state = readTemporalWorkerState(paths);
  const stateMatchesConfig =
    state?.address === address
    && state.namespace === namespace
    && state.task_queue === taskQueue;
  const expectedWorkerSourceVersion = expectedWorkerSourceVersionForState(state, providerModuleUrl);
  const stateSourceCurrent = stateMatchesConfig && state
    ? workerSourceVersionsEquivalent(state.source_version, expectedWorkerSourceVersion)
    : false;
  const stateProcessAlive = state ? processIsAlive(state.pid) : false;
  const statePidAlive = stateMatchesConfig && stateProcessAlive;
  const duplicateWorkerPids = findTemporalForegroundWorkerPids({
    modulePath: fileURLToPath(providerModuleUrl),
    familyRuntimeRoot: paths.root,
    excludePids: statePidAlive && state?.pid ? [state.pid] : [],
  });
  const stateProcessExited = Boolean(state && !stateProcessAlive && (state.status === 'ready' || state.status === 'exited'));
  const pidAlive = statePidAlive && stateSourceCurrent;
  const envWorkerReady = process.env.OPL_TEMPORAL_WORKER_ENABLED?.trim() === '1'
    || process.env.OPL_TEMPORAL_WORKER_STATUS?.trim() === 'ready';
  const serverReachable = address ? await probeTemporalServer(address) : false;
  const dependencyHealth = inspectTemporalWorkerRuntimeDependencies({ moduleUrl: providerModuleUrl });
  const workerMutationGuard = buildTemporalWorkerMutationGuard({ moduleUrl: providerModuleUrl, paths });
  const workerReady = Boolean(serverReachable && dependencyHealth.status === 'ready' && (pidAlive || envWorkerReady));
  const visibilityReadiness = serverReachable
    ? await inspectTemporalStageAttemptVisibilityReadiness(paths, { taskQueue })
    : null;
  const readiness = buildTemporalWorkerReadiness({
    address,
    addressSource,
    namespace,
    taskQueue,
    workerEnabled: envWorkerReady ? '1' : null,
    workerStatus: pidAlive ? 'ready' : null,
    serverReachable,
    managedWorkerPid: state?.pid ?? null,
    managedWorkerProcessAlive: state ? stateProcessAlive : null,
    managedWorkerStatePath: temporalWorkerStatePath(paths),
    managedWorkerSourceVersion: state?.source_version ?? null,
    expectedWorkerSourceVersion,
    managedWorkerSourceCurrent: stateMatchesConfig && state && stateProcessAlive ? stateSourceCurrent : null,
    managedWorkerWorkflowBundlePath: state?.workflow_bundle_path ?? null,
    managedWorkerWorkflowBundleVersion: state?.workflow_bundle_version ?? null,
    managedWorkerWorkflowBundleSourceVersion: state?.workflow_bundle_source_version ?? null,
    workerDependencyHealth: dependencyHealth,
    staleWorkerPid: statePidAlive && !stateSourceCurrent && state ? state.pid : null,
    duplicateWorkerPids,
    temporalServiceLifecycle: service,
    visibilityReadiness,
    workerMutationGuard,
    managedWorkerProcessExited: stateProcessExited,
    crashDiagnostic: buildTemporalWorkerCrashDiagnostic(paths, state, stateProcessAlive),
  });
  return {
    ...readiness,
    surface_kind: 'temporal_worker_lifecycle_status',
    lifecycle_status: readiness.readiness_status,
    inspection_detail: 'full',
  };
}
