import { spawnSync } from 'node:child_process';

import { assert, cliPath, fs, os, path, repoRoot, runCli, test, parseJsonText } from '../helpers.ts';

function familyRuntimeEnv(stateRoot: string, extra: Record<string, string> = {}) {
  return {
    OPL_STATE_DIR: stateRoot,
    ...extra,
  };
}

test('family-runtime attempt query exposes task dead-letter ledger on linked attempts', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-attempt-dead-letter-'));
  try {
    const task = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'redcube',
      '--task-kind',
      'render/recover',
      '--payload',
      '{"workspace_root":"/tmp/rca"}',
    ], familyRuntimeEnv(stateRoot));
    const taskId = task.family_runtime_enqueue.task.task_id;
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
      '--task',
      taskId,
    ], familyRuntimeEnv(stateRoot));
    const attemptId = created.family_runtime_stage_attempt.attempt.stage_attempt_id;
    const queueDb = path.join(stateRoot, 'family-runtime', 'queue.sqlite');
    const result = spawnSync(process.execPath, [
      '--experimental-strip-types',
      '-e',
      `import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync(${JSON.stringify(queueDb)});
db.prepare("UPDATE tasks SET status = 'dead_letter', attempts = 3, dead_letter_reason = 'retry_budget_exhausted', last_error = 'planned failure' WHERE task_id = ?").run(${JSON.stringify(taskId)});
db.prepare("UPDATE stage_attempts SET status = 'dead_lettered', blocked_reason = 'retry_budget_exhausted' WHERE stage_attempt_id = ?").run(${JSON.stringify(attemptId)});
db.close();`,
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
      },
    });
    assert.equal(result.status, 0, result.stderr);

    const query = runCli(['family-runtime', 'attempt', 'query', attemptId], familyRuntimeEnv(stateRoot));
    const visibility = query.family_runtime_stage_attempt_query.stage_attempt_query.operator_visibility;

    assert.equal(visibility.dead_letter.reason, 'retry_budget_exhausted');
    assert.equal(visibility.dead_letter.task.status, 'dead_letter');
    assert.equal(visibility.dead_letter.task.last_error, 'planned failure');
    assert.equal(query.family_runtime_stage_attempt_query.stage_attempt_query.canonical_outcome, 'dead_lettered');
    assert.equal(
      visibility.operator_conflicts.some((envelope: { classification: string }) =>
        envelope.classification === 'execution_retryable'
      ),
      true,
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
      cliPath,
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
    const output = parseJsonText(result.stdout || result.stderr) as any;
    const inspected = runCli(['family-runtime', 'attempt', 'inspect', attemptId], familyRuntimeEnv(stateRoot));

    assert.notEqual(result.status, 0);
    assert.equal(output.error.code, 'contract_shape_invalid');
    assert.equal(inspected.family_runtime_stage_attempt.attempt.status, 'running');
    assert.equal(inspected.family_runtime_stage_attempt.attempt.closeout_receipt_status, null);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime attempt fixture-run ingests typed memory closeout refs and signal history', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-memory-closeout-'));
  try {
    const created = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'review',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mas","artifact_root":"/tmp/mas/artifacts"}',
      '--source-fingerprint',
      'sha256:review-memory',
    ], familyRuntimeEnv(stateRoot));
    const attemptId = created.family_runtime_stage_attempt.attempt.stage_attempt_id;

    runCli([
      'family-runtime',
      'attempt',
      'signal',
      attemptId,
      '--kind',
      'user_instruction',
      '--payload',
      '{"instruction_ref":"user:revision-10","instruction_count":10}',
      '--source',
      'operator',
    ], familyRuntimeEnv(stateRoot));
    runCli([
      'family-runtime',
      'attempt',
      'signal',
      attemptId,
      '--kind',
      'resume',
      '--payload',
      '{"resume_token":"resume:review-memory","reason":"operator_resume"}',
      '--source',
      'operator',
    ], familyRuntimeEnv(stateRoot));

    const fixtureRun = runCli([
      'family-runtime',
      'attempt',
      'fixture-run',
      attemptId,
      '--checkpoint-ref',
      'checkpoint:review-midpoint',
      '--closeout-packet',
      '{"surface_kind":"stage_memory_closeout_packet","closeout_refs":["receipt:review-closeout"],"consumed_refs":["evidence:review-ledger"],"consumed_memory_refs":["memory:route-policy","memory:reviewer-style"],"writeback_receipt_refs":["memory-writeback:receipt-1"],"rejected_writes":[{"target":"memory","reason":"domain_router_rejected"}],"next_owner":"med-autoscience","domain_ready_verdict":"domain_gate_pending","route_impact":{"route":"review","impact":"needs_revision"}}',
    ], familyRuntimeEnv(stateRoot));
    const queryAfter = runCli(['family-runtime', 'attempt', 'query', attemptId], familyRuntimeEnv(stateRoot));
    const visibility = queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.operator_visibility;

    assert.equal(fixtureRun.family_runtime_stage_attempt_fixture_run.attempt.closeout_receipt_status, 'accepted_typed_closeout');
    assert.deepEqual(visibility.consumed_memory_refs, ['memory:route-policy', 'memory:reviewer-style']);
    assert.deepEqual(visibility.writeback_receipt_refs, ['memory-writeback:receipt-1']);
    assert.equal(visibility.rejected_writes[0].reason, 'domain_router_rejected');
    assert.equal(visibility.route_impact.impact, 'needs_revision');
    assert.equal(visibility.user_instructions.length, 1);
    assert.equal(visibility.resume_signals.length, 1);
    assert.equal(visibility.resume_signals[0].payload.resume_token, 'resume:review-memory');
    assert.equal(
      visibility.authority_boundary.domain,
      'truth_quality_artifact_gate_owner',
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
