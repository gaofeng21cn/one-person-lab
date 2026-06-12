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
    });
    assert.equal(
      initialRecordRoute.payload_workorder.surface_kind,
      'opl_app_release_user_path_evidence_payload_workorder',
    );
    assert.equal(
      initialRecordRoute.payload_workorder.accepted_payload_path_policy,
      'same_cohort_release_user_path_refs_release_owner_verdict_or_typed_blocker_path_empty_template_blocks',
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
    assert.equal(
      initialRecordRoute.payload_workorder.accepted_payload_paths
        .typed_blocker_path.success_claimed,
      false,
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

test('runtime App release evidence long-operator start writes a workorder without closing evidence', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-release-long-operator-state-'));
  try {
    const evidenceDir = path.join(stateRoot, 'long-operator-start');
    const startOutput = runCli([
      'runtime',
      'app-release-evidence',
      'long-operator',
      'start',
      '--cohort',
      '26.5.19',
      '--minimum-duration-minutes',
      '60',
      '--evidence-dir',
      evidenceDir,
    ], {
      OPL_STATE_DIR: stateRoot,
    }).app_release_long_operator_observation_start;

    assert.equal(startOutput.status, 'started');
    assert.equal(startOutput.cohort_id, 'app-release-cohort:26.5.19');
    assert.equal(startOutput.release_version, '26.5.19');
    assert.equal(startOutput.minimum_duration_minutes, 60);
    assert.deepEqual(startOutput.long_operator_evidence_refs, []);
    assert.equal(startOutput.record_payload_file, null);
    assert.equal(startOutput.authority_boundary.can_claim_release_ready, false);
    assert.equal(startOutput.authority_boundary.can_claim_production_ready, false);
    assert.equal(startOutput.authority_boundary.can_close_app_release_user_path, false);
    assert.equal(fs.existsSync(startOutput.workorder_file), true);
    assert.equal(fs.existsSync(startOutput.operator_log_file), true);

    const listOutput = runCli(['runtime', 'app-release-evidence', 'list'], {
      OPL_STATE_DIR: stateRoot,
    }).app_release_user_path_evidence_ledger;
    assert.equal(listOutput.receipt_count, 0);

    const drilldown = runCli(['runtime', 'app-operator-drilldown'], {
      OPL_STATE_DIR: stateRoot,
    }).app_operator_drilldown;
    assert.equal(drilldown.summary.app_release_user_path_evidence_open_gate_count, 5);
    assert.equal(drilldown.summary.app_release_user_path_evidence_ledger_receipt_ref_count, 0);
    assert.equal(drilldown.summary.app_release_user_path_production_ready_claimed, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('runtime App release evidence long-operator finish materializes a record payload after the observation window', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-release-long-operator-finish-state-'));
  try {
    const evidenceDir = path.join(stateRoot, 'long-operator-finish');
    const startOutput = runCli([
      'runtime',
      'app-release-evidence',
      'long-operator',
      'start',
      '--cohort',
      '26.5.19',
      '--minimum-duration-minutes',
      '60',
      '--evidence-dir',
      evidenceDir,
    ], {
      OPL_STATE_DIR: stateRoot,
    }).app_release_long_operator_observation_start;

    const workorder = JSON.parse(fs.readFileSync(startOutput.workorder_file, 'utf8'));
    fs.writeFileSync(
      startOutput.workorder_file,
      `${JSON.stringify({
        ...workorder,
        started_at: '2026-05-24T00:00:00.000Z',
        earliest_finish_at: '2026-05-24T01:00:00.000Z',
      }, null, 2)}\n`,
    );
    fs.writeFileSync(
      startOutput.operator_log_file,
      [
        { event_kind: 'app_window_reopened_or_kept_live', observed_at: '2026-05-24T00:05:00.000Z' },
        { event_kind: 'reload_prompt_path_exercised_or_confirmed_not_required', observed_at: '2026-05-24T00:10:00.000Z' },
        { event_kind: 'provider_state_linkage_checked', observed_at: '2026-05-24T00:30:00.000Z' },
        { event_kind: 'operator_continuity_window_observed', observed_at: '2026-05-24T01:05:00.000Z' },
      ].map((entry) => JSON.stringify(entry)).join('\n') + '\n',
    );

    const finishOutput = runCli([
      'runtime',
      'app-release-evidence',
      'long-operator',
      'finish',
      '--workorder-file',
      startOutput.workorder_file,
      '--finished-at',
      '2026-05-24T01:10:00.000Z',
    ], {
      OPL_STATE_DIR: stateRoot,
    }).app_release_long_operator_observation_finish;

    assert.equal(finishOutput.status, 'evidence_ready');
    assert.equal(finishOutput.cohort_id, 'app-release-cohort:26.5.19');
    assert.equal(finishOutput.elapsed_minutes >= 60, true);
    assert.equal(finishOutput.required_event_kinds_observed, true);
    assert.equal(finishOutput.long_operator_evidence_refs.length, 1);
    assert.equal(
      finishOutput.long_operator_evidence_refs[0].startsWith(
        'long_operator_evidence_ref://one-person-lab-app/26.5.19/operator-window/',
      ),
      true,
    );
    assert.match(finishOutput.long_operator_evidence_refs[0], /[?&]path=/);
    assert.match(finishOutput.long_operator_evidence_refs[0], /[?&]sha256=[0-9a-f]{64}/);
    assert.match(finishOutput.operator_log_sha256, /^[0-9a-f]{64}$/);
    assert.match(finishOutput.manifest_sha256, /^[0-9a-f]{64}$/);
    assert.equal(fs.existsSync(finishOutput.manifest_file), true);
    assert.equal(fs.existsSync(finishOutput.record_payload_file), true);
    assert.equal(finishOutput.authority_boundary.can_claim_release_ready, false);
    assert.equal(finishOutput.authority_boundary.can_claim_production_ready, false);

    const payload = JSON.parse(fs.readFileSync(finishOutput.record_payload_file, 'utf8'));
    assert.deepEqual(payload.long_operator_evidence_refs, finishOutput.long_operator_evidence_refs);

    const recordOutput = runCli([
      'runtime',
      'app-release-evidence',
      'record',
      '--payload-file',
      finishOutput.record_payload_file,
    ], {
      OPL_STATE_DIR: stateRoot,
    }).app_release_user_path_evidence_ledger_record;
    assert.equal(recordOutput.status, 'recorded');
    assert.deepEqual(
      recordOutput.receipts[0].long_operator_evidence_refs,
      finishOutput.long_operator_evidence_refs,
    );
    assert.equal(recordOutput.receipts[0].authority_boundary.can_claim_production_ready, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('runtime App release evidence long-operator event command records constrained operator events', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-release-long-operator-event-state-'));
  try {
    const evidenceDir = path.join(stateRoot, 'long-operator-event');
    const startOutput = runCli([
      'runtime',
      'app-release-evidence',
      'long-operator',
      'start',
      '--cohort',
      '26.5.19',
      '--minimum-duration-minutes',
      '60',
      '--evidence-dir',
      evidenceDir,
    ], {
      OPL_STATE_DIR: stateRoot,
    }).app_release_long_operator_observation_start;

    const workorder = JSON.parse(fs.readFileSync(startOutput.workorder_file, 'utf8'));
    fs.writeFileSync(
      startOutput.workorder_file,
      `${JSON.stringify({
        ...workorder,
        started_at: '2026-05-24T00:00:00.000Z',
        earliest_finish_at: '2026-05-24T01:00:00.000Z',
      }, null, 2)}\n`,
    );
    const eventKinds = [
      'app_window_reopened_or_kept_live',
      'reload_prompt_path_exercised_or_confirmed_not_required',
      'provider_state_linkage_checked',
      'operator_continuity_window_observed',
    ];
    for (const [index, eventKind] of eventKinds.entries()) {
      const eventOutput = runCli([
        'runtime',
        'app-release-evidence',
        'long-operator',
        'event',
        '--workorder-file',
        startOutput.workorder_file,
        '--event-kind',
        eventKind,
        '--observed-at',
        `2026-05-24T00:${String((index + 1) * 10).padStart(2, '0')}:00.000Z`,
        '--evidence-ref',
        `operator-evidence:app-release/${eventKind}`,
      ], {
        OPL_STATE_DIR: stateRoot,
      }).app_release_long_operator_observation_event_record;
      assert.equal(eventOutput.status, 'recorded');
      assert.equal(eventOutput.event.event_kind, eventKind);
      assert.equal(eventOutput.event.authority_boundary.can_claim_production_ready, false);
      assert.deepEqual(eventOutput.long_operator_evidence_refs, []);
      assert.equal(eventOutput.record_payload_file, null);
    }

    const operatorLog = fs.readFileSync(startOutput.operator_log_file, 'utf8')
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line));
    assert.deepEqual(operatorLog.map((event) => event.event_kind), eventKinds);
    assert.deepEqual(operatorLog.map((event) => event.evidence_ref), eventKinds.map(
      (eventKind) => `operator-evidence:app-release/${eventKind}`,
    ));

    const finishOutput = runCli([
      'runtime',
      'app-release-evidence',
      'long-operator',
      'finish',
      '--workorder-file',
      startOutput.workorder_file,
      '--finished-at',
      '2026-05-24T01:05:00.000Z',
    ], {
      OPL_STATE_DIR: stateRoot,
    }).app_release_long_operator_observation_finish;
    assert.equal(finishOutput.status, 'evidence_ready');
    assert.deepEqual(finishOutput.observed_event_kinds, eventKinds.sort());
    assert.equal(fs.existsSync(finishOutput.record_payload_file), true);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('runtime App release evidence long-operator event rejects unknown event kinds', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-release-long-operator-event-invalid-state-'));
  try {
    const startOutput = runCli([
      'runtime',
      'app-release-evidence',
      'long-operator',
      'start',
      '--cohort',
      '26.5.19',
      '--minimum-duration-minutes',
      '60',
      '--evidence-dir',
      path.join(stateRoot, 'long-operator-event-invalid'),
    ], {
      OPL_STATE_DIR: stateRoot,
    }).app_release_long_operator_observation_start;

    assert.throws(
      () => runCli([
        'runtime',
        'app-release-evidence',
        'long-operator',
        'event',
        '--workorder-file',
        startOutput.workorder_file,
        '--event-kind',
        'freeform_operator_note',
      ], {
        OPL_STATE_DIR: stateRoot,
      }),
      /event_kind must be one of:/,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('runtime App release evidence long-operator finish blocks before minimum duration', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-release-long-operator-blocked-state-'));
  try {
    const evidenceDir = path.join(stateRoot, 'long-operator-blocked');
    const startOutput = runCli([
      'runtime',
      'app-release-evidence',
      'long-operator',
      'start',
      '--cohort',
      '26.5.19',
      '--minimum-duration-minutes',
      '60',
      '--evidence-dir',
      evidenceDir,
    ], {
      OPL_STATE_DIR: stateRoot,
    }).app_release_long_operator_observation_start;
    fs.writeFileSync(
      startOutput.operator_log_file,
      [
        { event_kind: 'app_window_reopened_or_kept_live' },
        { event_kind: 'reload_prompt_path_exercised_or_confirmed_not_required' },
        { event_kind: 'provider_state_linkage_checked' },
        { event_kind: 'operator_continuity_window_observed' },
      ].map((entry) => JSON.stringify(entry)).join('\n') + '\n',
    );

    const finishOutput = runCli([
      'runtime',
      'app-release-evidence',
      'long-operator',
      'finish',
      '--workorder-file',
      startOutput.workorder_file,
      '--finished-at',
      startOutput.started_at,
    ], {
      OPL_STATE_DIR: stateRoot,
    }).app_release_long_operator_observation_finish;

    assert.equal(finishOutput.status, 'blocked');
    assert.equal(finishOutput.blocker.blocker_id, 'app_release_long_operator_minimum_duration_not_satisfied');
    assert.deepEqual(finishOutput.long_operator_evidence_refs, []);
    assert.equal(finishOutput.record_payload_file, null);
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
