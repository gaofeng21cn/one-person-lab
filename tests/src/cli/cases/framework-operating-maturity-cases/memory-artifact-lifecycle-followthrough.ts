import { assert, fs, os, path, runCli, test } from '../../helpers.ts';
import { createFamilyDefaultContractWorkspace } from '../domain-pack-compiler-fixtures.ts';

test('framework operating maturity projects lifecycle typed blocker follow-through without ready claims', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-operating-maturity-lifecycle-blocker-'));
  const workspaceRoot = createFamilyDefaultContractWorkspace();
  try {
    const env: Record<string, string> = {
      OPL_STATE_DIR: stateRoot,
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
    };
    runCli([
      'family-runtime',
      'lifecycle',
      'apply',
      '--mode',
      'dry-run',
      '--domain',
      'medautoscience',
      '--handoff',
      JSON.stringify({
        surface_kind: 'artifact_lifecycle_physical_thinning_handoff',
        handoff_ref: 'mas-artifact-lifecycle-handoff:medautoscience:physical-thinning:maturity',
        body_free: true,
        candidate_count: 2,
        candidate_refs: [
          'mas-artifact-lifecycle-candidate:medautoscience:regenerate-projection:maturity-one',
          'mas-artifact-lifecycle-candidate:medautoscience:regenerate-projection:maturity-two',
        ],
        selected_payload_path: 'typed_blocker_path',
        typed_blocker_refs: [
          'mas-artifact-lifecycle-typed-blocker:medautoscience:canonical-regeneration-required:maturity',
        ],
        next_owner_action: {
          owner: 'one-person-lab',
          action: 'generic_lifecycle_apply',
        },
      }),
    ], env);

    const maturity = runCli([
      'framework',
      'operating-maturity',
      '--family-defaults',
    ], env).framework_operating_maturity;

    assert.equal(maturity.summary.memory_artifact_lifecycle_open_count, 1);
    assert.equal(maturity.memory_artifact_lifecycle.open_evidence_count, 1);
    assert.equal(
      maturity.memory_artifact_lifecycle.status,
      'evidence_required',
    );
    assert.equal(
      maturity.memory_artifact_lifecycle.lifecycle_owner_work_order_status,
      'typed_blocker_work_order_required_not_ready',
    );
    assert.equal(maturity.memory_artifact_lifecycle.lifecycle_owner_work_order_open_count, 1);
    assert.equal(
      maturity.memory_artifact_lifecycle.lifecycle_typed_blocker_work_order_status,
      'typed_blocker_refs_observed_followthrough_required',
    );
    assert.equal(
      maturity.memory_artifact_lifecycle.lifecycle_typed_blocker_selected_payload_path,
      'typed_blocker_path',
    );
    assert.equal(maturity.memory_artifact_lifecycle.lifecycle_typed_blocker_ref_count, 1);
    assert.deepEqual(
      maturity.memory_artifact_lifecycle.lifecycle_latest_typed_blocker_refs,
      [
        'mas-artifact-lifecycle-typed-blocker:medautoscience:canonical-regeneration-required:maturity',
      ],
    );
    assert.deepEqual(
      maturity.memory_artifact_lifecycle.missing_owner_action_ids,
      ['memory_artifact_lifecycle_owner_receipt_or_typed_blocker_required'],
    );
    assert.equal(
      maturity.memory_artifact_lifecycle.next_evidence_action,
      'domain_owner_record_memory_artifact_lifecycle_receipt_or_typed_blocker',
    );
    assert.equal(
      maturity.memory_artifact_lifecycle.owner_action_checklist[0].status,
      'typed_blocker_work_order_required_not_ready',
    );
    assert.deepEqual(
      maturity.memory_artifact_lifecycle.owner_action_checklist[0].latest_typed_blocker_refs,
      [
        'mas-artifact-lifecycle-typed-blocker:medautoscience:canonical-regeneration-required:maturity',
      ],
    );
    assert.equal(
      maturity.memory_artifact_lifecycle.owner_action_checklist[0].closes_memory_or_artifact_ready,
      false,
    );
    assert.equal(
      maturity.memory_artifact_lifecycle.owner_action_checklist[0].ready_claim_authorized,
      false,
    );
    const lifecycleWorkOrder = maturity.foundry_agent_os_production_evidence_gate
      .owner_route_work_orders.find(
        (entry: { lane: string }) => entry.lane === 'memory_artifact_lifecycle_apply',
      );
    assert.equal(lifecycleWorkOrder.open_count, 1);
    assert.deepEqual(
      lifecycleWorkOrder.missing_owner_action_ids,
      ['memory_artifact_lifecycle_owner_receipt_or_typed_blocker_required'],
    );
    assert.equal(
      lifecycleWorkOrder.next_evidence_action,
      'domain_owner_record_memory_artifact_lifecycle_receipt_or_typed_blocker',
    );
    assert.equal(
      lifecycleWorkOrder.owner_action_checklist[0].typed_blocker_work_order_status,
      'typed_blocker_refs_observed_followthrough_required',
    );
    assert.deepEqual(
      lifecycleWorkOrder.owner_action_checklist[0].latest_typed_blocker_refs,
      [
        'mas-artifact-lifecycle-typed-blocker:medautoscience:canonical-regeneration-required:maturity',
      ],
    );
    assert.equal(lifecycleWorkOrder.ready_claim_authorized, false);
    assert.equal(maturity.authority_boundary.can_write_memory_body, false);
    assert.equal(maturity.authority_boundary.can_mutate_artifact_body, false);
    assert.equal(maturity.authority_boundary.can_claim_production_ready, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});
