import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { NativeConnection, Worker } from '@temporalio/worker';

import { resolveCodexBinary } from './codex.ts';
import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { familyRuntimePaths } from './family-runtime-store.ts';
import * as activities from './family-runtime-temporal-activities.ts';
import {
  guardTemporalStageAttemptWorkflowInputPayload,
  resolveTemporalNamespace,
  resolveTemporalTaskQueue,
  type TemporalStageAttemptWorkflowInput,
} from './family-runtime-temporal.ts';
import {
  buildTemporalWorkerLifecycleContract,
  buildTemporalWorkerReadiness,
} from './family-runtime-temporal-readiness.ts';
import {
  buildTemporalStageAttemptVisibilityReadiness,
  inspectTemporalStageAttemptVisibilityReadiness,
  ensureTemporalStageAttemptVisibilityReady,
} from './family-runtime-temporal-visibility.ts';
export {
  inspectTemporalStageAttemptVisibilityReadiness,
} from './family-runtime-temporal-visibility.ts';
export {
  buildTemporalWorkerLifecycleContract,
  buildTemporalWorkerReadiness,
  type TemporalWorkerReadinessStatus,
} from './family-runtime-temporal-readiness.ts';
import {
  resolveTemporalAddressForPaths,
} from './family-runtime-temporal-service.ts';
import {
  requireTemporalAddress,
  type TemporalClientOptions,
  type TemporalWorkerPaths,
  withTemporalClient,
} from './family-runtime-temporal-client.ts';
import {
  currentWorkerSourceVersion,
  closeTemporalWorkerLogFds,
  openTemporalWorkerAppendLogFds,
  processIsAlive,
  readTemporalWorkerState,
  removeTemporalWorkerState,
  temporalWorkerStatePath,
  writeTemporalWorkerState,
} from './family-runtime-temporal-provider-parts/worker-state.ts';
import {
  buildTemporalWorkerBaseState,
  runTemporalWorkerResidentLoop,
  writeTemporalWorkerFailedExit,
  writeTemporalWorkerStartingState,
} from './family-runtime-temporal-provider-parts/worker-residency.ts';
import {
  stopOrphanTemporalForegroundWorkers,
  stopWorkerPid,
} from './family-runtime-temporal-provider-parts/worker-process.ts';
import {
  inspectTemporalWorkerRuntimeDependencies,
} from './family-runtime-temporal-provider-parts/worker-dependencies.ts';
import {
  assertTemporalWorkerMutationAllowed,
} from './family-runtime-temporal-provider-parts/worker-source-guard.ts';
import {
  resolveTemporalWorkerTaskQueue,
} from './family-runtime-temporal-provider-parts/worker-task-queue.ts';
import {
  buildTemporalStageAttemptWorkerOptions,
  resolveTemporalWorkflowModulePath,
} from './family-runtime-temporal-provider-parts/workflow-bundle.ts';
import {
  runTemporalStageAttemptReplayGate,
} from './family-runtime-temporal-provider-parts/replay-gate.ts';
import {
  runTemporalProductionResidencyProofForWorker,
} from './family-runtime-temporal-provider-parts/production-proof.ts';
import {
  inspectTemporalWorkerLifecycle,
  inspectTemporalWorkerLifecycleWithDetail,
} from './family-runtime-temporal-worker-lifecycle.ts';
export {
  inspectTemporalWorkerLifecycle,
  inspectTemporalWorkerLifecycleWithDetail,
} from './family-runtime-temporal-worker-lifecycle.ts';
export {
  queryTemporalStageAttemptWorkflow,
} from './family-runtime-temporal-provider-parts/attempt-query.ts';
export {
  buildTemporalStageAttemptMissingWorkflowCancelReceipt,
  cancelTemporalStageAttemptWorkflow,
  signalTemporalStageAttemptWorkflow,
  startTemporalStageRunWorkflow,
  queryTemporalStageRunWorkflow,
  startTemporalStageAttemptWorkflow,
} from './family-runtime-temporal-provider-parts/attempt-control.ts';
export { resolveTemporalWorkerForegroundPaths, resolveTemporalWorkerForegroundPathsFromArgv } from './family-runtime-temporal-provider-parts/foreground-paths.ts';
import { resolveTemporalWorkerForegroundPathsFromArgv } from './family-runtime-temporal-provider-parts/foreground-paths.ts';

function temporalWorkerSpawnEnvironment(input: {
  temporalAddress: string | null;
  taskQueue: string;
}) {
  const codexBinary = resolveCodexBinary();
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    OPL_TEMPORAL_ADDRESS: input.temporalAddress ?? process.env.OPL_TEMPORAL_ADDRESS,
    OPL_TEMPORAL_TASK_QUEUE: input.taskQueue,
    OPL_TEMPORAL_WORKER_STATUS: 'ready',
  };
  if (codexBinary) {
    env.OPL_CODEX_BIN = codexBinary.path;
  }
  return {
    env,
    projection: {
      OPL_TEMPORAL_ADDRESS: env.OPL_TEMPORAL_ADDRESS ?? null,
      OPL_TEMPORAL_TASK_QUEUE: env.OPL_TEMPORAL_TASK_QUEUE ?? null,
      OPL_TEMPORAL_WORKER_STATUS: env.OPL_TEMPORAL_WORKER_STATUS ?? null,
      OPL_CODEX_BIN: env.OPL_CODEX_BIN ?? null,
      codex_binary_source: codexBinary?.source ?? null,
    },
  };
}

export function buildTemporalStageAttemptWorkflowInputForTest(input: TemporalStageAttemptWorkflowInput): TemporalStageAttemptWorkflowInput {
  return guardTemporalStageAttemptWorkflowInputPayload(input);
}

export async function inspectTemporalVisibilityReadiness(options: TemporalClientOptions = {}) {
  return inspectTemporalStageAttemptVisibilityReadiness(options.paths);
}

export function buildTemporalVisibilityReadiness(input: {
  namespace?: string | null;
  taskQueue?: string | null;
  presentSearchAttributes?: string[] | null;
} = {}) {
  const namespace = input.namespace ?? resolveTemporalNamespace();
  const taskQueue = input.taskQueue ?? resolveTemporalTaskQueue();
  const present = input.presentSearchAttributes ?? null;
  return buildTemporalStageAttemptVisibilityReadiness({
    namespace,
    taskQueue,
    observedCustomAttributes: present
      ? Object.fromEntries(present.map((attribute) => [attribute, 'Keyword']))
      : null,
  });
}

export async function ensureTemporalVisibilityReadiness(options: TemporalClientOptions = {}) {
  return withTemporalClient(async (_client, connection) => {
    const before = await inspectTemporalStageAttemptVisibilityReadiness(options.paths);
    const after = await ensureTemporalStageAttemptVisibilityReady(connection, {
      namespace: resolveTemporalNamespace(),
      address: resolveTemporalAddressForPaths(options.paths).address,
    });
    return {
      surface_kind: 'temporal_visibility_repair_receipt',
      provider_kind: 'temporal',
      namespace: resolveTemporalNamespace(),
      installed_search_attributes: before.missing_search_attributes.map((attribute) => attribute.name),
      visibility_readiness: after,
      repair_status: after.readiness_status === 'ready' || after.readiness_status === 'test_server_unindexed_visibility'
        ? 'ready'
        : 'blocked',
      authority_boundary: {
        opl: 'temporal_visibility_metadata_repair_only',
        domain: 'truth_quality_artifact_gate_owner',
      },
    };
  }, options);
}

export async function runTemporalStageAttemptWorkerUntil<T>(fn: () => Promise<T>) {
  const sourceVersion = currentWorkerSourceVersion(import.meta.url);
  const dependencyHealth = inspectTemporalWorkerRuntimeDependencies({ moduleUrl: import.meta.url });
  if (dependencyHealth.status !== 'ready') {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Temporal worker runtime dependencies are unavailable; worker start is fail-closed before workflow bundle materialization.',
      {
        lifecycle_status: 'worker_dependency_unavailable',
        provider_kind: 'temporal',
        worker_dependency_health: dependencyHealth,
      },
    );
  }
  const built = await buildTemporalStageAttemptWorkerOptions({
    paths: familyRuntimePaths(),
    workflowsPath: resolveTemporalWorkflowModulePath(import.meta.url),
    activities,
    sourceVersion,
  });
  const nativeConnection = await NativeConnection.connect({ address: requireTemporalAddress() });
  try {
    const worker = await Worker.create({
      connection: nativeConnection,
      ...built.worker_options,
    });
    return await worker.runUntil(fn);
  } finally {
    await nativeConnection.close();
  }
}

export async function runTemporalStageAttemptWorkerForever() {
  return runTemporalStageAttemptWorkerUntil(
    () => new Promise<never>(() => {
      // Keep the worker resident until the process receives a termination signal.
    }),
  );
}

export async function runTemporalProductionResidencyProof(paths: TemporalWorkerPaths) {
  const worker = await inspectTemporalWorkerLifecycle(paths);
  return runTemporalProductionResidencyProofForWorker(worker);
}

export async function runTemporalWorkerForeground(paths: TemporalWorkerPaths) {
  assertTemporalWorkerMutationAllowed({ moduleUrl: import.meta.url, paths });
  await stopOrphanTemporalForegroundWorkers({
    modulePath: fileURLToPath(import.meta.url),
    familyRuntimeRoot: paths.root,
    excludePids: [process.pid],
  });
  const { address } = resolveTemporalAddressForPaths(paths);
  if (!address) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Temporal worker foreground requires OPL_TEMPORAL_ADDRESS, TEMPORAL_ADDRESS, or managed local service state.',
      {
        required_env: ['OPL_TEMPORAL_ADDRESS or managed local service state'],
        provider_kind: 'temporal',
      },
    );
  }
  const sourceVersion = currentWorkerSourceVersion(import.meta.url);
  const taskQueue = resolveTemporalWorkerTaskQueue(paths);
  const built = await buildTemporalStageAttemptWorkerOptions({
    paths,
    workflowsPath: resolveTemporalWorkflowModulePath(import.meta.url),
    activities,
    sourceVersion,
  });
  const baseState = buildTemporalWorkerBaseState({
    paths,
    pid: process.pid,
    address,
    namespace: resolveTemporalNamespace(),
    taskQueue,
    sourceVersion,
    workflowBundlePath: built.workflow_bundle.code_path,
    workflowBundleVersion: built.workflow_bundle.workflow_bundle_version,
    workflowBundleSourceVersion: built.workflow_bundle.workflow_bundle_source_version,
  });
  writeTemporalWorkerStartingState(paths, baseState);
  let nativeConnection: NativeConnection | null = null;
  let activeWorker: Worker | null = null;
  let shutdownRequested = false;
  const requestShutdown = () => {
    shutdownRequested = true;
    activeWorker?.shutdown();
  };
  process.once('SIGTERM', requestShutdown);
  process.once('SIGINT', requestShutdown);
  try {
    nativeConnection = await NativeConnection.connect({ address });
    await runTemporalWorkerResidentLoop({
      paths,
      baseState,
      isShutdownRequested: () => shutdownRequested,
      runWorkerOnce: async () => {
        const worker = await Worker.create({
          connection: nativeConnection!,
          ...built.worker_options,
        });
        activeWorker = worker;
        try {
          await worker.run();
        } finally {
          if (activeWorker === worker) {
            activeWorker = null;
          }
        }
      },
    });
  } catch (error) {
    writeTemporalWorkerFailedExit(paths, baseState, error);
    throw error;
  } finally {
    process.off('SIGTERM', requestShutdown);
    process.off('SIGINT', requestShutdown);
    await nativeConnection?.close();
  }
}

export async function startTemporalWorkerLifecycle(paths: TemporalWorkerPaths, input: { detach?: boolean } = {}) {
  assertTemporalWorkerMutationAllowed({ moduleUrl: import.meta.url, paths });
  const status = await inspectTemporalWorkerLifecycle(paths);
  if (status.lifecycle_status === 'not_configured') {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Temporal worker start requires OPL_TEMPORAL_ADDRESS or TEMPORAL_ADDRESS.',
      {
        lifecycle_status: status.lifecycle_status,
        required_env: ['OPL_TEMPORAL_ADDRESS'],
        provider_kind: 'temporal',
      },
    );
  }
  if (status.lifecycle_status === 'server_unreachable') {
    throw new FrameworkContractError('contract_shape_invalid', 'Temporal server is unreachable; worker start is fail-closed.', {
      lifecycle_status: status.lifecycle_status,
      address: status.address,
      provider_kind: 'temporal',
    });
  }
  if (status.lifecycle_status === 'worker_dependency_unavailable') {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Temporal worker runtime dependencies are unavailable; worker start is fail-closed before workflow bundle materialization.',
      {
        lifecycle_status: status.lifecycle_status,
        provider_kind: 'temporal',
        worker_dependency_health: status.worker_dependency_health,
        repair_action: status.repair_action,
      },
    );
  }
  if (status.lifecycle_status === 'worker_source_stale') {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Temporal worker start found a stale managed worker; use the explicit stop/restart repair path before starting a replacement.',
      {
        lifecycle_status: status.lifecycle_status,
        provider_kind: 'temporal',
        managed_worker_pid: status.managed_worker_pid,
        stale_worker_pid: status.stale_worker_pid,
        managed_worker_source_version: status.managed_worker_source_version,
        expected_worker_source_version: status.expected_worker_source_version,
        repair_action: status.repair_action,
      },
    );
  }
  if (status.lifecycle_status === 'ready') {
    return {
      surface_kind: 'temporal_worker_lifecycle_start',
      provider_kind: 'temporal',
      start_status: 'already_ready',
      status,
    };
  }
  if (input.detach === false) {
    await runTemporalWorkerForeground(paths);
    return {
      surface_kind: 'temporal_worker_lifecycle_start',
      provider_kind: 'temporal',
      start_status: 'foreground_completed',
      status: await inspectTemporalWorkerLifecycle(paths),
    };
  }

  const { logRefs, fds: logFds } = openTemporalWorkerAppendLogFds(paths);
  const taskQueue = resolveTemporalWorkerTaskQueue(paths);
  const spawnedWorkerEnvironment = temporalWorkerSpawnEnvironment({
    temporalAddress: status.address,
    taskQueue,
  });
  const child = spawn(
    process.execPath,
    [
      '--experimental-strip-types',
      fileURLToPath(import.meta.url),
      '--temporal-worker-foreground',
      '--family-runtime-root',
      paths.root,
    ],
    {
      cwd: process.cwd(),
      detached: true,
      stdio: ['ignore', logFds.stdout, logFds.stderr],
      env: spawnedWorkerEnvironment.env,
    },
  );
  child.unref();
  closeTemporalWorkerLogFds(logFds);
  const sourceVersion = currentWorkerSourceVersion(import.meta.url);
  const workflowBundle = await buildTemporalStageAttemptWorkerOptions({
    paths,
    workflowsPath: resolveTemporalWorkflowModulePath(import.meta.url),
    activities,
    sourceVersion,
  });
  writeTemporalWorkerState(paths, {
    provider_kind: 'temporal',
    pid: child.pid ?? 0,
    address: status.address ?? requireTemporalAddress(),
    namespace: status.namespace,
    task_queue: taskQueue,
    started_at: new Date().toISOString(),
    status: 'ready',
    source_version: sourceVersion,
    workflow_bundle_path: workflowBundle.workflow_bundle.code_path,
    workflow_bundle_version: workflowBundle.workflow_bundle.workflow_bundle_version,
    workflow_bundle_source_version: workflowBundle.workflow_bundle.workflow_bundle_source_version,
    log_refs: logRefs,
  });
  return {
    surface_kind: 'temporal_worker_lifecycle_start',
    provider_kind: 'temporal',
    start_status: 'started',
    spawned_worker_environment: spawnedWorkerEnvironment.projection,
    status: await inspectTemporalWorkerLifecycle(paths),
  };
}

export async function stopTemporalWorkerLifecycle(paths: TemporalWorkerPaths) {
  assertTemporalWorkerMutationAllowed({ moduleUrl: import.meta.url, paths });
  const before = await inspectTemporalWorkerLifecycle(paths);
  const state = readTemporalWorkerState(paths);
  let stoppedPid: number | null = null;
  let stopStatus = 'not_running';
  const stop_actions: Record<string, unknown>[] = [];
  if (state && processIsAlive(state.pid)) {
    stoppedPid = state.pid;
    const stopped = await stopWorkerPid(state.pid);
    stop_actions.push(...stopped.actions);
    stopStatus = stopped.status;
  }
  const orphanStops = await stopOrphanTemporalForegroundWorkers({
    modulePath: fileURLToPath(import.meta.url),
    familyRuntimeRoot: paths.root,
    excludePids: state?.pid ? [state.pid] : [],
  });
  if (stopStatus === 'not_running' && orphanStops.orphan_stopped_pids.length > 0) {
    stopStatus = 'stopped';
  }
  if (orphanStops.orphan_stop_incomplete_pids.length > 0) {
    stopStatus = 'stop_incomplete';
  }
  removeTemporalWorkerState(paths);
  return {
    surface_kind: 'temporal_worker_lifecycle_stop',
    provider_kind: 'temporal',
    stop_status: stopStatus,
    stopped_pid: stoppedPid,
    stop_actions,
    orphan_stopped_pids: orphanStops.orphan_stopped_pids,
    orphan_stop_incomplete_pids: orphanStops.orphan_stop_incomplete_pids,
    orphan_stop_actions: orphanStops.orphan_stop_actions,
    before,
    status: await inspectTemporalWorkerLifecycle(paths),
  };
}

export async function buildTemporalStageAttemptWorkerOptionsForTest(
  paths: TemporalWorkerPaths,
  input: { sourceVersion?: string } = {},
) {
  return buildTemporalStageAttemptWorkerOptions({
    paths,
    workflowsPath: resolveTemporalWorkflowModulePath(import.meta.url),
    activities,
    sourceVersion: input.sourceVersion ?? currentWorkerSourceVersion(import.meta.url),
  });
}

export async function buildTemporalStageAttemptReplayGateForTest(history: unknown, workflowId?: string) {
  return runTemporalStageAttemptReplayGate({
    history,
    workflowId,
    workflowsPath: resolveTemporalWorkflowModulePath(import.meta.url),
    sourceModuleUrl: import.meta.url,
  });
}

if (process.argv[2] === '--temporal-worker-foreground') {
  void runTemporalWorkerForeground(resolveTemporalWorkerForegroundPathsFromArgv()).catch((error) => {
    process.stderr.write(error instanceof Error ? `${error.message}\n` : 'Temporal worker failed.\n');
    process.exitCode = 1;
  });
}
