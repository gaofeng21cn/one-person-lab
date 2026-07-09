import { fileURLToPath } from 'node:url';

import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { readJsonRecordFile } from '../../kernel/json-file.ts';

type JsonRecord = Record<string, unknown>;

export const EVIDENCE_GROUNDED_DECISION_AGENT_PROFILE_CONTRACT_REF =
  'contracts/opl-framework/evidence-grounded-decision-agent-profile.json';

const CONTRACT_PATH = fileURLToPath(
  new URL(`../../../${EVIDENCE_GROUNDED_DECISION_AGENT_PROFILE_CONTRACT_REF}`, import.meta.url),
);

const REQUIRED_FIRST_CLASS_OBJECTS = [
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
] as const;

const REQUIRED_OWNER_MODULES = [
  'pack',
  'stagecraft',
  'runway',
  'ledger',
  'connect',
  'workspace',
  'atlas',
  'console',
  'foundry-lab',
  'charter',
] as const;

const REQUIRED_FAIL_CLOSED_RULES = [
  'no_evidence',
  'low_confidence',
  'evidence_conflict',
  'stale_source',
  'unsafe_tool_data_sharing',
] as const;

const REQUIRED_FORBIDDEN_CLAIMS = [
  'domain_ready',
  'quality_verdict',
  'final_decision',
  'artifact_authority',
  'owner_receipt',
  'production_ready',
] as const;

const REQUIRED_FALSE_AUTHORITY_FIELDS = [
  'profile_can_claim_domain_ready',
  'profile_can_claim_quality_verdict',
  'profile_can_claim_final_decision',
  'profile_can_claim_artifact_authority',
  'profile_can_claim_owner_receipt',
  'profile_can_claim_production_ready',
  'pack_can_write_domain_truth',
  'pack_can_write_memory_body',
  'pack_can_mutate_artifact_body',
  'pack_can_create_owner_receipt',
  'pack_can_create_domain_typed_blocker',
  'pack_can_closeout_fail_closed_rule_as_success',
  'tool_result_envelope_can_share_unsafe_data',
] as const;

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

function stringField(record: JsonRecord, field: string) {
  const value = record[field];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw shape(`Evidence-grounded decision agent profile ${field} must be a non-empty string.`, { field });
  }
  return value.trim();
}

function recordField(record: JsonRecord, field: string) {
  const value = record[field];
  if (!isRecord(value)) {
    throw shape(`Evidence-grounded decision agent profile ${field} must be an object.`, { field });
  }
  return value;
}

function recordArrayField(record: JsonRecord, field: string) {
  const value = record[field];
  if (!Array.isArray(value) || !value.every(isRecord)) {
    throw shape(`Evidence-grounded decision agent profile ${field} must be an object array.`, { field });
  }
  return value;
}

function valuesByField(record: JsonRecord, arrayField: string, itemField: string) {
  return recordArrayField(record, arrayField).map((entry, index) => {
    const value = entry[itemField];
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw shape(`Evidence-grounded decision agent profile ${arrayField}[${index}].${itemField} must be a non-empty string.`, {
        field: `${arrayField}[${index}].${itemField}`,
      });
    }
    return value.trim();
  });
}

function requireAll(field: string, actual: string[], expected: readonly string[]) {
  const missing = expected.filter((entry) => !actual.includes(entry));
  if (missing.length > 0) {
    throw shape(`Evidence-grounded decision agent profile ${field} is missing required entries.`, {
      field,
      missing,
    });
  }
}

function validateFailClosedRules(contract: JsonRecord) {
  const rules = recordArrayField(contract, 'fail_closed_rules');
  const ruleIds = valuesByField(contract, 'fail_closed_rules', 'rule_id');
  requireAll('fail_closed_rules', ruleIds, REQUIRED_FAIL_CLOSED_RULES);
  for (const [index, rule] of rules.entries()) {
    if (rule.success_closeout_allowed !== false) {
      throw shape('Evidence-grounded decision agent fail-closed rules must not allow success closeout.', {
        field: `fail_closed_rules[${index}].success_closeout_allowed`,
      });
    }
    const outcomes = rule.allowed_outcomes;
    if (!Array.isArray(outcomes) || outcomes.some((outcome) => typeof outcome !== 'string')) {
      throw shape('Evidence-grounded decision agent fail-closed rules require string allowed_outcomes.', {
        field: `fail_closed_rules[${index}].allowed_outcomes`,
      });
    }
    if (outcomes.includes('success')) {
      throw shape('Evidence-grounded decision agent fail-closed rules must not include success outcome.', {
        field: `fail_closed_rules[${index}].allowed_outcomes`,
      });
    }
  }
}

function validateAuthorityBoundary(contract: JsonRecord) {
  const boundary = recordField(contract, 'authority_boundary');
  for (const field of REQUIRED_FALSE_AUTHORITY_FIELDS) {
    if (boundary[field] !== false) {
      throw shape(`Evidence-grounded decision agent authority_boundary.${field} must be false.`, {
        field: `authority_boundary.${field}`,
      });
    }
  }
  return boundary;
}

function validateRequiredPolicyRecord(contract: JsonRecord, field: string) {
  const record = recordField(contract, field);
  stringField(record, 'policy_id');
  return record;
}

function validateContract(contract: JsonRecord) {
  if (stringField(contract, 'surface_kind') !== 'opl_evidence_grounded_decision_agent_profile_contract') {
    throw shape('Evidence-grounded decision agent profile surface_kind is invalid.', { field: 'surface_kind' });
  }
  if (stringField(contract, 'profile_id') !== 'evidence_grounded_decision_agent_profile.v1') {
    throw shape('Evidence-grounded decision agent profile_id is invalid.', { field: 'profile_id' });
  }
  requireAll(
    'first_class_objects',
    valuesByField(contract, 'first_class_objects', 'object_name'),
    REQUIRED_FIRST_CLASS_OBJECTS,
  );
  requireAll(
    'module_ownership',
    valuesByField(contract, 'module_ownership', 'module_id'),
    REQUIRED_OWNER_MODULES,
  );
  requireAll(
    'forbidden_claims',
    valuesByField(contract, 'forbidden_claims', 'claim_id'),
    REQUIRED_FORBIDDEN_CLAIMS,
  );
  validateFailClosedRules(contract);
  validateAuthorityBoundary(contract);
  validateRequiredPolicyRecord(contract, 'mode_routing_policy');
  validateRequiredPolicyRecord(contract, 'evidence_policy');
  validateRequiredPolicyRecord(contract, 'human_gate_policy');
  validateRequiredPolicyRecord(contract, 'unsupported_evidence_blocker_policy');
}

export function readEvidenceGroundedDecisionAgentProfileContract() {
  const contract = readJsonRecordFile(CONTRACT_PATH, CONTRACT_JSON_FILE_BOUNDARY);
  validateContract(contract);
  return contract;
}

export function buildEvidenceGroundedDecisionAgentProfileReadback() {
  const contract = readEvidenceGroundedDecisionAgentProfileContract();
  return {
    version: 'g2',
    evidence_grounded_decision_agent_profile: {
      surface_kind: 'opl_evidence_grounded_decision_agent_profile_readback',
      version: 'evidence-grounded-decision-agent-profile-readback.v1',
      profile_id: contract.profile_id,
      contract_ref: EVIDENCE_GROUNDED_DECISION_AGENT_PROFILE_CONTRACT_REF,
      owner: contract.owner,
      state: contract.state,
      consumption_status: contract.consumption_status,
      first_class_object_names: valuesByField(contract, 'first_class_objects', 'object_name'),
      module_owner_ids: valuesByField(contract, 'module_ownership', 'module_id'),
      fail_closed_rule_ids: valuesByField(contract, 'fail_closed_rules', 'rule_id'),
      forbidden_claim_ids: valuesByField(contract, 'forbidden_claims', 'claim_id'),
      source_of_truth_refs: contract.source_of_truth_refs,
      module_ownership: contract.module_ownership,
      fail_closed_rules: contract.fail_closed_rules,
      forbidden_claims: contract.forbidden_claims,
      mode_routing_policy: contract.mode_routing_policy,
      evidence_policy: contract.evidence_policy,
      human_gate_policy: contract.human_gate_policy,
      unsupported_evidence_blocker_policy: contract.unsupported_evidence_blocker_policy,
      authority_boundary: contract.authority_boundary,
      contract,
    },
  };
}
