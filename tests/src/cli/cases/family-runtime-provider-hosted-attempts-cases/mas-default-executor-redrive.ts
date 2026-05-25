import { DatabaseSync } from 'node:sqlite';

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

function defaultExecutorPayload(sourceFingerprint: string) {
  return {
    profile: '/tmp/dm-cvd.profile.toml',
    study_id: '002-dm-china-us-mortality-attribution',
    quest_id: '002-dm-china-us-mortality-attribution',
    action_type: 'run_quality_repair_batch',
    dispatch_authority: 'quality_repair_batch_writer_handoff',
    next_executable_owner: 'write',
    executor_kind: 'codex_cli_default',
    dispatch_ref: 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/run_quality_repair_batch.json',
    authority_boundary: 'mas_default_executor_dispatch_request_only',
    workspace_root: '/tmp/explicit-workspace-root',
    source_fingerprint: sourceFingerprint,
  };
}

test('family-runtime operator redrive reruns failed MAS default executor provider transport without source changes', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-default-executor-failed-operator-redrive-'));
  const dispatch = createDispatchFixture(`
python3 - "$TASK_PATH" <<'PY'
import json
print(json.dumps({
  "accepted": True,
  "surface_kind": "mas_family_sidecar_dispatch_receipt",
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
    const enqueue = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'domain_owner/default-executor-dispatch',
      '--payload',
      JSON.stringify(defaultExecutorPayload('source-stable-failed-redrive')),
      '--dedupe-key',
      'mas:dm-cvd:002:default-executor:run_quality_repair_batch:operator-failed-redrive',
    ], env);
    const taskId = enqueue.family_runtime_enqueue.task.task_id;
    runCli(['family-runtime', 'tick', '--source', 'test'], env);
    const queueDb = new DatabaseSync(path.join(stateRoot, 'family-runtime', 'queue.sqlite'));
    try {
      queueDb.prepare(`
        UPDATE tasks
        SET dead_letter_reason = 'temporal_stage_attempt_failed',
          last_error = 'temporal_workflow_failed'
        WHERE task_id = ?
      `).run(taskId);
    } finally {
      queueDb.close();
    }

    const failedTask = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const redrive = runCli([
      'family-runtime',
      'queue',
      'redrive',
      taskId,
      '--reason',
      'provider_temporal_heartbeat_timeout_retry_budget_available',
      '--source',
      'test-failed-redrive',
    ], env);
    const redrivenTask = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const attempts = redrivenTask.family_runtime_task.stage_attempts;

    assert.equal(failedTask.family_runtime_task.task.status, 'blocked');
    assert.equal(failedTask.family_runtime_task.task.dead_letter_reason, 'temporal_stage_attempt_failed');
    assert.equal(redrive.family_runtime_redrive.redriven, true);
    assert.equal(redrive.family_runtime_redrive.task.status, 'queued');
    assert.equal(redrive.family_runtime_redrive.redriven_stage_attempt.status, 'queued');
    assert.equal(redrivenTask.family_runtime_task.task.status, 'queued');
    assert.equal(redrivenTask.family_runtime_task.task.dead_letter_reason, null);
    assert.equal(attempts.length, 2);
    assert.equal(
      redrivenTask.family_runtime_task.events.some((event: { event_type: string; payload: Record<string, unknown> }) => (
        event.event_type === 'task_operator_redrive_from_blocked_provider_transport'
        && event.payload.previous_dead_letter_reason === 'temporal_stage_attempt_failed'
        && event.payload.operator_reason === 'provider_temporal_heartbeat_timeout_retry_budget_available'
        && (event.payload.authority_boundary as Record<string, unknown>).domain_truth_mutation === false
      )),
      true,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(dispatch.fixtureRoot, { recursive: true, force: true });
  }
});
