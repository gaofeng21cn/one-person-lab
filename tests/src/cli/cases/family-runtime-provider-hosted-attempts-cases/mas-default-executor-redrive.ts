import { DatabaseSync } from 'node:sqlite';

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

test('family-runtime redrives MAS default executor dispatch with changed source fingerprint', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-default-executor-redrive-'));
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
    const dedupeKey = 'mas:dm-cvd:002:default-executor:run_quality_repair_batch:redrive';
    const basePayload = defaultExecutorPayload('source-before');
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

test('family-runtime requeues succeeded MAS default executor dispatch when MAS exports non-consumable closeout redrive', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-default-executor-closeout-redrive-'));
  try {
    const env = familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
    });
    const dedupeKey = 'mas:dm-cvd:002:default-executor:run_quality_repair_batch:redrive-context';
    const first = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'domain_owner/default-executor-dispatch',
      '--payload',
      JSON.stringify(defaultExecutorPayload('source-current')),
      '--dedupe-key',
      dedupeKey,
      '--source',
      'test-domain-export',
    ], env);
    const taskId = first.family_runtime_enqueue.task.task_id;
    const queueDb = new DatabaseSync(path.join(stateRoot, 'family-runtime', 'queue.sqlite'));
    try {
      queueDb.prepare(`
        UPDATE tasks
        SET status = 'succeeded', last_error = NULL, dead_letter_reason = NULL,
          lease_owner = NULL, lease_expires_at = NULL
        WHERE task_id = ?
      `).run(taskId);
    } finally {
      queueDb.close();
    }

    const redrive = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'domain_owner/default-executor-dispatch',
      '--payload',
      JSON.stringify({
        ...defaultExecutorPayload('source-current'),
        redrive_context: {
          status: 'non_consumable_closeout',
          receipt_kind: 'default_executor_execution',
          receipt_ref: 'artifacts/supervision/consumer/default_executor_execution/sat_dm002.closeout.json',
          execution_id: 'sat_dm002',
          action_type: 'run_quality_repair_batch',
          reason: 'manuscript_story_surface_delta_missing',
          next_action: 'redrive_owner_route_with_closeout_context',
        },
      }),
      '--dedupe-key',
      dedupeKey,
      '--source',
      'test-domain-export',
    ], env);
    const task = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const event = task.family_runtime_task.events.find((item: { event_type: string }) =>
      item.event_type === 'task_requeued_from_mas_default_executor_redrive_context'
    );

    assert.equal(redrive.family_runtime_enqueue.accepted, true);
    assert.equal(redrive.family_runtime_enqueue.requeued_from_terminal, true);
    assert.equal(redrive.family_runtime_enqueue.idempotent_noop, false);
    assert.equal(redrive.family_runtime_enqueue.task.status, 'queued');
    assert.equal(task.family_runtime_task.task.status, 'queued');
    assert.equal(task.family_runtime_task.task.payload.redrive_context.status, 'non_consumable_closeout');
    assert.ok(event);
    assert.equal(event.payload.reason, 'mas_default_executor_non_consumable_closeout_redrive');
    assert.equal(event.payload.authority_boundary.domain_truth_mutation, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime operator redrive reruns blocked MAS default executor provider transport without source changes', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-default-executor-operator-redrive-'));
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
    const payload = defaultExecutorPayload('source-stable');
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
