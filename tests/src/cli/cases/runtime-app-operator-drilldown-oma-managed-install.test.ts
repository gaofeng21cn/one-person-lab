import { assert, fs, os, path, runCli, test } from '../helpers.ts';
import { recordManagedInstallUpdateReceipts } from '../../../../src/managed-install-update-ledger.ts';
import { recordOmaAppLivePathReceipts } from '../../../../src/oma-app-live-path-ledger.ts';

test('runtime app-operator-drilldown consumes OPL-managed OMA install update receipts', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-drilldown-oma-managed-state-'));
  const previousStateDir = process.env.OPL_STATE_DIR;
  try {
    process.env.OPL_STATE_DIR = stateRoot;
    const record = recordManagedInstallUpdateReceipts([{
      module_id: 'oplmetaagent',
      repo_name: 'opl-meta-agent',
      action: 'update',
      reason: 'startup_health_and_skill_refresh',
      install_origin_before: 'managed_root',
      install_origin_after: 'managed_root',
      checkout_path: '/tmp/opl-managed-modules/opl-meta-agent',
      managed_checkout_path: '/tmp/opl-managed-modules/opl-meta-agent',
      git_head_sha: 'oma-managed-ledger-sha',
      git_sync_status: 'synced',
      git_dirty: false,
      skill_sync_domain: 'oplmetaagent',
    }]);
    assert.equal(record.status, 'recorded');
    assert.deepEqual(record.receipt_refs, [
      'opl://managed-install-update/oplmetaagent/update/oma-managed-ledger-sha',
    ]);

    const summaryOutput = runCli(['runtime', 'app-operator-drilldown'], {
      OPL_STATE_DIR: stateRoot,
    });
    const summaryDrilldown = summaryOutput.app_operator_drilldown;
    const metaAgentBound = summaryDrilldown.summary.opl_meta_agent_registry_status === 'resolved';
    if (!metaAgentBound) {
      return;
    }
    assert.equal(
      summaryDrilldown.summary.opl_meta_agent_production_consumption_followthrough_open_gate_count,
      2,
    );
    const omaAttention =
      summaryDrilldown.attention_first_payload.evidence_after_contract
        .oma_production_consumption_followthrough;
    assert.equal(omaAttention.open_gate_count, 2);
    assert.deepEqual(omaAttention.open_gate_ids, [
      'app_live_path_refs',
      'long_soak_refs',
    ]);
    assert.equal(
      omaAttention.gate_items.some(
        (gate: { gate_id: string }) => gate.gate_id === 'managed_install_update_refs',
      ),
      false,
    );

    const fullOutput = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], {
      OPL_STATE_DIR: stateRoot,
    });
    const followthrough =
      fullOutput.app_operator_drilldown.opl_meta_agent_workbench_refs
        .production_consumption_followthrough;
    const managedGate = followthrough.gate_items.find(
      (gate: { gate_id: string }) => gate.gate_id === 'managed_install_update_refs',
    );
    assert.equal(managedGate.status, 'refs_observed');
    assert.deepEqual(managedGate.observed_refs, [
      'opl://managed-install-update/oplmetaagent/update/oma-managed-ledger-sha',
    ]);
    assert.equal(followthrough.summary.managed_install_update_ref_count, 1);
    assert.equal(followthrough.summary.open_gate_count, 2);
    assert.deepEqual(followthrough.summary.open_gate_ids, [
      'app_live_path_refs',
      'long_soak_refs',
    ]);
    assert.equal(followthrough.summary.production_consumption_ready, false);
  } finally {
    if (previousStateDir === undefined) {
      delete process.env.OPL_STATE_DIR;
    } else {
      process.env.OPL_STATE_DIR = previousStateDir;
    }
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('runtime app-operator-drilldown consumes OMA App live path receipts', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-drilldown-oma-live-state-'));
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
      git_head_sha: 'oma-managed-live-ledger-sha',
      git_sync_status: 'synced',
      git_dirty: false,
      skill_sync_domain: 'oplmetaagent',
    }]);
    const appLiveRecord = recordOmaAppLivePathReceipts([{
      app_live_path_refs: ['app://one-person-lab/opl-meta-agent/workbench/live'],
      app_surface_ref: 'app://one-person-lab/runtime/operator-drilldown',
      operator_evidence_refs: ['screenshot://opl-app/oma-workbench-live.png'],
    }]);
    assert.equal(appLiveRecord.status, 'recorded');
    assert.deepEqual(appLiveRecord.receipt_refs, [
      'opl://oma-app-live-path/app%3A%2F%2Fone-person-lab%2Fopl-meta-agent%2Fworkbench%2Flive',
    ]);

    const summaryOutput = runCli(['runtime', 'app-operator-drilldown'], {
      OPL_STATE_DIR: stateRoot,
    });
    const summaryDrilldown = summaryOutput.app_operator_drilldown;
    const metaAgentBound = summaryDrilldown.summary.opl_meta_agent_registry_status === 'resolved';
    if (!metaAgentBound) {
      return;
    }
    assert.equal(
      summaryDrilldown.summary.opl_meta_agent_production_consumption_followthrough_open_gate_count,
      1,
    );
    const omaAttention =
      summaryDrilldown.attention_first_payload.evidence_after_contract
        .oma_production_consumption_followthrough;
    assert.equal(omaAttention.open_gate_count, 1);
    assert.deepEqual(omaAttention.open_gate_ids, ['long_soak_refs']);
    assert.equal(
      omaAttention.gate_items.some(
        (gate: { gate_id: string }) => gate.gate_id === 'app_live_path_refs',
      ),
      false,
    );

    const fullOutput = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], {
      OPL_STATE_DIR: stateRoot,
    });
    const followthrough =
      fullOutput.app_operator_drilldown.opl_meta_agent_workbench_refs
        .production_consumption_followthrough;
    const appLiveGate = followthrough.gate_items.find(
      (gate: { gate_id: string }) => gate.gate_id === 'app_live_path_refs',
    );
    assert.equal(appLiveGate.status, 'refs_observed');
    assert.deepEqual(appLiveGate.observed_refs, [
      'opl://oma-app-live-path/app%3A%2F%2Fone-person-lab%2Fopl-meta-agent%2Fworkbench%2Flive',
      'app://one-person-lab/opl-meta-agent/workbench/live',
      'screenshot://opl-app/oma-workbench-live.png',
    ]);
    assert.equal(followthrough.summary.app_live_path_ref_count, 3);
    assert.equal(followthrough.summary.open_gate_count, 1);
    assert.deepEqual(followthrough.summary.open_gate_ids, ['long_soak_refs']);
    assert.equal(followthrough.summary.production_consumption_ready, false);
  } finally {
    if (previousStateDir === undefined) {
      delete process.env.OPL_STATE_DIR;
    } else {
      process.env.OPL_STATE_DIR = previousStateDir;
    }
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
