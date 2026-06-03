import { assert, fs, os, path, runCli, test } from '../helpers.ts';
import { recordManagedInstallUpdateReceipts } from '../../../../src/managed-install-update-ledger.ts';
import { createOmaContractFixture } from './runtime-app-operator-drilldown-helpers.ts';

test('framework readiness consumes OPL-managed OMA install update receipts', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-framework-oma-managed-state-'));
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
      git_head_sha: 'oma-framework-ledger-sha',
      git_sync_status: 'synced',
      git_dirty: false,
      skill_sync_domain: 'oplmetaagent',
    }]);

    const readiness = runCli(['framework', 'readiness', '--family-defaults'], {
      OPL_STATE_DIR: stateRoot,
    }).framework_readiness;
    const omaFollowthrough = readiness.attention_first_payload.oma_production_consumption_followthrough;
    if (omaFollowthrough.structural_consumption_ready !== true) {
      return;
    }
    assert.equal(omaFollowthrough.open_gate_count, 2);
    assert.deepEqual(omaFollowthrough.open_gate_ids, [
      'app_live_path_refs',
      'long_soak_refs',
    ]);
    assert.equal(omaFollowthrough.production_consumption_ready, false);
    assert.equal(
      omaFollowthrough.gate_items.some(
        (gate: { gate_id: string }) => gate.gate_id === 'managed_install_update_refs',
      ),
      false,
    );
    assert.equal(readiness.oma_production_consumption_followthrough.open_gate_count, 2);
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
