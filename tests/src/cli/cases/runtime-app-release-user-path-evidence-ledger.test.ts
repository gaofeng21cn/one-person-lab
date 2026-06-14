import {
  assert,
  fs,
  os,
  path,
  runCli,
  runCliFailure,
  test,
} from '../helpers.ts';

test('runtime App release evidence CLI records refs-only user-path evidence without readiness claims', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-release-evidence-state-'));
  try {
    const initial = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], {
      OPL_STATE_DIR: stateRoot,
    }).app_operator_drilldown;
    assert.equal(initial.summary.app_release_user_path_evidence_open_gate_count, 5);
    assert.equal(initial.summary.app_release_user_path_evidence_ledger_receipt_ref_count, 0);
    assert.equal(
      initial.summary.app_release_user_path_evidence_pending_verify_receipt_ref_count,
      0,
    );
    assert.equal(initial.summary.app_release_user_path_evidence_action_route_count, 1);
    assert.equal(initial.summary.app_release_user_path_evidence_record_action_route_count, 1);
    assert.equal(initial.summary.app_release_user_path_evidence_verify_action_route_count, 0);
    const initialRecordRoute = initial.operator_action_routing_refs.refs.find(
      (ref: { action_id: string }) =>
        ref.action_id === 'app_release_user_path_evidence:one_person_lab_app_release_user_path:record',
    );
    assert.equal(initialRecordRoute.action_kind, 'app_release_user_path_evidence_receipt_record');
    assert.equal(initialRecordRoute.owner, 'opl');
    assert.equal(initialRecordRoute.route_target_kind, 'opl_cli');
    assert.equal(initialRecordRoute.execution_policy, 'opl_safe_action_shell');
    assert.equal(initialRecordRoute.execution_surface, 'opl runtime action execute');
    assert.equal(initialRecordRoute.route_requires_domain_or_app_payload, true);
    assert.equal(initialRecordRoute.can_close_without_domain_or_app_payload, false);
    assert.equal(initialRecordRoute.payload_owner, 'app_live_operator_or_release_owner');
    assert.deepEqual(initialRecordRoute.payload_template, {
      release_package_refs: [],
      screenshot_refs: [],
      reload_prompt_user_path_refs: [],
      provider_state_linkage_refs: [],
      long_operator_evidence_refs: [],
      release_owner_receipt_refs: [],
      install_evidence_refs: [],
      typed_blocker_refs: [],
      owner_acceptance_refs: [],
    });
    assert.equal(
      initialRecordRoute.payload_workorder.surface_kind,
      'opl_app_release_user_path_evidence_payload_workorder',
    );
    assert.equal(
      initialRecordRoute.payload_workorder.accepted_payload_path_policy,
      'same_cohort_release_user_path_refs_release_owner_verdict_owner_acceptance_or_typed_blocker_path_empty_template_blocks',
    );
    assert.equal(
      initialRecordRoute.payload_workorder.accepted_payload_paths
        .app_release_user_path_refs_path.closes_release_ready,
      false,
    );
    assert.equal(
      initialRecordRoute.payload_workorder.accepted_payload_paths
        .release_owner_verdict_path.success_claimed_by_opl,
      false,
    );
    assert.deepEqual(
      initialRecordRoute.payload_workorder.accepted_payload_paths
        .release_owner_verdict_path.required_any_operator_payload_refs,
      ['release_owner_receipt_refs', 'install_evidence_refs'],
    );
    assert.equal(
      initialRecordRoute.payload_workorder.accepted_payload_paths
        .app_release_user_path_refs_path.required_any_operator_payload_refs.includes(
          'install_evidence_refs',
        ),
      false,
    );
    assert.equal(
      initialRecordRoute.payload_workorder.accepted_payload_paths
        .typed_blocker_path.success_claimed,
      false,
    );
    assert.deepEqual(
      initialRecordRoute.payload_workorder.accepted_payload_paths
        .owner_acceptance_path.required_operator_payload_refs,
      ['owner_acceptance_refs'],
    );
    assert.equal(
      initialRecordRoute.payload_workorder.accepted_payload_paths
        .owner_acceptance_path.success_claimed_by_opl,
      false,
    );
    assert.equal(
      initialRecordRoute.payload_workorder.accepted_payload_paths
        .owner_acceptance_path.closes_app_release_user_path,
      false,
    );
    assert.equal(
      initialRecordRoute.payload_workorder.accepted_payload_paths
        .owner_acceptance_path.closes_release_ready,
      false,
    );
    assert.equal(
      initialRecordRoute.payload_workorder.accepted_payload_paths
        .owner_acceptance_path.closes_production_ready,
      false,
    );
    assert.equal(
      initialRecordRoute.payload_workorder.required_operator_payload_refs.includes(
        'owner_acceptance_refs',
      ),
      true,
    );
    assert.equal(
      initialRecordRoute.payload_workorder.required_return_shapes.includes(
        'owner_acceptance_ref',
      ),
      true,
    );
    assert.deepEqual(
      initialRecordRoute.payload_ref_hints.owner_acceptance_refs_should_cover,
      ['owner_acceptance_ref'],
    );
    assert.deepEqual(initialRecordRoute.payload_workorder.typed_blocker_path_payload, {
      typed_blocker_refs: [],
      applies_to_open_gate_ids: [
        'release_package_refs',
        'screenshot_refs',
        'reload_prompt_user_path_refs',
        'provider_state_linkage_refs',
        'long_operator_evidence_refs',
      ],
      payload_owner: 'app_live_operator_or_release_owner',
      success_claimed: false,
      closes_app_release_user_path: false,
      closes_release_ready: false,
      closes_production_ready: false,
    });
    assert.equal(initialRecordRoute.payload_workorder.authority_boundary.refs_only, true);
    assert.equal(
      initialRecordRoute.payload_workorder.authority_boundary.can_create_owner_receipt,
      false,
    );
    assert.equal(
      initialRecordRoute.payload_workorder.authority_boundary.can_generate_typed_blocker,
      false,
    );
    assert.equal(
      initialRecordRoute.payload_workorder.authority_boundary.can_claim_release_ready,
      false,
    );
    assert.equal(
      initialRecordRoute.payload_workorder.authority_boundary.can_close_app_release_user_path,
      false,
    );
    assert.equal(initialRecordRoute.empty_payload_template_is_success_evidence, false);
    assert.deepEqual(
      initialRecordRoute.copyable_runtime_action_execute_commands.record_with_payload,
      [
        'runtime',
        'action',
        'execute',
        '--action',
        'app_release_user_path_evidence:one_person_lab_app_release_user_path:record',
        '--payload-file',
        '<payload.json>',
      ],
    );
    assert.equal(initialRecordRoute.authority_boundary.can_write_domain_truth, false);
    assert.equal(initialRecordRoute.authority_boundary.can_create_owner_receipt, false);
    assert.equal(initialRecordRoute.authority_boundary.can_claim_release_ready, false);
    assert.equal(initialRecordRoute.authority_boundary.can_claim_production_ready, false);
    assert.equal(initialRecordRoute.authority_boundary.can_close_app_release_user_path, false);
    assert.equal(
      initial.app_execution_bridge.safe_action_routes.some(
        (ref: { action_id: string; can_submit_to_safe_action_shell: boolean }) =>
          ref.action_id === initialRecordRoute.action_id && ref.can_submit_to_safe_action_shell,
      ),
      true,
    );

    const dryRun = runCli([
      'runtime',
      'action',
      'execute',
      '--action',
      'app_release_user_path_evidence:one_person_lab_app_release_user_path:record',
      '--dry-run',
    ], {
      OPL_STATE_DIR: stateRoot,
    }).runtime_operator_action_execution;
    assert.equal(dryRun.execution.execution_kind, 'opl_cli_app_release_user_path_evidence_apply');
    assert.equal(dryRun.execution.execution_status, 'dry_run');
    assert.equal(
      dryRun.execution.result.app_release_user_path_evidence_payload_preflight.status,
      'payload_required',
    );
    assert.equal(
      dryRun.execution.result.app_release_user_path_evidence_payload_preflight
        .empty_payload_template_is_success_evidence,
      false,
    );

    const mixedPayloadExecution = runCliFailure([
      'runtime',
      'action',
      'execute',
      '--action',
      'app_release_user_path_evidence:one_person_lab_app_release_user_path:record',
      '--payload',
      JSON.stringify({
        release_package_refs: ['release:package/app-v0.1.0.dmg'],
        typed_blocker_refs: ['typed-blocker:app-release/screenshot-missing'],
      }),
    ], {
      OPL_STATE_DIR: stateRoot,
    });
    assert.equal(mixedPayloadExecution.payload.error.code, 'cli_usage_error');
    assert.equal(
      mixedPayloadExecution.payload.error.details.error_kind,
      'app_release_user_path_evidence_payload_preflight_blocked',
    );
    assert.equal(
      mixedPayloadExecution.payload.error.details.preflight.selected_payload_path,
      'blocked',
    );
    assert.deepEqual(
      mixedPayloadExecution.payload.error.details.preflight.conflicting_payload_fields,
      ['app_release_user_path_refs', 'typed_blocker_refs'],
    );
    assert.equal(mixedPayloadExecution.payload.error.details.receipt_recorded, false);

    const directMixedPayloadExecution = runCliFailure([
      'runtime',
      'app-release-evidence',
      'record',
      '--payload',
      JSON.stringify({
        release_owner_receipt_refs: ['release-owner:app/release-verdict'],
        typed_blocker_refs: ['typed-blocker:app-release/screenshot-missing'],
      }),
    ], {
      OPL_STATE_DIR: stateRoot,
    });
    assert.equal(directMixedPayloadExecution.payload.error.code, 'cli_usage_error');
    assert.equal(
      directMixedPayloadExecution.payload.error.details.error_kind,
      'app_release_user_path_evidence_payload_preflight_blocked',
    );
    assert.equal(
      directMixedPayloadExecution.payload.error.details.preflight.selected_payload_path,
      'blocked',
    );
    assert.deepEqual(
      directMixedPayloadExecution.payload.error.details.preflight.conflicting_payload_fields,
      ['release_owner_receipt_refs', 'typed_blocker_refs'],
    );
    assert.equal(directMixedPayloadExecution.payload.error.details.receipt_recorded, false);

    const ownerAcceptanceMixedPayloadExecution = runCliFailure([
      'runtime',
      'app-release-evidence',
      'record',
      '--payload',
      JSON.stringify({
        owner_acceptance_refs: ['owner-acceptance:app-release/26.5.19/operator-accepted'],
        release_owner_receipt_refs: ['release-owner:app/release-verdict'],
      }),
    ], {
      OPL_STATE_DIR: stateRoot,
    });
    assert.equal(ownerAcceptanceMixedPayloadExecution.payload.error.code, 'cli_usage_error');
    assert.equal(
      ownerAcceptanceMixedPayloadExecution.payload.error.details.error_kind,
      'app_release_user_path_evidence_payload_preflight_blocked',
    );
    assert.deepEqual(
      ownerAcceptanceMixedPayloadExecution.payload.error.details.preflight
        .conflicting_payload_fields,
      ['release_owner_receipt_refs', 'owner_acceptance_refs'],
    );
    assert.equal(ownerAcceptanceMixedPayloadExecution.payload.error.details.receipt_recorded, false);

    const payload = {
      release_package_refs: ['release:package/app-v0.1.0.dmg'],
      screenshot_refs: ['screenshot:app/first-run.png'],
      reload_prompt_user_path_refs: ['user-path:reload-prompt/first-run'],
      provider_state_linkage_refs: ['provider-state:temporal/cadence-linked'],
      long_operator_evidence_refs: ['long-operator:app/soak-4h'],
    };
    const recordExecution = runCli([
      'runtime',
      'action',
      'execute',
      '--action',
      'app_release_user_path_evidence:one_person_lab_app_release_user_path:record',
      '--payload',
      JSON.stringify(payload),
    ], {
      OPL_STATE_DIR: stateRoot,
    }).runtime_operator_action_execution;

    assert.equal(recordExecution.execution.execution_kind, 'opl_cli_app_release_user_path_evidence_apply');
    assert.equal(recordExecution.execution.execution_status, 'executed');
    assert.equal(recordExecution.authority_boundary.can_write_domain_truth, false);
    const recordOutput =
      recordExecution.execution.result.app_release_user_path_evidence_ledger_record;
    assert.equal(recordOutput.status, 'recorded');
    assert.equal(recordOutput.recorded_receipt_count, 1);
    assert.equal(recordOutput.receipt_refs.length, 1);
    assert.equal(
      recordOutput.receipt_refs[0].startsWith('opl://app-release-user-path-evidence/'),
      true,
    );
    assert.equal(
      recordOutput.ledger_file,
      path.join(stateRoot, 'app-release-user-path-evidence-ledger.json'),
    );
    assert.equal(recordOutput.receipts[0].authority_boundary.refs_only, true);
    assert.equal(recordOutput.receipts[0].authority_boundary.can_claim_release_ready, false);
    assert.equal(recordOutput.receipts[0].authority_boundary.can_claim_production_ready, false);
    assert.equal(recordOutput.receipts[0].authority_boundary.can_close_app_release_user_path, false);

    const listOutput = runCli(['runtime', 'app-release-evidence', 'list'], {
      OPL_STATE_DIR: stateRoot,
    }).app_release_user_path_evidence_ledger;
    assert.equal(listOutput.receipt_count, 1);
    assert.equal(listOutput.authority_boundary.refs_only, true);
    assert.equal(listOutput.authority_boundary.can_claim_production_ready, false);

    const summary = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], {
      OPL_STATE_DIR: stateRoot,
    }).app_operator_drilldown;
    assert.equal(summary.summary.app_release_user_path_evidence_gate_count, 5);
    assert.equal(summary.summary.app_release_user_path_evidence_open_gate_count, 5);
    assert.equal(summary.summary.app_release_user_path_evidence_ledger_receipt_ref_count, 1);
    assert.equal(
      summary.summary.app_release_user_path_evidence_recorded_ledger_receipt_ref_count,
      1,
    );
    assert.equal(
      summary.summary.app_release_user_path_evidence_verified_ledger_receipt_ref_count,
      0,
    );
    assert.equal(
      summary.summary.app_release_user_path_evidence_pending_verify_receipt_ref_count,
      1,
    );
    assert.equal(summary.summary.app_release_user_path_evidence_action_route_count, 1);
    assert.equal(summary.summary.app_release_user_path_evidence_record_action_route_count, 0);
    assert.equal(summary.summary.app_release_user_path_evidence_verify_action_route_count, 1);
    assert.equal(summary.summary.app_release_user_path_production_user_path_ready, false);
    assert.equal(summary.summary.app_release_user_path_release_ready_claimed, false);
    assert.equal(summary.summary.app_release_user_path_production_ready_claimed, false);

    const evidence = summary.attention_first_payload.evidence_after_contract
      .app_release_user_path_evidence;
    assert.equal(evidence.status, 'app_release_user_path_evidence_open');
    assert.equal(evidence.refs_observed_for_all_gates, false);
    assert.equal(evidence.evidence_ledger_status, 'ledger_refs_recorded_verify_pending');
    assert.equal(evidence.pending_verify_receipt_ref_count, 1);
    assert.deepEqual(evidence.pending_verify_receipt_refs, recordOutput.receipt_refs);
    assert.deepEqual(evidence.open_gate_ids, [
      'release_package_refs',
      'screenshot_refs',
      'reload_prompt_user_path_refs',
      'provider_state_linkage_refs',
      'long_operator_evidence_refs',
    ]);
    assert.equal(evidence.production_user_path_ready, false);
    assert.equal(evidence.release_ready_claimed, false);
    assert.equal(evidence.production_ready_claimed, false);
    assert.equal(evidence.authority_boundary.can_close_app_release_user_path, false);
    assert.equal(
      evidence.release_owner_verdict_handoff.status,
      'waiting_for_same_cohort_user_path_evidence_or_typed_blocker',
    );
    assert.deepEqual(
      evidence.release_owner_verdict_handoff.observed_release_owner_receipt_refs,
      [],
    );
    assert.equal(evidence.release_owner_verdict_handoff.release_ready_authorized, false);
    assert.equal(
      evidence.release_owner_verdict_handoff.authority_boundary.can_create_owner_receipt,
      false,
    );
    const verifyRoute = summary.operator_action_routing_refs.refs.find(
      (ref: { action_id: string }) =>
        ref.action_id === 'app_release_user_path_evidence:one_person_lab_app_release_user_path:verify',
    );
    assert.equal(verifyRoute.action_kind, 'app_release_user_path_evidence_receipt_verify');
    assert.equal(verifyRoute.route_requires_domain_or_app_payload, false);
    assert.equal(verifyRoute.authority_boundary.can_claim_production_ready, false);
    const nextStep = summary.attention_first_payload.evidence_next_steps.items.find(
      (item: { step_kind: string }) => item.step_kind === 'app_release_user_path_evidence',
    );
    assert.equal(Boolean(nextStep), true);
    assert.equal(nextStep.status, 'app_release_user_path_evidence_open');
    assert.equal(nextStep.receipt_verification_required, true);
    assert.equal(nextStep.pending_verify_receipt_ref_count, 1);
    assert.equal(
      nextStep.verification_action_id,
      'app_release_user_path_evidence:one_person_lab_app_release_user_path:verify',
    );
    assert.equal(nextStep.can_close_without_domain_or_app_payload, true);
    assert.equal(nextStep.can_close_app_release_user_path, false);

    const verifyExecution = runCli([
      'runtime',
      'action',
      'execute',
      '--action',
      'app_release_user_path_evidence:one_person_lab_app_release_user_path:verify',
    ], {
      OPL_STATE_DIR: stateRoot,
    }).runtime_operator_action_execution;
    assert.equal(verifyExecution.execution.execution_kind, 'opl_cli_app_release_user_path_evidence_apply');
    assert.equal(
      verifyExecution.execution.result.app_release_user_path_evidence_ledger_verify.status,
      'verified',
    );
    assert.equal(
      verifyExecution.execution.result.app_release_user_path_evidence_ledger_verify
        .receipt.authority_boundary.can_claim_release_ready,
      false,
    );

    const verifiedSummary = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], {
      OPL_STATE_DIR: stateRoot,
    }).app_operator_drilldown;
    assert.equal(verifiedSummary.summary.app_release_user_path_evidence_action_route_count, 0);
    assert.equal(
      verifiedSummary.summary.app_release_user_path_evidence_pending_verify_receipt_ref_count,
      0,
    );
    assert.equal(
      verifiedSummary.summary.app_release_user_path_evidence_verified_ledger_receipt_ref_count,
      1,
    );
    assert.equal(
      verifiedSummary.attention_first_payload.evidence_after_contract
        .app_release_user_path_evidence.status,
      'app_release_user_path_evidence_refs_observed',
    );
    assert.equal(
      verifiedSummary.attention_first_payload.evidence_after_contract
        .app_release_user_path_evidence.release_owner_verdict_handoff.status,
      'release_owner_verdict_required',
    );
    assert.equal(
      verifiedSummary.attention_first_payload.evidence_after_contract
        .app_release_user_path_evidence.release_owner_verdict_handoff.owner_repo,
      '/Users/gaofeng/workspace/one-person-lab-app',
    );
    assert.deepEqual(
      verifiedSummary.attention_first_payload.evidence_after_contract
        .app_release_user_path_evidence.release_owner_verdict_handoff.accepted_ref_shapes,
      [
        'release_owner_receipt_ref',
        'install_evidence_ref',
        'typed_blocker_ref',
        'owner_acceptance_ref',
      ],
    );
    assert.equal(
      verifiedSummary.attention_first_payload.evidence_after_contract
        .app_release_user_path_evidence.evidence_ledger_status,
      'ledger_refs_verified',
    );
    assert.equal(
      verifiedSummary.attention_first_payload.evidence_next_steps.items.some(
        (item: { step_kind: string }) => item.step_kind === 'app_release_user_path_evidence',
      ),
      false,
    );
    assert.equal(verifiedSummary.summary.app_release_user_path_production_ready_claimed, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('runtime App release evidence CLI records release-owner acceptance refs without release-ready claims', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-release-owner-acceptance-state-'));
  try {
    const ownerAcceptanceRef = 'owner-acceptance:app-release/26.5.19/operator-accepted';
    const recordOutput = runCli([
      'runtime',
      'app-release-evidence',
      'record',
      '--payload',
      JSON.stringify({
        owner_acceptance_refs: [ownerAcceptanceRef],
      }),
    ], {
      OPL_STATE_DIR: stateRoot,
    }).app_release_user_path_evidence_ledger_record;

    assert.equal(recordOutput.status, 'recorded');
    assert.equal(recordOutput.receipts[0].receipt_path, 'release_owner_acceptance_path');
    assert.deepEqual(recordOutput.receipts[0].owner_acceptance_refs, [ownerAcceptanceRef]);
    assert.equal(recordOutput.receipts[0].authority_boundary.refs_only, true);
    assert.equal(recordOutput.receipts[0].authority_boundary.can_claim_release_ready, false);
    assert.equal(recordOutput.receipts[0].authority_boundary.can_claim_production_ready, false);
    assert.equal(recordOutput.receipts[0].authority_boundary.can_close_app_release_user_path, false);

    runCli([
      'runtime',
      'app-release-evidence',
      'verify',
      '--receipt-ref',
      recordOutput.receipt_refs[0],
    ], {
      OPL_STATE_DIR: stateRoot,
    });

    const listOutput = runCli(['runtime', 'app-release-evidence', 'list'], {
      OPL_STATE_DIR: stateRoot,
    }).app_release_user_path_evidence_ledger;
    assert.equal(listOutput.receipt_count, 1);
    assert.equal(listOutput.receipts[0].receipt_status, 'verified');
    assert.equal(listOutput.receipts[0].receipt_path, 'release_owner_acceptance_path');
    assert.deepEqual(listOutput.receipts[0].owner_acceptance_refs, [ownerAcceptanceRef]);
    assert.equal(listOutput.authority_boundary.can_claim_release_ready, false);

    const summary = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], {
      OPL_STATE_DIR: stateRoot,
    }).app_operator_drilldown;
    assert.equal(summary.summary.app_release_user_path_evidence_owner_acceptance_ref_count, 1);
    assert.equal(summary.summary.app_release_user_path_release_ready_claimed, false);
    assert.equal(summary.summary.app_release_user_path_production_ready_claimed, false);
    const evidence = summary.attention_first_payload.evidence_after_contract
      .app_release_user_path_evidence;
    assert.deepEqual(evidence.owner_acceptance_refs, [ownerAcceptanceRef]);
    assert.equal(evidence.owner_acceptance_ref_count, 1);
    assert.deepEqual(
      evidence.release_owner_verdict_handoff.observed_owner_acceptance_refs,
      [ownerAcceptanceRef],
    );
    assert.equal(
      evidence.release_owner_verdict_handoff.accepted_ref_shapes.includes('owner_acceptance_ref'),
      true,
    );
    assert.equal(
      evidence.release_owner_verdict_handoff.owner_acceptance_record_command.includes(
        'owner_acceptance_refs',
      ),
      true,
    );
    assert.equal(evidence.release_owner_verdict_handoff.release_ready_authorized, false);
    assert.equal(evidence.release_owner_verdict_handoff.production_ready_authorized, false);
    assert.equal(evidence.authority_boundary.can_claim_production_ready, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('runtime App release evidence CLI keeps typed blockers as open operator attention', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-release-evidence-blocker-state-'));
  try {
    const recordOutput = runCli([
      'runtime',
      'app-release-evidence',
      'record',
      '--payload',
      JSON.stringify({
        typed_blocker_refs: ['typed-blocker:app-release/reload-prompt-not-run'],
      }),
    ], {
      OPL_STATE_DIR: stateRoot,
    }).app_release_user_path_evidence_ledger_record;
    assert.equal(recordOutput.status, 'recorded');

    const summary = runCli(['runtime', 'app-operator-drilldown'], {
      OPL_STATE_DIR: stateRoot,
    }).app_operator_drilldown;
    assert.equal(summary.summary.app_release_user_path_evidence_open_gate_count, 5);
    assert.equal(summary.summary.app_release_user_path_evidence_ledger_receipt_ref_count, 1);
    assert.equal(summary.summary.app_release_user_path_evidence_pending_verify_receipt_ref_count, 1);
    assert.equal(summary.summary.app_release_user_path_evidence_typed_blocker_ref_count, 1);

    const evidence = summary.attention_first_payload.evidence_after_contract
      .app_release_user_path_evidence;
    assert.equal(evidence.status, 'app_release_user_path_evidence_open');
    assert.equal(evidence.evidence_ledger_status, 'ledger_refs_recorded_verify_pending');
    assert.equal(evidence.blocked_by_typed_blocker_refs, true);
    assert.equal(evidence.refs_observed_for_all_gates, false);
    assert.equal(evidence.production_user_path_ready, false);
    assert.equal(evidence.authority_boundary.can_close_app_release_user_path, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('runtime App release evidence CLI records release-owner verdict refs without release-ready claims', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-release-owner-verdict-state-'));
  try {
    const recordOutput = runCli([
      'runtime',
      'app-release-evidence',
      'record',
      '--payload',
      JSON.stringify({
        release_owner_receipt_refs: ['release_owner_receipt_ref://one-person-lab-app/26.5.19/verdict'],
      }),
    ], {
      OPL_STATE_DIR: stateRoot,
    }).app_release_user_path_evidence_ledger_record;

    assert.equal(recordOutput.status, 'recorded');
    assert.equal(recordOutput.receipts[0].receipt_path, 'release_owner_verdict_path');
    assert.deepEqual(recordOutput.receipts[0].release_owner_receipt_refs, [
      'release_owner_receipt_ref://one-person-lab-app/26.5.19/verdict',
    ]);
    assert.equal(recordOutput.receipts[0].authority_boundary.can_claim_release_ready, false);
    assert.equal(recordOutput.receipts[0].authority_boundary.can_claim_production_ready, false);

    runCli([
      'runtime',
      'app-release-evidence',
      'verify',
      '--receipt-ref',
      recordOutput.receipt_refs[0],
    ], {
      OPL_STATE_DIR: stateRoot,
    });

    const listOutput = runCli(['runtime', 'app-release-evidence', 'list'], {
      OPL_STATE_DIR: stateRoot,
    }).app_release_user_path_evidence_ledger;
    assert.equal(listOutput.receipts[0].receipt_status, 'verified');
    assert.equal(listOutput.receipts[0].receipt_path, 'release_owner_verdict_path');
    assert.equal(listOutput.authority_boundary.can_claim_release_ready, false);

    const summary = runCli(['runtime', 'app-operator-drilldown'], {
      OPL_STATE_DIR: stateRoot,
    }).app_operator_drilldown;
    const evidence = summary.attention_first_payload.evidence_after_contract
      .app_release_user_path_evidence;
    assert.equal(evidence.open_gate_count, 5);
    assert.equal(evidence.production_user_path_ready, false);
    assert.equal(evidence.release_ready_claimed, false);
    assert.equal(evidence.production_ready_claimed, false);
    assert.equal(
      evidence.release_owner_verdict_handoff.status,
      'waiting_for_same_cohort_user_path_evidence_or_typed_blocker',
    );
    assert.deepEqual(
      evidence.release_owner_verdict_handoff.observed_release_owner_receipt_refs,
      ['release_owner_receipt_ref://one-person-lab-app/26.5.19/verdict'],
    );
    assert.equal(evidence.release_owner_verdict_handoff.release_ready_authorized, false);
    assert.equal(
      evidence.release_owner_verdict_handoff.authority_boundary.can_claim_release_ready,
      false,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('runtime App release evidence CLI records install evidence as release-owner verdict path', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-release-install-evidence-state-'));
  try {
    const recordOutput = runCli([
      'runtime',
      'app-release-evidence',
      'record',
      '--payload',
      JSON.stringify({
        install_evidence_refs: ['install-evidence-ref://one-person-lab-app/26.5.19/clean-install'],
      }),
    ], {
      OPL_STATE_DIR: stateRoot,
    }).app_release_user_path_evidence_ledger_record;

    assert.equal(recordOutput.status, 'recorded');
    assert.equal(recordOutput.receipts[0].receipt_path, 'release_owner_verdict_path');
    assert.deepEqual(recordOutput.receipts[0].install_evidence_refs, [
      'install-evidence-ref://one-person-lab-app/26.5.19/clean-install',
    ]);

    const mixedOwnerVerdictRecord = runCli([
      'runtime',
      'app-release-evidence',
      'record',
      '--payload',
      JSON.stringify({
        release_owner_receipt_refs: ['release-owner:app/verdict'],
        install_evidence_refs: ['install-evidence-ref://one-person-lab-app/26.5.19/clean-install'],
      }),
    ], {
      OPL_STATE_DIR: stateRoot,
    }).app_release_user_path_evidence_ledger_record;
    assert.equal(mixedOwnerVerdictRecord.status, 'recorded');
    assert.equal(mixedOwnerVerdictRecord.receipts[0].receipt_path, 'release_owner_verdict_path');
    assert.equal(
      mixedOwnerVerdictRecord.receipts[0].authority_boundary.can_claim_release_ready,
      false,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('runtime App release evidence CLI accepts singular ref fields for operator payloads', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-release-evidence-singular-state-'));
  try {
    const recordOutput = runCli([
      'runtime',
      'app-release-evidence',
      'record',
      '--payload',
      JSON.stringify({
        release_package_ref: 'release:package/app-v0.1.0.dmg',
        screenshot_ref: 'screenshot:app/first-run.png',
        reload_prompt_user_path_ref: 'user-path:reload-prompt/first-run',
        provider_state_linkage_ref: 'provider-state:temporal/cadence-linked',
        long_operator_evidence_ref: 'long-operator:app/soak-4h',
      }),
    ], {
      OPL_STATE_DIR: stateRoot,
    }).app_release_user_path_evidence_ledger_record;
    assert.equal(recordOutput.status, 'recorded');
    assert.deepEqual(recordOutput.receipts[0].release_package_refs, [
      'release:package/app-v0.1.0.dmg',
    ]);
    assert.deepEqual(recordOutput.receipts[0].screenshot_refs, [
      'screenshot:app/first-run.png',
    ]);

    const summary = runCli(['runtime', 'app-operator-drilldown'], {
      OPL_STATE_DIR: stateRoot,
    }).app_operator_drilldown;
    assert.equal(summary.summary.app_release_user_path_evidence_open_gate_count, 5);
    assert.equal(summary.summary.app_release_user_path_evidence_pending_verify_receipt_ref_count, 1);
    assert.equal(summary.summary.app_release_user_path_production_ready_claimed, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('runtime App release evidence CLI records refs-only payload files', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-release-evidence-file-state-'));
  try {
    const payloadFile = path.join(stateRoot, 'app-release-evidence-payload.json');
    fs.writeFileSync(
      payloadFile,
      `${JSON.stringify({
        release_package_refs: ['release:package/app-v0.1.0.dmg'],
        screenshot_refs: ['screenshot:app/first-run.png'],
        reload_prompt_user_path_refs: ['user-path:reload-prompt/first-run'],
        provider_state_linkage_refs: ['provider-state:temporal/cadence-linked'],
        long_operator_evidence_refs: ['long-operator:app/soak-4h'],
      })}\n`,
    );

    const recordOutput = runCli([
      'runtime',
      'app-release-evidence',
      'record',
      '--payload-file',
      payloadFile,
    ], {
      OPL_STATE_DIR: stateRoot,
    }).app_release_user_path_evidence_ledger_record;

    assert.equal(recordOutput.status, 'recorded');
    assert.equal(recordOutput.recorded_receipt_count, 1);
    assert.equal(recordOutput.receipts[0].authority_boundary.refs_only, true);
    assert.equal(recordOutput.receipts[0].authority_boundary.can_claim_release_ready, false);
    assert.equal(recordOutput.receipts[0].authority_boundary.can_claim_production_ready, false);
    assert.equal(recordOutput.receipts[0].authority_boundary.can_close_app_release_user_path, false);

    const summary = runCli(['runtime', 'app-operator-drilldown'], {
      OPL_STATE_DIR: stateRoot,
    }).app_operator_drilldown;
    assert.equal(summary.summary.app_release_user_path_evidence_pending_verify_receipt_ref_count, 1);
    assert.equal(summary.summary.app_release_user_path_production_ready_claimed, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
