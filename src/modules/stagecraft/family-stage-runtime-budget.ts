import { isRecord } from '../../kernel/contract-validation.ts';
import type {
  FamilyStageControlPlane,
  FamilyStageDescriptor,
  FamilyStageRuntimeAssumption,
  FamilyStageSurfaceRef,
} from './family-stage-control-plane-contract.ts';

type JsonRecord = Record<string, unknown>;

export type FamilyStageReliabilityBudgetStatus = 'ready' | 'needs_monitor' | 'blocker';

export interface FamilyStageRuntimeBudgetCounterexample {
  stage_id: string;
  missing_field:
    | 'monitor_refs'
    | 'expected_success_ref_or_boundary_success_rate_ref'
    | 'boundary_monitor_coverage';
  reason: string;
}

export interface FamilyStageRuntimeBudgetStage {
  stage_id: string;
  owner: string;
  boundary_count: number;
  runtime_guard_count: number;
  runtime_event_ref_count: number;
  monitor_count: number;
  metric_count: number;
  dashboard_metric_count: number;
  unmonitored_boundary_count: number;
  reliability_budget_status: FamilyStageReliabilityBudgetStatus;
  expected_success_ref: FamilyStageSurfaceRef | null;
  boundary_success_rate_ref: FamilyStageSurfaceRef | null;
  monitor_refs: FamilyStageSurfaceRef[];
  metric_refs: FamilyStageSurfaceRef[];
  dashboard_metric_refs: FamilyStageSurfaceRef[];
  runtime_event_refs: string[];
  minimal_counterexamples: FamilyStageRuntimeBudgetCounterexample[];
}

export interface FamilyStageRuntimeBudgetProjection {
  surface_kind: 'opl_family_stage_runtime_budget_projection';
  version: 'family-stage-runtime-budget.v1';
  plane_id: string;
  target_domain_id: string;
  summary: {
    stage_count: number;
    ready_count: number;
    needs_monitor_count: number;
    blocker_count: number;
    boundary_count: number;
    runtime_guard_count: number;
    monitor_count: number;
    metric_count: number;
    unmonitored_boundary_count: number;
  };
  stages: FamilyStageRuntimeBudgetStage[];
  authority_boundary: {
    opl_role: 'runtime_budget_projection_only';
    graphflow_runtime_dependency: false;
    probability_truth_claim: false;
    can_execute_stage: false;
    can_write_domain_truth: false;
    can_authorize_domain_ready: false;
    can_authorize_quality_verdict: false;
    can_mutate_artifact_body: false;
  };
}

function readStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
}

function refs(stage: FamilyStageDescriptor, field: keyof NonNullable<FamilyStageDescriptor['stage_contract']>) {
  const value = stage.stage_contract?.[field];
  return Array.isArray(value) ? value.filter((entry): entry is FamilyStageSurfaceRef => (
    isRecord(entry) && 'ref' in entry
  )) : [];
}

function assumptionMonitorRefs(value: string | FamilyStageRuntimeAssumption) {
  return isRecord(value) && Array.isArray(value.monitor_refs)
    ? value.monitor_refs.filter((entry): entry is FamilyStageSurfaceRef => isRecord(entry) && 'ref' in entry)
    : [];
}

function refText(value: FamilyStageSurfaceRef) {
  return Array.isArray(value.ref) ? value.ref.join(' ') : value.ref;
}

function hasRefRole(value: FamilyStageSurfaceRef, roles: Set<string>) {
  const role = typeof value.role === 'string' ? value.role.trim().toLowerCase() : '';
  const kind = typeof value.ref_kind === 'string' ? value.ref_kind.trim().toLowerCase() : '';
  return roles.has(role) || roles.has(kind);
}

function refFromProperty(
  value: string,
  prefix: 'expected_success_ref' | 'boundary_success_rate_ref',
): FamilyStageSurfaceRef | null {
  const marker = `${prefix}:`;
  if (!value.startsWith(marker)) {
    return null;
  }
  const ref = value.slice(marker.length).trim();
  return ref ? { ref_kind: 'property_ref', ref, role: prefix } : null;
}

function findExpectedSuccessRef(
  monitorRefs: FamilyStageSurfaceRef[],
  metricRefs: FamilyStageSurfaceRef[],
  dashboardMetricRefs: FamilyStageSurfaceRef[],
  properties: string[],
) {
  const explicit = properties
    .map((value) => refFromProperty(value, 'expected_success_ref'))
    .find((value): value is FamilyStageSurfaceRef => value !== null);
  if (explicit) {
    return explicit;
  }
  const roles = new Set(['expected_success', 'expected_success_ref']);
  return [...monitorRefs, ...metricRefs, ...dashboardMetricRefs].find((value) => hasRefRole(value, roles)) ?? null;
}

function findBoundarySuccessRateRef(
  monitorRefs: FamilyStageSurfaceRef[],
  metricRefs: FamilyStageSurfaceRef[],
  dashboardMetricRefs: FamilyStageSurfaceRef[],
  properties: string[],
) {
  const explicit = properties
    .map((value) => refFromProperty(value, 'boundary_success_rate_ref'))
    .find((value): value is FamilyStageSurfaceRef => value !== null);
  if (explicit) {
    return explicit;
  }
  const roles = new Set(['boundary_success_rate', 'boundary_success_rate_ref', 'runtime_success_rate']);
  return [...monitorRefs, ...metricRefs, ...dashboardMetricRefs].find((value) => hasRefRole(value, roles)) ?? null;
}

function uniqueRefs(values: FamilyStageSurfaceRef[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = `${value.ref_kind ?? ''}:${value.role ?? ''}:${refText(value)}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function runtimeGuardCount(stage: FamilyStageDescriptor) {
  const trust = stage.trust_boundary;
  return [
    trust?.runtime_guard_required === true,
    trust?.effect_boundary === true,
    trust?.records_runtime_events === true,
    trust?.human_gate_required === true,
    trust?.owner_receipt_required === true,
    ['ai_decision', 'human_gate', 'external_system'].includes(trust?.lane ?? ''),
  ].filter(Boolean).length;
}

function boundaryCount(stage: FamilyStageDescriptor, guardCount: number) {
  return (stage.stage_contract?.boundary_assumptions.length ?? 0) + guardCount;
}

function runtimeEventRefs(stage: FamilyStageDescriptor) {
  return [
    ...readStringList(stage.stage_contract?.runtime_event_refs),
    ...readStringList(stage.trust_boundary?.runtime_event_refs),
  ];
}

function counterexample(
  stageId: string,
  missingField: FamilyStageRuntimeBudgetCounterexample['missing_field'],
  reason: string,
): FamilyStageRuntimeBudgetCounterexample {
  return { stage_id: stageId, missing_field: missingField, reason };
}

function buildStage(stage: FamilyStageDescriptor): FamilyStageRuntimeBudgetStage {
  const stageMonitorRefs = refs(stage, 'monitor_refs');
  const assumptionRefs = (stage.stage_contract?.runtime_assumptions ?? []).flatMap(assumptionMonitorRefs);
  const monitorRefs = uniqueRefs([...stageMonitorRefs, ...assumptionRefs]);
  const metricRefs = refs(stage, 'metric_refs');
  const dashboardMetricRefs = refs(stage, 'dashboard_metric_refs');
  const properties = stage.stage_contract?.properties ?? [];
  const guardCount = runtimeGuardCount(stage);
  const boundaries = boundaryCount(stage, guardCount);
  const events = runtimeEventRefs(stage);
  const observableBoundaryRefs = monitorRefs.length + metricRefs.length + dashboardMetricRefs.length;
  const unmonitoredBoundaryCount = Math.max(0, boundaries - observableBoundaryRefs);
  const expectedSuccessRef = findExpectedSuccessRef(monitorRefs, metricRefs, dashboardMetricRefs, properties);
  const boundarySuccessRateRef = findBoundarySuccessRateRef(monitorRefs, metricRefs, dashboardMetricRefs, properties);
  const hasSuccessRef = expectedSuccessRef !== null || boundarySuccessRateRef !== null;
  const blockers: FamilyStageRuntimeBudgetCounterexample[] = [];

  if (boundaries > 0 && monitorRefs.length === 0) {
    blockers.push(counterexample(
      stage.stage_id,
      'monitor_refs',
      'runtime boundary or guard exists without an auditable monitor ref',
    ));
  }
  if (boundaries > 0 && !hasSuccessRef) {
    blockers.push(counterexample(
      stage.stage_id,
      'expected_success_ref_or_boundary_success_rate_ref',
      'runtime budget projection cannot claim boundary reliability without a success-rate ref',
    ));
  }
  if (unmonitoredBoundaryCount > 0) {
    blockers.push(counterexample(
      stage.stage_id,
      'boundary_monitor_coverage',
      'declared boundaries outnumber monitor, metric, and dashboard metric refs',
    ));
  }

  const reliabilityBudgetStatus: FamilyStageReliabilityBudgetStatus = blockers.some((entry) => (
    entry.missing_field === 'monitor_refs' && guardCount > 0
  ))
    ? 'blocker'
    : blockers.length > 0
      ? 'needs_monitor'
      : 'ready';

  return {
    stage_id: stage.stage_id,
    owner: stage.owner,
    boundary_count: boundaries,
    runtime_guard_count: guardCount,
    runtime_event_ref_count: events.length,
    monitor_count: monitorRefs.length,
    metric_count: metricRefs.length,
    dashboard_metric_count: dashboardMetricRefs.length,
    unmonitored_boundary_count: unmonitoredBoundaryCount,
    reliability_budget_status: reliabilityBudgetStatus,
    expected_success_ref: expectedSuccessRef,
    boundary_success_rate_ref: boundarySuccessRateRef,
    monitor_refs: monitorRefs,
    metric_refs: metricRefs,
    dashboard_metric_refs: dashboardMetricRefs,
    runtime_event_refs: events,
    minimal_counterexamples: blockers,
  };
}

export function buildFamilyStageRuntimeBudgetProjection(
  plane: FamilyStageControlPlane,
): FamilyStageRuntimeBudgetProjection {
  const stages = plane.stages.map(buildStage);
  return {
    surface_kind: 'opl_family_stage_runtime_budget_projection',
    version: 'family-stage-runtime-budget.v1',
    plane_id: plane.plane_id,
    target_domain_id: plane.target_domain_id,
    summary: {
      stage_count: stages.length,
      ready_count: stages.filter((stage) => stage.reliability_budget_status === 'ready').length,
      needs_monitor_count: stages.filter((stage) => stage.reliability_budget_status === 'needs_monitor').length,
      blocker_count: stages.filter((stage) => stage.reliability_budget_status === 'blocker').length,
      boundary_count: stages.reduce((count, stage) => count + stage.boundary_count, 0),
      runtime_guard_count: stages.reduce((count, stage) => count + stage.runtime_guard_count, 0),
      monitor_count: stages.reduce((count, stage) => count + stage.monitor_count, 0),
      metric_count: stages.reduce((count, stage) => count + stage.metric_count + stage.dashboard_metric_count, 0),
      unmonitored_boundary_count: stages.reduce((count, stage) => count + stage.unmonitored_boundary_count, 0),
    },
    stages,
    authority_boundary: {
      opl_role: 'runtime_budget_projection_only',
      graphflow_runtime_dependency: false,
      probability_truth_claim: false,
      can_execute_stage: false,
      can_write_domain_truth: false,
      can_authorize_domain_ready: false,
      can_authorize_quality_verdict: false,
      can_mutate_artifact_body: false,
    },
  };
}
