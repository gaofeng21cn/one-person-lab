import { WorkflowNotFoundError } from '@temporalio/common';
import { ServiceError } from '@temporalio/client';

import { FrameworkContractError } from '../charter/index.ts';
import type { familyRuntimePaths } from './family-runtime-store.ts';
import type { queryStageAttempt } from './family-runtime-stage-attempts.ts';
import { queryTemporalStageAttemptWorkflow as defaultQueryTemporalStageAttemptWorkflow } from './family-runtime-temporal-provider-parts/attempt-query.ts';

type QueryTemporalStageAttemptWorkflow = typeof defaultQueryTemporalStageAttemptWorkflow;

export const DEFAULT_TEMPORAL_STAGE_ATTEMPT_QUERY_TIMEOUT_MS = 3_000;

function readTemporalStageAttemptQueryTimeoutMs() {
  const value = Number.parseInt(process.env.OPL_TEMPORAL_STAGE_ATTEMPT_QUERY_TIMEOUT_MS ?? '', 10);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_TEMPORAL_STAGE_ATTEMPT_QUERY_TIMEOUT_MS;
}

function timeoutObservation(
  attempt: ReturnType<typeof queryStageAttempt>['stage_attempt_query']['attempt'],
  timeoutMs: number,
) {
  return {
    surface_kind: 'temporal_stage_attempt_query_unavailable',
    provider_kind: 'temporal',
    stage_attempt_id: attempt.stage_attempt_id,
    workflow_id: attempt.workflow_id,
    status: 'unavailable',
    reason: 'temporal_stage_attempt_query_timeout',
    error: {
      code: 'temporal_stage_attempt_query_timeout',
      message: `Temporal stage attempt read-model query exceeded ${timeoutMs}ms.`,
      timeout_ms: timeoutMs,
    },
    authority_boundary: {
      opl: 'local_stage_attempt_ledger_projection_only',
      domain: 'truth_quality_artifact_gate_owner',
    },
  };
}

async function withReadModelTimeout<T>(
  promise: Promise<T>,
  attempt: ReturnType<typeof queryStageAttempt>['stage_attempt_query']['attempt'],
  timeoutMs: number,
): Promise<T | ReturnType<typeof timeoutObservation>> {
  let timeout: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<ReturnType<typeof timeoutObservation>>((resolve) => {
        timeout = setTimeout(() => resolve(timeoutObservation(attempt, timeoutMs)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

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
    const timeoutMs = readTemporalStageAttemptQueryTimeoutMs();
    const queryTemporalStageAttemptWorkflow = options.queryTemporalStageAttemptWorkflow
      ?? defaultQueryTemporalStageAttemptWorkflow;
    return await withReadModelTimeout(
      queryTemporalStageAttemptWorkflow(attempt, {
        paths: options.paths,
        connectTimeoutMs: timeoutMs,
      }),
      attempt,
      timeoutMs,
    );
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
