import { WorkflowIdConflictPolicy, WorkflowIdReusePolicy, WorkflowNotFoundError } from '@temporalio/common';

import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import {
  buildTemporalStageAttemptWorkflowInput,
  requireTemporalStageAttemptWorkflowInputLaunchable,
  resolveTemporalNamespace,
  resolveTemporalTaskQueue,
  type TemporalStageAttemptSignalKind,
  type TemporalStageAttemptSignalPayload,
  type TemporalStageAttemptWorkflowInput,
} from '../family-runtime-temporal.ts';
import {
  requireTemporalAddress,
  type TemporalClientOptions,
  type TemporalWorkerPaths,
  withTemporalClient,
  withTemporalRpcDeadline,
} from '../family-runtime-temporal-client.ts';
import {
  buildTemporalStageAttemptMemo,
  buildTemporalStageAttemptSearchAttributes,
  ensureTemporalStageAttemptVisibilityReady,
  temporalTestServerAllowsUnindexedVisibility,
} from '../family-runtime-temporal-visibility.ts';
import {
  stageAttemptOperatorUpdate,
} from '../family-runtime-temporal-workflows.ts';
import {
  resolveTemporalAddressForPaths,
} from '../family-runtime-temporal-service.ts';
import {
  resolveTemporalWorkerTaskQueue,
} from './worker-task-queue.ts';

type StageAttemptPayload = Parameters<typeof buildTemporalStageAttemptWorkflowInput>[0] & {
  stage_attempt_id: string;
  workflow_id: string;
  provider_kind: string;
};

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
  const taskQueue = options.paths
    ? resolveTemporalWorkerTaskQueue(options.paths)
    : resolveTemporalTaskQueue();
  if (!resolveTemporalAddressForPaths(options.paths).address) requireTemporalAddress();
  return withTemporalClient(async (client, connection) => {
    const visibilityReadiness = await ensureTemporalStageAttemptVisibilityReady(connection, {
      namespace: resolveTemporalNamespace(),
      address: resolveTemporalAddressForPaths(options.paths).address,
      taskQueue,
    });
    const launchInput: TemporalStageAttemptWorkflowInput = {
      ...workflowInput,
      visibility_search_attributes_upsert_enabled: visibilityReadiness.readiness_status === 'ready',
    };
    const handle = await withTemporalRpcDeadline(client, () => client.workflow.start('StageAttemptWorkflow', {
      args: [launchInput],
      taskQueue,
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
    return {
      surface_kind: 'temporal_stage_attempt_start_receipt',
      provider_kind: 'temporal',
      stage_attempt_id: attempt.stage_attempt_id,
      workflow_id: handle.workflowId,
      first_execution_run_id: handle.firstExecutionRunId,
      eagerly_started: handle.eagerlyStarted,
      namespace: resolveTemporalNamespace(),
      task_queue: taskQueue,
      transport_identity: {
        stage_attempt_id: attempt.stage_attempt_id,
        workflow_id: attempt.workflow_id,
        source_fingerprint: attempt.source_fingerprint,
      },
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
