import type { JsonRecord } from '../runtime-tray-snapshot-types.ts';

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function record(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function recordList(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.map(stringValue).filter((entry): entry is string => Boolean(entry))
    : [];
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function buildOmaProductionConsumptionFollowthroughAttention(drilldown: JsonRecord) {
  const followthrough = record(
    record(drilldown.opl_meta_agent_workbench_refs).production_consumption_followthrough,
  );
  const summary = record(followthrough.summary);
  const gateItems = recordList(followthrough.gate_items);
  const openGateItems = gateItems.filter((gate) => stringValue(gate.status) !== 'refs_observed');
  const openGateIds = stringList(summary.open_gate_ids);
  const status = stringValue(followthrough.status)
    ?? 'oma_contracts_not_bound_production_followthrough_unavailable';
  return {
    surface_kind: 'opl_app_drilldown_oma_production_consumption_followthrough_attention',
    status,
    owner: stringValue(followthrough.owner) ?? 'one-person-lab',
    target_agent: stringValue(followthrough.target_agent) ?? 'opl-meta-agent',
    target_repo: stringValue(followthrough.target_repo) ?? 'opl-meta-agent',
    structural_consumption_ready: summary.structural_consumption_ready === true,
    production_consumption_ready: summary.production_consumption_ready === true,
    open_gate_count: numberValue(summary.open_gate_count),
    open_gate_ids: openGateIds,
    attention_required: numberValue(summary.open_gate_count) > 0,
    gate_items: openGateItems.map((gate) => ({
      gate_id: stringValue(gate.gate_id),
      status: stringValue(gate.status),
      required_refs_any_of: stringList(gate.required_refs_any_of),
      observed_ref_count: numberValue(gate.observed_ref_count),
      observed_target_count: numberValue(gate.observed_target_count),
      target_count: numberValue(gate.target_count),
      current_contract_status: stringValue(gate.current_contract_status),
      full_detail_section: stringValue(gate.full_detail_section)
        ?? 'opl_meta_agent_workbench_refs',
    })),
    required_return_shapes: [
      'managed_install_update_receipt_ref',
      'app_live_path_receipt_ref',
      'owner_receipt_or_typed_blocker_ref',
      'long_soak_receipt_ref',
    ],
    full_detail_section: 'opl_meta_agent_workbench_refs',
    authority_boundary: {
      ...record(drilldown.authority_boundary),
      can_write_domain_truth: false,
      can_create_owner_receipt: false,
      can_close_domain_ready: false,
      can_claim_production_ready: false,
      can_authorize_quality_or_export: false,
      can_promote_default_agent_without_gate: false,
    },
  };
}
