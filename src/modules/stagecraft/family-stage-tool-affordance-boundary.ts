import { isRecord } from '../../kernel/contract-validation.ts';
import { optionalString } from '../../kernel/json-file.ts';
import type {
  FamilyStageControlPlane,
  FamilyStageDescriptor,
} from './family-stage-control-plane-contract.ts';

type JsonRecord = Record<string, unknown>;

export type FamilyStageToolAffordanceBoundaryStatus = 'declared' | 'missing' | 'invalid';

export interface FamilyStageToolAffordanceBoundaryProjection {
  status: FamilyStageToolAffordanceBoundaryStatus;
  catalog_role: string | null;
  tool_ref_count: number;
  capability_ref_count: number;
  permission_scope_ref_count: number;
  credential_boundary_ref_count: number;
  write_scope_ref_count: number;
  side_effect_risk_ref_count: number;
  forbidden_authority_ref_count: number;
  missing_boundary_fields: string[];
  executor_autonomy: {
    executor_can_choose_tools: boolean | null;
    executor_can_skip_tools: boolean | null;
    executor_can_substitute_tools_within_boundary: boolean | null;
    executor_can_choose_order_and_parallelism: boolean | null;
    executor_can_request_missing_context_or_human_gate: boolean | null;
    tool_catalog_can_prescribe_tool_sequence: boolean | null;
    tool_catalog_can_define_cognitive_strategy: boolean | null;
    tool_catalog_can_override_stage_goal: boolean | null;
    tool_catalog_can_authorize_forbidden_write: boolean | null;
  };
}

interface ToolAffordanceFinding {
  severity: 'nonconformance' | 'warning';
  code: string;
  message: string;
  stage_id?: string;
  failure_lane?: 'executor';
  minimal_counterexample?: JsonRecord;
}

interface ToolAffordanceFindingSink {
  push(finding: ToolAffordanceFinding): unknown;
}

const STANDARD_STAGE_PACK_CONFORMANCE_VERSION = 'standard-stage-pack.v2';
const TOOL_AFFORDANCE_CATALOG_ROLE = 'available_affordance_catalog_not_workflow_script';
const REQUIRED_TOOL_AFFORDANCE_BOUNDARY_FIELDS = [
  'capability_refs',
  'permission_scope_refs',
  'credential_boundary_refs',
  'write_scope_refs',
  'side_effect_risk_refs',
  'forbidden_authority_refs',
];
const REQUIRED_TOOL_AFFORDANCE_TRUE_FLAGS = [
  'executor_can_choose_tools',
  'executor_can_skip_tools',
  'executor_can_substitute_tools_within_boundary',
  'executor_can_choose_order_and_parallelism',
  'executor_can_request_missing_context_or_human_gate',
];
const REQUIRED_TOOL_AFFORDANCE_FALSE_FLAGS = [
  'tool_catalog_can_prescribe_tool_sequence',
  'tool_catalog_can_define_cognitive_strategy',
  'tool_catalog_can_override_stage_goal',
  'tool_catalog_can_authorize_forbidden_write',
];

function readStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
}

function readBooleanOrNull(value: unknown) {
  return typeof value === 'boolean' ? value : null;
}

function surfaceRefCount(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord).length : 0;
}

function standardBoundaryFields(boundary: JsonRecord | null) {
  return readStringList(boundary?.standardized_boundary_fields);
}

function toolAffordanceMissingBoundaryFields(boundary: JsonRecord | null) {
  if (!boundary) {
    return REQUIRED_TOOL_AFFORDANCE_BOUNDARY_FIELDS;
  }
  const declaredFields = standardBoundaryFields(boundary);
  return REQUIRED_TOOL_AFFORDANCE_BOUNDARY_FIELDS.filter((field) =>
    surfaceRefCount(boundary[field]) === 0 && !declaredFields.includes(field)
  );
}

export function stageUsesStandardStagePackV2(plane: FamilyStageControlPlane, stage: FamilyStageDescriptor) {
  return plane.stage_pack_conformance_version === STANDARD_STAGE_PACK_CONFORMANCE_VERSION
    || stage.stage_pack_conformance_version === STANDARD_STAGE_PACK_CONFORMANCE_VERSION;
}

export function buildToolAffordanceBoundaryProjection(
  stage: FamilyStageDescriptor,
): FamilyStageToolAffordanceBoundaryProjection {
  const boundary = isRecord(stage.tool_affordance_boundary) ? stage.tool_affordance_boundary : null;
  const executorAutonomy = isRecord(boundary?.executor_autonomy) ? boundary.executor_autonomy : null;
  const missingBoundaryFields = toolAffordanceMissingBoundaryFields(boundary);
  const missingRequiredTrueFlags = executorAutonomy
    ? REQUIRED_TOOL_AFFORDANCE_TRUE_FLAGS.filter((flag) => executorAutonomy[flag] !== true)
    : REQUIRED_TOOL_AFFORDANCE_TRUE_FLAGS;
  const missingRequiredFalseFlags = executorAutonomy
    ? REQUIRED_TOOL_AFFORDANCE_FALSE_FLAGS.filter((flag) => executorAutonomy[flag] !== false)
    : REQUIRED_TOOL_AFFORDANCE_FALSE_FLAGS;
  const toolRefCount = (stage.tool_refs ?? []).length;
  const invalid = boundary !== null && (
    optionalString(boundary.catalog_role) !== TOOL_AFFORDANCE_CATALOG_ROLE
    || toolRefCount === 0
    || missingBoundaryFields.length > 0
    || missingRequiredTrueFlags.length > 0
    || missingRequiredFalseFlags.length > 0
  );

  return {
    status: boundary === null ? 'missing' : invalid ? 'invalid' : 'declared',
    catalog_role: optionalString(boundary?.catalog_role),
    tool_ref_count: toolRefCount,
    capability_ref_count: surfaceRefCount(boundary?.capability_refs),
    permission_scope_ref_count: surfaceRefCount(boundary?.permission_scope_refs),
    credential_boundary_ref_count: surfaceRefCount(boundary?.credential_boundary_refs),
    write_scope_ref_count: surfaceRefCount(boundary?.write_scope_refs),
    side_effect_risk_ref_count: surfaceRefCount(boundary?.side_effect_risk_refs),
    forbidden_authority_ref_count: surfaceRefCount(boundary?.forbidden_authority_refs),
    missing_boundary_fields: missingBoundaryFields,
    executor_autonomy: {
      executor_can_choose_tools: readBooleanOrNull(executorAutonomy?.executor_can_choose_tools),
      executor_can_skip_tools: readBooleanOrNull(executorAutonomy?.executor_can_skip_tools),
      executor_can_substitute_tools_within_boundary:
        readBooleanOrNull(executorAutonomy?.executor_can_substitute_tools_within_boundary),
      executor_can_choose_order_and_parallelism:
        readBooleanOrNull(executorAutonomy?.executor_can_choose_order_and_parallelism),
      executor_can_request_missing_context_or_human_gate:
        readBooleanOrNull(executorAutonomy?.executor_can_request_missing_context_or_human_gate),
      tool_catalog_can_prescribe_tool_sequence:
        readBooleanOrNull(executorAutonomy?.tool_catalog_can_prescribe_tool_sequence),
      tool_catalog_can_define_cognitive_strategy:
        readBooleanOrNull(executorAutonomy?.tool_catalog_can_define_cognitive_strategy),
      tool_catalog_can_override_stage_goal: readBooleanOrNull(executorAutonomy?.tool_catalog_can_override_stage_goal),
      tool_catalog_can_authorize_forbidden_write:
        readBooleanOrNull(executorAutonomy?.tool_catalog_can_authorize_forbidden_write),
    },
  };
}

export function inspectToolAffordanceBoundary(
  stage: FamilyStageDescriptor,
  findings: ToolAffordanceFindingSink,
  enforce: boolean,
) {
  const projection = buildToolAffordanceBoundaryProjection(stage);
  if (projection.status === 'declared') {
    return;
  }
  if (!enforce && projection.status === 'missing') {
    return;
  }
  const severity = enforce ? 'nonconformance' : 'warning';
  if (projection.status === 'missing') {
    findings.push({
      severity,
      code: 'missing_tool_affordance_boundary',
      message: 'Standard stage pack v2 must declare tool_refs and tool_affordance_boundary before executor launch.',
      stage_id: stage.stage_id,
      failure_lane: 'executor',
      minimal_counterexample: {
        required_surface: 'tool_affordance_boundary',
        required_catalog_role: TOOL_AFFORDANCE_CATALOG_ROLE,
        required_boundary_fields: REQUIRED_TOOL_AFFORDANCE_BOUNDARY_FIELDS,
      },
    });
    return;
  }
  findings.push({
    severity,
    code: 'invalid_tool_affordance_boundary',
    message:
      'Stage tool_affordance_boundary must declare safety and authority limits without prescribing tool order or cognitive strategy.',
    stage_id: stage.stage_id,
    failure_lane: 'executor',
    minimal_counterexample: {
      required_catalog_role: TOOL_AFFORDANCE_CATALOG_ROLE,
      tool_ref_count: projection.tool_ref_count,
      missing_boundary_fields: projection.missing_boundary_fields,
      executor_autonomy: projection.executor_autonomy,
    },
  });
}
