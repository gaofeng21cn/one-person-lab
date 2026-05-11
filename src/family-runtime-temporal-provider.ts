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

type StageAttemptPayload = Parameters<typeof buildTemporalStageAttemptWorkflowInput>[0] & {
  stage_attempt_id: string;
  workflow_id: string;
  provider_kind: string;
};

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

export function buildTemporalWorkerReadiness(input: {
  address?: string | null;
  namespace?: string | null;
  taskQueue?: string | null;
  workerEnabled?: string | null;
  workerStatus?: string | null;
} = {}) {
  const address = input.address ?? resolveTemporalAddress();
  const namespace = input.namespace ?? resolveTemporalNamespace();
  const taskQueue = input.taskQueue ?? resolveTemporalTaskQueue();
  const workerEnabled = input.workerEnabled ?? process.env.OPL_TEMPORAL_WORKER_ENABLED ?? null;
  const workerStatus = input.workerStatus ?? process.env.OPL_TEMPORAL_WORKER_STATUS ?? null;
  const workerReady = Boolean(address)
    && (workerEnabled?.trim() === '1' || workerStatus?.trim() === 'ready');
  const blockers = [
    ...(!address ? ['temporal_runtime_not_configured'] : []),
    ...(address && !workerReady ? ['temporal_worker_not_confirmed'] : []),
  ];
  return {
    surface_kind: 'temporal_worker_readiness',
    provider_kind: 'temporal',
    readiness_status: workerReady ? 'ready' : address ? 'worker_not_confirmed' : 'not_configured',
    worker_ready: workerReady,
    address,
    namespace,
    task_queue: taskQueue,
    default_task_queue: DEFAULT_TEMPORAL_TASK_QUEUE,
    live_probe_started_worker: false,
    blockers,
    lifecycle: buildTemporalWorkerLifecycleContract(),
    authority_boundary: {
      opl: 'worker_lifecycle_readiness_projection_only',
      domain: 'truth_quality_artifact_gate_owner',
    },
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
