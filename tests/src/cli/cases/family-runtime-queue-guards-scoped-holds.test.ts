import { DatabaseSync } from 'node:sqlite';

import { assert, fs, os, path, runCli, test } from '../helpers.ts';
import { createDispatchFixture, familyRuntimeEnv } from './family-runtime-queue-guards-helpers.ts';

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

test('family-runtime queue release clears durable scoped hold for future hydration', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-durable-release-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-durable-release-export-'));
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
      "dedupe_key": "mas:test:DM002:release-resume",
      "payload": {"profile": "/tmp/profile.toml", "study_id": "DM002"}
    },
    {
      "domain_id": "medautoscience",
      "task_kind": "domain_route/reconcile-apply",
      "dedupe_key": "mas:test:DM003:release-resume",
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
    });
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
    const release = runCli([
      'family-runtime',
      'queue',
      'release',
      '--study',
      'DM003',
      '--reason',
      'manual_pause_for_mas_upgrade',
      '--source',
      'test-supervisor',
    ], env);
    const intake = runCli(['family-runtime', 'intake', '--domain', 'medautoscience'], env);
    const queue = runCli(['family-runtime', 'queue', 'list'], familyRuntimeEnv(stateRoot));
    const dm003 = queue.family_runtime_queue.tasks.find((task: { payload: { study_id?: string } }) =>
      task.payload.study_id === 'DM003'
    );
    const dm002 = queue.family_runtime_queue.tasks.find((task: { payload: { study_id?: string } }) =>
      task.payload.study_id === 'DM002'
    );

    assert.equal(release.family_runtime_queue_release.released_hold_count, 1);
    assert.equal(release.family_runtime_queue_release.released_count, 0);
    assert.equal(intake.family_runtime_intake.enqueued_count, 2);
    assert.equal(dm002.status, 'queued');
    assert.equal(dm003.status, 'queued');
    assert.equal(dm003.requires_approval, false);
    assert.equal(dm003.last_error, null);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime queue release clears a scoped hold and dispatches only matching held tasks', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-queue-release-'));
  const dispatch = createDispatchFixture(`
python3 - "$TASK_PATH" <<'PY'
import json, sys
task = json.load(open(sys.argv[1]))
print(json.dumps({"accepted": True, "surface_kind": "test_dispatch", "study_id": task["payload"].get("study_id")}))
PY
`);
  try {
    const env = familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MAS_DISPATCH: dispatch.dispatchPath,
    });
    const heldTarget = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'domain_owner/default-executor-dispatch',
      '--payload',
      '{"study_id":"003-dpcc-primary-care-phenotype-treatment-gap","action_type":"return_to_ai_reviewer_workflow"}',
      '--dedupe-key',
      'mas:dm003:release-target',
    ], env);
    const otherStudy = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'domain_owner/default-executor-dispatch',
      '--payload',
      '{"study_id":"002-dm-china-us-mortality-attribution","action_type":"return_to_ai_reviewer_workflow"}',
      '--dedupe-key',
      'mas:dm002:release-not-held',
    ], env);
    runCli([
      'family-runtime',
      'queue',
      'hold',
      '--study',
      '003-dpcc-primary-care-phenotype-treatment-gap',
      '--reason',
      'manual_pause_for_mas_upgrade',
      '--source',
      'test-supervisor',
    ], env);
    const release = runCli([
      'family-runtime',
      'queue',
      'release',
      '--study',
      '003-dpcc-primary-care-phenotype-treatment-gap',
      '--reason',
      'manual_pause_for_mas_upgrade',
      '--source',
      'test-supervisor',
    ], env);
    const tick = runCli(['family-runtime', 'tick', '--source', 'test-release', '--limit', '10'], env);
    const heldInspection = runCli([
      'family-runtime',
      'queue',
      'inspect',
      heldTarget.family_runtime_enqueue.task.task_id,
    ], env);
    const otherInspection = runCli([
      'family-runtime',
      'queue',
      'inspect',
      otherStudy.family_runtime_enqueue.task.task_id,
    ], env);

    assert.equal(release.family_runtime_queue_release.released_hold_count, 1);
    assert.equal(release.family_runtime_queue_release.released_count, 1);
    assert.equal(release.family_runtime_queue_release.released_tasks[0].status, 'queued');
    assert.equal(tick.family_runtime_tick.selected_count, 2);
    assert.deepEqual(
      tick.family_runtime_tick.dispatches.map((entry: { output: { study_id?: string } }) => entry.output.study_id).sort(),
      [
        '002-dm-china-us-mortality-attribution',
        '003-dpcc-primary-care-phenotype-treatment-gap',
      ],
    );
    assert.equal(heldInspection.family_runtime_task.task.status, 'succeeded');
    assert.equal(heldInspection.family_runtime_task.task.last_error, null);
    assert.equal(otherInspection.family_runtime_task.task.status, 'succeeded');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(dispatch.fixtureRoot, { recursive: true, force: true });
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
      '{"workspace_root":"/tmp/mas","study_id":"DM003","action_type":"run_quality_repair_batch","dispatch_ref":"dispatch:dm003"}',
      '--source-fingerprint',
      'dm003-held-redrive-source',
      '--executor-kind',
      'codex_cli',
      '--task',
      taskId,
    ], env).family_runtime_stage_attempt.attempt;
    const queueDb = new DatabaseSync(path.join(stateRoot, 'family-runtime', 'queue.sqlite'));
    try {
      const now = new Date().toISOString();
      queueDb.prepare(`
        UPDATE tasks
        SET status = 'blocked',
          last_error = 'temporal_stage_attempt_start_failed',
          dead_letter_reason = 'temporal_stage_attempt_start_failed',
          updated_at = ?
        WHERE task_id = ?
      `).run(now, taskId);
      queueDb.prepare(`
        UPDATE stage_attempts
        SET status = 'blocked',
          blocked_reason = 'temporal_stage_attempt_start_failed',
          provider_run_json = json_set(provider_run_json, '$.provider_status', 'blocked'),
          updated_at = ?
        WHERE stage_attempt_id = ?
      `).run(now, attempt.stage_attempt_id);
    } finally {
      queueDb.close();
    }

    const blockedTask = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
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
    assert.equal(hold.family_runtime_queue_hold.active_hold.status, 'active');
    assert.equal(hold.family_runtime_queue_hold.held_count, 0);
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
