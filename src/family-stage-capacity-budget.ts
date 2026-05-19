import type {
  FamilyStageControlPlane,
  FamilyStageDescriptor,
  FamilyStageSurfaceRef,
} from './family-stage-control-plane-contract.ts';

type RefField =
  | 'event_log_growth_ref'
  | 'replay_sla_ref'
  | 'concurrency_limit_ref'
  | 'provider_rate_limit_ref'
  | 'proof_check_cost_ref'
  | 'guard_eval_cost_ref';

export type FamilyStageCapacityStatus = 'ready' | 'needs_capacity_budget' | 'blocker';

export interface FamilyStageCapacityBudgetCounterexample {
  stage_id: string;
  missing_field: RefField | 'rate_or_concurrency_limit_ref';
  reason: string;
}

export interface FamilyStageCapacityBudgetStage {
  stage_id: string;
  owner: string;
  capacity_status: FamilyStageCapacityStatus;
  runtime_boundary_required: boolean;
  provider_launch_eligible: boolean;
  capacity_ref_count: number;
  event_log_growth_ref: FamilyStageSurfaceRef | null;
  replay_sla_ref: FamilyStageSurfaceRef | null;
  concurrency_limit_ref: FamilyStageSurfaceRef | null;
  provider_rate_limit_ref: FamilyStageSurfaceRef | null;
  proof_check_cost_ref: FamilyStageSurfaceRef | null;
  guard_eval_cost_ref: FamilyStageSurfaceRef | null;
  minimal_counterexamples: FamilyStageCapacityBudgetCounterexample[];
}

export interface FamilyStageCapacityBudgetProjection {
  surface_kind: 'opl_family_stage_capacity_budget_projection';
  version: 'family-stage-capacity-budget.v1';
  plane_id: string;
  target_domain_id: string;
  summary: {
    stage_count: number;
    ready_count: number;
    needs_capacity_budget_count: number;
    blocker_count: number;
    runtime_boundary_required_count: number;
    provider_launch_eligible_count: number;
    capacity_ref_count: number;
  };
  stages: FamilyStageCapacityBudgetStage[];
  authority_boundary: {
    opl_role: 'capacity_projection_only';
    refs_only: true;
    probability_truth_claim: false;
    can_execute_stage: false;
    can_schedule_provider: false;
    can_write_domain_truth: false;
    can_authorize_domain_ready: false;
    can_authorize_quality_verdict: false;
    can_mutate_artifact_body: false;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function refs(stage: FamilyStageDescriptor, field: keyof NonNullable<FamilyStageDescriptor['stage_contract']>) {
  const value = stage.stage_contract?.[field];
  return Array.isArray(value)
    ? value.filter((entry): entry is FamilyStageSurfaceRef => isRecord(entry) && 'ref' in entry)
    : [];
}

function refText(value: FamilyStageSurfaceRef) {
  return Array.isArray(value.ref) ? value.ref.join(' ') : value.ref;
}

function refFromProperty(value: string, field: RefField): FamilyStageSurfaceRef | null {
  const marker = `${field}:`;
  if (!value.startsWith(marker)) {
    return null;
  }
  const ref = value.slice(marker.length).trim();
  return ref ? { ref_kind: 'property_ref', ref, role: field } : null;
}

function hasRole(value: FamilyStageSurfaceRef, roles: Set<string>) {
  const role = typeof value.role === 'string' ? value.role.trim().toLowerCase() : '';
  const kind = typeof value.ref_kind === 'string' ? value.ref_kind.trim().toLowerCase() : '';
  return roles.has(role) || roles.has(kind);
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

function findCapacityRef(
  field: RefField,
  properties: string[],
  refGroups: FamilyStageSurfaceRef[][],
  roles: string[],
) {
  const fromProperty = properties
    .map((value) => refFromProperty(value, field))
    .find((value): value is FamilyStageSurfaceRef => value !== null);
  if (fromProperty) {
    return fromProperty;
  }
  const roleSet = new Set([field, ...roles].map((value) => value.toLowerCase()));
  return uniqueRefs(refGroups.flat()).find((value) => hasRole(value, roleSet)) ?? null;
}

function runtimeBoundaryRequired(stage: FamilyStageDescriptor) {
  const contract = stage.stage_contract;
  const trust = stage.trust_boundary;
  return Boolean(
    (contract?.boundary_assumptions.length ?? 0) > 0
    || trust?.runtime_guard_required === true
    || trust?.effect_boundary === true
    || trust?.records_runtime_events === true
    || trust?.human_gate_required === true
    || trust?.owner_receipt_required === true,
  );
}

function providerLaunchEligible(stage: FamilyStageDescriptor, boundaryRequired: boolean) {
  const trustLane = stage.trust_boundary?.lane;
  return boundaryRequired && trustLane !== 'app_projection';
}

function counterexample(
  stageId: string,
  missingField: FamilyStageCapacityBudgetCounterexample['missing_field'],
  reason: string,
): FamilyStageCapacityBudgetCounterexample {
  return { stage_id: stageId, missing_field: missingField, reason };
}

function buildStage(stage: FamilyStageDescriptor): FamilyStageCapacityBudgetStage {
  const properties = stage.stage_contract?.properties ?? [];
  const monitorRefs = refs(stage, 'monitor_refs');
  const metricRefs = refs(stage, 'metric_refs');
  const dashboardMetricRefs = refs(stage, 'dashboard_metric_refs');
  const triggerRefs = refs(stage, 'trigger_refs');
  const boundaryRequired = runtimeBoundaryRequired(stage);
  const launchEligible = providerLaunchEligible(stage, boundaryRequired);

  const eventLogGrowthRef = findCapacityRef('event_log_growth_ref', properties, [monitorRefs, metricRefs, dashboardMetricRefs], [
    'event_log_growth',
    'event_log_growth_budget',
  ]);
  const replaySlaRef = findCapacityRef('replay_sla_ref', properties, [monitorRefs, metricRefs, dashboardMetricRefs], [
    'replay_sla',
  ]);
  const concurrencyLimitRef = findCapacityRef('concurrency_limit_ref', properties, [triggerRefs], [
    'concurrency_limit',
  ]);
  const providerRateLimitRef = findCapacityRef('provider_rate_limit_ref', properties, [triggerRefs], [
    'provider_rate_limit',
    'launch_backpressure',
  ]);
  const proofCheckCostRef = findCapacityRef('proof_check_cost_ref', properties, [metricRefs, dashboardMetricRefs], [
    'proof_check_cost',
  ]);
  const guardEvalCostRef = findCapacityRef('guard_eval_cost_ref', properties, [dashboardMetricRefs, metricRefs], [
    'guard_eval_cost',
  ]);

  const blockers: FamilyStageCapacityBudgetCounterexample[] = [];
  if (!eventLogGrowthRef) {
    blockers.push(counterexample(
      stage.stage_id,
      'event_log_growth_ref',
      'stage capacity budget lacks event-log growth ref',
    ));
  }
  if (!proofCheckCostRef) {
    blockers.push(counterexample(
      stage.stage_id,
      'proof_check_cost_ref',
      'stage capacity budget lacks proof-check cost ref',
    ));
  }
  if (!guardEvalCostRef) {
    blockers.push(counterexample(
      stage.stage_id,
      'guard_eval_cost_ref',
      'stage capacity budget lacks guard-eval cost ref',
    ));
  }
  if (launchEligible && !replaySlaRef) {
    blockers.push(counterexample(
      stage.stage_id,
      'replay_sla_ref',
      'runtime boundary or provider launch eligible stage lacks replay SLA ref',
    ));
  }
  if (launchEligible && !concurrencyLimitRef && !providerRateLimitRef) {
    blockers.push(counterexample(
      stage.stage_id,
      'rate_or_concurrency_limit_ref',
      'runtime boundary or provider launch eligible stage lacks rate-limit or concurrency-limit ref',
    ));
  }

  const capacityRefs = uniqueRefs([
    eventLogGrowthRef,
    replaySlaRef,
    concurrencyLimitRef,
    providerRateLimitRef,
    proofCheckCostRef,
    guardEvalCostRef,
  ].filter((value): value is FamilyStageSurfaceRef => value !== null));

  const capacityStatus: FamilyStageCapacityStatus = blockers.some((entry) => (
    entry.missing_field === 'replay_sla_ref' || entry.missing_field === 'rate_or_concurrency_limit_ref'
  ))
    ? 'blocker'
    : blockers.length > 0
      ? 'needs_capacity_budget'
      : 'ready';

  return {
    stage_id: stage.stage_id,
    owner: stage.owner,
    capacity_status: capacityStatus,
    runtime_boundary_required: boundaryRequired,
    provider_launch_eligible: launchEligible,
    capacity_ref_count: capacityRefs.length,
    event_log_growth_ref: eventLogGrowthRef,
    replay_sla_ref: replaySlaRef,
    concurrency_limit_ref: concurrencyLimitRef,
    provider_rate_limit_ref: providerRateLimitRef,
    proof_check_cost_ref: proofCheckCostRef,
    guard_eval_cost_ref: guardEvalCostRef,
    minimal_counterexamples: blockers,
  };
}

export function buildFamilyStageCapacityBudgetProjection(
  plane: FamilyStageControlPlane,
): FamilyStageCapacityBudgetProjection {
  const stages = plane.stages.map(buildStage);
  return {
    surface_kind: 'opl_family_stage_capacity_budget_projection',
    version: 'family-stage-capacity-budget.v1',
    plane_id: plane.plane_id,
    target_domain_id: plane.target_domain_id,
    summary: {
      stage_count: stages.length,
      ready_count: stages.filter((stage) => stage.capacity_status === 'ready').length,
      needs_capacity_budget_count: stages.filter((stage) => stage.capacity_status === 'needs_capacity_budget').length,
      blocker_count: stages.filter((stage) => stage.capacity_status === 'blocker').length,
      runtime_boundary_required_count: stages.filter((stage) => stage.runtime_boundary_required).length,
      provider_launch_eligible_count: stages.filter((stage) => stage.provider_launch_eligible).length,
      capacity_ref_count: stages.reduce((count, stage) => count + stage.capacity_ref_count, 0),
    },
    stages,
    authority_boundary: {
      opl_role: 'capacity_projection_only',
      refs_only: true,
      probability_truth_claim: false,
      can_execute_stage: false,
      can_schedule_provider: false,
      can_write_domain_truth: false,
      can_authorize_domain_ready: false,
      can_authorize_quality_verdict: false,
      can_mutate_artifact_body: false,
    },
  };
}
