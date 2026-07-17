import { buildDeveloperModeRepairRouteReadModel } from './developer-mode-repair-route.ts';

export function buildDeveloperModeLiveCloseoutEvidenceSummary() {
  const readModel = buildDeveloperModeRepairRouteReadModel();
  const evidence = readModel.live_closeout_evidence;

  return {
    surface_kind: 'opl_app_state_developer_mode_live_closeout_evidence_summary',
    source_surface_kind: evidence.surface_kind,
    status: evidence.status,
    ledger_evidence_status: evidence.ledger_evidence_status,
    refs_only: evidence.refs_only,
    evidence_scope: evidence.evidence_scope,
    ledger_receipt_ref_count: evidence.summary.ledger_receipt_ref_count,
    verified_ledger_receipt_ref_count: evidence.summary.ledger_verified_receipt_ref_count,
    pending_verify_receipt_ref_count: evidence.summary.pending_verify_receipt_ref_count,
    summary: {
      ledger_receipt_ref_count: evidence.summary.ledger_receipt_ref_count,
      ledger_recorded_receipt_ref_count: evidence.summary.ledger_recorded_receipt_ref_count,
      ledger_verified_receipt_ref_count: evidence.summary.ledger_verified_receipt_ref_count,
      pending_verify_receipt_ref_count: evidence.summary.pending_verify_receipt_ref_count,
      live_ledger_closeout_ready_count: evidence.summary.live_ledger_closeout_ready_count,
      verified_direct_fix_ledger_receipt_ref_count: evidence.summary.verified_direct_fix_ledger_receipt_ref_count,
      verified_fork_pr_ledger_receipt_ref_count: evidence.summary.verified_fork_pr_ledger_receipt_ref_count,
      route_repetition_ref_count: evidence.summary.route_repetition_ref_count,
      foundry_activation_transaction_ref_count:
        evidence.summary.foundry_activation_transaction_ref_count,
      app_patrol_mount_ref_count: evidence.summary.app_patrol_mount_ref_count,
      scaleout_followthrough_open_gate_count:
        evidence.summary.scaleout_followthrough_open_gate_count,
      fixture_drill_owner_acceptance_open_count: evidence.summary.fixture_drill_owner_acceptance_open_count,
      fixture_drill_external_owner_acceptance_missing_count:
        evidence.summary.fixture_drill_external_owner_acceptance_missing_count,
      external_owner_acceptance_missing_count: evidence.summary.external_owner_acceptance_missing_count,
      forbidden_owner_receipt_write_count: evidence.summary.forbidden_owner_receipt_write_count,
    },
    scaleout_followthrough: evidence.scaleout_followthrough,
    owner_acceptance_policy: evidence.owner_acceptance_policy,
    non_authority_outputs: evidence.non_authority_outputs,
    authority_boundary: {
      refs_only: true,
      can_write_domain_truth: evidence.authority_boundary.can_write_domain_truth,
      can_write_memory_body: evidence.authority_boundary.can_write_memory_body,
      can_write_owner_receipt: evidence.authority_boundary.writes_owner_receipt,
      can_modify_managed_runtime: evidence.authority_boundary.modifies_managed_runtime,
      can_claim_release_ready: false,
      can_claim_production_ready: false,
      can_close_developer_mode_live_route: false,
    },
  };
}
