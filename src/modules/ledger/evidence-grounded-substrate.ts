import {
  EVIDENCE_GROUNDED_DECISION_AGENT_PROFILE_CONTRACT_REF,
  readEvidenceGroundedDecisionAgentProfileContract,
} from '../pack/index.ts';
import { evidenceTailItem } from './evidence-requirement.ts';

type EvidenceConflictStatus =
  | 'none'
  | 'explained_by_owner_policy'
  | 'routes_to_human_gate'
  | 'routes_to_typed_blocker';

type EvidenceConfidenceLabel = 'high' | 'medium' | 'low' | 'unsupported';

type EvidenceGroundedLedgerSubstrateInput = {
  evidenceRef: string;
  sourceRef: string;
  provenanceRef: string;
  retrievalReceiptRef: string;
  toolReceiptRef: string;
  freshnessRef: string;
  confidenceLabel: EvidenceConfidenceLabel;
  conflictStatus: EvidenceConflictStatus;
  sourceContent?: string;
};

function unsupportedReasonIds(input: EvidenceGroundedLedgerSubstrateInput) {
  return [
    input.confidenceLabel === 'low' || input.confidenceLabel === 'unsupported'
      ? 'low_confidence'
      : null,
    input.conflictStatus === 'routes_to_human_gate' || input.conflictStatus === 'routes_to_typed_blocker'
      ? 'evidence_conflict'
      : null,
  ].filter((entry): entry is string => Boolean(entry));
}

export function buildEvidenceGroundedLedgerSubstrate(input: EvidenceGroundedLedgerSubstrateInput) {
  const contract = readEvidenceGroundedDecisionAgentProfileContract();
  const reasonIds = unsupportedReasonIds(input);
  const traceRefs = [
    input.evidenceRef,
    input.sourceRef,
    input.provenanceRef,
    input.retrievalReceiptRef,
    input.toolReceiptRef,
    input.freshnessRef,
  ];
  const evidenceRequirement = evidenceTailItem({
    tailId: 'evidence_grounded_decision_agent_profile:evidence_packet',
    tailItem: 'evidence_packet_refs_only_trace',
    status: reasonIds.length > 0 ? 'blocked' : 'open',
    ownerGroup: 'one-person-lab',
    domainId: 'evidence_grounded_decision_agent_profile',
    claimScope: 'decision_support_artifact_evidence_trace',
    blockingPolicy: 'unsupported_evidence_routes_to_human_gate_or_typed_blocker_ref',
    currentRef: input.evidenceRef,
    evidenceRef: input.evidenceRef,
    evidenceRefs: traceRefs,
    expectedRefs: traceRefs,
    nextSafeActionRoute: reasonIds.length > 0
      ? 'route_back_ref_human_gate_ref_or_typed_blocker_ref'
      : 'continue_refs_only_advisory_synthesis',
  }).evidence_requirement;

  return {
    surface_kind: 'opl_ledger_evidence_grounded_decision_agent_profile_substrate',
    version: 'evidence-grounded-ledger-substrate.v1',
    profile_contract_ref: EVIDENCE_GROUNDED_DECISION_AGENT_PROFILE_CONTRACT_REF,
    live_evidence_observed: false,
    evidence_packet: {
      object_name: 'EvidencePacket',
      object_id: 'evidence_packet',
      refs_only: true,
      evidence_ref: input.evidenceRef,
      source_ref: input.sourceRef,
      provenance_ref: input.provenanceRef,
      retrieval_receipt_ref: input.retrievalReceiptRef,
      tool_receipt_ref: input.toolReceiptRef,
      freshness_ref: input.freshnessRef,
      confidence_label: input.confidenceLabel,
      conflict_status: input.conflictStatus,
      owner_receipt_ref: null,
      creates_domain_typed_blocker_instance: false,
      evidence_packet_can_claim_quality_verdict: false,
    },
    evidence_trace: {
      trace_refs: traceRefs,
      source_content_included: false,
      artifact_content_included: false,
      body_storage_policy: 'refs_only_no_source_body_in_profile_readback',
    },
    unsupported_evidence_blocker: {
      object_name: 'UnsupportedEvidenceBlocker',
      reason_ids: reasonIds,
      blocker_shape: contract.unsupported_evidence_blocker_policy,
      success_closeout_allowed: false,
      creates_domain_typed_blocker_instance: false,
    },
    evidence_requirement: evidenceRequirement,
    authority_boundary: {
      refs_only: true,
      can_read_source_body: false,
      can_write_domain_truth: false,
      can_claim_domain_ready: false,
      can_claim_quality_verdict: false,
      can_claim_production_ready: false,
      can_create_owner_receipt: false,
      can_create_domain_typed_blocker: false,
    },
  };
}
