import { assert } from '../helpers.ts';

type JsonRecord = Record<string, any>;

export function assertAuditOnlySourcePurityTail(tail: JsonRecord, expected: {
  hiddenClearedCount: number;
  privateResidueCount: number;
}) {
  assert.equal(tail.default_action_required_count, 0);
  assert.equal(tail.action_required_blocker_count, 0);
  assert.equal(tail.hidden_cleared_audit_ledger_count, expected.hiddenClearedCount);
  assert.equal(tail.private_platform_residue_inventory_audit_only_count, expected.privateResidueCount);
  assert.equal(tail.private_platform_residue_inventory_counts_as_action_required, false);
  assert.equal(tail.private_platform_residue_inventory_counts_as_blocker, false);
  assert.equal(tail.physical_delete_authorized, false);
  assert.equal(tail.physical_delete_authority, 'not_authorized_by_descriptor_or_app_read_model');
  assert.equal(tail.source_purity_tail_status, 'audit_only_tail_traceable_no_action_required_blocker');
  assert.equal(
    tail.source_purity_tail_policy,
    'physical_delete_requires_separate_domain_owner_receipt_or_typed_blocker_no_active_caller_no_forbidden_write_and_replacement_parity',
  );
}

export function assertOmaDescriptorProjection(oma: JsonRecord) {
  const descriptor = oma.family_agent_descriptor;
  assert.equal(descriptor.project_id, 'opl-meta-agent');
  assert.equal(descriptor.manifest_status, 'resolved');
  assert.equal(descriptor.descriptor_status, 'descriptor_surfaces_resolved');
  assert.equal(descriptor.entry.agent_id, 'opl-meta-agent');
  assert.equal(descriptor.entry.manifest_command, 'opl-hosted:standard-contract-descriptor-adapter');
  assert.equal(descriptor.binding_id, 'opl_hosted_standard_contract_descriptor_adapter');
  assert.equal(descriptor.family_action_catalog.action_count, 1);
  assert.equal(descriptor.family_stage_control_plane.stage_count, 1);
  assert.equal(descriptor.domain_memory_descriptor.status, 'resolved');
  assert.equal(descriptor.runtime_surfaces.runtime_inventory.runtime_owner, 'one-person-lab');
  assert.equal(descriptor.runtime_surfaces.runtime_inventory.domain_owner, 'opl-meta-agent');
  assert.equal(descriptor.runtime_surfaces.progress_projection.status, 'resolved');
  assert.equal(descriptor.generated_surface_handoff_contract.domain_repo_can_own_generated_surface, false);
  assert.equal(descriptor.functional_privatization_audit.summary.total_module_count, 2);
  assert.equal(descriptor.functional_privatization_audit.summary.active_private_generic_residue_count, 0);
  assert.equal(descriptor.non_authority_flags.opl_owns_domain_truth, false);
  assert.equal(descriptor.non_authority_flags.opl_owns_artifact_authority, false);
}
