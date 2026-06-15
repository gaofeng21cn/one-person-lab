import { DatabaseSync } from 'node:sqlite';
import { assert, fs, os, path, runCli, test } from '../../helpers.ts';
import { createDispatchFixture, familyRuntimeEnv } from '../family-runtime-mas-domain-route-helpers.ts';

test('family-runtime blocks stale MAS owner-route failures instead of retrying them', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-mas-owner-route-stale-'));
  const dispatch = createDispatchFixture(`
cat <<'JSON'
{"reason":"owner_route_stale","detail":"current owner route already moved to a newer work unit"}
JSON
exit 1
`);
  try {
    const env = familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH: dispatch.dispatchPath,
    });
    const enqueue = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'paper_autonomy/repair-recheck',
      '--payload',
      '{"profile":"/tmp/profile.toml","study_id":"DM003","repair_work_unit":{"unit_id":"unit-stale","work_unit_type":"text_repair","owner":"quality_repair_batch","callable_surface":"run_quality_repair_batch","source_fingerprint":"sha256:stale-route","source_refs":["studies/DM003/paper/manuscript.md"]}}',
      '--dedupe-key',
      'reviewer_refinement_loop:unit-stale:sha256:stale-route',
    ], env);
    const taskId = enqueue.family_runtime_enqueue.task.task_id;
    const firstTick = runCli(['family-runtime', 'tick', '--source', 'test-owner-route-stale'], env);
    const afterFirstTick = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const secondTick = runCli(['family-runtime', 'tick', '--source', 'test-owner-route-stale'], env);
    const afterSecondTick = runCli(['family-runtime', 'queue', 'inspect', taskId], env);

    assert.equal(firstTick.family_runtime_tick.selected_count, 1);
    assert.equal(firstTick.family_runtime_tick.dispatches[0].status, 'blocked');
    assert.equal(firstTick.family_runtime_tick.dispatches[0].reason, 'progress_first_owner_delta_required');
    assert.equal(firstTick.family_runtime_tick.dispatches[0].domain_handler_blocked_reason, 'owner_route_stale');
    assert.equal(afterFirstTick.family_runtime_task.task.status, 'blocked');
    assert.equal(afterFirstTick.family_runtime_task.task.last_error, 'progress_first_owner_delta_required');
    assert.equal(afterFirstTick.family_runtime_task.task.dead_letter_reason, 'progress_first_owner_delta_required');
    assert.equal(afterFirstTick.family_runtime_task.stage_attempts[0].status, 'blocked');
    assert.equal(afterFirstTick.family_runtime_task.stage_attempts[0].blocked_reason, 'progress_first_owner_delta_required');
    assert.equal(secondTick.family_runtime_tick.selected_count, 0);
    assert.equal(afterSecondTick.family_runtime_task.task.attempts, 1);
    assert.equal(afterSecondTick.family_runtime_task.task.status, 'blocked');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(dispatch.fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime repairs stale running MAS paper autonomy tasks that lack stage attempt identity', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-mas-paper-stale-running-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-mas-paper-stale-running-export-'));
  const exportPath = path.join(fixtureRoot, 'export');
  const dispatchPath = path.join(fixtureRoot, 'dispatch');
  fs.writeFileSync(
    exportPath,
    `#!/usr/bin/env bash
set -euo pipefail
cat <<'JSON'
{
  "surface_kind": "mas_family_domain_handler_export",
  "pending_family_tasks": [
    {
      "domain_id": "medautoscience",
      "task_kind": "paper_autonomy/repair-recheck",
      "priority": 80,
      "source": "mas-domain-handler-export",
      "dedupe_key": "reviewer_refinement_loop:unit-1:sha256:stale",
      "dispatch_owner": "med-autoscience",
      "profile_name": "dm-cvd",
      "source_refs": ["studies/DM002/artifacts/publication_eval/latest.json"],
      "payload": {
        "profile": "/tmp/profile.toml",
        "study_id": "DM002",
        "repair_work_unit": {
          "unit_id": "unit-1",
          "work_unit_type": "text_repair",
          "owner": "quality_repair_batch",
          "callable_surface": "run_quality_repair_batch",
          "source_fingerprint": "sha256:stale",
          "source_refs": ["studies/DM002/paper/manuscript.md"]
        }
      }
    }
  ]
}
JSON
`,
    { mode: 0o755 },
  );
  fs.writeFileSync(
    dispatchPath,
    `#!/usr/bin/env bash
set -euo pipefail
cat <<'JSON'
{"accepted":true,"surface_kind":"mas_family_domain_handler_dispatch_receipt","paper_autonomy_receipt":true}
JSON
`,
    { mode: 0o755 },
  );
  try {
    const env = familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_EXPORT: `/bin/bash ${exportPath}`,
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH: `/bin/bash ${dispatchPath}`,
    });
    const enqueue = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'paper_autonomy/repair-recheck',
      '--payload',
      '{"profile":"/tmp/profile.toml","study_id":"DM002","repair_work_unit":{"unit_id":"unit-1","work_unit_type":"text_repair","owner":"quality_repair_batch","callable_surface":"run_quality_repair_batch","source_fingerprint":"sha256:stale","source_refs":["studies/DM002/paper/manuscript.md"]}}',
      '--dedupe-key',
      'reviewer_refinement_loop:unit-1:sha256:stale',
    ], env);
    const taskId = enqueue.family_runtime_enqueue.task.task_id;
    const queueDb = path.join(stateRoot, 'family-runtime', 'queue.sqlite');
    const db = new DatabaseSync(queueDb);
    db.prepare(`
      UPDATE tasks
      SET status = 'running',
        attempts = 1,
        lease_owner = 'stale-worker',
        lease_expires_at = '2026-05-27T00:00:00.000Z'
      WHERE task_id = ?
    `).run(taskId);
    db.close();

    const before = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const tick = runCli(['family-runtime', 'tick', '--source', 'test-repair'], env);
    const after = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const secondTick = runCli(['family-runtime', 'tick', '--source', 'test-repair'], env);
    const finalTask = runCli(['family-runtime', 'queue', 'inspect', taskId], env);

    assert.equal(before.family_runtime_task.task.current_control_state.reconciliation_status, 'blocked_missing_identity');
    assert.equal(tick.family_runtime_tick.repaired_missing_identity_running_count, 1);
    assert.equal(tick.family_runtime_tick.selected_count, 0);
    assert.equal(after.family_runtime_task.task.status, 'retry_waiting');
    assert.equal(after.family_runtime_task.task.lease, null);
    assert.equal(after.family_runtime_task.task.last_error, 'missing_stage_attempt_identity');
    assert.equal(after.family_runtime_task.task.dead_letter_reason, null);
    assert.equal(after.family_runtime_task.stage_attempts[0].stage_id, 'paper_autonomy/repair-recheck');
    assert.equal(after.family_runtime_task.stage_attempts[0].status, 'queued');
    assert.equal(after.family_runtime_task.task.current_control_state.reconciliation_status, 'queued');
    assert.equal(secondTick.family_runtime_tick.repaired_missing_identity_running_count, 0);
    assert.equal(secondTick.family_runtime_tick.selected_count, 1);
    assert.equal(secondTick.family_runtime_tick.dispatches[0].status, 'blocked');
    assert.equal(secondTick.family_runtime_tick.dispatches[0].reason, 'domain_handler_closeout_required');
    assert.equal(finalTask.family_runtime_task.task.status, 'blocked');
    assert.equal(finalTask.family_runtime_task.task.last_error, 'domain_handler_closeout_required');
    assert.equal(finalTask.family_runtime_task.stage_attempts[0].status, 'blocked');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime missing identity repair ignores non-provider-hosted running domain handler tasks', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-non-provider-running-'));
  const dispatch = createDispatchFixture(`
cat <<'JSON'
{"accepted":true,"surface_kind":"mas_family_domain_handler_dispatch_receipt"}
JSON
`);
  try {
    const env = familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH: dispatch.dispatchPath,
    });
    const enqueue = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'custom/non-provider-task',
      '--payload',
      '{"study_id":"DM002"}',
    ], env);
    const taskId = enqueue.family_runtime_enqueue.task.task_id;
    const queueDb = path.join(stateRoot, 'family-runtime', 'queue.sqlite');
    const db = new DatabaseSync(queueDb);
    db.prepare(`
      UPDATE tasks
      SET status = 'running',
        attempts = 1,
        lease_owner = 'stale-worker',
        lease_expires_at = '2026-05-27T00:00:00.000Z'
      WHERE task_id = ?
    `).run(taskId);
    db.close();

    const before = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const tick = runCli(['family-runtime', 'tick', '--source', 'test-repair-scope'], env);
    const after = runCli(['family-runtime', 'queue', 'inspect', taskId], env);

    assert.equal(before.family_runtime_task.task.current_control_state.reconciliation_status, 'blocked_missing_identity');
    assert.equal(tick.family_runtime_tick.repaired_missing_identity_running_count, 0);
    assert.equal(tick.family_runtime_tick.selected_count, 0);
    assert.equal(after.family_runtime_task.task.status, 'running');
    assert.equal(after.family_runtime_task.stage_attempts.length, 0);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(dispatch.fixtureRoot, { recursive: true, force: true });
  }
});
