import { DatabaseSync } from 'node:sqlite';

import { assert, test } from './helpers.ts';
import {
  createQueueTables,
  defaultExecutorPayload,
  insertSucceededTask,
} from './mas-default-executor-single-flight-helpers.ts';

import { enqueueTask } from '../../../../../src/family-runtime-enqueue.ts';

test('family-runtime refreshes refs-only evidence payloads on succeeded MAS default executor dispatches', () => {
  const db = new DatabaseSync(':memory:');
  try {
    createQueueTables(db);
    const dedupeKey = 'mas:dm-cvd:002:default-executor:run_quality_repair_batch:evidence-payload-refresh';
    const basePayload = defaultExecutorPayload('source-current');
    insertSucceededTask(db, {
      taskId: 'task-mas-default-succeeded-provider-admission-evidence-payload',
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
      payload: { workspace_root: '/tmp/mag', source_fingerprint: 'source-before' },
      dedupeKey,
    });
    db.prepare(`
      UPDATE tasks
      SET domain_id = 'medautogrant', task_kind = 'user-loop/wakeup'
      WHERE task_id = ?
    `).run('task-generic-succeeded-export-update');

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
