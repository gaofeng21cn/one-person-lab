import {
  assert,
  createDispatchFixture,
  familyRuntimeEnv,
  fs,
  os,
  path,
  runCli,
  runCliFailure,
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
    "surface_kind": "mas_family_sidecar_dispatch_receipt",
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
  "surface_kind": "mas_family_sidecar_dispatch_receipt",
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

test('family-runtime redrives MAS default executor dispatch with changed source fingerprint', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-default-executor-redrive-'));
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
    const dispatchRef = 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/run_quality_repair_batch.json';
    const dedupeKey = 'mas:dm-cvd:002:default-executor:run_quality_repair_batch:redrive';
    const basePayload = {
      profile: '/tmp/dm-cvd.profile.toml',
      study_id: '002-dm-china-us-mortality-attribution',
      quest_id: '002-dm-china-us-mortality-attribution',
      action_type: 'run_quality_repair_batch',
      dispatch_authority: 'quality_repair_batch_writer_handoff',
      next_executable_owner: 'write',
      executor_kind: 'codex_cli_default',
      dispatch_ref: dispatchRef,
      authority_boundary: 'mas_default_executor_dispatch_request_only',
      workspace_root: '/tmp/explicit-workspace-root',
      source_fingerprint: 'source-before',
    };
    const enqueue = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'domain_owner/default-executor-dispatch',
      '--payload',
      JSON.stringify(basePayload),
      '--dedupe-key',
      dedupeKey,
    ], env);
    const taskId = enqueue.family_runtime_enqueue.task.task_id;
    runCli(['family-runtime', 'tick', '--source', 'test'], env);
    const blockedTask = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const firstAttempt = blockedTask.family_runtime_task.stage_attempts[0];

    assert.equal(blockedTask.family_runtime_task.task.status, 'blocked');
    assert.equal(blockedTask.family_runtime_task.task.dead_letter_reason, 'temporal_stage_attempt_start_failed');
    assert.equal(firstAttempt.status, 'blocked');

    const redrive = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'domain_owner/default-executor-dispatch',
      '--payload',
      JSON.stringify({
        ...basePayload,
        source_fingerprint: 'source-after',
      }),
      '--dedupe-key',
      dedupeKey,
    ], env);
    const redrivenTask = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    runCli(['family-runtime', 'tick', '--source', 'test-redrive'], env);
    const afterTickTask = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const attempts = afterTickTask.family_runtime_task.stage_attempts;
    const sourceFingerprints = attempts.map((attempt: { source_fingerprint: string }) => attempt.source_fingerprint);
    const snapshot = runCli(['runtime', 'snapshot'], env).runtime_tray_snapshot;
    const workbenchAttempt = snapshot.stage_attempt_workbench.evidence_attempts.find(
      (attempt: { task_id?: string }) => attempt.task_id === taskId,
    );

    assert.equal(redrive.family_runtime_enqueue.requeued_from_terminal, true);
    assert.equal(redrivenTask.family_runtime_task.task.status, 'queued');
    assert.equal(afterTickTask.family_runtime_task.task.status, 'blocked');
    assert.equal(afterTickTask.family_runtime_task.task.dead_letter_reason, 'temporal_stage_attempt_start_failed');
    assert.equal(attempts.length, 2);
    assert.notEqual(sourceFingerprints[0], sourceFingerprints[1]);
    assert.equal(sourceFingerprints.every((fingerprint: string) => fingerprint.startsWith('mas_default_executor_source_')), true);
    assert.equal(workbenchAttempt.workspace_locator.domain_source_fingerprint, 'source-after');
    assert.equal(
      afterTickTask.family_runtime_task.events.some((event: { event_type: string; payload: Record<string, unknown> }) => (
        event.event_type === 'task_requeued_from_blocked_after_domain_owner_update'
        && event.payload.reason === 'mas_default_executor_source_fingerprint_changed_after_blocked'
      )),
      true,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(dispatch.fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime operator redrive reruns blocked MAS default executor provider transport without source changes', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-default-executor-operator-redrive-'));
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
    const dispatchRef = 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/run_quality_repair_batch.json';
    const payload = {
      profile: '/tmp/dm-cvd.profile.toml',
      study_id: '002-dm-china-us-mortality-attribution',
      quest_id: '002-dm-china-us-mortality-attribution',
      action_type: 'run_quality_repair_batch',
      dispatch_authority: 'quality_repair_batch_writer_handoff',
      next_executable_owner: 'write',
      executor_kind: 'codex_cli_default',
      dispatch_ref: dispatchRef,
      authority_boundary: 'mas_default_executor_dispatch_request_only',
      workspace_root: '/tmp/explicit-workspace-root',
      source_fingerprint: 'source-stable',
    };
    const enqueue = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'domain_owner/default-executor-dispatch',
      '--payload',
      JSON.stringify(payload),
      '--dedupe-key',
      'mas:dm-cvd:002:default-executor:run_quality_repair_batch:operator-redrive',
    ], env);
    const taskId = enqueue.family_runtime_enqueue.task.task_id;
    runCli(['family-runtime', 'tick', '--source', 'test'], env);
    const blockedTask = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const firstAttempt = blockedTask.family_runtime_task.stage_attempts[0];

    assert.equal(blockedTask.family_runtime_task.task.status, 'blocked');
    assert.equal(blockedTask.family_runtime_task.task.dead_letter_reason, 'temporal_stage_attempt_start_failed');
    assert.equal(firstAttempt.status, 'blocked');

    const redrive = runCli([
      'family-runtime',
      'queue',
      'redrive',
      taskId,
      '--reason',
      'provider_runtime_fixed_after_closeout_ingestion_patch',
      '--source',
      'test-redrive',
    ], env);
    const redrivenTask = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    runCli(['family-runtime', 'tick', '--source', 'test-after-redrive'], env);
    const afterTickTask = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const attempts = afterTickTask.family_runtime_task.stage_attempts;
    const sourceFingerprints = attempts.map((attempt: { source_fingerprint: string }) => attempt.source_fingerprint);

    assert.equal(redrive.family_runtime_redrive.redriven, true);
    assert.equal(redrive.family_runtime_redrive.task.status, 'queued');
    assert.equal(redrive.family_runtime_redrive.redriven_stage_attempt.status, 'queued');
    assert.equal(redrivenTask.family_runtime_task.task.status, 'queued');
    assert.equal(afterTickTask.family_runtime_task.task.status, 'blocked');
    assert.equal(afterTickTask.family_runtime_task.task.dead_letter_reason, 'temporal_stage_attempt_start_failed');
    assert.equal(attempts.length, 2);
    assert.deepEqual([...new Set(sourceFingerprints)].length, 1);
    assert.equal(sourceFingerprints[0].startsWith('mas_default_executor_source_'), true);
    assert.equal(
      afterTickTask.family_runtime_task.events.some((event: { event_type: string; payload: Record<string, unknown> }) => (
        event.event_type === 'task_operator_redrive_from_blocked_provider_transport'
        && event.payload.source_fingerprint_changed === false
        && (event.payload.authority_boundary as Record<string, unknown>).domain_truth_mutation === false
      )),
      true,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(dispatch.fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime operator redrive rejects non-default-executor blocked tasks', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-redrive-reject-'));
  try {
    const env = familyRuntimeEnv(stateRoot);
    const enqueue = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'artifact/override',
      '--payload',
      '{"domain_truth_write":true}',
    ], env);
    const taskId = enqueue.family_runtime_enqueue.task.task_id;
    runCli(['family-runtime', 'tick', '--source', 'test'], env);
    const failure = runCliFailure([
      'family-runtime',
      'queue',
      'redrive',
      taskId,
      '--reason',
      'operator_must_not_redrive_domain_truth_write',
    ], env);
    const task = runCli(['family-runtime', 'queue', 'inspect', taskId], env);

    assert.equal(failure.payload.error.code, 'cli_usage_error');
    assert.equal(failure.payload.error.details.blocker_id, 'family_runtime_redrive_blocked');
    assert.equal(task.family_runtime_task.task.status, 'blocked');
    assert.equal(task.family_runtime_task.task.dead_letter_reason, 'domain_forbidden_write');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
