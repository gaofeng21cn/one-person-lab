import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildEvidenceGroundedDecisionAgentProfileReadback,
  EVIDENCE_GROUNDED_DECISION_AGENT_PROFILE_CONTRACT_REF,
} from '../../src/modules/pack/index.ts';

const requiredObjects = [
  'WorkItem',
  'StructuredInput',
  'ModeRoutingReceipt',
  'RetrievalPacket',
  'ToolResultEnvelope',
  'EvidencePacket',
  'SynthesisPacket',
  'IndependentReviewReceipt',
  'DecisionSupportArtifact',
  'HumanGateDecision',
  'UnsupportedEvidenceBlocker',
];

const requiredModules = [
  'pack',
  'stagecraft',
  'runway',
  'ledger',
  'connect',
  'workspace',
  'atlas',
  'console',
  'foundry',
  'charter',
];

const requiredFailClosedRules = [
  'no_evidence',
  'low_confidence',
  'evidence_conflict',
  'stale_source',
  'unsafe_tool_data_sharing',
];

const requiredForbiddenClaims = [
  'domain_ready',
  'quality_verdict',
  'final_decision',
  'artifact_authority',
  'owner_receipt',
  'production_ready',
];

type PolicyRecord = {
  policy_id: string;
  body_storage_policy?: string;
  human_gate_decision_can_be_fabricated_by_opl?: boolean;
  required_blocker_reasons?: string[];
};

test('Evidence-grounded decision profile exposes Pack-owned contract readback without authority claims', () => {
  const readback = buildEvidenceGroundedDecisionAgentProfileReadback()
    .evidence_grounded_decision_agent_profile;
  const modeRoutingPolicy = readback.mode_routing_policy as PolicyRecord;
  const evidencePolicy = readback.evidence_policy as PolicyRecord;
  const humanGatePolicy = readback.human_gate_policy as PolicyRecord;
  const unsupportedEvidenceBlockerPolicy =
    readback.unsupported_evidence_blocker_policy as PolicyRecord;

  assert.equal(readback.surface_kind, 'opl_evidence_grounded_decision_agent_profile_readback');
  assert.equal(readback.profile_id, 'evidence_grounded_decision_agent_profile.v1');
  assert.equal(readback.contract_ref, EVIDENCE_GROUNDED_DECISION_AGENT_PROFILE_CONTRACT_REF);
  assert.equal(readback.consumption_status, 'non_live_module_surface_readback_available');
  assert.equal(readback.module_surface_consumption_status, 'non_live_module_surface_readback_available');
  assert.deepEqual(readback.module_surface_ids, requiredModules);
  assert.deepEqual(readback.first_class_object_names, requiredObjects);
  assert.deepEqual(readback.module_owner_ids, requiredModules);
  assert.deepEqual(readback.fail_closed_rule_ids, requiredFailClosedRules);
  assert.deepEqual(readback.forbidden_claim_ids, requiredForbiddenClaims);
  assert.equal(modeRoutingPolicy.policy_id, 'evidence_grounded_mode_routing.v1');
  assert.equal(evidencePolicy.policy_id, 'refs_only_evidence_grounding.v1');
  assert.equal(humanGatePolicy.policy_id, 'decision_support_human_gate.v1');
  assert.equal(
    unsupportedEvidenceBlockerPolicy.policy_id,
    'unsupported_evidence_blocker.v1',
  );
  assert.equal(evidencePolicy.body_storage_policy, 'refs_only_no_source_body_in_profile_contract');
  assert.equal(humanGatePolicy.human_gate_decision_can_be_fabricated_by_opl, false);
  assert.equal(
    unsupportedEvidenceBlockerPolicy.required_blocker_reasons?.includes(
      'sensitive_external_egress_unapproved',
    ),
    true,
  );

  const authority = readback.authority_boundary as Record<string, unknown>;
  assert.equal(authority.profile_can_claim_domain_ready, false);
  assert.equal(authority.profile_can_claim_quality_verdict, false);
  assert.equal(authority.profile_can_claim_final_decision, false);
  assert.equal(authority.profile_can_claim_artifact_authority, false);
  assert.equal(authority.profile_can_claim_owner_receipt, false);
  assert.equal(authority.profile_can_claim_production_ready, false);
  assert.equal(authority.pack_can_create_owner_receipt, false);
  assert.equal(authority.pack_can_create_domain_typed_blocker, false);

  const failClosedRules = readback.fail_closed_rules as Array<{
    rule_id: string;
    success_closeout_allowed: boolean;
    allowed_outcomes: string[];
  }>;
  assert.equal(failClosedRules.every((rule) => rule.success_closeout_allowed === false), true);
  assert.equal(failClosedRules.some((rule) => rule.allowed_outcomes.includes('success')), false);
  assert.deepEqual(
    failClosedRules.find((rule) => rule.rule_id === 'unsafe_tool_data_sharing')?.allowed_outcomes,
    ['human_gate_ref', 'typed_blocker_ref'],
  );

  const ownership = new Map(
    (readback.module_ownership as Array<{ module_id: string; owns: string }>).map((entry) => [
      entry.module_id,
      entry.owns,
    ]),
  );
  assert.equal(ownership.get('pack'), 'profile_and_abi');
  assert.equal(ownership.get('stagecraft'), 'mode_routing_and_evidence_policy');
  assert.equal(ownership.get('runway'), 'durable_attempt_and_human_gate');
  assert.equal(ownership.get('ledger'), 'evidence_and_provenance_refs');
  assert.equal(ownership.get('connect'), 'tool_and_resource_connector_trust');
  assert.equal(ownership.get('workspace'), 'sensitive_source_lifecycle');
  assert.equal(ownership.get('atlas'), 'catalog_and_discovery');
  assert.equal(ownership.get('console'), 'drilldown_projection');
  assert.equal(ownership.get('foundry'), 'evaluation_and_promotion');
  assert.equal(ownership.get('charter'), 'forbidden_claims_and_false_authority_policy');

  const contract = readback.contract as {
    machine_boundary: {
      concrete_domain_agent_implemented: boolean;
      medical_or_hematology_agent_implemented: boolean;
      profile_catalog_is_agent_design_template_source: boolean;
      profile_catalog_is_lower_bound_conformance_guardrail: boolean;
      catalog_requirements_are_refs_only_shape: boolean;
      reference_design_sources_remain_design_source: boolean;
    };
    profile_catalog_entry: {
      catalog_role: string;
      design_source_boundary: {
        profile_catalog_is_agent_design_template_source: boolean;
        profile_requirements_are_lower_bound_shape: boolean;
        reference_design_sources_remain_design_source: boolean;
        target_agent_pack_requires_source_derived_design_consumption_refs: boolean;
      };
    };
    readback_contract: {
      readback_is_stable_json: boolean;
      profile_catalog_can_claim_target_agent_design: boolean;
      source_derived_design_refs_required_for_reference_backed_build: boolean;
      readback_can_claim_runtime_ready: boolean;
      readback_can_claim_domain_ready: boolean;
    };
    consumption_contract: {
      pack_consumers_must_not: string[];
    };
  };
  assert.equal(contract.machine_boundary.concrete_domain_agent_implemented, false);
  assert.equal(contract.machine_boundary.medical_or_hematology_agent_implemented, false);
  assert.equal(contract.machine_boundary.profile_catalog_is_agent_design_template_source, false);
  assert.equal(contract.machine_boundary.profile_catalog_is_lower_bound_conformance_guardrail, true);
  assert.equal(contract.machine_boundary.catalog_requirements_are_refs_only_shape, true);
  assert.equal(contract.machine_boundary.reference_design_sources_remain_design_source, true);
  assert.equal(contract.profile_catalog_entry.catalog_role, 'lower_bound_conformance_guardrail');
  assert.equal(
    contract.profile_catalog_entry.design_source_boundary.profile_catalog_is_agent_design_template_source,
    false,
  );
  assert.equal(
    contract.profile_catalog_entry.design_source_boundary.profile_requirements_are_lower_bound_shape,
    true,
  );
  assert.equal(
    contract.profile_catalog_entry.design_source_boundary.reference_design_sources_remain_design_source,
    true,
  );
  assert.equal(
    contract.profile_catalog_entry.design_source_boundary.target_agent_pack_requires_source_derived_design_consumption_refs,
    true,
  );
  assert.equal(contract.readback_contract.readback_is_stable_json, true);
  assert.equal(contract.readback_contract.profile_catalog_can_claim_target_agent_design, false);
  assert.equal(
    contract.readback_contract.source_derived_design_refs_required_for_reference_backed_build,
    true,
  );
  assert.equal(
    'module_surface_readback_available' in contract.readback_contract
      && contract.readback_contract.module_surface_readback_available,
    true,
  );
  assert.equal(contract.readback_contract.readback_can_claim_runtime_ready, false);
  assert.equal(contract.readback_contract.readback_can_claim_domain_ready, false);
  assert.equal(
    contract.consumption_contract.pack_consumers_must_not.includes(
      'treat_profile_catalog_as_agent_design_source',
    ),
    true,
  );
});
