import type { DatabaseSync } from 'node:sqlite';

export const WORKBENCH_ATTEMPT_LIST_LIMIT = 25;
export const WORKBENCH_DISTINCT_EVIDENCE_ATTEMPT_LIMIT = 50;
export const WORKBENCH_EVIDENCE_SCAN_LIMIT = 50;

export function nonArchivedStageAttemptCount(db: DatabaseSync) {
  const row = db.prepare(`
    SELECT COUNT(*) AS count
    FROM stage_attempts
    WHERE archived_at IS NULL
  `).get() as { count: number };
  return Number(row.count);
}

export function attemptHistoryReadProjection(totalAttemptCount: number, scannedAttemptCount: number) {
  const omittedAttemptCount = Math.max(totalAttemptCount - scannedAttemptCount, 0);
  const projectionComplete = omittedAttemptCount === 0;
  return {
    status: projectionComplete ? 'complete' : 'bounded_truncated',
    projection_complete: projectionComplete,
    total_attempt_count: totalAttemptCount,
    scanned_attempt_count: scannedAttemptCount,
    omitted_attempt_count: omittedAttemptCount,
    scan_limit: WORKBENCH_EVIDENCE_SCAN_LIMIT,
    typed_diagnostic: projectionComplete
      ? null
      : {
          code: 'stage_attempt_history_scan_limit_reached',
          classification: 'bounded_read_model_projection',
          detail_surface: 'opl family-runtime attempt list --json',
        },
    authority_boundary: {
      omitted_attempts_authorize_global_state_inference: false,
      omitted_attempts_authorize_domain_state_change: false,
      can_create_typed_blocker: false,
    },
  };
}
