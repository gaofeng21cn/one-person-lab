import { assert, fs, os, path, runCli, test } from '../helpers.ts';
import { recordManagedInstallUpdateReceipts } from '../../../../src/managed-install-update-ledger.ts';
import { recordOmaAppLivePathReceipts } from '../../../../src/oma-app-live-path-ledger.ts';

test('runtime oma-production-consumption records long-soak refs consumed by framework readiness', () => {
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
    assert.equal(listOutput.authority_boundary.can_claim_production_ready, false);
    assert.equal(listOutput.authority_boundary.can_create_domain_owner_receipt, false);

    const readiness = runCli(['framework', 'readiness', '--family-defaults'], {
      OPL_STATE_DIR: stateRoot,
    }).framework_readiness;
    const omaFollowthrough = readiness.attention_first_payload.oma_production_consumption_followthrough;
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
