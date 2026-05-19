import type { JsonRecord } from '../runtime-tray-snapshot-types.ts';

export type AppOperatorDrilldownDetailLevel = 'summary' | 'full';

const DEFAULT_TOP_REF_LIMIT = 10;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function record(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function recordList(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function withLimitedArray<T>(
  value: T[],
  limit: number,
): { refs: T[]; omitted_ref_count: number; total_ref_count: number } {
  return {
    refs: value.slice(0, limit),
    omitted_ref_count: Math.max(value.length - limit, 0),
    total_ref_count: value.length,
  };
}

function limitRefsObject<T extends JsonRecord, K extends keyof T & string>(
  value: T,
  key: K,
  limit: number,
): T {
  const refs = Array.isArray(value[key]) ? value[key] : [];
  const limited = withLimitedArray(refs, limit);
  return {
    ...value,
    [key]: limited.refs,
    omitted_ref_count: limited.omitted_ref_count,
    total_ref_count: limited.total_ref_count,
    detail_policy: limited.omitted_ref_count > 0
      ? 'top_refs_summary_default_use_detail_full_for_complete_refs'
      : 'complete_refs_within_summary_limit',
    full_detail_args: ['--detail', 'full'],
  };
}

function markFullRefsObject<T extends JsonRecord, K extends keyof T & string>(value: T, key: K): T {
  const refs = Array.isArray(value[key]) ? value[key] : [];
  return {
    ...value,
    omitted_ref_count: 0,
    total_ref_count: refs.length,
    detail_policy: 'complete_refs_explicit_full_detail',
  };
}

function summaryAppExecutionBridge<T extends JsonRecord>(value: T, limit: number): T {
  const safeActionRoutes = Array.isArray(value.safe_action_routes) ? value.safe_action_routes : [];
  const supervisedCommandRefs = Array.isArray(value.supervised_command_refs)
    ? value.supervised_command_refs
    : [];
  return {
    ...value,
    safe_action_routes: safeActionRoutes.slice(0, limit),
    safe_action_routes_omitted_count: Math.max(safeActionRoutes.length - limit, 0),
    supervised_command_refs: supervisedCommandRefs.slice(0, limit),
    supervised_command_refs_omitted_count: Math.max(supervisedCommandRefs.length - limit, 0),
    full_detail_args: ['--detail', 'full'],
  };
}

export function applyAppOperatorDrilldownDetail<T extends JsonRecord>(
  drilldown: T,
  detailLevel: AppOperatorDrilldownDetailLevel,
): T {
  if (detailLevel === 'full') {
    const fullDrilldown = {
      ...drilldown,
      detail_level: 'full',
      projection_detail_policy: 'full_refs_explicit_request',
    };
    return {
      ...fullDrilldown,
      route_graph_refs: markFullRefsObject(record(fullDrilldown.route_graph_refs), 'refs'),
      operator_action_routing_refs:
        markFullRefsObject(record(fullDrilldown.operator_action_routing_refs), 'refs'),
    };
  }

  const typedBlockers = record(drilldown.typed_blocker_refs);
  const typedBlockerBodies = recordList(typedBlockers.blockers);
  const refFamilies = record(drilldown.ref_family_refs);
  return {
    ...drilldown,
    detail_level: 'summary',
    projection_detail_policy: 'summary_first_top_refs_default',
    full_detail_args: ['--detail', 'full'],
    route_graph_refs: limitRefsObject(record(drilldown.route_graph_refs), 'refs', DEFAULT_TOP_REF_LIMIT),
    decision_map_refs: limitRefsObject(record(drilldown.decision_map_refs), 'refs', DEFAULT_TOP_REF_LIMIT),
    review_repair_queue_refs: limitRefsObject(record(drilldown.review_repair_queue_refs), 'items', DEFAULT_TOP_REF_LIMIT),
    artifact_gallery_refs: limitRefsObject(record(drilldown.artifact_gallery_refs), 'refs', DEFAULT_TOP_REF_LIMIT),
    provider_slo_operator_action_refs:
      limitRefsObject(record(drilldown.provider_slo_operator_action_refs), 'refs', DEFAULT_TOP_REF_LIMIT),
    periodic_execution_refs: limitRefsObject(record(drilldown.periodic_execution_refs), 'refs', DEFAULT_TOP_REF_LIMIT),
    operator_action_routing_refs:
      limitRefsObject(record(drilldown.operator_action_routing_refs), 'refs', DEFAULT_TOP_REF_LIMIT),
    owner_receipt_refs: limitRefsObject(record(drilldown.owner_receipt_refs), 'refs', DEFAULT_TOP_REF_LIMIT),
    typed_blocker_refs: {
      ...limitRefsObject(typedBlockers, 'refs', DEFAULT_TOP_REF_LIMIT),
      blockers: typedBlockerBodies.slice(0, DEFAULT_TOP_REF_LIMIT),
      blockers_omitted_count: Math.max(typedBlockerBodies.length - DEFAULT_TOP_REF_LIMIT, 0),
    },
    freshness_refs: limitRefsObject(record(drilldown.freshness_refs), 'refs', DEFAULT_TOP_REF_LIMIT),
    ref_family_refs: {
      ...refFamilies,
      source_refs: limitRefsObject(record(refFamilies.source_refs), 'refs', DEFAULT_TOP_REF_LIMIT),
      artifact_refs: limitRefsObject(record(refFamilies.artifact_refs), 'refs', DEFAULT_TOP_REF_LIMIT),
      memory_refs: limitRefsObject(record(refFamilies.memory_refs), 'refs', DEFAULT_TOP_REF_LIMIT),
    },
    safe_action_refs: limitRefsObject(record(drilldown.safe_action_refs), 'refs', DEFAULT_TOP_REF_LIMIT),
    app_execution_bridge:
      summaryAppExecutionBridge(record(drilldown.app_execution_bridge), DEFAULT_TOP_REF_LIMIT),
    lifecycle_ledger_refs:
      limitRefsObject(record(drilldown.lifecycle_ledger_refs), 'refs', DEFAULT_TOP_REF_LIMIT),
    domain_projection_refs:
      limitRefsObject(record(drilldown.domain_projection_refs), 'refs', DEFAULT_TOP_REF_LIMIT),
    domain_legacy_cleanup_plan_refs:
      limitRefsObject(record(drilldown.domain_legacy_cleanup_plan_refs), 'refs', DEFAULT_TOP_REF_LIMIT),
  };
}
