import { EVIDENCE_GROUNDED_DECISION_AGENT_PROFILE_CONTRACT_REF } from '../pack/index.ts';

type EvidenceGroundedConnectSubstrateInput = {
  retrievalReceiptRef: string;
  sourceRef: string;
  connectorRef: string;
  toolReceiptRef: string;
  toolRef: string;
  sensitiveExternalEgressRequested?: boolean;
  externalEgressApprovalRef?: string | null;
  resultContent?: string;
};

export function buildEvidenceGroundedConnectSubstrate(input: EvidenceGroundedConnectSubstrateInput) {
  const externalEgressRequested = input.sensitiveExternalEgressRequested === true;
  const externalEgressApproved = !externalEgressRequested || Boolean(input.externalEgressApprovalRef);
  const blockedReasonIds = externalEgressRequested && !externalEgressApproved
    ? ['sensitive_external_egress_unapproved']
    : [];

  return {
    surface_kind: 'opl_connect_evidence_grounded_decision_agent_profile_substrate',
    version: 'evidence-grounded-connect-substrate.v1',
    profile_contract_ref: EVIDENCE_GROUNDED_DECISION_AGENT_PROFILE_CONTRACT_REF,
    live_evidence_observed: false,
    retrieval_packet: {
      object_name: 'RetrievalPacket',
      object_id: 'retrieval_packet',
      refs_only: true,
      retrieval_receipt_ref: input.retrievalReceiptRef,
      source_ref: input.sourceRef,
      connector_ref: input.connectorRef,
      trust_label: externalEgressApproved ? 'approved_or_internal_ref' : 'approval_required',
      freshness_ref_required: true,
      retrieved_content_included: false,
    },
    tool_result_envelope: {
      object_name: 'ToolResultEnvelope',
      object_id: 'tool_result_envelope',
      refs_only: true,
      tool_ref: input.toolRef,
      tool_receipt_ref: input.toolReceiptRef,
      result_content_included: false,
      side_effect_policy: 'no_side_effect_without_declared_tool_receipt_ref',
      data_sharing_policy: 'sensitive_external_egress_requires_approval_ref',
      tool_result_envelope_can_share_unsafe_data: false,
    },
    data_sharing: {
      status: externalEgressApproved ? 'approved' : 'blocked',
      sensitive_external_egress_requested: externalEgressRequested,
      approval_ref: input.externalEgressApprovalRef ?? null,
      external_egress_allowed: externalEgressApproved,
    },
    fail_closed_reason_ids: blockedReasonIds,
    authority_boundary: {
      refs_only: true,
      can_share_unsafe_data: false,
      can_read_source_body: false,
      can_log_secret_or_sensitive_content: false,
      can_claim_domain_ready: false,
      can_create_owner_receipt: false,
      can_create_domain_typed_blocker: false,
    },
  };
}
