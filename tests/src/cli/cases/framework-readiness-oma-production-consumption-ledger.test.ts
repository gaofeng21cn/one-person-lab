import { assert, fs, os, path, runCli, test } from '../helpers.ts';
import { recordManagedInstallUpdateReceipts } from '../../../../src/modules/connect/managed-install-update-ledger.ts';
import { recordOmaAppLivePathReceipts } from '../../../../src/modules/foundry-lab/oma-app-live-path-ledger.ts';
import {
  createFamilyWorkspaceFixture,
} from './runtime-app-operator-drilldown-helpers.ts';

function bindOmaFixtureWithoutProductionAcceptance(stateRoot: string) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-framework-oma-production-fixture-'));
  const { omaRepoDir, workspaceRoot } = createFamilyWorkspaceFixture(fixtureRoot);
  process.env.OPL_META_AGENT_REPO_DIR = omaRepoDir;
  process.env.OPL_FAMILY_WORKSPACE_ROOT = workspaceRoot;
  return fixtureRoot;
}

function createReadinessFamilyWorkspace(options: { omaProductionAcceptance?: boolean } = {}) {
  const familyWorkspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-framework-readiness-family-'));
  const { omaRepoDir, workspaceRoot } = createFamilyWorkspaceFixture(familyWorkspaceRoot, options);
  return {
    familyWorkspaceRoot,
    omaRepoDir,
    workspaceRoot,
  };
}

function restoreEnv(
  name: 'OPL_STATE_DIR' | 'OPL_META_AGENT_REPO_DIR' | 'OPL_FAMILY_WORKSPACE_ROOT',
  previous: string | undefined,
) {
  if (previous === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = previous;
  }
}

test('runtime oma-production-consumption verifies long-soak refs before framework readiness consumes them', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-framework-oma-production-state-'));
  const previousStateDir = process.env.OPL_STATE_DIR;
  const previousOmaRepoDir = process.env.OPL_META_AGENT_REPO_DIR;
  const previousFamilyWorkspaceRoot = process.env.OPL_FAMILY_WORKSPACE_ROOT;
  let fixtureRoot: string | null = null;
  try {
    process.env.OPL_STATE_DIR = stateRoot;
    fixtureRoot = bindOmaFixtureWithoutProductionAcceptance(stateRoot);
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
    restoreEnv('OPL_STATE_DIR', previousStateDir);
    restoreEnv('OPL_META_AGENT_REPO_DIR', previousOmaRepoDir);
    restoreEnv('OPL_FAMILY_WORKSPACE_ROOT', previousFamilyWorkspaceRoot);
    fs.rmSync(stateRoot, { recursive: true, force: true });
    if (fixtureRoot) {
      fs.rmSync(fixtureRoot, { recursive: true, force: true });
    }
  }
});

test('framework readiness consumes OMA repo-tracked production acceptance refs without runtime ledger state', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-framework-oma-production-acceptance-state-'));
  const {
    familyWorkspaceRoot: fixtureRoot,
    omaRepoDir,
    workspaceRoot,
  } = createReadinessFamilyWorkspace({ omaProductionAcceptance: true });
  const previousStateDir = process.env.OPL_STATE_DIR;
  const previousOmaRepoDir = process.env.OPL_META_AGENT_REPO_DIR;
  const previousFamilyWorkspaceRoot = process.env.OPL_FAMILY_WORKSPACE_ROOT;
  try {
    process.env.OPL_STATE_DIR = stateRoot;
    process.env.OPL_META_AGENT_REPO_DIR = omaRepoDir;
    process.env.OPL_FAMILY_WORKSPACE_ROOT = workspaceRoot;

    const ledger = runCli(['runtime', 'oma-production-consumption', 'list'], {
      OPL_STATE_DIR: stateRoot,
    }).oma_production_consumption_ledger;
    assert.equal(ledger.receipt_count, 0);

    recordManagedInstallUpdateReceipts([{
      module_id: 'oplmetaagent',
      repo_name: 'opl-meta-agent',
      action: 'update',
      reason: 'startup_health_and_skill_refresh',
      install_origin_before: 'managed_root',
      install_origin_after: 'managed_root',
      checkout_path: '/tmp/opl-managed-modules/opl-meta-agent',
      managed_checkout_path: '/tmp/opl-managed-modules/opl-meta-agent',
      git_head_sha: 'oma-framework-production-acceptance-ledger-sha',
      git_sync_status: 'synced',
      git_dirty: false,
      skill_sync_domain: 'oplmetaagent',
    }]);
    recordOmaAppLivePathReceipts([{
      app_live_path_refs: ['app://one-person-lab/opl-meta-agent/production-acceptance-live-path'],
      app_surface_ref: 'app://one-person-lab/oma/production-consumption',
      operator_evidence_refs: ['screenshot://opl-app/oma-production-acceptance-live-path.png'],
    }]);

    const readiness = runCli(['framework', 'readiness', '--family-defaults'], {
      OPL_STATE_DIR: stateRoot,
      OPL_META_AGENT_REPO_DIR: omaRepoDir,
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
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
    const fullDrilldown = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], {
      OPL_STATE_DIR: stateRoot,
      OPL_META_AGENT_REPO_DIR: omaRepoDir,
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
    }).app_operator_drilldown;
    const fullFollowthrough =
      fullDrilldown.opl_meta_agent_workbench_refs.production_consumption_followthrough;
    assert.equal(fullFollowthrough.summary.production_consumption_ready, true);
    assert.equal(fullFollowthrough.repo_tracked_production_acceptance_receipt_refs.includes(
      'production-acceptance-receipt:opl-meta-agent/fixture',
    ), true);
    const longSoakGate = fullFollowthrough.gate_items.find(
      (gate: { gate_id: string }) => gate.gate_id === 'long_soak_refs',
    );
    assert.equal(longSoakGate.status, 'refs_observed');
    assert.equal(
      longSoakGate.observed_refs.includes(
        'long_soak_ref://opl-meta-agent/production-consumption/fixture-window',
      ),
      true,
    );
  } finally {
    restoreEnv('OPL_STATE_DIR', previousStateDir);
    restoreEnv('OPL_META_AGENT_REPO_DIR', previousOmaRepoDir);
    restoreEnv('OPL_FAMILY_WORKSPACE_ROOT', previousFamilyWorkspaceRoot);
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('runtime oma-production-consumption CLI accepts singular ref fields for long-soak payloads', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-framework-oma-production-singular-state-'));
  const {
    familyWorkspaceRoot,
    workspaceRoot,
  } = createReadinessFamilyWorkspace();
  const previousStateDir = process.env.OPL_STATE_DIR;
  const previousFamilyWorkspaceRoot = process.env.OPL_FAMILY_WORKSPACE_ROOT;
  try {
    process.env.OPL_STATE_DIR = stateRoot;
    process.env.OPL_FAMILY_WORKSPACE_ROOT = workspaceRoot;
    recordManagedInstallUpdateReceipts([{
      module_id: 'oplmetaagent',
      repo_name: 'opl-meta-agent',
      action: 'update',
      reason: 'startup_health_and_skill_refresh',
      install_origin_before: 'managed_root',
      install_origin_after: 'managed_root',
      checkout_path: '/tmp/opl-managed-modules/opl-meta-agent',
      managed_checkout_path: '/tmp/opl-managed-modules/opl-meta-agent',
      git_head_sha: 'oma-framework-production-singular-ledger-sha',
      git_sync_status: 'synced',
      git_dirty: false,
      skill_sync_domain: 'oplmetaagent',
    }]);
    recordOmaAppLivePathReceipts([{
      app_live_path_refs: ['app://one-person-lab/opl-meta-agent/production-singular-live-path'],
      app_surface_ref: 'app://one-person-lab/oma/production-consumption',
      operator_evidence_refs: ['screenshot://opl-app/oma-production-singular-live-path.png'],
    }]);

    const recordOutput = runCli([
      'runtime',
      'oma-production-consumption',
      'record',
      '--payload',
      JSON.stringify({
        long_soak_ref: 'long_soak_ref://opl-meta-agent/production-consumption/singular',
        operator_evidence_ref: 'operator_evidence_ref://opl-meta-agent/production-consumption/singular',
      }),
    ], { OPL_STATE_DIR: stateRoot }).oma_production_consumption_ledger_record;
    assert.equal(recordOutput.status, 'recorded');
    assert.deepEqual(recordOutput.receipts[0].long_soak_refs, [
      'long_soak_ref://opl-meta-agent/production-consumption/singular',
    ]);
    assert.deepEqual(recordOutput.receipts[0].operator_evidence_refs, [
      'operator_evidence_ref://opl-meta-agent/production-consumption/singular',
    ]);

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
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
    }).framework_readiness;
    const omaFollowthrough = readiness.oma_production_consumption_followthrough;
    if (omaFollowthrough.structural_consumption_ready !== true) {
      return;
    }
    assert.equal(omaFollowthrough.open_gate_count, 0);
    assert.deepEqual(omaFollowthrough.open_gate_ids, []);
    assert.equal(omaFollowthrough.production_consumption_ready, true);
    assert.equal(omaFollowthrough.authority_boundary.can_claim_production_ready, false);
    assert.equal(omaFollowthrough.authority_boundary.can_create_owner_receipt, false);
  } finally {
    restoreEnv('OPL_STATE_DIR', previousStateDir);
    restoreEnv('OPL_FAMILY_WORKSPACE_ROOT', previousFamilyWorkspaceRoot);
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(familyWorkspaceRoot, { recursive: true, force: true });
  }
});

test('runtime oma-production-consumption typed blocker refs do not close long-soak gate', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-framework-oma-production-blocker-state-'));
  const previousStateDir = process.env.OPL_STATE_DIR;
  const previousOmaRepoDir = process.env.OPL_META_AGENT_REPO_DIR;
  const previousFamilyWorkspaceRoot = process.env.OPL_FAMILY_WORKSPACE_ROOT;
  let fixtureRoot: string | null = null;
  try {
    process.env.OPL_STATE_DIR = stateRoot;
    fixtureRoot = bindOmaFixtureWithoutProductionAcceptance(stateRoot);
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

    const recordOutput = runCli([
      'runtime',
      'oma-production-consumption',
      'record',
      '--payload',
      JSON.stringify({
        typed_blocker_refs: [
          'typed_blocker_ref://opl-meta-agent/production-consumption/long-soak-pending',
        ],
      }),
    ], { OPL_STATE_DIR: stateRoot }).oma_production_consumption_ledger_record;
    assert.equal(recordOutput.status, 'recorded');

    const verifyOutput = runCli([
      'runtime',
      'oma-production-consumption',
      'verify',
      '--receipt-ref',
      recordOutput.receipt_refs[0],
    ], { OPL_STATE_DIR: stateRoot }).oma_production_consumption_ledger_verify;
    assert.equal(verifyOutput.status, 'verified');

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
    restoreEnv('OPL_STATE_DIR', previousStateDir);
    restoreEnv('OPL_META_AGENT_REPO_DIR', previousOmaRepoDir);
    restoreEnv('OPL_FAMILY_WORKSPACE_ROOT', previousFamilyWorkspaceRoot);
    fs.rmSync(stateRoot, { recursive: true, force: true });
    if (fixtureRoot) {
      fs.rmSync(fixtureRoot, { recursive: true, force: true });
    }
  }
});

test('runtime oma-production-consumption retires stale typed blocker refs after verified long-soak evidence', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-framework-oma-production-blocker-retired-state-'));
  const {
    familyWorkspaceRoot,
    workspaceRoot,
  } = createReadinessFamilyWorkspace();
  const previousStateDir = process.env.OPL_STATE_DIR;
  const previousFamilyWorkspaceRoot = process.env.OPL_FAMILY_WORKSPACE_ROOT;
  try {
    process.env.OPL_STATE_DIR = stateRoot;
    process.env.OPL_FAMILY_WORKSPACE_ROOT = workspaceRoot;
    recordManagedInstallUpdateReceipts([{
      module_id: 'oplmetaagent',
      repo_name: 'opl-meta-agent',
      action: 'update',
      reason: 'startup_health_and_skill_refresh',
      install_origin_before: 'managed_root',
      install_origin_after: 'managed_root',
      checkout_path: '/tmp/opl-managed-modules/opl-meta-agent',
      managed_checkout_path: '/tmp/opl-managed-modules/opl-meta-agent',
      git_head_sha: 'oma-framework-production-blocker-retired-ledger-sha',
      git_sync_status: 'synced',
      git_dirty: false,
      skill_sync_domain: 'oplmetaagent',
    }]);
    recordOmaAppLivePathReceipts([{
      app_live_path_refs: ['app://one-person-lab/opl-meta-agent/production-blocker-retired-live-path'],
      app_surface_ref: 'app://one-person-lab/oma/production-consumption',
      operator_evidence_refs: ['screenshot://opl-app/oma-production-blocker-retired-live-path.png'],
    }]);

    const blockerRecord = runCli([
      'runtime',
      'oma-production-consumption',
      'record',
      '--payload',
      JSON.stringify({
        typed_blocker_refs: [
          'typed_blocker_ref://opl-meta-agent/production-consumption/long-soak-pending',
        ],
      }),
    ], { OPL_STATE_DIR: stateRoot }).oma_production_consumption_ledger_record;
    runCli([
      'runtime',
      'oma-production-consumption',
      'verify',
      '--receipt-ref',
      blockerRecord.receipt_refs[0],
    ], { OPL_STATE_DIR: stateRoot });

    const longSoakRecord = runCli([
      'runtime',
      'oma-production-consumption',
      'record',
      '--payload',
      JSON.stringify({
        long_soak_refs: ['long_soak_ref://opl-meta-agent/production-consumption/operator-window/hash'],
        operator_evidence_refs: ['operator_evidence_ref://opl-meta-agent/long-soak-monitor/hash'],
      }),
    ], { OPL_STATE_DIR: stateRoot }).oma_production_consumption_ledger_record;
    runCli([
      'runtime',
      'oma-production-consumption',
      'verify',
      '--receipt-ref',
      longSoakRecord.receipt_refs[0],
    ], { OPL_STATE_DIR: stateRoot });

    const readiness = runCli(['framework', 'readiness', '--family-defaults'], {
      OPL_STATE_DIR: stateRoot,
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
    }).framework_readiness;
    const omaFollowthrough =
      readiness.attention_first_payload.oma_production_consumption_followthrough;
    if (omaFollowthrough.structural_consumption_ready !== true) {
      return;
    }
    assert.equal(omaFollowthrough.open_gate_count, 0);
    assert.deepEqual(omaFollowthrough.open_gate_ids, []);
    assert.equal(omaFollowthrough.production_consumption_ready, true);
    assert.deepEqual(omaFollowthrough.typed_blocker_refs, []);
    assert.equal(omaFollowthrough.typed_blocker_ref_count, 0);
    assert.equal(omaFollowthrough.blocked_by_typed_blocker_refs, false);
    assert.equal(omaFollowthrough.historical_typed_blocker_ref_count, 1);
    assert.equal(omaFollowthrough.authority_boundary.can_claim_production_ready, false);
  } finally {
    restoreEnv('OPL_STATE_DIR', previousStateDir);
    restoreEnv('OPL_FAMILY_WORKSPACE_ROOT', previousFamilyWorkspaceRoot);
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(familyWorkspaceRoot, { recursive: true, force: true });
  }
});

test('runtime oma-production-consumption operator evidence refs do not close long-soak gate alone', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-framework-oma-production-operator-state-'));
  const previousStateDir = process.env.OPL_STATE_DIR;
  const previousOmaRepoDir = process.env.OPL_META_AGENT_REPO_DIR;
  const previousFamilyWorkspaceRoot = process.env.OPL_FAMILY_WORKSPACE_ROOT;
  let fixtureRoot: string | null = null;
  try {
    process.env.OPL_STATE_DIR = stateRoot;
    fixtureRoot = bindOmaFixtureWithoutProductionAcceptance(stateRoot);
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

    const recordOutput = runCli([
      'runtime',
      'oma-production-consumption',
      'record',
      '--payload',
      JSON.stringify({
        operator_evidence_refs: [
          'operator_evidence_ref://opl-meta-agent/production-consumption/monitor-only',
        ],
      }),
    ], { OPL_STATE_DIR: stateRoot }).oma_production_consumption_ledger_record;
    assert.equal(recordOutput.status, 'recorded');

    const verifyOutput = runCli([
      'runtime',
      'oma-production-consumption',
      'verify',
      '--receipt-ref',
      recordOutput.receipt_refs[0],
    ], { OPL_STATE_DIR: stateRoot }).oma_production_consumption_ledger_verify;
    assert.equal(verifyOutput.status, 'verified');

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
    restoreEnv('OPL_STATE_DIR', previousStateDir);
    restoreEnv('OPL_META_AGENT_REPO_DIR', previousOmaRepoDir);
    restoreEnv('OPL_FAMILY_WORKSPACE_ROOT', previousFamilyWorkspaceRoot);
    fs.rmSync(stateRoot, { recursive: true, force: true });
    if (fixtureRoot) {
      fs.rmSync(fixtureRoot, { recursive: true, force: true });
    }
  }
});

test('runtime oma-production-consumption long-soak start writes a workorder without closing evidence', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-framework-oma-long-soak-start-state-'));
  const {
    familyWorkspaceRoot,
    workspaceRoot,
  } = createReadinessFamilyWorkspace();
  const previousStateDir = process.env.OPL_STATE_DIR;
  const previousFamilyWorkspaceRoot = process.env.OPL_FAMILY_WORKSPACE_ROOT;
  try {
    process.env.OPL_STATE_DIR = stateRoot;
    process.env.OPL_FAMILY_WORKSPACE_ROOT = workspaceRoot;
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
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
    }).framework_readiness;
    const omaFollowthrough =
      readiness.attention_first_payload.oma_production_consumption_followthrough;
    if (omaFollowthrough.structural_consumption_ready !== true) {
      return;
    }
    assert.equal(omaFollowthrough.production_consumption_ready, false);
    assert.equal(omaFollowthrough.authority_boundary.can_claim_production_ready, false);
  } finally {
    restoreEnv('OPL_STATE_DIR', previousStateDir);
    restoreEnv('OPL_FAMILY_WORKSPACE_ROOT', previousFamilyWorkspaceRoot);
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(familyWorkspaceRoot, { recursive: true, force: true });
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
    const eventKinds = [
      ['managed_install_update_state_checked', '2026-05-24T00:05:00.000Z'],
      ['app_live_path_reexercised_or_confirmed_live', '2026-05-24T00:15:00.000Z'],
      ['owner_receipt_or_typed_blocker_scaleout_checked', '2026-05-24T00:30:00.000Z'],
      ['operator_continuity_window_observed', '2026-05-24T01:05:00.000Z'],
    ];
    for (const [eventKind, observedAt] of eventKinds) {
      const eventOutput = runCli([
        'runtime',
        'oma-production-consumption',
        'long-soak',
        'event',
        '--workorder-file',
        startOutput.workorder_file,
        '--event-kind',
        eventKind,
        '--observed-at',
        observedAt,
        '--evidence-ref',
        `evidence:${eventKind}`,
      ], {
        OPL_STATE_DIR: stateRoot,
      }).oma_long_soak_observation_event;
      assert.equal(eventOutput.long_soak_refs.length, 0);
      assert.equal(eventOutput.record_payload_file, null);
      assert.equal(eventOutput.authority_boundary.can_claim_production_ready, false);
    }

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

test('runtime oma-production-consumption long-soak event records constrained operator events', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-framework-oma-long-soak-event-state-'));
  const previousStateDir = process.env.OPL_STATE_DIR;
  try {
    process.env.OPL_STATE_DIR = stateRoot;
    const evidenceDir = path.join(stateRoot, 'oma-long-soak-event');
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

    const eventKinds = [
      'managed_install_update_state_checked',
      'app_live_path_reexercised_or_confirmed_live',
      'owner_receipt_or_typed_blocker_scaleout_checked',
      'operator_continuity_window_observed',
    ];
    for (const [index, eventKind] of eventKinds.entries()) {
      const eventOutput = runCli([
        'runtime',
        'oma-production-consumption',
        'long-soak',
        'event',
        '--workorder-file',
        startOutput.workorder_file,
        '--event-kind',
        eventKind,
        '--observed-at',
        `2026-05-24T00:${String((index + 1) * 10).padStart(2, '0')}:00.000Z`,
        '--evidence-ref',
        `operator-evidence:oma/${eventKind}`,
      ], {
        OPL_STATE_DIR: stateRoot,
      }).oma_long_soak_observation_event;
      assert.equal(eventOutput.status, 'recorded');
      assert.equal(eventOutput.event.event_kind, eventKind);
      assert.equal(eventOutput.event.authority_boundary.can_claim_production_ready, false);
      assert.deepEqual(eventOutput.long_soak_refs, []);
      assert.equal(eventOutput.record_payload_file, null);
    }

    const operatorLog = fs.readFileSync(startOutput.operator_log_file, 'utf8')
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line));
    assert.deepEqual(operatorLog.map((event) => event.event_kind), eventKinds);
    assert.deepEqual(operatorLog.map((event) => event.evidence_ref), eventKinds.map(
      (eventKind) => `operator-evidence:oma/${eventKind}`,
    ));
  } finally {
    if (previousStateDir === undefined) {
      delete process.env.OPL_STATE_DIR;
    } else {
      process.env.OPL_STATE_DIR = previousStateDir;
    }
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('runtime oma-production-consumption long-soak event rejects unknown event kinds', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-framework-oma-long-soak-event-invalid-state-'));
  const previousStateDir = process.env.OPL_STATE_DIR;
  try {
    process.env.OPL_STATE_DIR = stateRoot;
    const startOutput = runCli([
      'runtime',
      'oma-production-consumption',
      'long-soak',
      'start',
      '--minimum-duration-minutes',
      '60',
      '--evidence-dir',
      path.join(stateRoot, 'oma-long-soak-event-invalid'),
    ], {
      OPL_STATE_DIR: stateRoot,
    }).oma_long_soak_observation_start;

    assert.throws(
      () => runCli([
        'runtime',
        'oma-production-consumption',
        'long-soak',
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
    for (const eventKind of [
      'managed_install_update_state_checked',
      'app_live_path_reexercised_or_confirmed_live',
      'owner_receipt_or_typed_blocker_scaleout_checked',
      'operator_continuity_window_observed',
    ]) {
      runCli([
        'runtime',
        'oma-production-consumption',
        'long-soak',
        'event',
        '--workorder-file',
        startOutput.workorder_file,
        '--event-kind',
        eventKind,
      ], {
        OPL_STATE_DIR: stateRoot,
      });
    }

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
