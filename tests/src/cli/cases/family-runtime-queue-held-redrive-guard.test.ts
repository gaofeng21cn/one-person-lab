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
