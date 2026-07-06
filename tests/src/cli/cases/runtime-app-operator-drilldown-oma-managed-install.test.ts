import { assert, fs, os, path, runCli, test } from '../helpers.ts';
import { recordManagedInstallUpdateReceipts } from '../../../../src/modules/connect/managed-install-update-ledger.ts';
import { recordOmaAppLivePathReceipts } from '../../../../src/modules/foundry-lab/oma-app-live-path-ledger.ts';
import { createOmaContractFixture } from './runtime-app-operator-drilldown-helpers.ts';

test('runtime App projection consumes OPL-managed OMA install update receipts', () => {
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

    const fullOutput = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], {
      OPL_STATE_DIR: stateRoot,
    });
    if (
      fullOutput.app_operator_drilldown.summary.opl_meta_agent_registry_status !== 'resolved'
    ) {
      return;
    }
    const followthrough =
      fullOutput.app_operator_drilldown.opl_meta_agent_workbench_refs
        .production_consumption_followthrough;
    const managedGate = followthrough.gate_items.find(
      (gate: { gate_id: string }) => gate.gate_id === 'managed_install_update_refs',
    );
    assert.equal(managedGate.status, 'refs_observed');
    assert.equal(followthrough.summary.open_gate_ids.includes('managed_install_update_refs'), false);
    assert.equal(followthrough.summary.open_gate_ids.includes('app_live_path_refs'), true);
    assert.equal(followthrough.summary.open_gate_ids.includes('long_soak_refs'), true);
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

test('runtime App projection consumes OMA App live path receipts', () => {
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

    const fullOutput = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], {
      OPL_STATE_DIR: stateRoot,
    });
    if (
      fullOutput.app_operator_drilldown.summary.opl_meta_agent_registry_status !== 'resolved'
    ) {
      return;
    }
    const followthrough =
      fullOutput.app_operator_drilldown.opl_meta_agent_workbench_refs
        .production_consumption_followthrough;
    const appLiveGate = followthrough.gate_items.find(
      (gate: { gate_id: string }) => gate.gate_id === 'app_live_path_refs',
    );
    assert.equal(appLiveGate.status, 'refs_observed');
    assert.equal(followthrough.summary.open_gate_ids.includes('app_live_path_refs'), false);
    assert.equal(followthrough.summary.open_gate_ids.includes('long_soak_refs'), true);
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

test('runtime OMA App live path CLI records refs-only payload files', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-oma-app-live-path-file-state-'));
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
      git_head_sha: 'oma-managed-live-file-sha',
      git_sync_status: 'synced',
      git_dirty: false,
      skill_sync_domain: 'oplmetaagent',
    }]);
    const payloadFile = path.join(stateRoot, 'oma-app-live-path-payload.json');
    fs.writeFileSync(
      payloadFile,
      `${JSON.stringify({
        app_live_path_refs: ['app://one-person-lab/opl-meta-agent/workbench/live'],
        app_surface_ref: 'app://one-person-lab/runtime/operator-drilldown',
        operator_evidence_refs: ['screenshot://opl-app/oma-workbench-live.png'],
      })}\n`,
    );

    const recordOutput = runCli([
      'runtime',
      'oma-app-live-path',
      'record',
      '--payload-file',
      payloadFile,
    ], {
      OPL_STATE_DIR: stateRoot,
    }).oma_app_live_path_ledger_record;

    assert.equal(recordOutput.status, 'recorded');
    assert.equal(recordOutput.recorded_receipt_count, 1);
    assert.equal(recordOutput.receipts[0].authority_boundary.refs_only, true);
    assert.equal(recordOutput.receipts[0].authority_boundary.can_claim_production_ready, false);
    assert.equal(recordOutput.receipts[0].authority_boundary.can_create_domain_owner_receipt, false);

    const fullOutput = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], {
      OPL_STATE_DIR: stateRoot,
    });
    const followthrough =
      fullOutput.app_operator_drilldown.opl_meta_agent_workbench_refs
        .production_consumption_followthrough;
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

test('runtime OMA production-consumption CLI records refs-only operator evidence but requires verification before closing the followthrough gate', () => {
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
    assert.equal(
      initialFullOutput.app_operator_drilldown.summary.oma_production_consumption_action_route_count,
      1,
    );
    const recordRoute = initialFullOutput.app_operator_drilldown.operator_action_routing_refs.refs.find(
      (ref: { action_id: string }) =>
        ref.action_id === 'oma_production_consumption:opl-meta-agent:record',
    );
    assert.equal(recordRoute.action_kind, 'oma_production_consumption_receipt_record');
    assert.equal(recordRoute.owner, 'opl');
    assert.equal(recordRoute.route_target_kind, 'opl_cli');
    assert.equal(recordRoute.execution_policy, 'opl_safe_action_shell');
    assert.equal(recordRoute.execution_surface, 'opl runtime action execute');
    assert.equal(recordRoute.route_requires_domain_or_app_payload, true);
    assert.equal(recordRoute.can_close_without_domain_or_app_payload, false);
    assert.equal(recordRoute.payload_owner, 'app_live_operator_or_oma_owner');
    assert.deepEqual(recordRoute.payload_template, {
      long_soak_refs: [],
      typed_blocker_refs: [],
      operator_evidence_refs: [],
    });
    assert.equal(recordRoute.authority_boundary.can_write_domain_truth, false);
    assert.equal(recordRoute.authority_boundary.can_create_owner_receipt, false);
    assert.equal(recordRoute.authority_boundary.can_claim_production_ready, false);
    assert.equal(recordRoute.authority_boundary.can_promote_default_agent_without_gate, false);
    assert.equal(
      initialFullOutput.app_operator_drilldown.app_execution_bridge.safe_action_routes.some(
        (ref: { action_id: string; can_submit_to_safe_action_shell: boolean }) =>
          ref.action_id === recordRoute.action_id && ref.can_submit_to_safe_action_shell,
      ),
      true,
    );
    const initialAttention =
      initialFullOutput.app_operator_drilldown.attention_first_payload.evidence_after_contract
        .oma_production_consumption_followthrough;
    const initialLongSoakGate = initialAttention.gate_items.find(
      (gate: { gate_id: string }) => gate.gate_id === 'long_soak_refs',
    );
    assert.equal(
      initialLongSoakGate.next_safe_action.action_id,
      'oma_production_consumption:opl-meta-agent:record',
    );
    assert.equal(initialLongSoakGate.next_safe_action.can_claim_production_ready, false);
    const nextStep =
      initialFullOutput.app_operator_drilldown.attention_first_payload.evidence_next_steps
        .items.find(
          (item: { step_kind: string }) =>
            item.step_kind === 'oma_production_consumption_followthrough',
        );
    assert.equal(nextStep.record_action_id, 'oma_production_consumption:opl-meta-agent:record');
    assert.equal(nextStep.can_submit_record_to_safe_action_shell, true);
    assert.deepEqual(nextStep.payload_template, {
      long_soak_refs: [],
      typed_blocker_refs: [],
      operator_evidence_refs: [],
    });
    assert.equal(nextStep.can_claim_production_ready, false);

    const initialList = runCli(['runtime', 'oma-production-consumption', 'list'], {
      OPL_STATE_DIR: stateRoot,
    }).oma_production_consumption_ledger;
    assert.equal(initialList.receipt_count, 0);
    assert.equal(initialList.authority_boundary.refs_only, true);
    assert.equal(initialList.authority_boundary.can_claim_production_ready, false);

    const dryRun = runCli([
      'runtime',
      'action',
      'execute',
      '--action',
      'oma_production_consumption:opl-meta-agent:record',
      '--dry-run',
    ], {
      OPL_STATE_DIR: stateRoot,
    }).runtime_operator_action_execution;
    assert.equal(dryRun.execution.execution_kind, 'opl_cli_oma_production_consumption_apply');
    assert.equal(dryRun.execution.execution_status, 'dry_run');
    assert.equal(
      dryRun.execution.result.oma_production_consumption_payload_preflight.status,
      'payload_required',
    );
    assert.equal(
      dryRun.execution.result.oma_production_consumption_payload_preflight
        .empty_payload_template_is_success_evidence,
      false,
    );

    const recordExecution = runCli([
      'runtime',
      'action',
      'execute',
      '--action',
      'oma_production_consumption:opl-meta-agent:record',
      '--payload',
      JSON.stringify({
        long_soak_refs: ['long-soak://opl-meta-agent/controlled-operator-soak/26.5.19'],
        operator_evidence_refs: ['receipt://operator/oma-controlled-soak-26.5.19'],
      }),
    ], {
      OPL_STATE_DIR: stateRoot,
    }).runtime_operator_action_execution;
    assert.equal(
      recordExecution.execution.execution_kind,
      'opl_cli_oma_production_consumption_apply',
    );
    assert.equal(recordExecution.execution.execution_status, 'executed');
    const recordOutput = recordExecution.execution.result.oma_production_consumption_ledger_record;

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
    assert.equal(listOutput.receipts[0].receipt_status, 'recorded');
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
    assert.equal(longSoakGate.status, 'missing_long_soak_refs');
    assert.deepEqual(longSoakGate.observed_refs, []);
    assert.equal(followthrough.summary.long_soak_ref_count, 0);
    assert.equal(followthrough.summary.pending_verify_long_soak_receipt_ref_count, 1);
    assert.deepEqual(
      followthrough.summary.pending_verify_long_soak_receipt_refs,
      recordOutput.receipt_refs,
    );
    assert.equal(followthrough.summary.open_gate_count, 1);
    assert.deepEqual(followthrough.summary.open_gate_ids, ['long_soak_refs']);
    assert.equal(followthrough.summary.production_consumption_ready, false);
    assert.equal(followthrough.summary.domain_ready_claim_count, 0);
    assert.equal(followthrough.summary.quality_verdict_claim_count, 0);
    assert.equal(followthrough.summary.default_promotion_claim_count, 0);

    const verifyOutput = runCli([
      'runtime',
      'oma-production-consumption',
      'verify',
      '--receipt-ref',
      recordOutput.receipt_refs[0],
    ], {
      OPL_STATE_DIR: stateRoot,
    }).oma_production_consumption_ledger_verify;
    assert.equal(verifyOutput.status, 'verified');
    assert.equal(verifyOutput.receipt.receipt_status, 'verified');
    assert.equal(verifyOutput.authority_boundary.can_claim_production_ready, false);

    const verifiedOutput = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], {
      OPL_STATE_DIR: stateRoot,
    });
    const verifiedFollowthrough =
      verifiedOutput.app_operator_drilldown.opl_meta_agent_workbench_refs
        .production_consumption_followthrough;
    const verifiedLongSoakGate = verifiedFollowthrough.gate_items.find(
      (gate: { gate_id: string }) => gate.gate_id === 'long_soak_refs',
    );
    assert.equal(verifiedLongSoakGate.status, 'refs_observed');
    assert.deepEqual(verifiedLongSoakGate.observed_refs, [
      'opl://oma-production-consumption/long-soak%3A%2F%2Fopl-meta-agent%2Fcontrolled-operator-soak%2F26.5.19',
      'long-soak://opl-meta-agent/controlled-operator-soak/26.5.19',
      'receipt://operator/oma-controlled-soak-26.5.19',
    ]);
    assert.equal(verifiedFollowthrough.summary.long_soak_ref_count, 3);
    assert.equal(verifiedFollowthrough.summary.pending_verify_long_soak_receipt_ref_count, 0);
    assert.equal(verifiedFollowthrough.summary.open_gate_count, 0);
    assert.deepEqual(verifiedFollowthrough.summary.open_gate_ids, []);
    assert.equal(verifiedFollowthrough.summary.production_consumption_ready, true);
    assert.equal(verifiedFollowthrough.summary.domain_ready_claim_count, 0);
    assert.equal(verifiedFollowthrough.summary.quality_verdict_claim_count, 0);
    assert.equal(verifiedFollowthrough.summary.default_promotion_claim_count, 0);
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

test('runtime OMA production-consumption CLI records refs-only payload files', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-oma-production-consumption-file-state-'));
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
      git_head_sha: 'oma-managed-long-soak-file-sha',
      git_sync_status: 'synced',
      git_dirty: false,
      skill_sync_domain: 'oplmetaagent',
    }]);
    recordOmaAppLivePathReceipts([{
      app_live_path_refs: ['app://one-person-lab/opl-meta-agent/workbench/live'],
      app_surface_ref: 'app://one-person-lab/runtime/operator-drilldown',
      operator_evidence_refs: ['screenshot://opl-app/oma-workbench-live.png'],
    }]);
    const payloadFile = path.join(stateRoot, 'oma-production-consumption-payload.json');
    fs.writeFileSync(
      payloadFile,
      `${JSON.stringify({
        long_soak_refs: ['long-soak://opl-meta-agent/controlled-operator-soak/26.5.19'],
        operator_evidence_refs: ['receipt://operator/oma-controlled-soak-26.5.19'],
      })}\n`,
    );

    const recordOutput = runCli([
      'runtime',
      'oma-production-consumption',
      'record',
      '--payload-file',
      payloadFile,
    ], {
      OPL_STATE_DIR: stateRoot,
    }).oma_production_consumption_ledger_record;

    assert.equal(recordOutput.status, 'recorded');
    assert.equal(recordOutput.recorded_receipt_count, 1);
    assert.equal(recordOutput.receipts[0].receipt_status, 'recorded');
    assert.equal(recordOutput.receipts[0].authority_boundary.refs_only, true);
    assert.equal(recordOutput.receipts[0].authority_boundary.can_claim_production_ready, false);
    assert.equal(recordOutput.receipts[0].authority_boundary.can_create_domain_owner_receipt, false);

    const fullOutput = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], {
      OPL_STATE_DIR: stateRoot,
    });
    const followthrough =
      fullOutput.app_operator_drilldown.opl_meta_agent_workbench_refs
        .production_consumption_followthrough;
    assert.equal(followthrough.summary.pending_verify_long_soak_receipt_ref_count, 1);
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
