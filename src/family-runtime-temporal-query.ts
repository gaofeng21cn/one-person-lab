import { WorkflowNotFoundError } from '@temporalio/common';
import { ServiceError } from '@temporalio/client';

import { FrameworkContractError } from './contracts.ts';
import type { familyRuntimePaths } from './family-runtime-store.ts';
import type { queryStageAttempt } from './family-runtime-stage-attempts.ts';

async function temporalProviderModule() {
  return await import('./family-runtime-temporal-provider.ts');
}

type QueryTemporalStageAttemptWorkflow = typeof import('./family-runtime-temporal-provider.ts')['queryTemporalStageAttemptWorkflow'];

function isTemporalServiceUnreachable(error: unknown, message: string) {
  return error instanceof ServiceError
    || message === 'Failed to connect before the deadline'
    || message.includes('Failed to connect to Temporal server');
}

function temporalQueryPhase(error: unknown) {
  return error && typeof error === 'object' && !Array.isArray(error)
    ? typeof (error as Record<string, unknown>).temporal_query_phase === 'string'
      ? (error as Record<string, unknown>).temporal_query_phase
      : null
    : null;
}

function temporalWorkflowStatus(error: unknown) {
  return error && typeof error === 'object' && !Array.isArray(error)
    ? typeof (error as Record<string, unknown>).workflow_status === 'string'
      ? (error as Record<string, unknown>).workflow_status
      : null
    : null;
}

function temporalRunId(error: unknown) {
  return error && typeof error === 'object' && !Array.isArray(error)
    ? typeof (error as Record<string, unknown>).run_id === 'string'
      ? (error as Record<string, unknown>).run_id
      : null
    : null;
}

export async function queryTemporalStageAttemptReadModel(
  attempt: ReturnType<typeof queryStageAttempt>['stage_attempt_query']['attempt'],
  options: {
    paths?: Pick<ReturnType<typeof familyRuntimePaths>, 'root'>;
    queryTemporalStageAttemptWorkflow?: QueryTemporalStageAttemptWorkflow;
  } = {},
) {
  if (attempt.provider_kind !== 'temporal') {
    return null;
  }
  try {
    const queryTemporalStageAttemptWorkflow = options.queryTemporalStageAttemptWorkflow
      ?? (await temporalProviderModule()).queryTemporalStageAttemptWorkflow;
    return await queryTemporalStageAttemptWorkflow(attempt, {
      paths: options.paths,
    });
  } catch (error) {
    if (
      error instanceof FrameworkContractError
      && error.code === 'contract_shape_invalid'
      && error.message.includes('OPL_TEMPORAL_ADDRESS')
    ) {
      return {
        surface_kind: 'temporal_stage_attempt_query_unavailable',
        provider_kind: 'temporal',
        stage_attempt_id: attempt.stage_attempt_id,
        workflow_id: attempt.workflow_id,
        status: 'unavailable',
        reason: 'temporal_address_not_configured',
        error: error.toJSON().error,
        authority_boundary: {
          opl: 'local_stage_attempt_ledger_projection_only',
          domain: 'truth_quality_artifact_gate_owner',
        },
      };
    }
    const message = error instanceof Error ? error.message : String(error);
    if (temporalQueryPhase(error) === 'workflow_query') {
      return {
        surface_kind: 'temporal_stage_attempt_query_unavailable',
        provider_kind: 'temporal',
        stage_attempt_id: attempt.stage_attempt_id,
        workflow_id: attempt.workflow_id,
        run_id: temporalRunId(error),
        workflow_status: temporalWorkflowStatus(error),
        status: 'unavailable',
        reason: 'temporal_stage_attempt_query_unavailable',
        error: {
          code: 'temporal_stage_attempt_query_unavailable',
          message,
        },
        authority_boundary: {
          opl: 'local_stage_attempt_ledger_projection_only',
          domain: 'truth_quality_artifact_gate_owner',
        },
      };
    }
    if (error instanceof WorkflowNotFoundError) {
      return {
        surface_kind: 'temporal_stage_attempt_query_unavailable',
        provider_kind: 'temporal',
        stage_attempt_id: attempt.stage_attempt_id,
        workflow_id: attempt.workflow_id,
        status: 'unavailable',
        reason: 'temporal_workflow_not_started_or_not_found',
        error: {
          code: 'temporal_workflow_not_found',
          message,
        },
        authority_boundary: {
          opl: 'local_stage_attempt_ledger_projection_only',
          domain: 'truth_quality_artifact_gate_owner',
        },
      };
    }
    if (isTemporalServiceUnreachable(error, message)) {
      return {
        surface_kind: 'temporal_stage_attempt_query_unavailable',
        provider_kind: 'temporal',
        stage_attempt_id: attempt.stage_attempt_id,
        workflow_id: attempt.workflow_id,
        status: 'unavailable',
        reason: 'temporal_service_unreachable',
        error: {
          code: 'temporal_service_unreachable',
          message,
        },
        authority_boundary: {
          opl: 'local_stage_attempt_ledger_projection_only',
          domain: 'truth_quality_artifact_gate_owner',
        },
      };
    }
    throw error;
  }
}
