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
  assert.equal(defaultCallers.deletion_evidence_worklist_count, 8);
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
    defaultCallers.physical_delete_authority_read_model.surface_kind,
    'opl_default_caller_physical_delete_authority_read_model',
  );
  assert.equal(
    defaultCallers.physical_delete_authority_read_model.projection_policy,
    'compact_refs_only_repo_summary_over_default_caller_deletion_evidence_worklists',
  );
  assert.equal(defaultCallers.physical_delete_authority_read_model.total_repo_count, 1);
  assert.equal(defaultCallers.physical_delete_authority_read_model.deletion_evidence_worklist_count, 8);
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
    'domain_repo_owner_physical_delete_receipt_or_typed_blocker_after_surface_review',
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
  assert.equal(defaultCallers.repo_deletion_gate_summary[0].deletion_evidence_worklist_count, 8);
  assert.equal(
    defaultCallers.repo_deletion_gate_summary[0].all_deletion_evidence_requirements_observed,
    true,
  );
  assert.equal(defaultCallers.repo_deletion_gate_summary[0].physical_delete_authorized, false);
  assert.equal(defaultCallers.repo_deletion_gate_summary[0].default_caller_delete_ready, false);
  assert.deepEqual(
    defaultCallersPayload.repo_deletion_gate_summary,
    defaultCallers.repo_deletion_gate_summary,
  );
  assert.equal(defaultCallers.repo_deletion_gate_summary[0].needs_drilldown_for_surface_refs, true);
  assert.equal(
    defaultCallers.repo_deletion_gate_summary[0].surface_deletion_gate_summary.length,
    8,
  );
  assert.equal(defaultCallers.repo_deletion_gate_summary[0].missing_no_active_caller_proof_count, 0);
  assert.equal(
    defaultCallers.repo_deletion_gate_summary[0].surface_deletion_gate_summary.every((surface: {
      no_active_caller_proof_observed: boolean;
      domain_owner_receipt_or_typed_blocker_observed: boolean;
      no_forbidden_write_proof_observed: boolean;
      tombstone_or_provenance_ref_observed: boolean;
      physical_delete_authorized: boolean;
      default_caller_delete_ready: boolean;
      needs_drilldown_for_surface_refs: boolean;
    }) => (
      surface.no_active_caller_proof_observed === true
      && surface.domain_owner_receipt_or_typed_blocker_observed === true
      && surface.no_forbidden_write_proof_observed === true
      && surface.tombstone_or_provenance_ref_observed === true
      && surface.physical_delete_authorized === false
      && surface.default_caller_delete_ready === false
      && surface.needs_drilldown_for_surface_refs === true
    )),
    true,
  );
  assert.equal(contract.migration_gate.zero_missing_deletion_evidence_is_not_delete_ready, true);
  assert.equal(contract.migration_gate.observed_deletion_evidence_refs_are_refs_only_inputs, true);
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
  assert.equal(report.deletion_gate.generated_default_caller_readiness_can_authorize_physical_delete, false);
  assert.equal(
    report.deletion_gate.physical_delete_blocked_by.includes('generated_default_caller_readiness_is_not_delete_authority'),
    true,
  );
  assert.equal(
    report.deletion_gate.physical_delete_blocked_by.includes('domain_repo_owner_receipt_or_typed_blocker_required_for_delete_authority'),
    true,
  );
  assert.equal(report.deletion_gate.deletion_evidence_requirements_are_completion_claims, false);
  assert.equal(report.deletion_gate.not_authorized_claims.includes('default_caller_delete_ready'), true);
  assert.equal(report.deletion_gate.not_authorized_claims.includes('domain_repo_physical_delete_authorization'), true);
  assert.equal(
    report.deletion_evidence_worklists.every((worklist: {
      physical_delete_authorized: boolean;
      default_caller_delete_ready: boolean;
      worklist_item_is_completion_claim: boolean;
      physical_delete_authorization_status: string;
      generated_default_caller_readiness_can_authorize_physical_delete: boolean;
      physical_delete_blocked_by: string[];
      not_authorized_claims: string[];
      retirement_guard: {
        target_classes: string[];
        mandatory_gate_ids: string[];
        physical_delete_authorized: boolean;
      };
      authority_boundary: { worklist_can_authorize_domain_repo_physical_delete: boolean };
    }) => (
      worklist.physical_delete_authorized === false
      && worklist.default_caller_delete_ready === false
      && worklist.worklist_item_is_completion_claim === false
      && worklist.physical_delete_authorization_status === 'not_authorized_by_opl_projection'
      && worklist.generated_default_caller_readiness_can_authorize_physical_delete === false
      && worklist.physical_delete_blocked_by.includes('generated_default_caller_readiness_is_not_delete_authority')
      && worklist.physical_delete_blocked_by.includes('domain_repo_owner_receipt_or_typed_blocker_required_for_delete_authority')
      && worklist.not_authorized_claims.includes('default_caller_delete_ready')
      && worklist.not_authorized_claims.includes('domain_repo_physical_delete_authorization')
      && worklist.retirement_guard.target_classes.includes('legacy_reconcile_compensation_path')
      && worklist.retirement_guard.target_classes.includes('retained_domain_wrapper')
      && worklist.retirement_guard.mandatory_gate_ids.includes('no_active_caller_proof')
      && worklist.retirement_guard.physical_delete_authorized === false
      && worklist.authority_boundary.worklist_can_authorize_domain_repo_physical_delete === false
    )),
    true,
  );
  assert.equal(defaultCallers.authority_boundary.report_can_authorize_domain_repo_physical_delete, false);
});
