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

const recordAction = 'codex_app_runtime_evidence:codex_app_runtime_role:record';

function withStateRoot(prefix: string, run: (stateRoot: string) => void): void {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  try {
    run(stateRoot);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
}

test('Codex App runtime ledger records, verifies, and stays refs-only', () => {
  withStateRoot('opl-codex-app-runtime-', (stateRoot) => {
    const env = { OPL_STATE_DIR: stateRoot };
    const initial = runCli([
      'runtime',
      'app-operator-drilldown',
      '--detail',
      'full',
    ], env).app_operator_drilldown;
    const route = initial.operator_action_routing_refs.refs.find(
      (ref: { action_id: string }) => ref.action_id === recordAction,
    );
    assert.equal(route.payload_owner, 'app_live_operator_or_opl_provider_owner');
    assert.equal(route.route_requires_domain_or_app_payload, true);
    assert.equal(route.payload_workorder.authority_boundary.refs_only, true);
    assert.equal(route.payload_workorder.authority_boundary.can_create_owner_receipt, false);
    assert.equal(route.payload_workorder.authority_boundary.can_close_long_soak, false);
    assert.equal(route.payload_workorder.authority_boundary.can_claim_production_ready, false);

    const execution = runCli([
      'runtime',
      'action',
      'execute',
      '--action',
      recordAction,
      '--payload',
      JSON.stringify({
        temporal_hosted_long_soak_refs: ['temporal-long-soak:codex-app/runtime-4h'],
        provider_state_linkage_refs: ['provider-state:temporal/cadence-current'],
        operator_evidence_refs: ['operator-window:codex-app/runtime-followthrough'],
      }),
    ], env).runtime_operator_action_execution;
    const recorded = execution.execution.result.codex_app_runtime_evidence_ledger_record;
    assert.equal(recorded.status, 'recorded');
    assert.equal(recorded.recorded_receipt_count, 1);
    assert.equal(recorded.receipts[0].authority_boundary.refs_only, true);
    assert.equal(recorded.receipts[0].authority_boundary.can_close_long_soak, false);
    assert.equal(recorded.receipts[0].authority_boundary.can_claim_production_ready, false);

    const pending = runCli(['runtime', 'app-operator-drilldown'], env).app_operator_drilldown;
    assert.equal(pending.summary.codex_app_runtime_evidence_pending_verify_receipt_ref_count, 1);
    assert.equal(pending.summary.codex_app_production_evidence_gate_remains_open, true);

    const verified = runCli([
      'runtime',
      'codex-app-runtime-evidence',
      'verify',
      '--receipt-ref',
      recorded.receipt_refs[0],
    ], env).codex_app_runtime_evidence_ledger_verify;
    assert.equal(verified.status, 'verified');
    assert.equal(verified.receipt.receipt_status, 'verified');
    assert.equal(verified.authority_boundary.can_claim_production_ready, false);

    const current = runCli(['runtime', 'app-operator-drilldown'], env).app_operator_drilldown;
    assert.equal(current.summary.codex_app_runtime_evidence_open_gate_count, 0);
    assert.equal(current.summary.codex_app_runtime_evidence_verified_ledger_receipt_ref_count, 1);
    assert.equal(current.summary.codex_app_production_long_soak_claimed, false);
    assert.equal(current.summary.codex_app_production_evidence_gate_remains_open, false);
  });
});

test('Codex App runtime ledger keeps typed blockers open and rejects unsafe record payloads', () => {
  withStateRoot('opl-codex-app-runtime-blocker-', (stateRoot) => {
    const env = { OPL_STATE_DIR: stateRoot };
    const recorded = runCli([
      'runtime',
      'codex-app-runtime-evidence',
      'record',
      '--payload',
      JSON.stringify({
        typed_blocker_refs: ['typed-blocker:codex-app-runtime/long-soak-owner-pending'],
      }),
    ], env).codex_app_runtime_evidence_ledger_record;
    assert.equal(recorded.status, 'recorded');
    assert.deepEqual(recorded.receipts[0].typed_blocker_refs, [
      'typed-blocker:codex-app-runtime/long-soak-owner-pending',
    ]);

    const summary = runCli(['runtime', 'app-operator-drilldown'], env).app_operator_drilldown;
    const followthrough = summary.attention_first_payload.codex_app_runtime_role
      .production_evidence_followthrough;
    assert.equal(followthrough.blocked_by_typed_blocker_refs, true);
    assert.equal(followthrough.refs_observed_for_all_gates, false);
    assert.equal(followthrough.authority_boundary.can_claim_production_ready, false);
  });

  const invalidPayloads = [
    {},
    { temporal_hosted_long_soak_refs: ['<temporal-hosted-long-soak-ref>'] },
    {
      provider_state_linkage_refs: ['provider-state:temporal/cadence-current'],
      operator_evidence_refs: ['operator-window:codex-app/runtime-followthrough'],
    },
    {
      temporal_hosted_long_soak_refs: ['temporal-long-soak:codex-app/runtime-4h'],
      typed_blocker_refs: ['typed-blocker:codex-app-runtime/conflict'],
    },
  ];
  for (const [index, payload] of invalidPayloads.entries()) {
    withStateRoot(`opl-codex-app-runtime-invalid-${index}-`, (stateRoot) => {
      const env = { OPL_STATE_DIR: stateRoot };
      const failure = runCliFailure([
        'runtime',
        'action',
        'execute',
        '--action',
        recordAction,
        '--payload',
        JSON.stringify(payload),
      ], env);
      assert.equal(failure.status, 2);
      assert.equal(failure.payload.error.code, 'cli_usage_error');
      assert.equal(
        runCli(['runtime', 'codex-app-runtime-evidence', 'list'], env)
          .codex_app_runtime_evidence_ledger.receipt_count,
        0,
      );
    });
  }
});

test('Codex App long-soak owner retains start, event, finish, and minimum-duration gates', () => {
  withStateRoot('opl-codex-app-long-soak-', (stateRoot) => {
    const env = { OPL_STATE_DIR: stateRoot };
    const start = runCli([
      'runtime',
      'codex-app-runtime-evidence',
      'long-soak',
      'start',
      '--minimum-duration-minutes',
      '60',
      '--evidence-dir',
      path.join(stateRoot, 'long-soak'),
    ], env).codex_app_runtime_long_soak_observation_start;
    assert.equal(start.status, 'started');
    assert.equal(start.record_payload_file, null);
    assert.equal(start.authority_boundary.can_close_long_soak, false);
    assert.equal(start.authority_boundary.can_claim_production_ready, false);

    const workorder = parseJsonText(fs.readFileSync(start.workorder_file, 'utf8')) as any;
    fs.writeFileSync(
      start.workorder_file,
      `${JSON.stringify({
        ...workorder,
        started_at: '2026-05-24T00:00:00.000Z',
        earliest_finish_at: '2026-05-24T01:00:00.000Z',
      }, null, 2)}\n`,
    );
    const events = [
      ['temporal_hosted_stage_or_worker_window_observed', '2026-05-24T00:05:00.000Z'],
      ['provider_state_linkage_checked', '2026-05-24T00:15:00.000Z'],
      ['codex_app_operator_observation_recorded', '2026-05-24T00:30:00.000Z'],
      ['operator_continuity_window_observed', '2026-05-24T01:05:00.000Z'],
    ];
    for (const [eventKind, observedAt] of events) {
      const event = runCli([
        'runtime',
        'codex-app-runtime-evidence',
        'long-soak',
        'event',
        '--workorder-file',
        start.workorder_file,
        '--event-kind',
        eventKind,
        '--observed-at',
        observedAt,
      ], env).codex_app_runtime_long_soak_observation_event;
      assert.equal(event.status, 'recorded');
      assert.equal(event.authority_boundary.can_claim_production_ready, false);
    }

    const finish = runCli([
      'runtime',
      'codex-app-runtime-evidence',
      'long-soak',
      'finish',
      '--workorder-file',
      start.workorder_file,
      '--finished-at',
      '2026-05-24T01:10:00.000Z',
    ], env).codex_app_runtime_long_soak_observation_finish;
    assert.equal(finish.status, 'evidence_ready');
    assert.equal(finish.required_event_kinds_observed, true);
    assert.equal(finish.temporal_hosted_long_soak_refs.length, 1);
    assert.equal(fs.existsSync(finish.record_payload_file), true);
    assert.equal(finish.authority_boundary.can_close_long_soak, false);

    const shortStart = runCli([
      'runtime',
      'codex-app-runtime-evidence',
      'long-soak',
      'start',
      '--minimum-duration-minutes',
      '60',
      '--evidence-dir',
      path.join(stateRoot, 'short-long-soak'),
    ], env).codex_app_runtime_long_soak_observation_start;
    const blocked = runCli([
      'runtime',
      'codex-app-runtime-evidence',
      'long-soak',
      'finish',
      '--workorder-file',
      shortStart.workorder_file,
      '--finished-at',
      shortStart.started_at,
    ], env).codex_app_runtime_long_soak_observation_finish;
    assert.equal(blocked.status, 'blocked');
    assert.equal(
      blocked.blocker.blocker_id,
      'codex_app_runtime_long_soak_minimum_duration_not_satisfied',
    );
    assert.equal(blocked.record_payload_file, null);
  });
});
