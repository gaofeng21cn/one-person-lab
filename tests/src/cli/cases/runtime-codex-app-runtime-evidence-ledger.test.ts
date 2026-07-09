import {
  assert,
  fs,
  os,
  parseJsonText,
  path,
  runCli,
  runCliFailure,
  test,
} from '../helpers.ts';

const appOperatorCommand = ['runtime', 'app-operator-drilldown'];
const appOperatorFullCommand = [...appOperatorCommand, '--detail', 'full'];

function withStateRoot(prefix: string, run: (stateRoot: string) => void): void {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  try {
    run(stateRoot);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
}

test('runtime Codex App runtime evidence records and verifies Temporal-hosted long-soak refs without readiness claims', () => withStateRoot('opl-codex-app-runtime-evidence-state-', (stateRoot) => {
    const env = { OPL_STATE_DIR: stateRoot };
    const initial = runCli(appOperatorFullCommand, env).app_operator_drilldown;
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
    assert.equal(
      recordRoute.payload_workorder.accepted_payload_paths
        .temporal_hosted_long_soak_refs_path.closes_long_soak,
      false,
    );
    assert.deepEqual(
      recordRoute.payload_workorder.accepted_payload_paths
        .temporal_hosted_long_soak_refs_path.required_operator_payload_refs,
      ['temporal_hosted_long_soak_refs'],
    );
    assert.deepEqual(
      recordRoute.payload_workorder.accepted_payload_paths
        .temporal_hosted_long_soak_refs_path.supplemental_operator_payload_refs,
      ['provider_state_linkage_refs', 'operator_evidence_refs'],
    );
    assert.deepEqual(
      recordRoute.payload_workorder.required_operator_payload_refs,
      ['temporal_hosted_long_soak_refs', 'typed_blocker_refs'],
    );
    assert.deepEqual(
      recordRoute.payload_workorder.supplemental_operator_payload_refs,
      ['provider_state_linkage_refs', 'operator_evidence_refs'],
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
    ], env).runtime_operator_action_execution;
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
    assert.deepEqual(
      dryRun.execution.result.codex_app_runtime_evidence_payload_preflight.required_any,
      ['temporal_hosted_long_soak_refs', 'typed_blocker_refs'],
    );
    assert.deepEqual(
      dryRun.execution.result.codex_app_runtime_evidence_payload_preflight.supplemental_refs,
      ['provider_state_linkage_refs', 'operator_evidence_refs'],
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
    ], env).runtime_operator_action_execution;
    assert.equal(recordExecution.execution.execution_kind, 'opl_cli_codex_app_runtime_evidence_apply');
    assert.equal(recordExecution.execution.execution_status, 'executed');
    const recordOutput =
      recordExecution.execution.result.codex_app_runtime_evidence_ledger_record;
    assert.equal(recordOutput.status, 'recorded');
    assert.equal(recordOutput.recorded_receipt_count, 1);
    assert.equal(recordOutput.receipt_refs.length, 1);
    assert.equal(recordOutput.receipt_refs[0].startsWith('opl://codex-app-runtime-evidence/'), true);
    assert.equal(recordOutput.receipts[0].authority_boundary.refs_only, true);
    assert.equal(recordOutput.receipts[0].authority_boundary.can_close_long_soak, false);
    assert.equal(recordOutput.receipts[0].authority_boundary.can_claim_production_ready, false);

    const listOutput = runCli(['runtime', 'codex-app-runtime-evidence', 'list'], env).codex_app_runtime_evidence_ledger;
    assert.equal(listOutput.receipt_count, 1);
    assert.equal(listOutput.authority_boundary.can_close_long_soak, false);

    const pending = runCli(appOperatorFullCommand, env).app_operator_drilldown;
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
    ], env).runtime_operator_action_execution;
    assert.equal(verifyExecution.execution.execution_kind, 'opl_cli_codex_app_runtime_evidence_apply');
    assert.equal(
      verifyExecution.execution.result.codex_app_runtime_evidence_ledger_verify.status,
      'verified',
    );

    const verified = runCli(appOperatorFullCommand, env).app_operator_drilldown;
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
}));

test('runtime Codex App runtime evidence CLI accepts singular ref fields for Temporal-hosted long-soak payloads', () => withStateRoot('opl-codex-app-runtime-singular-state-', (stateRoot) => {
    const env = { OPL_STATE_DIR: stateRoot };
    const recordOutput = runCli([
      'runtime',
      'codex-app-runtime-evidence',
      'record',
      '--payload',
      JSON.stringify({
        temporal_hosted_long_soak_ref: 'temporal-long-soak:codex-app/runtime-singular',
        provider_state_linkage_ref: 'provider-state:temporal/cadence-current',
        operator_evidence_ref: 'operator-window:codex-app/runtime-followthrough',
      }),
    ], env).codex_app_runtime_evidence_ledger_record;
    assert.equal(recordOutput.status, 'recorded');
    assert.deepEqual(recordOutput.receipts[0].temporal_hosted_long_soak_refs, [
      'temporal-long-soak:codex-app/runtime-singular',
    ]);
    assert.deepEqual(recordOutput.receipts[0].provider_state_linkage_refs, [
      'provider-state:temporal/cadence-current',
    ]);
    assert.deepEqual(recordOutput.receipts[0].operator_evidence_refs, [
      'operator-window:codex-app/runtime-followthrough',
    ]);

    const verifyOutput = runCli([
      'runtime',
      'codex-app-runtime-evidence',
      'verify',
    ], env).codex_app_runtime_evidence_ledger_verify;
    assert.equal(verifyOutput.status, 'verified');
    assert.equal(verifyOutput.receipt.receipt_status, 'verified');

    const verified = runCli(appOperatorFullCommand, env).app_operator_drilldown;
    const followthrough =
      verified.attention_first_payload.codex_app_runtime_role.production_evidence_followthrough;
    assert.equal(verified.summary.codex_app_runtime_evidence_open_gate_count, 0);
    assert.equal(verified.summary.codex_app_production_long_soak_claimed, false);
    assert.equal(verified.summary.codex_app_production_evidence_gate_remains_open, false);
    assert.equal(followthrough.status, 'long_soak_refs_observed');
    assert.equal(followthrough.refs_observed_for_all_gates, true);
    assert.equal(followthrough.production_long_soak_claimed, false);
    assert.equal(followthrough.authority_boundary.can_claim_production_ready, false);
    assert.equal(followthrough.authority_boundary.can_close_long_soak, false);
    assert.deepEqual(followthrough.temporal_hosted_long_soak_refs, [
      'temporal-long-soak:codex-app/runtime-singular',
    ]);
    assert.deepEqual(followthrough.provider_state_linkage_refs, [
      'provider-state:temporal/cadence-current',
    ]);
    assert.deepEqual(followthrough.operator_evidence_refs, [
      'operator-window:codex-app/runtime-followthrough',
    ]);
}));

test('runtime Codex App runtime evidence typed blocker refs keep the long-soak gate open', () => withStateRoot('opl-codex-app-runtime-blocker-state-', (stateRoot) => {
    const env = { OPL_STATE_DIR: stateRoot };
    const recordOutput = runCli([
      'runtime',
      'codex-app-runtime-evidence',
      'record',
      '--payload',
      JSON.stringify({
        typed_blocker_refs: ['typed-blocker:codex-app-runtime/temporal-long-soak-owner-pending'],
      }),
    ], env).codex_app_runtime_evidence_ledger_record;
    assert.equal(recordOutput.status, 'recorded');

    const summary = runCli(appOperatorCommand, env).app_operator_drilldown;
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
}));

test('runtime Codex App runtime evidence support refs alone do not close the Temporal long-soak gate', () => withStateRoot('opl-codex-app-runtime-support-only-state-', (stateRoot) => {
    const env = { OPL_STATE_DIR: stateRoot };
    const recordOutput = runCli([
      'runtime',
      'codex-app-runtime-evidence',
      'record',
      '--payload',
      JSON.stringify({
        provider_state_linkage_refs: ['provider-state:temporal/cadence-current'],
        operator_evidence_refs: ['operator-window:codex-app/runtime-followthrough'],
      }),
    ], env).codex_app_runtime_evidence_ledger_record;
    assert.equal(recordOutput.status, 'recorded');

    const verifyOutput = runCli([
      'runtime',
      'codex-app-runtime-evidence',
      'verify',
    ], env).codex_app_runtime_evidence_ledger_verify;
    assert.equal(verifyOutput.status, 'verified');

    const appView = runCli(appOperatorFullCommand, env).app_operator_drilldown;
    assert.equal(appView.summary.codex_app_runtime_evidence_open_gate_count, 1);
    assert.equal(appView.summary.codex_app_runtime_evidence_verified_ledger_receipt_ref_count, 1);
    assert.equal(appView.summary.codex_app_production_evidence_gate_remains_open, true);

    const followthrough =
      appView.attention_first_payload.codex_app_runtime_role.production_evidence_followthrough;
    assert.equal(followthrough.status, 'long_soak_gate_open');
    assert.equal(followthrough.refs_observed_for_all_gates, false);
    assert.deepEqual(followthrough.temporal_hosted_long_soak_refs, []);
    assert.deepEqual(
      followthrough.provider_state_linkage_refs,
      ['provider-state:temporal/cadence-current'],
    );
    assert.deepEqual(
      followthrough.operator_evidence_refs,
      ['operator-window:codex-app/runtime-followthrough'],
    );
    assert.equal(followthrough.gate_items.length, 1);
    assert.equal(
      followthrough.gate_items[0].status,
      'missing_temporal_hosted_long_soak_refs',
    );
    assert.equal(followthrough.gate_items[0].observed_ref_count, 2);
    assert.deepEqual(followthrough.gate_items[0].missing_required_refs, [
      'temporal_hosted_long_soak_refs',
    ]);
    assert.equal(followthrough.authority_boundary.can_close_long_soak, false);
    assert.equal(followthrough.authority_boundary.can_claim_production_ready, false);
}));

test('runtime Codex App runtime evidence safe action rejects support-only refs', () => withStateRoot('opl-codex-app-runtime-support-action-state-', (stateRoot) => {
    const env = { OPL_STATE_DIR: stateRoot };
    const dryRun = runCli([
      'runtime',
      'action',
      'execute',
      '--action',
      'codex_app_runtime_evidence:codex_app_runtime_role:record',
      '--dry-run',
      '--payload',
      JSON.stringify({
        provider_state_linkage_refs: ['provider-state:temporal/cadence-current'],
        operator_evidence_refs: ['operator-window:codex-app/runtime-followthrough'],
      }),
    ], env).runtime_operator_action_execution;
    const preflight =
      dryRun.execution.result.codex_app_runtime_evidence_payload_preflight;
    assert.equal(preflight.status, 'payload_required');
    assert.deepEqual(preflight.missing_required_refs, ['temporal_hosted_long_soak_refs']);
    assert.deepEqual(preflight.supplemental_refs, [
      'provider_state_linkage_refs',
      'operator_evidence_refs',
    ]);
    assert.equal(preflight.can_record_refs_only_receipt, false);

    const failure = runCliFailure([
      'runtime',
      'action',
      'execute',
      '--action',
      'codex_app_runtime_evidence:codex_app_runtime_role:record',
      '--payload',
      JSON.stringify({
        provider_state_linkage_refs: ['provider-state:temporal/cadence-current'],
        operator_evidence_refs: ['operator-window:codex-app/runtime-followthrough'],
      }),
    ], env);
    assert.equal(failure.payload.error.code, 'cli_usage_error');
    assert.equal(
      failure.payload.error.details.error_kind,
      'codex_app_runtime_evidence_payload_preflight_blocked',
    );
    assert.deepEqual(
      failure.payload.error.details.preflight.missing_required_refs,
      ['temporal_hosted_long_soak_refs'],
    );

    const listOutput = runCli(['runtime', 'codex-app-runtime-evidence', 'list'], env).codex_app_runtime_evidence_ledger;
    assert.equal(listOutput.receipt_count, 0);
}));

test('runtime Codex App runtime evidence record action rejects placeholder refs', () => withStateRoot('opl-codex-app-runtime-placeholder-state-', (stateRoot) => {
    const env = { OPL_STATE_DIR: stateRoot };
    const failure = runCliFailure([
      'runtime',
      'action',
      'execute',
      '--action',
      'codex_app_runtime_evidence:codex_app_runtime_role:record',
      '--payload',
      JSON.stringify({
        temporal_hosted_long_soak_refs: ['<temporal-hosted-long-soak-ref>'],
      }),
    ], env);
    assert.equal(failure.payload.error.code, 'cli_usage_error');
    assert.equal(
      failure.payload.error.details.error_kind,
      'codex_app_runtime_evidence_payload_preflight_blocked',
    );
    assert.deepEqual(
      failure.payload.error.details.preflight.forbidden_placeholder_refs,
      ['<temporal-hosted-long-soak-ref>'],
    );

    const listOutput = runCli(['runtime', 'codex-app-runtime-evidence', 'list'], env).codex_app_runtime_evidence_ledger;
    assert.equal(listOutput.receipt_count, 0);
}));

test('runtime Codex App runtime evidence long-soak start writes a workorder without closing evidence', () => withStateRoot('opl-codex-app-runtime-long-soak-start-state-', (stateRoot) => {
    const env = { OPL_STATE_DIR: stateRoot };
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
    ], env).codex_app_runtime_long_soak_observation_start;

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

    const listOutput = runCli(['runtime', 'codex-app-runtime-evidence', 'list'], env).codex_app_runtime_evidence_ledger;
    assert.equal(listOutput.receipt_count, 0);

    const appView = runCli(appOperatorCommand, env).app_operator_drilldown;
    assert.equal(appView.summary.codex_app_runtime_evidence_open_gate_count, 1);
    assert.equal(appView.summary.codex_app_runtime_evidence_ledger_receipt_ref_count, 0);
    assert.equal(appView.summary.codex_app_production_long_soak_claimed, false);
}));

test('runtime Codex App runtime evidence long-soak finish materializes a record payload after the observation window', () => withStateRoot('opl-codex-app-runtime-long-soak-finish-state-', (stateRoot) => {
    const env = { OPL_STATE_DIR: stateRoot };
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
    ], env).codex_app_runtime_long_soak_observation_start;

    const workorder = parseJsonText(fs.readFileSync(startOutput.workorder_file, 'utf8')) as any;
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
      ], env).codex_app_runtime_long_soak_observation_event;
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
    ], env).codex_app_runtime_long_soak_observation_finish;

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

    const payload = parseJsonText(fs.readFileSync(finishOutput.record_payload_file, 'utf8')) as any;
    assert.deepEqual(payload.temporal_hosted_long_soak_refs, finishOutput.temporal_hosted_long_soak_refs);
    assert.deepEqual(payload.provider_state_linkage_refs, finishOutput.provider_state_linkage_refs);
    assert.deepEqual(payload.operator_evidence_refs, finishOutput.operator_evidence_refs);

    const recordOutput = runCli([
      'runtime',
      'codex-app-runtime-evidence',
      'record',
      '--payload-file',
      finishOutput.record_payload_file,
    ], env).codex_app_runtime_evidence_ledger_record;
    assert.equal(recordOutput.status, 'recorded');
    assert.deepEqual(
      recordOutput.receipts[0].temporal_hosted_long_soak_refs,
      finishOutput.temporal_hosted_long_soak_refs,
    );
    assert.equal(recordOutput.receipts[0].authority_boundary.can_close_long_soak, false);
    assert.equal(recordOutput.receipts[0].authority_boundary.can_claim_production_ready, false);
}));

test('runtime Codex App runtime evidence long-soak event rejects unknown event kinds', () => withStateRoot('opl-codex-app-runtime-long-soak-event-invalid-state-', (stateRoot) => {
    const env = { OPL_STATE_DIR: stateRoot };
    const startOutput = runCli([
      'runtime',
      'codex-app-runtime-evidence',
      'long-soak',
      'start',
      '--minimum-duration-minutes',
      '60',
      '--evidence-dir',
      path.join(stateRoot, 'codex-app-runtime-long-soak-event-invalid'),
    ], env).codex_app_runtime_long_soak_observation_start;

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
      ], env),
      /event_kind must be one of:/,
    );
}));

test('runtime Codex App runtime evidence long-soak finish blocks before minimum duration', () => withStateRoot('opl-codex-app-runtime-long-soak-blocked-state-', (stateRoot) => {
    const env = { OPL_STATE_DIR: stateRoot };
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
    ], env).codex_app_runtime_long_soak_observation_start;
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
      ], env);
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
    ], env).codex_app_runtime_long_soak_observation_finish;

    assert.equal(finishOutput.status, 'blocked');
    assert.equal(
      finishOutput.blocker.blocker_id,
      'codex_app_runtime_long_soak_minimum_duration_not_satisfied',
    );
    assert.deepEqual(finishOutput.temporal_hosted_long_soak_refs, []);
    assert.equal(finishOutput.record_payload_file, null);
    assert.equal(finishOutput.authority_boundary.can_claim_production_ready, false);
}));
