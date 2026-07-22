import type { DatabaseSync } from 'node:sqlite';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { requireSameFamilyRuntimeExecutionIdentity } from './family-runtime-execution-scope.ts';
import {
  createStageAttemptTable,
  inspectStageAttemptPayload,
} from './family-runtime-stage-attempt-ledger.ts';
import {
  findStageRunLaunch,
} from './family-runtime-stage-run-launch-registry.ts';

function requiredIdentityId(
  value: unknown,
  field: 'stage_run_id' | 'stage_attempt_id',
  operation: string,
) {
  if (typeof value === 'string' && value.trim()) return value.trim();
  throw new FrameworkContractError(
    'contract_shape_invalid',
    `Persisted runtime admission requires ${field}.`,
    {
      failure_code: `persisted_runtime_${field}_missing`,
      operation,
    },
  );
}

export function requirePersistedStageRunActivityIdentity(input: {
  db: DatabaseSync;
  candidateIdentity: Record<string, unknown>;
  operation: string;
}) {
  const stageRunId = requiredIdentityId(
    input.candidateIdentity.stage_run_id,
    'stage_run_id',
    input.operation,
  );
  const persisted = findStageRunLaunch(input.db, stageRunId);
  if (!persisted) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Temporal activity StageRun identity is not registered in the durable launch registry.',
      {
        failure_code: 'persisted_runtime_stage_run_not_found',
        operation: input.operation,
        stage_run_id: stageRunId,
      },
    );
  }
  requireSameFamilyRuntimeExecutionIdentity({
    authorityIdentity: persisted as unknown as Record<string, unknown>,
    candidateIdentity: input.candidateIdentity,
    operation: input.operation,
    compareWorkflowId: true,
    requireStageRunId: true,
  });
  return persisted;
}

export function requirePersistedStageAttemptActivityIdentity(input: {
  db: DatabaseSync;
  candidateIdentity: Record<string, unknown>;
  operation: string;
  stageAttemptId?: string;
}) {
  const stageAttemptId = requiredIdentityId(
    input.stageAttemptId ?? input.candidateIdentity.stage_attempt_id,
    'stage_attempt_id',
    input.operation,
  );
  createStageAttemptTable(input.db);
  const persisted = inspectStageAttemptPayload(input.db, stageAttemptId);
  if (!persisted) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Temporal activity StageAttempt identity is not persisted.',
      {
        failure_code: 'persisted_runtime_stage_attempt_not_found',
        operation: input.operation,
        stage_attempt_id: stageAttemptId,
      },
    );
  }
  requireSameFamilyRuntimeExecutionIdentity({
    authorityIdentity: persisted as unknown as Record<string, unknown>,
    candidateIdentity: input.candidateIdentity,
    operation: input.operation,
    compareStageAttemptId: true,
    compareWorkflowId: true,
  });
  return persisted;
}

export function requireResolvedPersistedStageAttemptIdentity(input: {
  db: DatabaseSync;
  stageAttemptId: string;
  operation: string;
}) {
  createStageAttemptTable(input.db);
  const persisted = inspectStageAttemptPayload(input.db, input.stageAttemptId);
  if (!persisted) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Temporal activity StageAttempt identity is not persisted.',
      {
        failure_code: 'persisted_runtime_stage_attempt_not_found',
        operation: input.operation,
        stage_attempt_id: input.stageAttemptId,
      },
    );
  }
  requireSameFamilyRuntimeExecutionIdentity({
    authorityIdentity: persisted as unknown as Record<string, unknown>,
    candidateIdentity: persisted as unknown as Record<string, unknown>,
    operation: input.operation,
    compareStageAttemptId: true,
    compareWorkflowId: true,
  });
  return persisted;
}

export function requireSamePersistedStageRunAttemptIdentity(input: {
  stageRunIdentity: Record<string, unknown>;
  stageAttemptIdentity: Record<string, unknown>;
  operation: string;
}) {
  return requireSameFamilyRuntimeExecutionIdentity({
    authorityIdentity: input.stageRunIdentity,
    candidateIdentity: input.stageAttemptIdentity,
    operation: input.operation,
    requireStageRunId: true,
  });
}
