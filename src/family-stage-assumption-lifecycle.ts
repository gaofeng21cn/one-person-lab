import type {
  FamilyStageControlPlane,
  FamilyStageDescriptor,
  FamilyStageRuntimeAssumption,
  FamilyStageSurfaceRef,
} from './family-stage-control-plane-contract.ts';

type JsonRecord = Record<string, unknown>;

export type FamilyStageRuntimeAssumptionStatus = 'current' | 'stale' | 'missing_monitor' | 'missing_owner';
export type FamilyStageRuntimeAssumptionSeverity = 'info' | 'warning' | 'blocker';

export type FamilyStageRuntimeAssumptionCounterexample = {
  assumption_id: string;
  stage_id: string;
  missing_field?: 'owner' | 'monitor_refs' | 'freshness_window_ref' | 'observed_at_ref';
  invalidated_by?: string[];
  reason: string;
} & JsonRecord;

export interface FamilyStageRuntimeAssumptionLifecycle {
  assumption_id: string;
  stage_id: string;
  owner: string | null;
  status: FamilyStageRuntimeAssumptionStatus;
  severity: FamilyStageRuntimeAssumptionSeverity;
  freshness_window_ref: string | null;
  observed_at_ref: string | null;
  invalidated_by: string[];
  repair_action: string | null;
  monitor_refs: FamilyStageSurfaceRef[];
  minimal_counterexample: FamilyStageRuntimeAssumptionCounterexample | null;
}

export interface FamilyStageAssumptionLifecycleProjection {
  surface_kind: 'opl_family_stage_assumption_lifecycle';
  version: 'family-stage-assumption-lifecycle.v1';
  plane_id: string;
  target_domain_id: string;
  summary: {
    assumption_count: number;
    current_count: number;
    stale_count: number;
    missing_monitor_count: number;
    missing_owner_count: number;
    blocker_count: number;
    warning_count: number;
  };
  assumptions: FamilyStageRuntimeAssumptionLifecycle[];
  authority_boundary: {
    opl_role: 'assumption_lifecycle_projection_only';
    can_execute_stage: false;
    can_write_domain_truth: false;
    can_authorize_domain_ready: false;
    can_authorize_quality_verdict: false;
    can_mutate_artifact_body: false;
  };
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
}

function assumptionRecord(value: string | FamilyStageRuntimeAssumption): JsonRecord {
  return isRecord(value) ? value : {};
}

function assumptionId(value: string | FamilyStageRuntimeAssumption) {
  if (typeof value === 'string') {
    return value;
  }
  return optionalString(value.assumption_id)
    ?? optionalString(value.id)
    ?? optionalString(value.ref)
    ?? optionalString(value.name);
}

function assumptionMonitorRefs(
  stage: FamilyStageDescriptor,
  value: string | FamilyStageRuntimeAssumption,
) {
  if (isRecord(value) && Array.isArray(value.monitor_refs) && value.monitor_refs.length > 0) {
    return value.monitor_refs.filter(isRecord) as FamilyStageSurfaceRef[];
  }
  return stage.stage_contract?.monitor_refs ?? [];
}

function lifecycleForAssumption(
  stage: FamilyStageDescriptor,
  value: string | FamilyStageRuntimeAssumption,
): FamilyStageRuntimeAssumptionLifecycle | null {
  const id = assumptionId(value);
  if (!id) {
    return null;
  }
  const record = assumptionRecord(value);
  const invalidatedBy = readStringList(record.invalidated_by);
  const owner = optionalString(record.owner) ?? stage.owner ?? null;
  const freshnessWindowRef = optionalString(record.freshness_window_ref);
  const observedAtRef = optionalString(record.observed_at_ref);
  const repairAction = optionalString(record.repair_action);
  const monitorRefs = assumptionMonitorRefs(stage, value);
  const status: FamilyStageRuntimeAssumptionStatus = invalidatedBy.length > 0
    ? 'stale'
    : !owner
      ? 'missing_owner'
      : monitorRefs.length === 0
        ? 'missing_monitor'
        : 'current';
  const severity: FamilyStageRuntimeAssumptionSeverity = status === 'current' ? 'info' : 'blocker';
  const missingField = !owner
    ? 'owner' as const
    : monitorRefs.length === 0
      ? 'monitor_refs' as const
      : !freshnessWindowRef && status === 'stale'
        ? 'freshness_window_ref' as const
        : !observedAtRef && status === 'stale'
          ? 'observed_at_ref' as const
          : undefined;

  return {
    assumption_id: id,
    stage_id: stage.stage_id,
    owner,
    status,
    severity,
    freshness_window_ref: freshnessWindowRef,
    observed_at_ref: observedAtRef,
    invalidated_by: invalidatedBy,
    repair_action: repairAction,
    monitor_refs: monitorRefs,
    minimal_counterexample: status === 'current'
      ? null
      : {
          assumption_id: id,
          stage_id: stage.stage_id,
          ...(missingField ? { missing_field: missingField } : {}),
          ...(invalidatedBy.length > 0 ? { invalidated_by: invalidatedBy } : {}),
          reason: status === 'stale'
            ? 'runtime assumption has invalidation refs'
            : status === 'missing_monitor'
              ? 'runtime assumption has no monitor refs'
              : 'runtime assumption has no owner',
        },
  };
}

export function buildFamilyStageAssumptionLifecycleProjection(
  plane: FamilyStageControlPlane,
): FamilyStageAssumptionLifecycleProjection {
  const assumptions = plane.stages.flatMap((stage) => (
    (stage.stage_contract?.runtime_assumptions ?? [])
      .map((value) => lifecycleForAssumption(stage, value))
      .filter((value): value is FamilyStageRuntimeAssumptionLifecycle => value !== null)
  ));

  return {
    surface_kind: 'opl_family_stage_assumption_lifecycle',
    version: 'family-stage-assumption-lifecycle.v1',
    plane_id: plane.plane_id,
    target_domain_id: plane.target_domain_id,
    summary: {
      assumption_count: assumptions.length,
      current_count: assumptions.filter((entry) => entry.status === 'current').length,
      stale_count: assumptions.filter((entry) => entry.status === 'stale').length,
      missing_monitor_count: assumptions.filter((entry) => entry.status === 'missing_monitor').length,
      missing_owner_count: assumptions.filter((entry) => entry.status === 'missing_owner').length,
      blocker_count: assumptions.filter((entry) => entry.severity === 'blocker').length,
      warning_count: assumptions.filter((entry) => entry.severity === 'warning').length,
    },
    assumptions,
    authority_boundary: {
      opl_role: 'assumption_lifecycle_projection_only',
      can_execute_stage: false,
      can_write_domain_truth: false,
      can_authorize_domain_ready: false,
      can_authorize_quality_verdict: false,
      can_mutate_artifact_body: false,
    },
  };
}
