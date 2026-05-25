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

  const defaultCallers = runCli([
    'agents',
    'default-callers',
    '--agent',
    `sample=${repoDir}`,
  ]).agent_default_caller_readiness;

  const report = defaultCallers.reports[0];
  const contract = JSON.parse(fs.readFileSync(
    path.join(repoRoot, 'contracts', 'opl-framework', 'agent-platform-surface-ownership-contract.json'),
    'utf8',
  ));
  assert.equal(defaultCallers.status, 'ready_domain_evidence_required');
  assert.equal(defaultCallers.summary.missing_domain_owner_receipt_or_typed_blocker_count, 0);
  assert.equal(defaultCallers.summary.missing_no_forbidden_write_proof_count, 0);
  assert.equal(defaultCallers.summary.missing_tombstone_or_provenance_ref_count, 0);
  assert.equal(defaultCallers.migration_gate_policy.zero_missing_deletion_evidence_is_not_delete_ready, true);
  assert.equal(defaultCallers.migration_gate_policy.observed_deletion_evidence_refs_are_refs_only_inputs, true);
  assert.equal(defaultCallers.migration_gate_policy.physical_delete_authorized_by_this_report, false);
  assert.equal(contract.migration_gate.zero_missing_deletion_evidence_is_not_delete_ready, true);
  assert.equal(contract.migration_gate.observed_deletion_evidence_refs_are_refs_only_inputs, true);
  assert.equal(contract.migration_gate.deletion_evidence_requirements_are_completion_claims, false);
  assert.equal(contract.migration_gate.not_authorized_claims.includes('default_caller_delete_ready'), true);
  assert.equal(
    contract.migration_gate.not_authorized_claims.includes('domain_repo_physical_delete_authorization'),
    true,
  );
  assert.equal(report.deletion_gate.all_deletion_evidence_requirements_observed, true);
  assert.equal(report.deletion_gate.default_caller_delete_ready, false);
  assert.equal(report.deletion_gate.physical_delete_authorization_status, 'not_authorized_by_opl_projection');
  assert.equal(report.deletion_gate.deletion_evidence_requirements_are_completion_claims, false);
  assert.equal(report.deletion_gate.not_authorized_claims.includes('default_caller_delete_ready'), true);
  assert.equal(report.deletion_gate.not_authorized_claims.includes('domain_repo_physical_delete_authorization'), true);
  assert.equal(
    report.deletion_evidence_worklists.every((worklist: {
      physical_delete_authorized: boolean;
      default_caller_delete_ready: boolean;
      worklist_item_is_completion_claim: boolean;
      physical_delete_authorization_status: string;
      not_authorized_claims: string[];
      authority_boundary: { worklist_can_authorize_domain_repo_physical_delete: boolean };
    }) => (
      worklist.physical_delete_authorized === false
      && worklist.default_caller_delete_ready === false
      && worklist.worklist_item_is_completion_claim === false
      && worklist.physical_delete_authorization_status === 'not_authorized_by_opl_projection'
      && worklist.not_authorized_claims.includes('default_caller_delete_ready')
      && worklist.not_authorized_claims.includes('domain_repo_physical_delete_authorization')
      && worklist.authority_boundary.worklist_can_authorize_domain_repo_physical_delete === false
    )),
    true,
  );
  assert.equal(defaultCallers.authority_boundary.report_can_authorize_domain_repo_physical_delete, false);
});
