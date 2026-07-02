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
import { redriveBlockedDefaultExecutorProviderTransportTask } from '../../../../../src/modules/runway/family-runtime-redrive.ts';
import type { FamilyRuntimeTaskRow } from '../../../../../src/modules/runway/family-runtime-store.ts';

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

function strictProviderRedrivePayload(sourceFingerprint: string) {
  return {
    ...defaultExecutorPayload(sourceFingerprint),
    stage_packet_ref: `studies/002-dm-china-us-mortality-attribution/artifacts/stage_packets/run_quality_repair_batch/${sourceFingerprint}.json`,
    route_identity_key: `mas:dm002:run_quality_repair_batch:${sourceFingerprint}`,
    attempt_idempotency_key: `mas:dm002:run_quality_repair_batch:${sourceFingerprint}:attempt`,
    work_unit_id: 'run_quality_repair_batch',
    work_unit_fingerprint: sourceFingerprint,
    source_eval_id: `source-eval:${sourceFingerprint}`,
    truth_epoch: `truth:${sourceFingerprint}`,
    runtime_health_epoch: 'runtime-health:test',
  };
}

function assertRedriveBlockedByProviderOnlyProtocol(
  failure: ReturnType<typeof runCliFailure>,
  expectedReason: string,
) {
  assert.equal(failure.payload.error.code, 'cli_usage_error');
  assert.equal(failure.payload.error.details.blocker_id, 'family_runtime_redrive_blocked');
  assert.equal(failure.payload.error.details.reason, expectedReason);
  assert.equal(failure.payload.error.details.action, 'blocked_semantic_noop');
  assert.equal(failure.payload.error.details.authority_boundary.domain_truth_mutation, false);
  assert.equal(failure.payload.error.details.authority_boundary.owner_receipt_created, false);
  assert.equal(failure.payload.error.details.authority_boundary.typed_blocker_created, false);
  assert.equal(failure.payload.error.details.authority_boundary.provider_redrive_started, false);
}

function isProviderOnlyRedriveEvent(event: { payload: Record<string, unknown> }, redriveKind: string) {
  const protocol = event.payload.redrive_protocol as Record<string, unknown>;
  const boundary = event.payload.authority_boundary as Record<string, unknown>;
  return protocol.protocol === 'provider_transport_only'
    && protocol.redrive_kind === redriveKind
    && protocol.domain_truth_mutation === false
    && protocol.owner_receipt_created === false
    && protocol.typed_blocker_created === false
    && protocol.domain_progress_claim === false
    && boundary.domain_truth_mutation === false
    && boundary.owner_receipt_created === false
    && boundary.typed_blocker_created === false
    && boundary.domain_progress_claim === false;
}

function forceTaskIntoProviderTransportBlockedState(
  stateRoot: string,
  taskId: string,
  reason: string,
  options: {
    taskStatus?: 'blocked' | 'dead_letter';
    taskAttempts?: number;
    stageAttemptStatus?: 'blocked' | 'dead_lettered';
    sourceFingerprint?: string;
  } = {},
) {
  const queueDb = new DatabaseSync(path.join(stateRoot, 'family-runtime', 'queue.sqlite'));
  const taskStatus = options.taskStatus ?? 'blocked';
  const taskAttempts = options.taskAttempts ?? 1;
  const stageAttemptStatus = options.stageAttemptStatus ?? 'blocked';
  const sourceFingerprint = options.sourceFingerprint ?? 'test-provider-transport-source';
  try {
    queueDb.prepare(`
      UPDATE tasks
      SET status = ?, attempts = ?, dead_letter_reason = ?, last_error = ?,
        lease_owner = NULL, lease_expires_at = NULL
      WHERE task_id = ?
    `).run(taskStatus, taskAttempts, reason, reason, taskId);
    queueDb.prepare(`
      INSERT INTO stage_attempts(
        stage_attempt_id, idempotency_key, provider_kind, workflow_id, domain_id, stage_id,
        workspace_locator_json, source_fingerprint, executor_kind, status, checkpoint_refs_json,
        closeout_refs_json, human_gate_refs_json, retry_budget_json, attempt_count, task_id,
        blocked_reason, provider_receipt_json, provider_run_json, activity_events_json,
        route_impact_json, closeout_receipt_status, created_at, updated_at
      )
      SELECT
        'sat_' || lower(hex(randomblob(12))), 'idem_' || lower(hex(randomblob(12))),
        'temporal', 'wf_' || lower(hex(randomblob(12))), domain_id, task_kind,
        payload_json, ?, 'codex_cli', ?, '[]',
        '[]', '[]', '{"max_attempts":3}', 1, task_id,
        ?, '{}', '{"provider_status":"registered"}', '[]',
        '{}', NULL, datetime('now'), datetime('now')
      FROM tasks
      WHERE task_id = ?
        AND NOT EXISTS (SELECT 1 FROM stage_attempts WHERE task_id = ?)
    `).run(sourceFingerprint, stageAttemptStatus, reason, taskId, taskId);
  } finally {
    queueDb.close();
  }
}

test('family-runtime operator redrive rejects same-identity transport failure with live linked provider attempt', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-redrive-live-attempt-block-'));
  try {
    const env = familyRuntimeEnv(stateRoot, {
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
      JSON.stringify(strictProviderRedrivePayload('source-live-linked-redrive-block')),
      '--dedupe-key',
      'mas:dm-cvd:002:default-executor:run_quality_repair_batch:live-linked-redrive-block',
    ], env);
    const taskId = enqueue.family_runtime_enqueue.task.task_id;
    forceTaskIntoProviderTransportBlockedState(stateRoot, taskId, 'temporal_stage_attempt_start_failed');
    const queueDb = new DatabaseSync(path.join(stateRoot, 'family-runtime', 'queue.sqlite'));
    try {
      queueDb.prepare(`
        INSERT INTO stage_attempts(
          stage_attempt_id, idempotency_key, provider_kind, workflow_id, domain_id, stage_id,
          workspace_locator_json, source_fingerprint, executor_kind, status, checkpoint_refs_json,
          closeout_refs_json, human_gate_refs_json, retry_budget_json, attempt_count, task_id,
          blocked_reason, provider_receipt_json, provider_run_json, activity_events_json,
          route_impact_json, closeout_receipt_status, created_at, updated_at
        )
        SELECT
          'sat_live_redrive_block', 'idem_live_redrive_block',
          'temporal', 'wf_live_redrive_block', domain_id, stage_id,
          workspace_locator_json, source_fingerprint, 'codex_cli', 'running', '[]',
          '[]', '[]', '{"max_attempts":3}', 1, task_id,
          NULL, '{}', '{"provider_status":"running"}', '[]',
          '{}', NULL, datetime('now'), datetime('now')
        FROM stage_attempts
        WHERE task_id = ?
        ORDER BY created_at ASC
        LIMIT 1
      `).run(taskId);
    } finally {
      queueDb.close();
    }

    const failure = runCliFailure([
      'family-runtime',
      'queue',
      'redrive',
      taskId,
      '--reason',
      'operator_must_not_duplicate_live_provider_attempt',
      '--source',
      'test-live-linked-redrive-block',
    ], env);
    const task = runCli(['family-runtime', 'queue', 'inspect', taskId], env);

    assertRedriveBlockedByProviderOnlyProtocol(failure, 'live_linked_provider_attempt_exists');
    assert.equal(task.family_runtime_task.task.status, 'blocked');
    assert.equal(task.family_runtime_task.task.dead_letter_reason, 'temporal_stage_attempt_start_failed');
    assert.equal(task.family_runtime_task.stage_attempts.length, 2);
    assert.equal(
      task.family_runtime_task.stage_attempts.filter((attempt: { status: string }) => attempt.status === 'queued').length,
      0,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime operator redrive rejects retry-budget dead letter when same identity has accepted typed closeout', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-redrive-closeout-block-'));
  try {
    const env = familyRuntimeEnv(stateRoot, {
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
      JSON.stringify(strictProviderRedrivePayload('source-closeout-redrive-block')),
      '--dedupe-key',
      'mas:dm-cvd:002:default-executor:run_quality_repair_batch:closeout-redrive-block',
    ], env);
    const taskId = enqueue.family_runtime_enqueue.task.task_id;
    forceTaskIntoProviderTransportBlockedState(stateRoot, taskId, 'retry_budget_exhausted', {
      taskStatus: 'dead_letter',
      taskAttempts: 3,
      stageAttemptStatus: 'dead_lettered',
    });
    const queueDb = new DatabaseSync(path.join(stateRoot, 'family-runtime', 'queue.sqlite'));
    try {
      queueDb.prepare(`
        INSERT INTO stage_attempts(
          stage_attempt_id, idempotency_key, provider_kind, workflow_id, domain_id, stage_id,
          workspace_locator_json, source_fingerprint, executor_kind, status, checkpoint_refs_json,
          closeout_refs_json, human_gate_refs_json, retry_budget_json, attempt_count, task_id,
          blocked_reason, provider_receipt_json, provider_run_json, activity_events_json,
          route_impact_json, closeout_receipt_status, created_at, updated_at
        )
        SELECT
          'sat_closeout_redrive_block', 'idem_closeout_redrive_block',
          'temporal', 'wf_closeout_redrive_block', domain_id, stage_id,
          workspace_locator_json, source_fingerprint, 'codex_cli', 'completed', '[]',
          '["mas:owner-receipt:same-identity"]', '[]', '{"max_attempts":3}', 1, task_id,
          NULL, '{}', '{"provider_status":"completed"}', '[]',
          '{"owner_receipt_refs":["mas:owner-receipt:same-identity"]}',
          'accepted_typed_closeout', datetime('now'), datetime('now')
        FROM stage_attempts
        WHERE task_id = ?
        ORDER BY created_at ASC
        LIMIT 1
      `).run(taskId);
    } finally {
      queueDb.close();
    }

    const failure = runCliFailure([
      'family-runtime',
      'queue',
      'redrive',
      taskId,
      '--reason',
      'operator_must_not_redrive_after_owner_closeout',
      '--source',
      'test-closeout-redrive-block',
    ], env);
    const task = runCli(['family-runtime', 'queue', 'inspect', taskId], env);

    assertRedriveBlockedByProviderOnlyProtocol(failure, 'accepted_typed_closeout_exists');
    assert.equal(task.family_runtime_task.task.status, 'dead_letter');
    assert.equal(task.family_runtime_task.task.dead_letter_reason, 'retry_budget_exhausted');
    assert.equal(task.family_runtime_task.stage_attempts.length, 2);
    assert.equal(
      task.family_runtime_task.stage_attempts.filter((attempt: { status: string }) => attempt.status === 'queued').length,
      0,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime operator redrive rejects same-lineage stop-loss domain blockers', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-redrive-stop-loss-block-'));
  try {
    const env = familyRuntimeEnv(stateRoot, {
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
      JSON.stringify(strictProviderRedrivePayload('source-stop-loss-redrive-block')),
      '--dedupe-key',
      'mas:dm-cvd:002:default-executor:run_quality_repair_batch:stop-loss-redrive-block',
    ], env);
    const taskId = enqueue.family_runtime_enqueue.task.task_id;
    forceTaskIntoProviderTransportBlockedState(stateRoot, taskId, 'anti_loop_budget_exhausted');

    const failure = runCliFailure([
      'family-runtime',
      'queue',
      'redrive',
      taskId,
      '--reason',
      'operator_must_not_redrive_same_lineage_stop_loss',
      '--source',
      'test-stop-loss-redrive-block',
    ], env);
    const task = runCli(['family-runtime', 'queue', 'inspect', taskId], env);

    assertRedriveBlockedByProviderOnlyProtocol(failure, 'same_lineage_stop_loss_domain_blocker');
    assert.equal(task.family_runtime_task.task.status, 'blocked');
    assert.equal(task.family_runtime_task.task.dead_letter_reason, 'anti_loop_budget_exhausted');
    assert.equal(
      task.family_runtime_task.stage_attempts.filter((attempt: { status: string }) => attempt.status === 'queued').length,
      0,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime operator redrive reruns failed MAS default executor provider transport without source changes', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-default-executor-failed-operator-redrive-'));
  try {
    const env = familyRuntimeEnv(stateRoot, {
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
    forceTaskIntoProviderTransportBlockedState(stateRoot, taskId, 'temporal_stage_attempt_failed');

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
        && isProviderOnlyRedriveEvent(event, 'provider_transport_blocked')
      )),
      true,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime operator redrive can recover MAS default executor retry-budget dead letters after provider repair', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-default-executor-retry-deadletter-redrive-'));
  try {
    const env = familyRuntimeEnv(stateRoot, {
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
      JSON.stringify(defaultExecutorPayload('source-stable-retry-deadletter-redrive')),
      '--dedupe-key',
      'mas:dm-cvd:002:default-executor:run_quality_repair_batch:retry-deadletter-redrive',
    ], env);
    const taskId = enqueue.family_runtime_enqueue.task.task_id;
    forceTaskIntoProviderTransportBlockedState(stateRoot, taskId, 'retry_budget_exhausted', {
      taskStatus: 'dead_letter',
      taskAttempts: 3,
      stageAttemptStatus: 'dead_lettered',
    });

    const deadLetterTask = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const redrive = runCli([
      'family-runtime',
      'queue',
      'redrive',
      taskId,
      '--reason',
      'provider_runtime_repaired_after_retry_budget_exhausted',
      '--source',
      'test-retry-deadletter-redrive',
    ], env);
    const redrivenTask = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const attempts = redrivenTask.family_runtime_task.stage_attempts;

    assert.equal(deadLetterTask.family_runtime_task.task.status, 'dead_letter');
    assert.equal(deadLetterTask.family_runtime_task.task.dead_letter_reason, 'retry_budget_exhausted');
    assert.equal(redrive.family_runtime_redrive.redriven, true);
    assert.equal(redrive.family_runtime_redrive.task.status, 'queued');
    assert.equal(redrive.family_runtime_redrive.task.attempts, 0);
    assert.equal(redrive.family_runtime_redrive.redriven_stage_attempt.status, 'queued');
    assert.equal(redrivenTask.family_runtime_task.task.status, 'queued');
    assert.equal(redrivenTask.family_runtime_task.task.dead_letter_reason, null);
    assert.equal(attempts.length, 2);
    assert.equal(
      redrivenTask.family_runtime_task.events.some((event: { event_type: string; payload: Record<string, unknown> }) => (
        event.event_type === 'task_operator_redrive_from_dead_letter_provider_retry_budget'
        && event.payload.previous_status === 'dead_letter'
        && event.payload.previous_dead_letter_reason === 'retry_budget_exhausted'
        && event.payload.operator_reason === 'provider_runtime_repaired_after_retry_budget_exhausted'
        && isProviderOnlyRedriveEvent(event, 'retry_budget_provider_transport')
      )),
      true,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime operator redrive can recover MAS default executor cancellation lifecycle blockers', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-default-executor-cancelled-operator-redrive-'));
  try {
    const env = familyRuntimeEnv(stateRoot, {
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
      JSON.stringify(defaultExecutorPayload('source-stable-cancelled-redrive')),
      '--dedupe-key',
      'mas:dm-cvd:002:default-executor:run_quality_repair_batch:operator-cancelled-redrive',
    ], env);
    const taskId = enqueue.family_runtime_enqueue.task.task_id;
    forceTaskIntoProviderTransportBlockedState(stateRoot, taskId, 'temporal_stage_attempt_canceled');

    const cancelledTask = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const redrive = runCli([
      'family-runtime',
      'queue',
      'redrive',
      taskId,
      '--reason',
      'provider_lifecycle_recovered_after_codex_activity_cancelled',
      '--source',
      'test-cancelled-redrive',
    ], env);
    const redrivenTask = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const attempts = redrivenTask.family_runtime_task.stage_attempts;

    assert.equal(cancelledTask.family_runtime_task.task.status, 'blocked');
    assert.equal(cancelledTask.family_runtime_task.task.dead_letter_reason, 'temporal_stage_attempt_canceled');
    assert.equal(redrive.family_runtime_redrive.redriven, true);
    assert.equal(redrive.family_runtime_redrive.task.status, 'queued');
    assert.equal(redrive.family_runtime_redrive.redriven_stage_attempt.status, 'queued');
    assert.equal(redrivenTask.family_runtime_task.task.status, 'queued');
    assert.equal(redrivenTask.family_runtime_task.task.dead_letter_reason, null);
    assert.equal(attempts.length, 2);
    assert.equal(
      redrivenTask.family_runtime_task.events.some((event: { event_type: string; payload: Record<string, unknown> }) => (
        event.event_type === 'task_operator_redrive_from_blocked_provider_transport'
        && event.payload.previous_dead_letter_reason === 'temporal_stage_attempt_canceled'
        && event.payload.operator_reason === 'provider_lifecycle_recovered_after_codex_activity_cancelled'
        && isProviderOnlyRedriveEvent(event, 'provider_transport_blocked')
      )),
      true,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime operator redrive accepts retry-budget dead letters proven by task event ledger', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-default-executor-retry-event-redrive-'));
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
      JSON.stringify(defaultExecutorPayload('source-stable-retry-event-redrive')),
      '--dedupe-key',
      'mas:dm-cvd:002:default-executor:run_quality_repair_batch:retry-event-redrive',
    ], env);
    const taskId = enqueue.family_runtime_enqueue.task.task_id;
    runCli(['family-runtime', 'tick', '--source', 'test'], env);
    const queueDb = new DatabaseSync(path.join(stateRoot, 'family-runtime', 'queue.sqlite'));
    try {
      queueDb.prepare(`
        UPDATE tasks
        SET status = 'dead_letter', attempts = 1, dead_letter_reason = 'retry_budget_exhausted',
          last_error = 'retry_budget_exhausted', lease_owner = NULL, lease_expires_at = NULL
        WHERE task_id = ?
      `).run(taskId);
      queueDb.prepare(`
        UPDATE stage_attempts
        SET status = 'blocked', blocked_reason = 'typed_closeout_packet_required'
        WHERE task_id = ?
      `).run(taskId);
      queueDb.prepare(`
        INSERT INTO events(event_id, task_id, domain_id, event_type, source, payload_json, created_at)
        VALUES (?, ?, 'medautoscience', 'task_auto_dead_lettered_after_provider_transport_retries', 'test-auto-dead-letter', ?, ?)
      `).run(
        `evt_${taskId}_retry_budget`,
        taskId,
        JSON.stringify({
          previous_status: 'blocked',
          previous_dead_letter_reason: 'temporal_stage_attempt_not_completed',
          used_attempts: 3,
          max_attempts: 3,
          authority_boundary: {
            opl: 'provider_transport_retry_budget_only',
            domain_truth_mutation: false,
          },
        }),
        new Date().toISOString(),
      );
    } finally {
      queueDb.close();
    }

    const deadLetterTask = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const redrive = runCli([
      'family-runtime',
      'queue',
      'redrive',
      taskId,
      '--reason',
      'provider_runtime_repaired_after_retry_budget_event',
      '--source',
      'test-retry-event-redrive',
    ], env);
    const redrivenTask = runCli(['family-runtime', 'queue', 'inspect', taskId], env);

    assert.equal(deadLetterTask.family_runtime_task.task.status, 'dead_letter');
    assert.equal(deadLetterTask.family_runtime_task.task.dead_letter_reason, 'retry_budget_exhausted');
    assert.equal(redrive.family_runtime_redrive.redriven, true);
    assert.equal(redrive.family_runtime_redrive.task.status, 'queued');
    assert.equal(redrive.family_runtime_redrive.task.attempts, 0);
    assert.equal(redrive.family_runtime_redrive.redriven_stage_attempt.status, 'queued');
    assert.equal(redrivenTask.family_runtime_task.task.status, 'queued');
    assert.equal(
      redrivenTask.family_runtime_task.events.some((event: { event_type: string; payload: Record<string, unknown> }) => (
        event.event_type === 'task_operator_redrive_from_dead_letter_provider_retry_budget'
        && event.payload.retry_budget_evidence_kind === 'task_auto_dead_letter_event'
        && isProviderOnlyRedriveEvent(event, 'retry_budget_provider_transport')
      )),
      true,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(dispatch.fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime stale auto redrive does not duplicate an operator-owned provider transport redrive', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-default-executor-stale-auto-redrive-'));
  try {
    const env = familyRuntimeEnv(stateRoot, {
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
      JSON.stringify(defaultExecutorPayload('source-stale-auto-redrive')),
      '--dedupe-key',
      'mas:dm-cvd:002:default-executor:run_quality_repair_batch:stale-auto-redrive',
    ], env);
    const taskId = enqueue.family_runtime_enqueue.task.task_id;
    forceTaskIntoProviderTransportBlockedState(stateRoot, taskId, 'temporal_stage_attempt_start_failed');
    const blockedTask = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const queueDbPath = path.join(stateRoot, 'family-runtime', 'queue.sqlite');
    const staleDb = new DatabaseSync(queueDbPath, { readOnly: true });
    let staleRow: FamilyRuntimeTaskRow;
    try {
      staleRow = staleDb.prepare('SELECT * FROM tasks WHERE task_id = ?').get(taskId) as FamilyRuntimeTaskRow;
    } finally {
      staleDb.close();
    }
    const stalePayload = JSON.parse(staleRow.payload_json) as Record<string, unknown>;

    const operatorRedrive = runCli([
      'family-runtime',
      'queue',
      'redrive',
      taskId,
      '--reason',
      'provider_runtime_fixed_after_worker_restart',
      '--source',
      'test-operator-redrive',
    ], env);

    const queueDb = new DatabaseSync(queueDbPath);
    try {
      const staleAutoRedrive = redriveBlockedDefaultExecutorProviderTransportTask(
        queueDb,
        staleRow,
        stalePayload,
        {
          source: 'test-stale-auto-redrive',
          trigger: 'auto',
        },
      );
      const attempts = queueDb.prepare(`
        SELECT stage_attempt_id, status
        FROM stage_attempts
        WHERE task_id = ?
        ORDER BY created_at ASC
      `).all(taskId) as Array<{ stage_attempt_id: string; status: string }>;
      const task = queueDb.prepare(`
        SELECT status, last_error, dead_letter_reason
        FROM tasks
        WHERE task_id = ?
      `).get(taskId) as { status: string; last_error: string | null; dead_letter_reason: string | null };
      const duplicateAutoEvents = queueDb.prepare(`
        SELECT COUNT(*) AS count
        FROM events
        WHERE task_id = ? AND event_type = 'task_auto_redrive_from_blocked_provider_transport'
      `).get(taskId) as { count: number };

      assert.equal(blockedTask.family_runtime_task.task.status, 'blocked');
      assert.equal(operatorRedrive.family_runtime_redrive.redriven, true);
      assert.equal(staleAutoRedrive.redriven, false);
      assert.equal(staleAutoRedrive.skip_reason, 'task_no_longer_blocked_for_provider_transport_redrive');
      assert.equal(task.status, 'queued');
      assert.equal(task.last_error, null);
      assert.equal(task.dead_letter_reason, null);
      assert.equal(attempts.length, 2);
      assert.equal(attempts[0].status, 'blocked');
      assert.equal(attempts[1].status, 'queued');
      assert.equal(duplicateAutoEvents.count, 0);
    } finally {
      queueDb.close();
    }
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime redrives MAS default executor dispatch with changed source fingerprint', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-default-executor-redrive-'));
  try {
    const env = familyRuntimeEnv(stateRoot, {
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
    forceTaskIntoProviderTransportBlockedState(stateRoot, taskId, 'temporal_stage_attempt_start_failed', {
      sourceFingerprint: 'mas_default_executor_source_before',
    });
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
    const afterTickTask = redrivenTask;
    const attempts = redrivenTask.family_runtime_task.stage_attempts;
    const sourceFingerprints = attempts.map((attempt: { source_fingerprint: string }) => attempt.source_fingerprint);
    const snapshot = runCli(['runtime', 'snapshot'], env).runtime_tray_snapshot;
    const workbenchAttempt = snapshot.stage_attempt_workbench.evidence_attempts.find(
      (attempt: { task_id?: string }) => attempt.task_id === taskId,
    );

    assert.equal(redrive.family_runtime_enqueue.requeued_from_terminal, true);
    assert.equal(redrivenTask.family_runtime_task.task.status, 'queued');
    assert.equal(afterTickTask.family_runtime_task.task.status, 'queued');
    assert.equal(afterTickTask.family_runtime_task.task.dead_letter_reason, null);
    assert.equal(attempts.length, 1);
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
  try {
    const env = familyRuntimeEnv(stateRoot, {
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
    forceTaskIntoProviderTransportBlockedState(stateRoot, taskId, 'temporal_stage_attempt_start_failed', {
      sourceFingerprint: 'mas_default_executor_source_dd0c796e0680c231a8e8568c',
    });
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
    const afterTickTask = redrivenTask;
    const attempts = redrivenTask.family_runtime_task.stage_attempts;
    const sourceFingerprints = attempts.map((attempt: { source_fingerprint: string }) => attempt.source_fingerprint);

    assert.equal(redrive.family_runtime_redrive.redriven, true);
    assert.equal(redrive.family_runtime_redrive.task.status, 'queued');
    assert.equal(redrive.family_runtime_redrive.redriven_stage_attempt.status, 'queued');
    assert.equal(redrivenTask.family_runtime_task.task.status, 'queued');
    assert.equal(afterTickTask.family_runtime_task.task.status, 'queued');
    assert.equal(afterTickTask.family_runtime_task.task.dead_letter_reason, null);
    assert.equal(attempts.length, 2);
    assert.deepEqual([...new Set(sourceFingerprints)].length, 1);
    assert.equal(sourceFingerprints[0].startsWith('mas_default_executor_source_'), true);
    assert.equal(
      afterTickTask.family_runtime_task.events.some((event: { event_type: string; payload: Record<string, unknown> }) => (
        event.event_type === 'task_operator_redrive_from_blocked_provider_transport'
        && event.payload.source_fingerprint_changed === false
        && isProviderOnlyRedriveEvent(event, 'provider_transport_blocked')
      )),
      true,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
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
