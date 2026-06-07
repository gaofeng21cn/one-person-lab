import { DatabaseSync } from 'node:sqlite';

import { assert, test } from './helpers.ts';

import { enqueueTask } from '../../../../../src/family-runtime-enqueue.ts';
import { insertEvent } from '../../../../../src/family-runtime-store.ts';
import {
  createQueueTables,
  defaultExecutorPayload,
  insertSucceededTask,
} from './mas-default-executor-helpers.ts';

test('family-runtime does not auto-requeue succeeded MAS default executor dispatch from domain export updates', () => {
  const db = new DatabaseSync(':memory:');
  try {
    createQueueTables(db);
    const dedupeKey = 'mas:dm-cvd:002:default-executor:run_quality_repair_batch:auto-requeue-guard';
    const basePayload = defaultExecutorPayload('source-before');
    insertSucceededTask(db, {
      taskId: 'task-mas-default-succeeded-provider-admission',
      domainId: 'medautoscience',
      taskKind: 'domain_owner/default-executor-dispatch',
      payload: basePayload,
      dedupeKey,
    });

    const result = enqueueTask(db, {
      domainId: 'medautoscience',
      taskKind: 'domain_owner/default-executor-dispatch',
      payload: {
        ...basePayload,
        source_fingerprint: 'source-after',
        owner_route_work_unit_id: 'produce_ai_reviewer_publication_eval_record_against_current_manuscript',
      },
      dedupeKey,
      source: 'test-domain-export',
    });
    const task = db.prepare('SELECT status, payload_json FROM tasks WHERE task_id = ?').get(
      'task-mas-default-succeeded-provider-admission',
    ) as { status: string; payload_json: string };
    const requeueEvents = db.prepare(
      "SELECT COUNT(*) AS count FROM events WHERE task_id = ? AND event_type = 'task_requeued_from_domain_export_update'",
    ).get('task-mas-default-succeeded-provider-admission') as { count: number };

    assert.equal(result.accepted, false);
    assert.equal(result.idempotent_noop, true);
    assert.ok(result.task);
    assert.equal(result.task.status, 'succeeded');
    assert.equal(task.status, 'succeeded');
    assert.equal(JSON.parse(task.payload_json).source_fingerprint, 'source-before');
    assert.equal(requeueEvents.count, 0);
  } finally {
    db.close();
  }
});

test('family-runtime requeues transport-only succeeded MAS publication gate admission with no provider attempt', () => {
  const db = new DatabaseSync(':memory:');
  try {
    createQueueTables(db);
    const taskId = 'task-mas-default-transport-only-publication-gate';
    const dedupeKey = 'mas:dm-cvd:002:default-executor:publication_handoff_owner_gate:transport-only';
    const payload = {
      ...defaultExecutorPayload('publication-gate-transport-only-source'),
      action_type: 'publication_handoff_owner_gate',
      dispatch_authority: 'consumer_default_executor_dispatch',
      next_executable_owner: 'publication_gate_owner',
      domain_owner: 'publication_gate_owner',
      work_unit_id: 'publication_handoff_owner_gate',
      dispatch_ref: 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/publication_handoff_owner_gate.json',
    };
    insertSucceededTask(db, {
      taskId,
      domainId: 'medautoscience',
      taskKind: 'domain_owner/default-executor-dispatch',
      payload,
      dedupeKey,
    });
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
              next_owner: 'publication_gate_owner',
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

test('family-runtime refreshes succeeded MAS default executor dispatch metadata when domain owner fingerprint changes', () => {
  const db = new DatabaseSync(':memory:');
  try {
    createQueueTables(db);
    const dedupeKey = 'mas:dm-cvd:002:default-executor:run_quality_repair_batch:succeeded-owner-fingerprint-redrive';
    const basePayload = defaultExecutorPayload('source-current');
    insertSucceededTask(db, {
      taskId: 'task-mas-default-succeeded-owner-fingerprint-redrive',
      domainId: 'medautoscience',
      taskKind: 'domain_owner/default-executor-dispatch',
      payload: {
        ...basePayload,
        opl_domain_export_context: {
          command_source: 'module_exec_profile',
          owner_fingerprint: 'module_exec_profile:/tmp/profile.toml:medautoscience:managed_root:head-before:/tmp/modules/med-autoscience',
        },
      },
      dedupeKey,
    });

    const result = enqueueTask(db, {
      domainId: 'medautoscience',
      taskKind: 'domain_owner/default-executor-dispatch',
      payload: {
        ...basePayload,
        opl_domain_export_context: {
          command_source: 'module_exec_profile',
          owner_fingerprint: 'module_exec_profile:/tmp/profile.toml:medautoscience:managed_root:head-after:/tmp/modules/med-autoscience',
        },
      },
      dedupeKey,
      source: 'test-domain-export',
    });
    const task = db.prepare('SELECT status, payload_json FROM tasks WHERE task_id = ?').get(
      'task-mas-default-succeeded-owner-fingerprint-redrive',
    ) as { status: string; payload_json: string };
    const payload = JSON.parse(task.payload_json);
    const refreshEvent = db.prepare(`
      SELECT payload_json
      FROM events
      WHERE task_id = ? AND event_type = 'task_metadata_refreshed_from_domain_export'
      LIMIT 1
    `).get('task-mas-default-succeeded-owner-fingerprint-redrive') as { payload_json: string } | undefined;

    assert.equal(result.accepted, false);
    assert.equal(result.idempotent_noop, true);
    assert.equal(task.status, 'succeeded');
    assert.equal(
      payload.opl_domain_export_context.owner_fingerprint,
      'module_exec_profile:/tmp/profile.toml:medautoscience:managed_root:head-after:/tmp/modules/med-autoscience',
    );
    assert.ok(refreshEvent);
    assert.equal(
      JSON.parse(refreshEvent.payload_json).reason,
      'domain_export_owner_fingerprint_changed_after_succeeded',
    );
  } finally {
    db.close();
  }
});

test('family-runtime refreshes refs-only evidence payloads on succeeded MAS default executor dispatches', () => {
  const db = new DatabaseSync(':memory:');
  try {
    createQueueTables(db);
    const dedupeKey = 'mas:dm-cvd:002:default-executor:run_quality_repair_batch:evidence-payload-refresh';
    const basePayload = defaultExecutorPayload('source-current');
    insertSucceededTask(db, {
      taskId: 'task-mas-default-succeeded-provider-admission-evidence-payload',
      domainId: 'medautoscience',
      taskKind: 'domain_owner/default-executor-dispatch',
      payload: basePayload,
      dedupeKey,
    });

    const result = enqueueTask(db, {
      domainId: 'medautoscience',
      taskKind: 'domain_owner/default-executor-dispatch',
      payload: {
        ...basePayload,
        domain_dispatch_evidence_record_payload: {
          surface_kind: 'mas_domain_dispatch_evidence_record_payload',
          record_payload: {
            domain_id: 'medautoscience',
            task_kind: 'domain_owner/default-executor-dispatch',
            study_id: '002-dm-china-us-mortality-attribution',
            domain_source_fingerprint: 'source-current',
            typed_blocker_refs: ['mas-typed-blocker:DM002'],
            no_regression_refs: ['mas-no-forbidden-write:DM002'],
            evidence_refs: ['dispatch.json'],
          },
        },
      },
      dedupeKey,
      source: 'test-domain-export',
    });
    const task = db.prepare('SELECT status, payload_json FROM tasks WHERE task_id = ?').get(
      'task-mas-default-succeeded-provider-admission-evidence-payload',
    ) as { status: string; payload_json: string };
    const payload = JSON.parse(task.payload_json);
    const requeueEvents = db.prepare(
      "SELECT COUNT(*) AS count FROM events WHERE task_id = ? AND event_type = 'task_requeued_from_domain_export_update'",
    ).get('task-mas-default-succeeded-provider-admission-evidence-payload') as { count: number };

    assert.equal(result.accepted, false);
    assert.equal(result.idempotent_noop, true);
    assert.ok(result.task);
    assert.equal(result.task.status, 'succeeded');
    assert.equal(task.status, 'succeeded');
    assert.equal(payload.domain_dispatch_evidence_record_payload.surface_kind, 'mas_domain_dispatch_evidence_record_payload');
    assert.deepEqual(
      payload.domain_dispatch_evidence_record_payload.record_payload.typed_blocker_refs,
      ['mas-typed-blocker:DM002'],
    );
    assert.equal(requeueEvents.count, 0);
  } finally {
    db.close();
  }
});

test('family-runtime still requeues generic succeeded tasks when domain export changes', () => {
  const db = new DatabaseSync(':memory:');
  try {
    createQueueTables(db);
    const dedupeKey = 'mag:generic:succeeded:export-update';
    insertSucceededTask(db, {
      taskId: 'task-generic-succeeded-export-update',
      domainId: 'medautogrant',
      taskKind: 'user-loop/wakeup',
      payload: { workspace_root: '/tmp/mag', source_fingerprint: 'source-before' },
      dedupeKey,
    });

    const result = enqueueTask(db, {
      domainId: 'medautogrant',
      taskKind: 'user-loop/wakeup',
      payload: { workspace_root: '/tmp/mag', source_fingerprint: 'source-after' },
      dedupeKey,
      source: 'test-domain-export',
    });
    const task = db.prepare('SELECT status, payload_json FROM tasks WHERE task_id = ?').get(
      'task-generic-succeeded-export-update',
    ) as { status: string; payload_json: string };

    assert.equal(result.accepted, true);
    assert.equal(result.requeued_from_terminal, true);
    assert.equal(task.status, 'queued');
    assert.equal(JSON.parse(task.payload_json).source_fingerprint, 'source-after');
  } finally {
    db.close();
  }
});
