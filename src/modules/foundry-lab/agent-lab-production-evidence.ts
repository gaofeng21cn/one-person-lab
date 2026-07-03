import { AGENT_LAB_AUTHORITY_BOUNDARY } from './agent-lab-authority.ts';
import { stableId } from '../../kernel/stable-id.ts';

type JsonRecord = Record<string, unknown>;
type AgentLabProductionEvidenceGateStatus = 'passed' | 'blocked';

export type AgentLabProductionEvidenceSuiteInput = {
  suite_id: string;
  suite_kind?: string;
  production_evidence_gate?: JsonRecord;
};

export type AgentLabProductionEvidenceRunInput = {
  promotion_gate: {
    no_forbidden_write_proof_refs: string[];
  };
};

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function unique(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return unique(value.filter((entry): entry is string => typeof entry === 'string'));
}

function textField(record: JsonRecord | null, key: string): string | null {
  if (!record || typeof record[key] !== 'string') {
    return null;
  }
  const value = record[key].trim();
  return value.length > 0 ? value : null;
}

function stringRecordRefs(record: JsonRecord | null, keys: string[]) {
  return unique(keys.flatMap((key) => stringList(record?.[key])));
}

function evidenceGateInput(input: AgentLabProductionEvidenceSuiteInput) {
  if (isRecord(input.production_evidence_gate)) {
    return input.production_evidence_gate;
  }
  return null;
}

export function buildProductionEvidenceGateResult(
  input: AgentLabProductionEvidenceSuiteInput,
  runs: AgentLabProductionEvidenceRunInput[],
) {
  const gateInput = evidenceGateInput(input);
  const isProductionEvidenceSuite = input.suite_kind === 'agent_production_evidence_suite' || Boolean(gateInput);
  if (!isProductionEvidenceSuite) {
    return undefined;
  }

  const gateIds = stringRecordRefs(gateInput, ['gate_ids', 'gate_refs', 'production_evidence_gate_refs']);
  const ownerRouteRef = textField(gateInput, 'owner_route_ref');
  const ownerRouteRefs = unique([
    ...stringRecordRefs(gateInput, ['owner_route_refs', 'owner_routes']),
    ...(ownerRouteRef ? [ownerRouteRef] : []),
  ]);
  const noForbiddenWriteProofRefs = unique([
    ...stringRecordRefs(gateInput, [
      'no_forbidden_write_refs',
      'no_forbidden_write_proof_refs',
      'forbidden_write_scan_refs',
    ]),
    ...runs.flatMap((run) => run.promotion_gate.no_forbidden_write_proof_refs),
  ]);
  const typedBlockerRefs = stringRecordRefs(gateInput, [
    'typed_blocker_refs',
    'blocker_refs',
    'required_typed_blocker_refs',
  ]);
  const requiredReceiptRefs = stringRecordRefs(gateInput, [
    'required_receipt_refs',
    'required_owner_receipt_refs',
    'owner_receipt_required_refs',
  ]);
  const providedGateResultRefs = stringRecordRefs(gateInput, ['gate_result_refs', 'evidence_gate_result_refs']);
  const domainVerdictClaimed = gateInput?.domain_verdict_claimed === true
    || gateInput?.domain_ready_claimed === true
    || gateInput?.quality_verdict_claimed === true;
  const missingRequiredRefs = unique([
    gateIds.length === 0 ? 'production_evidence_gate_id_missing' : '',
    ownerRouteRefs.length === 0 ? 'production_evidence_owner_route_ref_missing' : '',
    noForbiddenWriteProofRefs.length === 0 ? 'production_evidence_no_forbidden_write_ref_missing' : '',
    requiredReceiptRefs.length === 0 ? 'production_evidence_required_receipt_ref_missing' : '',
    domainVerdictClaimed ? 'production_evidence_domain_verdict_claimed_by_opl_forbidden' : '',
  ]);
  const status: AgentLabProductionEvidenceGateStatus = missingRequiredRefs.length === 0 ? 'passed' : 'blocked';
  const resultRef = stableId('oalpeg', [
    input.suite_id,
    input.suite_kind,
    gateIds,
    ownerRouteRefs,
    noForbiddenWriteProofRefs,
    typedBlockerRefs,
    requiredReceiptRefs,
    domainVerdictClaimed,
  ]);

  return {
    surface_kind: 'opl_agent_lab_production_evidence_gate_result',
    result_ref: resultRef,
    gate_result_refs: providedGateResultRefs.length > 0
      ? providedGateResultRefs
      : [`gate-result-ref:opl-agent-lab/production-evidence/${resultRef}`],
    suite_kind: input.suite_kind ?? 'agent_production_evidence_suite',
    status,
    gate_ids: gateIds,
    owner_route_refs: ownerRouteRefs,
    no_forbidden_write_proof_refs: noForbiddenWriteProofRefs,
    typed_blocker_refs: typedBlockerRefs,
    required_receipt_refs: requiredReceiptRefs,
    missing_required_refs: missingRequiredRefs,
    domain_verdict_claimed: false,
    input_domain_verdict_claimed: domainVerdictClaimed,
    refs_only: true,
    writes_domain_truth: false,
    writes_quality_verdict: false,
    writes_domain_artifact_body: false,
    writes_memory_body: false,
    writes_owner_receipt: false,
    authority_boundary: AGENT_LAB_AUTHORITY_BOUNDARY,
  };
}
