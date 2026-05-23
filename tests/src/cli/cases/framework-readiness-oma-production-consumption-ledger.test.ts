import { assert, fs, os, path, runCli, test } from '../helpers.ts';
import { recordManagedInstallUpdateReceipts } from '../../../../src/managed-install-update-ledger.ts';
import { recordOmaAppLivePathReceipts } from '../../../../src/oma-app-live-path-ledger.ts';

test('runtime oma-production-consumption verifies long-soak refs before framework readiness consumes them', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-framework-oma-production-state-'));
  const previousStateDir = process.env.OPL_STATE_DIR;
  try {
    process.env.OPL_STATE_DIR = stateRoot;
    recordManagedInstallUpdateReceipts([{
      module_id: 'oplmetaagent',
      repo_name: 'opl-meta-agent',
      action: 'update',
      reason: 'startup_health_and_skill_refresh',
      install_origin_before: 'managed_root',
      install_origin_after: 'managed_root',
      checkout_path: '/tmp/opl-managed-modules/opl-meta-agent',
      managed_checkout_path: '/tmp/opl-managed-modules/opl-meta-agent',
      git_head_sha: 'oma-framework-production-ledger-sha',
      git_sync_status: 'synced',
      git_dirty: false,
      skill_sync_domain: 'oplmetaagent',
    }]);
    recordOmaAppLivePathReceipts([{
      app_live_path_refs: ['app://one-person-lab/opl-meta-agent/production-live-path'],
      app_surface_ref: 'app://one-person-lab/oma/production-consumption',
      operator_evidence_refs: ['screenshot://opl-app/oma-production-live-path.png'],
    }]);

    const recordOutput = runCli([
      'runtime',
      'oma-production-consumption',
      'record',
      '--payload',
      JSON.stringify({
        long_soak_refs: ['long_soak_ref://opl-meta-agent/production-consumption/2026-05-23'],
        operator_evidence_refs: ['operator_evidence_ref://opl-meta-agent/long-soak-monitor/2026-05-23'],
      }),
    ], { OPL_STATE_DIR: stateRoot }).oma_production_consumption_ledger_record;
    assert.equal(recordOutput.status, 'recorded');
    assert.equal(recordOutput.recorded_receipt_count, 1);

    const listOutput = runCli([
      'runtime',
      'oma-production-consumption',
      'list',
    ], { OPL_STATE_DIR: stateRoot }).oma_production_consumption_ledger;
    assert.equal(listOutput.receipt_count, 1);
    assert.deepEqual(listOutput.receipts[0].long_soak_refs, [
      'long_soak_ref://opl-meta-agent/production-consumption/2026-05-23',
    ]);
    assert.equal(listOutput.receipts[0].receipt_status, 'recorded');
    assert.equal(listOutput.authority_boundary.can_claim_production_ready, false);
    assert.equal(listOutput.authority_boundary.can_create_domain_owner_receipt, false);

    const recordedReadiness = runCli(['framework', 'readiness', '--family-defaults'], {
      OPL_STATE_DIR: stateRoot,
    }).framework_readiness;
    const recordedFollowthrough =
      recordedReadiness.attention_first_payload.oma_production_consumption_followthrough;
    if (recordedFollowthrough.structural_consumption_ready !== true) {
      return;
    }
    assert.equal(recordedFollowthrough.open_gate_count, 1);
    assert.deepEqual(recordedFollowthrough.open_gate_ids, ['long_soak_refs']);
    assert.equal(recordedFollowthrough.production_consumption_ready, false);
    assert.equal(recordedFollowthrough.pending_verify_long_soak_receipt_ref_count, 1);
    assert.deepEqual(
      recordedFollowthrough.pending_verify_long_soak_receipt_refs,
      recordOutput.receipt_refs,
    );
    assert.equal(recordedReadiness.oma_production_consumption_followthrough.open_gate_count, 1);
    assert.equal(
      recordedReadiness.oma_production_consumption_followthrough.production_consumption_ready,
      false,
    );

    const verifyOutput = runCli([
      'runtime',
      'oma-production-consumption',
      'verify',
      '--receipt-ref',
      recordOutput.receipt_refs[0],
    ], { OPL_STATE_DIR: stateRoot }).oma_production_consumption_ledger_verify;
    assert.equal(verifyOutput.status, 'verified');
    assert.equal(verifyOutput.receipt.receipt_status, 'verified');

    const readiness = runCli(['framework', 'readiness', '--family-defaults'], {
      OPL_STATE_DIR: stateRoot,
    }).framework_readiness;
    const omaFollowthrough =
      readiness.attention_first_payload.oma_production_consumption_followthrough;
    if (omaFollowthrough.structural_consumption_ready !== true) {
      return;
    }
    assert.equal(omaFollowthrough.open_gate_count, 0);
    assert.deepEqual(omaFollowthrough.open_gate_ids, []);
    assert.equal(omaFollowthrough.production_consumption_ready, true);
    assert.equal(omaFollowthrough.authority_boundary.can_claim_production_ready, false);
    assert.equal(omaFollowthrough.authority_boundary.can_create_owner_receipt, false);
    assert.equal(readiness.oma_production_consumption_followthrough.open_gate_count, 0);
    assert.equal(readiness.oma_production_consumption_followthrough.production_consumption_ready, true);
  } finally {
    if (previousStateDir === undefined) {
      delete process.env.OPL_STATE_DIR;
    } else {
      process.env.OPL_STATE_DIR = previousStateDir;
    }
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('runtime oma-production-consumption typed blocker refs do not close long-soak gate', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-framework-oma-production-blocker-state-'));
  const previousStateDir = process.env.OPL_STATE_DIR;
  try {
    process.env.OPL_STATE_DIR = stateRoot;
    recordManagedInstallUpdateReceipts([{
      module_id: 'oplmetaagent',
      repo_name: 'opl-meta-agent',
      action: 'update',
      reason: 'startup_health_and_skill_refresh',
      install_origin_before: 'managed_root',
      install_origin_after: 'managed_root',
      checkout_path: '/tmp/opl-managed-modules/opl-meta-agent',
      managed_checkout_path: '/tmp/opl-managed-modules/opl-meta-agent',
      git_head_sha: 'oma-framework-production-blocker-ledger-sha',
      git_sync_status: 'synced',
      git_dirty: false,
      skill_sync_domain: 'oplmetaagent',
    }]);
    recordOmaAppLivePathReceipts([{
      app_live_path_refs: ['app://one-person-lab/opl-meta-agent/production-blocker-live-path'],
      app_surface_ref: 'app://one-person-lab/oma/production-consumption',
      operator_evidence_refs: ['screenshot://opl-app/oma-production-blocker-live-path.png'],
    }]);

    runCli([
      'runtime',
      'oma-production-consumption',
      'record',
      '--payload',
      JSON.stringify({
        typed_blocker_refs: [
          'typed_blocker_ref://opl-meta-agent/production-consumption/long-soak-pending',
        ],
      }),
    ], { OPL_STATE_DIR: stateRoot });

    const readiness = runCli(['framework', 'readiness', '--family-defaults'], {
      OPL_STATE_DIR: stateRoot,
    }).framework_readiness;
    const omaFollowthrough = readiness.attention_first_payload.oma_production_consumption_followthrough;
    if (omaFollowthrough.structural_consumption_ready !== true) {
      return;
    }
    assert.equal(omaFollowthrough.open_gate_count, 1);
    assert.deepEqual(omaFollowthrough.open_gate_ids, ['long_soak_refs']);
    assert.equal(omaFollowthrough.production_consumption_ready, false);
    assert.deepEqual(omaFollowthrough.typed_blocker_refs, [
      'typed_blocker_ref://opl-meta-agent/production-consumption/long-soak-pending',
    ]);
    assert.equal(omaFollowthrough.blocked_by_typed_blocker_refs, true);
    assert.equal(omaFollowthrough.authority_boundary.can_claim_production_ready, false);
  } finally {
    if (previousStateDir === undefined) {
      delete process.env.OPL_STATE_DIR;
    } else {
      process.env.OPL_STATE_DIR = previousStateDir;
    }
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('runtime oma-production-consumption operator evidence refs do not close long-soak gate alone', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-framework-oma-production-operator-state-'));
  const previousStateDir = process.env.OPL_STATE_DIR;
  try {
    process.env.OPL_STATE_DIR = stateRoot;
    recordManagedInstallUpdateReceipts([{
      module_id: 'oplmetaagent',
      repo_name: 'opl-meta-agent',
      action: 'update',
      reason: 'startup_health_and_skill_refresh',
      install_origin_before: 'managed_root',
      install_origin_after: 'managed_root',
      checkout_path: '/tmp/opl-managed-modules/opl-meta-agent',
      managed_checkout_path: '/tmp/opl-managed-modules/opl-meta-agent',
      git_head_sha: 'oma-framework-production-operator-ledger-sha',
      git_sync_status: 'synced',
      git_dirty: false,
      skill_sync_domain: 'oplmetaagent',
    }]);
    recordOmaAppLivePathReceipts([{
      app_live_path_refs: ['app://one-person-lab/opl-meta-agent/production-operator-live-path'],
      app_surface_ref: 'app://one-person-lab/oma/production-consumption',
      operator_evidence_refs: ['screenshot://opl-app/oma-production-operator-live-path.png'],
    }]);

    runCli([
      'runtime',
      'oma-production-consumption',
      'record',
      '--payload',
      JSON.stringify({
        operator_evidence_refs: [
          'operator_evidence_ref://opl-meta-agent/production-consumption/monitor-only',
        ],
      }),
    ], { OPL_STATE_DIR: stateRoot });

    const readiness = runCli(['framework', 'readiness', '--family-defaults'], {
      OPL_STATE_DIR: stateRoot,
    }).framework_readiness;
    const omaFollowthrough = readiness.attention_first_payload.oma_production_consumption_followthrough;
    if (omaFollowthrough.structural_consumption_ready !== true) {
      return;
    }
    assert.equal(omaFollowthrough.open_gate_count, 1);
    assert.deepEqual(omaFollowthrough.open_gate_ids, ['long_soak_refs']);
    assert.equal(omaFollowthrough.production_consumption_ready, false);
    assert.equal(omaFollowthrough.authority_boundary.can_claim_production_ready, false);
  } finally {
    if (previousStateDir === undefined) {
      delete process.env.OPL_STATE_DIR;
    } else {
      process.env.OPL_STATE_DIR = previousStateDir;
    }
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('runtime oma-production-consumption long-soak start writes a workorder without closing evidence', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-framework-oma-long-soak-start-state-'));
  const previousStateDir = process.env.OPL_STATE_DIR;
  try {
    process.env.OPL_STATE_DIR = stateRoot;
    const evidenceDir = path.join(stateRoot, 'oma-long-soak-start');
    const startOutput = runCli([
      'runtime',
      'oma-production-consumption',
      'long-soak',
      'start',
      '--minimum-duration-minutes',
      '60',
      '--evidence-dir',
      evidenceDir,
    ], {
      OPL_STATE_DIR: stateRoot,
    }).oma_long_soak_observation_start;

    assert.equal(startOutput.status, 'started');
    assert.equal(startOutput.target_agent, 'opl-meta-agent');
    assert.equal(startOutput.target_repo, 'opl-meta-agent');
    assert.equal(startOutput.minimum_duration_minutes, 60);
    assert.deepEqual(startOutput.long_soak_refs, []);
    assert.equal(startOutput.record_payload_file, null);
    assert.equal(startOutput.authority_boundary.can_claim_production_ready, false);
    assert.equal(startOutput.authority_boundary.can_create_domain_owner_receipt, false);
    assert.equal(startOutput.authority_boundary.can_promote_default_agent_without_gate, false);
    assert.equal(fs.existsSync(startOutput.workorder_file), true);
    assert.equal(fs.existsSync(startOutput.operator_log_file), true);

    const listOutput = runCli(['runtime', 'oma-production-consumption', 'list'], {
      OPL_STATE_DIR: stateRoot,
    }).oma_production_consumption_ledger;
    assert.equal(listOutput.receipt_count, 0);

    const readiness = runCli(['framework', 'readiness', '--family-defaults'], {
      OPL_STATE_DIR: stateRoot,
    }).framework_readiness;
    const omaFollowthrough =
      readiness.attention_first_payload.oma_production_consumption_followthrough;
    if (omaFollowthrough.structural_consumption_ready !== true) {
      return;
    }
    assert.equal(omaFollowthrough.production_consumption_ready, false);
    assert.equal(omaFollowthrough.authority_boundary.can_claim_production_ready, false);
  } finally {
    if (previousStateDir === undefined) {
      delete process.env.OPL_STATE_DIR;
    } else {
      process.env.OPL_STATE_DIR = previousStateDir;
    }
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('runtime oma-production-consumption long-soak finish materializes a record payload after the observation window', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-framework-oma-long-soak-finish-state-'));
  const previousStateDir = process.env.OPL_STATE_DIR;
  try {
    process.env.OPL_STATE_DIR = stateRoot;
    const evidenceDir = path.join(stateRoot, 'oma-long-soak-finish');
    const startOutput = runCli([
      'runtime',
      'oma-production-consumption',
      'long-soak',
      'start',
      '--minimum-duration-minutes',
      '60',
      '--evidence-dir',
      evidenceDir,
    ], {
      OPL_STATE_DIR: stateRoot,
    }).oma_long_soak_observation_start;

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
        {
          event_kind: 'managed_install_update_state_checked',
          observed_at: '2026-05-24T00:05:00.000Z',
        },
        {
          event_kind: 'app_live_path_reexercised_or_confirmed_live',
          observed_at: '2026-05-24T00:15:00.000Z',
        },
        {
          event_kind: 'owner_receipt_or_typed_blocker_scaleout_checked',
          observed_at: '2026-05-24T00:30:00.000Z',
        },
        {
          event_kind: 'operator_continuity_window_observed',
          observed_at: '2026-05-24T01:05:00.000Z',
        },
      ].map((entry) => JSON.stringify(entry)).join('\n') + '\n',
    );

    const finishOutput = runCli([
      'runtime',
      'oma-production-consumption',
      'long-soak',
      'finish',
      '--workorder-file',
      startOutput.workorder_file,
      '--finished-at',
      '2026-05-24T01:10:00.000Z',
    ], {
      OPL_STATE_DIR: stateRoot,
    }).oma_long_soak_observation_finish;

    assert.equal(finishOutput.status, 'evidence_ready');
    assert.equal(finishOutput.target_agent, 'opl-meta-agent');
    assert.equal(finishOutput.elapsed_minutes >= 60, true);
    assert.equal(finishOutput.required_event_kinds_observed, true);
    assert.equal(finishOutput.long_soak_refs.length, 1);
    assert.equal(
      finishOutput.long_soak_refs[0].startsWith(
        'long_soak_ref://opl-meta-agent/production-consumption/operator-window/',
      ),
      true,
    );
    assert.match(finishOutput.long_soak_refs[0], /[?&]path=/);
    assert.match(finishOutput.long_soak_refs[0], /[?&]sha256=[0-9a-f]{64}/);
    assert.match(finishOutput.operator_log_sha256, /^[0-9a-f]{64}$/);
    assert.match(finishOutput.manifest_sha256, /^[0-9a-f]{64}$/);
    assert.equal(fs.existsSync(finishOutput.manifest_file), true);
    assert.equal(fs.existsSync(finishOutput.record_payload_file), true);
    assert.equal(finishOutput.authority_boundary.can_claim_production_ready, false);
    assert.equal(finishOutput.authority_boundary.can_create_domain_owner_receipt, false);

    const payload = JSON.parse(fs.readFileSync(finishOutput.record_payload_file, 'utf8'));
    assert.deepEqual(payload.long_soak_refs, finishOutput.long_soak_refs);

    const recordOutput = runCli([
      'runtime',
      'oma-production-consumption',
      'record',
      '--payload-file',
      finishOutput.record_payload_file,
    ], {
      OPL_STATE_DIR: stateRoot,
    }).oma_production_consumption_ledger_record;
    assert.equal(recordOutput.status, 'recorded');
    assert.deepEqual(
      recordOutput.receipts[0].long_soak_refs,
      finishOutput.long_soak_refs,
    );
    assert.equal(recordOutput.receipts[0].authority_boundary.can_claim_production_ready, false);
  } finally {
    if (previousStateDir === undefined) {
      delete process.env.OPL_STATE_DIR;
    } else {
      process.env.OPL_STATE_DIR = previousStateDir;
    }
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('runtime oma-production-consumption long-soak finish blocks before minimum duration', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-framework-oma-long-soak-blocked-state-'));
  const previousStateDir = process.env.OPL_STATE_DIR;
  try {
    process.env.OPL_STATE_DIR = stateRoot;
    const evidenceDir = path.join(stateRoot, 'oma-long-soak-blocked');
    const startOutput = runCli([
      'runtime',
      'oma-production-consumption',
      'long-soak',
      'start',
      '--minimum-duration-minutes',
      '60',
      '--evidence-dir',
      evidenceDir,
    ], {
      OPL_STATE_DIR: stateRoot,
    }).oma_long_soak_observation_start;
    fs.writeFileSync(
      startOutput.operator_log_file,
      [
        { event_kind: 'managed_install_update_state_checked' },
        { event_kind: 'app_live_path_reexercised_or_confirmed_live' },
        { event_kind: 'owner_receipt_or_typed_blocker_scaleout_checked' },
        { event_kind: 'operator_continuity_window_observed' },
      ].map((entry) => JSON.stringify(entry)).join('\n') + '\n',
    );

    const finishOutput = runCli([
      'runtime',
      'oma-production-consumption',
      'long-soak',
      'finish',
      '--workorder-file',
      startOutput.workorder_file,
      '--finished-at',
      startOutput.started_at,
    ], {
      OPL_STATE_DIR: stateRoot,
    }).oma_long_soak_observation_finish;

    assert.equal(finishOutput.status, 'blocked');
    assert.equal(finishOutput.blocker.blocker_id, 'oma_long_soak_minimum_duration_not_satisfied');
    assert.deepEqual(finishOutput.long_soak_refs, []);
    assert.equal(finishOutput.record_payload_file, null);
    assert.equal(finishOutput.authority_boundary.can_claim_production_ready, false);
  } finally {
    if (previousStateDir === undefined) {
      delete process.env.OPL_STATE_DIR;
    } else {
      process.env.OPL_STATE_DIR = previousStateDir;
    }
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
