import { DatabaseSync } from 'node:sqlite';

import {
  assert,
  test,
} from './helpers.ts';
import {
  createQueueTables,
  defaultExecutorPayloadForOwner,
  insertDefaultExecutorTask,
  insertDefaultExecutorTaskWithPayload,
  insertQueuedDefaultExecutorTask,
  withIsolatedFamilyRuntimeEnv,
} from './mas-default-executor-current-source-helpers.ts';

import { runFamilyRuntimeQueueTick } from '../../../../../src/family-runtime-tick.ts';
import { enqueueTask } from '../../../../../src/family-runtime-enqueue.ts';
import { familyRuntimePaths, type FamilyRuntimeTaskRow } from '../../../../../src/family-runtime-store.ts';
import { ensureProviderHostedStageAttempt } from '../../../../../src/family-runtime-provider-hosted-attempts.ts';

test('family-runtime tick selects the current MAS default executor source and skips older queued residue', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await withIsolatedFamilyRuntimeEnv(async () => {
      createQueueTables(db);
      insertQueuedDefaultExecutorTask(db, {
        taskId: 'task-mas-default-source-old',
        sourceFingerprint: 'source-before',
        createdAt: '2026-05-25T16:30:00.000Z',
      });
      insertQueuedDefaultExecutorTask(db, {
        taskId: 'task-mas-default-source-current',
        sourceFingerprint: 'source-after',
        createdAt: '2026-05-25T16:40:00.000Z',
      });

      const tick = await runFamilyRuntimeQueueTick(db, familyRuntimePaths(), {
        source: 'test-current-source-selection',
        limit: 2,
        hydrate: false,
        taskScope: {
          domainId: 'medautoscience',
          taskKind: 'domain_owner/default-executor-dispatch',
          payloadMatches: [
            {
              path: 'study_id',
              value: '002-dm-china-us-mortality-attribution',
            },
          ],
        },
      }, {
        enqueueTask: () => ({ accepted: false }),
        dispatchTask: (_db, _paths, row: FamilyRuntimeTaskRow) => ({
          task_id: row.task_id,
          source_fingerprint: JSON.parse(row.payload_json).source_fingerprint,
        }),
      });

      assert.equal(tick.selected_count, 1);
      assert.equal(tick.dispatches.length, 1);
      assert.equal(tick.dispatches[0].task_id, 'task-mas-default-source-current');
      assert.equal(tick.dispatches[0].source_fingerprint, 'source-after');
      assert.equal(tick.mas_default_executor_superseded_count, 1);
      const staleTask = db.prepare(`
        SELECT status, last_error, dead_letter_reason
        FROM tasks
        WHERE task_id = ?
      `).get('task-mas-default-source-old') as {
        status: string;
        last_error: string | null;
        dead_letter_reason: string | null;
      };
      const staleEvent = db.prepare(`
        SELECT payload_json
        FROM events
        WHERE task_id = ? AND event_type = 'task_default_executor_superseded_by_current_source'
        LIMIT 1
      `).get('task-mas-default-source-old') as { payload_json: string } | undefined;

      assert.equal(staleTask.status, 'blocked');
      assert.equal(staleTask.last_error, 'mas_default_executor_superseded_by_current_source');
      assert.equal(staleTask.dead_letter_reason, 'mas_default_executor_superseded_by_current_source');
      assert.ok(staleEvent);
      const stalePayload = JSON.parse(staleEvent.payload_json);
      assert.equal(stalePayload.reason, 'same_dispatch_newer_source_exists');
      assert.equal(stalePayload.current_task_id, 'task-mas-default-source-current');
      assert.equal(stalePayload.current_source_fingerprint, 'source-after');
      assert.equal(stalePayload.stale_source_fingerprint, 'source-before');
    });
  } finally {
    db.close();
  }
});

test('family-runtime tick blocks domain owner rows without source fingerprint before provider dispatch', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await withIsolatedFamilyRuntimeEnv(async () => {
      createQueueTables(db);
      const payload = defaultExecutorPayloadForOwner({
        sourceFingerprint: 'sha256:will-be-removed',
        actionType: 'return_to_ai_reviewer_workflow',
        nextOwner: 'ai_reviewer',
        dispatchAuthority: 'ai_reviewer_record_production_handoff',
        dispatchRef:
          'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/return_to_ai_reviewer_workflow.json',
      });
      const { source_fingerprint: _sourceFingerprint, ...payloadWithoutSourceFingerprint } = payload;
      insertDefaultExecutorTaskWithPayload(db, {
        taskId: 'task-missing-source-fingerprint',
        payload: payloadWithoutSourceFingerprint,
        dedupeKey: 'mas:dm-cvd:002:default-executor:missing-source-fingerprint',
        createdAt: '2026-05-25T16:30:00.000Z',
        status: 'queued',
      });

      let dispatchCount = 0;
      const tick = await runFamilyRuntimeQueueTick(db, familyRuntimePaths(), {
        source: 'test-missing-source-fingerprint-progress-first',
        limit: 2,
        hydrate: false,
        taskScope: {
          domainId: 'medautoscience',
          taskKind: 'domain_owner/default-executor-dispatch',
          payloadMatches: [
            {
              path: 'study_id',
              value: '002-dm-china-us-mortality-attribution',
            },
          ],
        },
      }, {
        enqueueTask: () => ({ accepted: false }),
        dispatchTask: (_db, _paths, row: FamilyRuntimeTaskRow) => {
          dispatchCount += 1;
          return { task_id: row.task_id };
        },
      });
      const blockedTask = db.prepare(`
        SELECT status, last_error, dead_letter_reason
        FROM tasks
        WHERE task_id = ?
      `).get('task-missing-source-fingerprint') as {
        status: string;
        last_error: string | null;
        dead_letter_reason: string | null;
      };
      const event = db.prepare(`
        SELECT payload_json
        FROM events
        WHERE task_id = ? AND event_type = 'task_progress_first_anti_spin_blocked'
        LIMIT 1
      `).get('task-missing-source-fingerprint') as { payload_json: string } | undefined;

      assert.equal(tick.selected_count, 0);
      assert.equal(dispatchCount, 0);
      assert.equal(tick.progress_first_anti_spin_blocked_count, 1);
      assert.equal(blockedTask.status, 'blocked');
      assert.equal(blockedTask.last_error, 'progress_first_owner_delta_required');
      assert.equal(blockedTask.dead_letter_reason, 'progress_first_owner_delta_required');
      assert.ok(event);
      const eventPayload = JSON.parse(event.payload_json);
      assert.equal(eventPayload.lineage.reason, 'progress_first_source_fingerprint_required');
      assert.equal(eventPayload.lineage.next_forced_delta, 'source_fingerprint_or_fresh_owner_delta_required');
      assert.equal(eventPayload.authority_boundary.provider_stage_attempt_started, false);
    });
  } finally {
    db.close();
  }
});

test('family-runtime requeues superseded MAS current-control provider admission with same dedupe key', () => {
  const db = new DatabaseSync(':memory:');
  try {
    withIsolatedFamilyRuntimeEnv(() => {
      createQueueTables(db);
      const payload = {
        ...defaultExecutorPayloadForOwner({
          sourceFingerprint: 'domain-transition::route-back-current',
          actionType: 'run_gate_clearing_batch',
          nextOwner: 'ai_reviewer',
          dispatchAuthority: 'consumer_default_executor_dispatch',
          dispatchRef:
            'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/supervision/consumer/default_executor_dispatches/run_gate_clearing_batch.json',
        }),
        study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
        quest_id: '003-dpcc-primary-care-phenotype-treatment-gap',
        work_unit_id: 'dpcc_publication_gate_replay_after_current_ai_reviewer_record',
        work_unit_fingerprint: 'domain-transition::route-back-current',
        owner_route_currentness_basis: {
          generated_at: '2026-06-09T04:00:00Z',
          work_unit_id: 'dpcc_publication_gate_replay_after_current_ai_reviewer_record',
          work_unit_fingerprint: 'domain-transition::route-back-current',
        },
        provider_admission_identity: {
          status: 'provider_admission_pending',
          provider_admission_schema_source: 'opl_current_control_state/latest.json',
        },
      };
      const dedupeKey =
        'mas:dm-cvd:003:default-executor:run_gate_clearing_batch:domain-transition::route-back-current';
      insertDefaultExecutorTaskWithPayload(db, {
        taskId: 'task-mas-default-superseded-current-control',
        payload,
        dedupeKey,
        createdAt: '2026-06-09T03:14:15.000Z',
        status: 'blocked',
      });
      db.prepare(`
        UPDATE tasks
        SET last_error = 'mas_default_executor_superseded_by_current_source',
          dead_letter_reason = 'mas_default_executor_superseded_by_current_source'
        WHERE task_id = ?
      `).run('task-mas-default-superseded-current-control');

      const result = enqueueTask(db, {
        domainId: 'medautoscience',
        taskKind: 'domain_owner/default-executor-dispatch',
        payload,
        dedupeKey,
        priority: 95,
        source: 'opl-current-control-provider-admission',
      });
      const row = db.prepare(`
        SELECT status, attempts, last_error, dead_letter_reason, payload_json
        FROM tasks
        WHERE task_id = ?
      `).get('task-mas-default-superseded-current-control') as {
        status: string;
        attempts: number;
        last_error: string | null;
        dead_letter_reason: string | null;
        payload_json: string;
      };
      const event = db.prepare(`
        SELECT payload_json
        FROM events
        WHERE task_id = ? AND event_type = 'task_requeued_from_mas_current_control_provider_admission'
        LIMIT 1
      `).get('task-mas-default-superseded-current-control') as { payload_json: string } | undefined;

      assert.equal(result.accepted, true);
      assert.equal(result.requeued_from_terminal, true);
      assert.equal(row.status, 'queued');
      assert.equal(row.attempts, 0);
      assert.equal(row.last_error, null);
      assert.equal(row.dead_letter_reason, null);
      assert.equal(JSON.parse(row.payload_json).provider_admission_identity.status, 'provider_admission_pending');
      assert.ok(event);
      const eventPayload = JSON.parse(event.payload_json);
      assert.equal(eventPayload.reason, 'mas_current_control_provider_admission_after_superseded_blocker');
      assert.equal(eventPayload.authority_boundary.domain_truth_mutation, false);
    });
  } finally {
    db.close();
  }
});

test('family-runtime requeues superseded MAS current owner-route admission without provider identity', () => {
  const db = new DatabaseSync(':memory:');
  try {
    withIsolatedFamilyRuntimeEnv(() => {
      createQueueTables(db);
      const workUnitFingerprint =
        'current-ai-reviewer-gate-replay::003-dpcc-primary-care-phenotype-treatment-gap::dpcc_publication_gate_replay_after_current_ai_reviewer_record::publication-eval::003-dpcc-primary-care-phenotype-treatment-gap::ai-reviewer-record::20260611T003412Z::sat_3961f4c4b2e9335879a17891';
      const payload = {
        ...defaultExecutorPayloadForOwner({
          sourceFingerprint: '08159ba4e3a62b9c',
          actionType: 'run_gate_clearing_batch',
          nextOwner: 'ai_reviewer',
          dispatchAuthority: 'consumer_default_executor_dispatch',
          dispatchRef:
            'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/supervision/consumer/default_executor_dispatches/immutable/run_gate_clearing_batch/e648958ab468d341beecd13e.json',
        }),
        study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
        quest_id: '003-dpcc-primary-care-phenotype-treatment-gap',
        work_unit_id: 'dpcc_publication_gate_replay_after_current_ai_reviewer_record',
        work_unit_fingerprint: workUnitFingerprint,
        action_fingerprint: workUnitFingerprint,
        owner_route_currentness_basis: {
          source_eval_id:
            'publication-eval::003-dpcc-primary-care-phenotype-treatment-gap::ai-reviewer-record::20260611T003412Z::sat_3961f4c4b2e9335879a17891',
          work_unit_id: 'dpcc_publication_gate_replay_after_current_ai_reviewer_record',
          work_unit_fingerprint: workUnitFingerprint,
          truth_epoch: 'truth-event-000032-097fe584ce2a78fb',
          runtime_health_epoch: 'runtime-health-event-006596-c5963ea7240e495b',
        },
      };
      const dedupeKey =
        'mas:dm-cvd-mortality-risk:003-dpcc-primary-care-phenotype-treatment-gap:default-executor:run_gate_clearing_batch:consumer_default_executor_dispatch:08159ba4e3a62b9c';
      insertDefaultExecutorTaskWithPayload(db, {
        taskId: 'task-mas-superseded-current-owner-route-admission',
        payload,
        dedupeKey,
        createdAt: '2026-06-11T01:30:25.414Z',
        status: 'blocked',
      });
      db.prepare(`
        UPDATE tasks
        SET last_error = 'mas_default_executor_superseded_by_current_source',
          dead_letter_reason = 'mas_default_executor_superseded_by_current_source'
        WHERE task_id = ?
      `).run('task-mas-superseded-current-owner-route-admission');

      const result = enqueueTask(db, {
        domainId: 'medautoscience',
        taskKind: 'domain_owner/default-executor-dispatch',
        payload,
        dedupeKey,
        priority: 95,
        source: 'mas-domain-handler-export',
      });
      const row = db.prepare(`
        SELECT status, attempts, last_error, dead_letter_reason, payload_json
        FROM tasks
        WHERE task_id = ?
      `).get('task-mas-superseded-current-owner-route-admission') as {
        status: string;
        attempts: number;
        last_error: string | null;
        dead_letter_reason: string | null;
        payload_json: string;
      };
      const event = db.prepare(`
        SELECT payload_json
        FROM events
        WHERE task_id = ? AND event_type = 'task_requeued_from_mas_current_control_provider_admission'
        LIMIT 1
      `).get('task-mas-superseded-current-owner-route-admission') as { payload_json: string } | undefined;

      assert.equal(result.accepted, true);
      assert.equal(result.requeued_from_terminal, true);
      assert.equal(result.idempotent_noop, false);
      assert.equal(row.status, 'queued');
      assert.equal(row.attempts, 0);
      assert.equal(row.last_error, null);
      assert.equal(row.dead_letter_reason, null);
      assert.equal(JSON.parse(row.payload_json).work_unit_fingerprint, workUnitFingerprint);
      assert.ok(event);
      const eventPayload = JSON.parse(event.payload_json);
      assert.equal(eventPayload.reason, 'mas_current_owner_route_admission_after_superseded_blocker');
      assert.equal(eventPayload.next_currentness_identity.work_unit_fingerprint, workUnitFingerprint);
      assert.equal(eventPayload.authority_boundary.domain_truth_mutation, false);
    });
  } finally {
    db.close();
  }
});

test('family-runtime tick prefers MAS current-control provider admission over newer transport residue', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await withIsolatedFamilyRuntimeEnv(async () => {
      createQueueTables(db);
      const currentPayload = {
        ...defaultExecutorPayloadForOwner({
          sourceFingerprint: 'domain-transition::route-back-current',
          actionType: 'run_gate_clearing_batch',
          nextOwner: 'ai_reviewer',
          dispatchAuthority: 'consumer_default_executor_dispatch',
          dispatchRef:
            'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/supervision/consumer/default_executor_dispatches/immutable/run_gate_clearing_batch/current.json',
        }),
        study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
        quest_id: '003-dpcc-primary-care-phenotype-treatment-gap',
        work_unit_id: 'dpcc_publication_gate_replay_after_current_ai_reviewer_record',
        work_unit_fingerprint: 'domain-transition::route-back-current',
        stage_packet_ref:
          'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/stage_packets/run_gate_clearing_batch.current.json',
        owner_route_currentness_basis: {
          generated_at: '2026-06-09T04:00:00Z',
          work_unit_id: 'dpcc_publication_gate_replay_after_current_ai_reviewer_record',
          work_unit_fingerprint: 'domain-transition::route-back-current',
        },
        provider_admission_identity: {
          status: 'provider_admission_pending',
          provider_admission_schema_source: 'opl_current_control_state/latest.json',
        },
      };
      const stalePayload = {
        ...defaultExecutorPayloadForOwner({
          sourceFingerprint: 'sha256:stale-transport-residue',
          actionType: 'run_gate_clearing_batch',
          nextOwner: 'ai_reviewer',
          dispatchAuthority: 'consumer_default_executor_dispatch',
          dispatchRef:
            'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/supervision/consumer/default_executor_dispatches/immutable/run_gate_clearing_batch/stale.json',
        }),
        study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
        quest_id: '003-dpcc-primary-care-phenotype-treatment-gap',
      };
      insertDefaultExecutorTaskWithPayload(db, {
        taskId: 'task-mas-current-control-admission',
        payload: currentPayload,
        dedupeKey: 'mas:dm-cvd:003:default-executor:run_gate_clearing_batch:current-control',
        createdAt: '2026-06-09T03:14:15.000Z',
        status: 'queued',
      });
      insertDefaultExecutorTaskWithPayload(db, {
        taskId: 'task-mas-newer-transport-residue',
        payload: stalePayload,
        dedupeKey: 'mas:dm-cvd:003:default-executor:run_gate_clearing_batch:stale-transport-residue',
        createdAt: '2026-06-09T03:25:00.000Z',
        status: 'queued',
      });

      let dispatchCount = 0;
      const tick = await runFamilyRuntimeQueueTick(db, familyRuntimePaths(), {
        source: 'test-current-control-before-transport-residue',
        limit: 2,
        hydrate: false,
        taskScope: {
          domainId: 'medautoscience',
          taskKind: 'domain_owner/default-executor-dispatch',
          payloadMatches: [
            {
              path: 'study_id',
              value: '003-dpcc-primary-care-phenotype-treatment-gap',
            },
          ],
        },
      }, {
        enqueueTask: () => ({ accepted: false }),
        dispatchTask: (_db, _paths, row: FamilyRuntimeTaskRow) => {
          dispatchCount += 1;
          return { task_id: row.task_id };
        },
      });
      const staleTask = db.prepare(`
        SELECT status, last_error, dead_letter_reason
        FROM tasks
        WHERE task_id = ?
      `).get('task-mas-newer-transport-residue') as {
        status: string;
        last_error: string | null;
        dead_letter_reason: string | null;
      };
      const supersededEvent = db.prepare(`
        SELECT payload_json
        FROM events
        WHERE task_id = ? AND event_type = 'task_default_executor_superseded_by_current_source'
        LIMIT 1
      `).get('task-mas-newer-transport-residue') as { payload_json: string } | undefined;

      assert.equal(tick.selected_count, 1);
      assert.equal(dispatchCount, 1);
      assert.equal(tick.dispatches[0].task_id, 'task-mas-current-control-admission');
      assert.equal(tick.mas_default_executor_superseded_count, 1);
      assert.equal(staleTask.status, 'blocked');
      assert.equal(staleTask.last_error, 'mas_default_executor_superseded_by_current_source');
      assert.equal(staleTask.dead_letter_reason, 'mas_default_executor_superseded_by_current_source');
      assert.ok(supersededEvent);
      const eventPayload = JSON.parse(supersededEvent.payload_json);
      assert.equal(eventPayload.reason, 'same_study_action_newer_source_exists');
      assert.equal(eventPayload.current_task_id, 'task-mas-current-control-admission');
      assert.equal(eventPayload.current_source_fingerprint, 'domain-transition::route-back-current');
      assert.equal(eventPayload.stale_source_fingerprint, 'sha256:stale-transport-residue');
    });
  } finally {
    db.close();
  }
});

test('family-runtime tick does not let canceled MAS current-control residue supersede fresh admission', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await withIsolatedFamilyRuntimeEnv(async () => {
      createQueueTables(db);
      const staleWorkUnitFingerprint =
        'study-progress-current-owner-ticket::003-dpcc-primary-care-phenotype-treatment-gap::dpcc_publication_gate_replay_after_current_ai_reviewer_record::run_gate_clearing_batch';
      const currentWorkUnitFingerprint =
        'current-ai-reviewer-gate-replay::003-dpcc-primary-care-phenotype-treatment-gap::dpcc_publication_gate_replay_after_current_ai_reviewer_record::publication-eval::003-dpcc-primary-care-phenotype-treatment-gap::ai-reviewer-record::20260611T003412Z::sat_3961f4c4b2e9335879a17891';
      const canceledPayload = {
        ...defaultExecutorPayloadForOwner({
          sourceFingerprint: staleWorkUnitFingerprint,
          actionType: 'run_gate_clearing_batch',
          nextOwner: 'write',
          dispatchAuthority: 'consumer_default_executor_dispatch',
          dispatchRef:
            'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/supervision/consumer/default_executor_dispatches/run_gate_clearing_batch.json',
        }),
        study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
        quest_id: '003-dpcc-primary-care-phenotype-treatment-gap',
        work_unit_id: 'dpcc_publication_gate_replay_after_current_ai_reviewer_record',
        work_unit_fingerprint: staleWorkUnitFingerprint,
        action_fingerprint: staleWorkUnitFingerprint,
        owner_route_currentness_basis: {
          work_unit_id: 'dpcc_publication_gate_replay_after_current_ai_reviewer_record',
          work_unit_fingerprint: staleWorkUnitFingerprint,
          truth_epoch: 'truth-event-000031-3eb5e3cbb417f102',
          runtime_health_epoch: 'runtime-health-event-006564-72a736fcabdd01a6',
        },
        provider_admission_identity: {
          status: 'provider_admission_pending',
          action_fingerprint: staleWorkUnitFingerprint,
        },
      };
      const freshPayload = {
        ...defaultExecutorPayloadForOwner({
          sourceFingerprint: '08159ba4e3a62b9c',
          actionType: 'run_gate_clearing_batch',
          nextOwner: 'ai_reviewer',
          dispatchAuthority: 'consumer_default_executor_dispatch',
          dispatchRef:
            'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/supervision/consumer/default_executor_dispatches/immutable/run_gate_clearing_batch/e648958ab468d341beecd13e.json',
        }),
        study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
        quest_id: '003-dpcc-primary-care-phenotype-treatment-gap',
        work_unit_id: 'dpcc_publication_gate_replay_after_current_ai_reviewer_record',
        work_unit_fingerprint: currentWorkUnitFingerprint,
        action_fingerprint: currentWorkUnitFingerprint,
        owner_route_currentness_basis: {
          source_eval_id:
            'publication-eval::003-dpcc-primary-care-phenotype-treatment-gap::ai-reviewer-record::20260611T003412Z::sat_3961f4c4b2e9335879a17891',
          work_unit_id: 'dpcc_publication_gate_replay_after_current_ai_reviewer_record',
          work_unit_fingerprint: currentWorkUnitFingerprint,
          truth_epoch: 'truth-event-000032-097fe584ce2a78fb',
          runtime_health_epoch: 'runtime-health-event-006596-c5963ea7240e495b',
        },
      };
      insertDefaultExecutorTaskWithPayload(db, {
        taskId: 'task-mas-canceled-current-control-residue',
        payload: canceledPayload,
        dedupeKey: 'mas:dm-cvd:003:default-executor:run_gate_clearing_batch:canceled-residue',
        createdAt: '2026-06-10T06:58:11.767Z',
        status: 'blocked',
        attempts: 1,
      });
      db.prepare(`
        UPDATE tasks
        SET last_error = 'temporal_workflow_canceled',
          dead_letter_reason = 'temporal_stage_attempt_canceled'
        WHERE task_id = ?
      `).run('task-mas-canceled-current-control-residue');
      insertDefaultExecutorTaskWithPayload(db, {
        taskId: 'task-mas-fresh-gate-replay-admission',
        payload: freshPayload,
        dedupeKey: 'mas:dm-cvd:003:default-executor:run_gate_clearing_batch:08159ba4e3a62b9c',
        createdAt: '2026-06-11T01:30:25.414Z',
        status: 'queued',
      });

      let dispatchCount = 0;
      const tick = await runFamilyRuntimeQueueTick(db, familyRuntimePaths(), {
        source: 'test-canceled-current-control-residue-does-not-supersede',
        limit: 2,
        hydrate: false,
        taskScope: {
          domainId: 'medautoscience',
          taskKind: 'domain_owner/default-executor-dispatch',
          payloadMatches: [
            {
              path: 'study_id',
              value: '003-dpcc-primary-care-phenotype-treatment-gap',
            },
          ],
        },
      }, {
        enqueueTask: () => ({ accepted: false }),
        dispatchTask: (_db, _paths, row: FamilyRuntimeTaskRow) => {
          dispatchCount += 1;
          return { task_id: row.task_id };
        },
      });
      const freshTask = db.prepare(`
        SELECT status, last_error, dead_letter_reason
        FROM tasks
        WHERE task_id = ?
      `).get('task-mas-fresh-gate-replay-admission') as {
        status: string;
        last_error: string | null;
        dead_letter_reason: string | null;
      };
      const staleSupersededEvent = db.prepare(`
        SELECT payload_json
        FROM events
        WHERE task_id = ? AND event_type = 'task_default_executor_superseded_by_current_source'
        LIMIT 1
      `).get('task-mas-fresh-gate-replay-admission') as { payload_json: string } | undefined;

      assert.equal(tick.selected_count, 1);
      assert.equal(dispatchCount, 1);
      assert.equal(tick.dispatches[0].task_id, 'task-mas-fresh-gate-replay-admission');
      assert.equal(tick.mas_default_executor_superseded_count, 0);
      assert.equal(freshTask.status, 'queued');
      assert.equal(freshTask.last_error, null);
      assert.equal(freshTask.dead_letter_reason, null);
      assert.equal(staleSupersededEvent, undefined);
    });
  } finally {
    db.close();
  }
});

test('family-runtime tick skips stale blocked transport auto-redrive when MAS current-control admission exists', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await withIsolatedFamilyRuntimeEnv(async () => {
      createQueueTables(db);
      const currentPayload = {
        ...defaultExecutorPayloadForOwner({
          sourceFingerprint: 'domain-transition::route-back-current',
          actionType: 'run_gate_clearing_batch',
          nextOwner: 'ai_reviewer',
          dispatchAuthority: 'consumer_default_executor_dispatch',
          dispatchRef:
            'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/supervision/consumer/default_executor_dispatches/immutable/run_gate_clearing_batch/current.json',
        }),
        study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
        quest_id: '003-dpcc-primary-care-phenotype-treatment-gap',
        work_unit_id: 'dpcc_publication_gate_replay_after_current_ai_reviewer_record',
        work_unit_fingerprint: 'domain-transition::route-back-current',
        stage_packet_ref:
          'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/stage_packets/run_gate_clearing_batch.current.json',
        owner_route_currentness_basis: {
          generated_at: '2026-06-09T04:00:00Z',
          work_unit_id: 'dpcc_publication_gate_replay_after_current_ai_reviewer_record',
          work_unit_fingerprint: 'domain-transition::route-back-current',
        },
        provider_admission_identity: {
          status: 'provider_admission_pending',
          provider_admission_schema_source: 'opl_current_control_state/latest.json',
        },
      };
      const stalePayload = {
        ...defaultExecutorPayloadForOwner({
          sourceFingerprint: 'sha256:stale-transport-residue',
          actionType: 'run_gate_clearing_batch',
          nextOwner: 'ai_reviewer',
          dispatchAuthority: 'consumer_default_executor_dispatch',
          dispatchRef:
            'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/supervision/consumer/default_executor_dispatches/immutable/run_gate_clearing_batch/stale.json',
        }),
        study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
        quest_id: '003-dpcc-primary-care-phenotype-treatment-gap',
      };
      insertDefaultExecutorTaskWithPayload(db, {
        taskId: 'task-mas-current-control-admission',
        payload: currentPayload,
        dedupeKey: 'mas:dm-cvd:003:default-executor:run_gate_clearing_batch:current-control',
        createdAt: '2026-06-09T03:14:15.000Z',
        status: 'queued',
      });
      insertDefaultExecutorTaskWithPayload(db, {
        taskId: 'task-mas-stale-blocked-transport-residue',
        payload: stalePayload,
        dedupeKey: 'mas:dm-cvd:003:default-executor:run_gate_clearing_batch:stale-transport-residue',
        createdAt: '2026-06-09T03:25:00.000Z',
        status: 'blocked',
        attempts: 1,
      });
      db.prepare(`
        UPDATE tasks
        SET last_error = 'temporal_stage_attempt_start_failed',
          dead_letter_reason = 'temporal_stage_attempt_start_failed'
        WHERE task_id = ?
      `).run('task-mas-stale-blocked-transport-residue');

      const tick = await runFamilyRuntimeQueueTick(db, familyRuntimePaths(), {
        source: 'test-current-control-before-stale-auto-redrive',
        limit: 2,
        hydrate: false,
        taskScope: {
          domainId: 'medautoscience',
          taskKind: 'domain_owner/default-executor-dispatch',
          payloadMatches: [
            {
              path: 'study_id',
              value: '003-dpcc-primary-care-phenotype-treatment-gap',
            },
          ],
        },
      }, {
        enqueueTask: () => ({ accepted: false }),
        dispatchTask: (_db, _paths, row: FamilyRuntimeTaskRow) => ({ task_id: row.task_id }),
      });
      const staleTask = db.prepare(`
        SELECT status, last_error, dead_letter_reason
        FROM tasks
        WHERE task_id = ?
      `).get('task-mas-stale-blocked-transport-residue') as {
        status: string;
        last_error: string | null;
        dead_letter_reason: string | null;
      };
      const redriveEventCount = db.prepare(`
        SELECT COUNT(*) AS count
        FROM events
        WHERE task_id = ?
          AND event_type = 'task_auto_redrive_from_blocked_provider_transport'
      `).get('task-mas-stale-blocked-transport-residue') as { count: number };
      const staleSkipEvent = db.prepare(`
        SELECT payload_json
        FROM events
        WHERE task_id = ? AND event_type = 'task_default_executor_stale_auto_redrive_skip'
        LIMIT 1
      `).get('task-mas-stale-blocked-transport-residue') as { payload_json: string } | undefined;

      assert.equal(tick.selected_count, 1);
      assert.equal(tick.dispatches[0].task_id, 'task-mas-current-control-admission');
      assert.equal(tick.mas_default_executor_auto_redriven_count, 0);
      assert.equal(tick.mas_default_executor_auto_redrive_stale_skipped_count, 0);
      assert.equal(staleTask.status, 'blocked');
      assert.equal(staleTask.dead_letter_reason, 'temporal_stage_attempt_start_failed');
      assert.equal(redriveEventCount.count, 0);
      assert.equal(staleSkipEvent, undefined);
    });
  } finally {
    db.close();
  }
});

test('family-runtime tick auto-redrives blocked MAS current-control admission over newer terminal short-fingerprint residue', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await withIsolatedFamilyRuntimeEnv(async () => {
      createQueueTables(db);
      const currentPayload = {
        ...defaultExecutorPayloadForOwner({
          sourceFingerprint: 'study-progress-current-owner-ticket::003-dpcc-primary-care-phenotype-treatment-gap::dpcc_publication_gate_replay_after_current_ai_reviewer_record::run_gate_clearing_batch',
          actionType: 'run_gate_clearing_batch',
          nextOwner: 'ai_reviewer',
          dispatchAuthority: 'consumer_default_executor_dispatch',
          dispatchRef:
            'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/supervision/consumer/default_executor_dispatches/immutable/run_gate_clearing_batch/current.json',
        }),
        study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
        quest_id: '003-dpcc-primary-care-phenotype-treatment-gap',
        work_unit_id: 'dpcc_publication_gate_replay_after_current_ai_reviewer_record',
        work_unit_fingerprint:
          'study-progress-current-owner-ticket::003-dpcc-primary-care-phenotype-treatment-gap::dpcc_publication_gate_replay_after_current_ai_reviewer_record::run_gate_clearing_batch',
        action_fingerprint:
          'study-progress-current-owner-ticket::003-dpcc-primary-care-phenotype-treatment-gap::dpcc_publication_gate_replay_after_current_ai_reviewer_record::run_gate_clearing_batch',
        stage_packet_ref:
          'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/stage_packets/run_gate_clearing_batch.current.json',
        owner_route_currentness_basis: {
          generated_at: '2026-06-10T02:00:00Z',
          work_unit_id: 'dpcc_publication_gate_replay_after_current_ai_reviewer_record',
          work_unit_fingerprint:
            'study-progress-current-owner-ticket::003-dpcc-primary-care-phenotype-treatment-gap::dpcc_publication_gate_replay_after_current_ai_reviewer_record::run_gate_clearing_batch',
          truth_epoch: '2026-06-10T02:00:00Z',
          runtime_health_epoch: '2026-06-10T02:00:00Z',
          source_eval_id: 'publication_eval:latest',
        },
        provider_admission_identity: {
          status: 'provider_admission_pending',
          provider_admission_schema_source: 'opl_current_control_state/latest.json',
          action_fingerprint:
            'study-progress-current-owner-ticket::003-dpcc-primary-care-phenotype-treatment-gap::dpcc_publication_gate_replay_after_current_ai_reviewer_record::run_gate_clearing_batch',
        },
      };
      const residuePayload = {
        ...defaultExecutorPayloadForOwner({
          sourceFingerprint: '3d19168a1fbd2f72',
          actionType: 'run_gate_clearing_batch',
          nextOwner: 'ai_reviewer',
          dispatchAuthority: 'consumer_default_executor_dispatch',
          dispatchRef:
            'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/supervision/consumer/default_executor_dispatches/immutable/run_gate_clearing_batch/terminal-residue.json',
        }),
        study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
        quest_id: '003-dpcc-primary-care-phenotype-treatment-gap',
        work_unit_id: 'dpcc_publication_gate_replay_after_current_ai_reviewer_record',
      };
      insertDefaultExecutorTaskWithPayload(db, {
        taskId: 'task-mas-current-control-blocked-admission',
        payload: currentPayload,
        dedupeKey:
          'study-progress-current-owner-ticket::003-dpcc-primary-care-phenotype-treatment-gap::dpcc_publication_gate_replay_after_current_ai_reviewer_record::run_gate_clearing_batch',
        createdAt: '2026-06-10T02:00:00.000Z',
        status: 'blocked',
        attempts: 1,
      });
      db.prepare(`
        UPDATE tasks
        SET last_error = 'default executor dispatch has no launchable Temporal Codex stage attempt.',
          dead_letter_reason = 'temporal_stage_attempt_not_completed'
        WHERE task_id = ?
      `).run('task-mas-current-control-blocked-admission');
      insertDefaultExecutorTaskWithPayload(db, {
        taskId: 'task-mas-terminal-short-fingerprint-residue',
        payload: residuePayload,
        dedupeKey: 'mas:dm-cvd:003:default-executor:run_gate_clearing_batch:3d19168a1fbd2f72',
        createdAt: '2026-06-10T02:05:00.000Z',
        status: 'succeeded',
        attempts: 1,
      });

      let dispatchCount = 0;
      const tick = await runFamilyRuntimeQueueTick(db, familyRuntimePaths(), {
        source: 'test-current-control-blocked-admission-auto-redrive',
        limit: 2,
        hydrate: false,
        taskScope: {
          domainId: 'medautoscience',
          taskKind: 'domain_owner/default-executor-dispatch',
          payloadMatches: [
            {
              path: 'study_id',
              value: '003-dpcc-primary-care-phenotype-treatment-gap',
            },
          ],
        },
      }, {
        enqueueTask: () => ({ accepted: false }),
        dispatchTask: (_db, _paths, row: FamilyRuntimeTaskRow) => {
          dispatchCount += 1;
          return { task_id: row.task_id };
        },
      });
      const redrivenTask = db.prepare(`
        SELECT status, last_error, dead_letter_reason
        FROM tasks
        WHERE task_id = ?
      `).get('task-mas-current-control-blocked-admission') as {
        status: string;
        last_error: string | null;
        dead_letter_reason: string | null;
      };
      const attempts = db.prepare(`
        SELECT status, blocked_reason
        FROM stage_attempts
        WHERE task_id = ?
        ORDER BY created_at ASC
      `).all('task-mas-current-control-blocked-admission') as Array<{
        status: string;
        blocked_reason: string | null;
      }>;
      const staleSkipEventCount = db.prepare(`
        SELECT COUNT(*) AS count
        FROM events
        WHERE task_id = ?
          AND event_type = 'task_default_executor_stale_auto_redrive_skip'
      `).get('task-mas-current-control-blocked-admission') as { count: number };

      assert.equal(tick.mas_default_executor_auto_redriven_count, 1);
      assert.equal(tick.mas_default_executor_auto_redrive_stale_skipped_count, 0);
      assert.equal(tick.selected_count, 1);
      assert.equal(dispatchCount, 1);
      assert.equal(tick.dispatches[0].task_id, 'task-mas-current-control-blocked-admission');
      assert.equal(redrivenTask.status, 'queued');
      assert.equal(redrivenTask.last_error, null);
      assert.equal(redrivenTask.dead_letter_reason, null);
      assert.equal(attempts.length, 1);
      assert.equal(attempts[0].status, 'queued');
      assert.equal(attempts[0].blocked_reason, null);
      assert.equal(staleSkipEventCount.count, 0);
    });
  } finally {
    db.close();
  }
});
