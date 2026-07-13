import { DatabaseSync } from 'node:sqlite';

import { buildStageAttemptWorkbench } from '../../../../src/modules/console/runtime-tray-stage-attempt-workbench.ts';
import { openQueueDb } from '../../../../src/modules/runway/family-runtime-store.ts';
import { createStageAttempt } from '../../../../src/modules/runway/family-runtime-stage-attempts.ts';
import { assert, fs, os, path, test } from '../helpers.ts';

type BoundedHistoryWorkbench = {
  attempts: Array<{
    stage_attempt_id: string;
    local_status: string;
  }>;
  evidence_attempt_count: number;
  projected_evidence_attempt_count: number;
  selected_evidence_attempt_count: number;
  attempt_history_read: Record<string, unknown>;
};

function seedBoundedAttemptHistory(stateRoot: string, count: number) {
  const previousStateRoot = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = stateRoot;
  const { db } = openQueueDb();
  let latestAttemptId = '';
  let latestAttemptStatus = '';
  try {
    db.exec('BEGIN');
    const updateTimestamps = db.prepare(`
      UPDATE stage_attempts
      SET created_at = ?, updated_at = ?
      WHERE stage_attempt_id = ?
    `);
    for (let index = 0; index < count; index += 1) {
      const attempt = createStageAttempt(db, {
        domainId: 'medautoscience',
        stageId: `bounded-history-${index}`,
        providerKind: 'temporal',
        workspaceLocator: { workspace_root: `/tmp/bounded-history-${index}` },
        taskId: `task-bounded-history-${index}`,
      }).attempt;
      const timestamp = new Date(Date.parse('2026-01-01T00:00:00.000Z') + index * 1_000).toISOString();
      updateTimestamps.run(timestamp, timestamp, attempt.stage_attempt_id);
      latestAttemptId = attempt.stage_attempt_id;
      latestAttemptStatus = attempt.status;
    }
    db.exec('COMMIT');
    return { latestAttemptId, latestAttemptStatus };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  } finally {
    db.close();
    if (previousStateRoot === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateRoot;
  }
}

test('stage attempt workbench bounds history projection and reports omitted rows fail closed', {
  timeout: 30_000,
}, async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-attempt-bounded-history-'));
  const previousStateRoot = process.env.OPL_STATE_DIR;
  try {
    const latestAttempt = seedBoundedAttemptHistory(stateRoot, 51);
    process.env.OPL_STATE_DIR = stateRoot;
    const startedAt = Date.now();
    const workbench = await buildStageAttemptWorkbench() as BoundedHistoryWorkbench;
    const elapsedMs = Date.now() - startedAt;

    assert.ok(elapsedMs < 30_000, `bounded history projection took ${elapsedMs}ms`);
    assert.equal(workbench.attempts.length, 25);
    assert.equal(workbench.evidence_attempt_count, 51);
    assert.equal(workbench.projected_evidence_attempt_count, 50);
    assert.equal(workbench.selected_evidence_attempt_count, 50);
    assert.deepEqual(workbench.attempt_history_read, {
      status: 'bounded_truncated',
      projection_complete: false,
      total_attempt_count: 51,
      scanned_attempt_count: 50,
      omitted_attempt_count: 1,
      scan_limit: 50,
      typed_diagnostic: {
        code: 'stage_attempt_history_scan_limit_reached',
        classification: 'bounded_read_model_projection',
        detail_surface: 'opl family-runtime attempt list --json',
      },
      authority_boundary: {
        omitted_attempts_authorize_global_state_inference: false,
        omitted_attempts_authorize_domain_state_change: false,
        can_create_typed_blocker: false,
      },
    });
    assert.equal(workbench.attempts[0].stage_attempt_id, latestAttempt.latestAttemptId);
    assert.equal(workbench.attempts[0].local_status, latestAttempt.latestAttemptStatus);

    const db = new DatabaseSync(path.join(stateRoot, 'family-runtime', 'queue.sqlite'), { readOnly: true });
    try {
      const persisted = db.prepare(`
        SELECT status FROM stage_attempts WHERE stage_attempt_id = ?
      `).get(latestAttempt.latestAttemptId) as { status: string };
      assert.equal(persisted.status, latestAttempt.latestAttemptStatus);
    } finally {
      db.close();
    }
  } finally {
    if (previousStateRoot === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateRoot;
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
