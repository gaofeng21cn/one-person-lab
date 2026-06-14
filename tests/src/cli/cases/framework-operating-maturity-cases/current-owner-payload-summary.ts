import { assert, fs, os, path, runCli, test } from '../../helpers.ts';
import { createFamilyDefaultContractWorkspace } from '../domain-pack-compiler-fixtures.ts';

test('framework operating maturity reads current owner delta payload summary without claiming pointer closeout', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-operating-maturity-current-owner-answer-'));
  const workspaceRoot = createFamilyDefaultContractWorkspace();
  try {
    const env: Record<string, string> = {
      OPL_STATE_DIR: stateRoot,
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
    };
    const before = runCli([
      'framework',
      'operating-maturity',
      '--family-defaults',
    ], env).framework_operating_maturity;
    const target = before.current_owner_delta_bridge.owner_answer_closure_handoff
      .record_target_identity_template;
    assert.equal('task_or_study_ref' in target, true);
    assert.equal('lineage_ref' in target, true);
    assert.equal('source_fingerprint' in target, true);
    assert.equal(
      target.source_fingerprint,
      before.current_owner_delta_bridge.source_fingerprint,
    );
    const record = runCli([
      'runtime',
      'domain-owner-payload-summary',
      'record',
      '--target-identity',
      JSON.stringify(target),
      '--payload',
      JSON.stringify({
        domain_owner_receipt_refs: [
          'domain-owner-receipt-ref:mas/current-owner-delta/owner-answer',
        ],
        quality_gate_receipt_refs: [
          'quality-gate-receipt-ref:mas/current-owner-delta/review',
        ],
      }),
    ], env).domain_owner_payload_summary_ledger_record;
    runCli([
      'runtime',
      'domain-owner-payload-summary',
      'verify',
      '--receipt-ref',
      record.receipt_refs[0],
    ], env);

    const maturity = runCli([
      'framework',
      'operating-maturity',
      '--family-defaults',
    ], env).framework_operating_maturity;
    assert.equal(maturity.current_owner_delta_bridge.owner_answer_missing, true);
    assert.equal(maturity.current_owner_delta_bridge.owner_answer_still_required, true);
    assert.equal(
      maturity.current_owner_delta_bridge.owner_payload_summary_observed,
      true,
    );
    assert.equal(
      maturity.current_owner_delta_bridge.owner_payload_summary_verified,
      true,
    );
    assert.equal(
      maturity.current_owner_delta_bridge.owner_payload_summary_closure_state,
      'verified_owner_payload_summary_observed_not_current_pointer_claim',
    );
    assert.deepEqual(
      maturity.current_owner_delta_bridge.observed_owner_answer_ref_shapes,
      ['domain_owner_receipt_ref', 'quality_or_export_receipt_ref'],
    );
    assert.equal(
      maturity.current_owner_delta_bridge.observed_owner_answer_refs.includes(
        'domain-owner-receipt-ref:mas/current-owner-delta/owner-answer',
      ),
      true,
    );
    assert.equal(
      maturity.current_owner_delta_bridge.owner_answer_closure_handoff.status,
      'owner_payload_summary_observed_not_current_pointer_claim',
    );
    assert.equal(
      maturity.current_owner_delta_bridge.owner_answer_closure_handoff
        .current_pointer_update_still_required,
      true,
    );
    assert.equal(
      maturity.current_owner_delta_bridge.owner_answer_closure_handoff
        .verified_owner_payload_summary_receipt_refs.includes(record.receipt_refs[0]),
      true,
    );
    const currentOwnerGate = maturity.unresolved_owner_gates.gates.find(
      (entry: { gate_id: string }) =>
        entry.gate_id === 'owner-gate:current_owner_delta_owner_answer',
    );
    assert.deepEqual(currentOwnerGate.observed_ref_shapes, [
      'domain_owner_receipt_ref',
      'quality_or_export_receipt_ref',
    ]);
    assert.equal(
      currentOwnerGate.observed_owner_answer_refs.includes(
        'domain-owner-receipt-ref:mas/current-owner-delta/owner-answer',
      ),
      true,
    );
    assert.equal(
      currentOwnerGate.observed_owner_payload_summary_receipt_refs.includes(
        record.receipt_refs[0],
      ),
      true,
    );
    assert.equal(
      currentOwnerGate.verified_owner_payload_summary_receipt_refs.includes(
        record.receipt_refs[0],
      ),
      true,
    );
    assert.equal(
      currentOwnerGate.owner_payload_summary_closure_state,
      'verified_owner_payload_summary_observed_not_current_pointer_claim',
    );
    assert.equal(currentOwnerGate.current_pointer_update_still_required, true);
    assert.equal(currentOwnerGate.observed_refs_are_current_pointer_closeout, false);
    assert.equal(
      currentOwnerGate.can_be_completed_by_opl,
      false,
    );
    assert.equal(maturity.authority_boundary.can_claim_production_ready, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('framework operating maturity rejects stale current owner payload summaries for a moved pointer', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-operating-maturity-stale-current-owner-answer-'));
  const workspaceRoot = createFamilyDefaultContractWorkspace();
  try {
    const env: Record<string, string> = {
      OPL_STATE_DIR: stateRoot,
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
    };
    const before = runCli([
      'framework',
      'operating-maturity',
      '--family-defaults',
    ], env).framework_operating_maturity;
    const target = before.current_owner_delta_bridge.owner_answer_closure_handoff
      .record_target_identity_template;
    const staleTarget = {
      ...target,
      task_or_study_ref: 'medautoscience:stale-workstream',
      lineage_ref: 'sat_stale_owner_answer',
      source_fingerprint: 'owner_delta_first:stale',
    };
    const record = runCli([
      'runtime',
      'domain-owner-payload-summary',
      'record',
      '--target-identity',
      JSON.stringify(staleTarget),
      '--payload',
      JSON.stringify({
        typed_blocker_refs: [
          'typed-blocker-ref:mas/stale-current-owner-delta/old-attempt',
        ],
      }),
    ], env).domain_owner_payload_summary_ledger_record;
    runCli([
      'runtime',
      'domain-owner-payload-summary',
      'verify',
      '--receipt-ref',
      record.receipt_refs[0],
    ], env);

    const maturity = runCli([
      'framework',
      'operating-maturity',
      '--family-defaults',
    ], env).framework_operating_maturity;
    assert.equal(maturity.current_owner_delta_bridge.owner_answer_missing, true);
    assert.equal(maturity.current_owner_delta_bridge.owner_answer_still_required, true);
    assert.equal(
      maturity.current_owner_delta_bridge.owner_payload_summary_observed,
      false,
    );
    assert.equal(
      maturity.current_owner_delta_bridge.owner_payload_summary_verified,
      false,
    );
    assert.deepEqual(
      maturity.current_owner_delta_bridge.observed_owner_answer_refs,
      [],
    );
    assert.deepEqual(
      maturity.current_owner_delta_bridge.observed_owner_answer_ref_shapes,
      [],
    );
    assert.equal(
      maturity.current_owner_delta_bridge.stale_owner_payload_summary_receipt_refs.includes(
        record.receipt_refs[0],
      ),
      true,
    );
    assert.equal(
      maturity.current_owner_delta_bridge.owner_answer_closure_handoff.status,
      'domain_owner_payload_required',
    );
    assert.equal(
      maturity.current_owner_delta_bridge.owner_answer_closure_handoff
        .current_pointer_update_still_required,
      false,
    );
    assert.equal(maturity.current_owner_delta_bridge.latest_owner_answer_ref, null);
    assert.equal(maturity.authority_boundary.can_claim_production_ready, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});
