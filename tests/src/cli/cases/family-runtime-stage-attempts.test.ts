import { spawnSync } from 'node:child_process';

import { assert, fs, os, path, repoRoot, runCli, test } from '../helpers.ts';

function familyRuntimeEnv(stateRoot: string, extra: Record<string, string> = {}) {
  return {
    OPL_STATE_DIR: stateRoot,
    OPL_DISABLE_HERMES_ONLINE: '1',
    ...extra,
  };
}

test('family-runtime stage attempt create is idempotent by semantic attempt key unless explicitly bypassed', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-attempt-idem-'));
  const createArgs = [
    'family-runtime',
    'attempt',
    'create',
    '--domain',
    'medautoscience',
    '--stage',
    'scout',
    '--provider',
    'local_sqlite',
    '--workspace-locator',
    '{"workspace_root":"/tmp/mas"}',
    '--source-fingerprint',
    'sha256:scout',
    '--task',
    'task-1',
  ];
  try {
    const first = runCli(createArgs, familyRuntimeEnv(stateRoot));
    const second = runCli(createArgs, familyRuntimeEnv(stateRoot));
    const third = runCli([...createArgs, '--new-attempt'], familyRuntimeEnv(stateRoot));
    const attempts = runCli(['family-runtime', 'attempt', 'list'], familyRuntimeEnv(stateRoot));

    assert.equal(first.family_runtime_stage_attempt.created, true);
    assert.equal(first.family_runtime_stage_attempt.idempotent_noop, false);
    assert.equal(second.family_runtime_stage_attempt.created, false);
    assert.equal(second.family_runtime_stage_attempt.idempotent_noop, true);
    assert.equal(
      second.family_runtime_stage_attempt.attempt.stage_attempt_id,
      first.family_runtime_stage_attempt.attempt.stage_attempt_id,
    );
    assert.equal(third.family_runtime_stage_attempt.created, true);
    assert.equal(third.family_runtime_stage_attempt.idempotent_noop, false);
    assert.notEqual(
      third.family_runtime_stage_attempt.attempt.stage_attempt_id,
      first.family_runtime_stage_attempt.attempt.stage_attempt_id,
    );
    assert.equal(attempts.family_runtime_stage_attempts.summary.total, 2);
    assert.equal(
      first.family_runtime_stage_attempt.attempt.idempotency_key,
      second.family_runtime_stage_attempt.attempt.idempotency_key,
    );
    assert.notEqual(
      first.family_runtime_stage_attempt.attempt.idempotency_key,
      third.family_runtime_stage_attempt.attempt.idempotency_key,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime attempt query, signal, and fixture-run expose provider lifecycle without domain verdict ownership', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-attempt-query-'));
  try {
    const created = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'analysis-campaign',
      '--provider',
      'temporal',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mas","runtime_root":"/tmp/mas/runtime","artifact_root":"/tmp/mas/artifacts"}',
      '--source-fingerprint',
      'sha256:analysis',
    ], familyRuntimeEnv(stateRoot));
    const attemptId = created.family_runtime_stage_attempt.attempt.stage_attempt_id;
    const queryBefore = runCli([
      'family-runtime',
      'attempt',
      'query',
      attemptId,
    ], familyRuntimeEnv(stateRoot));
    const humanGate = runCli([
      'family-runtime',
      'attempt',
      'signal',
      attemptId,
      '--kind',
      'human_gate',
      '--payload',
      '{"human_gate_ref":"gate:analysis-review","reason":"needs_human_review"}',
    ], familyRuntimeEnv(stateRoot));
    const resumed = runCli([
      'family-runtime',
      'attempt',
      'signal',
      attemptId,
      '--kind',
      'resume',
      '--payload',
      '{"reason":"operator_resume"}',
    ], familyRuntimeEnv(stateRoot));
    const userInstruction = runCli([
      'family-runtime',
      'attempt',
      'signal',
      attemptId,
      '--kind',
      'user_instruction',
      '--payload',
      '{"instruction_ref":"user:revision-10","instruction_count":10}',
    ], familyRuntimeEnv(stateRoot));
    const fixtureRun = runCli([
      'family-runtime',
      'attempt',
      'fixture-run',
      attemptId,
      '--stage-packet-ref',
      'packet:analysis-campaign',
      '--checkpoint-ref',
      'checkpoint:analysis-slice-1',
      '--closeout-packet',
      '{"surface_kind":"stage_attempt_closeout_packet","closeout_refs":["receipt:analysis-closeout"],"consumed_refs":["evidence:table1"],"rejected_writes":[{"reason":"domain_truth_write_forbidden"}],"next_owner":"med-autoscience","domain_ready_verdict":"domain_gate_pending","route_impact":{"decision":"bounded_repair","reason":"weak_primary_endpoint","next_owner":"med-autoscience"}}',
    ], familyRuntimeEnv(stateRoot));
    const queryAfter = runCli([
      'family-runtime',
      'attempt',
      'query',
      attemptId,
    ], familyRuntimeEnv(stateRoot));

    assert.equal(
      queryBefore.family_runtime_stage_attempt_query.stage_attempt_query.workflow_contract.workflow_name,
      'StageAttemptWorkflow',
    );
    assert.equal(queryBefore.family_runtime_stage_attempt_query.stage_attempt_query.workflow_input.stage_id, 'analysis-campaign');
    assert.equal(
      queryBefore.family_runtime_stage_attempt_query.stage_attempt_query.completion_boundary.provider_completion_is_domain_ready,
      false,
    );
    assert.equal(humanGate.family_runtime_stage_attempt_signal.attempt.status, 'human_gate');
    assert.deepEqual(humanGate.family_runtime_stage_attempt_signal.attempt.human_gate_refs, ['gate:analysis-review']);
    assert.equal(resumed.family_runtime_stage_attempt_signal.attempt.status, 'queued');
    assert.equal(userInstruction.family_runtime_stage_attempt_signal.signal.signal_kind, 'user_instruction');
    assert.equal(fixtureRun.family_runtime_stage_attempt_fixture_run.provider_fixture_run.provider_completion, 'completed');
    assert.equal(
      fixtureRun.family_runtime_stage_attempt_fixture_run.provider_fixture_run.domain_ready_verdict,
      'domain_gate_pending',
    );
    assert.equal(
      fixtureRun.family_runtime_stage_attempt_fixture_run.attempt.closeout_receipt_status,
      'accepted_typed_closeout',
    );
    assert.equal(fixtureRun.family_runtime_stage_attempt_fixture_run.attempt.route_impact.decision, 'bounded_repair');
    assert.ok(fixtureRun.family_runtime_stage_attempt_fixture_run.attempt.activity_events.length >= 2);
    assert.equal(
      fixtureRun.family_runtime_stage_attempt_fixture_run.attempt.activity_events.at(-1).activity_status,
      'completed',
    );
    assert.equal(queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.operator_visibility.next_owner, 'med-autoscience');
    assert.equal(
      queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.operator_visibility.route_impact.decision,
      'bounded_repair',
    );
    assert.equal(
      queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.operator_visibility.closeout_receipt_status,
      'accepted_typed_closeout',
    );
    assert.equal(
      queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.operator_visibility.provider_run.provider_kind,
      'temporal',
    );
    assert.ok(queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.operator_visibility.activity_events.length >= 2);
    assert.equal(queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.signals.length, 3);
    assert.equal(
      queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.operator_visibility.rejected_writes[0].reason,
      'domain_truth_write_forbidden',
    );
    assert.deepEqual(queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.lifecycle_primitives.artifact_locator_index, {
      locator_kind: 'workspace_runtime_artifact_locator',
      workspace_root: '/tmp/mas',
      runtime_root: '/tmp/mas/runtime',
      artifact_root: '/tmp/mas/artifacts',
      content_policy: 'locator_only_no_artifact_content',
    });
    assert.equal(
      queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.completion_boundary.provider_completion,
      'completed',
    );
    assert.equal(
      queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.completion_boundary.domain_ready_verdict,
      'domain_gate_pending',
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime attempt fixture-run rejects missing typed closeout refs without completing attempt', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-closeout-reject-'));
  try {
    const created = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'redcube',
      '--stage',
      'review',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      '{"workspace_root":"/tmp/rca"}',
    ], familyRuntimeEnv(stateRoot));
    const attemptId = created.family_runtime_stage_attempt.attempt.stage_attempt_id;
    const result = spawnSync(process.execPath, [
      '--experimental-strip-types',
      path.join(repoRoot, 'src', 'cli.ts'),
      'family-runtime',
      'attempt',
      'fixture-run',
      attemptId,
      '--closeout-packet',
      '{"surface_kind":"stage_attempt_closeout_packet","summary":"free text without refs"}',
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
        ...familyRuntimeEnv(stateRoot),
      },
    });
    const output = JSON.parse(result.stdout || result.stderr);
    const inspected = runCli(['family-runtime', 'attempt', 'inspect', attemptId], familyRuntimeEnv(stateRoot));

    assert.notEqual(result.status, 0);
    assert.equal(output.error.code, 'contract_shape_invalid');
    assert.equal(inspected.family_runtime_stage_attempt.attempt.status, 'running');
    assert.equal(inspected.family_runtime_stage_attempt.attempt.closeout_receipt_status, null);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
