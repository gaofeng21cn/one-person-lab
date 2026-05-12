import fs from 'node:fs';
import net from 'node:net';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client, Connection } from '@temporalio/client';
import { WorkflowIdConflictPolicy, WorkflowIdReusePolicy } from '@temporalio/common';
import { NativeConnection, Worker } from '@temporalio/worker';

import { FrameworkContractError } from './contracts.ts';
import * as activities from './family-runtime-temporal-activities.ts';
import {
  buildTemporalStageAttemptWorkflowInput,
  DEFAULT_TEMPORAL_TASK_QUEUE,
  resolveTemporalAddress,
  resolveTemporalNamespace,
  resolveTemporalTaskQueue,
  type TemporalStageAttemptSignalKind,
  type TemporalStageAttemptSignalPayload,
  type TemporalStageAttemptWorkflowInput,
  type TemporalStageAttemptWorkflowState,
} from './family-runtime-temporal.ts';
import {
  humanGateSignal,
  resumeSignal,
  stageAttemptQuery,
  userInstructionSignal,
} from './family-runtime-temporal-workflows.ts';
import type { familyRuntimePaths } from './family-runtime-store.ts';

type StageAttemptPayload = Parameters<typeof buildTemporalStageAttemptWorkflowInput>[0] & {
  stage_attempt_id: string;
  workflow_id: string;
  provider_kind: string;
};

export type TemporalWorkerReadinessStatus =
  | 'not_configured'
  | 'server_unreachable'
  | 'worker_not_ready'
  | 'ready';

type TemporalWorkerState = {
  provider_kind: 'temporal';
  pid: number;
  address: string;
  namespace: string;
  task_queue: string;
  started_at: string;
  status: 'starting' | 'ready';
};

type TemporalWorkerPaths = Pick<ReturnType<typeof familyRuntimePaths>, 'root'>;

function workflowModulePath() {
  const extension = path.extname(fileURLToPath(import.meta.url)) === '.ts' ? '.ts' : '.js';
  return fileURLToPath(new URL(`./family-runtime-temporal-workflows${extension}`, import.meta.url));
}

function requireTemporalAddress() {
  const address = resolveTemporalAddress();
  if (!address) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Temporal provider start/query/signal requires OPL_TEMPORAL_ADDRESS or TEMPORAL_ADDRESS.',
      {
        required_env: ['OPL_TEMPORAL_ADDRESS'],
        provider_kind: 'temporal',
      },
    );
  }
  return address;
}

function temporalWorkerStatePath(paths: TemporalWorkerPaths) {
  return path.join(paths.root, 'temporal-worker.json');
}

function readTemporalWorkerState(paths: TemporalWorkerPaths) {
  try {
    const parsed = JSON.parse(fs.readFileSync(temporalWorkerStatePath(paths), 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    const state = parsed as Partial<TemporalWorkerState>;
    if (
      state.provider_kind !== 'temporal'
      || !Number.isInteger(state.pid)
      || typeof state.address !== 'string'
      || typeof state.namespace !== 'string'
      || typeof state.task_queue !== 'string'
      || (state.status !== 'starting' && state.status !== 'ready')
    ) {
      return null;
    }
    return state as TemporalWorkerState;
  } catch {
    return null;
  }
}

function writeTemporalWorkerState(paths: TemporalWorkerPaths, state: TemporalWorkerState) {
  fs.mkdirSync(paths.root, { recursive: true });
  fs.writeFileSync(temporalWorkerStatePath(paths), `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function removeTemporalWorkerState(paths: TemporalWorkerPaths) {
  fs.rmSync(temporalWorkerStatePath(paths), { force: true });
}

function processIsAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function parseTemporalAddress(address: string) {
  const [host, portRaw] = address.split(':');
  const port = Number.parseInt(portRaw ?? '', 10);
  if (!host || !Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new FrameworkContractError('contract_shape_invalid', 'Temporal address must use host:port.', {
      address,
      required_env: ['OPL_TEMPORAL_ADDRESS'],
    });
  }
  return { host, port };
}

async function probeTemporalServer(address: string, timeoutMs = 500) {
  return await new Promise<boolean>((resolve) => {
    const { host, port } = parseTemporalAddress(address);
    const socket = net.createConnection({ host, port });
    let settled = false;
    const finish = (reachable: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve(reachable);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
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

export function buildTemporalWorkerReadiness(input: {
  address?: string | null;
  namespace?: string | null;
  taskQueue?: string | null;
  workerEnabled?: string | null;
  workerStatus?: string | null;
  serverReachable?: boolean | null;
  liveProbeStartedWorker?: boolean | null;
  unreachableReason?: string | null;
  managedWorkerPid?: number | null;
  managedWorkerStatePath?: string | null;
} = {}) {
  const address = input.address ?? resolveTemporalAddress();
  const namespace = input.namespace ?? resolveTemporalNamespace();
  const taskQueue = input.taskQueue ?? resolveTemporalTaskQueue();
  const workerEnabled = input.workerEnabled ?? process.env.OPL_TEMPORAL_WORKER_ENABLED ?? null;
  const workerStatus = input.workerStatus ?? process.env.OPL_TEMPORAL_WORKER_STATUS ?? null;
  const serverReachable = input.serverReachable ?? null;
  const workerReady = Boolean(address)
    && serverReachable !== false
    && (workerEnabled?.trim() === '1' || workerStatus?.trim() === 'ready');
  const readinessStatus = resolveTemporalWorkerReadinessStatus({
    address,
    serverReachable,
    workerReady,
  });
  const blockers = [
    ...(!address ? ['temporal_runtime_not_configured'] : []),
    ...(address && serverReachable === false ? ['temporal_server_unreachable'] : []),
    ...(address && serverReachable !== false && !workerReady ? ['temporal_worker_not_ready'] : []),
  ];
  return {
    surface_kind: 'temporal_worker_readiness',
    provider_kind: 'temporal',
    readiness_status: readinessStatus,
    worker_ready: workerReady,
    server_reachable: serverReachable,
    address,
    namespace,
    task_queue: taskQueue,
    default_task_queue: DEFAULT_TEMPORAL_TASK_QUEUE,
    live_probe_started_worker: input.liveProbeStartedWorker ?? false,
    unreachable_reason: input.unreachableReason ?? null,
    managed_worker_pid: input.managedWorkerPid ?? null,
    managed_worker_state_path: input.managedWorkerStatePath ?? null,
    blockers,
    lifecycle: buildTemporalWorkerLifecycleContract(),
    authority_boundary: {
      opl: 'worker_lifecycle_readiness_projection_only',
      domain: 'truth_quality_artifact_gate_owner',
    },
  };
}

export async function inspectTemporalWorkerLifecycle(paths: TemporalWorkerPaths) {
  const address = resolveTemporalAddress();
  const namespace = resolveTemporalNamespace();
  const taskQueue = resolveTemporalTaskQueue();
  const state = readTemporalWorkerState(paths);
  const stateMatchesConfig =
    state?.address === address
    && state.namespace === namespace
    && state.task_queue === taskQueue;
  const pidAlive = stateMatchesConfig && state ? processIsAlive(state.pid) : false;
  const envWorkerReady = process.env.OPL_TEMPORAL_WORKER_ENABLED?.trim() === '1'
    || process.env.OPL_TEMPORAL_WORKER_STATUS?.trim() === 'ready';
  const serverReachable = address ? await probeTemporalServer(address) : false;
  const workerReady = Boolean(serverReachable && (pidAlive || envWorkerReady));
  const readiness = buildTemporalWorkerReadiness({
    address,
    namespace,
    taskQueue,
    workerEnabled: envWorkerReady ? '1' : null,
    workerStatus: pidAlive ? 'ready' : null,
    serverReachable,
    managedWorkerPid: pidAlive && state ? state.pid : null,
    managedWorkerStatePath: temporalWorkerStatePath(paths),
  });
  if (state && !pidAlive && state.status === 'ready') {
    removeTemporalWorkerState(paths);
  }
  return {
    ...readiness,
    surface_kind: 'temporal_worker_lifecycle_status',
    lifecycle_status: readiness.readiness_status,
  };
}

async function withTemporalClient<T>(fn: (client: Client, connection: Connection) => Promise<T>) {
  const connection = await Connection.connect({ address: requireTemporalAddress() });
  try {
    return await fn(new Client({ connection, namespace: resolveTemporalNamespace() }), connection);
  } finally {
    await connection.close();
  }
}

function signalNameFor(kind: TemporalStageAttemptSignalKind) {
  if (kind === 'human_gate') {
    return humanGateSignal;
  }
  if (kind === 'user_instruction') {
    return userInstructionSignal;
  }
  return resumeSignal;
}

export async function startTemporalStageAttemptWorkflow(attempt: StageAttemptPayload) {
  if (attempt.provider_kind !== 'temporal') {
    throw new FrameworkContractError('cli_usage_error', 'Temporal start requires a temporal stage attempt.', {
      stage_attempt_id: attempt.stage_attempt_id,
      provider_kind: attempt.provider_kind,
    });
  }
  return withTemporalClient(async (client) => {
    const input = buildTemporalStageAttemptWorkflowInput(attempt);
    const handle = await client.workflow.start('StageAttemptWorkflow', {
      args: [input],
      taskQueue: resolveTemporalTaskQueue(),
      workflowId: attempt.workflow_id,
      workflowIdConflictPolicy: WorkflowIdConflictPolicy.USE_EXISTING,
      workflowIdReusePolicy: WorkflowIdReusePolicy.REJECT_DUPLICATE,
    });
    return {
      surface_kind: 'temporal_stage_attempt_start_receipt',
      provider_kind: 'temporal',
      stage_attempt_id: attempt.stage_attempt_id,
      workflow_id: handle.workflowId,
      first_execution_run_id: handle.firstExecutionRunId,
      eagerly_started: handle.eagerlyStarted,
      namespace: resolveTemporalNamespace(),
      task_queue: resolveTemporalTaskQueue(),
      authority_boundary: {
        opl: 'temporal_workflow_transport_and_control_metadata_only',
        domain: 'truth_quality_artifact_gate_owner',
      },
    };
  });
}

export async function queryTemporalStageAttemptWorkflow(attempt: StageAttemptPayload) {
  if (attempt.provider_kind !== 'temporal') {
    return null;
  }
  return withTemporalClient(async (client) => {
    const handle = client.workflow.getHandle(attempt.workflow_id);
    const [description, query] = await Promise.all([
      handle.describe(),
      handle.query<TemporalStageAttemptWorkflowState>(stageAttemptQuery),
    ]);
    return {
      surface_kind: 'temporal_stage_attempt_query_receipt',
      provider_kind: 'temporal',
      stage_attempt_id: attempt.stage_attempt_id,
      workflow_id: attempt.workflow_id,
      run_id: description.runId,
      workflow_status: description.status.name,
      query,
      authority_boundary: {
        opl: 'temporal_workflow_transport_and_control_metadata_only',
        domain: 'truth_quality_artifact_gate_owner',
      },
    };
  });
}

export async function signalTemporalStageAttemptWorkflow(input: {
  attempt: StageAttemptPayload;
  signalKind: TemporalStageAttemptSignalKind;
  payload: Record<string, unknown>;
  source?: string;
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
    await handle.signal(signalNameFor(input.signalKind), signal);
    return {
      surface_kind: 'temporal_stage_attempt_signal_receipt',
      provider_kind: 'temporal',
      stage_attempt_id: input.attempt.stage_attempt_id,
      workflow_id: input.attempt.workflow_id,
      signal_kind: input.signalKind,
      authority_boundary: {
        opl: 'temporal_signal_transport_only',
        domain: 'truth_quality_artifact_gate_owner',
      },
    };
  });
}

function temporalProductionProbeInput(
  suffix: string,
  closeoutPacket: Record<string, unknown> | null,
): TemporalStageAttemptWorkflowInput {
  return {
    stage_attempt_id: `sat_temporal_production_${suffix}`,
    workflow_id: `wf_temporal_production_${suffix}`,
    domain_id: 'medautoscience',
    stage_id: 'production-residency-proof',
    workspace_locator: {
      workspace_root: '/tmp/opl-temporal-production-residency-proof',
      artifact_root: '/tmp/opl-temporal-production-residency-proof/artifacts',
    },
    source_fingerprint: `sha256:temporal-production-residency-${suffix}`,
    executor_kind: 'codex_cli',
    retry_budget: {
      max_attempts: 3,
    },
    task_id: `task-temporal-production-residency-${suffix}`,
    stage_packet_ref: `packet:temporal-production-residency:${suffix}`,
    checkpoint_refs: [`checkpoint:temporal-production-residency:${suffix}`],
    closeout_packet: closeoutPacket,
  };
}

function temporalProductionTypedCloseoutPacket() {
  return {
    surface_kind: 'stage_attempt_closeout_packet',
    closeout_refs: ['receipt:temporal-production-residency-domain-closeout'],
    consumed_refs: ['evidence:temporal-production-residency'],
    consumed_memory_refs: ['memory:publication-route-production-residency'],
    writeback_receipt_refs: ['memory-writeback:temporal-production-residency-receipt'],
    rejected_writes: [{ reason: 'domain_truth_write_forbidden' }],
    next_owner: 'med-autoscience',
    domain_ready_verdict: 'domain_gate_pending',
    route_impact: {
      decision: 'production_residency_transport_probe',
      next_owner: 'med-autoscience',
    },
  };
}

export async function runTemporalStageAttemptWorkerUntil<T>(fn: () => Promise<T>) {
  const nativeConnection = await NativeConnection.connect({ address: requireTemporalAddress() });
  try {
    const worker = await Worker.create({
      connection: nativeConnection,
      namespace: resolveTemporalNamespace(),
      taskQueue: resolveTemporalTaskQueue(),
      workflowsPath: workflowModulePath(),
      activities,
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
  if (worker.lifecycle_status !== 'ready') {
    return {
      surface_kind: 'opl_temporal_external_production_residency_proof',
      provider_kind: 'temporal',
      proof_environment: 'external_temporal_service_and_managed_worker',
      closeout_status: 'production_residency_blocked',
      blockers: worker.blockers.length > 0 ? worker.blockers : ['temporal_worker_not_ready'],
      temporal_worker_lifecycle: worker,
      checks: {
        external_temporal_server_reachable: worker.server_reachable === true,
        managed_worker_ready: worker.worker_ready === true,
        worker_completed_attempt: false,
        worker_restart_requery: false,
        signal_history_preserved: false,
        typed_closeout_required_for_completed: false,
        missing_closeout_blocks_completion: false,
        retry_or_dead_letter_boundary_observed: false,
        domain_truth_boundary_preserved: true,
      },
      completed_attempt: null,
      restarted_worker_requery: null,
      blocked_attempt: null,
      authority_boundary: {
        opl: 'temporal_residency_proof_and_transport_metadata_only',
        domain: 'truth_quality_artifact_gate_owner',
        provider_completion_is_domain_ready: false,
      },
    };
  }

  const address = requireTemporalAddress();
  const namespace = resolveTemporalNamespace();
  const taskQueue = resolveTemporalTaskQueue();
  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const completedWorkflowId = `wf-temporal-production-complete-${suffix}`;
  const blockedWorkflowId = `wf-temporal-production-blocked-${suffix}`;
  return await withTemporalClient(async (client) => {
    const completedHandle = await client.workflow.start('StageAttemptWorkflow', {
      args: [
        {
          ...temporalProductionProbeInput('complete', temporalProductionTypedCloseoutPacket()),
          workflow_id: completedWorkflowId,
        },
      ],
      taskQueue,
      workflowId: completedWorkflowId,
      workflowIdConflictPolicy: WorkflowIdConflictPolicy.FAIL,
      workflowIdReusePolicy: WorkflowIdReusePolicy.REJECT_DUPLICATE,
    });
    await completedHandle.signal(humanGateSignal, {
      signal_kind: 'human_gate',
      payload: {
        human_gate_ref: 'gate:temporal-production-residency-proof',
        reason: 'operator_review',
      },
      source: 'temporal-production-residency-proof',
    });
    await completedHandle.signal(userInstructionSignal, {
      signal_kind: 'user_instruction',
      payload: {
        instruction_ref: 'user:production-residency-revision-request',
      },
      source: 'temporal-production-residency-proof',
    });
    await completedHandle.signal(resumeSignal, {
      signal_kind: 'resume',
      payload: {
        resume_ref: 'resume:temporal-production-residency-proof',
        reason: 'proof_resume',
      },
      source: 'temporal-production-residency-proof',
    });
    const queriedWhileResident = await completedHandle.query<TemporalStageAttemptWorkflowState>(stageAttemptQuery);
    const completedState = await completedHandle.result();

    const restartedHandle = client.workflow.getHandle(
      completedWorkflowId,
      undefined,
      { firstExecutionRunId: completedHandle.firstExecutionRunId },
    );
    let requery: {
      requery_status: string;
      query_available: boolean;
      query?: TemporalStageAttemptWorkflowState;
      diagnostic_workflow_status?: string;
      diagnostic_run_id?: string;
      query_error?: string;
    };
    try {
      requery = {
        requery_status: 'stage_attempt_query_available_after_worker_restart',
        query_available: true,
        query: await restartedHandle.query<TemporalStageAttemptWorkflowState>(stageAttemptQuery),
      };
    } catch (error) {
      const description = await restartedHandle.describe();
      requery = {
        requery_status: 'stage_attempt_query_unavailable_after_worker_restart',
        query_available: false,
        query_error: error instanceof Error ? error.message : String(error),
        diagnostic_workflow_status: description.status.name,
        diagnostic_run_id: description.runId,
      };
    }

    const blockedHandle = await client.workflow.start('StageAttemptWorkflow', {
      args: [
        {
          ...temporalProductionProbeInput('blocked', null),
          workflow_id: blockedWorkflowId,
        },
      ],
      taskQueue,
      workflowId: blockedWorkflowId,
      workflowIdConflictPolicy: WorkflowIdConflictPolicy.FAIL,
      workflowIdReusePolicy: WorkflowIdReusePolicy.REJECT_DUPLICATE,
    });
    const blockedState = await blockedHandle.result();
    const requeryState = requery.query_available && requery.query ? requery.query : null;
    const checks = {
      external_temporal_server_reachable: true,
      managed_worker_ready: true,
      worker_completed_attempt: completedState.status === 'completed',
      worker_restart_requery: requeryState?.stage_attempt_id === completedState.stage_attempt_id,
      signal_history_preserved:
        completedState.signals.length === 3
        && queriedWhileResident.signals.length === 3,
      typed_closeout_required_for_completed:
        completedState.completion_boundary.provider_completion === 'completed'
        && completedState.closeout_refs.length > 0,
      missing_closeout_blocks_completion:
        blockedState.status === 'blocked'
        && blockedState.completion_boundary.provider_completion === 'not_completed',
      retry_or_dead_letter_boundary_observed:
        blockedState.activity_events.some(
          (event: Record<string, unknown>) => event.activity_kind === 'domain_sidecar_dispatch_activity'
            && event.blocked_reason === 'typed_closeout_packet_required',
        ),
      domain_truth_boundary_preserved:
        completedState.authority_boundary.domain === 'truth_quality_artifact_gate_owner'
        && completedState.completion_boundary.provider_completion_is_domain_ready === false,
    };
    const proven = Object.values(checks).every(Boolean);
    return {
      surface_kind: 'opl_temporal_external_production_residency_proof',
      provider_kind: 'temporal',
      proof_environment: 'external_temporal_service_and_managed_worker',
      closeout_status: proven ? 'production_residency_proven' : 'production_residency_failed',
      address,
      namespace,
      task_queue: taskQueue,
      temporal_worker_lifecycle: worker,
      blockers: proven ? [] : ['temporal_production_residency_checks_failed'],
      checks,
      completed_attempt: {
        workflow_id: completedHandle.workflowId,
        run_id: completedHandle.firstExecutionRunId,
        status: completedState.status,
        signal_count: completedState.signals.length,
        closeout_refs: completedState.closeout_refs,
        consumed_refs: completedState.consumed_refs,
        consumed_memory_refs: completedState.consumed_memory_refs,
        writeback_receipt_refs: completedState.writeback_receipt_refs,
        domain_ready_verdict: completedState.completion_boundary.domain_ready_verdict,
      },
      restarted_worker_requery: {
        workflow_id: completedWorkflowId,
        requery_status: requery.requery_status,
        query_available: requery.query_available,
        status: requeryState?.status ?? null,
        run_id: requeryState ? completedHandle.firstExecutionRunId : null,
        diagnostic_workflow_status: requery.diagnostic_workflow_status ?? null,
        diagnostic_run_id: requery.diagnostic_run_id ?? null,
      },
      blocked_attempt: {
        workflow_id: blockedHandle.workflowId,
        run_id: blockedHandle.firstExecutionRunId,
        status: blockedState.status,
        provider_completion: blockedState.completion_boundary.provider_completion,
        closeout_refs: blockedState.closeout_refs,
        blocked_reason:
          blockedState.activity_events.find(
            (event: Record<string, unknown>) => event.activity_kind === 'domain_sidecar_dispatch_activity',
          )?.blocked_reason ?? null,
      },
      authority_boundary: {
        opl: 'temporal_residency_proof_and_transport_metadata_only',
        domain: 'truth_quality_artifact_gate_owner',
        provider_completion_is_domain_ready: false,
      },
    };
  });
}

export async function runTemporalWorkerForeground(paths: TemporalWorkerPaths) {
  const address = requireTemporalAddress();
  writeTemporalWorkerState(paths, {
    provider_kind: 'temporal',
    pid: process.pid,
    address,
    namespace: resolveTemporalNamespace(),
    task_queue: resolveTemporalTaskQueue(),
    started_at: new Date().toISOString(),
    status: 'starting',
  });
  const nativeConnection = await NativeConnection.connect({ address });
  try {
    const worker = await Worker.create({
      connection: nativeConnection,
      namespace: resolveTemporalNamespace(),
      taskQueue: resolveTemporalTaskQueue(),
      workflowsPath: workflowModulePath(),
      activities,
    });
    writeTemporalWorkerState(paths, {
      provider_kind: 'temporal',
      pid: process.pid,
      address,
      namespace: resolveTemporalNamespace(),
      task_queue: resolveTemporalTaskQueue(),
      started_at: new Date().toISOString(),
      status: 'ready',
    });
    await worker.run();
  } finally {
    removeTemporalWorkerState(paths);
    await nativeConnection.close();
  }
}

export async function startTemporalWorkerLifecycle(paths: TemporalWorkerPaths, input: { detach?: boolean } = {}) {
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

  const child = spawn(
    process.execPath,
    ['--experimental-strip-types', fileURLToPath(import.meta.url), '--temporal-worker-foreground'],
    {
      cwd: process.cwd(),
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        OPL_TEMPORAL_WORKER_STATUS: 'ready',
      },
    },
  );
  child.unref();
  writeTemporalWorkerState(paths, {
    provider_kind: 'temporal',
    pid: child.pid ?? 0,
    address: status.address ?? requireTemporalAddress(),
    namespace: status.namespace,
    task_queue: status.task_queue,
    started_at: new Date().toISOString(),
    status: 'ready',
  });
  return {
    surface_kind: 'temporal_worker_lifecycle_start',
    provider_kind: 'temporal',
    start_status: 'started',
    status: await inspectTemporalWorkerLifecycle(paths),
  };
}

export async function stopTemporalWorkerLifecycle(paths: TemporalWorkerPaths) {
  const before = await inspectTemporalWorkerLifecycle(paths);
  const state = readTemporalWorkerState(paths);
  let stoppedPid: number | null = null;
  if (state && processIsAlive(state.pid)) {
    process.kill(state.pid, 'SIGTERM');
    stoppedPid = state.pid;
  }
  removeTemporalWorkerState(paths);
  return {
    surface_kind: 'temporal_worker_lifecycle_stop',
    provider_kind: 'temporal',
    stop_status: stoppedPid ? 'stopped' : 'not_running',
    stopped_pid: stoppedPid,
    before,
    status: await inspectTemporalWorkerLifecycle(paths),
  };
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

export function buildTemporalStageAttemptWorkflowInputForTest(
  input: TemporalStageAttemptWorkflowInput,
): TemporalStageAttemptWorkflowInput {
  return input;
}

if (process.argv[2] === '--temporal-worker-foreground') {
  const paths = {
    root: path.join(process.env.OPL_STATE_DIR?.trim() || path.join(process.cwd(), '.opl-state'), 'family-runtime'),
  };
  void runTemporalWorkerForeground(paths).catch((error) => {
    process.stderr.write(error instanceof Error ? `${error.message}\n` : 'Temporal worker failed.\n');
    process.exitCode = 1;
  });
}
