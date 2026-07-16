import {
  countValue as numberValue,
  type JsonRecord,
  record,
  recordList,
  stringValue,
} from '../../kernel/json-record.ts';

export function semanticHygieneContractFloor(
  semanticHygiene: JsonRecord,
  sourceCommand: string,
) {
  const summary = record(semanticHygiene.summary);
  const gates = recordList(semanticHygiene.gates);
  const gateIds = gates
    .map((gate) => stringValue(gate.gate_id))
    .filter((gateId): gateId is string => Boolean(gateId))
    .slice(0, 10);
  const functionalPrivatizationGate = gates.find((gate) =>
    stringValue(gate.gate_id) === 'functional_privatization_evidence_gate'
  );
  const domainSpecificCarrierGate = gates.find((gate) =>
    stringValue(gate.gate_id) === 'domain_specific_carrier_boundary'
  );
  return {
    surface_kind: 'opl_framework_readiness_semantic_hygiene_contract_floor',
    source_command: sourceCommand,
    gate_count: numberValue(summary.gate_count),
    guarded_gate_count: numberValue(summary.guarded_gate_count),
    attention_required_gate_count: numberValue(summary.attention_required_gate_count),
    gate_ids: gateIds,
    gate_id_limit: 10,
    omitted_gate_count: Math.max(gates.length - gateIds.length, 0),
    functional_privatization_evidence_gate_status:
      stringValue(record(functionalPrivatizationGate).status),
    domain_specific_carrier_boundary_status:
      stringValue(record(domainSpecificCarrierGate).status),
    contract_floor_only: true,
    default_payload_role:
      'bounded_contract_floor_context_for_default_caller_not_operator_work_item',
    authority_boundary: {
      can_claim_domain_ready: false,
      can_claim_production_ready: false,
      can_claim_artifact_authority: false,
      can_authorize_quality_or_export: false,
      can_replace_ai_executor_planning: false,
      can_replace_domain_owner: false,
    },
  };
}
