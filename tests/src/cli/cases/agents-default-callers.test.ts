import { assert, fs, parseJsonText, path, runCli, test } from '../helpers.ts';
import { buildReadyAgentRepo, writeJson } from './agents-conformance-fixtures.ts';

const STRUCTURAL_REVIEW_ACTION = 'domain_repo_owner_physical_delete_receipt_or_typed_blocker_after_surface_review';
const OWNER_DECISION_ACTION = 'domain_owner_choose_delete_authorize_keep_or_typed_blocker';
const OWNER_REF_SHAPES = [
  'physical_delete_authorization_ref',
  'keep_as_authority_adapter_ref',
  'typed_blocker_ref',
];

function auditPath(repoDir: string) {
  return path.join(repoDir, 'contracts', 'functional_privatization_audit.json');
}

function readAudit(repoDir: string) {
  return parseJsonText(fs.readFileSync(auditPath(repoDir), 'utf8')) as any;
}

function writeAudit(repoDir: string, audit: any) {
  writeJson(auditPath(repoDir), audit);
}

function runDefaultCallers(repoDir: string) {
  return runCli([
    'agents',
    'default-callers',
    '--agent',
    `sample=${repoDir}`,
  ]).agent_default_caller_readiness;
}

function bridgeGate(overrides: Record<string, unknown> = {}) {
  return {
    no_active_caller_refs: ['no-active-caller:sample/default-caller-delete'],
    no_forbidden_write_refs: ['no-forbidden-write:sample/default-caller-delete'],
    tombstone_refs: ['tombstone:sample/default-caller-delete'],
    provenance_refs: ['provenance:sample/default-caller-delete'],
    ...overrides,
  };
}

function installBridgeGate(repoDir: string, gate: Record<string, unknown>, includeCurrentSurfaceRefs = false) {
  const audit = readAudit(repoDir);
  audit.modules = audit.modules.map((module: { module_id?: string }) => {
    const withGate = { ...module, bridge_exit_gate: gate };
    if (includeCurrentSurfaceRefs) {
      return {
        ...withGate,
        current_surface_refs: [
          'cli',
          'mcp',
          'skill',
          'product_entry_manifest',
          'status_read_model',
          'domain_handler',
          'workbench_drilldown',
          'functional_harness_cases',
        ],
      };
    }
    return withGate;
  });
  writeAudit(repoDir, audit);
}

function assertNotAuthorized(readout: any) {
  assert.equal(readout.default_caller_delete_ready, false);
  assert.equal(readout.physical_delete_authorized, false);
  assert.equal(readout.physical_delete_authorization_status, 'not_authorized_by_opl_projection');
}

test('agents default-callers blocks private generic owner claims without authorizing deletion', () => {
  const repoDir = buildReadyAgentRepo();
  const audit = readAudit(repoDir);
  audit.authority_boundary.domain_can_claim_generic_runtime_owner = true;
  writeAudit(repoDir, audit);

  const readout = runDefaultCallers(repoDir);

  assert.equal(readout.status, 'blocked');
  assert.equal(readout.blocked_count, 1);
  assertNotAuthorized(readout);
  assert.equal(readout.reports[0].blockers.includes('platform_surface_ownership_blocked'), true);
  assert.equal(readout.physical_delete_blocked_by.includes('generated_default_caller_readiness_is_not_delete_authority'), true);
  assert.equal(readout.authority_boundary.report_can_claim_production_ready, false);
  assert.equal(readout.authority_boundary.report_can_authorize_domain_repo_physical_delete, false);
});

test('agents default-callers exposes private platform tail matrix as non-authorizing readback', () => {
  const matrix = runDefaultCallers(buildReadyAgentRepo()).domain_private_platform_tail_matrix;
  const rows = new Map(matrix.rows.map((row: { domain_id: string }) => [row.domain_id, row]));
  const mas = rows.get('med-autoscience') as any;
  const scholarSkills = rows.get('mas-scholar-skills') as any;

  assert.equal(matrix.surface_kind, 'opl_domain_private_platform_tail_matrix_readback.v1');
  assert.equal(matrix.row_count, 6);
  assert.equal(matrix.physical_delete_authorized, false);
  assert.equal(matrix.authority_boundary.readback_can_authorize_domain_repo_physical_delete, false);
  assert.equal(mas.private_tail_class.includes('runtime_watch'), true);
  assert.equal(mas.replacement_opl_primitive.includes('Temporal-backed provider runtime'), true);
  assert.equal(mas.authority_retained.includes('owner_receipt'), true);
  assert.equal(mas.delete_or_tombstone_gate.owner_decision_required, true);
  assert.equal(scholarSkills.delete_or_tombstone_gate.owner_decision_required, false);
});

test('agents default-callers waits for structural prerequisites before delete or keep owner choice', () => {
  const readout = runDefaultCallers(buildReadyAgentRepo());
  const readModel = readout.physical_delete_authority_read_model;

  assert.equal(readout.status, 'ready_domain_evidence_required');
  assert.equal(readout.missing_no_active_caller_proof_count, 0);
  assert.equal(readout.missing_no_forbidden_write_proof_count, 8);
  assert.equal(readout.missing_tombstone_or_provenance_ref_count, 8);
  assertNotAuthorized(readout);
  assert.equal(readModel.delete_or_keep_prerequisites_observed, false);
  assert.equal(readModel.next_required_owner_action, STRUCTURAL_REVIEW_ACTION);
  assert.deepEqual(readModel.accepted_refs_only_result_shapes, ['typed_blocker_ref']);
  assert.deepEqual(readModel.active_legacy_caller_deletion_gate.missing_gate_ids, [
    'no_forbidden_write_proof',
    'tombstone_or_provenance_ref',
  ]);
});

test('agents default-callers treats observed structural evidence as refs-only until owner decides', () => {
  const repoDir = buildReadyAgentRepo();
  installBridgeGate(repoDir, bridgeGate({
    owner_receipt_refs: ['owner-receipt:sample/default-caller-delete-reviewed'],
    keep_as_authority_adapter_ref: 'keep-as-authority-adapter:sample/default-caller-delete-reviewed',
    typed_blocker_ref: 'typed-blocker:sample/default-caller-delete-reviewed:not-physical-delete',
    physical_delete_authorized: false,
    authority_boundary: { can_authorize_domain_repo_physical_delete: false },
  }), true);

  const readout = runDefaultCallers(repoDir);
  const readModel = readout.physical_delete_authority_read_model;

  assert.equal(readout.deletion_evidence_worklist_count, 0);
  assert.equal(readout.surface_retirement_gate_count, 8);
  assert.equal(readout.closed_surface_retirement_gate_count, 8);
  assertNotAuthorized(readout);
  assert.equal(readModel.delete_or_keep_prerequisites_observed, true);
  assert.equal(readModel.owner_decision_result_shape, 'keep_as_authority_adapter_ref');
  assert.equal(readModel.no_further_opl_default_caller_delete_work, true);
  assert.equal(readModel.next_required_owner_action, OWNER_DECISION_ACTION);
  assert.deepEqual(readModel.accepted_refs_only_result_shapes, OWNER_REF_SHAPES);
  assert.equal('surface_retirement_gates' in readout.reports[0], false);
});

test('agents default-callers does not recreate worklists for canonically absent default surfaces', () => {
  const repoDir = buildReadyAgentRepo();
  const audit = readAudit(repoDir);
  audit.retired_default_surface_ids = [
    'cli',
    'mcp',
    'skill',
    'product_entry',
    'product_status',
    'product_session',
    'domain_handler',
    'workbench',
  ];
  audit.default_surface_boundary = {
    state: 'physically_absent',
    owner: 'one-person-lab',
    domain_repo_can_own_default_surface: false,
  };
  writeAudit(repoDir, audit);

  const readout = runDefaultCallers(repoDir);

  assert.equal(readout.deletion_evidence_worklist_count, 0);
  assert.equal(readout.surface_retirement_gate_count, 8);
  assert.equal(readout.closed_surface_retirement_gate_count, 8);
  assert.equal(readout.reports[0].summary.retired_default_surface_count, 8);
  assert.equal(readout.physical_delete_authorized, false);
});

test('agents default-callers rejects an absent-surface audit claim when source behavior is still generic', () => {
  const repoDir = buildReadyAgentRepo();
  const audit = readAudit(repoDir);
  audit.retired_default_surface_ids = [
    'cli',
    'mcp',
    'skill',
    'product_entry',
    'product_status',
    'product_session',
    'domain_handler',
    'workbench',
  ];
  audit.default_surface_boundary = {
    state: 'physically_absent',
    owner: 'one-person-lab',
    domain_repo_can_own_default_surface: false,
  };
  writeAudit(repoDir, audit);
  fs.writeFileSync(
    path.join(repoDir, 'runtime', 'legacy-workbench.py'),
    'attention_queue = []\noperator_brief = "legacy"\n',
    'utf8',
  );

  const readout = runDefaultCallers(repoDir);

  assert.equal(readout.status, 'blocked');
  assert.equal(
    readout.reports[0].blockers.includes('default_surface_retirement_source_behavior_not_passed'),
    true,
  );
  assert.equal(readout.deletion_evidence_worklist_count, 8);
});

test('agents default-callers consumes explicit domain owner physical delete authorization refs', () => {
  const repoDir = buildReadyAgentRepo();
  installBridgeGate(repoDir, bridgeGate({
    physical_delete_authorization_ref: 'owner-authorization:sample/default-caller-physical-delete',
  }), true);

  const readout = runDefaultCallers(repoDir);

  assert.equal(readout.default_caller_delete_ready, true);
  assert.equal(readout.physical_delete_authorized, true);
  assert.equal(readout.physical_delete_authorization_status, 'authorized_by_domain_owner_physical_delete_ref');
  assert.equal(readout.physical_delete_authority_read_model.owner_decision_status, 'owner_decision_observed_physical_delete_authorized');
  assert.deepEqual(readout.physical_delete_authority_read_model.physical_delete_blocked_by, []);
  assert.equal(readout.reports[0].deletion_gate.owner_decision_result_shape, 'physical_delete_authorization_ref');
});

test('agents default-callers asks domain owner to choose delete keep or blocker after structural delete evidence', () => {
  const repoDir = buildReadyAgentRepo();
  installBridgeGate(repoDir, bridgeGate({
    physical_delete_authorized: false,
    authority_boundary: { can_authorize_domain_repo_physical_delete: false },
  }), true);

  const readout = runDefaultCallers(repoDir);
  const readModel = readout.physical_delete_authority_read_model;

  assert.equal(readout.missing_domain_owner_receipt_or_typed_blocker_count, 8);
  assert.equal(readout.missing_no_active_caller_proof_count, 0);
  assert.equal(readout.missing_no_forbidden_write_proof_count, 0);
  assert.equal(readout.missing_tombstone_or_provenance_ref_count, 0);
  assertNotAuthorized(readout);
  assert.equal(readout.owner_decision_status, 'owner_decision_required');
  assert.equal(readout.structural_prerequisites_observed_but_domain_owner_decision_missing_count, 8);
  assert.equal(readModel.active_legacy_caller_deletion_gate.status, 'owner_decision_required_after_structural_prerequisites');
  assert.deepEqual(readModel.active_legacy_caller_deletion_gate.missing_gate_ids, ['domain_owner_receipt_or_typed_blocker']);
  assert.equal(readModel.next_required_owner_action, OWNER_DECISION_ACTION);
  assert.deepEqual(readModel.accepted_refs_only_result_shapes, OWNER_REF_SHAPES);
});

test('agents default-callers separates ordinary default lane from private residue cleanup gate', () => {
  const repoDir = buildReadyAgentRepo();
  const audit = readAudit(repoDir);
  const privateBridgeGate = bridgeGate({
    no_active_caller_refs: ['no-active-caller:sample/private-platform-residue'],
    no_forbidden_write_refs: ['no-forbidden-write:sample/private-platform-residue'],
    tombstone_refs: ['tombstone:sample/private-platform-residue'],
    physical_delete_authorized: false,
    authority_boundary: { can_authorize_domain_repo_physical_delete: false },
  });
  audit.modules.push(
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
        bridge_exit_gate: privateBridgeGate,
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
          ...privateBridgeGate,
          typed_blocker_refs: ['typed-blocker:sample/status-shell-owner-needed'],
        },
      },
    },
  );
  writeAudit(repoDir, audit);

  const readModel = runDefaultCallers(repoDir).physical_delete_authority_read_model;

  assert.equal(readModel.default_ordinary_lane.includes_private_platform_cleanup_gate, false);
  assert.equal(readModel.private_platform_cleanup_lane.lane_id, 'private_platform_cleanup_lane');
  assert.equal(readModel.private_platform_cleanup_lane.physical_delete_authorized, false);
  assert.equal(readModel.private_platform_cleanup_lane.residue_gate_summary.no_active_caller_delete, 1);
  assert.equal(readModel.private_platform_cleanup_lane.residue_gate_summary.owner_typed_blocker, 1);
  assert.equal(readModel.private_platform_cleanup_lane.owner_decision_work_order.open_decision_count, 2);
  assert.equal(readModel.private_platform_cleanup_lane.owner_decision_work_order.ready_claim_authorized, false);
  assert.equal(readModel.private_platform_cleanup_lane.next_required_owner_action, OWNER_DECISION_ACTION);
});
