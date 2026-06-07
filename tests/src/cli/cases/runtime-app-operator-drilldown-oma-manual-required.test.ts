import { assert, fs, os, path, runCli, test } from '../helpers.ts';
import {
  createGitModuleRemoteFixture,
  runGitFixtureCommand,
} from '../helpers-parts/family-fixtures.ts';

test('runtime app-operator-drilldown explains OMA managed install receipt manual-required route', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-drilldown-oma-manual-state-'));
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-drilldown-oma-manual-home-'));
  const moduleRemote = createGitModuleRemoteFixture('opl-meta-agent');
  const developerCheckout = path.join(homeRoot, 'opl-meta-agent');
  try {
    runGitFixtureCommand(homeRoot, ['clone', moduleRemote.remoteRoot, developerCheckout]);
    fs.writeFileSync(path.join(developerCheckout, 'LOCAL_EDIT.txt'), 'dirty\n', 'utf8');
    const output = runCli(['runtime', 'app-operator-drilldown'], {
      OPL_STATE_DIR: stateRoot,
      OPL_MODULE_PATH_OPLMETAAGENT: developerCheckout,
    });
    const attention =
      output.app_operator_drilldown.attention_first_payload.evidence_after_contract
        .oma_production_consumption_followthrough;
    if (attention.structural_consumption_ready !== true) {
      return;
    }

    const managedGate = attention.gate_items.find(
      (gate: { gate_id: string }) => gate.gate_id === 'managed_install_update_refs',
    );
    assert.equal(managedGate.status, 'manual_required_before_managed_install_update_refs');
    assert.equal(managedGate.manual_required, true);
    assert.deepEqual(managedGate.manual_required_blockers, [
      'developer_checkout_visible_not_app_managed',
      'dirty_checkout',
    ]);
    assert.equal(managedGate.manual_required_reason, 'developer_checkout_visible_not_app_managed');
    assert.equal(
      managedGate.managed_install_update_followthrough.module.install_origin,
      'env_override',
    );
    assert.equal(managedGate.managed_install_update_followthrough.module.health_status, 'dirty');
    assert.equal(
      managedGate.next_safe_action.action_id,
      'review_oplmetaagent_developer_checkout_before_startup_maintenance',
    );
    assert.equal(managedGate.next_safe_action.command, 'opl connect modules');
    assert.equal(managedGate.next_safe_action.after_manual_resolution_command, 'opl system startup-maintenance');
    assert.equal(managedGate.next_safe_action.can_write_domain_truth, false);
    assert.equal(managedGate.next_safe_action.can_create_owner_receipt, false);
    assert.equal(managedGate.next_safe_action.can_claim_production_ready, false);

    const omaStep = output.app_operator_drilldown.attention_first_payload.evidence_next_steps.items.find(
      (step: { step_kind: string }) => step.step_kind === 'oma_production_consumption_followthrough',
    );
    const managedStepGate = omaStep.required_refs_by_gate.find(
      (gate: { gate_id: string }) => gate.gate_id === 'managed_install_update_refs',
    );
    assert.equal(managedStepGate.manual_required, true);
    assert.deepEqual(managedStepGate.manual_required_blockers, [
      'developer_checkout_visible_not_app_managed',
      'dirty_checkout',
    ]);
    assert.equal(
      managedStepGate.next_safe_action.action_id,
      'review_oplmetaagent_developer_checkout_before_startup_maintenance',
    );
    assert.equal(omaStep.can_claim_production_ready, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(moduleRemote.fixtureRoot, { recursive: true, force: true });
  }
});
