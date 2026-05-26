import {
  assert,
  fs,
  os,
  path,
  runCli,
  test,
} from '../helpers.ts';

test('runtime Codex App runtime evidence records and verifies Temporal-hosted long-soak refs without readiness claims', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-codex-app-runtime-evidence-state-'));
  try {
    const initial = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], {
      OPL_STATE_DIR: stateRoot,
    }).app_operator_drilldown;
    assert.equal(initial.summary.codex_app_runtime_evidence_gate_count, 1);
    assert.equal(initial.summary.codex_app_runtime_evidence_open_gate_count, 1);
    assert.equal(initial.summary.codex_app_runtime_evidence_ledger_receipt_ref_count, 0);
    assert.equal(initial.summary.codex_app_runtime_evidence_action_route_count, 1);
    assert.equal(initial.summary.codex_app_runtime_evidence_record_action_route_count, 1);
    assert.equal(initial.summary.codex_app_runtime_evidence_verify_action_route_count, 0);
    assert.equal(initial.summary.codex_app_production_long_soak_claimed, false);
    assert.equal(initial.summary.codex_app_production_evidence_gate_remains_open, true);

    const recordRoute = initial.operator_action_routing_refs.refs.find(
      (ref: { action_id: string }) =>
        ref.action_id === 'codex_app_runtime_evidence:codex_app_runtime_role:record',
    );
    assert.equal(recordRoute.action_kind, 'codex_app_runtime_evidence_receipt_record');
    assert.equal(recordRoute.owner, 'opl');
    assert.equal(recordRoute.route_target_kind, 'opl_cli');
    assert.equal(recordRoute.execution_policy, 'opl_safe_action_shell');
    assert.equal(recordRoute.execution_surface, 'opl runtime action execute');
    assert.equal(recordRoute.route_requires_domain_or_app_payload, true);
    assert.equal(recordRoute.can_close_without_domain_or_app_payload, false);
    assert.equal(recordRoute.payload_owner, 'app_live_operator_or_opl_provider_owner');
    assert.deepEqual(recordRoute.payload_template, {
      temporal_hosted_long_soak_refs: [],
      provider_state_linkage_refs: [],
      operator_evidence_refs: [],
      typed_blocker_refs: [],
    });
    assert.equal(
      recordRoute.payload_workorder.surface_kind,
      'opl_codex_app_runtime_evidence_payload_workorder',
    );
    assert.equal(
      recordRoute.payload_workorder.accepted_payload_paths
        .temporal_hosted_long_soak_refs_path.closes_long_soak,
      false,
    );
    assert.equal(
      recordRoute.payload_workorder.accepted_payload_paths
        .typed_blocker_path.success_claimed,
      false,
    );
    assert.equal(recordRoute.payload_workorder.authority_boundary.refs_only, true);
    assert.equal(recordRoute.payload_workorder.authority_boundary.can_create_owner_receipt, false);
    assert.equal(recordRoute.payload_workorder.authority_boundary.can_generate_typed_blocker, false);
    assert.equal(recordRoute.payload_workorder.authority_boundary.can_close_long_soak, false);
    assert.equal(recordRoute.payload_workorder.authority_boundary.can_claim_production_ready, false);
    assert.deepEqual(
      recordRoute.copyable_runtime_action_execute_commands.record_with_payload,
      [
        'runtime',
        'action',
        'execute',
        '--action',
        'codex_app_runtime_evidence:codex_app_runtime_role:record',
        '--payload-file',
        '<payload.json>',
      ],
    );

    const dryRun = runCli([
      'runtime',
      'action',
      'execute',
      '--action',
      'codex_app_runtime_evidence:codex_app_runtime_role:record',
      '--dry-run',
    ], {
      OPL_STATE_DIR: stateRoot,
    }).runtime_operator_action_execution;
    assert.equal(dryRun.execution.execution_kind, 'opl_cli_codex_app_runtime_evidence_apply');
    assert.equal(dryRun.execution.execution_status, 'dry_run');
    assert.equal(
      dryRun.execution.result.codex_app_runtime_evidence_payload_preflight.status,
      'payload_required',
    );
    assert.equal(
      dryRun.execution.result.codex_app_runtime_evidence_payload_preflight
        .empty_payload_template_is_success_evidence,
      false,
    );

    const payload = {
      temporal_hosted_long_soak_refs: ['temporal-long-soak:codex-app/runtime-4h'],
      provider_state_linkage_refs: ['provider-state:temporal/cadence-current'],
      operator_evidence_refs: ['operator-window:codex-app/runtime-followthrough'],
    };
    const recordExecution = runCli([
      'runtime',
      'action',
      'execute',
      '--action',
      'codex_app_runtime_evidence:codex_app_runtime_role:record',
      '--payload',
      JSON.stringify(payload),
    ], {
      OPL_STATE_DIR: stateRoot,
    }).runtime_operator_action_execution;
    assert.equal(recordExecution.execution.execution_kind, 'opl_cli_codex_app_runtime_evidence_apply');
    assert.equal(recordExecution.execution.execution_status, 'executed');
    const recordOutput =
      recordExecution.execution.result.codex_app_runtime_evidence_ledger_record;
    assert.equal(recordOutput.status, 'recorded');
    assert.equal(recordOutput.recorded_receipt_count, 1);
    assert.equal(recordOutput.receipt_refs.length, 1);
    assert.equal(recordOutput.receipt_refs[0].startsWith('opl://codex-app-runtime-evidence/'), true);
    assert.equal(
      recordOutput.ledger_file,
      path.join(stateRoot, 'codex-app-runtime-evidence-ledger.json'),
    );
    assert.equal(recordOutput.receipts[0].authority_boundary.refs_only, true);
    assert.equal(recordOutput.receipts[0].authority_boundary.can_close_long_soak, false);
    assert.equal(recordOutput.receipts[0].authority_boundary.can_claim_production_ready, false);

    const listOutput = runCli(['runtime', 'codex-app-runtime-evidence', 'list'], {
      OPL_STATE_DIR: stateRoot,
    }).codex_app_runtime_evidence_ledger;
    assert.equal(listOutput.receipt_count, 1);
    assert.equal(listOutput.authority_boundary.can_close_long_soak, false);

    const pending = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], {
      OPL_STATE_DIR: stateRoot,
    }).app_operator_drilldown;
    assert.equal(pending.summary.codex_app_runtime_evidence_action_route_count, 1);
    assert.equal(pending.summary.codex_app_runtime_evidence_record_action_route_count, 0);
    assert.equal(pending.summary.codex_app_runtime_evidence_verify_action_route_count, 1);
    assert.equal(pending.summary.codex_app_runtime_evidence_pending_verify_receipt_ref_count, 1);
    assert.equal(pending.summary.codex_app_runtime_evidence_verified_ledger_receipt_ref_count, 0);
    assert.equal(pending.summary.codex_app_runtime_evidence_open_gate_count, 1);
    assert.equal(pending.summary.codex_app_production_evidence_gate_remains_open, true);

    const pendingFollowthrough =
      pending.attention_first_payload.codex_app_runtime_role.production_evidence_followthrough;
    assert.equal(pendingFollowthrough.status, 'long_soak_gate_verify_pending');
    assert.equal(pendingFollowthrough.evidence_ledger_status, 'ledger_refs_recorded_verify_pending');
    assert.deepEqual(pendingFollowthrough.pending_verify_receipt_refs, recordOutput.receipt_refs);
    const verifyRoute = pending.operator_action_routing_refs.refs.find(
      (ref: { action_id: string }) =>
        ref.action_id === 'codex_app_runtime_evidence:codex_app_runtime_role:verify',
    );
    assert.equal(verifyRoute.action_kind, 'codex_app_runtime_evidence_receipt_verify');
    assert.equal(verifyRoute.route_requires_domain_or_app_payload, false);
    assert.equal(verifyRoute.can_close_without_domain_or_app_payload, true);
    assert.equal(verifyRoute.authority_boundary.can_claim_production_ready, false);

    const verifyExecution = runCli([
      'runtime',
      'action',
      'execute',
      '--action',
      'codex_app_runtime_evidence:codex_app_runtime_role:verify',
    ], {
      OPL_STATE_DIR: stateRoot,
    }).runtime_operator_action_execution;
    assert.equal(verifyExecution.execution.execution_kind, 'opl_cli_codex_app_runtime_evidence_apply');
    assert.equal(
      verifyExecution.execution.result.codex_app_runtime_evidence_ledger_verify.status,
      'verified',
    );

    const verified = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], {
      OPL_STATE_DIR: stateRoot,
    }).app_operator_drilldown;
    assert.equal(verified.summary.codex_app_runtime_evidence_action_route_count, 0);
    assert.equal(verified.summary.codex_app_runtime_evidence_open_gate_count, 0);
    assert.equal(verified.summary.codex_app_runtime_evidence_verified_ledger_receipt_ref_count, 1);
    assert.equal(verified.summary.codex_app_production_long_soak_claimed, false);
    assert.equal(verified.summary.codex_app_production_evidence_gate_remains_open, false);
    assert.equal(
      verified.attention_first_payload.codex_app_runtime_role.production_evidence_followthrough.status,
      'long_soak_refs_observed',
    );
    assert.equal(
      verified.attention_first_payload.codex_app_runtime_role.production_evidence_followthrough
        .refs_observed_for_all_gates,
      true,
    );
    assert.equal(
      verified.attention_first_payload.codex_app_runtime_role.production_evidence_followthrough
        .authority_boundary.can_close_long_soak,
      false,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('runtime Codex App runtime evidence typed blocker refs keep the long-soak gate open', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-codex-app-runtime-blocker-state-'));
  try {
    const recordOutput = runCli([
      'runtime',
      'codex-app-runtime-evidence',
      'record',
      '--payload',
      JSON.stringify({
        typed_blocker_refs: ['typed-blocker:codex-app-runtime/temporal-long-soak-owner-pending'],
      }),
    ], {
      OPL_STATE_DIR: stateRoot,
    }).codex_app_runtime_evidence_ledger_record;
    assert.equal(recordOutput.status, 'recorded');

    const summary = runCli(['runtime', 'app-operator-drilldown'], {
      OPL_STATE_DIR: stateRoot,
    }).app_operator_drilldown;
    assert.equal(summary.summary.codex_app_runtime_evidence_open_gate_count, 1);
    assert.equal(summary.summary.codex_app_runtime_evidence_typed_blocker_ref_count, 1);
    assert.equal(summary.summary.codex_app_production_evidence_gate_remains_open, true);

    const followthrough =
      summary.attention_first_payload.codex_app_runtime_role.production_evidence_followthrough;
    assert.equal(followthrough.status, 'long_soak_gate_open');
    assert.equal(followthrough.blocked_by_typed_blocker_refs, true);
    assert.equal(followthrough.refs_observed_for_all_gates, false);
    assert.equal(followthrough.production_long_soak_claimed, false);
    assert.equal(followthrough.authority_boundary.can_claim_production_ready, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
