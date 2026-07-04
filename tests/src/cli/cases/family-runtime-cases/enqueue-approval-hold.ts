import {
  assert,
  fs,
  os,
  path,
  runCli,
  test,
} from '../../helpers.ts';
import { createDispatchFixture, familyRuntimeEnv } from './helpers.ts';

test('family-runtime dispatch override can place the task path in a domain CLI option', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-dispatch-placeholder-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-dispatch-option-'));
  const dispatchPath = path.join(fixtureRoot, 'dispatch');
  fs.writeFileSync(
    dispatchPath,
    `#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" != "--task" || ! -f "$2" || "$3" != "--format" || "$4" != "json" || "$#" -ne 4 ]]; then
  printf '{"ok":false,"error":"bad argv","argv":%s}\\n' "$(python3 -c 'import json,sys; print(json.dumps(sys.argv[1:]))' "$@")"
  exit 2
fi
python3 - "$2" <<'PY'
import json
import sys
from pathlib import Path

task = json.loads(Path(sys.argv[1]).read_text())
print(json.dumps({
    "ok": True,
    "closeout_packet": {
        "surface_kind": "domain_stage_closeout_packet",
        "closeout_refs": ["mag-dispatch:task-option"],
        "next_owner": "med-autogrant",
        "domain_ready_verdict": "domain_gate_pending",
        "route_impact": {"decision": "task_option_override"}
    },
    "task_id": task["task_id"]
}))
PY
`,
    { mode: 0o755 },
  );

  try {
    const env = familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOGRANT_DISPATCH: `${dispatchPath} --task {task} --format json`,
    });
    const enqueue = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautogrant',
      '--task-kind',
      'stage-attempt/closeout',
      '--payload',
      '{"action":"stage-attempt/closeout","input_path":"/tmp/mag/input.json","stage_id":"review_and_rebuttal","provider_hosted_stage_attempt":true}',
      '--dedupe-key',
      'mag:test:dispatch-placeholder',
    ], env);
    const taskId = enqueue.family_runtime_enqueue.task.task_id;
    const tick = runCli(['family-runtime', 'tick', '--source', 'test'], env);
    const task = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const attempt = task.family_runtime_task.stage_attempts[0];

    assert.equal(tick.family_runtime_tick.dispatches[0].status, 'succeeded');
    assert.equal(attempt.status, 'completed');
    assert.equal(attempt.closeout_refs.includes('mag-dispatch:task-option'), true);
    assert.equal(attempt.route_impact.decision, 'task_option_override');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime enqueue is idempotent by dedupe key and writes local inbox notification', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-dedupe-'));
  try {
    const first = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautogrant',
      '--task-kind',
      'user-loop/wakeup',
      '--payload',
      '{"workspace":"/tmp/mag"}',
      '--dedupe-key',
      'mag:wakeup:1',
    ], familyRuntimeEnv(stateRoot));
    const second = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautogrant',
      '--task-kind',
      'user-loop/wakeup',
      '--payload',
      '{"workspace":"/tmp/mag"}',
      '--dedupe-key',
      'mag:wakeup:1',
    ], familyRuntimeEnv(stateRoot));
    const queue = runCli(['family-runtime', 'queue', 'list'], familyRuntimeEnv(stateRoot));
    const notifications = runCli(['family-runtime', 'notify', 'list'], familyRuntimeEnv(stateRoot));

    assert.equal(first.family_runtime_enqueue.accepted, true);
    assert.equal(second.family_runtime_enqueue.accepted, false);
    assert.equal(second.family_runtime_enqueue.idempotent_noop, true);
    assert.equal(second.family_runtime_enqueue.task.task_id, first.family_runtime_enqueue.task.task_id);
    assert.equal(queue.family_runtime_queue.queue.total, 1);
    assert.equal(notifications.family_runtime_notifications.notifications.length, 1);
    assert.equal(notifications.family_runtime_notifications.notifications[0].channel, 'local_inbox');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime approval pauses dispatch until approved', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-approval-'));
  const dispatch = createDispatchFixture(`
cat <<'JSON'
{"accepted":true,"surface_kind":"test_dispatch"}
JSON
`);
  try {
    const enqueue = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'redcube',
      '--task-kind',
      'runtime_watch',
      '--payload',
      '{"workspace_root":"/tmp/rca"}',
      '--requires-approval',
    ], familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_REDCUBE_DISPATCH: dispatch.dispatchPath,
    }));
    const taskId = enqueue.family_runtime_enqueue.task.task_id;
    const firstTick = runCli(['family-runtime', 'tick', '--source', 'test'], familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_REDCUBE_DISPATCH: dispatch.dispatchPath,
    }));
    const approval = runCli([
      'family-runtime',
      'approve',
      '--task',
      taskId,
      '--decision',
      'approve',
    ], familyRuntimeEnv(stateRoot));
    const secondTick = runCli(['family-runtime', 'tick', '--source', 'test'], familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_REDCUBE_DISPATCH: dispatch.dispatchPath,
    }));

    assert.equal(enqueue.family_runtime_enqueue.task.status, 'waiting_approval');
    assert.equal(firstTick.family_runtime_tick.selected_count, 0);
    assert.equal(approval.family_runtime_approval.task.status, 'queued');
    assert.equal(secondTick.family_runtime_tick.dispatches[0].status, 'succeeded');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(dispatch.fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime queue hold moves scoped queued tasks behind approval', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-queue-hold-'));
  const dispatch = createDispatchFixture(`
cat <<'JSON'
{"accepted":true,"surface_kind":"test_dispatch"}
JSON
`);
  try {
    const env = familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MAS_DISPATCH: dispatch.dispatchPath,
      OPL_FAMILY_RUNTIME_PROVIDER: 'local_sqlite',
    });
    const heldTarget = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'domain_owner/default-executor-dispatch',
      '--payload',
      '{"study_id":"003-dpcc-primary-care-phenotype-treatment-gap","action_type":"return_to_ai_reviewer_workflow","source_fingerprint":"sha256:dm003-hold-target"}',
      '--dedupe-key',
      'mas:dm003:hold-target',
    ], env);
    const otherStudy = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'domain_owner/default-executor-dispatch',
      '--payload',
      '{"study_id":"002-dm-china-us-mortality-attribution","action_type":"return_to_ai_reviewer_workflow","source_fingerprint":"sha256:dm002-not-held"}',
      '--dedupe-key',
      'mas:dm002:not-held',
    ], env);
    const hold = runCli([
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
    const tick = runCli(['family-runtime', 'tick', '--source', 'test', '--limit', '10'], env);
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

    assert.equal(hold.family_runtime_queue_hold.held_count, 1);
    assert.equal(hold.family_runtime_queue_hold.held_tasks[0].status, 'waiting_approval');
    assert.equal(hold.family_runtime_queue_hold.held_tasks[0].requires_approval, true);
    assert.equal(tick.family_runtime_tick.selected_count, 1);
    assert.equal(heldInspection.family_runtime_task.task.status, 'waiting_approval');
    assert.equal(heldInspection.family_runtime_task.task.last_error, 'manual_pause_for_mas_upgrade');
    assert.equal(otherInspection.family_runtime_task.task.status, 'succeeded');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(dispatch.fixtureRoot, { recursive: true, force: true });
  }
});
