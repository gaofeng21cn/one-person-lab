import { assert, fs, os, path, runCli, test } from '../helpers.ts';
import {
  recordAppReleaseUserPathEvidenceReceipts,
} from '../../../../src/app-release-user-path-evidence-ledger.ts';

function withTempState<T>(prefix: string, run: (stateRoot: string) => T) {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const previousStateDir = process.env.OPL_STATE_DIR;
  try {
    process.env.OPL_STATE_DIR = stateRoot;
    return run(stateRoot);
  } finally {
    if (previousStateDir === undefined) {
      delete process.env.OPL_STATE_DIR;
    } else {
      process.env.OPL_STATE_DIR = previousStateDir;
    }
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
}

test('runtime App drilldown consumes App release user-path evidence receipts', () => {
  withTempState('opl-app-release-user-path-ledger-state-', (stateRoot) => {
    const record = recordAppReleaseUserPathEvidenceReceipts([{
      release_package_refs: ['release://opl-app/full/2026-05-22/dmg'],
      screenshot_refs: ['screenshot://opl-app/first-run/2026-05-22.png'],
      reload_prompt_user_path_refs: ['receipt://opl-app/reload-prompt/2026-05-22'],
      provider_state_linkage_refs: ['provider://temporal/cadence-window/2026-05-22'],
      long_operator_evidence_refs: ['soak://opl-app/operator/2026-05-22'],
    }]);
    assert.equal(record.status, 'recorded');
    assert.equal(record.recorded_receipt_count, 1);

    const output = runCli(['runtime', 'app-operator-drilldown'], {
      OPL_STATE_DIR: stateRoot,
    }).app_operator_drilldown;
    assert.equal(output.summary.app_release_user_path_evidence_open_gate_count, 0);
    assert.equal(output.summary.app_release_user_path_evidence_ledger_receipt_ref_count, 1);
    assert.equal(output.summary.app_release_user_path_evidence_typed_blocker_ref_count, 0);
    assert.equal(output.summary.app_release_user_path_production_user_path_ready, false);
    assert.equal(output.summary.app_release_user_path_release_ready_claimed, false);
    assert.equal(output.summary.app_release_user_path_production_ready_claimed, false);

    const evidence = output.attention_first_payload.evidence_after_contract
      .app_release_user_path_evidence;
    assert.equal(evidence.status, 'app_release_user_path_evidence_refs_observed');
    assert.equal(evidence.refs_observed_for_all_gates, true);
    assert.equal(evidence.production_user_path_ready, false);
    assert.equal(evidence.release_ready_claimed, false);
    assert.equal(evidence.production_ready_claimed, false);
    assert.equal(evidence.open_gate_count, 0);
    assert.deepEqual(evidence.open_gate_ids, []);
    assert.equal(evidence.gate_items.length, 0);
    assert.equal(evidence.ledger_receipt_ref_count, 1);
    assert.equal(evidence.authority_boundary.can_close_app_release_user_path, false);
  });
});

test('runtime App drilldown keeps typed blocker refs as operator attention', () => {
  withTempState('opl-app-release-user-path-blocker-state-', (stateRoot) => {
    recordAppReleaseUserPathEvidenceReceipts([{
      typed_blocker_refs: ['typed-blocker://opl-app/release-user-path/screenshot-missing'],
    }]);

    const output = runCli(['runtime', 'app-operator-drilldown'], {
      OPL_STATE_DIR: stateRoot,
    }).app_operator_drilldown;
    assert.equal(output.summary.app_release_user_path_evidence_open_gate_count, 5);
    assert.equal(output.summary.app_release_user_path_evidence_ledger_receipt_ref_count, 1);
    assert.equal(output.summary.app_release_user_path_evidence_typed_blocker_ref_count, 1);

    const evidence = output.attention_first_payload.evidence_after_contract
      .app_release_user_path_evidence;
    assert.equal(evidence.status, 'app_release_user_path_evidence_open');
    assert.equal(evidence.blocked_by_typed_blocker_refs, true);
    assert.equal(evidence.typed_blocker_ref_count, 1);
    assert.equal(evidence.production_user_path_ready, false);
    assert.equal(evidence.refs_observed_for_all_gates, false);

    const nextStep = output.attention_first_payload.evidence_next_steps.items.find(
      (item: { step_kind: string }) => item.step_kind === 'app_release_user_path_evidence',
    );
    assert.equal(Boolean(nextStep), true);
    assert.equal(nextStep.blocked_by_typed_blocker_refs, true);
    assert.equal(nextStep.typed_blocker_ref_count, 1);
    assert.equal(nextStep.can_close_app_release_user_path, false);
  });
});
