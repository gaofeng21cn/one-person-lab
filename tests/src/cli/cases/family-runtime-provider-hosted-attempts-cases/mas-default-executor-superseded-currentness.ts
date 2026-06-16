import { DatabaseSync } from 'node:sqlite';

import { assert, fs, os, path, test } from './helpers.ts';

import { enqueueTask } from '../../../../../src/family-runtime-enqueue.ts';
import { hydrateDomainTasks } from '../../../../../src/family-runtime-domain-intake.ts';
import { ensureProviderHostedStageAttempt } from '../../../../../src/family-runtime-provider-hosted-attempts.ts';
import { familyRuntimePaths } from '../../../../../src/family-runtime-store.ts';
import { runFamilyRuntimeQueueTick } from '../../../../../src/family-runtime-tick.ts';
import { listStageAttemptsForTask } from '../../../../../src/family-runtime-stage-attempts.ts';
import {
  createQueueTables,
  defaultExecutorPayload,
  insertSucceededTask,
  withIsolatedFamilyRuntimeEnv,
} from './mas-default-executor-helpers.ts';
import {
  masDomainProgressTransitionRequest,
  providerObservationBoundary,
  writeJsonEmitterScript,
} from '../family-runtime-current-control-provider-admission-cases/shared.ts';

test('family-runtime blocks stale MAS default executor attempts when a newer source supersedes the task', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await withIsolatedFamilyRuntimeEnv(async () => {
      createQueueTables(db);
      const stalePayload = defaultExecutorPayload('source-before');
      const currentPayload = defaultExecutorPayload('source-after');
      const staleTaskId = 'task-mas-default-superseded-stale';
      const currentTaskId = 'task-mas-default-superseded-current';
      insertSucceededTask(db, {
        taskId: staleTaskId,
        domainId: 'medautoscience',
        taskKind: 'domain_owner/default-executor-dispatch',
        payload: stalePayload,
        dedupeKey: 'mas:dm-cvd:002:default-executor:run_quality_repair_batch:stale',
      });
      insertSucceededTask(db, {
        taskId: currentTaskId,
        domainId: 'medautoscience',
        taskKind: 'domain_owner/default-executor-dispatch',
        payload: currentPayload,
        dedupeKey: 'mas:dm-cvd:002:default-executor:run_quality_repair_batch:current',
      });
      db.prepare("UPDATE tasks SET status = 'queued' WHERE task_id IN (?, ?)").run(staleTaskId, currentTaskId);
      db.prepare("UPDATE tasks SET created_at = '2026-05-31T00:00:00.000Z' WHERE task_id = ?").run(staleTaskId);
      db.prepare("UPDATE tasks SET created_at = '2026-05-31T00:01:00.000Z' WHERE task_id = ?").run(currentTaskId);
      const staleRow = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(staleTaskId) as Parameters<
        typeof ensureProviderHostedStageAttempt
      >[1];
      const staleAttempt = ensureProviderHostedStageAttempt(db, staleRow, stalePayload);
      assert.ok(staleAttempt);

      const tick = await runFamilyRuntimeQueueTick(db, familyRuntimePaths(), {
        source: 'test-superseded-default-executor',
        limit: 10,
        hydrate: false,
      }, {
        enqueueTask,
        dispatchTask: async (_db, _paths, row) => ({
          status: 'selected',
          task_id: row.task_id,
        }),
      });
      const staleTask = db.prepare(`
        SELECT status, last_error, dead_letter_reason
        FROM tasks
        WHERE task_id = ?
      `).get(staleTaskId) as { status: string; last_error: string | null; dead_letter_reason: string | null };
      const [blockedAttempt] = listStageAttemptsForTask(db, staleTaskId);
      const event = db.prepare(`
        SELECT payload_json
        FROM events
        WHERE task_id = ? AND event_type = 'task_default_executor_superseded_by_current_source'
        LIMIT 1
      `).get(staleTaskId) as { payload_json: string } | undefined;
      const eventPayload = event ? JSON.parse(event.payload_json) : null;

      assert.equal(tick.mas_default_executor_superseded_count, 1);
      assert.equal(tick.default_executor_superseded_count, 1);
      assert.deepEqual(tick.dispatches, [{ status: 'selected', task_id: currentTaskId }]);
      assert.equal(staleTask.status, 'blocked');
      assert.equal(staleTask.last_error, 'mas_default_executor_superseded_by_current_source');
      assert.equal(staleTask.dead_letter_reason, 'mas_default_executor_superseded_by_current_source');
      assert.equal(blockedAttempt.status, 'blocked');
      assert.equal(blockedAttempt.blocked_reason, 'mas_default_executor_superseded_by_current_source');
      assert.equal(blockedAttempt.activity_events.at(-1).activity_kind, 'mas_default_executor_currentness');
      assert.equal(blockedAttempt.provider_run.provider_status, 'blocked');
      assert.ok(eventPayload);
      assert.deepEqual(eventPayload.blocked_stage_attempt_ids, [staleAttempt.stage_attempt_id]);
      assert.equal(eventPayload.authority_boundary.domain_truth_mutation, false);
    });
  } finally {
    db.close();
  }
});

test('family-runtime reconciles historical superseded MAS default executor attempts left queued', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await withIsolatedFamilyRuntimeEnv(async () => {
      createQueueTables(db);
      const stalePayload = defaultExecutorPayload('source-before');
      const currentPayload = defaultExecutorPayload('source-after');
      const staleTaskId = 'task-mas-default-historical-superseded-stale';
      const currentTaskId = 'task-mas-default-historical-superseded-current';
      insertSucceededTask(db, {
        taskId: staleTaskId,
        domainId: 'medautoscience',
        taskKind: 'domain_owner/default-executor-dispatch',
        payload: stalePayload,
        dedupeKey: 'mas:dm-cvd:003:default-executor:return_to_ai_reviewer_workflow:stale',
      });
      insertSucceededTask(db, {
        taskId: currentTaskId,
        domainId: 'medautoscience',
        taskKind: 'domain_owner/default-executor-dispatch',
        payload: currentPayload,
        dedupeKey: 'mas:dm-cvd:003:default-executor:return_to_ai_reviewer_workflow:current',
      });
      db.prepare("UPDATE tasks SET created_at = '2026-05-31T00:00:00.000Z' WHERE task_id = ?").run(staleTaskId);
      db.prepare("UPDATE tasks SET created_at = '2026-05-31T00:01:00.000Z' WHERE task_id = ?").run(currentTaskId);
      db.prepare(`
        UPDATE tasks
        SET status = 'blocked', last_error = ?, dead_letter_reason = ?
        WHERE task_id = ?
      `).run(
        'mas_default_executor_superseded_by_current_source',
        'mas_default_executor_superseded_by_current_source',
        staleTaskId,
      );
      const staleRow = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(staleTaskId) as Parameters<
        typeof ensureProviderHostedStageAttempt
      >[1];
      const staleAttempt = ensureProviderHostedStageAttempt(db, staleRow, stalePayload);
      assert.ok(staleAttempt);

      const tick = await runFamilyRuntimeQueueTick(db, familyRuntimePaths(), {
        source: 'test-historical-superseded-default-executor',
        limit: 10,
        hydrate: false,
      }, {
        enqueueTask,
        dispatchTask: async (_db, _paths, row) => ({
          status: 'selected',
          task_id: row.task_id,
        }),
      });
      const [blockedAttempt] = listStageAttemptsForTask(db, staleTaskId);
      const event = db.prepare(`
        SELECT payload_json
        FROM events
        WHERE task_id = ? AND event_type = 'task_default_executor_superseded_attempts_reconciled'
        LIMIT 1
      `).get(staleTaskId) as { payload_json: string } | undefined;
      const eventPayload = event ? JSON.parse(event.payload_json) : null;

      assert.equal(tick.mas_default_executor_superseded_attempt_reconciled_count, 1);
      assert.deepEqual(tick.dispatches, []);
      assert.equal(blockedAttempt.status, 'blocked');
      assert.equal(blockedAttempt.blocked_reason, 'mas_default_executor_superseded_by_current_source');
      assert.equal(blockedAttempt.provider_run.provider_status, 'blocked');
      assert.ok(eventPayload);
      assert.deepEqual(eventPayload.reconciled_stage_attempt_ids, [staleAttempt.stage_attempt_id]);
      assert.equal(eventPayload.authority_boundary.domain_truth_mutation, false);
    });
  } finally {
    db.close();
  }
});

test('family-runtime does not let historical superseded blocker shadow current MAS admission', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await withIsolatedFamilyRuntimeEnv(async () => {
      createQueueTables(db);
      const stalePayload = defaultExecutorPayload('source-before');
      const currentPayload = defaultExecutorPayload('source-after');
      const staleTaskId = 'task-mas-default-superseded-blocker-residue';
      const currentTaskId = 'task-mas-default-current-admission-after-superseded-blocker';
      insertSucceededTask(db, {
        taskId: staleTaskId,
        domainId: 'medautoscience',
        taskKind: 'domain_owner/default-executor-dispatch',
        payload: stalePayload,
        dedupeKey: 'mas:dm-cvd:003:default-executor:return_to_ai_reviewer_workflow:superseded-blocker',
      });
      insertSucceededTask(db, {
        taskId: currentTaskId,
        domainId: 'medautoscience',
        taskKind: 'domain_owner/default-executor-dispatch',
        payload: currentPayload,
        dedupeKey: 'mas:dm-cvd:003:default-executor:return_to_ai_reviewer_workflow:current-after-blocker',
      });
      db.prepare(`
        UPDATE tasks
        SET status = 'queued', created_at = '2026-06-11T00:01:00.000Z'
        WHERE task_id = ?
      `).run(currentTaskId);
      db.prepare(`
        UPDATE tasks
        SET status = 'blocked',
          last_error = 'mas_default_executor_superseded_by_current_source',
          dead_letter_reason = 'mas_default_executor_superseded_by_current_source',
          created_at = '2026-06-11T00:02:00.000Z'
        WHERE task_id = ?
      `).run(staleTaskId);

      const tick = await runFamilyRuntimeQueueTick(db, familyRuntimePaths(), {
        source: 'test-superseded-blocker-does-not-shadow-current-admission',
        limit: 10,
        hydrate: false,
      }, {
        enqueueTask,
        dispatchTask: async (_db, _paths, row) => ({
          status: 'selected',
          task_id: row.task_id,
        }),
      });
      const currentTask = db.prepare(`
        SELECT status, last_error, dead_letter_reason
        FROM tasks
        WHERE task_id = ?
      `).get(currentTaskId) as { status: string; last_error: string | null; dead_letter_reason: string | null };
      const supersededEvent = db.prepare(`
        SELECT payload_json
        FROM events
        WHERE task_id = ? AND event_type = 'task_default_executor_superseded_by_current_source'
        LIMIT 1
      `).get(currentTaskId) as { payload_json: string } | undefined;

      assert.equal(tick.mas_default_executor_superseded_count, 0);
      assert.deepEqual(tick.dispatches, [{ status: 'selected', task_id: currentTaskId }]);
      assert.equal(currentTask.status, 'queued');
      assert.equal(currentTask.last_error, null);
      assert.equal(currentTask.dead_letter_reason, null);
      assert.equal(supersededEvent, undefined);
    });
  } finally {
    db.close();
  }
});

test('family-runtime blocks existing stale MAS default executor rows when current-control admission is identity-blocked', async () => {
  const db = new DatabaseSync(':memory:');
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-current-control-existing-row-'));
  try {
    await withIsolatedFamilyRuntimeEnv(async () => {
      createQueueTables(db);
      const workspaceRoot = path.join(fixtureRoot, 'workspace');
      const exportPath = path.join(fixtureRoot, 'export');
      const currentControlPath = path.join(
        workspaceRoot,
        'runtime',
        'artifacts',
        'supervision',
        'opl_current_control_state',
        'latest.json',
      );
      const studyId = '002-dm-china-us-mortality-attribution';
      const staleQueuedTaskId = 'task-mas-current-control-existing-row-stale-queued';
      const staleWaitingTaskId = 'task-mas-current-control-existing-row-stale-waiting';
      const staleQueuedPayload = defaultExecutorPayload('sha256:stale-sidecar-queued');
      const staleWaitingPayload = {
        ...defaultExecutorPayload('sha256:stale-sidecar-waiting'),
        action_type: 'return_to_ai_reviewer_workflow',
        work_unit_id: 'stale_ai_reviewer_workflow',
        dispatch_ref:
          'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/return_to_ai_reviewer_workflow.json',
      };
      insertSucceededTask(db, {
        taskId: staleQueuedTaskId,
        domainId: 'medautoscience',
        taskKind: 'domain_owner/default-executor-dispatch',
        payload: staleQueuedPayload,
        dedupeKey: 'mas:dm002:default-executor:run_quality_repair_batch:stale-existing-queued',
      });
      insertSucceededTask(db, {
        taskId: staleWaitingTaskId,
        domainId: 'medautoscience',
        taskKind: 'domain_owner/default-executor-dispatch',
        payload: staleWaitingPayload,
        dedupeKey: 'mas:dm002:default-executor:return_to_ai_reviewer_workflow:stale-existing-waiting',
      });
      db.prepare(`
        UPDATE tasks
        SET status = 'queued',
          created_at = '2026-06-14T00:00:00.000Z',
          updated_at = '2026-06-14T00:00:00.000Z'
        WHERE task_id = ?
      `).run(staleQueuedTaskId);
      db.prepare(`
        UPDATE tasks
        SET status = 'waiting_approval',
          requires_approval = 1,
          last_error = 'operator_hold:preexisting_review',
          created_at = '2026-06-14T00:01:00.000Z',
          updated_at = '2026-06-14T00:01:00.000Z'
        WHERE task_id = ?
      `).run(staleWaitingTaskId);
      fs.mkdirSync(path.dirname(currentControlPath), { recursive: true });
      fs.writeFileSync(currentControlPath, JSON.stringify({
        surface: 'opl_current_control_state',
        provider_admission_pending_count: 1,
        provider_admission_candidates: [
          {
            status: 'provider_admission_pending',
            study_id: studyId,
            quest_id: studyId,
            action_type: 'return_to_ai_reviewer_workflow',
            work_unit_id: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
            work_unit_fingerprint: 'sha256:current-control-blocked-existing-row',
            action_fingerprint: 'sha256:current-control-blocked-existing-row',
            source_fingerprint: 'sha256:current-control-blocked-existing-row',
            dispatch_authority: 'ai_reviewer_record_production_handoff',
            dispatch_path: path.join(
              workspaceRoot,
              'studies',
              studyId,
              'artifacts',
              'supervision',
              'consumer',
              'default_executor_dispatches',
              'return_to_ai_reviewer_workflow.json',
            ),
            route_identity_key: 'owner-route::dm002::blocked-existing-row',
            attempt_idempotency_key: 'owner-route-attempt::dm002::blocked-existing-row',
            next_executable_owner: 'ai_reviewer',
            owner_route_current: true,
            provider_attempt_or_lease_required: true,
            provider_completion_is_domain_completion: false,
            stage_transition_authority_boundary: providerObservationBoundary(),
            opl_domain_progress_transition_request: masDomainProgressTransitionRequest({
              studyId,
              actionType: 'return_to_ai_reviewer_workflow',
              workUnitId: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
              workUnitFingerprint: 'sha256:current-control-blocked-existing-row',
              sourceGeneration: 'truth-event-current-control-blocked-existing-row',
              idempotencyKey: 'owner-route-attempt::dm002::blocked-existing-row',
            }),
          },
        ],
      }), 'utf8');
      writeJsonEmitterScript(exportPath, {
        surface_kind: 'mas_family_domain_handler_export',
        workspace: {
          workspace_root: workspaceRoot,
          workspace_exists: true,
        },
        pending_family_tasks: [],
      });
      process.env.OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_EXPORT = exportPath;

      const hydration = hydrateDomainTasks(db, familyRuntimePaths(), {
        domainId: 'medautoscience',
        source: 'test-current-control-existing-row:hydrate',
      }, enqueueTask);
      const tick = await runFamilyRuntimeQueueTick(db, familyRuntimePaths(), {
        source: 'test-current-control-existing-row',
        limit: 10,
        hydrate: false,
      }, {
        enqueueTask,
        dispatchTask: async (_db, _paths, row) => ({
          status: 'selected',
          task_id: row.task_id,
        }),
      });
      const rows = db.prepare(`
        SELECT task_id, status, last_error, dead_letter_reason
        FROM tasks
        WHERE task_id IN (?, ?)
        ORDER BY task_id
      `).all(staleQueuedTaskId, staleWaitingTaskId) as Array<{
        task_id: string;
        status: string;
        last_error: string | null;
        dead_letter_reason: string | null;
      }>;
      const events = db.prepare(`
        SELECT task_id, payload_json
        FROM events
        WHERE event_type = 'task_default_executor_superseded_by_current_source'
        ORDER BY task_id
      `).all() as Array<{ task_id: string; payload_json: string }>;
      const rowsById = new Map(rows.map((row) => [row.task_id, row]));
      const eventsById = new Map(events.map((event) => [event.task_id, JSON.parse(event.payload_json)]));
      const [hydrationExport] = hydration.exports as Array<{
        blocked: Array<{ reason: string }>;
      }>;

      assert.equal(hydration.enqueued_count, 0);
      assert.equal(hydration.blocked_count, 1);
      assert.equal(hydration.suppressed_count, 2);
      assert.equal(hydrationExport.blocked[0].reason, 'current_control_provider_admission_stage_packet_ref_missing');
      assert.equal(tick.selected_count, 0);
      assert.equal(tick.mas_default_executor_superseded_count, 0);
      assert.deepEqual(tick.dispatches, []);
      for (const taskId of [staleQueuedTaskId, staleWaitingTaskId]) {
        assert.equal(rowsById.get(taskId)?.status, 'blocked');
        assert.equal(rowsById.get(taskId)?.last_error, 'mas_default_executor_superseded_by_current_source');
        assert.equal(rowsById.get(taskId)?.dead_letter_reason, 'mas_default_executor_superseded_by_current_source');
        assert.equal(eventsById.get(taskId)?.reason, 'same_study_current_control_admission_blocked');
        assert.equal(eventsById.get(taskId)?.current_blocked_reason, 'current_control_provider_admission_stage_packet_ref_missing');
        assert.equal(eventsById.get(taskId)?.study_id, studyId);
        assert.equal(eventsById.get(taskId)?.authority_boundary.domain_truth_mutation, false);
      }
    });
  } finally {
    db.close();
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
