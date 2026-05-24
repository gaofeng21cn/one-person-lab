import type { JsonRecord } from '../runtime-tray-snapshot-types.ts';
import {
  OMA_PRODUCTION_CONSUMPTION_ACTION_ID,
  OMA_PRODUCTION_CONSUMPTION_ACTION_KIND,
  omaProductionConsumptionPayloadWorkorder,
  omaProductionConsumptionPayloadRefHints,
  omaProductionConsumptionPayloadTemplate,
  omaProductionConsumptionRuntimeActionExecuteCommand,
} from '../oma-production-consumption-action.ts';

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

function commandRef(args: string[]) {
  return `opl ${args.map((arg) => (
    arg.includes(' ') || arg.includes('"') ? JSON.stringify(arg) : arg
  )).join(' ')}`;
}

export function omaProductionConsumptionNextStep(followthrough: JsonRecord) {
  const recordArgs = ['runtime', 'oma-production-consumption', 'record'];
  const summary = record(followthrough.summary);
  const openGateCount = numberValue(followthrough.open_gate_count)
    || numberValue(summary.open_gate_count);
  const openGateIds = stringList(followthrough.open_gate_ids).length > 0
    ? stringList(followthrough.open_gate_ids)
    : stringList(summary.open_gate_ids);
  const canRecord = openGateCount > 0
    || followthrough.blocked_by_typed_blocker_refs === true;
  return {
    step_kind: 'oma_production_consumption_followthrough',
    owner: stringValue(followthrough.owner) ?? 'one-person-lab',
    target_agent: stringValue(followthrough.target_agent) ?? 'opl-meta-agent',
    target_repo: stringValue(followthrough.target_repo) ?? 'opl-meta-agent',
    status: stringValue(followthrough.status),
    structural_consumption_ready: followthrough.structural_consumption_ready === true,
    production_consumption_ready: followthrough.production_consumption_ready === true,
    open_gate_count: openGateCount,
    open_gate_ids: openGateIds,
    pending_verify_long_soak_receipt_ref_count:
      numberValue(followthrough.pending_verify_long_soak_receipt_ref_count),
    pending_verify_long_soak_receipt_refs:
      stringList(followthrough.pending_verify_long_soak_receipt_refs),
    required_refs_by_gate: recordList(followthrough.gate_items).map((gate) => ({
      gate_id: stringValue(gate.gate_id),
      status: stringValue(gate.status),
      required_refs_any_of: stringList(gate.required_refs_any_of),
      observed_ref_count: numberValue(gate.observed_ref_count),
      manual_required: gate.manual_required === true,
      manual_required_reason: stringValue(gate.manual_required_reason),
      manual_required_blockers: stringList(gate.manual_required_blockers),
      next_safe_action: record(gate.next_safe_action),
    })),
    required_return_shapes: stringList(followthrough.required_return_shapes),
    payload_owner: 'app_live_operator_or_oma_owner',
    record_action_id: canRecord
      ? OMA_PRODUCTION_CONSUMPTION_ACTION_ID
      : null,
    record_command_ref: canRecord ? commandRef(recordArgs) : null,
    copyable_runtime_action_execute_commands: canRecord
      ? {
          record_with_payload: omaProductionConsumptionRuntimeActionExecuteCommand(),
        }
      : null,
    can_submit_record_to_safe_action_shell: canRecord,
    route_requires_domain_or_app_payload: canRecord,
    can_close_without_domain_or_app_payload: false,
    payload_template: canRecord
      ? omaProductionConsumptionPayloadTemplate()
      : null,
    payload_ref_hints: canRecord ? omaProductionConsumptionPayloadRefHints() : null,
    payload_workorder: canRecord ? omaProductionConsumptionPayloadWorkorder() : null,
    payload_template_policy: canRecord
      ? 'template_is_empty_by_design_replace_with_real_oma_long_soak_or_typed_blocker_refs_before_submit'
      : null,
    empty_payload_template_is_success_evidence: false,
    typed_blocker_ref_count: numberValue(followthrough.typed_blocker_ref_count),
    blocked_by_typed_blocker_refs: followthrough.blocked_by_typed_blocker_refs === true,
    full_detail_section: 'opl_meta_agent_workbench_refs',
    can_execute_domain_action: false,
    can_create_owner_receipt: false,
    can_close_domain_ready: false,
    can_claim_production_ready: false,
    can_authorize_quality_or_export: false,
    can_promote_default_agent_without_gate: false,
  };
}

export function buildOmaProductionConsumptionActionRoutes(followthrough: JsonRecord) {
  const summary = record(followthrough.summary);
  const openGateCount = numberValue(followthrough.open_gate_count)
    || numberValue(summary.open_gate_count);
  const openGateIds = stringList(followthrough.open_gate_ids).length > 0
    ? stringList(followthrough.open_gate_ids)
    : stringList(summary.open_gate_ids);
  if (openGateCount <= 0) {
    return [];
  }
  const args = ['runtime', 'oma-production-consumption', 'record'];
  return [{
    ref: commandRef(args),
    role: 'operator_action_route',
    owner: 'opl',
    route_target_kind: 'opl_cli',
    execution_policy: 'opl_safe_action_shell',
    execution_surface: 'opl runtime action execute',
    stage_attempt_id: null,
    domain_id: null,
    stage_id: null,
    opl_cli_args: args,
    action_id: OMA_PRODUCTION_CONSUMPTION_ACTION_ID,
    action_kind: OMA_PRODUCTION_CONSUMPTION_ACTION_KIND,
    route_status: 'record_route_available',
    route_status_detail:
      'oma_production_consumption_waiting_for_long_soak_or_typed_blocker_refs_payload',
    request_id: 'opl-meta-agent',
    request_pack_id: 'opl_meta_agent.production_consumption_followthrough',
    evidence_route_kind: 'oma_production_consumption',
    evidence_source_ref:
      '/runtime_tray_snapshot/app_operator_drilldown/opl_meta_agent_workbench_refs/production_consumption_followthrough',
    target_agent: stringValue(followthrough.target_agent) ?? 'opl-meta-agent',
    target_repo: stringValue(followthrough.target_repo) ?? 'opl-meta-agent',
    payload_owner: 'app_live_operator_or_oma_owner',
    creates_domain_action: false,
    creates_owner_receipt: false,
    owner_receipt_refs: [],
    can_execute: false as const,
    route_requires_domain_or_app_payload: true,
    can_close_without_domain_or_app_payload: false,
    required_operator_payload_refs: [
      'long_soak_refs',
      'typed_blocker_refs',
      'operator_evidence_refs',
    ],
    required_evidence_refs: openGateIds,
    required_return_shapes: stringList(followthrough.required_return_shapes),
    required_receipt_shapes: ['oma_production_consumption_receipt_ref'],
    typed_blocker_refs: stringList(followthrough.typed_blocker_refs),
    open_reason: 'oma_long_soak_or_typed_blocker_refs_required',
    payload_requirement:
      'app_live_operator_or_oma_owner_refs_payload_required_to_record_oma_long_soak_or_typed_blocker',
    payload_template: omaProductionConsumptionPayloadTemplate(),
    payload_ref_hints: omaProductionConsumptionPayloadRefHints(),
    payload_workorder: omaProductionConsumptionPayloadWorkorder(),
    payload_template_policy:
      'template_is_empty_by_design_replace_with_real_oma_long_soak_or_typed_blocker_refs_before_submit',
    empty_payload_template_is_success_evidence: false,
    copyable_runtime_action_execute_commands: {
      record_with_payload: omaProductionConsumptionRuntimeActionExecuteCommand(),
    },
    can_write_domain_truth: false,
    can_create_owner_receipt: false,
    can_close_domain_ready: false,
    can_claim_production_ready: false,
    can_authorize_quality_or_export: false,
    can_promote_default_agent_without_gate: false,
    authority_boundary: {
      opl: 'oma_production_consumption_ledger_refs_only',
      payload_owner: 'app_live_operator_or_oma_owner',
      refs_only: true,
      can_write_domain_truth: false,
      can_write_memory_body: false,
      can_read_memory_body: false,
      can_read_artifact_body: false,
      can_mutate_artifact_body: false,
      can_authorize_quality_or_export: false,
      can_create_owner_receipt: false,
      can_close_domain_ready: false,
      can_claim_production_ready: false,
      can_promote_default_agent_without_gate: false,
    },
  }];
}

export function buildOmaProductionConsumptionFollowthroughAttention(drilldown: JsonRecord) {
  const followthrough = record(
    record(drilldown.opl_meta_agent_workbench_refs).production_consumption_followthrough,
  );
  const summary = record(followthrough.summary);
  const gateItems = recordList(followthrough.gate_items);
  const openGateItems = gateItems.filter((gate) => stringValue(gate.status) !== 'refs_observed');
  const openGateIds = stringList(summary.open_gate_ids);
  const typedBlockerRefs = stringList(followthrough.typed_blocker_refs);
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
    pending_verify_long_soak_receipt_ref_count:
      numberValue(summary.pending_verify_long_soak_receipt_ref_count),
    pending_verify_long_soak_receipt_refs:
      stringList(summary.pending_verify_long_soak_receipt_refs),
    attention_required:
      numberValue(summary.open_gate_count) > 0
      || numberValue(summary.pending_verify_long_soak_receipt_ref_count) > 0,
    typed_blocker_refs: typedBlockerRefs,
    typed_blocker_ref_count: typedBlockerRefs.length,
    blocked_by_typed_blocker_refs: followthrough.blocked_by_typed_blocker_refs === true,
    historical_typed_blocker_refs: stringList(followthrough.historical_typed_blocker_refs),
    historical_typed_blocker_ref_count:
      numberValue(followthrough.historical_typed_blocker_ref_count),
    gate_items: openGateItems.map((gate) => ({
      gate_id: stringValue(gate.gate_id),
      status: stringValue(gate.status),
      required_refs_any_of: stringList(gate.required_refs_any_of),
      observed_ref_count: numberValue(gate.observed_ref_count),
      observed_target_count: numberValue(gate.observed_target_count),
      target_count: numberValue(gate.target_count),
      current_contract_status: stringValue(gate.current_contract_status),
      manual_required: gate.manual_required === true,
      manual_required_reason: stringValue(gate.manual_required_reason),
      manual_required_blockers: stringList(gate.manual_required_blockers),
      managed_install_update_followthrough: record(gate.managed_install_update_followthrough),
      next_safe_action: record(gate.next_safe_action),
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
