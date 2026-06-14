import {
  assert,
  fs,
  os,
  path,
  runCli,
  test,
} from '../helpers.ts';

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
