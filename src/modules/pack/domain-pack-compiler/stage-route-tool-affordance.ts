import type { FamilyStageControlPlane } from '../../stagecraft/index.ts';

type JsonRecord = Record<string, unknown>;
type StageDescriptor = FamilyStageControlPlane['stages'][number];

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function recordList(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function refCount(value: unknown) {
  return recordList(value).length;
}

function booleanOrNull(value: unknown) {
  return typeof value === 'boolean' ? value : null;
}

export function buildToolAffordanceBoundaryRoute(stage: StageDescriptor) {
  const boundary = isRecord(stage.tool_affordance_boundary) ? stage.tool_affordance_boundary : null;
  const executorAutonomy = isRecord(boundary?.executor_autonomy) ? boundary.executor_autonomy : null;
  const toolRefCount = stage.tool_refs?.length ?? 0;
  if (!boundary && toolRefCount === 0) {
    return null;
  }
  return {
    status: boundary ? 'declared' : 'missing',
    catalog_role: optionalString(boundary?.catalog_role),
    tool_ref_count: toolRefCount,
    capability_ref_count: refCount(boundary?.capability_refs),
    capability_refs: recordList(boundary?.capability_refs),
    permission_scope_ref_count: refCount(boundary?.permission_scope_refs),
    permission_scope_refs: recordList(boundary?.permission_scope_refs),
    credential_boundary_ref_count: refCount(boundary?.credential_boundary_refs),
    credential_boundary_refs: recordList(boundary?.credential_boundary_refs),
    write_scope_ref_count: refCount(boundary?.write_scope_refs),
    write_scope_refs: recordList(boundary?.write_scope_refs),
    side_effect_risk_ref_count: refCount(boundary?.side_effect_risk_refs),
    side_effect_risk_refs: recordList(boundary?.side_effect_risk_refs),
    forbidden_authority_ref_count: refCount(boundary?.forbidden_authority_refs),
    forbidden_authority_refs: recordList(boundary?.forbidden_authority_refs),
    executor_autonomy: {
      executor_can_choose_tools: booleanOrNull(executorAutonomy?.executor_can_choose_tools),
      executor_can_skip_tools: booleanOrNull(executorAutonomy?.executor_can_skip_tools),
      executor_can_substitute_tools_within_boundary:
        booleanOrNull(executorAutonomy?.executor_can_substitute_tools_within_boundary),
      executor_can_choose_order_and_parallelism:
        booleanOrNull(executorAutonomy?.executor_can_choose_order_and_parallelism),
      executor_can_request_missing_context_or_human_gate:
        booleanOrNull(executorAutonomy?.executor_can_request_missing_context_or_human_gate),
      tool_catalog_can_prescribe_tool_sequence:
        booleanOrNull(executorAutonomy?.tool_catalog_can_prescribe_tool_sequence),
      tool_catalog_can_define_cognitive_strategy:
        booleanOrNull(executorAutonomy?.tool_catalog_can_define_cognitive_strategy),
      tool_catalog_can_override_stage_goal:
        booleanOrNull(executorAutonomy?.tool_catalog_can_override_stage_goal),
      tool_catalog_can_authorize_forbidden_write:
        booleanOrNull(executorAutonomy?.tool_catalog_can_authorize_forbidden_write),
    },
  };
}
