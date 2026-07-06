import { DatabaseSync } from 'node:sqlite';
import { WorkflowNotFoundError } from '@temporalio/common';

import {
  assert,
  fs,
  os,
  path,
  parseJsonText,
  test,
} from './helpers.ts';

import { runSchedulerQueueTick } from '../../../../../src/modules/runway/family-runtime-scheduler-tick-runner.ts';
import { runFamilyRuntimeQueueTick } from '../../../../../src/modules/runway/family-runtime-tick.ts';
import {
  createFamilyRuntimeQueueTables,
  familyRuntimePaths,
  listEvents,
  type FamilyRuntimeTaskRow,
} from '../../../../../src/modules/runway/family-runtime-store.ts';
import { ensureProviderHostedStageAttempt } from '../../../../../src/modules/runway/family-runtime-provider-hosted-attempts.ts';
import {
  ingestStageAttemptCloseout,
  listStageAttemptsForTask,
} from '../../../../../src/modules/runway/family-runtime-stage-attempts.ts';

type TickDispatch = { task_id: string; status?: string };
type QueueTickWithMasDefaultExecutorRedrive = Awaited<
  ReturnType<typeof runFamilyRuntimeQueueTick<TickDispatch>>
>;

async function withIsolatedFamilyRuntimeEnv<T>(fn: () => T | Promise<T>) {
  const previous = {
    OPL_STATE_DIR: process.env.OPL_STATE_DIR,
    OPL_FAMILY_RUNTIME_PROVIDER: process.env.OPL_FAMILY_RUNTIME_PROVIDER,
    OPL_TEMPORAL_ADDRESS: process.env.OPL_TEMPORAL_ADDRESS,
    TEMPORAL_ADDRESS: process.env.TEMPORAL_ADDRESS,
  };
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-stale-admission-test-'));
  process.env.OPL_STATE_DIR = stateRoot;
  process.env.OPL_FAMILY_RUNTIME_PROVIDER = 'temporal';
  delete process.env.OPL_TEMPORAL_ADDRESS;
  delete process.env.TEMPORAL_ADDRESS;
  try {
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
}

function createQueueTables(db: DatabaseSync) {
  createFamilyRuntimeQueueTables(db);
}

function defaultExecutorPayload(sourceFingerprint: string) {
  return {
    profile: '/tmp/dm-cvd.profile.toml',
    study_id: '002-dm-china-us-mortality-attribution',
    quest_id: '002-dm-china-us-mortality-attribution',
    action_type: 'return_to_ai_reviewer_workflow',
    dispatch_authority: 'ai_reviewer_record_production_handoff',
    next_executable_owner: 'ai_reviewer',
    executor_kind: 'codex_cli_default',
    dispatch_ref: 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/return_to_ai_reviewer_workflow.json',
    authority_boundary: 'mas_default_executor_dispatch_request_only',
    workspace_root: '/tmp/explicit-workspace-root',
    source_fingerprint: sourceFingerprint,
  };
}

function currentControlAdmissionPayload(input: {
  sourceFingerprint: string;
  truthEpoch: string;
  runtimeHealthEpoch: string;
  sourceEvalId: string;
}) {
  const workUnitFingerprint = input.sourceFingerprint;
  return {
    ...defaultExecutorPayload(input.sourceFingerprint),
    action_type: 'return_to_ai_reviewer_workflow',
    dispatch_authority: 'ai_reviewer_record_production_handoff',
    next_executable_owner: 'ai_reviewer',
    work_unit_id: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
    work_unit_fingerprint: workUnitFingerprint,
    action_fingerprint: workUnitFingerprint,
    provider_admission_identity: {
      status: 'provider_admission_pending',
      action_fingerprint: workUnitFingerprint,
    },
    owner_route_currentness_basis: {
      work_unit_id: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
      work_unit_fingerprint: workUnitFingerprint,
      truth_epoch: input.truthEpoch,
      runtime_health_epoch: input.runtimeHealthEpoch,
      source_eval_id: input.sourceEvalId,
    },
  };
}

function readinessSurfacePayload(sourceFingerprint: string) {
  return {
    ...defaultExecutorPayload(sourceFingerprint),
    action_type: 'complete_medical_paper_readiness_surface',
    dispatch_authority: 'consumer_default_executor_dispatch',
    next_executable_owner: 'MedAutoScience',
    domain_owner: 'MedAutoScience',
    work_unit_id: 'complete_medical_paper_readiness_surface',
    dispatch_ref: 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/immutable/complete_medical_paper_readiness_surface/79fb44a18783dfe7438929b6.json',
    owner_route_currentness_basis: {
      work_unit_id: 'complete_medical_paper_readiness_surface',
      work_unit_fingerprint: `stage-current-owner-delta::complete_medical_paper_readiness_surface::${sourceFingerprint}`,
    },
  };
}

function insertDefaultExecutorTask(db: DatabaseSync) {
  const createdAt = '2026-05-25T16:30:00.000Z';
  db.prepare(`
    INSERT INTO tasks(
      task_id, domain_id, task_kind, payload_json, dedupe_key, priority, status,
      attempts, max_attempts, source, requires_approval, approved_at, lease_owner,
      lease_expires_at, last_error, dead_letter_reason, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'task-mas-default-expired-admission-missing-workflow',
    'medautoscience',
    'domain_owner/default-executor-dispatch',
    JSON.stringify(defaultExecutorPayload('source-stable-expired-admission')),
    'mas:dm-cvd:002:default-executor:return_to_ai_reviewer_workflow:source-stable-expired-admission',
    65,
    'running',
    1,
    3,
    'test-domain-export',
    0,
    null,
    'opl-family-runtime:stale',
    '2026-05-25T16:35:00.000Z',
    null,
    null,
    createdAt,
    createdAt,
  );
}

test('family-runtime tick recovers expired MAS default executor admission whose Temporal workflow was never started', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await withIsolatedFamilyRuntimeEnv(async () => {
      createQueueTables(db);
      insertDefaultExecutorTask(db);
      const row = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(
        'task-mas-default-expired-admission-missing-workflow',
      ) as FamilyRuntimeTaskRow;
      const payload = parseJsonText(row.payload_json) as Record<string, unknown>;
      const staleAttempt = ensureProviderHostedStageAttempt(db, row, payload);
      assert.ok(staleAttempt);

      let queryCount = 0;
      let dispatchCount = 0;
      const tick = await runFamilyRuntimeQueueTick<TickDispatch>(db, familyRuntimePaths(), {
        source: 'test-expired-admission-missing-workflow',
        limit: 2,
        hydrate: false,
        taskScope: {
          domainId: 'medautoscience',
          taskKind: 'domain_owner/default-executor-dispatch',
          payloadMatches: [{
            path: 'study_id',
            value: '002-dm-china-us-mortality-attribution',
          }],
        },
      }, {
        enqueueTask: () => ({ accepted: false }),
        queryTemporalStageAttempt: async () => {
          queryCount += 1;
          return {
            surface_kind: 'temporal_stage_attempt_query_unavailable',
            provider_kind: 'temporal',
            stage_attempt_id: staleAttempt.stage_attempt_id,
            workflow_id: staleAttempt.workflow_id,
            status: 'unavailable',
            reason: 'temporal_workflow_not_started_or_not_found',
            error: {
              code: 'temporal_workflow_not_found',
              message: 'workflow not found',
            },
          };
        },
        dispatchTask: (_db, _paths, selectedRow: FamilyRuntimeTaskRow) => {
          dispatchCount += 1;
          return { task_id: selectedRow.task_id };
        },
      });
      const task = db.prepare('SELECT status FROM tasks WHERE task_id = ?').get(
        'task-mas-default-expired-admission-missing-workflow',
      ) as { status: string };
      const attempts = db.prepare(`
        SELECT status
        FROM stage_attempts
        WHERE task_id = ?
        ORDER BY created_at ASC
      `).all('task-mas-default-expired-admission-missing-workflow') as Array<{ status: string }>;

      assert.equal(queryCount, 1);
      assert.equal(tick.mas_default_executor_terminal_synced_count, 1);
      assert.equal(tick.mas_default_executor_auto_redriven_count, 1);
      assert.equal(tick.selected_count, 1);
      assert.equal(dispatchCount, 1);
      assert.equal(task.status, 'queued');
      assert.equal(attempts.length, 2);
      assert.equal(attempts[0].status, 'failed');
      assert.equal(attempts[1].status, 'queued');
    });
  } finally {
    db.close();
  }
});

test('scheduler tick syncs missing Temporal workflows through the safe read model before dispatch', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await withIsolatedFamilyRuntimeEnv(async () => {
      createQueueTables(db);
      insertDefaultExecutorTask(db);
      const row = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(
        'task-mas-default-expired-admission-missing-workflow',
      ) as FamilyRuntimeTaskRow;
      const payload = parseJsonText(row.payload_json) as Record<string, unknown>;
      const staleAttempt = ensureProviderHostedStageAttempt(db, row, payload);
      assert.ok(staleAttempt);

      let rawQueryCount = 0;
      let safeQueryCount = 0;
      const paths = familyRuntimePaths();
      const tick = await runSchedulerQueueTick(
        db,
        paths,
        'test-scheduler-expired-admission-missing-workflow',
        2,
        false,
        {
          domainId: 'medautoscience',
          taskKind: 'domain_owner/default-executor-dispatch',
          payloadMatches: [{
            path: 'study_id',
            value: '002-dm-china-us-mortality-attribution',
          }],
        },
        undefined,
        {
          temporalProviderModule: async () => ({
            queryTemporalStageAttemptWorkflow: async () => {
              rawQueryCount += 1;
              throw new WorkflowNotFoundError(
                `workflow not found for ID: ${staleAttempt.workflow_id}`,
                staleAttempt.workflow_id,
                undefined,
              );
            },
            startTemporalStageAttemptWorkflow: async (attempt) => ({
              surface_kind: 'temporal_stage_attempt_start_receipt',
              provider_kind: 'temporal',
              stage_attempt_id: attempt.stage_attempt_id,
              workflow_id: attempt.workflow_id,
              first_execution_run_id: 'test-run',
              eagerly_started: false,
              namespace: 'default',
              task_queue: 'opl-family-runtime',
              authority_boundary: {
                opl: 'temporal_workflow_transport_and_control_metadata_only',
                domain: 'truth_quality_artifact_gate_owner',
              },
            }),
          }),
          queryTemporalStageAttemptReadModel: async (attempt) => {
            safeQueryCount += 1;
            return {
              surface_kind: 'temporal_stage_attempt_query_unavailable',
              provider_kind: 'temporal',
              stage_attempt_id: attempt.stage_attempt_id,
              workflow_id: attempt.workflow_id,
              status: 'unavailable',
              reason: 'temporal_workflow_not_started_or_not_found',
              error: {
                code: 'temporal_workflow_not_found',
                message: 'workflow not found',
              },
              authority_boundary: {
                opl: 'local_stage_attempt_ledger_projection_only',
                domain: 'truth_quality_artifact_gate_owner',
              },
            };
          },
        },
      ) as QueueTickWithMasDefaultExecutorRedrive;
      const task = db.prepare('SELECT status FROM tasks WHERE task_id = ?').get(
        'task-mas-default-expired-admission-missing-workflow',
      ) as { status: string };
      const attempts = db.prepare(`
        SELECT status
        FROM stage_attempts
        WHERE task_id = ?
        ORDER BY created_at ASC
      `).all('task-mas-default-expired-admission-missing-workflow') as Array<{ status: string }>;

      assert.equal(rawQueryCount, 0);
      assert.equal(safeQueryCount, 1);
      assert.equal(tick.mas_default_executor_terminal_synced_count, 1);
      assert.equal(tick.mas_default_executor_auto_redriven_count, 1);
      assert.equal(tick.selected_count, 1);
      assert.equal(tick.dispatches[0].status, 'running');
      assert.equal(task.status, 'running');
      assert.equal(attempts.length, 2);
      assert.equal(attempts[0].status, 'failed');
      assert.equal(attempts[1].status, 'running');
    });
  } finally {
    db.close();
  }
});

test('family-runtime tick does not re-admit a MAS default executor task after accepted completed closeout', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await withIsolatedFamilyRuntimeEnv(async () => {
      createQueueTables(db);
      insertDefaultExecutorTask(db);
      const row = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(
        'task-mas-default-expired-admission-missing-workflow',
      ) as FamilyRuntimeTaskRow;
      const payload = parseJsonText(row.payload_json) as Record<string, unknown>;
      const completedAttempt = ensureProviderHostedStageAttempt(db, row, payload);
      assert.ok(completedAttempt);
      ingestStageAttemptCloseout(db, {
        stageAttemptId: completedAttempt.stage_attempt_id,
        packet: {
          surface_kind: 'stage_attempt_closeout_packet',
          closeout_refs: ['closeout:completed-default-executor'],
          consumed_refs: ['dispatch:completed-default-executor'],
          consumed_memory_refs: [],
          writeback_receipt_refs: ['receipt:completed-default-executor'],
          rejected_writes: [],
          next_owner: 'publication_gate',
          domain_ready_verdict: 'read_from_mas_publication_or_gate_surface',
          route_impact: {
            decision: 'domain_owner_refs_ready',
          },
        },
      });
      db.prepare(`
        UPDATE tasks
        SET status = 'queued', attempts = 0, lease_owner = NULL, lease_expires_at = NULL,
          last_error = NULL, dead_letter_reason = NULL
        WHERE task_id = ?
      `).run('task-mas-default-expired-admission-missing-workflow');

      let dispatchCount = 0;
      const tick = await runFamilyRuntimeQueueTick<TickDispatch>(db, familyRuntimePaths(), {
        source: 'test-completed-closeout-requeue',
        limit: 2,
        hydrate: false,
        taskScope: {
          domainId: 'medautoscience',
          taskKind: 'domain_owner/default-executor-dispatch',
          payloadMatches: [{
            path: 'study_id',
            value: '002-dm-china-us-mortality-attribution',
          }],
        },
      }, {
        enqueueTask: () => ({ accepted: false }),
        queryTemporalStageAttempt: async () => {
          throw new Error('completed accepted closeout should be reconciled before Temporal query');
        },
        dispatchTask: (_db, _paths, selectedRow: FamilyRuntimeTaskRow) => {
          dispatchCount += 1;
          return { task_id: selectedRow.task_id };
        },
      });
      const task = db.prepare('SELECT status FROM tasks WHERE task_id = ?').get(
        'task-mas-default-expired-admission-missing-workflow',
      ) as { status: string };
      const attempts = listStageAttemptsForTask(db, 'task-mas-default-expired-admission-missing-workflow');
      const reconcileEvents = listEvents(db).filter((event) =>
        event.event_type === 'task_default_executor_completed_closeout_reconciled'
      );

      assert.equal(tick.selected_count, 0);
      assert.equal(tick.mas_default_executor_completed_closeout_reconciled_count, 1);
      assert.equal(dispatchCount, 0);
      assert.equal(task.status, 'succeeded');
      assert.equal(attempts.length, 1);
      assert.equal(attempts[0].status, 'completed');
      assert.equal(attempts[0].closeout_receipt_status, 'accepted_typed_closeout');
      assert.deepEqual(attempts[0].closeout_refs, ['closeout:completed-default-executor']);
      assert.equal(reconcileEvents.length, 1);
      assert.equal(
        reconcileEvents[0].payload.reason,
        'same_task_completed_typed_closeout_exists',
      );
      assert.equal(
        reconcileEvents[0].payload.authority_boundary.provider_stage_attempt_started,
        false,
      );
    });
  } finally {
    db.close();
  }
});

test('family-runtime tick does not reconcile old completed closeout over fresh MAS current-control admission', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await withIsolatedFamilyRuntimeEnv(async () => {
      createQueueTables(db);
      const taskId = 'task-mas-current-control-fresh-after-old-closeout';
      const createdAt = '2026-06-08T16:55:00.000Z';
      const stalePayload = currentControlAdmissionPayload({
        sourceFingerprint: 'sha256:stable-current-control-work-unit',
        truthEpoch: 'truth-event-000029-old',
        runtimeHealthEpoch: 'runtime-health-event-006474-old',
        sourceEvalId: 'publication-eval::old',
      });
      const freshPayload = currentControlAdmissionPayload({
        sourceFingerprint: 'sha256:stable-current-control-work-unit',
        truthEpoch: 'truth-event-000030-fresh',
        runtimeHealthEpoch: 'runtime-health-event-006488-fresh',
        sourceEvalId: 'publication-eval::fresh',
      });
      db.prepare(`
        INSERT INTO tasks(
          task_id, domain_id, task_kind, payload_json, dedupe_key, priority, status,
          attempts, max_attempts, source, requires_approval, approved_at, lease_owner,
          lease_expires_at, last_error, dead_letter_reason, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        taskId,
        'medautoscience',
        'domain_owner/default-executor-dispatch',
        JSON.stringify(stalePayload),
        'mas:dm-cvd:002:default-executor:return_to_ai_reviewer_workflow:fresh-after-old-closeout',
        95,
        'queued',
        0,
        3,
        'opl-current-control-provider-admission',
        0,
        null,
        null,
        null,
        null,
        null,
        createdAt,
        createdAt,
      );
      const staleRow = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(taskId) as FamilyRuntimeTaskRow;
      const completedAttempt = ensureProviderHostedStageAttempt(db, staleRow, stalePayload);
      assert.ok(completedAttempt);
      ingestStageAttemptCloseout(db, {
        stageAttemptId: completedAttempt.stage_attempt_id,
        packet: {
          surface_kind: 'stage_attempt_closeout_packet',
          closeout_refs: ['closeout:old-current-control'],
          consumed_refs: ['dispatch:old-current-control'],
          consumed_memory_refs: [],
          writeback_receipt_refs: ['receipt:old-current-control'],
          rejected_writes: [],
          next_owner: 'ai_reviewer',
          domain_ready_verdict: 'read_from_mas_publication_or_gate_surface',
          route_impact: {
            decision: 'domain_owner_refs_ready',
          },
        },
      });
      db.prepare(`
        UPDATE tasks
        SET payload_json = ?, status = 'queued', attempts = 0, lease_owner = NULL,
          lease_expires_at = NULL, last_error = NULL, dead_letter_reason = NULL
        WHERE task_id = ?
      `).run(JSON.stringify(freshPayload), taskId);

      let dispatchCount = 0;
      const tick = await runFamilyRuntimeQueueTick<TickDispatch>(db, familyRuntimePaths(), {
        source: 'test-current-control-fresh-after-old-closeout',
        limit: 2,
        hydrate: false,
        taskScope: {
          domainId: 'medautoscience',
          taskKind: 'domain_owner/default-executor-dispatch',
          payloadMatches: [{
            path: 'study_id',
            value: '002-dm-china-us-mortality-attribution',
          }],
        },
      }, {
        enqueueTask: () => ({ accepted: false }),
        queryTemporalStageAttempt: async () => {
          throw new Error('old completed closeout should not require Temporal query');
        },
        dispatchTask: (_db, _paths, selectedRow: FamilyRuntimeTaskRow) => {
          dispatchCount += 1;
          return { task_id: selectedRow.task_id };
        },
      });
      const task = db.prepare('SELECT status FROM tasks WHERE task_id = ?').get(taskId) as { status: string };
      const reconcileEvents = listEvents(db).filter((event) =>
        event.event_type === 'task_default_executor_completed_closeout_reconciled'
      );

      assert.equal(tick.selected_count, 1);
      assert.equal(tick.mas_default_executor_completed_closeout_reconciled_count, 0);
      assert.equal(dispatchCount, 1);
      assert.equal(task.status, 'queued');
      assert.equal(reconcileEvents.length, 0);
    });
  } finally {
    db.close();
  }
});

test('family-runtime tick re-admits MAS readiness owner action when completed closeout lacks current Stage Native answer', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await withIsolatedFamilyRuntimeEnv(async () => {
      createQueueTables(db);
      const taskId = 'task-mas-readiness-completed-closeout-missing-stage-native-answer';
      const createdAt = '2026-06-07T13:55:00.000Z';
      const payload = readinessSurfacePayload('readiness-closeout-redrive');
      db.prepare(`
        INSERT INTO tasks(
          task_id, domain_id, task_kind, payload_json, dedupe_key, priority, status,
          attempts, max_attempts, source, requires_approval, approved_at, lease_owner,
          lease_expires_at, last_error, dead_letter_reason, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        taskId,
        'medautoscience',
        'domain_owner/default-executor-dispatch',
        JSON.stringify(payload),
        'mas:dm-cvd:002:default-executor:complete_medical_paper_readiness_surface:readiness-closeout-redrive',
        65,
        'queued',
        0,
        3,
        'test-domain-export',
        0,
        null,
        null,
        null,
        null,
        null,
        createdAt,
        createdAt,
      );
      const row = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(taskId) as FamilyRuntimeTaskRow;
      const completedAttempt = ensureProviderHostedStageAttempt(db, row, payload);
      assert.ok(completedAttempt);
      ingestStageAttemptCloseout(db, {
        stageAttemptId: completedAttempt.stage_attempt_id,
        packet: {
          surface_kind: 'stage_attempt_closeout_packet',
          closeout_refs: [
            'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_execution/latest.json',
            'artifacts/stage_outputs/08-publication_package_handoff/receipts/typed_blocker.json',
          ],
          consumed_refs: ['dispatch:completed-default-executor'],
          consumed_memory_refs: [],
          writeback_receipt_refs: [],
          rejected_writes: [],
          next_owner: 'medautoscience',
          domain_ready_verdict: 'blocked_from_medical_paper_readiness_owner_surface',
          route_impact: {
            action_type: 'complete_medical_paper_readiness_surface',
            owner_result_status: 'typed_blocker_or_stop_loss',
          },
        },
      });

      let dispatchCount = 0;
      const tick = await runFamilyRuntimeQueueTick<TickDispatch>(db, familyRuntimePaths(), {
        source: 'test-readiness-closeout-without-stage-native-answer',
        limit: 2,
        hydrate: false,
        taskScope: {
          domainId: 'medautoscience',
          taskKind: 'domain_owner/default-executor-dispatch',
          payloadMatches: [{
            path: 'study_id',
            value: '002-dm-china-us-mortality-attribution',
          }],
        },
      }, {
        enqueueTask: () => ({ accepted: false }),
        queryTemporalStageAttempt: async () => {
          throw new Error('completed attempt is terminal and should not require Temporal query');
        },
        dispatchTask: (_db, _paths, selectedRow: FamilyRuntimeTaskRow) => {
          dispatchCount += 1;
          return { task_id: selectedRow.task_id };
        },
      });
      const task = db.prepare('SELECT status FROM tasks WHERE task_id = ?').get(taskId) as { status: string };
      const reconcileEvents = listEvents(db).filter((event) =>
        event.event_type === 'task_default_executor_completed_closeout_reconciled'
      );

      assert.equal(tick.selected_count, 1);
      assert.equal(tick.mas_default_executor_completed_closeout_reconciled_count, 0);
      assert.equal(dispatchCount, 1);
      assert.equal(task.status, 'queued');
      assert.equal(reconcileEvents.length, 0);
    });
  } finally {
    db.close();
  }
});
