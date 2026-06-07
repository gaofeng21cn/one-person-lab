import { DatabaseSync } from 'node:sqlite';

import { assert, fs, os, path, runCli, test } from '../helpers.ts';
import { familyRuntimeEnv } from './family-runtime-queue-guards-helpers.ts';

test('family-runtime queue retire blocks stale residue and prevents dedupe rehydration', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-queue-retire-'));
  try {
    const env = familyRuntimeEnv(stateRoot);
    const enqueued = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'paper_autonomy/guarded-apply',
      '--payload',
      JSON.stringify({
        study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
        source_fingerprint: 'old-guarded-apply-source',
      }),
      '--dedupe-key',
      'mas:dm003:provider-hosted-guarded-apply:opl-temporal',
    ], env);
    const taskId = enqueued.family_runtime_enqueue.task.task_id;
    const attempt = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'paper_autonomy/guarded-apply',
      '--provider',
      'temporal',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mas","study_id":"003-dpcc-primary-care-phenotype-treatment-gap"}',
      '--source-fingerprint',
      'old-guarded-apply-source',
      '--executor-kind',
      'codex_cli',
      '--task',
      taskId,
    ], env).family_runtime_stage_attempt.attempt;

    const retire = runCli([
      'family-runtime',
      'queue',
      'retire',
      '--study',
      '003-dpcc-primary-care-phenotype-treatment-gap',
      '--task-kind',
      'paper_autonomy/guarded-apply',
      '--reason',
      'superseded_by_publication_handoff_owner_gate',
      '--source',
      'test-retire',
    ], env);
    const rehydrate = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'paper_autonomy/guarded-apply',
      '--payload',
      JSON.stringify({
        study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
        source_fingerprint: 'old-guarded-apply-source',
      }),
      '--dedupe-key',
      'mas:dm003:provider-hosted-guarded-apply:opl-temporal',
      '--source',
      'test-rehydrate',
    ], env);
    const queued = runCli([
      'family-runtime',
      'queue',
      'list',
      '--study',
      '003-dpcc-primary-care-phenotype-treatment-gap',
      '--status',
      'queued',
    ], env);
    const blocked = runCli([
      'family-runtime',
      'queue',
      'inspect',
      taskId,
    ], env);
    const retiredAttempt = blocked.family_runtime_task.stage_attempts.find((entry: { stage_attempt_id: string }) =>
      entry.stage_attempt_id === attempt.stage_attempt_id
    );

    assert.equal(retire.family_runtime_queue_retire.retired_count, 1);
    assert.equal(retire.family_runtime_queue_retire.retired_attempt_count, 1);
    assert.equal(retire.family_runtime_queue_retire.retired_tasks[0].status, 'blocked');
    assert.equal(
      retire.family_runtime_queue_retire.retired_tasks[0].dead_letter_reason,
      'operator_retired_stale_runtime_residue:superseded_by_publication_handoff_owner_gate',
    );
    assert.equal(rehydrate.family_runtime_enqueue.accepted, false);
    assert.equal(rehydrate.family_runtime_enqueue.idempotent_noop, true);
    assert.equal(rehydrate.family_runtime_enqueue.task.status, 'blocked');
    assert.equal(queued.family_runtime_queue.queue.total, 0);
    assert.equal(blocked.family_runtime_task.task.status, 'blocked');
    assert.equal(retiredAttempt.status, 'blocked');
    assert.equal(
      retiredAttempt.blocked_reason,
      'operator_retired_stale_runtime_residue:superseded_by_publication_handoff_owner_gate',
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime queue list filters by domain, study, and status for Progress-First monitoring', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-queue-list-filter-'));
  try {
    const env = familyRuntimeEnv(stateRoot);
    const dm002Running = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'domain_owner/default-executor-dispatch',
      '--payload',
      '{"profile":"/tmp/profile.toml","study_id":"DM002","work_unit":"running-target"}',
      '--dedupe-key',
      'mas:test:DM002:running-target',
    ], env).family_runtime_enqueue.task.task_id;
    runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'domain_owner/default-executor-dispatch',
      '--payload',
      '{"profile":"/tmp/profile.toml","study_id":"DM002","work_unit":"queued-control"}',
      '--dedupe-key',
      'mas:test:DM002:queued-control',
    ], env);
    const dm003Running = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'domain_owner/default-executor-dispatch',
      '--payload',
      '{"profile":"/tmp/profile.toml","study_id":"DM003","work_unit":"running-control"}',
      '--dedupe-key',
      'mas:test:DM003:running-control',
    ], env).family_runtime_enqueue.task.task_id;
    const magRunning = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautogrant',
      '--task-kind',
      'grant_owner/default-executor-dispatch',
      '--payload',
      '{"profile":"/tmp/profile.toml","study_id":"DM002","work_unit":"domain-control"}',
      '--dedupe-key',
      'mag:test:DM002:running-control',
    ], env).family_runtime_enqueue.task.task_id;

    const db = new DatabaseSync(path.join(stateRoot, 'family-runtime', 'queue.sqlite'));
    try {
      const now = new Date().toISOString();
      db.prepare("UPDATE tasks SET status = 'running', updated_at = ? WHERE task_id IN (?, ?, ?)")
        .run(now, dm002Running, dm003Running, magRunning);
    } finally {
      db.close();
    }

    const queue = runCli([
      'family-runtime',
      'queue',
      'list',
      '--domain',
      'medautoscience',
      '--study',
      'DM002',
      '--status',
      'running',
    ], env);

    assert.equal(queue.family_runtime_queue.queue.total, 1);
    assert.equal(queue.family_runtime_queue.queue.by_status.running, 1);
    assert.equal(queue.family_runtime_queue.unfiltered_queue.total, 4);
    assert.deepEqual(queue.family_runtime_queue.filters, {
      status: 'running',
      taskScope: {
        domainId: 'medautoscience',
        payloadMatches: [{ path: 'study_id', value: 'DM002' }],
      },
    });
    assert.equal(queue.family_runtime_queue.tasks.length, 1);
    assert.equal(queue.family_runtime_queue.tasks[0].task_id, dm002Running);
    assert.equal(queue.family_runtime_queue.tasks[0].payload.study_id, 'DM002');
    assert.equal(queue.family_runtime_queue.tasks[0].status, 'running');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime queue list exposes linked live stage-attempt heartbeat for running tasks', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-queue-running-liveness-'));
  try {
    const env = familyRuntimeEnv(stateRoot);
    const runningTask = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'domain_owner/default-executor-dispatch',
      '--payload',
      '{"profile":"/tmp/profile.toml","study_id":"DM002","work_unit":"ai-reviewer"}',
      '--dedupe-key',
      'mas:test:DM002:running-liveness',
    ], env).family_runtime_enqueue.task.task_id;

    const ledgerHeartbeatAt = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const activityHeartbeatAt = new Date().toISOString();
    const db = new DatabaseSync(path.join(stateRoot, 'family-runtime', 'queue.sqlite'));
    try {
      const leaseExpiresAt = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      db.prepare(`
        UPDATE tasks
        SET status = 'running',
          lease_owner = 'opl-family-runtime:test-worker',
          lease_expires_at = ?,
          updated_at = ?
        WHERE task_id = ?
      `).run(leaseExpiresAt, leaseExpiresAt, runningTask);
      db.prepare(`
        INSERT INTO stage_attempts(
          stage_attempt_id, idempotency_key, provider_kind, workflow_id, domain_id, stage_id,
          workspace_locator_json, source_fingerprint, executor_kind, status,
          checkpoint_refs_json, closeout_refs_json, human_gate_refs_json, retry_budget_json,
          attempt_count, task_id, blocked_reason, provider_receipt_json, provider_run_json,
          activity_events_json, route_impact_json, closeout_receipt_status, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'sat_queue_running_liveness',
        'idem_queue_running_liveness',
        'temporal',
        'wf_queue_running_liveness',
        'medautoscience',
        'domain_owner/default-executor-dispatch',
        JSON.stringify({ workspace_root: '/tmp/dm-cvd' }),
        'source:running-liveness',
        'codex_cli',
        'running',
        JSON.stringify([]),
        JSON.stringify([]),
        JSON.stringify([]),
        JSON.stringify({ max_attempts: 3 }),
        1,
        runningTask,
        null,
        JSON.stringify({ provider_kind: 'temporal', provider_status: 'running' }),
        JSON.stringify({
          provider_kind: 'temporal',
          workflow_id: 'wf_queue_running_liveness',
          provider_status: 'running',
          last_heartbeat_at: ledgerHeartbeatAt,
        }),
        JSON.stringify([
          {
            event_time: activityHeartbeatAt,
            activity_kind: 'codex_stage_activity',
            activity_status: 'running',
            heartbeat_kind: 'codex_stage_activity_runner_progress',
            runner_event_kind: 'agent_message',
          },
        ]),
        JSON.stringify({}),
        null,
        leaseExpiresAt,
        activityHeartbeatAt,
      );
    } finally {
      db.close();
    }

    const queue = runCli([
      'family-runtime',
      'queue',
      'list',
      '--domain',
      'medautoscience',
      '--study',
      'DM002',
      '--status',
      'running',
    ], env);
    const task = queue.family_runtime_queue.tasks[0];

    assert.equal(queue.family_runtime_queue.queue.total, 1);
    assert.equal(task.task_id, runningTask);
    assert.equal(task.status, 'running');
    assert.equal(task.linked_stage_attempt_liveness.status, 'live');
    assert.equal(task.linked_stage_attempt_liveness.stage_attempt_id, 'sat_queue_running_liveness');
    assert.equal(task.linked_stage_attempt_liveness.workflow_id, 'wf_queue_running_liveness');
    assert.equal(task.linked_stage_attempt_liveness.last_heartbeat_at, activityHeartbeatAt);
    assert.equal(task.linked_stage_attempt_liveness.ledger_last_heartbeat_at, ledgerHeartbeatAt);
    assert.equal(task.linked_stage_attempt_liveness.liveness_source, 'provider_activity_event');
    assert.equal(task.linked_stage_attempt_liveness.last_runner_event_kind, 'agent_message');
    assert.equal(
      task.linked_stage_attempt_liveness.task_lease_currentness,
      'expired_but_provider_heartbeat_fresh',
    );
    assert.equal(
      task.linked_stage_attempt_liveness.authority_boundary.queue_lease_role,
      'worker_pickup_lease_not_live_attempt_truth',
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime queue hold drains scoped running task and active attempt into operator gate', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-running-hold-'));
  try {
    const env = familyRuntimeEnv(stateRoot);
    const enqueued = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'domain_owner/default-executor-dispatch',
      '--payload',
      JSON.stringify({
        workspace_root: '/tmp/mas',
        study_id: 'DM003',
        action_type: 'return_to_ai_reviewer_workflow',
        dispatch_ref: 'dispatch:dm003',
        next_executable_owner: 'write',
        executor_kind: 'codex_cli_default',
      }),
      '--dedupe-key',
      'mas:test:DM003:running-hold',
    ], env);
    const taskId = enqueued.family_runtime_enqueue.task.task_id;
    const attempt = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'domain_owner/default-executor-dispatch',
      '--provider',
      'temporal',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mas","study_id":"DM003"}',
      '--source-fingerprint',
      'dm003-running-hold-source',
      '--task',
      taskId,
    ], env).family_runtime_stage_attempt.attempt;

    const db = new DatabaseSync(path.join(stateRoot, 'family-runtime', 'queue.sqlite'));
    try {
      const now = new Date().toISOString();
      db.prepare(`
        UPDATE tasks
        SET status = 'running', lease_owner = 'stale-worker', lease_expires_at = '2999-01-01T00:00:00.000Z',
          updated_at = ?
        WHERE task_id = ?
      `).run(now, taskId);
      db.prepare(`
        UPDATE stage_attempts
        SET status = 'running',
          provider_run_json = json_set(provider_run_json, '$.provider_status', 'running', '$.last_heartbeat_at', ?),
          updated_at = ?
        WHERE stage_attempt_id = ?
      `).run(now, now, attempt.stage_attempt_id);
    } finally {
      db.close();
    }

    const hold = runCli([
      'family-runtime',
      'queue',
      'hold',
      '--study',
      'DM003',
      '--reason',
      'manual_pause_for_mas_upgrade',
      '--source',
      'test-supervisor',
    ], env);
    const tick = runCli(['family-runtime', 'tick', '--source', 'test', '--limit', '10'], env);
    const task = runCli(['family-runtime', 'queue', 'inspect', taskId], env).family_runtime_task;
    const heldAttempt = task.stage_attempts.find((entry: { stage_attempt_id: string }) =>
      entry.stage_attempt_id === attempt.stage_attempt_id
    );

    assert.equal(hold.family_runtime_queue_hold.active_task_hold_count, 1);
    assert.equal(hold.family_runtime_queue_hold.held_attempt_count, 1);
    assert.equal(tick.family_runtime_tick.selected_count, 0);
    assert.equal(task.task.status, 'waiting_approval');
    assert.equal(task.task.lease, null);
    assert.equal(task.task.last_error, 'manual_pause_for_mas_upgrade');
    assert.equal(heldAttempt.status, 'human_gate');
    assert.equal(heldAttempt.blocked_reason, 'manual_pause_for_mas_upgrade');
    assert.equal(heldAttempt.provider_run.provider_status, 'operator_hold_requested');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime tick reconciles waiting-approval tasks whose attempts stayed queued', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-waiting-approval-attempt-'));
  try {
    const env = familyRuntimeEnv(stateRoot);
    const enqueued = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'domain_owner/default-executor-dispatch',
      '--payload',
      JSON.stringify({
        workspace_root: '/tmp/mas',
        study_id: 'DM003',
        action_type: 'return_to_ai_reviewer_workflow',
        dispatch_ref: 'dispatch:dm003',
        next_executable_owner: 'ai_reviewer',
        executor_kind: 'codex_cli_default',
      }),
      '--dedupe-key',
      'mas:test:DM003:waiting-approval-attempt',
    ], env);
    const taskId = enqueued.family_runtime_enqueue.task.task_id;
    const attempt = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'domain_owner/default-executor-dispatch',
      '--provider',
      'temporal',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mas","study_id":"DM003"}',
      '--source-fingerprint',
      'dm003-waiting-approval-source',
      '--task',
      taskId,
    ], env).family_runtime_stage_attempt.attempt;

    const db = new DatabaseSync(path.join(stateRoot, 'family-runtime', 'queue.sqlite'));
    try {
      const now = new Date().toISOString();
      db.prepare(`
        UPDATE tasks
        SET status = 'waiting_approval', requires_approval = 1, approved_at = NULL,
          lease_owner = NULL, lease_expires_at = NULL, last_error = ?, dead_letter_reason = NULL,
          updated_at = ?
        WHERE task_id = ?
      `).run('manual_pause_for_mas_upgrade', now, taskId);
      db.prepare(`
        UPDATE stage_attempts
        SET status = 'queued', blocked_reason = NULL,
          provider_run_json = json_set(provider_run_json, '$.provider_status', 'registered'),
          updated_at = ?
        WHERE stage_attempt_id = ?
      `).run(now, attempt.stage_attempt_id);
    } finally {
      db.close();
    }

    const tick = runCli(['family-runtime', 'tick', '--source', 'test-waiting-approval-reconcile'], env);
    const task = runCli(['family-runtime', 'queue', 'inspect', taskId], env).family_runtime_task;
    const heldAttempt = task.stage_attempts.find((entry: { stage_attempt_id: string }) =>
      entry.stage_attempt_id === attempt.stage_attempt_id
    );

    assert.equal(tick.family_runtime_tick.waiting_approval_attempt_reconciled_count, 1);
    assert.equal(tick.family_runtime_tick.selected_count, 0);
    assert.equal(task.task.status, 'waiting_approval');
    assert.equal(task.task.last_error, 'manual_pause_for_mas_upgrade');
    assert.equal(heldAttempt.status, 'human_gate');
    assert.equal(heldAttempt.blocked_reason, 'manual_pause_for_mas_upgrade');
    assert.equal(heldAttempt.provider_run.provider_status, 'operator_hold_requested');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
