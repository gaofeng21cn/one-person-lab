import { canonicalOwnerId } from './owner-id.ts';
import { optionalString } from './standard-domain-agent-conformance-utils.ts';

interface StageRunAdoptionTailItem {
  status?: unknown;
}

interface StageRunAdoptionReport {
  repo_dir: string;
  requested_agent_id: string | null;
  domain_id: string;
  status: string;
  stage_run_kernel_profile_checks: {
    status: string;
    profile_source: unknown;
    default_read_surface: {
      root: unknown;
    };
    transition_authority: {
      terminal_transition_authority: unknown;
    };
  };
  stage_run_canary_evidence_checks: {
    status: string;
    evidence_scope: unknown;
    operator_summary: {
      status: string;
    };
    stage_id: unknown;
    canary_id: unknown;
    stage_run_ref: unknown;
    stage_manifest_ref: unknown;
    current_pointer_ref: unknown;
  };
  stage_operating_principle_checks: {
    status: string;
    policy_source: unknown;
    management_boundary: {
      stage_unit: unknown;
    };
    speed_policy: {
      executor_autonomy_inside_stage: unknown;
      quality_gaps_block_ordinary_progress_by_default: unknown;
    };
    default_read_surface: {
      root: unknown;
    };
    demoted_default_surfaces: unknown;
  };
  evidence_tail_classification: {
    status: string;
    tail_items: StageRunAdoptionTailItem[];
  };
}

const LIVE_STAGE_RUN_PROGRESS_ACCEPTED_RESULT_SHAPES = [
  'domain_owner_receipt_ref',
  'typed_blocker_ref',
  'human_gate_ref',
  'quality_or_export_receipt_ref',
  'no_regression_ref',
  'long_soak_ref',
];

function countTailItems(report: StageRunAdoptionReport, status: string) {
  return report.evidence_tail_classification.tail_items
    .filter((item) => optionalString(item.status) === status)
    .length;
}

function stageRunDomainNextAction(report: StageRunAdoptionReport) {
  if (
    report.stage_run_kernel_profile_checks.status !== 'passed'
    || report.stage_run_canary_evidence_checks.status !== 'passed'
    || report.stage_run_canary_evidence_checks.operator_summary.status !== 'ready'
  ) {
    return 'repair_stage_run_profile_canary_or_structural_conformance_blockers';
  }
  if (countTailItems(report, 'open') > 0) {
    return 'domain_owner_live_receipt_typed_blocker_no_regression_or_long_soak_ref_required';
  }
  if (countTailItems(report, 'domain_owned_typed_blocker') > 0) {
    return 'domain_owner_typed_blocker_ref_observed_wait_for_owner_resolution_or_no_regression_ref';
  }
  return 'domain_owner_live_progress_evidence_still_required_before_domain_or_production_ready';
}

export function buildStageRunDomainAdoptionReadModel(reports: StageRunAdoptionReport[]) {
  const domains = reports.map((report) => {
    const profile = report.stage_run_kernel_profile_checks;
    const canary = report.stage_run_canary_evidence_checks;
    const domainId = canonicalOwnerId(report.domain_id);
    return {
      domain_id: domainId,
      ...(domainId !== report.domain_id ? { source_domain_id: report.domain_id } : {}),
      requested_agent_id: report.requested_agent_id,
      repo_dir: report.repo_dir,
      status: report.status,
      stage_run_kernel_profile_status: profile.status,
      stage_run_kernel_profile_source: profile.profile_source,
      stage_run_default_read_surface_root: profile.default_read_surface.root,
      stage_run_terminal_transition_authority:
        profile.transition_authority.terminal_transition_authority,
      stage_run_canary_evidence_status: canary.status,
      stage_run_canary_evidence_scope: canary.evidence_scope,
      stage_run_canary_operator_status: canary.operator_summary.status,
      stage_run_canary_stage_id: canary.stage_id,
      stage_run_canary_id: canary.canary_id,
      stage_operating_principles_status: report.stage_operating_principle_checks.status,
      stage_operating_principles_source:
        report.stage_operating_principle_checks.policy_source,
      management_boundary_stage_unit:
        report.stage_operating_principle_checks.management_boundary.stage_unit,
      speed_policy_executor_autonomy_inside_stage:
        report.stage_operating_principle_checks.speed_policy.executor_autonomy_inside_stage,
      speed_policy_quality_gaps_block_ordinary_progress_by_default:
        report.stage_operating_principle_checks.speed_policy
          .quality_gaps_block_ordinary_progress_by_default,
      stage_operating_default_read_surface_root:
        report.stage_operating_principle_checks.default_read_surface.root,
      stage_operating_demoted_default_surfaces:
        report.stage_operating_principle_checks.demoted_default_surfaces,
      stage_run_ref: canary.stage_run_ref,
      stage_manifest_ref: canary.stage_manifest_ref,
      current_pointer_ref: canary.current_pointer_ref,
      controlled_canary_claims_live_domain_progress: false,
      domain_production_acceptance_tail_status: report.evidence_tail_classification.status,
      domain_production_acceptance_tail_count: report.evidence_tail_classification.tail_items.length,
      domain_production_acceptance_tail_open_count: countTailItems(report, 'open'),
      domain_production_acceptance_tail_typed_blocker_count: countTailItems(
        report,
        'domain_owned_typed_blocker',
      ),
      domain_production_acceptance_tail_scope:
        'domain_owned_acceptance_refs_not_live_stage_run_progress_evidence',
      production_evidence_tail_status: report.evidence_tail_classification.status,
      production_evidence_tail_count: report.evidence_tail_classification.tail_items.length,
      production_evidence_tail_open_count: countTailItems(report, 'open'),
      production_evidence_tail_typed_blocker_count: countTailItems(report, 'domain_owned_typed_blocker'),
      live_stage_run_progress_evidence_status: 'required_from_domain_owner',
      live_stage_run_progress_evidence_required_from: 'domain_owner',
      structural_conformance_is_domain_ready: false,
      next_required_owner_action: stageRunDomainNextAction(report),
      authority_boundary: {
        can_claim_live_domain_progress: false,
        can_claim_domain_ready: false,
        can_claim_quality_or_export_ready: false,
        can_claim_artifact_ready: false,
        can_claim_production_ready: false,
        can_sign_owner_receipt: false,
        can_create_typed_blocker: false,
        can_authorize_physical_delete: false,
      },
    };
  });
  const profilePassedCount = domains
    .filter((domain) => domain.stage_run_kernel_profile_status === 'passed')
    .length;
  const canaryPassedCount = domains
    .filter((domain) => domain.stage_run_canary_evidence_status === 'passed')
    .length;
  const productionEvidenceTailCount = domains.reduce(
    (total, domain) => total + domain.production_evidence_tail_count,
    0,
  );
  const openProductionEvidenceTailCount = domains.reduce(
    (total, domain) => total + domain.production_evidence_tail_open_count,
    0,
  );
  const domainProductionAcceptanceTailCount = domains.reduce(
    (total, domain) => total + domain.domain_production_acceptance_tail_count,
    0,
  );
  const openDomainProductionAcceptanceTailCount = domains.reduce(
    (total, domain) => total + domain.domain_production_acceptance_tail_open_count,
    0,
  );
  const liveStageRunProgressEvidenceWorklist = {
    surface_kind: 'opl_live_stage_run_progress_evidence_worklist',
    owner: 'domain_owner',
    status: 'required_from_domain_owner',
    open_domain_count: domains.length,
    required_from: 'domain_owner',
    accepted_refs_only_result_shapes: LIVE_STAGE_RUN_PROGRESS_ACCEPTED_RESULT_SHAPES,
    domains: domains.map((domain) => ({
      domain_id: domain.domain_id,
      requested_agent_id: domain.requested_agent_id,
      repo_dir: domain.repo_dir,
      status: domain.live_stage_run_progress_evidence_status,
      next_required_owner_action: domain.next_required_owner_action,
      accepted_refs_only_result_shapes: LIVE_STAGE_RUN_PROGRESS_ACCEPTED_RESULT_SHAPES,
      structural_conformance_is_domain_ready: domain.structural_conformance_is_domain_ready,
      conformance_can_claim_live_domain_progress: false,
      conformance_can_claim_domain_ready: false,
      conformance_can_claim_production_ready: false,
      can_sign_owner_receipt: false,
      can_create_typed_blocker: false,
    })),
    authority_boundary: {
      can_claim_live_domain_progress: false,
      can_claim_domain_ready: false,
      can_claim_quality_or_export_ready: false,
      can_claim_artifact_ready: false,
      can_claim_production_ready: false,
      can_write_domain_truth: false,
      can_sign_owner_receipt: false,
      can_create_typed_blocker: false,
      can_authorize_physical_delete: false,
    },
  };
  return {
    surface_kind: 'opl_stage_run_domain_adoption_read_model',
    owner: 'one-person-lab',
    read_model_role:
      'top_level_operator_projection_from_standard_domain_agent_conformance_reports',
    status: profilePassedCount === reports.length && canaryPassedCount === reports.length
      ? 'passed'
      : 'blocked',
    domain_count: reports.length,
    stage_run_kernel_profile_passed_count: profilePassedCount,
    stage_run_canary_evidence_passed_count: canaryPassedCount,
    controlled_canary_evidence_scope: domains.every((domain) =>
      domain.stage_run_canary_evidence_scope === 'controlled_fixture_not_live_domain_progress'
    )
      ? 'controlled_fixture_not_live_domain_progress'
      : 'mixed_or_blocked',
    production_evidence_tail_count: productionEvidenceTailCount,
    open_production_evidence_tail_count: openProductionEvidenceTailCount,
    production_evidence_tail_policy: 'reported_separately_not_a_structural_pass_condition',
    domain_production_acceptance_tail_count: domainProductionAcceptanceTailCount,
    open_domain_production_acceptance_tail_count: openDomainProductionAcceptanceTailCount,
    domain_production_acceptance_tail_policy:
      'domain_owned_acceptance_refs_are_reported_separately_from_live_stage_run_progress',
    live_stage_run_progress_evidence_status: 'required_from_domain_owner',
    live_stage_run_progress_evidence_policy:
      'controlled_canary_and_structural_conformance_do_not_close_live_domain_progress_evidence',
    live_stage_run_progress_evidence_worklist: liveStageRunProgressEvidenceWorklist,
    controlled_canary_claims_live_domain_progress: false,
    conformance_pass_counts_as_domain_ready: false,
    conformance_pass_counts_as_production_ready: false,
    domains,
    authority_boundary: {
      can_claim_live_domain_progress: false,
      can_claim_domain_ready: false,
      can_claim_quality_or_export_ready: false,
      can_claim_artifact_ready: false,
      can_claim_production_ready: false,
      can_write_domain_truth: false,
      can_sign_owner_receipt: false,
      can_create_typed_blocker: false,
      can_authorize_physical_delete: false,
    },
  };
}
