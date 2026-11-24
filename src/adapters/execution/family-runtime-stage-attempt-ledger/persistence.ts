import type { DatabaseSync } from 'node:sqlite';

import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import {
  requireRuntimeExecutionScopeMutationAllowed,
} from '../family-runtime-execution-scope-persistence.ts';
import { stageAttemptToPayload } from './payload.ts';
import type { StageAttemptRow } from './types.ts';

export function bindStageAttemptExecutionSession(db: DatabaseSync, input: {
  stageAttemptId: string;
  executionSessionRef: string;
}) {
  const row = db.prepare('SELECT * FROM stage_attempts WHERE stage_attempt_id = ?').get(
    input.stageAttemptId,
  ) as StageAttemptRow | undefined;
  if (!row) {
    throw new FrameworkContractError('cli_usage_error', 'Stage attempt not found.', {
      stage_attempt_id: input.stageAttemptId,
    });
  }
  requireRuntimeExecutionScopeMutationAllowed(db, row, 'bind_stage_attempt_execution_session');
  const executionSessionRef = input.executionSessionRef.trim();
  if (!executionSessionRef) {
    throw new FrameworkContractError('contract_shape_invalid', 'executionSessionRef must be non-empty.');
  }
  if (row.execution_session_ref && row.execution_session_ref !== executionSessionRef) {
    throw new FrameworkContractError('contract_shape_invalid', 'Stage attempt execution session is immutable.', {
      stage_attempt_id: row.stage_attempt_id,
      existing_execution_session_ref: row.execution_session_ref,
      received_execution_session_ref: executionSessionRef,
    });
  }
  db.prepare(`
    UPDATE stage_attempts SET execution_session_ref = ?, updated_at = ? WHERE stage_attempt_id = ?
  `).run(executionSessionRef, new Date().toISOString(), row.stage_attempt_id);
  const updated = db.prepare('SELECT * FROM stage_attempts WHERE stage_attempt_id = ?').get(
    row.stage_attempt_id,
  ) as StageAttemptRow;
  return stageAttemptToPayload(updated);
}

export function getStageAttemptRow(db: DatabaseSync, stageAttemptId: string) {
  return db.prepare('SELECT * FROM stage_attempts WHERE stage_attempt_id = ?').get(stageAttemptId) as
    | StageAttemptRow
    | undefined;
}

export function inspectStageAttemptPayload(db: DatabaseSync, stageAttemptId: string) {
  const row = getStageAttemptRow(db, stageAttemptId);
  return row ? stageAttemptToPayload(row) : null;
}
