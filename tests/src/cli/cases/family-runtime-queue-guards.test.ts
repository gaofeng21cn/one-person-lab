import { DatabaseSync } from 'node:sqlite';

import { assert, fs, os, path, runCli, test } from '../helpers.ts';

function createDispatchFixture(body: string) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-dispatch-'));
  const dispatchPath = path.join(fixtureRoot, 'dispatch');
  fs.writeFileSync(
    dispatchPath,
    `#!/usr/bin/env bash
set -euo pipefail
TASK_PATH="$1"
${body}
`,
    { mode: 0o755 },
  );
  return { fixtureRoot, dispatchPath };
}

function familyRuntimeEnv(stateRoot: string, extra: Record<string, string> = {}) {
  return {
    OPL_STATE_DIR: stateRoot,
    ...extra,
  };
}

test('family-runtime retries failed domain dispatch and then dead-letters', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-dead-letter-'));
  const dispatch = createDispatchFixture('echo "planned failure" >&2\nexit 17');
  try {
    runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'domain_route/recover',
      '--payload',
      '{"profile":"/tmp/profile.toml"}',
    ], familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH: dispatch.dispatchPath,
    }));
    for (let index = 0; index < 3; index += 1) {
      runCli(['family-runtime', 'tick', '--source', `test-${index}`], familyRuntimeEnv(stateRoot, {
        OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH: dispatch.dispatchPath,
      }));
    }
    const queue = runCli(['family-runtime', 'queue', 'list'], familyRuntimeEnv(stateRoot));
    const task = queue.family_runtime_queue.tasks[0];

    assert.equal(task.status, 'dead_letter');
    assert.equal(task.attempts, 3);
    assert.equal(task.dead_letter_reason, 'retry_budget_exhausted');
    assert.match(task.last_error, /planned failure/);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(dispatch.fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime hydration is idempotent and blocks exported forbidden writes', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-hydrate-idempotent-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-mas-export-idempotent-'));
  const exportPath = path.join(fixtureRoot, 'export');
  fs.writeFileSync(
    exportPath,
    `#!/usr/bin/env bash
set -euo pipefail
cat <<'JSON'
{
  "pending_family_tasks": [
    {
      "domain_id": "medautoscience",
      "task_kind": "domain_route/reconcile-apply",
      "dedupe_key": "mas:test:DM003:autonomy-continuation:slo_breach",
      "payload": {"profile": "/tmp/profile.toml", "study_id": "DM003"}
    },
    {
      "domain_id": "medautoscience",
      "task_kind": "artifact/override",
      "dedupe_key": "mas:test:bad-write",
      "payload": {"domain_truth_write": true}
    }
  ]
}
JSON
`,
    { mode: 0o755 },
  );
  try {
    const first = runCli(['family-runtime', 'intake', '--domain', 'medautoscience'], familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_EXPORT: exportPath,
    }));
    const second = runCli(['family-runtime', 'intake', '--domain', 'medautoscience'], familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_EXPORT: exportPath,
    }));
    const queue = runCli(['family-runtime', 'queue', 'list'], familyRuntimeEnv(stateRoot));

    assert.equal(first.family_runtime_intake.enqueued_count, 1);
    assert.equal(first.family_runtime_intake.blocked_count, 1);
    assert.equal(second.family_runtime_intake.enqueued_count, 0);
    assert.equal(second.family_runtime_intake.idempotent_noop_count, 1);
    assert.equal(queue.family_runtime_queue.queue.total, 1);
    assert.equal(queue.family_runtime_queue.tasks[0].dedupe_key, 'mas:test:DM003:autonomy-continuation:slo_breach');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime hydration preserves domain dispatch evidence record payloads', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-hydrate-evidence-payload-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-mas-export-evidence-payload-'));
  const exportPath = path.join(fixtureRoot, 'export');
  fs.writeFileSync(
    exportPath,
    `#!/usr/bin/env bash
set -euo pipefail
cat <<'JSON'
{
  "pending_family_tasks": [
    {
      "domain_id": "medautoscience",
      "task_kind": "domain_owner/default-executor-dispatch",
      "dedupe_key": "mas:test:DM002:default-executor:source-1",
      "source_fingerprint": "source-1",
      "domain_dispatch_evidence_record_payload": {
        "surface_kind": "mas_domain_dispatch_evidence_record_payload",
        "record_payload": {
          "domain_id": "medautoscience",
          "task_kind": "domain_owner/default-executor-dispatch",
          "study_id": "DM002",
          "domain_source_fingerprint": "source-1",
          "typed_blocker_refs": ["mas-typed-blocker:DM002"],
          "no_regression_refs": ["mas-no-forbidden-write:DM002"],
          "evidence_refs": ["dispatch.json"]
        }
      },
      "payload": {
        "profile": "/tmp/profile.toml",
        "study_id": "DM002",
        "dispatch_ref": "dispatch.json",
        "next_executable_owner": "write",
        "executor_kind": "codex_cli_default",
        "source_fingerprint": "truth-snapshot:DM002"
      }
    }
  ]
}
JSON
`,
    { mode: 0o755 },
  );
  try {
    const intake = runCli(['family-runtime', 'intake', '--domain', 'medautoscience'], familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_EXPORT: exportPath,
    }));
    const queue = runCli(['family-runtime', 'queue', 'list'], familyRuntimeEnv(stateRoot));
    const task = queue.family_runtime_queue.tasks[0];

    assert.equal(intake.family_runtime_intake.enqueued_count, 1);
    assert.equal(task.payload.domain_dispatch_evidence_record_payload.surface_kind, 'mas_domain_dispatch_evidence_record_payload');
    assert.deepEqual(
      task.payload.domain_dispatch_evidence_record_payload.record_payload.typed_blocker_refs,
      ['mas-typed-blocker:DM002'],
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime blocks domain truth writes before dispatch', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-forbidden-'));
  try {
    runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautogrant',
      '--task-kind',
      'artifact/override',
      '--payload',
      '{"domain_truth_write":true}',
    ], familyRuntimeEnv(stateRoot));
    const tick = runCli(['family-runtime', 'tick', '--source', 'test'], familyRuntimeEnv(stateRoot));
    const queue = runCli(['family-runtime', 'queue', 'list'], familyRuntimeEnv(stateRoot));

    assert.equal(tick.family_runtime_tick.dispatches[0].status, 'blocked');
    assert.equal(tick.family_runtime_tick.dispatches[0].reason, 'domain_forbidden_write');
    assert.equal(queue.family_runtime_queue.tasks[0].status, 'blocked');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime queue hold persists scoped admission for future hydration', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-durable-hold-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-durable-hold-export-'));
  const exportPath = path.join(fixtureRoot, 'export');
  const dispatch = createDispatchFixture(`
python3 - "$TASK_PATH" <<'PY'
import json
import sys
from pathlib import Path

task = json.loads(Path(sys.argv[1]).read_text())
print(json.dumps({
    "accepted": True,
    "surface_kind": "test_dispatch",
    "study_id": task["payload"].get("study_id")
}))
PY
`);
  fs.writeFileSync(
    exportPath,
    `#!/usr/bin/env bash
set -euo pipefail
cat <<'JSON'
{
  "pending_family_tasks": [
    {
      "domain_id": "medautoscience",
      "task_kind": "domain_route/reconcile-apply",
      "dedupe_key": "mas:test:DM002:resume",
      "payload": {"profile": "/tmp/profile.toml", "study_id": "DM002"}
    },
    {
      "domain_id": "medautoscience",
      "task_kind": "domain_route/reconcile-apply",
      "dedupe_key": "mas:test:DM003:resume",
      "payload": {"profile": "/tmp/profile.toml", "study_id": "DM003"}
    }
  ]
}
JSON
`,
    { mode: 0o755 },
  );
  try {
    const env = familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_EXPORT: exportPath,
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH: dispatch.dispatchPath,
    });
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
    const intake = runCli(['family-runtime', 'intake', '--domain', 'medautoscience'], env);
    const tick = runCli(['family-runtime', 'tick', '--source', 'test', '--limit', '10'], env);
    const queue = runCli(['family-runtime', 'queue', 'list'], familyRuntimeEnv(stateRoot));
    const dm003 = queue.family_runtime_queue.tasks.find((task: { payload: { study_id?: string } }) =>
      task.payload.study_id === 'DM003'
    );
    const dm002 = queue.family_runtime_queue.tasks.find((task: { payload: { study_id?: string } }) =>
      task.payload.study_id === 'DM002'
    );

    assert.equal(hold.family_runtime_queue_hold.active_hold.status, 'active');
    assert.equal(intake.family_runtime_intake.enqueued_count, 2);
    assert.equal(tick.family_runtime_tick.selected_count, 1);
    assert.equal(tick.family_runtime_tick.dispatches[0].output.study_id, 'DM002');
    assert.equal(dm002.status, 'succeeded');
    assert.equal(dm003.status, 'waiting_approval');
    assert.equal(dm003.requires_approval, true);
    assert.equal(dm003.last_error, 'manual_pause_for_mas_upgrade');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(dispatch.fixtureRoot, { recursive: true, force: true });
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

test('family-runtime queue hold prevents provider redrive from starting a new attempt', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-held-redrive-'));
  const dispatch = createDispatchFixture(`
python3 - "$TASK_PATH" <<'PY'
import json
print(json.dumps({
  "accepted": True,
  "surface_kind": "mas_family_domain_handler_dispatch_receipt",
  "dispatch": {
    "execution_policy": "opl_default_executor_stage_attempt_admission",
    "result": {"status": "admitted"}
  }
}))
PY
`);
  try {
    const env = familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH: dispatch.dispatchPath,
      OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
    });
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
        action_type: 'run_quality_repair_batch',
        dispatch_ref: 'dispatch:dm003',
        next_executable_owner: 'write',
        executor_kind: 'codex_cli_default',
      }),
      '--dedupe-key',
      'mas:test:DM003:held-redrive',
    ], env);
    const taskId = enqueued.family_runtime_enqueue.task.task_id;
    runCli(['family-runtime', 'tick', '--source', 'test-start-failure'], env);
    const blockedTask = runCli(['family-runtime', 'queue', 'inspect', taskId], env);

    runCli([
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
    const redrive = runCli([
      'family-runtime',
      'queue',
      'redrive',
      taskId,
      '--reason',
      'provider_runtime_fixed_but_study_still_paused',
      '--source',
      'test-held-redrive',
    ], env);
    const heldTask = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const tick = runCli(['family-runtime', 'tick', '--source', 'test-after-held-redrive'], env);

    assert.equal(blockedTask.family_runtime_task.task.status, 'blocked');
    assert.equal(blockedTask.family_runtime_task.stage_attempts.length, 1);
    assert.equal(redrive.family_runtime_redrive.redriven, true);
    assert.equal(redrive.family_runtime_redrive.provider_redrive_started, false);
    assert.equal(redrive.family_runtime_redrive.held_by_active_hold, true);
    assert.equal(redrive.family_runtime_redrive.redriven_stage_attempt, null);
    assert.equal(redrive.family_runtime_redrive.task.status, 'waiting_approval');
    assert.equal(heldTask.family_runtime_task.task.status, 'waiting_approval');
    assert.equal(heldTask.family_runtime_task.task.last_error, 'manual_pause_for_mas_upgrade');
    assert.equal(heldTask.family_runtime_task.stage_attempts.length, 1);
    assert.equal(tick.family_runtime_tick.selected_count, 0);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(dispatch.fixtureRoot, { recursive: true, force: true });
  }
});
