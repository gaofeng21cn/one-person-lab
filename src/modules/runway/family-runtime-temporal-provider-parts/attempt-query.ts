import type {
  TemporalClientOptions,
} from '../family-runtime-temporal-client.ts';
import {
  withTemporalClient,
  withTemporalRpcDeadline,
} from '../family-runtime-temporal-client.ts';
import type {
  TemporalStageAttemptWorkflowState,
} from '../family-runtime-temporal.ts';
import {
  stageAttemptQuery,
} from '../family-runtime-temporal-workflows.ts';
import {
  assertTemporalStageAttemptQueryIdentity,
  assertTemporalWorkflowMemoIdentity,
} from '../family-runtime-temporal-identity.ts';

type TemporalAttemptQueryPayload = {
  stage_attempt_id: string;
  workflow_id: string;
  provider_kind: string;
  domain_id: string;
  stage_id: string;
  workspace_locator: Record<string, unknown>;
  scope_kind?: unknown;
  execution_scope?: unknown;
} & Record<string, unknown>;

function terminalFailureWorkflowStatus(status: string) {
  return status === 'FAILED' || status === 'TIMED_OUT' || status === 'CANCELED' || status === 'CANCELLED';
}

function terminalCompletedWorkflowStatus(status: string) {
  return status === 'COMPLETED';
}

export async function queryTemporalStageAttemptWorkflow(
  attempt: TemporalAttemptQueryPayload,
  options: TemporalClientOptions = {},
) {
  if (attempt.provider_kind !== 'temporal') {
    return null;
  }
  return withTemporalClient(async (client) => {
    const handle = client.workflow.getHandle(attempt.workflow_id);
    const description = await withTemporalRpcDeadline(client, () => handle.describe(), options);
    assertTemporalWorkflowMemoIdentity({
      workflowId: description.workflowId,
      memo: description.memo,
      expected: attempt,
      operation: 'query_temporal_stage_attempt',
    });
    const workflowStatus = description.status.name;
    if (terminalCompletedWorkflowStatus(workflowStatus)) {
      const query = await withTemporalRpcDeadline(
        client,
        () => handle.result() as Promise<TemporalStageAttemptWorkflowState>,
        options,
      );
      assertTemporalStageAttemptQueryIdentity({
        expected: attempt,
        query: query as unknown as Record<string, unknown>,
        operation: 'query_temporal_stage_attempt_terminal_result',
      });
      return {
        surface_kind: 'temporal_stage_attempt_query_receipt',
        provider_kind: 'temporal',
        stage_attempt_id: attempt.stage_attempt_id,
        workflow_id: attempt.workflow_id,
        run_id: description.runId,
        workflow_status: workflowStatus,
        query_source: 'workflow_result_after_terminal_completed',
        query,
        authority_boundary: {
          opl: 'temporal_workflow_transport_and_control_metadata_only',
          domain: 'truth_quality_artifact_gate_owner',
        },
      };
    }
    if (terminalFailureWorkflowStatus(workflowStatus)) {
      return {
        surface_kind: 'temporal_stage_attempt_query_receipt',
        provider_kind: 'temporal',
        stage_attempt_id: attempt.stage_attempt_id,
        workflow_id: attempt.workflow_id,
        run_id: description.runId,
        workflow_status: workflowStatus,
        query_error: {
          code: 'temporal_stage_attempt_query_unavailable_after_terminal',
          message: `Temporal workflow is already ${workflowStatus}; terminal failure is sufficient for provider sync.`,
        },
        authority_boundary: {
          opl: 'temporal_workflow_transport_and_control_metadata_only',
          domain: 'truth_quality_artifact_gate_owner',
        },
      };
    }
    let query: TemporalStageAttemptWorkflowState;
    try {
      query = await withTemporalRpcDeadline(
        client,
        () => handle.query<TemporalStageAttemptWorkflowState>(stageAttemptQuery),
        options,
      );
      assertTemporalStageAttemptQueryIdentity({
        expected: attempt,
        query: query as unknown as Record<string, unknown>,
        operation: 'query_temporal_stage_attempt_live',
      });
    } catch (error) {
      if (error && typeof error === 'object') {
        Object.assign(error, {
          temporal_query_phase: 'workflow_query',
          workflow_status: workflowStatus,
          run_id: description.runId,
        });
      }
      throw error;
    }
    return {
      surface_kind: 'temporal_stage_attempt_query_receipt',
      provider_kind: 'temporal',
      stage_attempt_id: attempt.stage_attempt_id,
      workflow_id: attempt.workflow_id,
      run_id: description.runId,
      workflow_status: workflowStatus,
      query,
      authority_boundary: {
        opl: 'temporal_workflow_transport_and_control_metadata_only',
        domain: 'truth_quality_artifact_gate_owner',
      },
    };
  }, options);
}
