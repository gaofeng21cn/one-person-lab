import {
  assert,
  fs,
  os,
  parseJsonText,
  path,
  runCli,
  test,
} from '../helpers.ts';

const eventKinds = [
  'app_window_reopened_or_kept_live',
  'reload_prompt_path_exercised_or_confirmed_not_required',
  'provider_state_linkage_checked',
  'operator_continuity_window_observed',
];

function startObservation(stateRoot: string, evidenceDir: string) {
  return runCli([
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
  ], { OPL_STATE_DIR: stateRoot }).app_release_long_operator_observation_start;
}

test('App release long-operator retains start, event, finish, and minimum-duration ownership', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-release-long-operator-'));
  const env = { OPL_STATE_DIR: stateRoot };
  try {
    const start = startObservation(stateRoot, path.join(stateRoot, 'complete'));
    assert.equal(start.status, 'started');
    assert.equal(start.minimum_duration_minutes, 60);
    assert.equal(start.record_payload_file, null);
    assert.equal(start.authority_boundary.can_claim_release_ready, false);
    assert.equal(start.authority_boundary.can_claim_production_ready, false);
    assert.equal(fs.existsSync(start.workorder_file), true);

    const workorder = parseJsonText(fs.readFileSync(start.workorder_file, 'utf8')) as any;
    fs.writeFileSync(
      start.workorder_file,
      `${JSON.stringify({
        ...workorder,
        started_at: '2026-05-24T00:00:00.000Z',
        earliest_finish_at: '2026-05-24T01:00:00.000Z',
      }, null, 2)}\n`,
    );
    const logBeforeRejectedEvent = fs.readFileSync(start.operator_log_file, 'utf8');
    assert.throws(
      () => runCli([
        'runtime',
        'app-release-evidence',
        'long-operator',
        'event',
        '--workorder-file',
        start.workorder_file,
        '--event-kind',
        'freeform_operator_note',
      ], env),
      /event_kind must be one of:/,
    );
    assert.equal(fs.readFileSync(start.operator_log_file, 'utf8'), logBeforeRejectedEvent);
    for (const [index, eventKind] of eventKinds.entries()) {
      const event = runCli([
        'runtime',
        'app-release-evidence',
        'long-operator',
        'event',
        '--workorder-file',
        start.workorder_file,
        '--event-kind',
        eventKind,
        '--observed-at',
        `2026-05-24T00:${String((index + 1) * 10).padStart(2, '0')}:00.000Z`,
      ], env).app_release_long_operator_observation_event_record;
      assert.equal(event.status, 'recorded');
      assert.equal(event.event.event_kind, eventKind);
      assert.equal(event.event.authority_boundary.can_claim_production_ready, false);
    }

    const finish = runCli([
      'runtime',
      'app-release-evidence',
      'long-operator',
      'finish',
      '--workorder-file',
      start.workorder_file,
      '--finished-at',
      '2026-05-24T01:10:00.000Z',
    ], env).app_release_long_operator_observation_finish;
    assert.equal(finish.status, 'evidence_ready');
    assert.equal(finish.required_event_kinds_observed, true);
    assert.equal(finish.elapsed_minutes >= 60, true);
    assert.equal(finish.long_operator_evidence_refs.length, 1);
    assert.equal(fs.existsSync(finish.record_payload_file), true);
    assert.equal(finish.authority_boundary.can_claim_release_ready, false);
    assert.equal(finish.authority_boundary.can_claim_production_ready, false);

    const payload = parseJsonText(fs.readFileSync(finish.record_payload_file, 'utf8')) as any;
    assert.deepEqual(payload.long_operator_evidence_refs, finish.long_operator_evidence_refs);
    const recorded = runCli([
      'runtime',
      'app-release-evidence',
      'record',
      '--payload-file',
      finish.record_payload_file,
    ], env).app_release_user_path_evidence_ledger_record;
    assert.deepEqual(
      recorded.receipts[0].long_operator_evidence_refs,
      finish.long_operator_evidence_refs,
    );
    assert.equal(recorded.receipts[0].authority_boundary.can_claim_production_ready, false);

    const short = startObservation(stateRoot, path.join(stateRoot, 'short'));
    fs.writeFileSync(
      short.operator_log_file,
      `${eventKinds.map((event_kind) => JSON.stringify({ event_kind })).join('\n')}\n`,
    );
    const blocked = runCli([
      'runtime',
      'app-release-evidence',
      'long-operator',
      'finish',
      '--workorder-file',
      short.workorder_file,
      '--finished-at',
      short.started_at,
    ], env).app_release_long_operator_observation_finish;
    assert.equal(blocked.status, 'blocked');
    assert.equal(
      blocked.blocker.blocker_id,
      'app_release_long_operator_minimum_duration_not_satisfied',
    );
    assert.deepEqual(blocked.long_operator_evidence_refs, []);
    assert.equal(blocked.record_payload_file, null);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
