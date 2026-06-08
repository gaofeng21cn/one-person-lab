import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { WorkflowIdConflictPolicy, WorkflowIdReusePolicy, WorkflowNotFoundError } from '@temporalio/common';
import { NativeConnection, Worker } from '@temporalio/worker';

import { resolveCodexBinary } from './codex.ts';
import { FrameworkContractError } from './contracts.ts';
import { familyRuntimePaths } from './family-runtime-store.ts';
import * as activities from './family-runtime-temporal-activities.ts';
import {
  buildTemporalStageAttemptWorkflowInput, requireTemporalStageAttemptWorkflowInputLaunchable,
  guardTemporalStageAttemptWorkflowInputPayload,
  resolveTemporalNamespace,
  resolveTemporalTaskQueue,
  type TemporalStageAttemptSignalKind,
  type TemporalStageAttemptSignalPayload,
  type TemporalStageAttemptWorkflowInput,
} from './family-runtime-temporal.ts';
import {
  buildTemporalWorkerLifecycleContract,
  buildTemporalWorkerReadiness,
} from './family-runtime-temporal-readiness.ts';
import {
  buildTemporalStageAttemptMemo,
  buildTemporalStageAttemptSearchAttributes,
  buildTemporalStageAttemptVisibilityReadiness,
  inspectTemporalStageAttemptVisibilityReadiness,
  ensureTemporalStageAttemptVisibilityReady,
  temporalTestServerAllowsUnindexedVisibility,
} from './family-runtime-temporal-visibility.ts';
export {
  inspectTemporalStageAttemptVisibilityReadiness,
} from './family-runtime-temporal-visibility.ts';
export {
  buildTemporalWorkerLifecycleContract,
  buildTemporalWorkerReadiness,
  resolveTemporalWorkerReadinessStatus,
  type TemporalWorkerReadinessStatus,
} from './family-runtime-temporal-readiness.ts';
import {
  stageAttemptOperatorUpdate,
} from './family-runtime-temporal-workflows.ts';
import {
  inspectTemporalServiceLifecycle,
  probeTemporalServer,
  resolveTemporalAddressForPaths,
} from './family-runtime-temporal-service.ts';
import {
  requireTemporalAddress,
  type TemporalClientOptions,
  type TemporalWorkerPaths,
  withTemporalClient,
  withTemporalRpcDeadline,
} from './family-runtime-temporal-client.ts';
import {
  currentWorkerSourceVersion,
  buildTemporalWorkerCrashDiagnostic,
  closeTemporalWorkerLogFds,
  openTemporalWorkerAppendLogFds,
  processIsAlive,
  readTemporalWorkerState,
  removeTemporalWorkerState,
  temporalWorkerStatePath,
  workerSourceVersionsEquivalent,
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
  inspectTemporalWorkerLifecycleFast,
} from './family-runtime-temporal-provider-parts/worker-lifecycle-fast.ts';
import {
  inspectTemporalWorkerRuntimeDependencies,
} from './family-runtime-temporal-provider-parts/worker-dependencies.ts';
import {
  assertTemporalWorkerMutationAllowed,
  buildTemporalWorkerMutationGuard,
} from './family-runtime-temporal-provider-parts/worker-source-guard.ts';
import {
  buildTemporalStageAttemptWorkerOptions,
  resolveTemporalWorkflowModulePath,
} from './family-runtime-temporal-provider-parts/workflow-bundle.ts';
import {
  recordStageRunExecutionAuthorizationReceipts,
} from './stage-run-execution-authorization-ledger.ts';
import {
  runTemporalStageAttemptReplayGate,
} from './family-runtime-temporal-provider-parts/replay-gate.ts';
import {
  runTemporalProductionResidencyProofForWorker,
} from './family-runtime-temporal-provider-parts/production-proof.ts';
export {
  queryTemporalStageAttemptWorkflow,
} from './family-runtime-temporal-provider-parts/attempt-query.ts';
export {
  buildTemporalSchedulerTickWorkflowArgs,
  buildTemporalSchedulerHealthProjection,
  ensureTemporalSchedulerCadence,
  inspectTemporalSchedulerCadence,
  removeTemporalSchedulerCadence,
  triggerTemporalSchedulerCadence,
} from './family-runtime-temporal-provider-parts/scheduler-cadence.ts';
export { resolveTemporalWorkerForegroundPaths, resolveTemporalWorkerForegroundPathsFromArgv } from './family-runtime-temporal-provider-parts/foreground-paths.ts';
import { resolveTemporalWorkerForegroundPathsFromArgv } from './family-runtime-temporal-provider-parts/foreground-paths.ts';

type TemporalLifecycleInspectionDetail = 'fast' | 'full';

type StageAttemptPayload = Parameters<typeof buildTemporalStageAttemptWorkflowInput>[0] & {
  stage_attempt_id: string;
  workflow_id: string;
  provider_kind: string;
};

function temporalWorkerSpawnEnvironment(input: {
  temporalAddress: string | null;
}) {
  const codexBinary = resolveCodexBinary();
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    OPL_TEMPORAL_ADDRESS: input.temporalAddress ?? process.env.OPL_TEMPORAL_ADDRESS,
    OPL_TEMPORAL_WORKER_STATUS: 'ready',
  };
  if (codexBinary) {
    env.OPL_CODEX_BIN = codexBinary.path;
  }
  return {
    env,
    projection: {
      OPL_TEMPORAL_ADDRESS: env.OPL_TEMPORAL_ADDRESS ?? null,
      OPL_TEMPORAL_WORKER_STATUS: env.OPL_TEMPORAL_WORKER_STATUS ?? null,
      OPL_CODEX_BIN: env.OPL_CODEX_BIN ?? null,
      codex_binary_source: codexBinary?.source ?? null,
    },
  };
}

export async function inspectTemporalWorkerLifecycle(paths: TemporalWorkerPaths) {
  return inspectTemporalWorkerLifecycleWithDetail(paths, { detail: 'full' });
}

export async function inspectTemporalWorkerLifecycleWithDetail(
  paths: TemporalWorkerPaths,
  input: { detail?: TemporalLifecycleInspectionDetail } = {},
) {
  const detail = input.detail ?? 'full';
  if (detail === 'fast') {
    return inspectTemporalWorkerLifecycleFast(paths);
  }
  const service = await inspectTemporalServiceLifecycle(paths);
  const { address, addressSource } = resolveTemporalAddressForPaths(paths);
  const namespace = resolveTemporalNamespace();
  const taskQueue = resolveTemporalTaskQueue();
  const state = readTemporalWorkerState(paths);
  const stateMatchesConfig =
    state?.address === address
    && state.namespace === namespace
    && state.task_queue === taskQueue;
  const expectedWorkerSourceVersion = currentWorkerSourceVersion(import.meta.url);
  const stateSourceCurrent = stateMatchesConfig && state
    ? workerSourceVersionsEquivalent(state.source_version, expectedWorkerSourceVersion)
    : false;
  const stateProcessAlive = state ? processIsAlive(state.pid) : false;
  const statePidAlive = stateMatchesConfig && stateProcessAlive;
  const stateProcessExited = Boolean(state && !stateProcessAlive && (state.status === 'ready' || state.status === 'exited'));
  const pidAlive = statePidAlive && stateSourceCurrent;
  const envWorkerReady = process.env.OPL_TEMPORAL_WORKER_ENABLED?.trim() === '1'
    || process.env.OPL_TEMPORAL_WORKER_STATUS?.trim() === 'ready';
  const serverReachable = address ? await probeTemporalServer(address) : false;
  const dependencyHealth = inspectTemporalWorkerRuntimeDependencies({ moduleUrl: import.meta.url });
  const workerMutationGuard = buildTemporalWorkerMutationGuard({ moduleUrl: import.meta.url, paths });
  const workerReady = Boolean(serverReachable && dependencyHealth.status === 'ready' && (pidAlive || envWorkerReady));
  const visibilityReadiness = serverReachable
    ? await inspectTemporalStageAttemptVisibilityReadiness(paths)
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

export async function inspectTemporalVisibilityReadiness(options: TemporalClientOptions = {}) {
  return inspectTemporalStageAttemptVisibilityReadiness(options.paths);
}

export function buildTemporalVisibilityReadiness(input: {
  namespace?: string | null;
  presentSearchAttributes?: string[] | null;
} = {}) {
  const namespace = input.namespace ?? resolveTemporalNamespace();
  const present = input.presentSearchAttributes ?? null;
  return buildTemporalStageAttemptVisibilityReadiness({
    namespace,
    taskQueue: resolveTemporalTaskQueue(),
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

export async function startTemporalStageAttemptWorkflow(
  attempt: StageAttemptPayload,
  options: TemporalClientOptions = {},
) {
  if (attempt.provider_kind !== 'temporal') {
    throw new FrameworkContractError('cli_usage_error', 'Temporal start requires a temporal stage attempt.', {
      stage_attempt_id: attempt.stage_attempt_id,
      provider_kind: attempt.provider_kind,
    });
  }
  const workflowInput = requireTemporalStageAttemptWorkflowInputLaunchable(
    buildTemporalStageAttemptWorkflowInput(attempt),
  );
  if (!resolveTemporalAddressForPaths(options.paths).address) requireTemporalAddress();
  return withTemporalClient(async (client, connection) => {
    const visibilityReadiness = await ensureTemporalStageAttemptVisibilityReady(connection, {
      namespace: resolveTemporalNamespace(),
      address: resolveTemporalAddressForPaths(options.paths).address,
    });
    const launchInput: TemporalStageAttemptWorkflowInput = {
      ...workflowInput,
      visibility_search_attributes_upsert_enabled: visibilityReadiness.readiness_status === 'ready',
    };
    const handle = await withTemporalRpcDeadline(client, () => client.workflow.start('StageAttemptWorkflow', {
      args: [launchInput],
      taskQueue: resolveTemporalTaskQueue(),
      workflowId: attempt.workflow_id,
      staticSummary: `OPL stage attempt ${attempt.stage_attempt_id}`,
      staticDetails: [
        `OPL stage attempt: ${attempt.stage_attempt_id}`,
        `Domain: ${attempt.domain_id}`,
        `Stage: ${attempt.stage_id}`,
        `Executor: ${attempt.executor_kind}`,
      ].join('\n'),
      workflowIdConflictPolicy: WorkflowIdConflictPolicy.USE_EXISTING,
      workflowIdReusePolicy: WorkflowIdReusePolicy.REJECT_DUPLICATE,
      memo: buildTemporalStageAttemptMemo(launchInput),
      ...temporalTestServerAllowsUnindexedVisibility()
        ? {}
        : { searchAttributes: buildTemporalStageAttemptSearchAttributes(launchInput) },
    }), options);
    const authorization = launchInput.opl_execution_authorization;
    const executionAuthorizationLedgerRecord = authorization
      ? recordStageRunExecutionAuthorizationReceipts([authorization])
      : null;
    return {
      surface_kind: 'temporal_stage_attempt_start_receipt',
      provider_kind: 'temporal',
      stage_attempt_id: attempt.stage_attempt_id,
      workflow_id: handle.workflowId,
      first_execution_run_id: handle.firstExecutionRunId,
      eagerly_started: handle.eagerlyStarted,
      namespace: resolveTemporalNamespace(),
      task_queue: resolveTemporalTaskQueue(),
      execution_authorization: authorization ?? null,
      execution_authorization_ledger_record: executionAuthorizationLedgerRecord,
      execution_authorization_receipt_refs:
        executionAuthorizationLedgerRecord?.status === 'recorded'
          ? executionAuthorizationLedgerRecord.receipt_refs
          : [],
      visibility_readiness: visibilityReadiness,
      authority_boundary: {
        opl: 'temporal_workflow_transport_and_control_metadata_only',
        domain: 'truth_quality_artifact_gate_owner',
      },
    };
  }, options);
}

export async function signalTemporalStageAttemptWorkflow(input: {
  attempt: StageAttemptPayload;
  signalKind: TemporalStageAttemptSignalKind;
  payload: Record<string, unknown>;
  source?: string;
  paths?: TemporalWorkerPaths;
}) {
  if (input.attempt.provider_kind !== 'temporal') {
    return null;
  }
  return withTemporalClient(async (client) => {
    const handle = client.workflow.getHandle(input.attempt.workflow_id);
    const signal: TemporalStageAttemptSignalPayload = {
      signal_kind: input.signalKind,
      payload: input.payload,
      source: input.source ?? 'opl-cli',
      received_at: new Date().toISOString(),
    };
    const updateReceipt = await withTemporalRpcDeadline(client, () => handle.executeUpdate(stageAttemptOperatorUpdate, {
      args: [signal],
    }), { paths: input.paths });
    return {
      surface_kind: 'temporal_stage_attempt_operator_update_receipt',
      provider_kind: 'temporal',
      stage_attempt_id: input.attempt.stage_attempt_id,
      workflow_id: input.attempt.workflow_id,
      signal_kind: input.signalKind,
      update_receipt: updateReceipt,
      authority_boundary: {
        opl: 'temporal_update_ack_and_transport_metadata_only',
        domain: 'truth_quality_artifact_gate_owner',
        provider_completion_is_domain_ready: false,
      },
    };
  }, { paths: input.paths });
}

export function buildTemporalStageAttemptMissingWorkflowCancelReceipt(input: {
  stageAttemptId: string;
  workflowId: string;
  reason: string;
  source?: string;
  message?: string;
}) {
  return {
    surface_kind: 'temporal_stage_attempt_cancel_receipt',
    provider_kind: 'temporal',
    stage_attempt_id: input.stageAttemptId,
    workflow_id: input.workflowId,
    cancel_requested_at: new Date().toISOString(),
    reason: input.reason,
    source: input.source ?? 'opl-cli',
    cancel_status: 'workflow_not_started_or_not_found',
    degraded_reason: 'temporal_workflow_not_started_or_not_found',
    error: {
      code: 'temporal_workflow_not_found',
      message: input.message ?? `workflow not found for ID: ${input.workflowId}`,
    },
    authority_boundary: {
      opl: 'temporal_workflow_cancellation_transport_only',
      domain: 'truth_quality_artifact_gate_owner',
      provider_completion_is_domain_ready: false,
    },
  };
}

export async function cancelTemporalStageAttemptWorkflow(input: {
  attempt: StageAttemptPayload;
  reason: string;
  source?: string;
  paths?: TemporalWorkerPaths;
}) {
  if (input.attempt.provider_kind !== 'temporal') {
    throw new FrameworkContractError('cli_usage_error', 'Temporal cancel requires a temporal stage attempt.', {
      stage_attempt_id: input.attempt.stage_attempt_id,
      provider_kind: input.attempt.provider_kind,
    });
  }
  const reason = input.reason.trim();
  if (!reason) {
    throw new FrameworkContractError('cli_usage_error', 'Temporal cancel requires a non-empty reason.', {
      stage_attempt_id: input.attempt.stage_attempt_id,
    });
  }
  return withTemporalClient(async (client) => {
    const handle = client.workflow.getHandle(input.attempt.workflow_id);
    try {
      await withTemporalRpcDeadline(client, () => handle.cancel(), { paths: input.paths });
    } catch (error) {
      if (error instanceof WorkflowNotFoundError) {
        return buildTemporalStageAttemptMissingWorkflowCancelReceipt({
          stageAttemptId: input.attempt.stage_attempt_id,
          workflowId: input.attempt.workflow_id,
          reason,
          source: input.source,
          message: error.message,
        });
      }
      throw error;
    }
    return {
      surface_kind: 'temporal_stage_attempt_cancel_receipt',
      provider_kind: 'temporal',
      stage_attempt_id: input.attempt.stage_attempt_id,
      workflow_id: input.attempt.workflow_id,
      cancel_requested_at: new Date().toISOString(),
      reason,
      source: input.source ?? 'opl-cli',
      authority_boundary: {
        opl: 'temporal_workflow_cancellation_transport_only',
        domain: 'truth_quality_artifact_gate_owner',
        provider_completion_is_domain_ready: false,
      },
    };
  }, { paths: input.paths });
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
    taskQueue: resolveTemporalTaskQueue(),
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
  const spawnedWorkerEnvironment = temporalWorkerSpawnEnvironment({
    temporalAddress: status.address,
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
    task_queue: status.task_queue,
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

export function buildTemporalStageAttemptWorkflowInputForTest(input: TemporalStageAttemptWorkflowInput): TemporalStageAttemptWorkflowInput {
  return guardTemporalStageAttemptWorkflowInputPayload(input);
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
