import { assert, fs, path, repoRoot, runCli, test } from '../helpers.ts';
import { buildReadyAgentRepo, writeJson } from './agents-conformance-fixtures.ts';

test('agents default-callers blocks private generic owner claims without authorizing deletion', () => {
  const repoDir = buildReadyAgentRepo();
  const functionalAuditPath = path.join(repoDir, 'contracts', 'functional_privatization_audit.json');
  const functionalAudit = JSON.parse(fs.readFileSync(functionalAuditPath, 'utf8'));
  functionalAudit.authority_boundary.domain_can_claim_generic_runtime_owner = true;
  writeJson(functionalAuditPath, functionalAudit);

  const defaultCallers = runCli([
    'agents',
    'default-callers',
    '--agent',
    `sample=${repoDir}`,
  ]).agent_default_caller_readiness;

  assert.equal(defaultCallers.status, 'blocked');
  assert.equal(defaultCallers.blocked_count, 1);
  assert.equal(defaultCallers.default_caller_delete_ready, false);
  assert.equal(defaultCallers.physical_delete_authorized, false);
  assert.equal(defaultCallers.physical_delete_authorization_status, 'not_authorized_by_opl_projection');
  assert.equal(
    defaultCallers.physical_delete_authority_read_model.status,
    'not_authorized_by_opl_projection',
  );
  assert.equal(defaultCallers.physical_delete_authority_read_model.physical_delete_authorized, false);
  assert.equal(
    defaultCallers.physical_delete_authority_read_model.repo_deletion_gate_summary[0]
      .all_deletion_evidence_requirements_observed,
    false,
  );
  assert.equal(
    defaultCallers.repo_deletion_gate_summary[0].physical_delete_authorization_status,
    'not_authorized_by_opl_projection',
  );
  assert.equal(
    defaultCallers.physical_delete_blocked_by.includes('generated_default_caller_readiness_is_not_delete_authority'),
    true,
  );
  assert.equal(defaultCallers.summary.blocked_count, 1);
  assert.equal(defaultCallers.reports[0].status, 'blocked');
  assert.equal(
    defaultCallers.reports[0].blockers.includes('platform_surface_ownership_blocked'),
    true,
  );
  assert.equal(defaultCallers.reports[0].deletion_gate.replacement_parity, 'blocked');
  assert.equal(defaultCallers.reports[0].deletion_gate.physical_delete_authorized, false);
  assert.equal(defaultCallers.authority_boundary.report_can_claim_production_ready, false);
  assert.equal(defaultCallers.authority_boundary.report_can_authorize_domain_repo_physical_delete, false);
});

test('agents default-callers waits for structural prerequisites before delete or keep owner choice', () => {
  const repoDir = buildReadyAgentRepo();

  const defaultCallersPayload = runCli([
    'agents',
    'default-callers',
    '--agent',
    `sample=${repoDir}`,
  ]);
  const defaultCallers = defaultCallersPayload.agent_default_caller_readiness;
  const report = defaultCallers.reports[0];

  assert.equal(defaultCallers.status, 'ready_domain_evidence_required');
  assert.equal(defaultCallers.missing_no_active_caller_proof_count, 0);
  assert.equal(defaultCallers.missing_no_forbidden_write_proof_count, 8);
  assert.equal(defaultCallers.missing_tombstone_or_provenance_ref_count, 8);
  assert.equal(
    defaultCallers.physical_delete_authority_read_model
      .delete_or_keep_prerequisites_observed,
    false,
  );
  assert.equal(
    defaultCallers.physical_delete_authority_read_model.active_legacy_caller_deletion_gate.status,
    'active_worklist_open',
  );
  assert.deepEqual(
    defaultCallers.active_legacy_caller_deletion_gate,
    defaultCallers.physical_delete_authority_read_model.active_legacy_caller_deletion_gate,
  );
  assert.deepEqual(
    defaultCallersPayload.active_legacy_caller_deletion_gate,
    defaultCallers.active_legacy_caller_deletion_gate,
  );
  assert.equal(
    defaultCallers.physical_delete_authority_read_model.active_legacy_caller_deletion_gate
      .executable_next_action,
    'inspect_active_deletion_evidence_worklists',
  );
  assert.deepEqual(
    defaultCallers.physical_delete_authority_read_model.active_legacy_caller_deletion_gate
      .missing_gate_ids,
    ['no_forbidden_write_proof', 'tombstone_or_provenance_ref'],
  );
  assert.equal(
    defaultCallers.physical_delete_authority_read_model.active_legacy_caller_deletion_gate
      .authority_boundary.read_model_can_authorize_physical_delete,
    false,
  );
  assert.equal(
    defaultCallers.physical_delete_authority_read_model.next_required_owner_action,
    'domain_repo_owner_physical_delete_receipt_or_typed_blocker_after_surface_review',
  );
  assert.deepEqual(
    defaultCallers.physical_delete_authority_read_model.accepted_refs_only_result_shapes,
    ['typed_blocker_ref'],
  );
  assert.equal(
    defaultCallers.repo_deletion_gate_summary[0].delete_or_keep_prerequisites_observed,
    false,
  );
  assert.equal(
    report.deletion_gate.delete_or_keep_prerequisites_observed,
    false,
  );
  assert.equal(
    report.deletion_evidence_worklists.every((worklist: {
      delete_or_keep_prerequisites_observed: boolean;
      next_required_owner_action: string;
      accepted_refs_only_result_shapes: string[];
    }) => (
      worklist.delete_or_keep_prerequisites_observed === false
      && worklist.next_required_owner_action
        === 'domain_repo_owner_physical_delete_receipt_or_typed_blocker_after_surface_review'
      && worklist.accepted_refs_only_result_shapes.length === 1
      && worklist.accepted_refs_only_result_shapes[0] === 'typed_blocker_ref'
    )),
    true,
  );
});

test('agents default-callers treats fully observed deletion evidence as refs-only input', () => {
  const repoDir = buildReadyAgentRepo();
  const functionalAuditPath = path.join(repoDir, 'contracts', 'functional_privatization_audit.json');
  const functionalAudit = JSON.parse(fs.readFileSync(functionalAuditPath, 'utf8'));
  const bridgeExitGate = {
    owner_receipt_refs: ['owner-receipt:sample/default-caller-delete-reviewed'],
    no_active_caller_refs: ['no-active-caller:sample/default-caller-delete'],
    no_forbidden_write_refs: ['no-forbidden-write:sample/default-caller-delete'],
    tombstone_refs: ['tombstone:sample/default-caller-delete'],
    provenance_refs: ['provenance:sample/default-caller-delete'],
    physical_delete_authorized: false,
    authority_boundary: {
      can_authorize_domain_repo_physical_delete: false,
    },
  };
  functionalAudit.modules = functionalAudit.modules.map((module: { module_id?: string }) => {
    if (module.module_id === 'sample_brief_generated_wrappers') {
      return {
        ...module,
        current_surface_refs: [
          'cli',
          'mcp',
          'skill',
          'product_entry_manifest',
          'status_read_model',
        ],
        bridge_exit_gate: bridgeExitGate,
      };
    }
    if (
      module.module_id === 'sample_brief_domain_handler'
      || module.module_id === 'sample_brief_workbench_projection'
    ) {
      return {
        ...module,
        bridge_exit_gate: bridgeExitGate,
      };
    }
    return module;
  });
  writeJson(functionalAuditPath, functionalAudit);

  const defaultCallersPayload = runCli([
    'agents',
    'default-callers',
    '--agent',
    `sample=${repoDir}`,
  ]);
  const defaultCallers = defaultCallersPayload.agent_default_caller_readiness;

  const report = defaultCallers.reports[0];
  const contract = JSON.parse(fs.readFileSync(
    path.join(repoRoot, 'contracts', 'opl-framework', 'agent-platform-surface-ownership-contract.json'),
    'utf8',
  ));
  assert.equal(defaultCallers.status, 'ready_domain_evidence_required');
  assert.equal(defaultCallers.blocked_count, 0);
  assert.equal(defaultCallers.generated_default_caller_surface_count, 8);
  assert.equal(defaultCallers.deletion_evidence_worklist_count, 0);
  assert.equal(defaultCallers.active_deletion_evidence_worklist_count, 0);
  assert.equal(defaultCallers.surface_retirement_gate_count, 8);
  assert.equal(defaultCallers.closed_surface_retirement_gate_count, 8);
  assert.equal(defaultCallers.missing_domain_owner_receipt_or_typed_blocker_count, 0);
  assert.equal(defaultCallers.missing_no_active_caller_proof_count, 0);
  assert.equal(defaultCallers.missing_no_forbidden_write_proof_count, 0);
  assert.equal(defaultCallers.missing_tombstone_or_provenance_ref_count, 0);
  assert.deepEqual(defaultCallers.retirement_guard_target_classes, [
    'legacy_reconcile_compensation_path',
    'legacy_materialize_compensation_path',
    'legacy_dispatch_compensation_path',
    'retained_domain_wrapper',
  ]);
  assert.deepEqual(defaultCallers.retirement_guard_mandatory_gate_ids, [
    'replacement_parity',
    'no_active_caller_proof',
    'domain_owner_receipt_or_typed_blocker',
    'no_forbidden_write_proof',
    'tombstone_or_provenance_ref',
  ]);
  assert.equal(defaultCallers.retirement_guard_readout.physical_delete_authorized, false);
  assert.deepEqual(defaultCallers.retirement_guard_readout.static_retirement_prerequisite_gate_ids, [
    'replacement_parity',
    'no_active_caller_proof',
    'no_forbidden_write_proof',
    'tombstone_or_provenance_ref',
  ]);
  assert.deepEqual(defaultCallers.retirement_guard_readout.same_work_unit_live_evidence_scope, {
    gate_id: 'same_work_unit_live_evidence',
    applies_to: 'current_owner_answer_compensation_chain',
    stage_run_closeout_binding_gate_applies_to: 'current_owner_answer_compensation_chain',
    blocks_static_no_active_caller_retirement: false,
    static_retired_surface_classes: [
      'retired_wrapper',
      'retired_alias',
      'retired_facade',
    ],
    static_retirement_prerequisite_gate_ids: [
      'replacement_parity',
      'no_active_caller_proof',
      'no_forbidden_write_proof',
      'tombstone_or_provenance_ref',
    ],
  });
  assert.equal(
    defaultCallers.retirement_guard_readout.non_authorizing_surfaces.includes('opl_agents_conformance'),
    true,
  );
  assert.equal(
    defaultCallers.retirement_guard_readout.non_authorizing_surfaces.includes('opl_framework_readiness'),
    true,
  );
  assert.equal(
    defaultCallers.retirement_guard_readout.non_authorizing_surfaces.includes(
      'opl_family_runtime_evidence_worklist_refs_only_receipt',
    ),
    true,
  );
  assert.equal(defaultCallers.default_caller_delete_ready, false);
  assert.equal(defaultCallers.physical_delete_authorized, false);
  assert.equal(defaultCallersPayload.blocked_count, defaultCallers.blocked_count);
  assert.equal(
    defaultCallersPayload.deletion_evidence_worklist_count,
    defaultCallers.deletion_evidence_worklist_count,
  );
  assert.equal(
    defaultCallersPayload.surface_retirement_gate_count,
    defaultCallers.surface_retirement_gate_count,
  );
  assert.equal(
    defaultCallersPayload.closed_surface_retirement_gate_count,
    defaultCallers.closed_surface_retirement_gate_count,
  );
  assert.equal(
    defaultCallersPayload.missing_domain_owner_receipt_or_typed_blocker_count,
    defaultCallers.missing_domain_owner_receipt_or_typed_blocker_count,
  );
  assert.equal(
    defaultCallersPayload.missing_no_active_caller_proof_count,
    defaultCallers.missing_no_active_caller_proof_count,
  );
  assert.equal(
    defaultCallersPayload.missing_no_forbidden_write_proof_count,
    defaultCallers.missing_no_forbidden_write_proof_count,
  );
  assert.equal(
    defaultCallersPayload.missing_tombstone_or_provenance_ref_count,
    defaultCallers.missing_tombstone_or_provenance_ref_count,
  );
  assert.equal(defaultCallersPayload.default_caller_delete_ready, false);
  assert.equal(defaultCallersPayload.physical_delete_authorized, false);
  assert.equal(
    defaultCallersPayload.physical_delete_authorization_status,
    'not_authorized_by_opl_projection',
  );
  assert.equal(defaultCallers.summary.default_caller_delete_ready, false);
  assert.equal(defaultCallers.summary.physical_delete_authorized, false);
  assert.equal(defaultCallers.summary.deletion_evidence_worklist_count, 0);
  assert.equal(defaultCallers.summary.surface_retirement_gate_count, 8);
  assert.equal(defaultCallers.summary.closed_surface_retirement_gate_count, 8);
  assert.equal(defaultCallers.summary.missing_domain_owner_receipt_or_typed_blocker_count, 0);
  assert.equal(defaultCallers.summary.missing_no_active_caller_proof_count, 0);
  assert.equal(defaultCallers.summary.missing_no_forbidden_write_proof_count, 0);
  assert.equal(defaultCallers.summary.missing_tombstone_or_provenance_ref_count, 0);
  assert.deepEqual(defaultCallers.summary.retirement_guard_mandatory_gate_ids, [
    'replacement_parity',
    'no_active_caller_proof',
    'domain_owner_receipt_or_typed_blocker',
    'no_forbidden_write_proof',
    'tombstone_or_provenance_ref',
  ]);
  assert.equal(defaultCallers.migration_gate_policy.zero_missing_deletion_evidence_is_not_delete_ready, true);
  assert.equal(defaultCallers.migration_gate_policy.observed_deletion_evidence_refs_are_refs_only_inputs, true);
  assert.equal(defaultCallers.migration_gate_policy.physical_delete_authorized_by_this_report, false);
  assert.equal(
    defaultCallers.migration_gate_policy
      .owner_decision_after_structural_prerequisites_observed_required,
    true,
  );
  assert.equal(
    defaultCallers.migration_gate_policy
      .next_required_owner_action_after_structural_prerequisites_observed,
    'domain_owner_choose_delete_authorize_keep_or_typed_blocker',
  );
  assert.deepEqual(
    defaultCallers.migration_gate_policy
      .accepted_refs_only_result_shapes_after_structural_prerequisites_observed,
    [
      'physical_delete_authorization_ref',
      'keep_as_authority_adapter_ref',
      'typed_blocker_ref',
    ],
  );
  assert.equal(
    defaultCallers.physical_delete_authority_read_model.surface_kind,
    'opl_default_caller_physical_delete_authority_read_model',
  );
  assert.equal(
    defaultCallers.physical_delete_authority_read_model.projection_policy,
    'compact_refs_only_repo_summary_over_default_caller_deletion_evidence_worklists',
  );
  assert.equal(defaultCallers.physical_delete_authority_read_model.total_repo_count, 1);
  assert.equal(defaultCallers.physical_delete_authority_read_model.deletion_evidence_worklist_count, 0);
  assert.equal(defaultCallers.physical_delete_authority_read_model.active_deletion_evidence_worklist_count, 0);
  assert.equal(defaultCallers.physical_delete_authority_read_model.surface_retirement_gate_count, 8);
  assert.equal(defaultCallers.physical_delete_authority_read_model.closed_surface_retirement_gate_count, 8);
  assert.equal(
    defaultCallers.physical_delete_authority_read_model
      .all_repos_all_deletion_evidence_requirements_observed,
    true,
  );
  assert.deepEqual(
    defaultCallers.physical_delete_authority_read_model.retirement_guard_target_classes,
    defaultCallers.retirement_guard_target_classes,
  );
  assert.deepEqual(
    defaultCallers.physical_delete_authority_read_model.mandatory_gate_ids,
    defaultCallers.retirement_guard_mandatory_gate_ids,
  );
  assert.deepEqual(
    defaultCallers.physical_delete_authority_read_model.static_retirement_prerequisite_gate_ids,
    defaultCallers.retirement_guard_readout.static_retirement_prerequisite_gate_ids,
  );
  assert.deepEqual(
    defaultCallers.physical_delete_authority_read_model.same_work_unit_live_evidence_scope,
    defaultCallers.retirement_guard_readout.same_work_unit_live_evidence_scope,
  );
  assert.equal(
    defaultCallers.physical_delete_authority_read_model
      .zero_missing_deletion_evidence_is_not_delete_ready,
    true,
  );
  assert.equal(
    defaultCallers.physical_delete_authority_read_model
      .observed_deletion_evidence_refs_are_refs_only_inputs,
    true,
  );
  assert.equal(defaultCallers.physical_delete_authority_read_model.physical_delete_authorized, false);
  assert.equal(defaultCallers.physical_delete_authority_read_model.default_caller_delete_ready, false);
  assert.equal(
    defaultCallers.physical_delete_authority_read_model.private_platform_cleanup_lane.status,
    'empty',
  );
  assert.equal(
    defaultCallers.physical_delete_authority_read_model.private_platform_cleanup_lane
      .owner_decision_work_order.status,
    'no_private_residue_classified_not_delete_ready',
  );
  assert.equal(
    defaultCallers.physical_delete_authority_read_model.private_platform_cleanup_lane
      .owner_decision_work_order.open_decision_count,
    0,
  );
  assert.equal(
    defaultCallers.physical_delete_authority_read_model.private_platform_cleanup_lane
      .owner_decision_work_order.physical_delete_authorized,
    false,
  );
  assert.equal(
    defaultCallers.physical_delete_authority_read_model.private_platform_cleanup_lane
      .owner_decision_work_order.open_count_semantics,
    'zero_residue_gate_count_means_no_cleanup_lane_items_not_physical_delete_authorized',
  );
  assert.equal(
    defaultCallers.physical_delete_authority_read_model.private_platform_cleanup_lane
      .owner_decision_work_order.forbidden_opl_claims.includes('domain_repo_physical_delete_authorization'),
    true,
  );
  assert.deepEqual(
    defaultCallersPayload.physical_delete_authority_read_model,
    defaultCallers.physical_delete_authority_read_model,
  );
  assert.equal(
    defaultCallers.physical_delete_authority_read_model
      .generated_default_caller_readiness_can_authorize_physical_delete,
    false,
  );
  assert.equal(
    defaultCallers.physical_delete_authority_read_model.next_required_owner_action,
    'domain_owner_choose_delete_authorize_keep_or_typed_blocker',
  );
  assert.equal(
    defaultCallers.physical_delete_authority_read_model.active_legacy_caller_deletion_gate.status,
    'no_active_worklist_not_delete_authorized',
  );
  assert.equal(
    defaultCallers.physical_delete_authority_read_model.active_legacy_caller_deletion_gate
      .executable_next_action,
    'no_active_delete_worklist_items',
  );
  assert.equal(
    defaultCallers.physical_delete_authority_read_model.active_legacy_caller_deletion_gate
      .stop_condition,
    'domain_owner_decision_ref_observed_or_typed_blocker_ref_observed',
  );
  assert.equal(
    defaultCallers.physical_delete_authority_read_model.active_legacy_caller_deletion_gate
      .physical_delete_authorized,
    false,
  );
  assert.equal(
    defaultCallers.physical_delete_authority_read_model.delete_or_keep_prerequisites_observed,
    true,
  );
  assert.equal(
    defaultCallers.physical_delete_authority_read_model.owner_decision_required_after_prerequisites_observed,
    true,
  );
  assert.deepEqual(
    defaultCallers.physical_delete_authority_read_model.accepted_refs_only_result_shapes,
    [
      'physical_delete_authorization_ref',
      'keep_as_authority_adapter_ref',
      'typed_blocker_ref',
    ],
  );
  assert.equal(
    defaultCallers.physical_delete_authority_read_model.owner_decision_required_after_all_refs_observed,
    true,
  );
  assert.equal(
    defaultCallers.physical_delete_authority_read_model.not_authorized_claims
      .includes('domain_repo_physical_delete_authorization'),
    true,
  );
  assert.equal(
    defaultCallers.physical_delete_authority_read_model.authority_boundary
      .read_model_can_authorize_domain_repo_physical_delete,
    false,
  );
  assert.equal(defaultCallers.repo_deletion_gate_summary.length, 1);
  assert.deepEqual(
    defaultCallers.repo_deletion_gate_summary[0].static_retirement_prerequisite_gate_ids,
    defaultCallers.retirement_guard_readout.static_retirement_prerequisite_gate_ids,
  );
  assert.deepEqual(
    defaultCallers.repo_deletion_gate_summary[0].same_work_unit_live_evidence_scope,
    defaultCallers.retirement_guard_readout.same_work_unit_live_evidence_scope,
  );
  assert.equal(
    defaultCallers.repo_deletion_gate_summary[0].repo_id,
    defaultCallers.repo_deletion_gate_summary[0].domain_id,
  );
  assert.equal(
    defaultCallers.physical_delete_authority_read_model.repo_deletion_gate_summary[0].repo_id,
    defaultCallers.repo_deletion_gate_summary[0].repo_id,
  );
  assert.equal(defaultCallers.repo_deletion_gate_summary[0].deletion_evidence_worklist_count, 0);
  assert.equal(defaultCallers.repo_deletion_gate_summary[0].active_deletion_evidence_worklist_count, 0);
  assert.equal(defaultCallers.repo_deletion_gate_summary[0].surface_retirement_gate_count, 8);
  assert.equal(defaultCallers.repo_deletion_gate_summary[0].closed_surface_retirement_gate_count, 8);
  assert.equal(
    defaultCallers.repo_deletion_gate_summary[0].all_deletion_evidence_requirements_observed,
    true,
  );
  assert.equal(defaultCallers.repo_deletion_gate_summary[0].physical_delete_authorized, false);
  assert.equal(defaultCallers.repo_deletion_gate_summary[0].default_caller_delete_ready, false);
  assert.equal(
    defaultCallers.repo_deletion_gate_summary[0].next_required_owner_action,
    'domain_owner_choose_delete_authorize_keep_or_typed_blocker',
  );
  assert.equal(
    defaultCallers.repo_deletion_gate_summary[0].delete_or_keep_prerequisites_observed,
    true,
  );
  assert.deepEqual(
    defaultCallers.repo_deletion_gate_summary[0].accepted_refs_only_result_shapes,
    [
      'physical_delete_authorization_ref',
      'keep_as_authority_adapter_ref',
      'typed_blocker_ref',
    ],
  );
  assert.equal(
    defaultCallers.repo_deletion_gate_summary[0].owner_decision_required_after_all_refs_observed,
    true,
  );
  assert.deepEqual(
    defaultCallersPayload.repo_deletion_gate_summary,
    defaultCallers.repo_deletion_gate_summary,
  );
  assert.equal(defaultCallers.repo_deletion_gate_summary[0].needs_drilldown_for_surface_refs, false);
  assert.equal(
    'surface_deletion_gate_summary' in defaultCallers.repo_deletion_gate_summary[0],
    false,
  );
  assert.equal(
    'surface_owner_decision_gates' in defaultCallers.repo_deletion_gate_summary[0],
    false,
  );
  assert.equal(
    defaultCallers.repo_deletion_gate_summary[0].closed_surface_detail_policy,
    'omitted_from_default_read_model_use_counts_and_tombstone_refs',
  );
  assert.equal(defaultCallers.repo_deletion_gate_summary[0].missing_no_active_caller_proof_count, 0);
  assert.equal(contract.migration_gate.zero_missing_deletion_evidence_is_not_delete_ready, true);
  assert.equal(contract.migration_gate.observed_deletion_evidence_refs_are_refs_only_inputs, true);
  assert.equal(
    contract.migration_gate.owner_decision_after_structural_prerequisites_observed_required,
    true,
  );
  assert.equal(
    contract.migration_gate.next_required_owner_action_after_structural_prerequisites_observed,
    'domain_owner_choose_delete_authorize_keep_or_typed_blocker',
  );
  assert.deepEqual(
    contract.migration_gate.accepted_refs_only_result_shapes_after_structural_prerequisites_observed,
    [
      'physical_delete_authorization_ref',
      'keep_as_authority_adapter_ref',
      'typed_blocker_ref',
    ],
  );
  assert.equal(contract.migration_gate.deletion_evidence_requirements_are_completion_claims, false);
  assert.deepEqual(contract.migration_gate.retirement_guard_target_classes, [
    'legacy_reconcile_compensation_path',
    'legacy_materialize_compensation_path',
    'legacy_dispatch_compensation_path',
    'retained_domain_wrapper',
  ]);
  assert.deepEqual(contract.migration_gate.mandatory_gate_ids, [
    'replacement_parity',
    'no_active_caller_proof',
    'domain_owner_receipt_or_typed_blocker',
    'no_forbidden_write_proof',
    'tombstone_or_provenance_ref',
  ]);
  assert.equal(contract.migration_gate.not_authorized_claims.includes('default_caller_delete_ready'), true);
  assert.equal(
    contract.migration_gate.not_authorized_claims.includes('domain_repo_physical_delete_authorization'),
    true,
  );
  assert.equal(report.deletion_gate.all_deletion_evidence_requirements_observed, true);
  assert.equal(report.deletion_gate.default_caller_delete_ready, false);
  assert.deepEqual(report.deletion_gate.mandatory_gate_ids, defaultCallers.retirement_guard_mandatory_gate_ids);
  assert.equal(report.deletion_gate.physical_delete_authorization_status, 'not_authorized_by_opl_projection');
  assert.equal(
    report.deletion_gate.next_required_owner_action,
    'domain_owner_choose_delete_authorize_keep_or_typed_blocker',
  );
  assert.equal(report.deletion_gate.delete_or_keep_prerequisites_observed, true);
  assert.equal(report.deletion_gate.owner_decision_required_after_prerequisites_observed, true);
  assert.deepEqual(report.deletion_gate.accepted_refs_only_result_shapes, [
    'physical_delete_authorization_ref',
    'keep_as_authority_adapter_ref',
    'typed_blocker_ref',
  ]);
  assert.equal(report.deletion_gate.owner_decision_required_after_all_refs_observed, true);
  assert.equal(report.deletion_gate.generated_default_caller_readiness_can_authorize_physical_delete, false);
  assert.equal(
    report.deletion_gate.physical_delete_blocked_by.includes('generated_default_caller_readiness_is_not_delete_authority'),
    true,
  );
  assert.equal(
    report.deletion_gate.physical_delete_blocked_by.includes(
      'physical_delete_requires_domain_owner_delete_keep_or_blocker_decision_after_structural_evidence',
    ),
    true,
  );
  assert.equal(report.deletion_gate.deletion_evidence_requirements_are_completion_claims, false);
  assert.equal(report.deletion_gate.not_authorized_claims.includes('default_caller_delete_ready'), true);
  assert.equal(report.deletion_gate.not_authorized_claims.includes('domain_repo_physical_delete_authorization'), true);
  assert.equal(
    report.deletion_evidence_worklists.length,
    0,
  );
  assert.equal(
    'surface_retirement_gates' in report,
    false,
  );
  assert.equal(
    'surface_gates' in report,
    false,
  );
  assert.equal(
    report.closed_surface_detail_policy,
    'closed_retirement_gate_details_omitted_from_default_payload',
  );
  assert.equal(defaultCallers.authority_boundary.report_can_authorize_domain_repo_physical_delete, false);
});

test('agents default-callers asks domain owner to choose delete keep or blocker after structural delete evidence', () => {
  const repoDir = buildReadyAgentRepo();
  const functionalAuditPath = path.join(repoDir, 'contracts', 'functional_privatization_audit.json');
  const functionalAudit = JSON.parse(fs.readFileSync(functionalAuditPath, 'utf8'));
  const bridgeExitGate = {
    no_active_caller_refs: ['no-active-caller:sample/default-caller-delete'],
    no_forbidden_write_refs: ['no-forbidden-write:sample/default-caller-delete'],
    tombstone_refs: ['tombstone:sample/default-caller-delete'],
    provenance_refs: ['provenance:sample/default-caller-delete'],
    physical_delete_authorized: false,
    authority_boundary: {
      can_authorize_domain_repo_physical_delete: false,
    },
  };
  functionalAudit.modules = functionalAudit.modules.map((module: { module_id?: string }) => {
    if (module.module_id === 'sample_brief_generated_wrappers') {
      return {
        ...module,
        current_surface_refs: [
          'cli',
          'mcp',
          'skill',
          'product_entry_manifest',
          'status_read_model',
        ],
        bridge_exit_gate: bridgeExitGate,
      };
    }
    if (
      module.module_id === 'sample_brief_domain_handler'
      || module.module_id === 'sample_brief_workbench_projection'
    ) {
      return {
        ...module,
        bridge_exit_gate: bridgeExitGate,
      };
    }
    return module;
  });
  writeJson(functionalAuditPath, functionalAudit);

  const defaultCallersPayload = runCli([
    'agents',
    'default-callers',
    '--agent',
    `sample=${repoDir}`,
  ]);
  const defaultCallers = defaultCallersPayload.agent_default_caller_readiness;

  assert.equal(defaultCallers.missing_domain_owner_receipt_or_typed_blocker_count, 8);
  assert.equal(defaultCallers.missing_no_active_caller_proof_count, 0);
  assert.equal(defaultCallers.missing_no_forbidden_write_proof_count, 0);
  assert.equal(defaultCallers.missing_tombstone_or_provenance_ref_count, 0);
  assert.equal(defaultCallers.default_caller_delete_ready, false);
  assert.equal(defaultCallers.physical_delete_authorized, false);
  assert.equal(defaultCallers.owner_decision_status, 'owner_decision_required');
  assert.equal(
    defaultCallers.structural_prerequisites_observed_but_domain_owner_decision_missing_count,
    8,
  );
  assert.equal(defaultCallers.summary.owner_decision_status, 'owner_decision_required');
  assert.equal(
    defaultCallers.summary.structural_prerequisites_observed_but_domain_owner_decision_missing_count,
    8,
  );
  assert.equal(
    defaultCallers.physical_delete_authority_read_model
      .all_repos_delete_or_keep_prerequisites_observed,
    true,
  );
  assert.equal(
    defaultCallers.physical_delete_authority_read_model
      .all_repos_all_deletion_evidence_requirements_observed,
    false,
  );
  assert.equal(
    defaultCallers.physical_delete_authority_read_model.next_required_owner_action,
    'domain_owner_choose_delete_authorize_keep_or_typed_blocker',
  );
  assert.equal(
    defaultCallers.physical_delete_authority_read_model.active_legacy_caller_deletion_gate.status,
    'owner_decision_required_after_structural_prerequisites',
  );
  assert.equal(
    defaultCallers.physical_delete_authority_read_model.active_legacy_caller_deletion_gate
      .executable_next_action,
    'domain_owner_choose_delete_authorize_keep_or_typed_blocker',
  );
  assert.deepEqual(
    defaultCallers.physical_delete_authority_read_model.active_legacy_caller_deletion_gate
      .missing_gate_ids,
    ['domain_owner_receipt_or_typed_blocker'],
  );
  assert.deepEqual(
    defaultCallers.physical_delete_authority_read_model.accepted_refs_only_result_shapes,
    [
      'physical_delete_authorization_ref',
      'keep_as_authority_adapter_ref',
      'typed_blocker_ref',
    ],
  );
  assert.equal(
    defaultCallers.physical_delete_authority_read_model.owner_decision_status,
    'owner_decision_required',
  );
  assert.equal(
    defaultCallers.physical_delete_authority_read_model
      .structural_prerequisites_observed_but_domain_owner_decision_missing_count,
    8,
  );
  assert.equal(
    defaultCallers.physical_delete_authority_read_model.missing_gate_groups
      .domain_owner_decision.missing_count,
    8,
  );
  assert.equal(
    defaultCallers.physical_delete_authority_read_model.owner_decision_gate_by_repo[0]
      .owner_decision_status,
    'owner_decision_required',
  );
  assert.equal(
    defaultCallers.physical_delete_authority_read_model.owner_decision_gate_by_repo[0]
      .surface_owner_decision_gates.length,
    8,
  );
  assert.equal(
    defaultCallers.repo_deletion_gate_summary[0].delete_or_keep_prerequisites_observed,
    true,
  );
  assert.equal(
    defaultCallers.repo_deletion_gate_summary[0].owner_decision_status,
    'owner_decision_required',
  );
  assert.equal(
    defaultCallers.repo_deletion_gate_summary[0].missing_gate_groups.domain_owner_decision
      .missing_count,
    8,
  );
  assert.equal(
    defaultCallers.repo_deletion_gate_summary[0].all_deletion_evidence_requirements_observed,
    false,
  );
  assert.equal(
    defaultCallers.repo_deletion_gate_summary[0].next_required_owner_action,
    'domain_owner_choose_delete_authorize_keep_or_typed_blocker',
  );
  assert.equal(defaultCallers.repo_deletion_gate_summary[0].physical_delete_authorized, false);
  assert.equal(defaultCallers.repo_deletion_gate_summary[0].default_caller_delete_ready, false);
  assert.equal(
    defaultCallers.repo_deletion_gate_summary[0].surface_deletion_gate_summary.every((surface: {
      delete_or_keep_prerequisites_observed: boolean;
      owner_decision_status: string;
      missing_gate_groups: { domain_owner_decision: { status: string } };
      owner_decision_required_after_prerequisites_observed: boolean;
      next_required_owner_action: string;
      accepted_refs_only_result_shapes: string[];
      domain_owner_receipt_or_typed_blocker_observed: boolean;
      physical_delete_authorized: boolean;
      default_caller_delete_ready: boolean;
      same_work_unit_live_evidence_scope: {
        applies_to: string;
        blocks_static_no_active_caller_retirement: boolean;
      };
    }) => (
      surface.delete_or_keep_prerequisites_observed === true
      && surface.owner_decision_status === 'owner_decision_required'
      && surface.missing_gate_groups.domain_owner_decision.status === 'missing'
      && surface.owner_decision_required_after_prerequisites_observed === true
      && surface.next_required_owner_action === 'domain_owner_choose_delete_authorize_keep_or_typed_blocker'
      && surface.accepted_refs_only_result_shapes.includes('physical_delete_authorization_ref')
      && surface.accepted_refs_only_result_shapes.includes('keep_as_authority_adapter_ref')
      && surface.accepted_refs_only_result_shapes.includes('typed_blocker_ref')
      && surface.domain_owner_receipt_or_typed_blocker_observed === false
      && surface.physical_delete_authorized === false
      && surface.default_caller_delete_ready === false
      && surface.same_work_unit_live_evidence_scope.applies_to
        === 'current_owner_answer_compensation_chain'
      && surface.same_work_unit_live_evidence_scope.blocks_static_no_active_caller_retirement === false
    )),
    true,
  );
});

test('agents default-callers separates ordinary default lane from private residue cleanup gate', () => {
  const repoDir = buildReadyAgentRepo();
  const functionalAuditPath = path.join(repoDir, 'contracts', 'functional_privatization_audit.json');
  const functionalAudit = JSON.parse(fs.readFileSync(functionalAuditPath, 'utf8'));
  const bridgeExitGate = {
    no_active_caller_refs: ['no-active-caller:sample/private-platform-residue'],
    no_forbidden_write_refs: ['no-forbidden-write:sample/private-platform-residue'],
    tombstone_refs: ['tombstone:sample/private-platform-residue'],
    physical_delete_authorized: false,
    authority_boundary: {
      can_authorize_domain_repo_physical_delete: false,
    },
  };
  functionalAudit.modules.push(
    {
      module_id: 'sample_brief_legacy_scheduler',
      classification: 'generic_scheduler_or_daemon',
      owner: 'SampleBriefAgent',
      code_paths: ['runtime/legacy-scheduler.ts'],
      active_callers: [],
      active_caller_status: 'no_active_caller_observed_after_opl_runway_cutover',
      migration_action: 'delete_after_no_active_caller_gate',
      private_platform_residue_gate: {
        residue_kind: 'scheduler',
        disposition: 'no_active_caller_delete',
        bridge_exit_gate: bridgeExitGate,
      },
    },
    {
      module_id: 'sample_brief_status_shell',
      classification: 'generic_status_workbench_shell',
      owner: 'SampleBriefAgent',
      code_paths: ['runtime/status-shell.ts'],
      active_callers: ['domain owner status review'],
      active_caller_status: 'owner_typed_blocker_required_before_status_shell_cleanup',
      migration_action: 'return_owner_typed_blocker_or_keep_authority_ref',
      private_platform_residue_gate: {
        residue_kind: 'status_shell',
        disposition: 'owner_typed_blocker',
        bridge_exit_gate: {
          ...bridgeExitGate,
          typed_blocker_refs: ['typed-blocker:sample/status-shell-owner-needed'],
        },
      },
    },
  );
  writeJson(functionalAuditPath, functionalAudit);

  const defaultCallers = runCli([
    'agents',
    'default-callers',
    '--agent',
    `sample=${repoDir}`,
  ]).agent_default_caller_readiness;

  const readModel = defaultCallers.physical_delete_authority_read_model;
  assert.equal(readModel.default_ordinary_lane.lane_id, 'default_ordinary_lane');
  assert.equal(readModel.default_ordinary_lane.includes_private_platform_cleanup_gate, false);
  assert.equal(readModel.default_ordinary_lane.physical_delete_authorized, false);
  assert.equal(readModel.private_platform_cleanup_lane.lane_id, 'private_platform_cleanup_lane');
  assert.equal(readModel.private_platform_cleanup_lane.physical_delete_authorized, false);
  assert.deepEqual(readModel.private_platform_cleanup_lane.allowed_dispositions, [
    'retain_authority_function',
    'absorb_opl_primitive',
    'no_active_caller_delete',
    'tombstone',
    'owner_typed_blocker',
  ]);
  assert.deepEqual(readModel.private_platform_cleanup_lane.residue_target_kinds, [
    'scheduler',
    'queue',
    'session_store',
    'workbench',
    'status_shell',
    'domain_wrapper',
    'runtime_watch',
    'agent_lab_materializer',
  ]);
  assert.equal(
    readModel.private_platform_cleanup_lane.residue_gate_summary.no_active_caller_delete,
    1,
  );
  assert.equal(
    readModel.private_platform_cleanup_lane.residue_gate_summary.owner_typed_blocker,
    1,
  );
  assert.equal(
    readModel.private_platform_cleanup_lane.owner_decision_work_order.status,
    'owner_delete_keep_or_typed_blocker_decision_required',
  );
  assert.equal(
    readModel.private_platform_cleanup_lane.owner_decision_work_order.open_decision_count,
    2,
  );
  assert.equal(
    readModel.private_platform_cleanup_lane.owner_decision_work_order.ready_claim_authorized,
    false,
  );
  assert.equal(
    readModel.private_platform_cleanup_lane.owner_decision_work_order.accepted_refs_only_result_shapes
      .includes('typed_blocker_ref'),
    true,
  );
  assert.equal(
    readModel.private_platform_cleanup_lane.owner_decision_work_order.authority_boundary
      .work_order_can_delete_domain_repo_files,
    false,
  );
  assert.equal(
    readModel.private_platform_cleanup_lane.next_required_owner_action,
    'domain_owner_choose_delete_authorize_keep_or_typed_blocker',
  );
  assert.equal(defaultCallers.repo_deletion_gate_summary[0].cleanup_lane.lane_id, 'private_platform_cleanup_lane');
  assert.equal(defaultCallers.repo_deletion_gate_summary[0].cleanup_lane.physical_delete_authorized, false);
  assert.equal(defaultCallers.repo_deletion_gate_summary[0].cleanup_lane.residue_gate_summary.no_active_caller_delete, 1);
  assert.equal(defaultCallers.repo_deletion_gate_summary[0].cleanup_lane.residue_gate_summary.owner_typed_blocker, 1);
  assert.equal(defaultCallers.repo_deletion_gate_summary[0].ordinary_lane.lane_id, 'default_ordinary_lane');
  assert.equal(defaultCallers.repo_deletion_gate_summary[0].ordinary_lane.physical_delete_authorized, false);
});
