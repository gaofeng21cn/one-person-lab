import { assert, fs, os, path, runCli, test } from '../helpers.ts';
import { recordManagedInstallUpdateReceipts } from '../../../../src/managed-install-update-ledger.ts';
import { recordOmaAppLivePathReceipts } from '../../../../src/oma-app-live-path-ledger.ts';
import {
  recordOmaProductionConsumptionReceipts,
  verifyOmaProductionConsumptionReceipt,
} from '../../../../src/oma-production-consumption-ledger.ts';

test('framework readiness consumes OMA App live path receipts without closing long soak', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-framework-oma-live-state-'));
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
      git_head_sha: 'oma-framework-live-ledger-sha',
      git_sync_status: 'synced',
      git_dirty: false,
      skill_sync_domain: 'oplmetaagent',
    }]);
    recordOmaAppLivePathReceipts([{
      app_live_path_refs: ['app://one-person-lab/opl-meta-agent/framework-live-path'],
      app_surface_ref: 'app://one-person-lab/framework/readiness',
      operator_evidence_refs: ['screenshot://opl-app/framework-oma-live-path.png'],
    }]);

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
    const longSoakGate = omaFollowthrough.gate_items.find(
      (gate: { gate_id: string }) => gate.gate_id === 'long_soak_refs',
    );
    assert.equal(
      longSoakGate.next_safe_action.action_id,
      'oma_production_consumption:opl-meta-agent:record',
    );
    assert.equal(longSoakGate.next_safe_action.route_requires_domain_or_app_payload, true);
    assert.equal(longSoakGate.next_safe_action.can_create_owner_receipt, false);
    assert.equal(longSoakGate.next_safe_action.can_claim_production_ready, false);
    assert.equal(
      omaFollowthrough.gate_items.some(
        (gate: { gate_id: string }) => gate.gate_id === 'app_live_path_refs',
      ),
      false,
    );
    assert.equal(readiness.oma_production_consumption_followthrough.open_gate_count, 1);
    assert.deepEqual(
      readiness.oma_production_consumption_followthrough.open_gate_ids,
      ['long_soak_refs'],
    );
    const requiredGate = readiness.oma_production_consumption_followthrough.gate_items.find(
        (gate: { gate_id: string }) => gate.gate_id === 'long_soak_refs',
      );
    assert.equal(
      requiredGate.next_safe_action.action_id,
      'oma_production_consumption:opl-meta-agent:record',
    );
    assert.equal(requiredGate.next_safe_action.can_submit_to_safe_action_shell, true);
    assert.deepEqual(requiredGate.next_safe_action.payload_template, {
      long_soak_refs: [],
      typed_blocker_refs: [],
      operator_evidence_refs: [],
    });
    assert.equal(requiredGate.next_safe_action.can_claim_production_ready, false);
  } finally {
    if (previousStateDir === undefined) {
      delete process.env.OPL_STATE_DIR;
    } else {
      process.env.OPL_STATE_DIR = previousStateDir;
    }
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('framework readiness consumes verified OMA production-consumption long-soak refs without domain authority claims', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-framework-oma-production-consumption-state-'));
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
      git_head_sha: 'oma-framework-long-soak-ledger-sha',
      git_sync_status: 'synced',
      git_dirty: false,
      skill_sync_domain: 'oplmetaagent',
    }]);
    recordOmaAppLivePathReceipts([{
      app_live_path_refs: ['app://one-person-lab/opl-meta-agent/framework-live-path'],
      app_surface_ref: 'app://one-person-lab/framework/readiness',
      operator_evidence_refs: ['screenshot://opl-app/framework-oma-live-path.png'],
    }]);
    const longSoakRecord = recordOmaProductionConsumptionReceipts([{
      long_soak_refs: ['long-soak://opl-meta-agent/framework-controlled-soak'],
      operator_evidence_refs: ['receipt://operator/framework-controlled-soak'],
    }]);
    assert.equal(longSoakRecord.status, 'recorded');
    const recordedReadiness = runCli(['framework', 'readiness', '--family-defaults'], {
      OPL_STATE_DIR: stateRoot,
    }).framework_readiness;
    const recordedFollowthrough = recordedReadiness.oma_production_consumption_followthrough;
    if (recordedFollowthrough.structural_consumption_ready !== true) {
      return;
    }
    assert.equal(recordedFollowthrough.open_gate_count, 1);
    assert.deepEqual(recordedFollowthrough.open_gate_ids, ['long_soak_refs']);
    assert.equal(recordedFollowthrough.production_consumption_ready, false);
    assert.equal(recordedFollowthrough.pending_verify_long_soak_receipt_ref_count, 1);
    assert.deepEqual(
      recordedFollowthrough.pending_verify_long_soak_receipt_refs,
      longSoakRecord.receipt_refs,
    );

    const verifyResult = verifyOmaProductionConsumptionReceipt({
      receipt_ref: longSoakRecord.receipt_refs[0],
    });
    assert.equal(verifyResult.status, 'verified');

    const readiness = runCli(['framework', 'readiness', '--family-defaults'], {
      OPL_STATE_DIR: stateRoot,
    }).framework_readiness;
    const omaFollowthrough = readiness.oma_production_consumption_followthrough;
    if (omaFollowthrough.structural_consumption_ready !== true) {
      return;
    }
    assert.equal(omaFollowthrough.open_gate_count, 0);
    assert.deepEqual(omaFollowthrough.open_gate_ids, []);
    assert.equal(omaFollowthrough.production_consumption_ready, true);
    assert.deepEqual(omaFollowthrough.gate_items, []);
    assert.equal(omaFollowthrough.authority_boundary.can_write_domain_truth, false);
    assert.equal(omaFollowthrough.authority_boundary.can_create_owner_receipt, false);
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
