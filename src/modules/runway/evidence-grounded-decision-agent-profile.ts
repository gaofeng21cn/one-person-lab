import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import type { JsonRecord } from '../../kernel/json-file.ts';
import {
  EVIDENCE_GROUNDED_DECISION_AGENT_PROFILE_CONTRACT_REF,
  readEvidenceGroundedDecisionAgentProfileContract,
} from '../pack/index.ts';

function shape(message: string, details: JsonRecord = {}) {
  return new FrameworkContractError('contract_shape_invalid', message, {
    file: EVIDENCE_GROUNDED_DECISION_AGENT_PROFILE_CONTRACT_REF,
    ...details,
  });
}

function recordField(record: JsonRecord, field: string) {
  const value = record[field];
  if (!isRecord(value)) {
    throw shape(`Evidence-grounded Runway profile ${field} must be an object.`, { field });
  }
  return value;
}

function recordArrayField(record: JsonRecord, field: string) {
  const value = record[field];
  if (!Array.isArray(value) || !value.every(isRecord)) {
    throw shape(`Evidence-grounded Runway profile ${field} must be an object array.`, { field });
  }
  return value;
}

function stringField(record: JsonRecord, field: string) {
  const value = record[field];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw shape(`Evidence-grounded Runway profile ${field} must be a non-empty string.`, { field });
  }
  return value.trim();
}

function stringArrayField(record: JsonRecord, field: string) {
  const value = record[field];
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string')) {
    throw shape(`Evidence-grounded Runway profile ${field} must be a string array.`, { field });
  }
  return value;
}

function firstClassObject(contract: JsonRecord, objectName: string) {
  const found = recordArrayField(contract, 'first_class_objects')
    .find((entry) => entry.object_name === objectName);
  if (!found) {
    throw shape(`Evidence-grounded Runway profile is missing ${objectName}.`, {
      field: 'first_class_objects',
      object_name: objectName,
    });
  }
  return found;
}

function failClosedRules(contract: JsonRecord) {
  return recordArrayField(contract, 'fail_closed_rules').map((rule) => ({
    rule_id: stringField(rule, 'rule_id'),
    success_closeout_allowed: rule.success_closeout_allowed === true,
    allowed_closeout_refs: stringArrayField(rule, 'allowed_outcomes'),
  }));
}

export function buildEvidenceGroundedRunwayProfilePolicyReadback(
  contract = readEvidenceGroundedDecisionAgentProfileContract(),
) {
  const humanGatePolicy = recordField(contract, 'human_gate_policy');
  const authorityBoundary = recordField(contract, 'authority_boundary');
  const rules = failClosedRules(contract);
  const allowedCloseoutRefs = stringArrayField(humanGatePolicy, 'allowed_closeout_refs');

  return {
    version: 'g2',
    evidence_grounded_runway_profile: {
      surface_kind: 'opl_evidence_grounded_runway_profile_policy_readback',
      version: 'evidence-grounded-runway-profile-policy-readback.v1',
      module_id: 'runway',
      brand_module: 'OPL Runway',
      source_contract_ref: EVIDENCE_GROUNDED_DECISION_AGENT_PROFILE_CONTRACT_REF,
      source_readback_command: 'opl foundry evidence-profile inspect --json',
      policy_projection_role: 'non_live_refs_only_attempt_closeout_projection',
      live_evidence_performed: false,
      attempt_closeout_policy: {
        surface_kind: 'opl_evidence_grounded_attempt_fail_closed_closeout_policy',
        fail_closed_rule_ids: rules.map((rule) => rule.rule_id),
        all_rules_fail_closed: rules.every((rule) => rule.success_closeout_allowed === false),
        success_closeout_allowed_when_any_fail_closed_rule_matches: false,
        allowed_closeout_refs_by_rule: rules,
        can_closeout_fail_closed_rule_as_success:
          authorityBoundary.pack_can_closeout_fail_closed_rule_as_success === true,
      },
      human_gate_lifecycle_policy: {
        surface_kind: 'opl_evidence_grounded_human_gate_lifecycle_policy',
        policy_id: stringField(humanGatePolicy, 'policy_id'),
        human_gate_object: firstClassObject(contract, 'HumanGateDecision'),
        required_when: stringArrayField(humanGatePolicy, 'required_when'),
        lifecycle_states: [
          'required_by_policy',
          'waiting_for_human_gate_ref',
          'closed_by_allowed_closeout_ref',
        ],
        allowed_closeout_refs: allowedCloseoutRefs,
        closeout_ref_policy: 'human_gate_ref_route_back_ref_or_typed_blocker_ref_only',
        human_gate_decision_can_be_fabricated_by_opl:
          humanGatePolicy.human_gate_decision_can_be_fabricated_by_opl === true,
      },
      human_gate_decision_readback_projection: {
        surface_kind: 'opl_evidence_grounded_human_gate_decision_readback_projection',
        readback_is_refs_only: true,
        accepted_closeout_refs: allowedCloseoutRefs,
        required_external_decision_ref: 'human_gate_ref',
        missing_or_unapproved_decision_routes_to: allowedCloseoutRefs
          .filter((ref) => ref !== 'human_gate_ref'),
        opl_can_fabricate_decision:
          humanGatePolicy.human_gate_decision_can_be_fabricated_by_opl === true,
      },
      authority_boundary: {
        runway_projection_only: true,
        refs_only: true,
        can_create_human_gate_decision: false,
        can_fabricate_human_gate_decision: false,
        can_claim_domain_ready: false,
        can_claim_quality_verdict: false,
        can_claim_final_decision: false,
        can_create_owner_receipt: false,
        can_create_domain_typed_blocker: false,
        can_closeout_fail_closed_rule_as_success: false,
      },
    },
  };
}

