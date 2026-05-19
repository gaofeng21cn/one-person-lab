import type {
  FamilyStageControlPlane,
  FamilyStageDescriptor,
  FamilyStageSurfaceRef,
} from './family-stage-control-plane-contract.ts';

export type FamilyStageCohortLoopClosureStatus =
  | 'closed_loop_ready'
  | 'missing_scope'
  | 'missing_query'
  | 'missing_trigger'
  | 'missing_monitor_or_metric';

export interface FamilyStageCohortLoopBlocker {
  blocker_kind: 'cohort_loop_blocker';
  blocker_id:
    | 'cohort_scope_missing'
    | 'cohort_query_missing'
    | 'cohort_trigger_missing'
    | 'cohort_monitor_or_metric_missing';
  stage_id: string;
  minimal_counterexample: {
    stage_id: string;
    missing_field:
      | 'source_scope_refs'
      | 'cohort_query_refs'
      | 'trigger_refs'
      | 'monitor_refs_or_metric_refs';
    reason: string;
  };
  repair_action:
    | 'declare_source_scope_ref'
    | 'declare_cohort_query_ref'
    | 'declare_trigger_ref'
    | 'declare_monitor_or_metric_ref';
}

export interface FamilyStageCohortLoopStage {
  stage_id: string;
  owner: string;
  closure_status: FamilyStageCohortLoopClosureStatus;
  source_scope_refs: FamilyStageSurfaceRef[];
  cohort_query_refs: FamilyStageSurfaceRef[];
  trigger_refs: FamilyStageSurfaceRef[];
  monitor_refs: FamilyStageSurfaceRef[];
  metric_refs: FamilyStageSurfaceRef[];
  dashboard_metric_refs: FamilyStageSurfaceRef[];
  counts: {
    source_scope_ref_count: number;
    cohort_query_ref_count: number;
    trigger_ref_count: number;
    monitor_ref_count: number;
    metric_ref_count: number;
    dashboard_metric_ref_count: number;
  };
  blockers: FamilyStageCohortLoopBlocker[];
}

export interface FamilyStageCohortLoopProjection {
  surface_kind: 'opl_family_stage_cohort_loop';
  version: 'family-stage-cohort-loop.v1';
  plane_id: string;
  target_domain_id: string;
  summary: {
    stage_count: number;
    closed_loop_ready_count: number;
    blocked_stage_count: number;
    missing_scope_count: number;
    missing_query_count: number;
    missing_trigger_count: number;
    missing_monitor_or_metric_count: number;
    blocker_count: number;
  };
  stages: FamilyStageCohortLoopStage[];
  authority_boundary: {
    opl_role: 'cohort_loop_projection_only';
    graphflow_runtime_dependency: false;
    can_execute_stage: false;
    can_write_source_truth: false;
    can_write_domain_truth: false;
    can_authorize_domain_ready: false;
    can_authorize_quality_verdict: false;
    can_mutate_artifact_body: false;
  };
}

function blocker(
  stageId: string,
  blockerId: FamilyStageCohortLoopBlocker['blocker_id'],
  missingField: FamilyStageCohortLoopBlocker['minimal_counterexample']['missing_field'],
  repairAction: FamilyStageCohortLoopBlocker['repair_action'],
  reason: string,
): FamilyStageCohortLoopBlocker {
  return {
    blocker_kind: 'cohort_loop_blocker',
    blocker_id: blockerId,
    stage_id: stageId,
    minimal_counterexample: {
      stage_id: stageId,
      missing_field: missingField,
      reason,
    },
    repair_action: repairAction,
  };
}

function refs(stage: FamilyStageDescriptor, field: keyof NonNullable<FamilyStageDescriptor['stage_contract']>) {
  const value = stage.stage_contract?.[field];
  return Array.isArray(value) ? value.filter((entry): entry is FamilyStageSurfaceRef => (
    typeof entry === 'object' && entry !== null && !Array.isArray(entry) && 'ref' in entry
  )) : [];
}

function buildStage(stage: FamilyStageDescriptor): FamilyStageCohortLoopStage {
  const sourceScopeRefs = refs(stage, 'source_scope_refs');
  const cohortQueryRefs = refs(stage, 'cohort_query_refs');
  const triggerRefs = refs(stage, 'trigger_refs');
  const monitorRefs = refs(stage, 'monitor_refs');
  const metricRefs = refs(stage, 'metric_refs');
  const dashboardMetricRefs = refs(stage, 'dashboard_metric_refs');
  const blockers: FamilyStageCohortLoopBlocker[] = [];

  if (sourceScopeRefs.length === 0) {
    blockers.push(blocker(
      stage.stage_id,
      'cohort_scope_missing',
      'source_scope_refs',
      'declare_source_scope_ref',
      'stage launch cannot prove the source cohort or source set used for execution',
    ));
  }
  if (cohortQueryRefs.length === 0) {
    blockers.push(blocker(
      stage.stage_id,
      'cohort_query_missing',
      'cohort_query_refs',
      'declare_cohort_query_ref',
      'stage has no auditable cohort query ref linking source scope to execution and monitoring',
    ));
  }
  if (triggerRefs.length === 0) {
    blockers.push(blocker(
      stage.stage_id,
      'cohort_trigger_missing',
      'trigger_refs',
      'declare_trigger_ref',
      'stage has no trigger ref binding the cohort query to a launch or schedule surface',
    ));
  }
  if (monitorRefs.length + metricRefs.length + dashboardMetricRefs.length === 0) {
    blockers.push(blocker(
      stage.stage_id,
      'cohort_monitor_or_metric_missing',
      'monitor_refs_or_metric_refs',
      'declare_monitor_or_metric_ref',
      'stage has no monitor or metric ref for the same cohort after launch',
    ));
  }

  const closureStatus: FamilyStageCohortLoopClosureStatus = sourceScopeRefs.length === 0
    ? 'missing_scope'
    : cohortQueryRefs.length === 0
      ? 'missing_query'
      : triggerRefs.length === 0
        ? 'missing_trigger'
        : monitorRefs.length + metricRefs.length + dashboardMetricRefs.length === 0
          ? 'missing_monitor_or_metric'
          : 'closed_loop_ready';

  return {
    stage_id: stage.stage_id,
    owner: stage.owner,
    closure_status: closureStatus,
    source_scope_refs: sourceScopeRefs,
    cohort_query_refs: cohortQueryRefs,
    trigger_refs: triggerRefs,
    monitor_refs: monitorRefs,
    metric_refs: metricRefs,
    dashboard_metric_refs: dashboardMetricRefs,
    counts: {
      source_scope_ref_count: sourceScopeRefs.length,
      cohort_query_ref_count: cohortQueryRefs.length,
      trigger_ref_count: triggerRefs.length,
      monitor_ref_count: monitorRefs.length,
      metric_ref_count: metricRefs.length,
      dashboard_metric_ref_count: dashboardMetricRefs.length,
    },
    blockers,
  };
}

export function buildFamilyStageCohortLoopProjection(
  plane: FamilyStageControlPlane,
): FamilyStageCohortLoopProjection {
  const stages = plane.stages.map(buildStage);
  return {
    surface_kind: 'opl_family_stage_cohort_loop',
    version: 'family-stage-cohort-loop.v1',
    plane_id: plane.plane_id,
    target_domain_id: plane.target_domain_id,
    summary: {
      stage_count: stages.length,
      closed_loop_ready_count: stages.filter((stage) => stage.closure_status === 'closed_loop_ready').length,
      blocked_stage_count: stages.filter((stage) => stage.closure_status !== 'closed_loop_ready').length,
      missing_scope_count: stages.filter((stage) => stage.closure_status === 'missing_scope').length,
      missing_query_count: stages.filter((stage) => stage.closure_status === 'missing_query').length,
      missing_trigger_count: stages.filter((stage) => stage.closure_status === 'missing_trigger').length,
      missing_monitor_or_metric_count: stages.filter((stage) => stage.closure_status === 'missing_monitor_or_metric').length,
      blocker_count: stages.reduce((count, stage) => count + stage.blockers.length, 0),
    },
    stages,
    authority_boundary: {
      opl_role: 'cohort_loop_projection_only',
      graphflow_runtime_dependency: false,
      can_execute_stage: false,
      can_write_source_truth: false,
      can_write_domain_truth: false,
      can_authorize_domain_ready: false,
      can_authorize_quality_verdict: false,
      can_mutate_artifact_body: false,
    },
  };
}
