type JsonRecord = Record<string, unknown>;

export type FamilyStageKind =
  | 'intake'
  | 'planning'
  | 'source_preparation'
  | 'creation'
  | 'review'
  | 'revision'
  | 'packaging'
  | 'publish'
  | 'operator_gate'
  | 'domain_specific';

export interface FamilyStageSurfaceRef {
  ref_kind?: string;
  ref: string | string[];
  role?: string;
  label?: string;
}

export interface FamilyStageRuntimeAssumption extends JsonRecord {
  assumption_id?: string;
  id?: string;
  ref?: string;
  name?: string;
  owner?: string;
  freshness_window_ref?: string;
  observed_at_ref?: string;
  invalidated_by?: string[];
  repair_action?: string;
  monitor_refs?: FamilyStageSurfaceRef[];
}

export type FamilyStageTrustLane =
  | 'opl_framework'
  | 'domain_agent'
  | 'codex_executor'
  | 'ai_decision'
  | 'human_gate'
  | 'external_system'
  | 'app_projection';

export interface FamilyStageTrustBoundary extends JsonRecord {
  lane: FamilyStageTrustLane;
  static_check_eligible?: boolean;
  effect_boundary?: boolean;
  records_runtime_events?: boolean;
  runtime_event_refs?: string[];
  owner_receipt_required?: boolean;
  human_gate_required?: boolean;
  runtime_guard_required?: boolean;
}

export interface FamilyStageContract extends JsonRecord {
  requires: string[];
  ensures: string[];
  boundary_assumptions: string[];
  properties: string[];
  runtime_event_refs?: string[];
  progress_delta_policy?: JsonRecord;
  typed_blocker_lineage_policy?: JsonRecord;
  expected_receipt_refs?: FamilyStageSurfaceRef[];
  monitor_freshness_refs?: FamilyStageSurfaceRef[];
  replay_evidence_refs?: FamilyStageSurfaceRef[];
  runtime_assumptions: Array<string | FamilyStageRuntimeAssumption>;
  monitor_refs: FamilyStageSurfaceRef[];
  source_scope_refs: FamilyStageSurfaceRef[];
  cohort_query_refs?: FamilyStageSurfaceRef[];
  trigger_refs?: FamilyStageSurfaceRef[];
  metric_refs?: FamilyStageSurfaceRef[];
  dashboard_metric_refs?: FamilyStageSurfaceRef[];
  artifact_scope_refs: FamilyStageSurfaceRef[];
  workspace_scope_refs: FamilyStageSurfaceRef[];
}

export interface FamilyStageDescriptor {
  stage_id: string;
  stage_kind: FamilyStageKind;
  title: string;
  summary: string | null;
  goal: string;
  owner: string;
  domain_stage_refs: string[];
  inputs: FamilyStageSurfaceRef[];
  knowledge_refs: FamilyStageSurfaceRef[];
  skills: FamilyStageSurfaceRef[];
  prompt_refs: FamilyStageSurfaceRef[];
  allowed_action_refs: string[];
  outputs: FamilyStageSurfaceRef[];
  evaluation: FamilyStageSurfaceRef[];
  handoff: JsonRecord | null;
  source_refs: FamilyStageSurfaceRef[];
  freshness: JsonRecord | null;
  action_parity: JsonRecord | null;
  stage_contract: FamilyStageContract | null;
  trust_boundary: FamilyStageTrustBoundary | null;
  authority_boundary: JsonRecord;
}

export interface FamilyStageControlPlane {
  surface_kind: 'family_stage_control_plane';
  version: 'family-stage-control-plane.v1';
  plane_id: string;
  target_domain_id: string;
  owner: string;
  authority_boundary: JsonRecord;
  replay_evidence_refs?: FamilyStageSurfaceRef[];
  stages: FamilyStageDescriptor[];
  notes: string[];
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function requireString(value: unknown, field: string) {
  const text = optionalString(value);
  if (!text) {
    throw new Error(`Missing required string field: ${field}`);
  }
  return text;
}

function readStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => optionalString(entry))
    .filter((entry): entry is string => Boolean(entry));
}

function normalizeRefValue(value: unknown, field: string) {
  const text = optionalString(value);
  if (text) {
    return text;
  }
  const values = readStringList(value);
  if (values.length > 0) {
    return values;
  }
  throw new Error(`Missing required string or string-list field: ${field}`);
}

function normalizeSurfaceRef(value: unknown, field: string): FamilyStageSurfaceRef {
  if (!isRecord(value)) {
    throw new Error(`${field} must be an object.`);
  }
  return {
    ...(optionalString(value.ref_kind) ? { ref_kind: optionalString(value.ref_kind)! } : {}),
    ref: normalizeRefValue(value.ref, `${field}.ref`),
    ...(optionalString(value.role) ? { role: optionalString(value.role)! } : {}),
    ...(optionalString(value.label) ? { label: optionalString(value.label)! } : {}),
  };
}

function normalizeSurfaceRefs(value: unknown, field: string) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry, index) => normalizeSurfaceRef(entry, `${field}[${index}]`));
}

function normalizeRuntimeAssumption(value: unknown, field: string): string | FamilyStageRuntimeAssumption {
  const text = optionalString(value);
  if (text) {
    return text;
  }
  if (!isRecord(value)) {
    throw new Error(`${field} must be a string or an object.`);
  }
  return {
    ...value,
    invalidated_by: readStringList(value.invalidated_by),
    monitor_refs: normalizeSurfaceRefs(value.monitor_refs, `${field}.monitor_refs`),
  };
}

function normalizeRuntimeAssumptions(value: unknown, field: string) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry, index) => normalizeRuntimeAssumption(entry, `${field}[${index}]`));
}

const FAMILY_STAGE_KINDS = new Set<string>([
  'intake',
  'planning',
  'source_preparation',
  'creation',
  'review',
  'revision',
  'packaging',
  'publish',
  'operator_gate',
  'domain_specific',
]);

const FAMILY_STAGE_TRUST_LANES = new Set<string>([
  'opl_framework',
  'domain_agent',
  'codex_executor',
  'ai_decision',
  'human_gate',
  'external_system',
  'app_projection',
]);

function normalizeStageKind(value: unknown, field: string): FamilyStageKind {
  const text = requireString(value, field);
  if (!FAMILY_STAGE_KINDS.has(text)) {
    throw new Error(`${field} has unsupported stage kind: ${text}`);
  }
  return text as FamilyStageKind;
}

function optionalBoolean(record: JsonRecord, key: string, field: string) {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'boolean') {
    throw new Error(`${field}.${key} must be a boolean.`);
  }
  return value;
}

function normalizeStageContract(value: unknown): FamilyStageContract | null {
  if (!isRecord(value)) {
    return null;
  }
  return {
    ...value,
    requires: readStringList(value.requires),
    ensures: readStringList(value.ensures),
    boundary_assumptions: readStringList(value.boundary_assumptions),
    properties: readStringList(value.properties),
    runtime_event_refs: readStringList(value.runtime_event_refs),
    progress_delta_policy: isRecord(value.progress_delta_policy) ? value.progress_delta_policy : undefined,
    typed_blocker_lineage_policy: isRecord(value.typed_blocker_lineage_policy)
      ? value.typed_blocker_lineage_policy
      : undefined,
    expected_receipt_refs: normalizeSurfaceRefs(value.expected_receipt_refs, 'stage_contract.expected_receipt_refs'),
    monitor_freshness_refs: normalizeSurfaceRefs(value.monitor_freshness_refs, 'stage_contract.monitor_freshness_refs'),
    replay_evidence_refs: normalizeSurfaceRefs(value.replay_evidence_refs, 'stage_contract.replay_evidence_refs'),
    runtime_assumptions: normalizeRuntimeAssumptions(value.runtime_assumptions, 'stage_contract.runtime_assumptions'),
    monitor_refs: normalizeSurfaceRefs(value.monitor_refs, 'stage_contract.monitor_refs'),
    source_scope_refs: normalizeSurfaceRefs(value.source_scope_refs, 'stage_contract.source_scope_refs'),
    cohort_query_refs: normalizeSurfaceRefs(value.cohort_query_refs, 'stage_contract.cohort_query_refs'),
    trigger_refs: normalizeSurfaceRefs(value.trigger_refs, 'stage_contract.trigger_refs'),
    metric_refs: normalizeSurfaceRefs(value.metric_refs, 'stage_contract.metric_refs'),
    dashboard_metric_refs: normalizeSurfaceRefs(value.dashboard_metric_refs, 'stage_contract.dashboard_metric_refs'),
    artifact_scope_refs: normalizeSurfaceRefs(value.artifact_scope_refs, 'stage_contract.artifact_scope_refs'),
    workspace_scope_refs: normalizeSurfaceRefs(value.workspace_scope_refs, 'stage_contract.workspace_scope_refs'),
  };
}

function normalizeTrustBoundary(value: unknown, field: string): FamilyStageTrustBoundary | null {
  if (!isRecord(value)) {
    return null;
  }
  const lane = requireString(value.lane, `${field}.lane`);
  if (!FAMILY_STAGE_TRUST_LANES.has(lane)) {
    throw new Error(`${field}.lane has unsupported trust lane: ${lane}`);
  }
  const staticCheckEligible = optionalBoolean(value, 'static_check_eligible', field);
  const effectBoundary = optionalBoolean(value, 'effect_boundary', field);
  const recordsRuntimeEvents = optionalBoolean(value, 'records_runtime_events', field);
  const runtimeEventRefs = readStringList(value.runtime_event_refs);
  const ownerReceiptRequired = optionalBoolean(value, 'owner_receipt_required', field);
  const humanGateRequired = optionalBoolean(value, 'human_gate_required', field);
  const runtimeGuardRequired = optionalBoolean(value, 'runtime_guard_required', field);
  return {
    ...value,
    lane: lane as FamilyStageTrustLane,
    ...(staticCheckEligible === undefined ? {} : { static_check_eligible: staticCheckEligible }),
    ...(effectBoundary === undefined ? {} : { effect_boundary: effectBoundary }),
    ...(recordsRuntimeEvents === undefined ? {} : { records_runtime_events: recordsRuntimeEvents }),
    ...(runtimeEventRefs.length === 0 ? {} : { runtime_event_refs: runtimeEventRefs }),
    ...(ownerReceiptRequired === undefined ? {} : { owner_receipt_required: ownerReceiptRequired }),
    ...(humanGateRequired === undefined ? {} : { human_gate_required: humanGateRequired }),
    ...(runtimeGuardRequired === undefined ? {} : { runtime_guard_required: runtimeGuardRequired }),
  };
}

function normalizeFamilyStageDescriptor(value: unknown, field: string): FamilyStageDescriptor {
  if (!isRecord(value)) {
    throw new Error(`${field} must be an object.`);
  }
  const boundary = isRecord(value.authority_boundary) ? value.authority_boundary : null;
  if (!boundary) {
    throw new Error(`${field}.authority_boundary must be an object.`);
  }

  return {
    stage_id: requireString(value.stage_id, `${field}.stage_id`),
    stage_kind: normalizeStageKind(value.stage_kind, `${field}.stage_kind`),
    title: requireString(value.title, `${field}.title`),
    summary: optionalString(value.summary),
    goal: requireString(value.goal, `${field}.goal`),
    owner: requireString(value.owner, `${field}.owner`),
    domain_stage_refs: readStringList(value.domain_stage_refs),
    inputs: normalizeSurfaceRefs(value.inputs, `${field}.inputs`),
    knowledge_refs: normalizeSurfaceRefs(value.knowledge_refs, `${field}.knowledge_refs`),
    skills: normalizeSurfaceRefs(value.skills, `${field}.skills`),
    prompt_refs: normalizeSurfaceRefs(value.prompt_refs, `${field}.prompt_refs`),
    allowed_action_refs: readStringList(value.allowed_action_refs),
    outputs: normalizeSurfaceRefs(value.outputs, `${field}.outputs`),
    evaluation: normalizeSurfaceRefs(value.evaluation, `${field}.evaluation`),
    handoff: isRecord(value.handoff) ? value.handoff : null,
    source_refs: normalizeSurfaceRefs(value.source_refs, `${field}.source_refs`),
    freshness: isRecord(value.freshness) ? value.freshness : null,
    action_parity: isRecord(value.action_parity) ? value.action_parity : null,
    stage_contract: normalizeStageContract(value.stage_contract),
    trust_boundary: normalizeTrustBoundary(value.trust_boundary, `${field}.trust_boundary`),
    authority_boundary: boundary,
  };
}

export function normalizeFamilyStageControlPlane(
  value: unknown,
  field = 'family_stage_control_plane',
): FamilyStageControlPlane | null {
  if (!isRecord(value)) {
    return null;
  }

  const surfaceKind = requireString(value.surface_kind, `${field}.surface_kind`);
  if (surfaceKind !== 'family_stage_control_plane') {
    throw new Error(`${field}.surface_kind must be family_stage_control_plane.`);
  }
  const version = requireString(value.version, `${field}.version`);
  if (version !== 'family-stage-control-plane.v1') {
    throw new Error(`${field}.version must be family-stage-control-plane.v1.`);
  }
  if (!Array.isArray(value.stages) || value.stages.length === 0) {
    throw new Error(`${field}.stages must contain at least one stage.`);
  }

  const seen = new Set<string>();
  const stages = value.stages.map((entry, index) => {
    const stage = normalizeFamilyStageDescriptor(entry, `${field}.stages[${index}]`);
    if (seen.has(stage.stage_id)) {
      throw new Error(`${field}.stages contains duplicate stage_id: ${stage.stage_id}`);
    }
    seen.add(stage.stage_id);
    return stage;
  });

  return {
    surface_kind: 'family_stage_control_plane',
    version: 'family-stage-control-plane.v1',
    plane_id: requireString(value.plane_id, `${field}.plane_id`),
    target_domain_id: requireString(value.target_domain_id, `${field}.target_domain_id`),
    owner: requireString(value.owner, `${field}.owner`),
    authority_boundary: isRecord(value.authority_boundary) ? value.authority_boundary : {},
    replay_evidence_refs: normalizeSurfaceRefs(value.replay_evidence_refs, `${field}.replay_evidence_refs`),
    stages,
    notes: readStringList(value.notes),
  };
}
