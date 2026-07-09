import { assert, fs, os, path, runCli, test } from '../helpers.ts';
import { recordManagedInstallUpdateReceipts } from '../../../../src/modules/connect/managed-install-update-ledger.ts';
import { recordOmaAppLivePathReceipts } from '../../../../src/modules/foundry-lab/oma-app-live-path-ledger.ts';
import { createFamilyWorkspaceFixture } from './runtime-app-operator-drilldown-helpers.ts';

test('OMA production-consumption receipts require verification and do not grant framework authority', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-framework-oma-production-state-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-framework-oma-production-fixture-'));
  const { omaRepoDir, workspaceRoot } = createFamilyWorkspaceFixture(fixtureRoot);
  try {
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
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_META_AGENT_REPO_DIR: omaRepoDir,
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
    }).oma_production_consumption_ledger_record;
    const verifyOutput = runCli([
      'runtime',
      'oma-production-consumption',
      'verify',
      '--receipt-ref',
      recordOutput.receipt_refs[0],
    ], { OPL_STATE_DIR: stateRoot }).oma_production_consumption_ledger_verify;
    const readiness = runCli(['framework', 'readiness', '--family-defaults'], {
      OPL_STATE_DIR: stateRoot,
      OPL_META_AGENT_REPO_DIR: omaRepoDir,
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
    }).framework_readiness;

    assert.equal(recordOutput.status, 'recorded');
    assert.equal(verifyOutput.status, 'verified');
    assert.equal(readiness.oma_production_consumption_followthrough.authority_boundary.can_claim_production_ready, false);
    assert.equal(readiness.oma_production_consumption_followthrough.authority_boundary.can_create_owner_receipt, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
