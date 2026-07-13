import { assert, createFamilyContractsFixtureRoot, fs, installRuntimePackageFixture, os, path, runCli, test } from '../helpers.ts';

test('runtime snapshot projects cognitive kernel launch and closeout boundaries into stage attempt workbench', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-attempt-workbench-cognitive-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  installRuntimePackageFixture(stateRoot, 'mas');
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
      'temporal',
      '--workspace-locator',
      JSON.stringify({
        workspace_root: '/tmp/mas',
        stage_goal: 'Repair table evidence and return an owner answer or typed blocker.',
        context_refs: ['context:table-review'],
        available_affordances: [
          { affordance_ref: 'tool:rg', capability: 'source_search', permission_boundary: 'read_only' },
        ],
        authority_boundary: {
          can_write_domain_truth: false,
          can_authorize_quality_verdict: false,
        },
        quality_gate: {
          gate_ref: 'quality-gate:mas/ai-reviewer',
          owner: 'med-autoscience',
        },
      }),
      '--task',
      'task-runtime-snapshot-cognitive-kernel',
      '--source-fingerprint',
      'sha256:cognitive-workbench',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    runCli([
      'family-runtime',
      'attempt',
      'fixture-run',
      attempt.family_runtime_stage_attempt.attempt.stage_attempt_id,
      '--closeout-packet',
      JSON.stringify({
        surface_kind: 'stage_attempt_closeout_packet',
        closeout_refs: ['receipt:analysis-closeout'],
        consumed_refs: ['evidence:table1'],
        writeback_receipt_refs: ['memory-writeback:receipt-1'],
        next_owner: 'med-autoscience',
        domain_ready_verdict: 'domain_gate_pending',
        route_impact: {
          tool_refs: ['tool:rg'],
          evidence_refs: ['evidence:table1'],
          artifact_refs: ['memory-writeback:receipt-1'],
          owner_answer_refs: ['owner-answer:mas/table-review'],
          typed_blocker_refs: ['typed-blocker:mas/reviewer-refresh-required'],
        },
      }),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });

    const output = runCli(['runtime', 'snapshot'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    const projectedAttempt = output.runtime_tray_snapshot.stage_attempt_workbench.attempts[0];

    assert.equal(projectedAttempt.attempt_launch_envelope.surface_kind, 'opl_stage_attempt_launch_envelope');
    assert.equal(
      projectedAttempt.attempt_launch_envelope.envelope_semantics,
      'stage_goal_context_authority_boundary_available_affordances_quality_gate',
    );
    assert.equal(
      projectedAttempt.attempt_launch_envelope.tool_affordance_policy,
      'available_affordances_not_mandatory_sequence_not_workflow_script',
    );
    assert.deepEqual(projectedAttempt.attempt_launch_envelope.available_affordance_refs, ['tool:rg']);
    assert.equal(projectedAttempt.attempt_launch_envelope.quality_gate.gate_ref, 'quality-gate:mas/ai-reviewer');
    assert.equal(projectedAttempt.attempt_launch_envelope.authority_boundary.can_write_domain_truth, false);
    assert.equal(
      projectedAttempt.attempt_launch_envelope.authority_boundary.tool_affordance_can_override_stage_goal,
      false,
    );

    assert.equal(projectedAttempt.closeout_refs_only_contract.surface_kind, 'opl_stage_attempt_closeout_refs_only_contract');
    assert.equal(
      projectedAttempt.closeout_refs_only_contract.closeout_policy,
      'actual_tool_evidence_artifact_owner_answer_or_typed_blocker_refs_only',
    );
    assert.deepEqual(projectedAttempt.closeout_refs_only_contract.actual_tool_refs, ['tool:rg']);
    assert.deepEqual(projectedAttempt.closeout_refs_only_contract.actual_evidence_refs, ['evidence:table1']);
    assert.deepEqual(projectedAttempt.closeout_refs_only_contract.actual_artifact_refs, ['memory-writeback:receipt-1']);
    assert.deepEqual(projectedAttempt.closeout_refs_only_contract.owner_answer_refs, ['owner-answer:mas/table-review']);
    assert.deepEqual(
      projectedAttempt.closeout_refs_only_contract.typed_blocker_refs,
      ['typed-blocker:mas/reviewer-refresh-required'],
    );
    assert.equal(projectedAttempt.closeout_refs_only_contract.authority_boundary.can_create_typed_blocker, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
