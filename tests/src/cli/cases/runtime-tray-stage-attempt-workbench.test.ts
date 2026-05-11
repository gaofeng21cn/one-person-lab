import { spawnSync } from 'node:child_process';

import { assert, createFamilyContractsFixtureRoot, fs, os, path, repoRoot, runCli, test } from '../helpers.ts';

test('runtime snapshot projects stage attempt workbench without owning domain verdicts', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-attempt-workbench-state-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  try {
    const attempt = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'analysis-campaign',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mas","runtime_root":"/tmp/mas/runtime","artifact_root":"/tmp/mas/artifacts"}',
      '--task',
      'task-runtime-snapshot-attempt',
      '--checkpoint-ref',
      'checkpoint:analysis-seed',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_DISABLE_HERMES_ONLINE: '1',
    });
    runCli([
      'family-runtime',
      'attempt',
      'fixture-run',
      attempt.family_runtime_stage_attempt.attempt.stage_attempt_id,
      '--stage-packet-ref',
      'packet:analysis',
      '--checkpoint-ref',
      'checkpoint:analysis-midpoint',
      '--closeout-packet',
      '{"surface_kind":"stage_attempt_closeout_packet","closeout_refs":["receipt:analysis-closeout"],"consumed_refs":["evidence:table1"],"consumed_memory_refs":["memory:route-policy"],"writeback_receipt_refs":["memory-writeback:receipt-1"],"rejected_writes":[{"reason":"domain_truth_write_forbidden"}],"next_owner":"med-autoscience","domain_ready_verdict":"domain_gate_pending","route_impact":{"decision":"bounded_repair"}}',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_DISABLE_HERMES_ONLINE: '1',
    });

    const output = runCli(['runtime', 'snapshot'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    const snapshot = output.runtime_tray_snapshot;

    assert.equal(snapshot.stage_attempt_workbench.surface_kind, 'opl_stage_attempt_workbench');
    assert.equal(snapshot.stage_attempt_workbench.availability, 'available');
    assert.equal(snapshot.stage_attempt_workbench.provider_completion_is_domain_ready, false);
    assert.equal(snapshot.stage_attempt_workbench.summary.total, 1);
    assert.equal(snapshot.stage_attempt_workbench.summary.by_domain.medautoscience, 1);
    assert.equal(snapshot.stage_attempt_workbench.summary.by_stage['analysis-campaign'], 1);
    assert.equal(snapshot.stage_attempt_workbench.summary.by_status.completed, 1);
    assert.equal(snapshot.stage_attempt_workbench.summary.memory_ref_counters.consumed_memory_ref_count, 1);
    assert.equal(snapshot.stage_attempt_workbench.summary.memory_ref_counters.writeback_receipt_ref_count, 1);
    assert.equal(snapshot.stage_attempt_workbench.groups.by_domain.medautoscience.total, 1);
    assert.deepEqual(snapshot.stage_attempt_workbench.filter_metadata.group_keys, ['domain_id', 'stage_id', 'status']);
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].provider_kind, 'local_sqlite');
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].stage_id, 'analysis-campaign');
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].closeout_receipt_status, 'accepted_typed_closeout');
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].completion_boundary.provider_completion, 'completed');
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].completion_boundary.domain_ready_verdict, 'domain_gate_pending');
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].completion_boundary.provider_completion_is_domain_ready, false);
    assert.deepEqual(snapshot.stage_attempt_workbench.attempts[0].consumed_memory_refs, ['memory:route-policy']);
    assert.deepEqual(snapshot.stage_attempt_workbench.attempts[0].writeback_receipt_refs, ['memory-writeback:receipt-1']);
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].rejected_writes[0].reason, 'domain_truth_write_forbidden');
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].route_impact.decision, 'bounded_repair');
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].filter_keys.domain_id, 'medautoscience');
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].filter_keys.has_consumed_memory_refs, true);
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].filter_keys.has_writeback_receipt_refs, true);
    assert.equal(snapshot.source_refs.some((ref: { role: string }) => ref.role === 'stage_attempt_workbench'), true);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('runtime snapshot projects multi-attempt workbench groups, filters, and attention counters', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-attempt-workbench-ledger-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  try {
    const completedAttempt = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'analysis-campaign',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mas"}',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_DISABLE_HERMES_ONLINE: '1',
    });
    const completedAttemptId = completedAttempt.family_runtime_stage_attempt.attempt.stage_attempt_id;
    runCli([
      'family-runtime',
      'attempt',
      'fixture-run',
      completedAttemptId,
      '--stage-packet-ref',
      'packet:analysis',
      '--closeout-packet',
      '{"surface_kind":"stage_attempt_closeout_packet","closeout_refs":["receipt:analysis-closeout"],"consumed_memory_refs":["memory:route-policy","memory:dataset-policy"],"writeback_receipt_refs":["memory-writeback:receipt-1"],"domain_ready_verdict":"domain_gate_pending"}',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_DISABLE_HERMES_ONLINE: '1',
    });

    const gatedAttempt = runCli([
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
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_DISABLE_HERMES_ONLINE: '1',
    });
    const gatedAttemptId = gatedAttempt.family_runtime_stage_attempt.attempt.stage_attempt_id;
    runCli([
      'family-runtime',
      'attempt',
      'signal',
      gatedAttemptId,
      '--kind',
      'human_gate',
      '--payload',
      '{"human_gate_ref":"gate:review","reason":"operator_review"}',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_DISABLE_HERMES_ONLINE: '1',
    });
    runCli([
      'family-runtime',
      'attempt',
      'signal',
      gatedAttemptId,
      '--kind',
      'user_instruction',
      '--payload',
      '{"instruction_ref":"user:review-note"}',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_DISABLE_HERMES_ONLINE: '1',
    });
    runCli([
      'family-runtime',
      'attempt',
      'signal',
      gatedAttemptId,
      '--kind',
      'resume',
      '--payload',
      '{"resume_token":"resume:review"}',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_DISABLE_HERMES_ONLINE: '1',
    });
    const deadLetterAttempt = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautogrant',
      '--stage',
      'draft',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mag"}',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_DISABLE_HERMES_ONLINE: '1',
    });
    const deadLetterAttemptId = deadLetterAttempt.family_runtime_stage_attempt.attempt.stage_attempt_id;
    const queueDb = path.join(stateRoot, 'family-runtime', 'queue.sqlite');
    const result = spawnSync(process.execPath, [
      '--experimental-strip-types',
      '-e',
      `import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync(${JSON.stringify(queueDb)});
db.prepare("UPDATE stage_attempts SET status = 'human_gate' WHERE stage_attempt_id = ?").run(${JSON.stringify(gatedAttemptId)});
db.prepare("UPDATE stage_attempts SET status = 'dead_lettered', blocked_reason = 'retry_budget_exhausted' WHERE stage_attempt_id = ?").run(${JSON.stringify(deadLetterAttemptId)});
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

    const output = runCli(['runtime', 'snapshot'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    const workbench = output.runtime_tray_snapshot.stage_attempt_workbench;
    const gated = workbench.attempts.find((attempt: { stage_attempt_id: string }) => attempt.stage_attempt_id === gatedAttemptId);
    const completed = workbench.attempts.find((attempt: { stage_attempt_id: string }) => attempt.stage_attempt_id === completedAttemptId);
    const deadLetter = workbench.attempts.find((attempt: { stage_attempt_id: string }) => attempt.stage_attempt_id === deadLetterAttemptId);

    assert.equal(workbench.provider_completion_is_domain_ready, false);
    assert.equal(workbench.summary.total, 3);
    assert.equal(workbench.summary.by_domain.medautoscience, 1);
    assert.equal(workbench.summary.by_domain.redcube, 1);
    assert.equal(workbench.summary.by_domain.medautogrant, 1);
    assert.equal(workbench.summary.by_stage['analysis-campaign'], 1);
    assert.equal(workbench.summary.by_stage.review, 1);
    assert.equal(workbench.summary.by_stage.draft, 1);
    assert.equal(workbench.summary.by_status.completed, 1);
    assert.equal(workbench.summary.by_status.human_gate, 1);
    assert.equal(workbench.summary.by_status.dead_lettered, 1);
    assert.equal(workbench.summary.attention_count, 2);
    assert.equal(workbench.summary.human_gate_count, 1);
    assert.equal(workbench.summary.resume_count, 1);
    assert.equal(workbench.summary.dead_letter_count, 1);
    assert.equal(workbench.summary.memory_ref_counters.consumed_memory_ref_count, 2);
    assert.equal(workbench.summary.memory_ref_counters.writeback_receipt_ref_count, 1);
    assert.equal(workbench.summary.memory_ref_counters.attempts_with_consumed_memory_refs, 1);
    assert.equal(workbench.summary.memory_ref_counters.attempts_with_writeback_receipt_refs, 1);
    assert.equal(workbench.groups.by_domain.medautoscience.total, 1);
    assert.equal(workbench.groups.by_domain.medautoscience.memory_ref_counters.consumed_memory_ref_count, 2);
    assert.equal(workbench.groups.by_domain.redcube.human_gate_count, 1);
    assert.equal(workbench.groups.by_domain.redcube.resume_count, 1);
    assert.equal(workbench.groups.by_domain.medautogrant.dead_letter_count, 1);
    assert.equal(workbench.groups.by_status.human_gate.attempt_ids[0], gatedAttemptId);
    assert.equal(workbench.groups.by_status.dead_lettered.attempt_ids[0], deadLetterAttemptId);

    assert.equal(completed.filter_keys.domain_id, 'medautoscience');
    assert.equal(completed.filter_keys.stage_id, 'analysis-campaign');
    assert.equal(completed.filter_keys.status, 'completed');
    assert.equal(completed.filter_keys.has_consumed_memory_refs, true);
    assert.equal(completed.filter_keys.has_writeback_receipt_refs, true);
    assert.equal(gated.human_gate_ledger[0].payload.reason, 'operator_review');
    assert.equal(gated.user_instruction_ledger[0].payload.instruction_ref, 'user:review-note');
    assert.equal(gated.resume_ledger[0].payload.resume_token, 'resume:review');
    assert.deepEqual(gated.attention_flags, ['human_gate', 'resume_available']);
    assert.equal(gated.filter_keys.human_gate, true);
    assert.equal(gated.filter_keys.resume_available, true);
    assert.equal(deadLetter.dead_letter.reason, 'retry_budget_exhausted');
    assert.deepEqual(deadLetter.attention_flags, ['dead_lettered', 'blocked']);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
