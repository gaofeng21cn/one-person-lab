import type { DomainManifestCatalogEntry } from './domain-manifest/types.ts';
import type {
  FamilyStageControlPlane,
} from './family-stage-control-plane-contract.ts';
import {
  buildFamilyStageAdmissionReview,
} from './family-stage-admission.ts';
import type {
  FamilyStageAdmissionReview,
} from './family-stage-admission.ts';
import {
  buildFamilyStageAssumptionLifecycleProjection,
} from './family-stage-assumption-lifecycle.ts';
import {
  buildFamilyStageCohortLoopProjection,
} from './family-stage-cohort-loop.ts';
import {
  buildFamilyStageRuntimeBudgetProjection,
} from './family-stage-runtime-budget.ts';
import {
  buildFamilyStageProofBundle,
} from './family-stage-proof-bundle.ts';
import {
  buildFamilyStageReplayCertification,
} from './family-stage-replay-certification.ts';

type JsonRecord = Record<string, unknown>;

type FamilyStageReadinessStatus = 'launch_blocked' | 'launch_warning' | 'launch_observable';

interface FamilyStageReadinessCheck {
  check_id:
    | 'stage_admission'
    | 'proof_bundle'
    | 'cohort_loop'
    | 'runtime_assumptions'
    | 'runtime_budget'
    | 'replay_certification';
  status: 'blocked' | 'warning' | 'ok';
  stage_count: number;
  blocker_count: number;
  warning_count: number;
  drilldown_ref: string;
}

interface FamilyStageReadinessIssue {
  severity: 'blocker' | 'warning';
  code: string;
  message: string;
  stage_id: string | null;
  source_ref: string;
  minimal_counterexample?: JsonRecord;
}

interface FamilyStageReadinessSummary {
  project_id: string;
  project: string;
  target_domain_id: string;
  plane_id: string;
  launch_readiness_status: FamilyStageReadinessStatus;
  summary: {
    stage_count: number;
    admitted_stage_count: number;
    needs_contracts_stage_count: number;
    blocked_stage_count: number;
    hard_blocker_count: number;
    warning_count: number;
    admission_warning_count: number;
    assumption_warning_count: number;
    cohort_loop_warning_count: number;
    runtime_budget_warning_count: number;
    replay_evidence_warning_count: number;
  };
  checks: FamilyStageReadinessCheck[];
  hard_blockers: FamilyStageReadinessIssue[];
  warnings: FamilyStageReadinessIssue[];
  recommendations: FamilyStageReadinessIssue[];
  drilldown_refs: string[];
  ai_first_contract_light_policy: {
    contract_scope: [
      'launch_safety',
      'opl_authority_boundary',
      'boundary_outcome_recording',
      'replay_audit_route_back',
    ];
    does_not_contract: [
      'ai_reasoning_strategy',
      'stage_internal_planning',
      'domain_quality_verdict',
      'fixed_intelligent_workflow',
    ];
  };
  authority_boundary: {
    opl_role: 'stage_readiness_cli_summary_only';
    ai_internal_strategy_contract: false;
    can_execute_stage: false;
    can_write_domain_truth: false;
    can_authorize_domain_ready: false;
    can_authorize_quality_verdict: false;
    can_mutate_artifact_body: false;
    graphflow_runtime_dependency: false;
  };
}

function readinessIssue(
  severity: FamilyStageReadinessIssue['severity'],
  code: string,
  message: string,
  stageId: string | null,
  sourceRef: string,
  minimalCounterexample?: JsonRecord,
): FamilyStageReadinessIssue {
  return {
    severity,
    code,
    message,
    stage_id: stageId,
    source_ref: sourceRef,
    ...(minimalCounterexample ? { minimal_counterexample: minimalCounterexample } : {}),
  };
}

function issueFromAdmissionFinding(
  severity: FamilyStageReadinessIssue['severity'],
  finding: FamilyStageAdmissionReview['findings'][number],
): FamilyStageReadinessIssue {
  return readinessIssue(
    severity,
    finding.code,
    finding.message,
    finding.stage_id ?? finding.target_stage_id ?? null,
    finding.source_ref ?? `family_stage_admission:${finding.stage_id ?? finding.target_stage_id ?? 'stage_pack'}`,
    finding.minimal_counterexample,
  );
}

export function buildStageReadinessSummary(
  entry: DomainManifestCatalogEntry,
  plane: FamilyStageControlPlane,
  domain: string,
): FamilyStageReadinessSummary {
  const actionCatalog = entry.manifest?.family_action_catalog ?? null;
  const admission = buildFamilyStageAdmissionReview(plane, entry.manifest);
  const proofBundle = buildFamilyStageProofBundle(plane, {
    actionCatalog,
    admissionReview: admission,
  });
  const cohortLoop = buildFamilyStageCohortLoopProjection(plane);
  const assumptions = buildFamilyStageAssumptionLifecycleProjection(plane);
  const runtimeBudget = buildFamilyStageRuntimeBudgetProjection(plane);
  const replayCertification = buildFamilyStageReplayCertification(proofBundle);
  const drilldownRefs = [
    `opl stages inspect --domain ${domain} --stage <stage_id>`,
    `opl stages proof-bundle --domain ${domain}`,
    `opl stages assumptions --domain ${domain}`,
    `opl stages cohort-loop --domain ${domain}`,
    `opl stages runtime-budget --domain ${domain}`,
    `opl stages replay-certification --domain ${domain}`,
  ];

  const hardBlockers = admission.findings
    .filter((finding) => finding.severity === 'blocker')
    .map((finding) => issueFromAdmissionFinding('blocker', finding));
  const admissionWarnings = admission.findings
    .filter((finding) => finding.severity === 'warning')
    .map((finding) => issueFromAdmissionFinding('warning', finding));
  const assumptionWarnings = assumptions.assumptions
    .filter((assumption) => assumption.status !== 'current')
    .map((assumption) => readinessIssue(
      'warning',
      assumption.status === 'stale'
        ? 'runtime_assumption_stale'
        : assumption.status === 'missing_monitor'
          ? 'runtime_assumption_missing_monitor_ref'
          : 'runtime_assumption_missing_owner',
      assumption.status === 'stale'
        ? 'Runtime assumption has invalidation refs and should be repaired before production launch.'
        : assumption.status === 'missing_monitor'
          ? 'Runtime assumption should declare monitor refs for operator observability.'
          : 'Runtime assumption should declare an owner for operator route-back.',
      assumption.stage_id,
      `family_stage_assumptions:${assumption.stage_id}:${assumption.assumption_id}`,
      assumption.minimal_counterexample ?? undefined,
    ));
  const cohortWarnings = cohortLoop.stages.flatMap((stage) => (
    stage.blockers.map((blocker) => readinessIssue(
      'warning',
      blocker.blocker_id,
      blocker.minimal_counterexample.reason,
      stage.stage_id,
      `family_stage_cohort_loop:${stage.stage_id}`,
      blocker.minimal_counterexample,
    ))
  ));
  const runtimeBudgetWarnings = runtimeBudget.stages.flatMap((stage) => (
    stage.minimal_counterexamples.map((counterexample) => readinessIssue(
      'warning',
      `runtime_budget_${counterexample.missing_field}`,
      counterexample.reason,
      stage.stage_id,
      `family_stage_runtime_budget:${stage.stage_id}`,
      counterexample as unknown as JsonRecord,
    ))
  ));
  const replayWarnings = replayCertification.blockers.map((blocker) => readinessIssue(
    'warning',
    blocker.blocker_id,
    blocker.minimal_counterexample.reason,
    blocker.stage_id,
    'family_stage_replay_certification',
    blocker.minimal_counterexample,
  ));
  const warnings = [
    ...admissionWarnings,
    ...assumptionWarnings,
    ...cohortWarnings,
    ...runtimeBudgetWarnings,
    ...replayWarnings,
  ];
  const launchReadinessStatus: FamilyStageReadinessStatus = hardBlockers.length > 0
    ? 'launch_blocked'
    : warnings.length > 0
      ? 'launch_warning'
      : 'launch_observable';
  const checks: FamilyStageReadinessCheck[] = [
    {
      check_id: 'stage_admission',
      status: admission.summary.blockers_count > 0 ? 'blocked' : admission.summary.warnings_count > 0 ? 'warning' : 'ok',
      stage_count: admission.summary.stages_count,
      blocker_count: admission.summary.blockers_count,
      warning_count: admission.summary.warnings_count,
      drilldown_ref: 'opl stages list',
    },
    {
      check_id: 'proof_bundle',
      status: proofBundle.admission_status === 'blocked' ? 'blocked' : proofBundle.admission_status === 'needs_contracts' ? 'warning' : 'ok',
      stage_count: proofBundle.identity.stage_ids.length,
      blocker_count: proofBundle.proof_runtime_metrics.blocker_count,
      warning_count: proofBundle.proof_runtime_metrics.warning_count,
      drilldown_ref: `opl stages proof-bundle --domain ${domain}`,
    },
    {
      check_id: 'cohort_loop',
      status: cohortWarnings.length > 0 ? 'warning' : 'ok',
      stage_count: cohortLoop.summary.stage_count,
      blocker_count: 0,
      warning_count: cohortWarnings.length,
      drilldown_ref: `opl stages cohort-loop --domain ${domain}`,
    },
    {
      check_id: 'runtime_assumptions',
      status: assumptionWarnings.length > 0 ? 'warning' : 'ok',
      stage_count: assumptions.summary.assumption_count,
      blocker_count: 0,
      warning_count: assumptionWarnings.length,
      drilldown_ref: `opl stages assumptions --domain ${domain}`,
    },
    {
      check_id: 'runtime_budget',
      status: runtimeBudgetWarnings.length > 0 ? 'warning' : 'ok',
      stage_count: runtimeBudget.summary.stage_count,
      blocker_count: 0,
      warning_count: runtimeBudgetWarnings.length,
      drilldown_ref: `opl stages runtime-budget --domain ${domain}`,
    },
    {
      check_id: 'replay_certification',
      status: replayWarnings.length > 0 ? 'warning' : 'ok',
      stage_count: replayCertification.summary.stage_count,
      blocker_count: 0,
      warning_count: replayWarnings.length,
      drilldown_ref: `opl stages replay-certification --domain ${domain}`,
    },
  ];

  return {
    project_id: entry.project_id,
    project: entry.project,
    target_domain_id: plane.target_domain_id,
    plane_id: plane.plane_id,
    launch_readiness_status: launchReadinessStatus,
    summary: {
      stage_count: plane.stages.length,
      admitted_stage_count: admission.summary.admitted_stages_count,
      needs_contracts_stage_count: admission.summary.needs_contracts_stages_count,
      blocked_stage_count: admission.summary.blocked_stages_count,
      hard_blocker_count: hardBlockers.length,
      warning_count: warnings.length,
      admission_warning_count: admissionWarnings.length,
      assumption_warning_count: assumptionWarnings.length,
      cohort_loop_warning_count: cohortWarnings.length,
      runtime_budget_warning_count: runtimeBudgetWarnings.length,
      replay_evidence_warning_count: replayWarnings.filter((issue) => issue.severity === 'warning').length,
    },
    checks,
    hard_blockers: hardBlockers,
    warnings,
    recommendations: warnings,
    drilldown_refs: drilldownRefs,
    ai_first_contract_light_policy: {
      contract_scope: [
        'launch_safety',
        'opl_authority_boundary',
        'boundary_outcome_recording',
        'replay_audit_route_back',
      ],
      does_not_contract: [
        'ai_reasoning_strategy',
        'stage_internal_planning',
        'domain_quality_verdict',
        'fixed_intelligent_workflow',
      ],
    },
    authority_boundary: {
      opl_role: 'stage_readiness_cli_summary_only',
      ai_internal_strategy_contract: false,
      can_execute_stage: false,
      can_write_domain_truth: false,
      can_authorize_domain_ready: false,
      can_authorize_quality_verdict: false,
      can_mutate_artifact_body: false,
      graphflow_runtime_dependency: false,
    },
  };
}
