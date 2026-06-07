import {
  EVIDENCE_REQUIREMENT_MODEL_VERSION,
  evidenceRequirementFromTailItem,
} from '../evidence-requirement.ts';
import {
  NOT_AUTHORIZED_CLAIMS,
} from './constants.ts';
import {
  record,
  recordList,
  stringList,
  stringValue,
  uniqueStringList,
  type JsonRecord,
} from './json-utils.ts';

export function externalEvidenceReceiptWorklistItems(drilldown: JsonRecord) {
  const domainEvidence = record(drilldown.domain_evidence_request_refs);
  const receipts = [
    ...recordList(domainEvidence.external_receipts),
    ...recordList(domainEvidence.evidence_gate_receipts),
  ].filter((receipt) => stringValue(receipt.receipt_status) === 'verified');
  return receipts.map((receipt, index) => {
    const role = stringValue(receipt.role) ?? 'external_evidence_receipt';
    const domainId = stringValue(receipt.domain_id);
    const requestId = stringValue(receipt.request_id) ?? stringValue(receipt.gate_id) ?? `receipt:${index + 1}`;
    const receiptRef = stringValue(receipt.ref) ?? stringValue(receipt.receipt_ref);
    const typedBlockerRefs = stringList(receipt.typed_blocker_refs);
    const receiptRefs = [
      receiptRef,
      ...stringList(receipt.domain_receipt_refs),
      ...stringList(receipt.evidence_refs),
      ...stringList(receipt.no_regression_refs),
      ...stringList(receipt.release_dist_refs),
      ...stringList(receipt.direct_hosted_parity_refs),
      ...stringList(receipt.owner_chain_refs),
      ...stringList(receipt.memory_writeback_receipt_refs),
      ...stringList(receipt.artifact_mutation_receipt_refs),
      ...stringList(receipt.package_lifecycle_receipt_refs),
      ...stringList(receipt.lifecycle_receipt_refs),
      ...stringList(receipt.restore_proof_refs),
    ].filter((ref): ref is string => Boolean(ref));
    const typedBlockerOnly = typedBlockerRefs.length > 0
      && stringList(receipt.domain_receipt_refs).length === 0;
    const claimScope = role === 'evidence_gate_receipt'
      ? 'evidence_gate_receipt'
      : 'external_evidence_receipt';
    const item = {
      item_id: `evidence-worklist:${role}:${domainId ?? 'domain'}:${requestId}:verified`,
      tail_id: `evidence-worklist:${role}:${domainId ?? 'domain'}:${requestId}:verified`,
      tail_item: role,
      action_id: `${role}:${domainId ?? 'domain'}:${requestId}:verified`,
      action_kind: typedBlockerOnly
        ? 'domain_owned_typed_blocker_verified'
        : `${role}_verified`,
      claim_scope: claimScope,
      owner: 'opl',
      route_owner: 'opl',
      safe_action_owner: 'opl',
      domain_id: domainId,
      stage_id: null,
      worklist_lane: 'audit',
      default_owner_delta_eligible: false,
      audit_lane_visible: true,
      cleanup_lane_visible: false,
      mode: 'verify',
      status: typedBlockerOnly
        ? 'closed_by_domain_owned_typed_blocker'
        : 'closed_by_receipt_ref',
      worklist_item_is_completion_claim: false,
      route_status: 'receipt_verified',
      route_status_detail: null,
      route_semantics: 'verified_refs_only_receipt_projection',
      receipt_ref: receiptRef,
      receipt_refs: receiptRefs,
      typed_blocker_ref: typedBlockerRefs[0] ?? null,
      typed_blocker_refs: typedBlockerRefs,
      worklist_status_detail: typedBlockerOnly
        ? 'closed_by_domain_owned_typed_blocker_ref'
        : 'closed_by_opl_external_evidence_ledger_receipt',
      replay_ref: receiptRef ?? `/runtime_tray_snapshot/app_operator_drilldown/domain_evidence_request_refs`,
      freshness_ref: '/runtime_tray_snapshot/app_operator_drilldown/domain_evidence_request_refs',
      freshness_refs: [],
      expected_refs: [],
      closure_reason: typedBlockerOnly
        ? 'OPL refs-only evidence ledger verified a domain-owned typed blocker for this evidence request; this does not claim production success.'
        : 'OPL refs-only evidence ledger verified a domain-owned evidence receipt.',
      open_reason: null,
      payload_requirement: null,
      payload_owner: 'domain_repository_or_app_live_operator',
      route_requires_domain_or_app_payload: false,
      can_close_without_domain_or_app_payload: true,
      opl_generated_receipt_policy: null,
      blocked_reason: null,
      not_authorized_claims: [...NOT_AUTHORIZED_CLAIMS],
    };
    return {
      ...item,
      evidence_requirement_model: EVIDENCE_REQUIREMENT_MODEL_VERSION,
      evidence_requirement: evidenceRequirementFromTailItem(item),
    };
  });
}

export function domainDispatchReceiptWorklistItems(drilldown: JsonRecord) {
  const attempts = recordList(record(drilldown.domain_dispatch_evidence).attempts)
    .filter((attempt) => stringValue(attempt.dispatch_evidence_receipt_status) === 'verified');
  return attempts.flatMap((attempt, index) => {
    const domainId = stringValue(attempt.domain_id);
    const stageAttemptId = stringValue(attempt.stage_attempt_id) ?? `attempt:${index + 1}`;
    const receiptRefs = [
      ...stringList(attempt.verified_dispatch_evidence_receipt_refs),
      ...stringList(attempt.owner_receipt_refs),
      ...stringList(attempt.no_regression_evidence_refs),
    ];
    const typedBlockerRefs = stringList(attempt.typed_blocker_refs);
    if (receiptRefs.length === 0 && typedBlockerRefs.length === 0) {
      return [];
    }
    const typedBlockerOnly = typedBlockerRefs.length > 0
      && stringList(attempt.owner_receipt_refs).length === 0;
    const item = {
      item_id: `evidence-worklist:domain-dispatch:${domainId ?? 'domain'}:${stageAttemptId}:verified`,
      tail_id: `evidence-worklist:domain-dispatch:${domainId ?? 'domain'}:${stageAttemptId}:verified`,
      tail_item: 'domain_dispatch_evidence_receipt',
      action_id: `domain_dispatch:${domainId ?? 'domain'}:${stageAttemptId}:verify`,
      action_kind: typedBlockerOnly
        ? 'domain_dispatch_evidence_typed_blocker_verified'
        : 'domain_dispatch_evidence_receipt_verified',
      claim_scope: 'domain_dispatch_evidence_receipt',
      owner: 'opl',
      route_owner: 'opl',
      safe_action_owner: 'opl',
      domain_id: domainId,
      stage_id: stringValue(attempt.stage_id),
      worklist_lane: 'audit',
      default_owner_delta_eligible: false,
      audit_lane_visible: true,
      cleanup_lane_visible: false,
      mode: 'verify',
      status: typedBlockerOnly
        ? 'closed_by_domain_owned_typed_blocker'
        : 'closed_by_receipt_ref',
      worklist_item_is_completion_claim: false,
      route_status: 'receipt_verified',
      route_status_detail: null,
      route_semantics: 'verified_refs_only_domain_dispatch_receipt_projection',
      receipt_ref: stringList(attempt.verified_dispatch_evidence_receipt_refs)[0] ?? null,
      receipt_refs: uniqueStringList(receiptRefs),
      typed_blocker_ref: typedBlockerRefs[0] ?? null,
      typed_blocker_refs: typedBlockerRefs,
      worklist_status_detail: typedBlockerOnly
        ? 'closed_by_domain_owned_typed_blocker_ref'
        : 'closed_by_opl_external_evidence_ledger_receipt',
      replay_ref: stringValue(attempt.ref)
        ?? '/runtime_tray_snapshot/app_operator_drilldown/domain_dispatch_evidence',
      freshness_ref: '/runtime_tray_snapshot/app_operator_drilldown/domain_dispatch_evidence',
      freshness_refs: [],
      expected_refs: [],
      closure_reason: typedBlockerOnly
        ? 'OPL refs-only evidence ledger verified a domain-owned typed blocker for this domain dispatch evidence request; this does not claim domain or production readiness.'
        : 'OPL refs-only evidence ledger verified domain dispatch owner-chain refs without claiming domain or production readiness.',
      open_reason: null,
      payload_requirement: null,
      payload_owner: 'domain_repository_or_app_live_operator',
      route_requires_domain_or_app_payload: false,
      can_close_without_domain_or_app_payload: true,
      opl_generated_receipt_policy: null,
      blocked_reason: null,
      not_authorized_claims: [...NOT_AUTHORIZED_CLAIMS],
    };
    return [{
      ...item,
      evidence_requirement_model: EVIDENCE_REQUIREMENT_MODEL_VERSION,
      evidence_requirement: evidenceRequirementFromTailItem(item),
    }];
  });
}
