import { fileURLToPath } from 'node:url';

import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { readJsonRecordFile, type JsonRecord } from '../../kernel/json-file.ts';

const EVIDENCE_GROUNDED_DECISION_AGENT_PROFILE_CONTRACT_REF =
  'contracts/opl-framework/evidence-grounded-decision-agent-profile.json';

const CONTRACT_PATH = fileURLToPath(
  new URL(`../../../${EVIDENCE_GROUNDED_DECISION_AGENT_PROFILE_CONTRACT_REF}`, import.meta.url),
);

const CONTRACT_JSON_FILE_BOUNDARY = {
  missingMessage: (filePath: string) => `Evidence-grounded decision agent profile contract is missing: ${filePath}.`,
  missingDetails: (filePath: string) => ({ path: filePath }),
  invalidJsonMessage: (filePath: string) =>
    `Evidence-grounded decision agent profile contract contains invalid JSON: ${filePath}.`,
  invalidJsonDetails: (filePath: string, cause: string) => ({ path: filePath, cause }),
  invalidRootMessage: () => 'Evidence-grounded decision agent profile contract root must be an object.',
  invalidRootDetails: (filePath: string) => ({ path: filePath }),
};

function shape(message: string, details: JsonRecord = {}) {
  return new FrameworkContractError('contract_shape_invalid', message, {
    file: EVIDENCE_GROUNDED_DECISION_AGENT_PROFILE_CONTRACT_REF,
    ...details,
  });
}

function recordField(record: JsonRecord, field: string) {
  const value = record[field];
  if (!isRecord(value)) {
    throw shape(`Evidence-grounded Stagecraft profile ${field} must be an object.`, { field });
  }
  return value;
}

function recordArrayField(record: JsonRecord, field: string) {
  const value = record[field];
  if (!Array.isArray(value) || !value.every(isRecord)) {
    throw shape(`Evidence-grounded Stagecraft profile ${field} must be an object array.`, { field });
  }
  return value;
}

function stringField(record: JsonRecord, field: string) {
  const value = record[field];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw shape(`Evidence-grounded Stagecraft profile ${field} must be a non-empty string.`, { field });
  }
  return value.trim();
}

function stringArrayField(record: JsonRecord, field: string) {
  const value = record[field];
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string')) {
    throw shape(`Evidence-grounded Stagecraft profile ${field} must be a string array.`, { field });
  }
  return value;
}

function readEvidenceGroundedDecisionAgentProfileContract() {
  return readJsonRecordFile(CONTRACT_PATH, CONTRACT_JSON_FILE_BOUNDARY);
}

function firstClassObject(contract: JsonRecord, objectName: string) {
  const found = recordArrayField(contract, 'first_class_objects')
    .find((entry) => entry.object_name === objectName);
  if (!found) {
    throw shape(`Evidence-grounded Stagecraft profile is missing ${objectName}.`, {
      field: 'first_class_objects',
      object_name: objectName,
    });
  }
  return found;
}

export function buildEvidenceGroundedStagecraftProfilePolicyReadback(
  contract = readEvidenceGroundedDecisionAgentProfileContract(),
) {
  const modeRoutingPolicy = recordField(contract, 'mode_routing_policy');
  const evidencePolicy = recordField(contract, 'evidence_policy');
  const humanGatePolicy = recordField(contract, 'human_gate_policy');
  const blockerPolicy = recordField(contract, 'unsupported_evidence_blocker_policy');
  const decisionSupportFlow = recordField(contract, 'decision_support_flow');
  const modeRoutingReceipt = firstClassObject(contract, 'ModeRoutingReceipt');
  const synthesisPacket = firstClassObject(contract, 'SynthesisPacket');
  const independentReviewReceipt = firstClassObject(contract, 'IndependentReviewReceipt');
  const requiredReceiptFields = stringArrayField(modeRoutingPolicy, 'required_receipt_fields');
  const requiredEvidenceFields = stringArrayField(evidencePolicy, 'required_evidence_fields');

  return {
    version: 'g2',
    evidence_grounded_stagecraft_profile: {
      surface_kind: 'opl_evidence_grounded_stagecraft_profile_policy_readback',
      version: 'evidence-grounded-stagecraft-profile-policy-readback.v1',
      module_id: 'stagecraft',
      brand_module: 'OPL Stagecraft',
      source_contract_ref: EVIDENCE_GROUNDED_DECISION_AGENT_PROFILE_CONTRACT_REF,
      source_readback_command: 'opl foundry evidence-profile inspect --json',
      policy_projection_role: 'non_live_refs_only_advisory_policy_projection',
      live_evidence_performed: false,
      mode_routing_receipt: {
        surface_kind: 'opl_evidence_grounded_mode_routing_receipt_shape',
        policy_id: stringField(modeRoutingPolicy, 'policy_id'),
        receipt_object: stringField(modeRoutingPolicy, 'routing_receipt_object'),
        first_class_object: modeRoutingReceipt,
        required_receipt_fields: requiredReceiptFields,
        required_ref_fields: requiredReceiptFields.filter((field) => field.endsWith('_ref')),
        allowed_mode_classes: stringArrayField(modeRoutingPolicy, 'allowed_mode_classes'),
        can_replace_domain_policy: modeRoutingPolicy.routing_receipt_can_replace_domain_policy === true,
      },
      allowed_mode_classes: stringArrayField(modeRoutingPolicy, 'allowed_mode_classes'),
      evidence_sufficiency_policy: {
        surface_kind: 'opl_evidence_grounded_stagecraft_evidence_sufficiency_policy',
        policy_id: stringField(evidencePolicy, 'policy_id'),
        evidence_object: stringField(evidencePolicy, 'evidence_object'),
        required_evidence_fields: requiredEvidenceFields,
        required_evidence_ref_fields: requiredEvidenceFields.filter((field) => field.endsWith('_ref')),
        accepted_conflict_statuses: stringArrayField(evidencePolicy, 'accepted_conflict_statuses'),
        body_storage_policy: stringField(evidencePolicy, 'body_storage_policy'),
        sufficient_when: [
          'required_evidence_ref_fields_present',
          'mode_evidence_threshold_ref_satisfied',
          'source_freshness_window_ref_satisfied',
          'conflict_status_allowed_by_owner_policy',
        ],
        insufficient_evidence_route_back: {
          mode_class: 'insufficient_evidence_route_back',
          fail_closed_rule_ids: recordArrayField(contract, 'fail_closed_rules')
            .map((rule) => stringField(rule, 'rule_id')),
          allowed_route_refs: stringArrayField(humanGatePolicy, 'allowed_closeout_refs'),
          blocker_policy_id: stringField(blockerPolicy, 'policy_id'),
          blocker_shape: stringField(blockerPolicy, 'blocker_shape'),
        },
        can_claim_quality_verdict: evidencePolicy.evidence_packet_can_claim_quality_verdict === true,
      },
      independent_review_requirement_gate: {
        surface_kind: 'opl_evidence_grounded_independent_review_requirement_gate',
        gate_role: 'refs_only_advisory_review_gate',
        review_receipt_object: independentReviewReceipt,
        synthesis_object: synthesisPacket,
        required_flow_step: stringArrayField(decisionSupportFlow, 'steps')
          .find((step) => step === 'independent_review_or_human_gate') ?? null,
        acceptable_review_refs: ['independent_review_receipt_ref'],
        route_back_or_human_gate_refs: stringArrayField(humanGatePolicy, 'allowed_closeout_refs'),
        advisory_only: true,
        can_authorize_final_decision: false,
      },
      authority_boundary: {
        stagecraft_projection_only: true,
        refs_only: true,
        advisory_only: true,
        can_replace_domain_policy: false,
        can_claim_domain_ready: false,
        can_claim_quality_verdict: false,
        can_claim_final_decision: false,
        can_create_owner_receipt: false,
        can_create_domain_typed_blocker: false,
      },
    },
  };
}
