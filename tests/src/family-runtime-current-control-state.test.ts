import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import { enqueueTask } from '../../src/family-runtime-enqueue.ts';
import { inspectTask } from '../../src/family-runtime-store.ts';
import {
  createStageAttempt,
  createStageAttemptTable,
  ingestStageAttemptCloseout,
  recordStageAttemptActivityHeartbeat,
} from '../../src/family-runtime-stage-attempts.ts';
import { deriveCurrentControlStateForTask } from '../../src/family-runtime-current-control-state.ts';

function withDb(fn: (db: DatabaseSync) => void) {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`
      CREATE TABLE tasks (
        task_id TEXT PRIMARY KEY,
        domain_id TEXT NOT NULL,
        task_kind TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        dedupe_key TEXT UNIQUE,
        priority INTEGER NOT NULL,
        status TEXT NOT NULL,
        attempts INTEGER NOT NULL,
        max_attempts INTEGER NOT NULL,
        source TEXT NOT NULL,
        requires_approval INTEGER NOT NULL,
        approved_at TEXT,
        lease_owner TEXT,
        lease_expires_at TEXT,
        last_error TEXT,
        dead_letter_reason TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE events (
        event_id TEXT PRIMARY KEY,
        task_id TEXT,
        domain_id TEXT,
        event_type TEXT NOT NULL,
        source TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE notifications (
        notification_id TEXT PRIMARY KEY,
        task_id TEXT,
        severity TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        channel TEXT NOT NULL,
        status TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
    createStageAttemptTable(db);
    fn(db);
  } finally {
    db.close();
  }
}

function enqueueDefaultTask(db: DatabaseSync, payload: Record<string, unknown> = {}) {
  const result = enqueueTask(db, {
    domainId: 'medautoscience',
    taskKind: 'domain_owner/default-executor-dispatch',
    payload: {
      profile: '/tmp/mas.profile.toml',
      study_id: '002-dm',
      quest_id: '002-dm',
      action_type: 'run_quality_repair_batch',
      dispatch_ref: 'dispatch/latest.json',
      next_executable_owner: 'write',
      executor_kind: 'codex_cli_default',
      source_fingerprint: 'truth:epoch-1',
      route_epoch: 'route:epoch-1',
      truth_epoch: 'truth:epoch-1',
      ...payload,
    },
    dedupeKey: `dedupe:${crypto.randomUUID()}`,
    source: 'test',
  });
  assert.ok(result.task);
  return result.task;
}

function createTaskAttempt(
  db: DatabaseSync,
  task: ReturnType<typeof enqueueDefaultTask>,
  input: {
    sourceFingerprint?: string | null;
    workspaceEpochs?: Record<string, unknown>;
    start?: boolean;
  } = {},
) {
  const attempt = createStageAttempt(db, {
    domainId: 'medautoscience',
    stageId: 'domain_owner/default-executor-dispatch',
    providerKind: 'temporal',
    workspaceLocator: {
      workspace_root: '/tmp/mas',
      route_epoch: 'route:epoch-1',
      truth_epoch: 'truth:epoch-1',
      ...input.workspaceEpochs,
    },
    sourceFingerprint: input.sourceFingerprint === null
      ? undefined
      : input.sourceFingerprint ?? 'truth:epoch-1',
    executorKind: 'codex_cli',
    taskId: task.task_id,
    newAttempt: true,
  }).attempt;
  if (input.start) {
    db.prepare("UPDATE stage_attempts SET status = 'running' WHERE stage_attempt_id = ?").run(
      attempt.stage_attempt_id,
    );
  }
  return attempt;
}

test('current control state binds MAS default executor task freshness to domain source fingerprint', () => {
  withDb((db) => {
    const task = enqueueDefaultTask(db, {
      source_fingerprint: 'mas-domain-source:fresh',
    });
    createTaskAttempt(db, task, {
      sourceFingerprint: 'opl-stage-source:derived',
      workspaceEpochs: {
        domain_source_fingerprint: 'mas-domain-source:fresh',
      },
      start: true,
    });

    const state = deriveCurrentControlStateForTask(db, task.task_id);

    assert.equal(state.reconciliation_status, 'running');
    assert.deepEqual(state.stale_epoch_kinds, []);
    assert.equal(state.source_fingerprint, 'opl-stage-source:derived');
  });
});

test('current control state exposes active provider attempt identity without domain readiness claims', () => {
  withDb((db) => {
    const task = enqueueDefaultTask(db, {
      study_id: '002-dm-china-us-mortality-attribution',
      quest_id: '002-dm-china-us-mortality-attribution',
      source_fingerprint: 'mas-domain-source:fresh',
    });
    const attempt = createTaskAttempt(db, task, {
      sourceFingerprint: 'opl-stage-source:derived',
      workspaceEpochs: {
        domain_source_fingerprint: 'mas-domain-source:fresh',
      },
      start: true,
    });

    const state = deriveCurrentControlStateForTask(db, task.task_id);

    assert.equal(state.reconciliation_status, 'running');
    assert.equal(state.current_attempt_state, 'running');
    assert.equal(state.active_run_id, `opl-stage-attempt://${attempt.stage_attempt_id}`);
    assert.equal(state.active_stage_attempt_id, attempt.stage_attempt_id);
    assert.equal(state.running_provider_attempt, true);
    assert.equal(state.task_id, task.task_id);
    assert.equal(state.workflow_id, attempt.workflow_id);
    assert.equal(Object.hasOwn(state, 'domain_ready'), false);
    assert.equal(Object.hasOwn(state, 'publication_ready'), false);
    assert.equal(Object.hasOwn(state, 'artifact_ready'), false);
  });
});

test('current control state carries stage progress log observability for the active attempt', () => {
  withDb((db) => {
    const task = enqueueDefaultTask(db, {
      study_id: '002-dm-china-us-mortality-attribution',
      quest_id: '002-dm-china-us-mortality-attribution',
      source_fingerprint: 'mas-domain-source:fresh',
    });
    const attempt = createTaskAttempt(db, task, {
      sourceFingerprint: 'opl-stage-source:derived',
      workspaceEpochs: {
        domain_source_fingerprint: 'mas-domain-source:fresh',
      },
      start: true,
    });
    recordStageAttemptActivityHeartbeat(db, {
      stageAttemptId: attempt.stage_attempt_id,
      heartbeatKind: 'codex_stage_activity_runner_progress',
      runnerEventKind: 'agent_message',
      checkpointRefs: ['studies/002-dm/dispatch.json'],
      observedAt: '2026-05-27T05:07:17.035Z',
    });

    const state = deriveCurrentControlStateForTask(db, task.task_id);

    assert.equal(state.stage_progress_log.surface_kind, 'opl_stage_progress_log_summary');
    assert.equal(state.stage_progress_log.attempt_count, 1);
    assert.equal(state.stage_progress_log.runner_progress_event_count, 1);
    assert.deepEqual(state.stage_progress_log.attempt_refs, [
      `/stage_attempt_workbench/attempts/${attempt.stage_attempt_id}/stage_progress_log`,
    ]);
    assert.equal(state.stage_progress_log.authority_boundary.can_authorize_quality_verdict, false);
    assert.equal(state.active_stage_attempt_stage_progress_log_ref, (
      `/stage_attempt_workbench/attempts/${attempt.stage_attempt_id}/stage_progress_log`
    ));
    assert.equal(Object.hasOwn(state, 'domain_ready'), false);
    assert.equal(Object.hasOwn(state, 'publication_ready'), false);
    assert.equal(Object.hasOwn(state, 'artifact_ready'), false);
  });
});

test('current control state uses provider activity heartbeat as running liveness projection', () => {
  withDb((db) => {
    const task = enqueueDefaultTask(db, {
      study_id: '002-dm-china-us-mortality-attribution',
      quest_id: '002-dm-china-us-mortality-attribution',
      source_fingerprint: 'mas-domain-source:fresh',
    });
    const attempt = createTaskAttempt(db, task, {
      sourceFingerprint: 'opl-stage-source:derived',
      workspaceEpochs: {
        domain_source_fingerprint: 'mas-domain-source:fresh',
      },
      start: true,
    });
    db.prepare(`
      UPDATE stage_attempts
      SET provider_run_json = json_set(provider_run_json, '$.last_heartbeat_at', ?),
        activity_events_json = json_insert(activity_events_json, '$[#]', json(?))
      WHERE stage_attempt_id = ?
    `).run(
      '2026-05-27T05:01:17.035Z',
      JSON.stringify({
        event_time: '2026-05-27T05:04:47.035Z',
        activity_kind: 'codex_stage_activity',
        activity_status: 'running',
        heartbeat_kind: 'codex_stage_activity_supervision',
      }),
      attempt.stage_attempt_id,
    );

    const state = deriveCurrentControlStateForTask(db, task.task_id);

    assert.equal(state.reconciliation_status, 'running');
    assert.equal(state.current_attempt_state, 'running');
    assert.equal(state.provider_run.last_heartbeat_at, '2026-05-27T05:04:47.035Z');
    assert.equal(state.provider_run.ledger_last_heartbeat_at, '2026-05-27T05:01:17.035Z');
    assert.equal(state.provider_run.liveness_source, 'provider_activity_event');
    assert.equal(state.running_provider_attempt, true);
    assert.equal(Object.hasOwn(state, 'domain_ready'), false);
    assert.equal(Object.hasOwn(state, 'publication_ready'), false);
    assert.equal(Object.hasOwn(state, 'artifact_ready'), false);
  });
});

test('stage attempt activity heartbeat writer feeds current control liveness projection', () => {
  withDb((db) => {
    const task = enqueueDefaultTask(db, {
      source_fingerprint: 'mas-domain-source:fresh',
    });
    const attempt = createTaskAttempt(db, task, {
      sourceFingerprint: 'opl-stage-source:derived',
      workspaceEpochs: {
        domain_source_fingerprint: 'mas-domain-source:fresh',
      },
      start: true,
    });

    recordStageAttemptActivityHeartbeat(db, {
      stageAttemptId: attempt.stage_attempt_id,
      heartbeatKind: 'codex_stage_activity_runner_progress',
      runnerEventKind: 'agent_message',
      checkpointRefs: ['dispatch/latest.json'],
      observedAt: '2026-05-27T05:07:17.035Z',
    });

    const state = deriveCurrentControlStateForTask(db, task.task_id);

    assert.equal(state.provider_run.last_heartbeat_at, '2026-05-27T05:07:17.035Z');
    assert.equal(state.provider_run.liveness_source, 'provider_activity_event');
    assert.equal(state.provider_run.last_runner_event_kind, 'agent_message');
    assert.equal(state.authority_boundary.provider_completion_is_domain_ready, false);
    assert.equal(Object.hasOwn(state, 'domain_ready'), false);
  });
});

test('current control state fails closed when task or attempt identity is incomplete', () => {
  withDb((db) => {
    const task = enqueueDefaultTask(db);
    createTaskAttempt(db, task, { sourceFingerprint: null });

    const state = deriveCurrentControlStateForTask(db, task.task_id);

    assert.equal(state.reconciliation_status, 'blocked_missing_identity');
    assert.equal(state.current_attempt_state, 'blocked');
    assert.equal(state.authority_boundary.provider_completion_is_domain_ready, false);
    assert.equal(Object.hasOwn(state, 'domain_ready'), false);
    assert.equal(Object.hasOwn(state, 'publication_ready'), false);
    assert.equal(Object.hasOwn(state, 'artifact_ready'), false);
  });
});

test('current control state fails closed on stale route source or truth epochs', () => {
  withDb((db) => {
    const task = enqueueDefaultTask(db, {
      source_fingerprint: 'truth:epoch-2',
      route_epoch: 'route:epoch-2',
      truth_epoch: 'truth:epoch-2',
    });
    createTaskAttempt(db, task, {
      sourceFingerprint: 'truth:epoch-1',
      workspaceEpochs: {
        route_epoch: 'route:epoch-1',
        truth_epoch: 'truth:epoch-1',
      },
    });

    const state = deriveCurrentControlStateForTask(db, task.task_id);

    assert.equal(state.reconciliation_status, 'blocked_stale_epoch');
    assert.deepEqual(state.stale_epoch_kinds, ['source_fingerprint', 'route_epoch', 'truth_epoch']);
    assert.equal(state.current_attempt_state, 'blocked');
  });
});

test('current control state requires typed closeout when provider reports completed', () => {
  withDb((db) => {
    const task = enqueueDefaultTask(db);
    const attempt = createTaskAttempt(db, task);
    db.prepare(`
      UPDATE stage_attempts
      SET status = 'completed',
        provider_run_json = json_set(provider_run_json, '$.provider_status', 'completed')
      WHERE stage_attempt_id = ?
    `).run(attempt.stage_attempt_id);

    const state = deriveCurrentControlStateForTask(db, task.task_id);

    assert.equal(state.reconciliation_status, 'blocked_provider_completed_missing_typed_closeout');
    assert.equal(state.current_attempt_state, 'blocked');
    assert.deepEqual(state.closeout_refs, []);
    assert.equal(state.closeout_receipt_status, null);
  });
});

test('current control state ignores older terminal attempt when a newer attempt is running', () => {
  withDb((db) => {
    const task = enqueueDefaultTask(db);
    const olderAttempt = createTaskAttempt(db, task, { sourceFingerprint: 'truth:older' });
    db.prepare(`
      UPDATE stage_attempts
      SET status = 'failed',
        blocked_reason = 'temporal_workflow_failed',
        provider_run_json = json_set(provider_run_json, '$.provider_status', 'failed')
      WHERE stage_attempt_id = ?
    `).run(olderAttempt.stage_attempt_id);
    createTaskAttempt(db, task, { start: true });

    const state = deriveCurrentControlStateForTask(db, task.task_id);

    assert.equal(state.reconciliation_status, 'running');
    assert.equal(state.current_attempt_state, 'running');
    assert.equal(state.current_stage_attempt_id === olderAttempt.stage_attempt_id, false);
    assert.equal(state.superseded_terminal_attempt_refs.length, 1);
  });
});

test('current control state accepts only the newest typed closeout as OPL reconciled projection', () => {
  withDb((db) => {
    const task = enqueueDefaultTask(db);
    const olderAttempt = createTaskAttempt(db, task, { sourceFingerprint: 'truth:older' });
    db.prepare(`
      UPDATE stage_attempts
      SET status = 'failed',
        blocked_reason = 'temporal_workflow_failed',
        provider_run_json = json_set(provider_run_json, '$.provider_status', 'failed')
      WHERE stage_attempt_id = ?
    `).run(olderAttempt.stage_attempt_id);
    const newerAttempt = createTaskAttempt(db, task);
    ingestStageAttemptCloseout(db, {
      stageAttemptId: newerAttempt.stage_attempt_id,
      packet: {
        surface_kind: 'stage_attempt_closeout_packet',
        closeout_refs: ['receipt:typed-closeout'],
        next_owner: 'med-autoscience',
        domain_ready_verdict: 'domain_gate_pending',
      },
    });

    const state = deriveCurrentControlStateForTask(db, task.task_id);

    assert.equal(state.reconciliation_status, 'accepted_typed_closeout');
    assert.equal(state.current_attempt_state, 'accepted_typed_closeout');
    assert.deepEqual(state.closeout_refs, ['receipt:typed-closeout']);
    assert.deepEqual(state.owner_receipt_refs, []);
    assert.equal(state.authority_boundary.opl_can_authorize_domain_ready, false);
  });
});

test('current control state classifies typed blocker refs carried in closeout refs', () => {
  withDb((db) => {
    const task = enqueueDefaultTask(db);
    const attempt = createTaskAttempt(db, task);
    const typedBlockerRef = [
      'mas-domain-dispatch-typed-blocker:medautoscience',
      'domain_owner-default-executor-dispatch:003-dpcc-primary-care-phenotype-treatment-gap',
      'truth-snapshot::971c2d5a5ef251bca15ae16d',
      'owner-receipt-or-live-paper-line-closeout-pending',
    ].join(':');
    const ordinaryCloseoutRef = 'studies/003/artifacts/typed-blocker-review-notes.json';
    ingestStageAttemptCloseout(db, {
      stageAttemptId: attempt.stage_attempt_id,
      packet: {
        surface_kind: 'stage_attempt_closeout_packet',
        closeout_refs: [
          ordinaryCloseoutRef,
          typedBlockerRef,
        ],
        next_owner: 'med-autoscience',
        domain_ready_verdict: 'domain_gate_pending',
      },
    });

    const state = deriveCurrentControlStateForTask(db, task.task_id);

    assert.equal(state.reconciliation_status, 'accepted_typed_closeout');
    assert.deepEqual(state.typed_blocker_refs, [typedBlockerRef]);
    assert.equal(state.typed_blocker_refs.includes(ordinaryCloseoutRef), false);
    assert.equal(state.authority_boundary.provider_completion_is_domain_ready, false);
    assert.equal(Object.hasOwn(state, 'domain_ready'), false);
  });
});

test('queue inspect exposes current control state without domain readiness claims', () => {
  withDb((db) => {
    const task = enqueueDefaultTask(db);
    const attempt = createTaskAttempt(db, task);
    ingestStageAttemptCloseout(db, {
      stageAttemptId: attempt.stage_attempt_id,
      packet: {
        surface_kind: 'stage_attempt_closeout_packet',
        closeout_refs: ['receipt:typed-closeout'],
        next_owner: 'med-autoscience',
        domain_ready_verdict: 'domain_gate_pending',
      },
    });

    const inspected = inspectTask(db, task.task_id);
    const state = inspected.task.current_control_state;

    assert.equal(state.reconciliation_status, 'accepted_typed_closeout');
    assert.equal(state.current_stage_attempt_id, attempt.stage_attempt_id);
    assert.equal(Object.hasOwn(state, 'domain_ready'), false);
    assert.equal(Object.hasOwn(state, 'publication_ready'), false);
    assert.equal(Object.hasOwn(state, 'artifact_ready'), false);
  });
});
