import { assert } from '../helpers.ts';
import { buildManyStageManifest } from './runtime-app-operator-drilldown-summary-fixtures.ts';

type ManyStageManifest = ReturnType<typeof buildManyStageManifest>;
type JsonRecord = Record<string, unknown>;

const reviewRequiredModule = {
  module_id: 'codex_executor_adapter',
  migration_class: 'refs_only_domain_adapter',
  standardization_layer: 'private_platform_residue_inventory',
  current_owner: 'med-autoscience',
  active_caller_status: 'active_caller_opl_attempt_shell_pending',
  active_callers: [
    'domain entry contract',
    'runtime route executor tests',
  ],
  current_surface_refs: [
    '/domain_entry_contract/executor',
  ],
  expected_opl_primitives: [
    'agent_executor_adapter',
  ],
  semantic_equivalence_status: 'review_required',
  semantic_equivalence_reason:
    'active_caller_wording_requires_opl_semantic_equivalence_proof',
  bridge_exit_gate: {
    gate_id: 'codex_executor_adapter_bridge_exit_gate',
    current_status: 'bridge_until_exit_gates_pass',
    replacement_owner: 'opl',
    replacement_surface: 'opl_agent_executor_adapter',
    exit_gate_ref: '/domain_entry_contract/executor',
    required_before_retire: [
      'domain_authority_refs_preserved',
      'no_regression_proof_recorded',
    ],
    can_delete_without_no_active_caller_proof: false,
    declares_replacement_complete: false,
    opl_can_issue_owner_receipt: false,
  },
};

export function markFunctionalPrivatizationReviewRequired(manifest: ManyStageManifest) {
  manifest.functional_privatization_audit = {
    surface_kind: 'functional_privatization_audit',
    target_domain_id: manifest.target_domain_id,
    modules: [],
  };
  const audit = manifest.functional_privatization_audit as {
    modules: JsonRecord[];
  };
  audit.modules.push(reviewRequiredModule);
}

export function assertFunctionalPrivatizationReviewRequiredSummary(summaryDrilldown: any) {
  assert.equal(summaryDrilldown.summary.functional_privatization_action_required_count, 1);
  assert.equal(
    summaryDrilldown.summary.functional_privatization_semantic_equivalence_review_count,
    1,
  );
}

export function assertFunctionalPrivatizationNextStep(summaryDrilldown: any) {
  const step = summaryDrilldown.attention_first_payload.evidence_next_steps.items.find(
    (item: { step_kind: string }) =>
      item.step_kind === 'functional_privatization_semantic_equivalence_followthrough',
  );
  assert.equal(Boolean(step), true);
  assert.equal(step.owner, 'med-autoscience');
  assert.equal(step.module_id, 'codex_executor_adapter');
  assert.equal(step.semantic_equivalence_status, 'review_required');
  assert.equal(step.required_refs_any_of.includes('semantic_equivalence_proof_ref'), true);
  assert.equal(step.required_refs_any_of.includes('domain_owned_typed_blocker_ref'), true);
  assert.equal(step.can_write_domain_truth, false);
  assert.equal(step.can_create_owner_receipt, false);
  assert.equal(step.can_claim_private_residue_deleted, false);
  assert.equal(step.full_detail_section, 'functional_privatization_audit_refs');
}

export function assertFunctionalPrivatizationFullDetail(summaryDrilldown: any, fullDrilldown: any) {
  assert.equal(
    fullDrilldown.functional_privatization_audit_refs.surface_kind,
    'opl_app_drilldown_functional_privatization_audit_refs',
  );
  assert.equal(fullDrilldown.functional_privatization_audit_refs.domains.length, 1);
  assert.equal(fullDrilldown.functional_privatization_audit_refs.domains[0].domain_id, 'medautoscience');
  assert.equal(
    fullDrilldown.functional_privatization_audit_refs.domains[0]
      .private_platform_residue_inventory.length,
    fullDrilldown.functional_privatization_audit_refs.domains[0].summary
      .private_platform_residue_inventory_count,
  );
  assert.equal(
    fullDrilldown.functional_privatization_audit_refs.domains[0].authority_boundary
      .can_write_domain_truth,
    false,
  );
  assert.equal(
    fullDrilldown.functional_privatization_audit_refs.summary.private_platform_residue_inventory_count,
    summaryDrilldown.summary.functional_privatization_private_platform_residue_inventory_count,
  );
  assert.equal(
    summaryDrilldown.summary.functional_privatization_hidden_cleared_count,
    fullDrilldown.functional_privatization_audit_summary.default_hidden_cleared_count,
  );
  assertFunctionalPrivatizationReviewRequiredSummary(summaryDrilldown);
  assert.equal(
    fullDrilldown.functional_privatization_audit_refs.authority_boundary.can_write_memory_body,
    false,
  );
}
