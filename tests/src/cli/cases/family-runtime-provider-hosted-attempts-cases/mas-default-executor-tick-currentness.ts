import { DatabaseSync } from 'node:sqlite';

import {
  assert,
  fs,
  os,
  path,
  test,
} from './helpers.ts';
import {
  createQueueTables,
  defaultExecutorPayloadForOwner,
  insertDefaultExecutorTaskWithPayload,
  withIsolatedFamilyRuntimeEnv,
} from './mas-default-executor-current-source-helpers.ts';

import { dispatchFamilyRuntimeTask } from '../../../../../src/family-runtime-task-dispatch.ts';
import { runFamilyRuntimeQueueTick } from '../../../../../src/family-runtime-tick.ts';
import type { FamilyRuntimeTaskScope } from '../../../../../src/family-runtime-command.ts';
import { ensureProviderHostedStageAttempt } from '../../../../../src/family-runtime-provider-hosted-attempts.ts';
import { familyRuntimePaths, type FamilyRuntimeTaskRow } from '../../../../../src/family-runtime-store.ts';

type TickDispatch = { task_id: string };

function reviewerPayload(input: {
  sourceFingerprint: string;
  dispatchRef: string;
}) {
  return defaultExecutorPayloadForOwner({
    sourceFingerprint: input.sourceFingerprint,
    actionType: 'return_to_ai_reviewer_workflow',
    nextOwner: 'ai_reviewer',
    dispatchAuthority: 'ai_reviewer_record_production_handoff',
    dispatchRef: input.dispatchRef,
  });
}

function studyTaskScope(): FamilyRuntimeTaskScope {
  return {
    domainId: 'medautoscience',
    taskKind: 'domain_owner/default-executor-dispatch',
    payloadMatches: [
      {
        path: 'study_id',
        value: '002-dm-china-us-mortality-attribution',
      },
    ],
  };
}

function createSucceedingDispatchFixture() {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-dispatch-'));
  const dispatchPath = path.join(fixtureRoot, 'dispatch');
  fs.writeFileSync(
    dispatchPath,
    `#!/usr/bin/env bash
set -euo pipefail
cat <<'JSON'
{"accepted":true,"surface_kind":"mas_family_domain_handler_dispatch_receipt","will_start_llm_worker":true}
JSON
`,
    { mode: 0o755 },
  );
  return { fixtureRoot, dispatchPath };
}

test('family-runtime tick does not auto-redrive stale same-action reviewer blocker when current reviewer source row exists', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await withIsolatedFamilyRuntimeEnv(async () => {
      createQueueTables(db);
      const stalePayload = reviewerPayload({
        sourceFingerprint: 'reviewer-source-before',
        dispatchRef: 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/immutable/return_to_ai_reviewer_workflow/stale.json',
      });
      const currentPayload = reviewerPayload({
        sourceFingerprint: 'reviewer-source-after',
        dispatchRef: 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/immutable/return_to_ai_reviewer_workflow/current.json',
      });
      insertDefaultExecutorTaskWithPayload(db, {
        taskId: 'task-mas-default-stale-reviewer-provider-blocker',
        payload: stalePayload,
        dedupeKey: 'mas:dm-cvd:002:default-executor:return_to_ai_reviewer_workflow:stale-reviewer',
        createdAt: '2026-05-28T23:40:00.000Z',
        status: 'blocked',
        attempts: 1,
      });
      db.prepare(`
        UPDATE tasks
        SET last_error = 'temporal_stage_attempt_not_completed',
          dead_letter_reason = 'temporal_stage_attempt_not_completed'
        WHERE task_id = ?
      `).run('task-mas-default-stale-reviewer-provider-blocker');
      insertDefaultExecutorTaskWithPayload(db, {
        taskId: 'task-mas-default-current-reviewer-source-row',
        payload: currentPayload,
        dedupeKey: 'mas:dm-cvd:002:default-executor:return_to_ai_reviewer_workflow:current-reviewer',
        createdAt: '2026-05-28T23:50:00.000Z',
        status: 'queued',
      });
      const blockedRow = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(
        'task-mas-default-stale-reviewer-provider-blocker',
      ) as FamilyRuntimeTaskRow;
      const failedAttempt = ensureProviderHostedStageAttempt(db, blockedRow, stalePayload);
      assert.ok(failedAttempt);
      db.prepare(`
        UPDATE stage_attempts
        SET status = 'failed',
          blocked_reason = 'temporal_stage_attempt_not_completed',
          attempt_count = 1,
          provider_run_json = json_set(provider_run_json, '$.provider_status', 'failed')
        WHERE stage_attempt_id = ?
      `).run(failedAttempt.stage_attempt_id);

      let dispatchCount = 0;
      const tick = await runFamilyRuntimeQueueTick<TickDispatch>(db, familyRuntimePaths(), {
        source: 'test-current-reviewer-source-blocks-stale-redrive',
        limit: 10,
        hydrate: false,
        taskScope: studyTaskScope(),
      }, {
        enqueueTask: () => ({ accepted: false }),
        dispatchTask: (_db, _paths, selectedRow: FamilyRuntimeTaskRow) => {
          dispatchCount += 1;
          return { task_id: selectedRow.task_id };
        },
      });
      const staleTask = db.prepare(`
        SELECT status, last_error, dead_letter_reason
        FROM tasks
        WHERE task_id = ?
      `).get('task-mas-default-stale-reviewer-provider-blocker') as {
        status: string;
        last_error: string | null;
        dead_letter_reason: string | null;
      };
      const staleAttemptCount = db.prepare(`
        SELECT COUNT(*) AS count
        FROM stage_attempts
        WHERE task_id = ?
      `).get('task-mas-default-stale-reviewer-provider-blocker') as { count: number };

      assert.equal(tick.mas_default_executor_auto_redriven_count, 0);
      assert.equal(tick.mas_default_executor_auto_dead_lettered_count, 0);
      assert.equal(tick.mas_default_executor_auto_redrive_stale_skipped_count, 0);
      assert.equal(tick.mas_default_executor_superseded_count, 0);
      assert.equal(tick.selected_count, 1);
      assert.equal(
        tick.progress_first_owner_delta_admission.maintenance_reconcile_deferred_by_owner_delta,
        true,
      );
      assert.equal(dispatchCount, 1);
      assert.equal(tick.dispatches[0].task_id, 'task-mas-default-current-reviewer-source-row');
      assert.equal(staleTask.status, 'blocked');
      assert.equal(staleTask.last_error, 'temporal_stage_attempt_not_completed');
      assert.equal(staleTask.dead_letter_reason, 'temporal_stage_attempt_not_completed');
      assert.equal(staleAttemptCount.count, 1);
    });
  } finally {
    db.close();
  }
});

test('MAS analysis-campaign default executor admission starts a stage attempt instead of succeeding through domain dispatch', async () => {
  const db = new DatabaseSync(':memory:');
  const dispatch = createSucceedingDispatchFixture();
  try {
    await withIsolatedFamilyRuntimeEnv(async () => {
      const previousDispatch = process.env.OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH;
      process.env.OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH = dispatch.dispatchPath;
      try {
        createQueueTables(db);
        fs.mkdirSync(familyRuntimePaths().dispatch_dir, { recursive: true });
        const payload = defaultExecutorPayloadForOwner({
          sourceFingerprint: 'publication-blockers::497d1260db522f01',
          actionType: 'run_quality_repair_batch',
          nextOwner: 'analysis-campaign',
          dispatchAuthority: 'consumer_default_executor_dispatch',
          dispatchRef: 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/run_quality_repair_batch.json',
        });
        insertDefaultExecutorTaskWithPayload(db, {
          taskId: 'task-mas-analysis-campaign-provider-admission',
          payload: {
            ...payload,
            work_unit_id: 'analysis_claim_evidence_repair',
            work_unit_fingerprint: 'publication-blockers::497d1260db522f01',
            action_fingerprint: 'publication-blockers::497d1260db522f01',
            provider_attempt_or_lease_required: true,
            provider_completion_is_domain_completion: false,
            required_output_surface: 'artifacts/controller/repair_execution_evidence/latest.json',
          },
          dedupeKey: 'mas:dm-cvd:002:default-executor:run_quality_repair_batch:analysis-campaign',
          createdAt: '2026-06-11T17:50:24.262Z',
          status: 'queued',
        });
        const row = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(
          'task-mas-analysis-campaign-provider-admission',
        ) as FamilyRuntimeTaskRow;

        const result = await dispatchFamilyRuntimeTask(db, familyRuntimePaths(), row, {
          temporalProviderModule: async () => ({
            startTemporalStageAttemptWorkflow: async (attempt) => ({
              workflow_id: `wf_${attempt.stage_attempt_id}`,
              run_id: 'run-analysis-campaign-test',
            }),
          }),
        });
        const task = db.prepare('SELECT status FROM tasks WHERE task_id = ?').get(row.task_id) as { status: string };
        const attempts = db.prepare(`
          SELECT stage_id, status, executor_kind
          FROM stage_attempts
          WHERE task_id = ?
        `).all(row.task_id) as Array<{ stage_id: string; status: string; executor_kind: string }>;

        assert.equal(result.status, 'running');
        assert.equal(task.status, 'running');
        assert.equal(attempts.length, 1);
        assert.equal(attempts[0].stage_id, 'domain_owner/default-executor-dispatch');
        assert.equal(attempts[0].status, 'running');
        assert.equal(attempts[0].executor_kind, 'codex_cli');
      } finally {
        if (previousDispatch === undefined) {
          delete process.env.OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH;
        } else {
          process.env.OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH = previousDispatch;
        }
      }
    });
  } finally {
    db.close();
    fs.rmSync(dispatch.fixtureRoot, { recursive: true, force: true });
  }
});

test('MAS provider-required default executor task with unknown owner cannot succeed through domain dispatch', async () => {
  const db = new DatabaseSync(':memory:');
  const dispatch = createSucceedingDispatchFixture();
  try {
    await withIsolatedFamilyRuntimeEnv(async () => {
      const previousDispatch = process.env.OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH;
      process.env.OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH = dispatch.dispatchPath;
      try {
        createQueueTables(db);
        fs.mkdirSync(familyRuntimePaths().dispatch_dir, { recursive: true });
        const payload = defaultExecutorPayloadForOwner({
          sourceFingerprint: 'publication-blockers::future-owner',
          actionType: 'run_quality_repair_batch',
          nextOwner: 'future-owner',
          dispatchAuthority: 'consumer_default_executor_dispatch',
          dispatchRef: 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/run_quality_repair_batch.json',
        });
        insertDefaultExecutorTaskWithPayload(db, {
          taskId: 'task-mas-future-owner-provider-admission',
          payload: {
            ...payload,
            work_unit_id: 'future_owner_repair',
            work_unit_fingerprint: 'publication-blockers::future-owner',
            action_fingerprint: 'publication-blockers::future-owner',
            provider_attempt_or_lease_required: true,
            provider_completion_is_domain_completion: false,
          },
          dedupeKey: 'mas:dm-cvd:002:default-executor:run_quality_repair_batch:future-owner',
          createdAt: '2026-06-11T18:05:00.000Z',
          status: 'queued',
        });
        const row = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(
          'task-mas-future-owner-provider-admission',
        ) as FamilyRuntimeTaskRow;

        const result = await dispatchFamilyRuntimeTask(db, familyRuntimePaths(), row, {
          temporalProviderModule: async () => ({
            startTemporalStageAttemptWorkflow: async () => {
              throw new Error('unknown owner should not reach temporal start');
            },
          }),
        });
        const task = db.prepare(`
          SELECT status, last_error, dead_letter_reason
          FROM tasks
          WHERE task_id = ?
        `).get(row.task_id) as {
          status: string;
          last_error: string | null;
          dead_letter_reason: string | null;
        };
        const attempts = db.prepare(`
          SELECT COUNT(*) AS count
          FROM stage_attempts
          WHERE task_id = ?
        `).get(row.task_id) as { count: number };

        assert.equal(result.status, 'blocked');
        if (!('reason' in result)) {
          assert.fail('Expected blocked provider admission guard to return a reason.');
        }
        assert.equal(result.reason, 'default_executor_provider_admission_owner_not_admitted');
        assert.equal(task.status, 'blocked');
        assert.equal(task.last_error, 'default_executor_provider_admission_owner_not_admitted');
        assert.equal(task.dead_letter_reason, 'default_executor_provider_admission_owner_not_admitted');
        assert.equal(attempts.count, 0);
      } finally {
        if (previousDispatch === undefined) {
          delete process.env.OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH;
        } else {
          process.env.OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH = previousDispatch;
        }
      }
    });
  } finally {
    db.close();
    fs.rmSync(dispatch.fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime tick selects only one MAS default executor candidate per study after redrive hydration', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await withIsolatedFamilyRuntimeEnv(async () => {
      createQueueTables(db);
      insertDefaultExecutorTaskWithPayload(db, {
        taskId: 'task-mas-default-stale-redriven-same-tick',
        payload: reviewerPayload({
          sourceFingerprint: 'reviewer-source-before-single-flight',
          dispatchRef: 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/immutable/return_to_ai_reviewer_workflow/stale-single-flight.json',
        }),
        dedupeKey: 'mas:dm-cvd:002:default-executor:return_to_ai_reviewer_workflow:stale-redriven-same-tick',
        createdAt: '2026-05-28T23:40:00.000Z',
        status: 'blocked',
        attempts: 1,
      });
      db.prepare(`
        UPDATE tasks
        SET last_error = 'temporal_stage_attempt_not_completed',
          dead_letter_reason = 'temporal_stage_attempt_not_completed'
        WHERE task_id = ?
      `).run('task-mas-default-stale-redriven-same-tick');
      insertDefaultExecutorTaskWithPayload(db, {
        taskId: 'task-mas-default-current-row-same-tick',
        payload: reviewerPayload({
          sourceFingerprint: 'reviewer-source-after-single-flight',
          dispatchRef: 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/immutable/return_to_ai_reviewer_workflow/current-single-flight.json',
        }),
        dedupeKey: 'mas:dm-cvd:002:default-executor:return_to_ai_reviewer_workflow:current-row-same-tick',
        createdAt: '2026-05-28T23:50:00.000Z',
        status: 'queued',
      });

      let dispatchCount = 0;
      const tick = await runFamilyRuntimeQueueTick<TickDispatch>(db, familyRuntimePaths(), {
        source: 'test-same-study-single-flight-after-auto-redrive',
        limit: 10,
        hydrate: false,
        taskScope: studyTaskScope(),
      }, {
        enqueueTask: () => ({ accepted: false }),
        dispatchTask: (_db, _paths, selectedRow: FamilyRuntimeTaskRow) => {
          dispatchCount += 1;
          return { task_id: selectedRow.task_id };
        },
      });

      assert.equal(tick.mas_default_executor_auto_redriven_count, 0);
      assert.equal(tick.mas_default_executor_auto_redrive_stale_skipped_count, 0);
      assert.equal(tick.selected_count, 1);
      assert.equal(
        tick.progress_first_owner_delta_admission.maintenance_reconcile_deferred_by_owner_delta,
        true,
      );
      assert.equal(dispatchCount, 1);
      assert.equal(tick.dispatches[0].task_id, 'task-mas-default-current-row-same-tick');
    });
  } finally {
    db.close();
  }
});

test('family-runtime tick syncs materialized MAS closeout before treating default executor task as running', async () => {
  const db = new DatabaseSync(':memory:');
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-mas-materialized-closeout-'));
  try {
    await withIsolatedFamilyRuntimeEnv(async () => {
      createQueueTables(db);
      const studyId = '002-dm-china-us-mortality-attribution';
      const payload = {
        ...defaultExecutorPayloadForOwner({
          sourceFingerprint: 'publication-blockers::497d1260db522f01',
          actionType: 'run_quality_repair_batch',
          nextOwner: 'analysis-campaign',
          dispatchAuthority: 'consumer_default_executor_dispatch',
          dispatchRef: 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/run_quality_repair_batch.json',
        }),
        workspace_root: workspaceRoot,
        work_unit_id: 'analysis_claim_evidence_repair',
        work_unit_fingerprint: 'publication-blockers::497d1260db522f01',
      };
      insertDefaultExecutorTaskWithPayload(db, {
        taskId: 'task-mas-materialized-closeout-running',
        payload,
        dedupeKey: 'mas:dm-cvd:002:default-executor:run_quality_repair_batch:materialized-closeout',
        createdAt: '2026-06-11T20:05:37.000Z',
        status: 'running',
        attempts: 1,
        leaseOwner: 'opl-family-runtime:test',
        leaseExpiresAt: '2026-06-11T20:10:37.000Z',
      });
      const row = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(
        'task-mas-materialized-closeout-running',
      ) as FamilyRuntimeTaskRow;
      const attempt = ensureProviderHostedStageAttempt(db, row, payload, {
        newAttempt: true,
      });
      assert.ok(attempt);
      const closeoutDir = path.join(
        workspaceRoot,
        'studies',
        studyId,
        'artifacts',
        'supervision',
        'consumer',
        'default_executor_execution',
      );
      fs.mkdirSync(closeoutDir, { recursive: true });
      fs.writeFileSync(
        path.join(closeoutDir, `${attempt.stage_attempt_id}.closeout.json`),
        JSON.stringify({
          surface_kind: 'stage_attempt_closeout_packet',
          schema_version: 1,
          stage_attempt_id: attempt.stage_attempt_id,
          study_id: studyId,
          action_type: 'run_quality_repair_batch',
          work_unit_id: 'analysis_claim_evidence_repair',
          closeout_refs: [
            `studies/${studyId}/artifacts/supervision/consumer/default_executor_execution/${attempt.stage_attempt_id}.closeout.json`,
            `studies/${studyId}/artifacts/supervision/consumer/default_executor_execution/${attempt.stage_attempt_id}.closeout.json#typed_blocker`,
          ],
          next_owner: 'analysis-campaign',
          domain_ready_verdict: 'domain_gate_pending',
        }),
      );

      const tick = await runFamilyRuntimeQueueTick<TickDispatch>(db, familyRuntimePaths(), {
        source: 'test-materialized-closeout-terminal-sync',
        limit: 10,
        hydrate: false,
        taskScope: studyTaskScope(),
      }, {
        enqueueTask: () => ({ accepted: false }),
        dispatchTask: () => {
          throw new Error('materialized closeout sync should not dispatch a new task');
        },
      });
      const task = db.prepare(`
        SELECT status, lease_owner, lease_expires_at, last_error, dead_letter_reason
        FROM tasks
        WHERE task_id = ?
      `).get(row.task_id) as {
        status: string;
        lease_owner: string | null;
        lease_expires_at: string | null;
        last_error: string | null;
        dead_letter_reason: string | null;
      };
      const syncedAttempt = db.prepare(`
        SELECT status, closeout_receipt_status, provider_run_json, closeout_refs_json
        FROM stage_attempts
        WHERE stage_attempt_id = ?
      `).get(attempt.stage_attempt_id) as {
        status: string;
        closeout_receipt_status: string | null;
        provider_run_json: string;
        closeout_refs_json: string;
      };
      const providerRun = JSON.parse(syncedAttempt.provider_run_json) as Record<string, unknown>;
      const closeoutRefs = JSON.parse(syncedAttempt.closeout_refs_json) as string[];

      assert.equal(tick.mas_default_executor_terminal_synced_count, 1);
      assert.equal(tick.selected_count, 0);
      assert.equal(task.status, 'succeeded');
      assert.equal(task.lease_owner, null);
      assert.equal(task.lease_expires_at, null);
      assert.equal(task.last_error, null);
      assert.equal(task.dead_letter_reason, null);
      assert.equal(syncedAttempt.status, 'completed');
      assert.equal(syncedAttempt.closeout_receipt_status, 'accepted_typed_closeout');
      assert.equal(providerRun.provider_status, 'completed');
      assert.ok(closeoutRefs.some((ref) => ref.endsWith(`${attempt.stage_attempt_id}.closeout.json#typed_blocker`)));
    });
  } finally {
    db.close();
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('MAS analysis-campaign default executor admission starts a stage attempt instead of succeeding through domain dispatch', async () => {
  const db = new DatabaseSync(':memory:');
  const dispatch = createSucceedingDispatchFixture();
  try {
    await withIsolatedFamilyRuntimeEnv(async () => {
      const previousDispatch = process.env.OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH;
      process.env.OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH = dispatch.dispatchPath;
      try {
        createQueueTables(db);
        fs.mkdirSync(familyRuntimePaths().dispatch_dir, { recursive: true });
        const payload = defaultExecutorPayloadForOwner({
          sourceFingerprint: 'publication-blockers::497d1260db522f01',
          actionType: 'run_quality_repair_batch',
          nextOwner: 'analysis-campaign',
          dispatchAuthority: 'consumer_default_executor_dispatch',
          dispatchRef: 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/run_quality_repair_batch.json',
        });
        insertDefaultExecutorTaskWithPayload(db, {
          taskId: 'task-mas-analysis-campaign-provider-admission',
          payload: {
            ...payload,
            work_unit_id: 'analysis_claim_evidence_repair',
            work_unit_fingerprint: 'publication-blockers::497d1260db522f01',
            action_fingerprint: 'publication-blockers::497d1260db522f01',
            provider_attempt_or_lease_required: true,
            provider_completion_is_domain_completion: false,
            required_output_surface: 'artifacts/controller/repair_execution_evidence/latest.json',
          },
          dedupeKey: 'mas:dm-cvd:002:default-executor:run_quality_repair_batch:analysis-campaign',
          createdAt: '2026-06-11T17:50:24.262Z',
          status: 'queued',
        });
        const row = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(
          'task-mas-analysis-campaign-provider-admission',
        ) as FamilyRuntimeTaskRow;

        const result = await dispatchFamilyRuntimeTask(db, familyRuntimePaths(), row, {
          temporalProviderModule: async () => ({
            startTemporalStageAttemptWorkflow: async (attempt) => ({
              workflow_id: `wf_${attempt.stage_attempt_id}`,
              run_id: 'run-analysis-campaign-test',
            }),
          }),
        });
        const task = db.prepare('SELECT status FROM tasks WHERE task_id = ?').get(row.task_id) as { status: string };
        const attempts = db.prepare(`
          SELECT stage_id, status, executor_kind
          FROM stage_attempts
          WHERE task_id = ?
        `).all(row.task_id) as Array<{ stage_id: string; status: string; executor_kind: string }>;

        assert.equal(result.status, 'running');
        assert.equal(task.status, 'running');
        assert.equal(attempts.length, 1);
        assert.equal(attempts[0].stage_id, 'domain_owner/default-executor-dispatch');
        assert.equal(attempts[0].status, 'running');
        assert.equal(attempts[0].executor_kind, 'codex_cli');
      } finally {
        if (previousDispatch === undefined) {
          delete process.env.OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH;
        } else {
          process.env.OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH = previousDispatch;
        }
      }
    });
  } finally {
    db.close();
    fs.rmSync(dispatch.fixtureRoot, { recursive: true, force: true });
  }
});

test('MAS provider-required default executor task with unknown owner cannot succeed through domain dispatch', async () => {
  const db = new DatabaseSync(':memory:');
  const dispatch = createSucceedingDispatchFixture();
  try {
    await withIsolatedFamilyRuntimeEnv(async () => {
      const previousDispatch = process.env.OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH;
      process.env.OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH = dispatch.dispatchPath;
      try {
        createQueueTables(db);
        fs.mkdirSync(familyRuntimePaths().dispatch_dir, { recursive: true });
        const payload = defaultExecutorPayloadForOwner({
          sourceFingerprint: 'publication-blockers::future-owner',
          actionType: 'run_quality_repair_batch',
          nextOwner: 'future-owner',
          dispatchAuthority: 'consumer_default_executor_dispatch',
          dispatchRef: 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/run_quality_repair_batch.json',
        });
        insertDefaultExecutorTaskWithPayload(db, {
          taskId: 'task-mas-future-owner-provider-admission',
          payload: {
            ...payload,
            work_unit_id: 'future_owner_repair',
            work_unit_fingerprint: 'publication-blockers::future-owner',
            action_fingerprint: 'publication-blockers::future-owner',
            provider_attempt_or_lease_required: true,
            provider_completion_is_domain_completion: false,
          },
          dedupeKey: 'mas:dm-cvd:002:default-executor:run_quality_repair_batch:future-owner',
          createdAt: '2026-06-11T18:05:00.000Z',
          status: 'queued',
        });
        const row = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(
          'task-mas-future-owner-provider-admission',
        ) as FamilyRuntimeTaskRow;

        const result = await dispatchFamilyRuntimeTask(db, familyRuntimePaths(), row, {
          temporalProviderModule: async () => ({
            startTemporalStageAttemptWorkflow: async () => {
              throw new Error('unexpected Temporal start');
            },
          }),
        });
        const task = db.prepare('SELECT status, dead_letter_reason FROM tasks WHERE task_id = ?').get(row.task_id) as {
          status: string;
          dead_letter_reason: string | null;
        };
        const dispatchEvents = db.prepare(`
          SELECT COUNT(*) AS count
          FROM events
          WHERE task_id = ? AND event_type = 'task_dispatch_succeeded'
        `).get(row.task_id) as { count: number };

        assert.equal(result.status, 'blocked');
        assert.equal(
          (result as { reason?: string }).reason,
          'default_executor_provider_admission_owner_not_admitted',
        );
        assert.equal(task.status, 'blocked');
        assert.equal(task.dead_letter_reason, 'default_executor_provider_admission_owner_not_admitted');
        assert.equal(dispatchEvents.count, 0);
      } finally {
        if (previousDispatch === undefined) {
          delete process.env.OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH;
        } else {
          process.env.OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH = previousDispatch;
        }
      }
    });
  } finally {
    db.close();
    fs.rmSync(dispatch.fixtureRoot, { recursive: true, force: true });
  }
});
