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

const clearedActiveAdapterModule = {
  module_id: 'lifecycle_adapter',
  migration_class: 'refs_only_domain_adapter',
  standardization_layer: 'private_platform_residue_inventory',
  current_owner: 'med-autogrant',
  active_caller_status: 'active_refs_only_adapter_no_generic_lifecycle_owner',
  active_callers: [
    'product status shell',
  ],
  current_surface_refs: [
    '/mag_consumer_thinning_contract/lifecycle_adapter',
  ],
  expected_opl_primitives: [
    'opl_lifecycle_index',
  ],
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
  audit.modules.push(clearedActiveAdapterModule);
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
  assert.deepEqual(step.payload_template, {
    semantic_equivalence_proof_refs: [],
    opl_generated_or_hosted_surface_consumption_refs: [],
    domain_owner_receipt_refs: [],
    typed_blocker_refs: [],
    no_regression_evidence_refs: [],
  });
  assert.deepEqual(
    step.copyable_runtime_action_execute_commands.record_with_payload,
    [
      'runtime',
      'action',
      'execute',
      '--action',
      'functional_privatization_semantic_equivalence:medautoscience:codex_executor_adapter:record',
      '--payload-file',
      '<payload.json>',
    ],
  );
  assert.equal(step.route_requires_domain_or_app_payload, true);
  assert.equal(step.can_submit_record_to_safe_action_shell, true);
  assert.equal(step.can_write_domain_truth, false);
  assert.equal(step.can_create_owner_receipt, false);
  assert.equal(step.can_claim_private_residue_deleted, false);
  assert.equal(step.full_detail_section, 'functional_privatization_audit_refs');
}

export function assertFunctionalPrivatizationActionRoute(fullDrilldown: any) {
  const route = fullDrilldown.operator_action_routing_refs.refs.find(
    (item: { action_id: string }) =>
      item.action_id
        === 'functional_privatization_semantic_equivalence:medautoscience:codex_executor_adapter:record',
  );
  assert.equal(Boolean(route), true);
  assert.equal(route.action_kind, 'functional_privatization_semantic_equivalence_receipt_record');
  assert.equal(route.execution_surface, 'opl runtime action execute');
  assert.equal(route.route_requires_domain_or_app_payload, true);
  assert.equal(route.creates_domain_action, false);
  assert.equal(route.creates_owner_receipt, false);
  assert.equal(route.closes_private_residue, false);
  assert.equal(route.authority_boundary.can_write_domain_truth, false);
}

export function assertFunctionalPrivatizationFullDetail(summaryDrilldown: any, fullDrilldown: any) {
  assert.equal(
    fullDrilldown.functional_privatization_audit_refs.surface_kind,
    'opl_app_drilldown_functional_privatization_audit_refs',
  );
  assert.equal(fullDrilldown.functional_privatization_audit_refs.domains.length, 2);
  const medautoscienceAudit = fullDrilldown.functional_privatization_audit_refs.domains.find(
    (domain: { domain_id: string }) => domain.domain_id === 'medautoscience',
  );
  assert.equal(Boolean(medautoscienceAudit), true);
  assert.equal(
    fullDrilldown.functional_privatization_audit_refs.domains.some(
      (domain: { domain_id: string }) => domain.domain_id === 'opl-meta-agent',
    ),
    true,
  );
  assert.equal(
    medautoscienceAudit.private_platform_residue_inventory.length,
    medautoscienceAudit.summary
      .private_platform_residue_inventory_count,
  );
  assert.equal(
    medautoscienceAudit.authority_boundary
      .can_write_domain_truth,
    false,
  );
  assert.equal(
    fullDrilldown.functional_privatization_audit_refs.summary.private_platform_residue_inventory_count,
    summaryDrilldown.summary.functional_privatization_private_platform_residue_inventory_count,
  );
  assert.deepEqual(
    summaryDrilldown.summary.functional_privatization_source_purity_tail_read_model,
    fullDrilldown.functional_privatization_audit_summary.source_purity_tail_read_model,
  );
  assert.deepEqual(
    fullDrilldown.functional_privatization_audit_refs.summary.source_purity_tail_read_model,
    fullDrilldown.functional_privatization_audit_summary.source_purity_tail_read_model,
  );
  assert.equal(
    fullDrilldown.functional_privatization_audit_refs.summary.source_purity_tail_read_model
      .private_platform_residue_inventory_audit_only_count,
    fullDrilldown.functional_privatization_audit_refs.summary.private_platform_residue_inventory_count,
  );
  assert.equal(
    fullDrilldown.functional_privatization_audit_refs.summary.source_purity_tail_read_model
      .private_platform_residue_inventory_counts_as_action_required,
    false,
  );
  assert.equal(
    fullDrilldown.functional_privatization_audit_refs.summary.source_purity_tail_read_model
      .physical_delete_authorized,
    false,
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
  assertFunctionalPrivatizationActionRoute(fullDrilldown);
}
