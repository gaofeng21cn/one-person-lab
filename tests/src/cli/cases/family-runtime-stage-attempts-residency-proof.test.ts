import { spawnSync } from 'node:child_process';

import { assert, fs, os, path, repoRoot, runCli, test } from '../helpers.ts';

function familyRuntimeEnv(stateRoot: string, extra: Record<string, string> = {}) {
  return {
    OPL_STATE_DIR: stateRoot,
    ...extra,
  };
}

test('family-runtime residency proof aggregates Temporal attempt, signal, blocked, and closeout evidence', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-residency-proof-ledger-'));
  try {
    const completed = runCli([
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
      '{"workspace_root":"/tmp/mas"}',
      '--source-fingerprint',
      'sha256:temporal-proof-completed',
    ], familyRuntimeEnv(stateRoot));
    const completedId = completed.family_runtime_stage_attempt.attempt.stage_attempt_id;
    runCli([
      'family-runtime',
      'attempt',
      'fixture-run',
      completedId,
      '--checkpoint-ref',
      'checkpoint:temporal-proof',
      '--closeout-packet',
      '{"surface_kind":"stage_attempt_closeout_packet","closeout_refs":["receipt:temporal-proof"],"domain_ready_verdict":"domain_gate_pending"}',
    ], familyRuntimeEnv(stateRoot));

    const queueDb = path.join(stateRoot, 'family-runtime', 'queue.sqlite');
    const signalResult = spawnSync(process.execPath, [
      '--experimental-strip-types',
      '-e',
      `import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync(${JSON.stringify(queueDb)});
db.prepare("INSERT INTO stage_attempt_signals(signal_id, stage_attempt_id, signal_kind, payload_json, source, created_at) VALUES (?, ?, 'human_gate', ?, 'test-fixture', ?)").run('sig_temporal_proof', ${JSON.stringify(completedId)}, '{"human_gate_ref":"gate:temporal-proof","reason":"operator_review"}', new Date().toISOString());
db.close();`,
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
      },
    });
    assert.equal(signalResult.status, 0, signalResult.stderr);

    runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'blocked-closeout',
      '--provider',
      'temporal',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mas"}',
      '--source-fingerprint',
      'sha256:temporal-proof-blocked',
      '--blocked-reason',
      'typed_closeout_packet_required',
    ], familyRuntimeEnv(stateRoot));

    const task = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'paper_autonomy/repair-recheck',
      '--payload',
      '{"workspace_root":"/tmp/mas"}',
    ], familyRuntimeEnv(stateRoot));
    const taskId = task.family_runtime_enqueue.task.task_id;
    const deadLettered = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'retry-budget',
      '--provider',
      'temporal',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mas"}',
      '--task',
      taskId,
      '--source-fingerprint',
      'sha256:temporal-proof-dead-letter',
    ], familyRuntimeEnv(stateRoot));
    const deadLetteredId = deadLettered.family_runtime_stage_attempt.attempt.stage_attempt_id;
    const result = spawnSync(process.execPath, [
      '--experimental-strip-types',
      '-e',
      `import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync(${JSON.stringify(queueDb)});
db.prepare("UPDATE tasks SET status = 'dead_letter', attempts = 3, dead_letter_reason = 'retry_budget_exhausted', last_error = 'planned failure' WHERE task_id = ?").run(${JSON.stringify(taskId)});
db.prepare("UPDATE stage_attempts SET status = 'dead_lettered', blocked_reason = 'retry_budget_exhausted' WHERE stage_attempt_id = ?").run(${JSON.stringify(deadLetteredId)});
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

    const proof = runCli(
      ['family-runtime', 'residency', 'proof', '--provider', 'temporal'],
      familyRuntimeEnv(stateRoot),
    ).family_runtime_residency_proof;

    assert.equal(proof.proofs.attempt_start_query_signal.temporal_attempts_total, 3);
    assert.equal(proof.proofs.attempt_start_query_signal.temporal_signal_counts.human_gate, 1);
    assert.equal(proof.proofs.attempt_start_query_signal.retry_dead_letter_blocked.dead_lettered_attempts, 1);
    assert.equal(proof.proofs.attempt_start_query_signal.retry_dead_letter_blocked.blocked_attempts, 1);
    assert.equal(proof.proofs.attempt_start_query_signal.retry_dead_letter_blocked.proof_status, 'proven');
    assert.equal(proof.proofs.typed_closeout_required.temporal_completed_attempts, 1);
    assert.equal(proof.proofs.typed_closeout_required.temporal_typed_closeout_accepted_attempts, 1);
    assert.equal(proof.proofs.typed_closeout_required.temporal_blocked_attempts, 1);
    assert.equal(proof.proofs.typed_closeout_required.proof_status, 'proven');
    assert.equal(proof.closeout_status, 'production_residency_needs_live_evidence');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
