import type { JsonRecord } from '../runtime-tray-snapshot-types.ts';
import {
  buildAppDrilldownRefsOnlyAuthorityBoundary as refsOnlyAuthorityBoundary,
} from './authority-boundary.ts';
import {
  numberValue,
  record,
  stringList,
  stringValue,
} from './value-utils.ts';

export function buildCleanupRetirementProjection(input: {
  defaultCallerDeletionEvidenceRefs: JsonRecord;
  legacyCleanupPlans: JsonRecord;
}) {
  const deletionSummary = record(input.defaultCallerDeletionEvidenceRefs.summary);
  const legacySummary = record(input.legacyCleanupPlans.summary);
  const ownerDecisionStatus = stringValue(deletionSummary.owner_decision_status);
  const physicalDeleteAuthorized = deletionSummary.physical_delete_authorized === true
    || numberValue(legacySummary.legacy_cleanup_domain_physical_delete_can_execute_count) > 0;
  return {
    surface_kind: 'opl_app_drilldown_cleanup_retirement_projection',
    projection_policy:
      'refs_only_cleanup_retirement_summary_no_domain_truth_or_physical_delete_authority',
    status: ownerDecisionStatus ?? (
      numberValue(deletionSummary.open_deletion_evidence_requirement_count) > 0
        ? 'owner_decision_required'
        : 'structural_projection_clear_no_physical_delete_authorized'
    ),
    deletion_evidence_worklist_count:
      numberValue(deletionSummary.deletion_evidence_worklist_count),
    ready_domain_evidence_worklist_count:
      numberValue(deletionSummary.ready_domain_evidence_worklist_count),
    open_deletion_evidence_requirement_count:
      numberValue(deletionSummary.open_deletion_evidence_requirement_count),
    owner_decision_required_after_prerequisites_observed:
      deletionSummary.owner_decision_required_after_prerequisites_observed === true,
    owner_decision_required_after_all_refs_observed:
      deletionSummary.owner_decision_required_after_all_refs_observed === true,
    owner_decision_closeout_status:
      stringValue(deletionSummary.owner_decision_closeout_status),
    no_further_opl_default_caller_delete_work:
      deletionSummary.no_further_opl_default_caller_delete_work === true,
    next_opl_default_caller_delete_action:
      stringValue(deletionSummary.next_opl_default_caller_delete_action),
    delete_or_keep_prerequisites_observed:
      deletionSummary.delete_or_keep_prerequisites_observed === true,
    structural_prerequisites_observed_but_domain_owner_decision_missing_count:
      numberValue(
        deletionSummary.structural_prerequisites_observed_but_domain_owner_decision_missing_count,
      ),
    default_caller_delete_ready: deletionSummary.default_caller_delete_ready === true,
    physical_delete_authorized: physicalDeleteAuthorized,
    physical_delete_authorization_status: physicalDeleteAuthorized
      ? 'authorized_by_domain_owner_receipt'
      : 'not_authorized_by_opl_projection',
    next_required_owner_action: stringValue(deletionSummary.next_required_owner_action)
      ?? 'domain_owner_choose_delete_authorize_keep_or_typed_blocker',
    accepted_refs_only_result_shapes:
      stringList(deletionSummary.accepted_refs_only_result_shapes),
    not_authorized_claims: stringList(deletionSummary.not_authorized_claims),
    static_retirement_prerequisite_gate_ids:
      stringList(deletionSummary.static_retirement_prerequisite_gate_ids),
    legacy_cleanup_plan_count:
      numberValue(legacySummary.legacy_cleanup_plan_count),
    legacy_cleanup_ready_plan_count:
      numberValue(legacySummary.legacy_cleanup_ready_plan_count),
    legacy_cleanup_opl_cleanup_ledger_ready_count:
      numberValue(legacySummary.legacy_cleanup_opl_cleanup_ledger_ready_count),
    legacy_cleanup_domain_physical_delete_requires_owner_receipt_count:
      numberValue(legacySummary.legacy_cleanup_domain_physical_delete_requires_owner_receipt_count),
    legacy_cleanup_domain_physical_delete_can_execute_count:
      numberValue(legacySummary.legacy_cleanup_domain_physical_delete_can_execute_count),
    full_detail_sections: [
      'default_caller_deletion_evidence_refs',
      'domain_legacy_cleanup_plan_refs',
    ],
    authority_boundary: {
      ...refsOnlyAuthorityBoundary(),
      refs_only: true,
      can_authorize_physical_delete: false,
      can_execute_physical_delete: false,
      can_sign_domain_owner_receipt: false,
      can_create_typed_blocker: false,
      can_claim_default_caller_delete_ready: false,
      can_claim_domain_ready: false,
      can_claim_production_ready: false,
    },
  };
}
