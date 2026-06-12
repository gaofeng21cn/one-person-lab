import { DatabaseSync } from 'node:sqlite';

import {
  assert,
  test,
} from './helpers.ts';
import { enqueueTask } from '../../../../../src/family-runtime-enqueue.ts';
import { MAS_STAGE_NATIVE_OWNER_ANSWER_MISSING_REASON } from '../../../../../src/family-runtime-mas-stage-native-owner-answer.ts';
import { ensureProviderHostedStageAttempt } from '../../../../../src/family-runtime-provider-hosted-attempts.ts';
import { insertEvent } from '../../../../../src/family-runtime-store.ts';
import { listStageAttemptsForTask } from '../../../../../src/family-runtime-stage-attempts.ts';
import {
  createQueueTables,
  defaultExecutorPayload,
  insertSucceededTask,
  withIsolatedFamilyRuntimeEnv,
} from './mas-default-executor-single-flight-helpers.ts';

function readinessSurfacePayload(sourceFingerprint: string) {
  return {
    ...defaultExecutorPayload(sourceFingerprint),
    action_type: 'complete_medical_paper_readiness_surface',
    dispatch_authority: 'consumer_default_executor_dispatch',
    next_executable_owner: 'MedAutoScience',
    domain_owner: 'MedAutoScience',
    work_unit_id: 'complete_medical_paper_readiness_surface',
    dispatch_ref: 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/immutable/complete_medical_paper_readiness_surface/186ef28f465b50a2961653c6.json',
    owner_route_currentness_basis: {
      work_unit_id: 'complete_medical_paper_readiness_surface',
      work_unit_fingerprint: `stage-current-owner-delta::complete_medical_paper_readiness_surface::${sourceFingerprint}`,
    },
  };
}

function stageNativeTypedBlockerOutput(sourceFingerprint: string) {
  return {
    output: {
      stage_native_closeout: {
        surface_kind: 'medical_paper_readiness_stage_native_closeout',
        status: 'materialized',
        stage_id: '08-publication_package_handoff',
        terminal_outcome_kind: 'typed_blocker',
        written_ref: 'artifacts/stage_outputs/08-publication_package_handoff/receipts/typed_blocker.json',
        closeout_binding: {
          source_fingerprint: sourceFingerprint,
          work_unit_fingerprint: `stage-current-owner-delta::complete_medical_paper_readiness_surface::${sourceFingerprint}`,
        },
      },
    },
  };
}

test('family-runtime admits MAS-owned readiness surface default executor dispatch as Codex stage attempt', () => {
  const db = new DatabaseSync(':memory:');
  try {
    withIsolatedFamilyRuntimeEnv(() => {
      createQueueTables(db);
      const taskId = 'task-mas-default-readiness-medautoscience-owner';
      const payload = readinessSurfacePayload('readiness-owner-source');
      insertSucceededTask(db, {
        taskId,
        payload,
        dedupeKey: 'mas:dm-cvd:002:default-executor:complete_medical_paper_readiness_surface:medautoscience',
      });
      db.prepare("UPDATE tasks SET status = 'queued' WHERE task_id = ?").run(taskId);
      const row = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(taskId) as Parameters<
        typeof ensureProviderHostedStageAttempt
      >[1];

      const attempt = ensureProviderHostedStageAttempt(db, row, payload);
      const attempts = listStageAttemptsForTask(db, taskId);

      assert.ok(attempt);
      assert.equal(attempt.stage_id, 'domain_owner/default-executor-dispatch');
      assert.equal(attempt.executor_kind, 'codex_cli');
      assert.equal(attempt.workspace_locator.next_executable_owner, 'MedAutoScience');
      assert.equal(attempt.workspace_locator.action_type, 'complete_medical_paper_readiness_surface');
      assert.deepEqual(attempt.checkpoint_refs, [payload.dispatch_ref]);
      assert.equal(attempts.length, 1);
      assert.equal(attempts[0].stage_attempt_id, attempt.stage_attempt_id);
    });
  } finally {
    db.close();
  }
});

test('family-runtime requeues transport-only succeeded MAS-owned readiness admission with no provider attempt', () => {
  const db = new DatabaseSync(':memory:');
  try {
    createQueueTables(db);
    const taskId = 'task-mas-default-readiness-transport-only';
    const dedupeKey = 'mas:dm-cvd:002:default-executor:complete_medical_paper_readiness_surface:transport-only';
    const payload = readinessSurfacePayload('readiness-transport-only-source');
    insertSucceededTask(db, { taskId, payload, dedupeKey });
    insertEvent(db, {
      taskId,
      domainId: 'medautoscience',
      eventType: 'task_dispatch_succeeded',
      source: 'test-legacy-domain-handler',
      payload: {
        output: {
          surface_kind: 'mas_family_domain_handler_dispatch_receipt',
          accepted: true,
          opl_attempt_admission_requested: true,
          opl_attempt_admission_status: 'requested',
          dispatch: {
            execution_policy: 'opl_default_executor_stage_attempt_admission',
            result: {
              status: 'opl_attempt_admission_requested',
              next_owner: 'MedAutoScience',
            },
          },
        },
      },
    });

    const result = enqueueTask(db, {
      domainId: 'medautoscience',
      taskKind: 'domain_owner/default-executor-dispatch',
      payload,
      dedupeKey,
      source: 'test-domain-export-replay',
    });
    const task = db.prepare('SELECT status, attempts, last_error, dead_letter_reason FROM tasks WHERE task_id = ?').get(
      taskId,
    ) as { status: string; attempts: number; last_error: string | null; dead_letter_reason: string | null };
    const requeueEvent = db.prepare(`
      SELECT payload_json
      FROM events
      WHERE task_id = ? AND event_type = 'task_requeued_from_transport_only_succeeded_default_executor_admission'
      LIMIT 1
    `).get(taskId) as { payload_json: string } | undefined;

    assert.equal(result.accepted, true);
    assert.equal(result.requeued_from_terminal, true);
    assert.equal(result.idempotent_noop, false);
    assert.equal(result.task?.status, 'queued');
    assert.equal(task.status, 'queued');
    assert.equal(task.attempts, 0);
    assert.equal(task.last_error, null);
    assert.equal(task.dead_letter_reason, null);
    assert.ok(requeueEvent);
    assert.equal(JSON.parse(requeueEvent.payload_json).reason, 'transport_only_admission_without_provider_stage_attempt');
  } finally {
    db.close();
  }
});

test('family-runtime requeues transport-only succeeded MAS admission with checkpointed admission attempt', () => {
  const db = new DatabaseSync(':memory:');
  try {
    createQueueTables(db);
    const taskId = 'task-mas-default-readiness-transport-only-checkpoint';
    const dedupeKey = 'mas:dm-cvd:002:default-executor:complete_medical_paper_readiness_surface:transport-only-checkpoint';
    const payload = readinessSurfacePayload('readiness-transport-only-checkpoint-source');
    insertSucceededTask(db, { taskId, payload, dedupeKey });
    db.prepare("UPDATE tasks SET status = 'queued' WHERE task_id = ?").run(taskId);
    const row = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(taskId) as Parameters<
      typeof ensureProviderHostedStageAttempt
    >[1];
    const transportAttempt = ensureProviderHostedStageAttempt(db, row, payload);
    assert.ok(transportAttempt);
    db.prepare(`
      UPDATE tasks
      SET status = 'succeeded',
        attempts = 1,
        last_error = NULL,
        dead_letter_reason = NULL
      WHERE task_id = ?
    `).run(taskId);
    db.prepare(`
      UPDATE stage_attempts
      SET status = 'checkpointed',
        closeout_refs_json = ?,
        closeout_receipt_status = 'accepted_typed_closeout',
        provider_run_json = json_set(
          provider_run_json,
          '$.provider_status', 'checkpointed',
          '$.completed_at', '2026-06-11T18:24:03.527Z'
        )
      WHERE stage_attempt_id = ?
    `).run(
      JSON.stringify(['runtime/artifacts/opl_family_domain_handler/dispatch_receipts/34ebb605e6ea30432656.json']),
      transportAttempt.stage_attempt_id,
    );
    insertEvent(db, {
      taskId,
      domainId: 'medautoscience',
      eventType: 'task_dispatch_succeeded',
      source: 'test-legacy-domain-handler',
      payload: {
        output: {
          surface_kind: 'mas_family_domain_handler_dispatch_receipt',
          accepted: true,
          opl_attempt_admission_requested: true,
          opl_attempt_admission_status: 'requested',
          dispatch: {
            execution_policy: 'opl_default_executor_stage_attempt_admission',
            result: {
              status: 'opl_attempt_admission_requested',
              next_owner: 'MedAutoScience',
            },
          },
        },
      },
    });

    const result = enqueueTask(db, {
      domainId: 'medautoscience',
      taskKind: 'domain_owner/default-executor-dispatch',
      payload,
      dedupeKey,
      source: 'test-domain-export-replay',
    });
    const task = db.prepare('SELECT status, attempts, last_error, dead_letter_reason FROM tasks WHERE task_id = ?').get(
      taskId,
    ) as { status: string; attempts: number; last_error: string | null; dead_letter_reason: string | null };
    const attemptsAfterRequeue = db.prepare(`
      SELECT stage_attempt_id, status, blocked_reason
      FROM stage_attempts
      WHERE task_id = ?
      ORDER BY created_at ASC
    `).all(taskId) as Array<{ stage_attempt_id: string; status: string; blocked_reason: string | null }>;
    const requeueEvent = db.prepare(`
      SELECT payload_json
      FROM events
      WHERE task_id = ? AND event_type = 'task_requeued_from_transport_only_succeeded_default_executor_admission'
      LIMIT 1
    `).get(taskId) as { payload_json: string } | undefined;

    assert.equal(result.accepted, true);
    assert.equal(result.requeued_from_terminal, true);
    assert.equal(result.idempotent_noop, false);
    assert.equal(result.task?.status, 'queued');
    assert.equal(task.status, 'queued');
    assert.equal(task.attempts, 0);
    assert.equal(task.last_error, null);
    assert.equal(task.dead_letter_reason, null);
    assert.equal(attemptsAfterRequeue.length, 1);
    assert.equal(attemptsAfterRequeue[0].stage_attempt_id, transportAttempt.stage_attempt_id);
    assert.equal(attemptsAfterRequeue[0].status, 'blocked');
    assert.equal(
      attemptsAfterRequeue[0].blocked_reason,
      'transport_only_admission_checkpoint_superseded_by_provider_admission_requeue',
    );
    assert.ok(requeueEvent);
    const requeuePayload = JSON.parse(requeueEvent.payload_json);
    assert.equal(requeuePayload.reason, 'transport_only_admission_without_provider_stage_attempt');
    assert.deepEqual(requeuePayload.superseded_stage_attempt_ids, [transportAttempt.stage_attempt_id]);

    const refreshedRow = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(taskId) as Parameters<
      typeof ensureProviderHostedStageAttempt
    >[1];
    const providerAttempt = ensureProviderHostedStageAttempt(db, refreshedRow, payload);
    const attemptsAfterNewAdmission = listStageAttemptsForTask(db, taskId);

    assert.ok(providerAttempt);
    assert.notEqual(providerAttempt.stage_attempt_id, transportAttempt.stage_attempt_id);
    assert.equal(providerAttempt.status, 'queued');
    assert.equal(attemptsAfterNewAdmission.length, 2);
  } finally {
    db.close();
  }
});

test('family-runtime requeues succeeded MAS readiness owner action missing Stage Native owner answer', () => {
  const db = new DatabaseSync(':memory:');
  try {
    createQueueTables(db);
    const taskId = 'task-mas-default-readiness-missing-stage-native-answer';
    const dedupeKey = 'mas:dm-cvd:002:default-executor:complete_medical_paper_readiness_surface:missing-stage-native-answer';
    const payload = readinessSurfacePayload('readiness-stage-native-missing');
    insertSucceededTask(db, { taskId, payload, dedupeKey });

    const result = enqueueTask(db, {
      domainId: 'medautoscience',
      taskKind: 'domain_owner/default-executor-dispatch',
      payload,
      dedupeKey,
      source: 'test-domain-export-replay',
    });
    const task = db.prepare('SELECT status, attempts, last_error, dead_letter_reason FROM tasks WHERE task_id = ?').get(
      taskId,
    ) as { status: string; attempts: number; last_error: string | null; dead_letter_reason: string | null };
    const requeueEvent = db.prepare(`
      SELECT payload_json
      FROM events
      WHERE task_id = ? AND event_type = 'task_requeued_from_missing_stage_native_owner_answer'
      LIMIT 1
    `).get(taskId) as { payload_json: string } | undefined;

    assert.equal(result.accepted, true);
    assert.equal(result.requeued_from_terminal, true);
    assert.equal(result.idempotent_noop, false);
    assert.equal(result.task?.status, 'queued');
    assert.equal(task.status, 'queued');
    assert.equal(task.attempts, 0);
    assert.equal(task.last_error, null);
    assert.equal(task.dead_letter_reason, null);
    assert.ok(requeueEvent);
    assert.equal(
      JSON.parse(requeueEvent.payload_json).reason,
      'stage_native_owner_answer_missing_after_default_executor_completion',
    );
  } finally {
    db.close();
  }
});

test('family-runtime clears previous missing Stage Native owner blocker when current closeout ref is observed', () => {
  const db = new DatabaseSync(':memory:');
  try {
    createQueueTables(db);
    const stageNativeRef = 'studies/002-dm-china-us-mortality-attribution/artifacts/stage_outputs/08-publication_package_handoff/receipts/typed_blocker.json';
    const currentSource = `stage-current-owner-delta::complete_medical_paper_readiness_surface::authoring_runtime_authorization::/tmp/dm-cvd/${stageNativeRef}`;
    const taskId = 'task-mas-default-readiness-resolved-stage-native-answer';
    const dedupeKey = 'mas:dm-cvd:002:default-executor:complete_medical_paper_readiness_surface:resolved-stage-native-answer';
    const payload = readinessSurfacePayload(currentSource);
    insertSucceededTask(db, { taskId, payload, dedupeKey });
    db.prepare("UPDATE tasks SET status = 'queued' WHERE task_id = ?").run(taskId);
    const row = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(taskId) as Parameters<
      typeof ensureProviderHostedStageAttempt
    >[1];
    const attempt = ensureProviderHostedStageAttempt(db, row, payload);
    assert.ok(attempt);
    db.prepare(`
      UPDATE stage_attempts
      SET status = 'completed',
        closeout_receipt_status = 'accepted_typed_closeout',
        closeout_refs_json = ?,
        route_impact_json = ?,
        provider_run_json = json_set(
          provider_run_json,
          '$.provider_status', 'completed'
        )
      WHERE stage_attempt_id = ?
    `).run(
      JSON.stringify([stageNativeRef]),
      JSON.stringify({ action_type: 'complete_medical_paper_readiness_surface' }),
      attempt.stage_attempt_id,
    );
    db.prepare(`
      UPDATE tasks
      SET status = 'blocked',
        last_error = ?,
        dead_letter_reason = ?
      WHERE task_id = ?
    `).run(MAS_STAGE_NATIVE_OWNER_ANSWER_MISSING_REASON, MAS_STAGE_NATIVE_OWNER_ANSWER_MISSING_REASON, taskId);

    const result = enqueueTask(db, {
      domainId: 'medautoscience',
      taskKind: 'domain_owner/default-executor-dispatch',
      payload,
      dedupeKey,
      source: 'test-domain-export-replay',
    });
    const task = db.prepare('SELECT status, last_error, dead_letter_reason FROM tasks WHERE task_id = ?').get(
      taskId,
    ) as { status: string; last_error: string | null; dead_letter_reason: string | null };
    const resolvedEvent = db.prepare(`
      SELECT payload_json
      FROM events
      WHERE task_id = ? AND event_type = 'task_resolved_missing_stage_native_owner_answer'
      LIMIT 1
    `).get(taskId) as { payload_json: string } | undefined;

    assert.equal(result.accepted, false);
    assert.equal(result.idempotent_noop, true);
    assert.equal(result.task?.status, 'succeeded');
    assert.equal(task.status, 'succeeded');
    assert.equal(task.last_error, null);
    assert.equal(task.dead_letter_reason, null);
    assert.ok(resolvedEvent);
    assert.equal(
      JSON.parse(resolvedEvent.payload_json).reason,
      'stage_native_owner_answer_observed_after_previous_missing_blocker',
    );
  } finally {
    db.close();
  }
});

test('family-runtime does not requeue succeeded MAS readiness owner action with matching Stage Native answer', () => {
  const db = new DatabaseSync(':memory:');
  try {
    createQueueTables(db);
    const taskId = 'task-mas-default-readiness-matching-stage-native-answer';
    const dedupeKey = 'mas:dm-cvd:002:default-executor:complete_medical_paper_readiness_surface:matching-stage-native-answer';
    const payload = readinessSurfacePayload('readiness-stage-native-current');
    insertSucceededTask(db, { taskId, payload, dedupeKey });
    insertEvent(db, {
      taskId,
      domainId: 'medautoscience',
      eventType: 'task_dispatch_succeeded',
      source: 'test-domain-handler',
      payload: stageNativeTypedBlockerOutput('readiness-stage-native-current'),
    });

    const result = enqueueTask(db, {
      domainId: 'medautoscience',
      taskKind: 'domain_owner/default-executor-dispatch',
      payload,
      dedupeKey,
      source: 'test-domain-export-replay',
    });
    const task = db.prepare('SELECT status FROM tasks WHERE task_id = ?').get(taskId) as { status: string };
    const requeueCount = db.prepare(`
      SELECT COUNT(*) AS count
      FROM events
      WHERE task_id = ? AND event_type = 'task_requeued_from_missing_stage_native_owner_answer'
    `).get(taskId) as { count: number };

    assert.equal(result.accepted, false);
    assert.equal(result.idempotent_noop, true);
    assert.equal(result.task?.status, 'succeeded');
    assert.equal(task.status, 'succeeded');
    assert.equal(requeueCount.count, 0);
  } finally {
    db.close();
  }
});

test('family-runtime requeues succeeded MAS readiness owner action when Stage Native answer is stale', () => {
  const db = new DatabaseSync(':memory:');
  try {
    createQueueTables(db);
    const taskId = 'task-mas-default-readiness-stale-stage-native-answer';
    const dedupeKey = 'mas:dm-cvd:002:default-executor:complete_medical_paper_readiness_surface:stale-stage-native-answer';
    const stalePayload = readinessSurfacePayload('readiness-stage-native-old');
    const currentPayload = readinessSurfacePayload('readiness-stage-native-new');
    insertSucceededTask(db, { taskId, payload: stalePayload, dedupeKey });
    insertEvent(db, {
      taskId,
      domainId: 'medautoscience',
      eventType: 'task_dispatch_succeeded',
      source: 'test-domain-handler',
      payload: stageNativeTypedBlockerOutput('readiness-stage-native-old'),
    });

    const result = enqueueTask(db, {
      domainId: 'medautoscience',
      taskKind: 'domain_owner/default-executor-dispatch',
      payload: currentPayload,
      dedupeKey,
      source: 'test-domain-export-replay',
    });
    const task = db.prepare('SELECT status, payload_json FROM tasks WHERE task_id = ?').get(
      taskId,
    ) as { status: string; payload_json: string };
    const requeueEvent = db.prepare(`
      SELECT payload_json
      FROM events
      WHERE task_id = ? AND event_type = 'task_requeued_from_missing_stage_native_owner_answer'
      LIMIT 1
    `).get(taskId) as { payload_json: string } | undefined;

    assert.equal(result.accepted, true);
    assert.equal(result.requeued_from_terminal, true);
    assert.equal(result.idempotent_noop, false);
    assert.equal(task.status, 'queued');
    assert.equal(JSON.parse(task.payload_json).source_fingerprint, 'readiness-stage-native-new');
    assert.ok(requeueEvent);
    assert.equal(
      JSON.parse(requeueEvent.payload_json).reason,
      'stage_native_owner_answer_missing_after_default_executor_completion',
    );
  } finally {
    db.close();
  }
});
