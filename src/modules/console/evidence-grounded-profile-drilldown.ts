import {
  buildEvidenceGroundedDecisionAgentProfileReadback,
  EVIDENCE_GROUNDED_DECISION_AGENT_PROFILE_CONTRACT_REF,
} from '../pack/index.ts';
import { record, stringList, stringValue, uniqueStringList } from '../../kernel/json-record.ts';

export type EvidenceGroundedDecisionAgentProfileDrilldownInput = {
  trace_refs?: string[];
  evidence_refs?: string[];
  source_refs?: string[];
  artifact_refs?: string[];
  retrieval_receipt_refs?: string[];
  tool_receipt_refs?: string[];
  next_safe_action_id?: string | null;
};

function refs(values: string[] | undefined) {
  return uniqueStringList(values ?? []);
}

function text(value: unknown, fallback: string) {
  return stringValue(value) ?? fallback;
}

function authorityBoundary(value: unknown) {
  return {
    ...record(value),
    drilldown_role: 'refs_only_projection_not_live_evidence',
    drilldown_can_claim_live_evidence: false,
    drilldown_can_claim_runtime_ready: false,
    drilldown_can_claim_domain_ready: false,
    drilldown_can_claim_owner_verdict: false,
    drilldown_reads_source_body: false,
    drilldown_reads_artifact_body: false,
  };
}

export function buildEvidenceGroundedDecisionAgentProfileConsoleDrilldown(
  input: EvidenceGroundedDecisionAgentProfileDrilldownInput = {},
) {
  const readback = buildEvidenceGroundedDecisionAgentProfileReadback()
    .evidence_grounded_decision_agent_profile;
  const modeRoutingPolicy = record(readback.mode_routing_policy);
  const evidencePolicy = record(readback.evidence_policy);
  const humanGatePolicy = record(readback.human_gate_policy);
  const unsupportedEvidenceBlockerPolicy = record(readback.unsupported_evidence_blocker_policy);
  const evidenceRefs = refs(input.evidence_refs);
  const traceRefs = refs(input.trace_refs ?? [
    `contract:${EVIDENCE_GROUNDED_DECISION_AGENT_PROFILE_CONTRACT_REF}`,
    `profile:${text(readback.profile_id, 'evidence_grounded_decision_agent_profile.v1')}`,
    `policy:${text(modeRoutingPolicy.policy_id, 'evidence_grounded_mode_routing.v1')}`,
    `policy:${text(evidencePolicy.policy_id, 'refs_only_evidence_grounding.v1')}`,
    `policy:${text(humanGatePolicy.policy_id, 'decision_support_human_gate.v1')}`,
    `policy:${text(unsupportedEvidenceBlockerPolicy.policy_id, 'unsupported_evidence_blocker.v1')}`,
  ]);
  const missingRefs = evidenceRefs.length === 0
    ? ['EvidencePacket.evidence_ref']
    : [];
  const nextSafeActionId = stringValue(input.next_safe_action_id)
    ?? (missingRefs.length > 0 ? 'collect_or_route_back_evidence_ref' : 'continue_refs_only_advisory_drilldown');

  return {
    version: 'g2',
    console_evidence_grounded_decision_agent_profile_drilldown: {
      surface_kind: 'opl_console_evidence_grounded_decision_agent_profile_drilldown',
      version: 'evidence-grounded-decision-agent-profile-console-drilldown.v1',
      profile_id: readback.profile_id,
      contract_ref: EVIDENCE_GROUNDED_DECISION_AGENT_PROFILE_CONTRACT_REF,
      projection_role: 'refs_only_drilldown_shape_not_source_or_artifact_body',
      live_evidence_observed: false,
      trace_refs: traceRefs,
      evidence_trace: {
        evidence_refs: evidenceRefs,
        source_refs: refs(input.source_refs),
        artifact_refs: refs(input.artifact_refs),
        retrieval_receipt_refs: refs(input.retrieval_receipt_refs),
        tool_receipt_refs: refs(input.tool_receipt_refs),
        missing_required_refs: missingRefs,
        source_body_read: false,
        artifact_body_read: false,
      },
      policy_status: {
        mode_routing: {
          policy_id: text(modeRoutingPolicy.policy_id, 'evidence_grounded_mode_routing.v1'),
          status: 'catalog_policy_readback_only',
          allowed_mode_classes: stringList(modeRoutingPolicy.allowed_mode_classes),
          can_replace_domain_policy: false,
        },
        evidence_grounding: {
          policy_id: text(evidencePolicy.policy_id, 'refs_only_evidence_grounding.v1'),
          status: missingRefs.length > 0
            ? 'required_evidence_ref_missing'
            : 'evidence_refs_observed_not_owner_verdict',
          body_storage_policy: text(evidencePolicy.body_storage_policy, 'refs_only_no_source_body_in_profile_contract'),
          can_claim_quality_verdict: false,
        },
        human_gate: {
          policy_id: text(humanGatePolicy.policy_id, 'decision_support_human_gate.v1'),
          status: missingRefs.length > 0 ? 'available_safe_route' : 'not_required_by_projection',
          allowed_closeout_refs: stringList(humanGatePolicy.allowed_closeout_refs),
          can_be_fabricated_by_opl: false,
        },
        unsupported_evidence_blocker: {
          policy_id: text(unsupportedEvidenceBlockerPolicy.policy_id, 'unsupported_evidence_blocker.v1'),
          status: missingRefs.length > 0 ? 'available_safe_route' : 'not_required_by_projection',
          blocker_shape: text(unsupportedEvidenceBlockerPolicy.blocker_shape, 'typed_blocker_ref_or_route_back_ref'),
          can_create_domain_typed_blocker_instance: false,
        },
      },
      next_safe_action: {
        action_id: nextSafeActionId,
        mutates: 'none_read_only',
        action_role: missingRefs.length > 0
          ? 'route_back_or_request_evidence_ref'
          : 'continue_advisory_projection_with_refs_only',
        reads_source_body: false,
        reads_artifact_body: false,
        can_create_owner_receipt: false,
        can_claim_owner_verdict: false,
      },
      authority_boundary: authorityBoundary(readback.authority_boundary),
    },
  };
}
