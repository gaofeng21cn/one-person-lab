import {
  buildEvidenceGroundedDecisionAgentProfileReadback,
  EVIDENCE_GROUNDED_DECISION_AGENT_PROFILE_CONTRACT_REF,
} from '../pack/index.ts';
import { record, recordList, stringList, stringValue } from '../../kernel/json-record.ts';

function text(value: unknown, fallback: string) {
  return stringValue(value) ?? fallback;
}

function authorityBoundary(value: unknown) {
  return {
    ...record(value),
    catalog_role: 'discoverable_catalog_not_live_evidence',
    catalog_can_claim_live_evidence: false,
    catalog_can_claim_runtime_ready: false,
    catalog_can_claim_domain_ready: false,
    catalog_can_claim_owner_verdict: false,
    catalog_can_read_source_body: false,
    catalog_can_read_artifact_body: false,
  };
}

export function buildEvidenceGroundedDecisionAgentProfileAtlasCatalog() {
  const readback = buildEvidenceGroundedDecisionAgentProfileReadback()
    .evidence_grounded_decision_agent_profile;
  const contract = record(readback.contract);
  const modeRoutingPolicy = record(readback.mode_routing_policy);
  const evidencePolicy = record(readback.evidence_policy);
  const unsupportedEvidenceBlockerPolicy = record(readback.unsupported_evidence_blocker_policy);

  const profileModeCatalog = stringList(modeRoutingPolicy.allowed_mode_classes).map((modeClass) => ({
    mode_id: `profile-mode:${modeClass}`,
    mode_class: modeClass,
    routing_policy_ref: text(modeRoutingPolicy.policy_id, 'evidence_grounded_mode_routing.v1'),
    catalog_entry_role: 'discoverable_profile_mode',
    requires_mode_routing_receipt: true,
    can_replace_domain_policy: false,
    live_evidence_observed: false,
  }));

  const capabilityCatalog = recordList(contract.first_class_objects).map((entry) => ({
    capability_id: `profile-capability:${text(entry.object_id, text(entry.object_name, 'unknown'))}`,
    object_name: text(entry.object_name, 'unknown'),
    object_id: text(entry.object_id, 'unknown'),
    owner_module: text(entry.owner_module, 'unknown'),
    role: text(entry.role, ''),
    catalog_entry_role: 'profile_capability_discovery',
    body_storage_policy: 'refs_only_no_source_or_artifact_body',
    live_evidence_observed: false,
  }));

  const toolCardCatalog = [
    {
      tool_card_id: 'retrieval-packet',
      object_name: text(evidencePolicy.retrieval_object, 'RetrievalPacket'),
      owner_module: 'connect',
      required_ref_fields: ['source_ref', 'retrieval_receipt_ref', 'freshness_ref'],
      trust_boundary: 'connector_resource_refs_only',
    },
    {
      tool_card_id: 'tool-result-envelope',
      object_name: text(evidencePolicy.tool_result_object, 'ToolResultEnvelope'),
      owner_module: 'connect',
      required_ref_fields: ['tool_receipt_ref', 'provenance_ref'],
      trust_boundary: 'no_unsafe_tool_data_sharing',
    },
    {
      tool_card_id: 'evidence-packet',
      object_name: text(evidencePolicy.evidence_object, 'EvidencePacket'),
      owner_module: 'ledger',
      required_ref_fields: stringList(evidencePolicy.required_evidence_fields),
      trust_boundary: text(evidencePolicy.body_storage_policy, 'refs_only_no_source_body_in_profile_contract'),
    },
  ].map((entry) => ({
    ...entry,
    catalog_entry_role: 'discoverable_tool_card',
    live_evidence_observed: false,
    can_read_source_body: false,
    can_read_artifact_body: false,
  }));

  const evalSuiteCatalog = recordList(contract.fail_closed_rules).map((rule) => ({
    eval_suite_id: `fail-closed-rule:${text(rule.rule_id, 'unknown')}`,
    rule_id: text(rule.rule_id, 'unknown'),
    evaluates: text(rule.when, ''),
    allowed_outcomes: stringList(rule.allowed_outcomes),
    success_closeout_allowed: rule.success_closeout_allowed === true ? true : false,
    catalog_entry_role: 'discoverable_eval_suite_rule',
    live_evidence_observed: false,
  }));

  const limitationCatalog = [
    ...recordList(contract.forbidden_claims).map((claim) => ({
      limitation_id: `forbidden-claim:${text(claim.claim_id, 'unknown')}`,
      claim_id: text(claim.claim_id, 'unknown'),
      owner: text(claim.owner, 'unknown'),
      forbidden: claim.forbidden === true,
    })),
    ...stringList(unsupportedEvidenceBlockerPolicy.required_blocker_reasons).map((reason) => ({
      limitation_id: `unsupported-evidence:${reason}`,
      blocker_reason: reason,
      owner: text(unsupportedEvidenceBlockerPolicy.owner_module, 'ledger'),
      forbidden: true,
    })),
  ].map((entry) => ({
    ...entry,
    catalog_entry_role: 'profile_limitation_discovery',
    live_evidence_observed: false,
  }));

  return {
    version: 'g2',
    atlas_evidence_grounded_decision_agent_profile_catalog: {
      surface_kind: 'opl_atlas_evidence_grounded_decision_agent_profile_catalog',
      version: 'evidence-grounded-decision-agent-profile-atlas-catalog.v1',
      profile_id: readback.profile_id,
      contract_ref: EVIDENCE_GROUNDED_DECISION_AGENT_PROFILE_CONTRACT_REF,
      source_surface: 'pack_contract_source_readback',
      catalog_role: 'discoverable_catalog_not_live_evidence',
      live_evidence_observed: false,
      profile_mode_catalog: profileModeCatalog,
      capability_catalog: capabilityCatalog,
      tool_card_catalog: toolCardCatalog,
      eval_suite_catalog: evalSuiteCatalog,
      limitation_catalog: limitationCatalog,
      source_of_truth_refs: readback.source_of_truth_refs,
      authority_boundary: authorityBoundary(readback.authority_boundary),
    },
  };
}
