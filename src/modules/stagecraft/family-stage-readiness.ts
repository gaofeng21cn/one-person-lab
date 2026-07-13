import type { FamilyStageDomainManifestCatalogEntry } from './family-stage-domain-manifest.ts';
import type {
  FamilyStageControlPlane,
} from './family-stage-control-plane-contract.ts';
import {
  buildFamilyStageConformanceReview,
} from './family-stage-conformance.ts';
import type {
  FamilyStageConformanceReview,
} from './family-stage-conformance.ts';
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
  buildFamilyStageReplayEvidenceFromControlPlane,
  type FamilyStageReplayMissingReceiptWorkorder,
} from './family-stage-replay-certification.ts';
import {
  FAMILY_STAGE_AI_STRATEGY_ADVISORY_REFS,
  FAMILY_STAGE_DERIVED_DIAGNOSTIC_LENSES,
  FAMILY_STAGE_KERNEL_REQUIRED_REFS,
} from './family-stage-derived-lenses.ts';

type JsonRecord = Record<string, unknown>;

const DEFAULT_STAGE_READINESS_ATTENTION_LIMIT = 5;

type FamilyStageReadinessStatus = 'launch_blocked' | 'launch_warning' | 'launch_observable';

export interface FamilyStageReadinessCheck {
  check_id:
    | 'stage_conformance'
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

export interface FamilyStageReadinessIssue {
  severity: 'blocker' | 'warning';
  code: string;
  message: string;
  stage_id: string | null;
  source_ref: string;
  minimal_counterexample?: JsonRecord;
  payload_workorder?: FamilyStageReplayMissingReceiptWorkorder;
}

export interface FamilyStageReadinessSummary {
  project_id: string;
  project: string;
  target_domain_id: string;
  plane_id: string;
  launch_readiness_status: FamilyStageReadinessStatus;
  summary: {
    stage_count: number;
    conformant_stage_count: number;
    quality_debt_stage_count: number;
    blocked_stage_count: number;
    hard_blocker_count: number;
    warning_count: number;
    conformance_warning_count: number;
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
    expert_judgment_priority: 'ai_native_expert_judgment_first';
    contract_floor_policy: 'contracts_preserve_minimum_safety_audit_recovery_floor_only';
    mechanical_signals_policy: 'mechanical_scores_checklists_and_contract_completeness_are_advisory_not_quality_verdicts';
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
      'expert_judgment_ceiling',
      'mechanical_quality_substitute',
      'contract_completeness_as_quality_verdict',
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
    can_replace_ai_expert_judgment: false;
    contract_completeness_is_quality_verdict: false;
    graphflow_runtime_dependency: false;
  };
}

export interface FamilyStageOperatorReadiness {
  status: FamilyStageReadinessStatus;
  summary: FamilyStageReadinessSummary['summary'] & {
    lens_count: number;
    diagnostic_lens_count: number;
    displayed_blocker_count: number;
    displayed_warning_count: number;
    displayed_recommendation_count: number;
    full_warning_count: number;
    full_recommendation_count: number;
  };
  blockers: FamilyStageReadinessIssue[];
  warnings: FamilyStageReadinessIssue[];
  recommendations: FamilyStageReadinessIssue[];
  next_safe_actions: string[];
  lens_summary: Array<FamilyStageReadinessCheck & {
    role: 'stage_kernel_gate' | 'diagnostic_only';
    author_required: boolean;
    default_surface: boolean;
    can_block_launch: boolean;
  }>;
  drilldown_refs: string[];
  full_detail_policy: 'default_payload_is_attention_limited_full_diagnostics_via_detail_full';
  stage_kernel: {
    surface_kind: 'opl_stage_kernel_contract_floor';
    hard_blocker_sources: readonly string[];
    kernel_required_refs: typeof FAMILY_STAGE_KERNEL_REQUIRED_REFS;
    derived_lenses_can_block_launch: false;
    static_conformance_can_block_launch: false;
    runtime_hard_stops_only: true;
  };
  ai_capability_aperture: {
    surface_kind: 'opl_ai_capability_aperture';
    ai_strategy_refs_are_launch_blockers_by_default: false;
    ai_strategy_advisory_refs: typeof FAMILY_STAGE_AI_STRATEGY_ADVISORY_REFS;
    contract_floor: 'boundary_safety_audit_replay_route_back_only';
    executor_strategy_owner: 'selected_ai_executor_and_domain_owner';
  };
  authority_boundary: FamilyStageReadinessSummary['authority_boundary'] & {
    can_claim_domain_ready: false;
    can_claim_artifact_authority: false;
    can_claim_production_ready: false;
  };
}

function readinessIssue(
  severity: FamilyStageReadinessIssue['severity'],
  code: string,
  message: string,
  stageId: string | null,
  sourceRef: string,
  minimalCounterexample?: JsonRecord,
  payloadWorkorder?: FamilyStageReplayMissingReceiptWorkorder,
): FamilyStageReadinessIssue {
  return {
    severity,
    code,
    message,
    stage_id: stageId,
    source_ref: sourceRef,
    ...(minimalCounterexample ? { minimal_counterexample: minimalCounterexample } : {}),
    ...(payloadWorkorder ? { payload_workorder: payloadWorkorder } : {}),
  };
}

function issueFromConformanceFinding(
  severity: FamilyStageReadinessIssue['severity'],
  finding: FamilyStageConformanceReview['findings'][number],
): FamilyStageReadinessIssue {
  return readinessIssue(
    severity,
    finding.code,
    finding.message,
    finding.stage_id ?? finding.target_stage_id ?? null,
    finding.source_ref ?? `family_stage_conformance:${finding.stage_id ?? finding.target_stage_id ?? 'stage_pack'}`,
    finding.minimal_counterexample,
  );
}

export function buildStageReadinessSummary(
  entry: FamilyStageDomainManifestCatalogEntry,
  plane: FamilyStageControlPlane,
  domain: string,
): FamilyStageReadinessSummary {
  const actionCatalog = entry.manifest?.family_action_catalog ?? null;
  const conformance = buildFamilyStageConformanceReview(plane, entry.manifest);
  const proofBundle = buildFamilyStageProofBundle(plane, {
    actionCatalog,
    conformanceReview: conformance,
  });
  const cohortLoop = buildFamilyStageCohortLoopProjection(plane);
  const assumptions = buildFamilyStageAssumptionLifecycleProjection(plane);
  const runtimeBudget = buildFamilyStageRuntimeBudgetProjection(plane);
  const replayCertification = buildFamilyStageReplayCertification(
    proofBundle,
    buildFamilyStageReplayEvidenceFromControlPlane(plane),
  );
  const drilldownRefs = [
    `opl stages inspect --domain ${domain} --stage <stage_id>`,
    `opl stages proof-bundle --domain ${domain}`,
    `opl stages assumptions --domain ${domain}`,
    `opl stages cohort-loop --domain ${domain}`,
    `opl stages runtime-budget --domain ${domain}`,
    `opl stages replay-certification --domain ${domain}`,
  ];

  const hardBlockers: FamilyStageReadinessIssue[] = [];
  const conformanceWarnings = conformance.findings
    .map((finding) => issueFromConformanceFinding('warning', finding));
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
    blocker.payload_workorder,
  ));
  const warnings = [
    ...conformanceWarnings,
    ...assumptionWarnings,
    ...cohortWarnings,
    ...runtimeBudgetWarnings,
    ...replayWarnings,
  ];
  const launchReadinessStatus: FamilyStageReadinessStatus = warnings.length > 0
      ? 'launch_warning'
      : 'launch_observable';
  const checks: FamilyStageReadinessCheck[] = [
    {
      check_id: 'stage_conformance',
      status: conformanceWarnings.length > 0 ? 'warning' : 'ok',
      stage_count: conformance.summary.stages_count,
      blocker_count: hardBlockers.length,
      warning_count: conformanceWarnings.length,
      drilldown_ref: 'opl stages list',
    },
    {
      check_id: 'proof_bundle',
      status: proofBundle.conformance_status !== 'conformant'
          ? 'warning'
          : 'ok',
      stage_count: proofBundle.identity.stage_ids.length,
      blocker_count: hardBlockers.length,
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
      conformant_stage_count: conformance.summary.conformant_stages_count,
      quality_debt_stage_count: conformance.summary.quality_debt_stages_count,
      blocked_stage_count: new Set(hardBlockers.map((issue) => issue.stage_id).filter(Boolean)).size,
      hard_blocker_count: hardBlockers.length,
      warning_count: warnings.length,
      conformance_warning_count: conformanceWarnings.length,
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
      expert_judgment_priority: 'ai_native_expert_judgment_first',
      contract_floor_policy: 'contracts_preserve_minimum_safety_audit_recovery_floor_only',
      mechanical_signals_policy:
        'mechanical_scores_checklists_and_contract_completeness_are_advisory_not_quality_verdicts',
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
        'expert_judgment_ceiling',
        'mechanical_quality_substitute',
        'contract_completeness_as_quality_verdict',
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
      can_replace_ai_expert_judgment: false,
      contract_completeness_is_quality_verdict: false,
      graphflow_runtime_dependency: false,
    },
  };
}

function nextSafeActions(summary: FamilyStageReadinessSummary) {
  if (summary.warnings.length > 0) {
    return [
      'review_advisory_lens_warnings',
      'open_diagnostic_drilldown_only_when_needed',
      'keep_ai_executor_strategy_uncontracted',
    ];
  }
  return [
    'launch_candidate_can_enter_provider_queue_with_owner_receipt_boundary',
    'keep_domain_quality_and_artifact_verdicts_with_domain_owner',
  ];
}

function attentionItems<T>(items: T[], limit = DEFAULT_STAGE_READINESS_ATTENTION_LIMIT) {
  return items.slice(0, limit);
}

export function buildStageOperatorReadiness(
  summary: FamilyStageReadinessSummary,
): FamilyStageOperatorReadiness {
  const lensById = new Map(FAMILY_STAGE_DERIVED_DIAGNOSTIC_LENSES.map((lens) => [lens.lens_id, lens]));
  const lensSummary = summary.checks.map((check) => {
    if (check.check_id === 'stage_conformance') {
      return {
        ...check,
        role: 'diagnostic_only' as const,
        author_required: true,
        default_surface: true,
        can_block_launch: false,
      };
    }
    const lens = lensById.get(check.check_id);
    return {
      ...check,
      role: 'diagnostic_only' as const,
      author_required: lens?.author_required ?? false,
      default_surface: lens?.default_surface ?? false,
      can_block_launch: lens?.can_block_launch ?? false,
    };
  });
  const blockers = attentionItems(summary.hard_blockers);
  const warnings = attentionItems(summary.warnings);
  const recommendations = attentionItems(summary.recommendations);

  return {
    status: summary.launch_readiness_status,
    summary: {
      ...summary.summary,
      lens_count: summary.checks.length,
      diagnostic_lens_count: FAMILY_STAGE_DERIVED_DIAGNOSTIC_LENSES.length,
      displayed_blocker_count: blockers.length,
      displayed_warning_count: warnings.length,
      displayed_recommendation_count: recommendations.length,
      full_warning_count: summary.warnings.length,
      full_recommendation_count: summary.recommendations.length,
    },
    blockers,
    warnings,
    recommendations,
    next_safe_actions: nextSafeActions(summary),
    lens_summary: lensSummary,
    drilldown_refs: summary.drilldown_refs,
    full_detail_policy: 'default_payload_is_attention_limited_full_diagnostics_via_detail_full',
    stage_kernel: {
      surface_kind: 'opl_stage_kernel_contract_floor',
      hard_blocker_sources: [],
      kernel_required_refs: FAMILY_STAGE_KERNEL_REQUIRED_REFS,
      derived_lenses_can_block_launch: false,
      static_conformance_can_block_launch: false,
      runtime_hard_stops_only: true,
    },
    ai_capability_aperture: {
      surface_kind: 'opl_ai_capability_aperture',
      ai_strategy_refs_are_launch_blockers_by_default: false,
      ai_strategy_advisory_refs: FAMILY_STAGE_AI_STRATEGY_ADVISORY_REFS,
      contract_floor: 'boundary_safety_audit_replay_route_back_only',
      executor_strategy_owner: 'selected_ai_executor_and_domain_owner',
    },
    authority_boundary: {
      ...summary.authority_boundary,
      can_claim_domain_ready: false,
      can_claim_artifact_authority: false,
      can_claim_production_ready: false,
    },
  };
}
