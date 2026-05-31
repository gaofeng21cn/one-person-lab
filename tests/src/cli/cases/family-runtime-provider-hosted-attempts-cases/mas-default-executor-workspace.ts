import {
  assert,
  createDispatchFixture,
  familyRuntimeEnv,
  fs,
  os,
  path,
  runCli,
  test,
} from './helpers.ts';

test('family-runtime blocks MAS default executor dispatch when Temporal cannot start Codex writer attempt', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-default-executor-'));
  const dispatch = createDispatchFixture(`
python3 - "$TASK_PATH" <<'PY'
import json
import sys
from pathlib import Path

task = json.loads(Path(sys.argv[1]).read_text())
assert task["task_kind"] == "domain_owner/default-executor-dispatch"
payload = task["payload"]
assert payload["study_id"] == "002-dm-china-us-mortality-attribution"
assert payload["dispatch_ref"].endswith("default_executor_dispatches/run_quality_repair_batch.json")
print(json.dumps({
    "accepted": True,
    "surface_kind": "mas_family_domain_handler_dispatch_receipt",
    "task_id": task["task_id"],
    "task_kind": task["task_kind"],
    "will_start_llm_worker": True,
    "dispatch": {
        "execution_policy": "opl_default_executor_stage_attempt_admission",
        "result": {
            "surface": "default_executor_dispatch_request_admission",
            "status": "admitted",
            "next_owner": "write",
            "dispatch_ref": payload["dispatch_ref"]
        }
    }
}))
PY
`);
  try {
    const env = familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH: dispatch.dispatchPath,
      OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
    });
    const enqueue = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'domain_owner/default-executor-dispatch',
      '--payload',
      JSON.stringify({
        profile: '/tmp/dm-cvd.profile.toml',
        study_id: '002-dm-china-us-mortality-attribution',
        quest_id: '002-dm-china-us-mortality-attribution',
        action_type: 'run_quality_repair_batch',
        dispatch_authority: 'quality_repair_batch_writer_handoff',
        next_executable_owner: 'write',
        executor_kind: 'codex_cli_default',
        dispatch_ref: 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/run_quality_repair_batch.json',
        authority_boundary: 'mas_default_executor_dispatch_request_only',
        source_refs: [
          {
            role: 'default_executor_dispatch_request',
            ref: 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/run_quality_repair_batch.json',
            exists: true,
            body_included: false,
          },
        ],
        workspace_root: '/tmp/explicit-workspace-root',
      }),
      '--dedupe-key',
      'mas:dm-cvd:002:default-executor:run_quality_repair_batch:writer',
    ], env);
    const taskId = enqueue.family_runtime_enqueue.task.task_id;
    const tick = runCli(['family-runtime', 'tick', '--source', 'test'], env);
    const task = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const attempt = task.family_runtime_task.stage_attempts[0];

    assert.equal(tick.family_runtime_tick.dispatches[0].status, 'blocked');
    assert.equal(tick.family_runtime_tick.dispatches[0].reason, 'temporal_stage_attempt_start_failed');
    assert.equal(task.family_runtime_task.task.status, 'blocked');
    assert.equal(task.family_runtime_task.task.dead_letter_reason, 'temporal_stage_attempt_start_failed');
    assert.equal(task.family_runtime_task.stage_attempts.length, 1);
    assert.equal(attempt.provider_kind, 'temporal');
    assert.equal(attempt.domain_id, 'medautoscience');
    assert.equal(attempt.stage_id, 'domain_owner/default-executor-dispatch');
    assert.equal(attempt.executor_kind, 'codex_cli');
    assert.equal(attempt.task_id, taskId);
    assert.equal(attempt.status, 'blocked');
    assert.match(attempt.blocked_reason, /OPL_TEMPORAL_ADDRESS/);
    assert.equal(attempt.workspace_locator.workspace_root, '/tmp/explicit-workspace-root');
    assert.equal(attempt.workspace_locator.dispatch_ref, 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/run_quality_repair_batch.json');
    assert.equal(attempt.workspace_locator.next_executable_owner, 'write');
    assert.equal(attempt.workspace_locator.opl_writes_domain_truth, false);
    assert.equal(attempt.workspace_locator.opl_writes_publication_quality, false);
    assert.equal(attempt.workspace_locator.opl_writes_current_package, false);
    assert.deepEqual(attempt.checkpoint_refs, [
      'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/run_quality_repair_batch.json',
    ]);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(dispatch.fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime derives MAS default executor workspace root from profile when payload omits workspace_root', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-default-executor-root-'));
  const dispatch = createDispatchFixture(`
python3 - "$TASK_PATH" <<'PY'
import json
print(json.dumps({
  "accepted": True,
  "surface_kind": "mas_family_domain_handler_dispatch_receipt",
  "dispatch": {
    "action_type": "default_executor_dispatch_request",
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
    const dispatchRef = 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/run_quality_repair_batch.json';
    const enqueue = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'domain_owner/default-executor-dispatch',
      '--payload',
      JSON.stringify({
        profile: '/tmp/dm-cvd/ops/medautoscience/profiles/dm-cvd.local.toml',
        study_id: '002-dm-china-us-mortality-attribution',
        quest_id: '002-dm-china-us-mortality-attribution',
        action_type: 'run_quality_repair_batch',
        dispatch_authority: 'quality_repair_batch_writer_handoff',
        next_executable_owner: 'write',
        executor_kind: 'codex_cli_default',
        dispatch_ref: dispatchRef,
        authority_boundary: 'mas_default_executor_dispatch_request_only',
      }),
      '--dedupe-key',
      'mas:dm-cvd:002:default-executor:run_quality_repair_batch:profile-root',
    ], env);
    const taskId = enqueue.family_runtime_enqueue.task.task_id;
    runCli(['family-runtime', 'tick', '--source', 'test'], env);
    const task = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const attempt = task.family_runtime_task.stage_attempts[0];

    assert.equal(attempt.workspace_locator.workspace_root, '/tmp/dm-cvd');
    assert.equal(attempt.workspace_locator.domain_truth_owner, 'med-autoscience');
    assert.equal(attempt.workspace_locator.opl_writes_domain_truth, false);
    assert.equal(attempt.executor_kind, 'codex_cli');
    assert.deepEqual(attempt.checkpoint_refs, [dispatchRef]);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(dispatch.fixtureRoot, { recursive: true, force: true });
  }
});
