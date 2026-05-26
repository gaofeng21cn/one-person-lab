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

test('runtime Codex App runtime evidence long-soak start writes a workorder without closing evidence', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-codex-app-runtime-long-soak-start-state-'));
  try {
    const evidenceDir = path.join(stateRoot, 'codex-app-runtime-long-soak-start');
    const startOutput = runCli([
      'runtime',
      'codex-app-runtime-evidence',
      'long-soak',
      'start',
      '--minimum-duration-minutes',
      '60',
      '--evidence-dir',
      evidenceDir,
    ], {
      OPL_STATE_DIR: stateRoot,
    }).codex_app_runtime_long_soak_observation_start;

    assert.equal(startOutput.status, 'started');
    assert.equal(startOutput.target_surface, 'codex_app_runtime_role');
    assert.equal(startOutput.runtime_policy, 'opl_temporal_hosted_autonomous');
    assert.equal(startOutput.minimum_duration_minutes, 60);
    assert.deepEqual(startOutput.temporal_hosted_long_soak_refs, []);
    assert.deepEqual(startOutput.provider_state_linkage_refs, []);
    assert.deepEqual(startOutput.operator_evidence_refs, []);
    assert.equal(startOutput.record_payload_file, null);
    assert.equal(startOutput.authority_boundary.can_close_long_soak, false);
    assert.equal(startOutput.authority_boundary.can_claim_production_ready, false);
    assert.equal(startOutput.authority_boundary.can_drive_long_running_task_loop, false);
    assert.equal(fs.existsSync(startOutput.workorder_file), true);
    assert.equal(fs.existsSync(startOutput.operator_log_file), true);

    const listOutput = runCli(['runtime', 'codex-app-runtime-evidence', 'list'], {
      OPL_STATE_DIR: stateRoot,
    }).codex_app_runtime_evidence_ledger;
    assert.equal(listOutput.receipt_count, 0);

    const drilldown = runCli(['runtime', 'app-operator-drilldown'], {
      OPL_STATE_DIR: stateRoot,
    }).app_operator_drilldown;
    assert.equal(drilldown.summary.codex_app_runtime_evidence_open_gate_count, 1);
    assert.equal(drilldown.summary.codex_app_runtime_evidence_ledger_receipt_ref_count, 0);
    assert.equal(drilldown.summary.codex_app_production_long_soak_claimed, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('runtime Codex App runtime evidence long-soak finish materializes a record payload after the observation window', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-codex-app-runtime-long-soak-finish-state-'));
  try {
    const evidenceDir = path.join(stateRoot, 'codex-app-runtime-long-soak-finish');
    const startOutput = runCli([
      'runtime',
      'codex-app-runtime-evidence',
      'long-soak',
      'start',
      '--minimum-duration-minutes',
      '60',
      '--evidence-dir',
      evidenceDir,
    ], {
      OPL_STATE_DIR: stateRoot,
    }).codex_app_runtime_long_soak_observation_start;

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
      ['temporal_hosted_stage_or_worker_window_observed', '2026-05-24T00:05:00.000Z'],
      ['provider_state_linkage_checked', '2026-05-24T00:15:00.000Z'],
      ['codex_app_operator_observation_recorded', '2026-05-24T00:30:00.000Z'],
      ['operator_continuity_window_observed', '2026-05-24T01:05:00.000Z'],
    ];
    for (const [eventKind, observedAt] of eventKinds) {
      const eventOutput = runCli([
        'runtime',
        'codex-app-runtime-evidence',
        'long-soak',
        'event',
        '--workorder-file',
        startOutput.workorder_file,
        '--event-kind',
        eventKind,
        '--observed-at',
        observedAt,
        '--evidence-ref',
        `operator-evidence:codex-app-runtime/${eventKind}`,
      ], {
        OPL_STATE_DIR: stateRoot,
      }).codex_app_runtime_long_soak_observation_event;
      assert.equal(eventOutput.status, 'recorded');
      assert.deepEqual(eventOutput.temporal_hosted_long_soak_refs, []);
      assert.equal(eventOutput.record_payload_file, null);
      assert.equal(eventOutput.authority_boundary.can_claim_production_ready, false);
    }

    const finishOutput = runCli([
      'runtime',
      'codex-app-runtime-evidence',
      'long-soak',
      'finish',
      '--workorder-file',
      startOutput.workorder_file,
      '--finished-at',
      '2026-05-24T01:10:00.000Z',
    ], {
      OPL_STATE_DIR: stateRoot,
    }).codex_app_runtime_long_soak_observation_finish;

    assert.equal(finishOutput.status, 'evidence_ready');
    assert.equal(finishOutput.target_surface, 'codex_app_runtime_role');
    assert.equal(finishOutput.elapsed_minutes >= 60, true);
    assert.equal(finishOutput.required_event_kinds_observed, true);
    assert.equal(finishOutput.temporal_hosted_long_soak_refs.length, 1);
    assert.equal(
      finishOutput.temporal_hosted_long_soak_refs[0].startsWith(
        'temporal_hosted_long_soak_ref://one-person-lab/codex-app-runtime/operator-window/',
      ),
      true,
    );
    assert.equal(finishOutput.provider_state_linkage_refs.length, 1);
    assert.equal(finishOutput.operator_evidence_refs.length, 1);
    assert.match(finishOutput.operator_log_sha256, /^[0-9a-f]{64}$/);
    assert.match(finishOutput.manifest_sha256, /^[0-9a-f]{64}$/);
    assert.equal(fs.existsSync(finishOutput.manifest_file), true);
    assert.equal(fs.existsSync(finishOutput.record_payload_file), true);
    assert.equal(finishOutput.authority_boundary.can_close_long_soak, false);
    assert.equal(finishOutput.authority_boundary.can_claim_production_ready, false);

    const payload = JSON.parse(fs.readFileSync(finishOutput.record_payload_file, 'utf8'));
    assert.deepEqual(payload.temporal_hosted_long_soak_refs, finishOutput.temporal_hosted_long_soak_refs);
    assert.deepEqual(payload.provider_state_linkage_refs, finishOutput.provider_state_linkage_refs);
    assert.deepEqual(payload.operator_evidence_refs, finishOutput.operator_evidence_refs);

    const recordOutput = runCli([
      'runtime',
      'codex-app-runtime-evidence',
      'record',
      '--payload-file',
      finishOutput.record_payload_file,
    ], {
      OPL_STATE_DIR: stateRoot,
    }).codex_app_runtime_evidence_ledger_record;
    assert.equal(recordOutput.status, 'recorded');
    assert.deepEqual(
      recordOutput.receipts[0].temporal_hosted_long_soak_refs,
      finishOutput.temporal_hosted_long_soak_refs,
    );
    assert.equal(recordOutput.receipts[0].authority_boundary.can_close_long_soak, false);
    assert.equal(recordOutput.receipts[0].authority_boundary.can_claim_production_ready, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('runtime Codex App runtime evidence long-soak event rejects unknown event kinds', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-codex-app-runtime-long-soak-event-invalid-state-'));
  try {
    const startOutput = runCli([
      'runtime',
      'codex-app-runtime-evidence',
      'long-soak',
      'start',
      '--minimum-duration-minutes',
      '60',
      '--evidence-dir',
      path.join(stateRoot, 'codex-app-runtime-long-soak-event-invalid'),
    ], {
      OPL_STATE_DIR: stateRoot,
    }).codex_app_runtime_long_soak_observation_start;

    assert.throws(
      () => runCli([
        'runtime',
        'codex-app-runtime-evidence',
        'long-soak',
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

test('runtime Codex App runtime evidence long-soak finish blocks before minimum duration', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-codex-app-runtime-long-soak-blocked-state-'));
  try {
    const evidenceDir = path.join(stateRoot, 'codex-app-runtime-long-soak-blocked');
    const startOutput = runCli([
      'runtime',
      'codex-app-runtime-evidence',
      'long-soak',
      'start',
      '--minimum-duration-minutes',
      '60',
      '--evidence-dir',
      evidenceDir,
    ], {
      OPL_STATE_DIR: stateRoot,
    }).codex_app_runtime_long_soak_observation_start;
    for (const eventKind of [
      'temporal_hosted_stage_or_worker_window_observed',
      'provider_state_linkage_checked',
      'codex_app_operator_observation_recorded',
      'operator_continuity_window_observed',
    ]) {
      runCli([
        'runtime',
        'codex-app-runtime-evidence',
        'long-soak',
        'event',
        '--workorder-file',
        startOutput.workorder_file,
        '--event-kind',
        eventKind,
      ], {
        OPL_STATE_DIR: stateRoot,
      });
    }

    const finishOutput = runCli([
      'runtime',
      'codex-app-runtime-evidence',
      'long-soak',
      'finish',
      '--workorder-file',
      startOutput.workorder_file,
      '--finished-at',
      startOutput.started_at,
    ], {
      OPL_STATE_DIR: stateRoot,
    }).codex_app_runtime_long_soak_observation_finish;

    assert.equal(finishOutput.status, 'blocked');
    assert.equal(
      finishOutput.blocker.blocker_id,
      'codex_app_runtime_long_soak_minimum_duration_not_satisfied',
    );
    assert.deepEqual(finishOutput.temporal_hosted_long_soak_refs, []);
    assert.equal(finishOutput.record_payload_file, null);
    assert.equal(finishOutput.authority_boundary.can_claim_production_ready, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
