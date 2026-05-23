import { assert, fs, os, path, runCli, test } from '../helpers.ts';
import { recordManagedInstallUpdateReceipts } from '../../../../src/managed-install-update-ledger.ts';
import { recordOmaAppLivePathReceipts } from '../../../../src/oma-app-live-path-ledger.ts';

function writeJson(file: string, payload: unknown) {
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`);
}

function createOmaContractFixture(fixtureRoot: string) {
  const repoDir = path.join(fixtureRoot, 'opl-meta-agent');
  const contractsDir = path.join(repoDir, 'contracts');
  fs.mkdirSync(contractsDir, { recursive: true });
  writeJson(path.join(contractsDir, 'opl_domain_manifest_registration.json'), {
    surface_kind: 'opl_domain_manifest_registration',
    domain_id: 'opl-meta-agent',
    discovery_receipt: {
      status: 'ready_for_opl_registry_consumption',
      receipt_ref: 'discovery-receipt:opl-meta-agent/test-fixture',
    },
  });
  writeJson(path.join(contractsDir, 'app_workbench_projection.json'), {
    surface_kind: 'opl_app_workbench_projection_contract',
    domain_id: 'opl-meta-agent',
    workbench_sections: [],
    drilldown_readiness_receipt: {
      status: 'ready_for_app_consumption_refs_only',
      live_rendering_status: 'not_claimed_by_contract',
    },
  });
  writeJson(path.join(contractsDir, 'real_target_agent_scaleout_evidence.json'), {
    surface_kind: 'real_target_agent_scaleout_evidence_contract',
    domain_id: 'opl-meta-agent',
    evidence_status: 'multi_target_scaleout_closed_by_refs_only_receipts',
    multi_target_scaleout_closeout: {
      status: 'closed_by_two_real_target_refs_only_receipts',
      target_agents: [
        {
          domain_id: 'med-autoscience',
          target_agent_owner_receipt_refs: [
            'owner-receipt:oma-fixture/med-autoscience',
          ],
          typed_blocker_refs: [],
        },
        {
          domain_id: 'med-autogrant',
          target_agent_owner_receipt_refs: [],
          typed_blocker_refs: [
            'typed-blocker:oma-fixture/med-autogrant',
          ],
        },
      ],
    },
  });
  return repoDir;
}

test('runtime app-operator-drilldown consumes OPL-managed OMA install update receipts', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-drilldown-oma-managed-state-'));
  const previousStateDir = process.env.OPL_STATE_DIR;
  const previousOmaRepoDir = process.env.OPL_META_AGENT_REPO_DIR;
  try {
    process.env.OPL_META_AGENT_REPO_DIR = createOmaContractFixture(stateRoot);
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
    if (previousOmaRepoDir === undefined) {
      delete process.env.OPL_META_AGENT_REPO_DIR;
    } else {
      process.env.OPL_META_AGENT_REPO_DIR = previousOmaRepoDir;
    }
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('runtime app-operator-drilldown consumes OMA App live path receipts', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-drilldown-oma-live-state-'));
  const previousStateDir = process.env.OPL_STATE_DIR;
  const previousOmaRepoDir = process.env.OPL_META_AGENT_REPO_DIR;
  try {
    process.env.OPL_META_AGENT_REPO_DIR = createOmaContractFixture(stateRoot);
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
    if (previousOmaRepoDir === undefined) {
      delete process.env.OPL_META_AGENT_REPO_DIR;
    } else {
      process.env.OPL_META_AGENT_REPO_DIR = previousOmaRepoDir;
    }
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('runtime OMA App live path CLI records refs-only operator evidence without production claims', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-oma-app-live-path-cli-state-'));
  const previousStateDir = process.env.OPL_STATE_DIR;
  const previousOmaRepoDir = process.env.OPL_META_AGENT_REPO_DIR;
  try {
    process.env.OPL_META_AGENT_REPO_DIR = createOmaContractFixture(stateRoot);
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
      git_head_sha: 'oma-managed-live-cli-sha',
      git_sync_status: 'synced',
      git_dirty: false,
      skill_sync_domain: 'oplmetaagent',
    }]);

    const initialList = runCli(['runtime', 'oma-app-live-path', 'list'], {
      OPL_STATE_DIR: stateRoot,
    }).oma_app_live_path_ledger;
    assert.equal(initialList.receipt_count, 0);
    assert.equal(initialList.authority_boundary.refs_only, true);
    assert.equal(initialList.authority_boundary.can_claim_production_ready, false);

    const recordOutput = runCli([
      'runtime',
      'oma-app-live-path',
      'record',
      '--payload',
      JSON.stringify({
        app_live_path_refs: ['app://one-person-lab/opl-meta-agent/workbench/live'],
        app_surface_ref: 'app://one-person-lab/runtime/operator-drilldown',
        operator_evidence_refs: ['screenshot://opl-app/oma-workbench-live.png'],
      }),
    ], {
      OPL_STATE_DIR: stateRoot,
    }).oma_app_live_path_ledger_record;

    assert.equal(recordOutput.status, 'recorded');
    assert.equal(recordOutput.recorded_receipt_count, 1);
    assert.deepEqual(recordOutput.receipt_refs, [
      'opl://oma-app-live-path/app%3A%2F%2Fone-person-lab%2Fopl-meta-agent%2Fworkbench%2Flive',
    ]);
    assert.equal(recordOutput.ledger_file, path.join(stateRoot, 'oma-app-live-path-ledger.json'));
    assert.equal(recordOutput.receipts[0].authority_boundary.refs_only, true);
    assert.equal(recordOutput.receipts[0].authority_boundary.can_claim_production_ready, false);
    assert.equal(recordOutput.receipts[0].authority_boundary.can_create_domain_owner_receipt, false);

    const listOutput = runCli(['runtime', 'oma-app-live-path', 'list'], {
      OPL_STATE_DIR: stateRoot,
    }).oma_app_live_path_ledger;
    assert.equal(listOutput.receipt_count, 1);
    assert.equal(listOutput.receipts[0].receipt_ref, recordOutput.receipt_refs[0]);
    assert.equal(listOutput.authority_boundary.can_write_domain_truth, false);

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
    assert.equal(followthrough.summary.open_gate_count, 1);
    assert.deepEqual(followthrough.summary.open_gate_ids, ['long_soak_refs']);
    assert.equal(followthrough.summary.production_consumption_ready, false);
  } finally {
    if (previousStateDir === undefined) {
      delete process.env.OPL_STATE_DIR;
    } else {
      process.env.OPL_STATE_DIR = previousStateDir;
    }
    if (previousOmaRepoDir === undefined) {
      delete process.env.OPL_META_AGENT_REPO_DIR;
    } else {
      process.env.OPL_META_AGENT_REPO_DIR = previousOmaRepoDir;
    }
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('runtime OMA production-consumption CLI records long-soak refs and closes the followthrough gate', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-oma-production-consumption-cli-state-'));
  const previousStateDir = process.env.OPL_STATE_DIR;
  const previousOmaRepoDir = process.env.OPL_META_AGENT_REPO_DIR;
  try {
    process.env.OPL_META_AGENT_REPO_DIR = createOmaContractFixture(stateRoot);
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
      git_head_sha: 'oma-managed-long-soak-cli-sha',
      git_sync_status: 'synced',
      git_dirty: false,
      skill_sync_domain: 'oplmetaagent',
    }]);
    recordOmaAppLivePathReceipts([{
      app_live_path_refs: ['app://one-person-lab/opl-meta-agent/workbench/live'],
      app_surface_ref: 'app://one-person-lab/runtime/operator-drilldown',
      operator_evidence_refs: ['screenshot://opl-app/oma-workbench-live.png'],
    }]);

    const initialFullOutput = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], {
      OPL_STATE_DIR: stateRoot,
    });
    const initialFollowthrough =
      initialFullOutput.app_operator_drilldown.opl_meta_agent_workbench_refs
        .production_consumption_followthrough;
    assert.deepEqual(initialFollowthrough.summary.open_gate_ids, ['long_soak_refs']);

    const initialList = runCli(['runtime', 'oma-production-consumption', 'list'], {
      OPL_STATE_DIR: stateRoot,
    }).oma_production_consumption_ledger;
    assert.equal(initialList.receipt_count, 0);
    assert.equal(initialList.authority_boundary.refs_only, true);
    assert.equal(initialList.authority_boundary.can_claim_production_ready, false);

    const recordOutput = runCli([
      'runtime',
      'oma-production-consumption',
      'record',
      '--payload',
      JSON.stringify({
        long_soak_refs: ['long-soak://opl-meta-agent/controlled-operator-soak/26.5.19'],
        operator_evidence_refs: ['receipt://operator/oma-controlled-soak-26.5.19'],
      }),
    ], {
      OPL_STATE_DIR: stateRoot,
    }).oma_production_consumption_ledger_record;

    assert.equal(recordOutput.status, 'recorded');
    assert.equal(recordOutput.recorded_receipt_count, 1);
    assert.deepEqual(recordOutput.receipt_refs, [
      'opl://oma-production-consumption/long-soak%3A%2F%2Fopl-meta-agent%2Fcontrolled-operator-soak%2F26.5.19',
    ]);
    assert.equal(recordOutput.ledger_file, path.join(stateRoot, 'oma-production-consumption-ledger.json'));
    assert.equal(recordOutput.receipts[0].authority_boundary.refs_only, true);
    assert.equal(recordOutput.receipts[0].authority_boundary.can_claim_production_ready, false);
    assert.equal(recordOutput.receipts[0].authority_boundary.can_create_domain_owner_receipt, false);

    const listOutput = runCli(['runtime', 'oma-production-consumption', 'list'], {
      OPL_STATE_DIR: stateRoot,
    }).oma_production_consumption_ledger;
    assert.equal(listOutput.receipt_count, 1);
    assert.equal(listOutput.receipts[0].receipt_ref, recordOutput.receipt_refs[0]);
    assert.equal(listOutput.authority_boundary.can_write_domain_truth, false);

    const fullOutput = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], {
      OPL_STATE_DIR: stateRoot,
    });
    const followthrough =
      fullOutput.app_operator_drilldown.opl_meta_agent_workbench_refs
        .production_consumption_followthrough;
    const longSoakGate = followthrough.gate_items.find(
      (gate: { gate_id: string }) => gate.gate_id === 'long_soak_refs',
    );
    assert.equal(longSoakGate.status, 'refs_observed');
    assert.deepEqual(longSoakGate.observed_refs, [
      'long-soak://opl-meta-agent/controlled-operator-soak/26.5.19',
    ]);
    assert.equal(followthrough.summary.long_soak_ref_count, 1);
    assert.equal(followthrough.summary.production_consumption_ledger_receipt_ref_count, 1);
    assert.equal(followthrough.summary.production_consumption_operator_evidence_ref_count, 1);
    assert.equal(followthrough.summary.open_gate_count, 0);
    assert.deepEqual(followthrough.summary.open_gate_ids, []);
    assert.equal(followthrough.summary.production_consumption_ready, true);
    assert.equal(followthrough.summary.domain_ready_claim_count, 0);
    assert.equal(followthrough.summary.quality_verdict_claim_count, 0);
    assert.equal(followthrough.summary.default_promotion_claim_count, 0);
  } finally {
    if (previousStateDir === undefined) {
      delete process.env.OPL_STATE_DIR;
    } else {
      process.env.OPL_STATE_DIR = previousStateDir;
    }
    if (previousOmaRepoDir === undefined) {
      delete process.env.OPL_META_AGENT_REPO_DIR;
    } else {
      process.env.OPL_META_AGENT_REPO_DIR = previousOmaRepoDir;
    }
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
