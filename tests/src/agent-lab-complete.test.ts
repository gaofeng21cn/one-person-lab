import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

import {
  buildAgentLabExportEnvelope,
  buildAgentLabEvolutionResult,
  buildAgentLabMechanismReadModel,
  buildAgentLabOptimizeResult,
  buildAgentLabStageExecutorPolicyReadModel,
  buildAgentLabVariantComparisonReadModel,
  buildAgentLabWorkbenchReadModel,
  buildCompleteAgentLabControlPlane,
  buildDeveloperModeAgentLabRepairRoute,
  buildDeveloperModeAgentLabRepairRouteReadModel,
} from '../../src/agent-lab-complete.ts';
import { buildSampleAgentLabSuite } from '../../src/agent-lab.ts';

const agentLabStateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-lab-complete-state-'));
const previousOplStateDir = process.env.OPL_STATE_DIR;
process.env.OPL_STATE_DIR = agentLabStateRoot;

after(() => {
  if (previousOplStateDir === undefined) {
    delete process.env.OPL_STATE_DIR;
  } else {
    process.env.OPL_STATE_DIR = previousOplStateDir;
  }
  fs.rmSync(agentLabStateRoot, { recursive: true, force: true });
});

function realIndependentAiReviewReceipt(candidateRef: string, riskTier = 'low_risk') {
  return {
    receipt_ref: `independent-ai-review-receipt:${candidateRef}`,
    receipt_source: 'real_independent_ai_review',
    assessment_mode: 'real_independent_ai_review',
    reviewer_ref: 'reviewer-ref:agent-lab/external-independent-reviewer/run-001',
    reviewer_agent_ref: 'agent-ref:opl-agent-lab/independent-ai-reviewer',
    reviewed_mechanism_candidate_ref: candidateRef,
    execution_attempt_ref: `stage-attempt:executor:${candidateRef}`,
    review_attempt_ref: `stage-attempt:reviewer:${candidateRef}`,
    request_ref: `review-request-ref:${candidateRef}`,
    response_ref: `review-response-ref:${candidateRef}`,
    evidence_refs: [
      `review-evidence-ref:${candidateRef}`,
      `no-forbidden-write-evidence-ref:${candidateRef}`,
    ],
    no_shared_context: true,
    review_context_inherits_executor_context: false,
    forbidden_write_scan_ref: `no-forbidden-write-scan-ref:${candidateRef}`,
    verdict: 'approved_for_risk_tiered_auto_promotion',
    risk_tier: riskTier,
  };
}

function assertStringRef(value: unknown, pattern: RegExp) {
  if (typeof value !== 'string') {
    assert.fail(`Expected string ref, got ${typeof value}`);
  }
  assert.match(value, pattern);
}

test('Agent Lab complete control plane exposes eval adapters, observability exports, and optimizer boundary', () => {
  const result = buildCompleteAgentLabControlPlane();

  assert.equal(result.surface_kind, 'opl_agent_lab_complete_control_plane');
  assert.equal(result.status, 'ready_for_opl_native_use');
  assert.equal(result.readiness.complete_control_plane_ready, true);
  assert.equal(result.readiness.ready_to_connect_inspect_ai_adapter, true);
  assert.equal(result.readiness.ready_to_export_observability_refs, true);
  assert.equal(result.readiness.ready_to_emit_mechanism_read_model, true);
  assert.equal(result.readiness.ready_to_emit_evolution_segments, true);
  assert.equal(result.readiness.ready_to_emit_optimizer_candidate_refs, true);
  assert.equal(result.readiness.ready_to_emit_rl_transition_refs, true);
  assert.equal(result.readiness.ready_to_emit_developer_mode_repair_routes, true);
  assert.equal(result.readiness.ready_to_emit_integration_contracts, true);
  assert.equal(result.readiness.ready_to_emit_review_trace_ledger, true);
  assert.equal(result.readiness.ready_to_emit_log_driven_mechanism_candidates, true);
  assert.equal(result.readiness.ready_to_emit_aris_maturity_controls, true);
  assert.equal(result.readiness.ready_to_emit_ahe_evidence_read_model, true);
  assert.equal(result.readiness.ready_to_emit_executor_capability_aperture, true);
  assert.equal(result.readiness.ready_to_emit_codex_attempt_trace_flywheel, true);
  assert.equal(result.readiness.ready_to_emit_variant_comparison_read_model, true);
  assert.equal(result.readiness.ready_to_emit_stage_executor_policy_read_model, true);
  assert.equal(result.readiness.ready_to_emit_token_cost_estimates, true);
  assert.equal(result.readiness.automatic_mechanism_promotion_ready, false);
  assert.equal(result.readiness.automatic_model_training_ready, false);
  assert.equal(result.readiness.automatic_default_agent_promotion_ready,
    'risk_tiered_after_independent_ai_review');
  assert.equal(result.readiness.app_workbench_consumption_ready, true);
  assert.ok(result.eval_adapters.some((entry) => entry.adapter_id === 'inspect-ai'));
  assert.ok(result.eval_adapters.some((entry) => entry.adapter_id === 'metr-task-standard'));
  assert.ok(result.observability_exports.some((entry) => entry.export_id === 'langfuse'));
  assert.ok(result.observability_exports.some((entry) => entry.export_id === 'phoenix'));
  assert.equal(result.developer_mode_repair_routes.surface_kind,
    'opl_agent_lab_developer_mode_repair_route_read_model');
  assert.deepEqual(result.optimizer_loop.loop_steps, [
    'collect_trajectory_refs',
    'collect_executor_capability_aperture_refs',
    'standardize_codex_attempt_trace_refs',
    'collect_ahe_failure_root_cause_fix_and_falsification_refs',
    'collect_usage_and_blocker_event_refs',
    'mine_real_logs_into_mechanism_candidate_refs',
    'optional_web_research_for_mechanism_context',
    'freeze_dataset_or_longline_suite',
    'score_with_domain_owned_scorecard_refs',
    'validate_cross_surface_integration_contracts',
    'select_mechanism_editable_surface_refs',
    'evaluate_stage_executor_policy_candidates',
    'emit_meta_edit_receipt_ref',
    'generate_next_mechanism_candidate_ref',
    'classify_mechanism_change_risk',
    'run_independent_ai_review_without_shared_context',
    'record_review_trace_refs',
    'run_regression_and_recovery_gates',
    'auto_promote_low_and_medium_risk_with_versioned_canary',
    'route_high_risk_to_owner_or_human_gate',
    'record_rollback_target_ref',
    'compare_best_of_n_variant_candidate_refs',
    'fork_blocked_evidence_into_variant_candidate_refs',
    'emit_replay_fork_eval_evidence_delta_refs',
    'record_evolution_segment_refs',
  ]);
  assert.equal(result.integration_contracts.surface_kind, 'opl_agent_lab_integration_contract_read_model');
  assert.equal(result.integration_contracts.summary.contract_count, 3);
  assert.equal(result.integration_contracts.summary.owner_route_ref_count, 3);
  assert.equal(result.review_trace_ledger.surface_kind, 'opl_agent_lab_review_trace_ledger');
  assert.equal(result.review_trace_ledger.summary.trace_count, 3);
  assert.equal(result.review_trace_ledger.summary.independent_no_shared_context_count, 2);
  assert.equal(result.log_driven_mechanism_candidates.surface_kind,
    'opl_agent_lab_log_driven_mechanism_candidate_read_model');
  assert.equal(result.log_driven_mechanism_candidates.summary.candidate_count, 4);
  assert.equal(result.log_driven_mechanism_candidates.summary.high_risk_count, 0);
  assert.equal(result.aris_maturity_controls.surface_kind, 'opl_agent_lab_aris_maturity_controls_read_model');
  assert.equal(result.aris_maturity_controls.summary.control_count, 4);
  assert.equal(result.aris_maturity_controls.runtime_dependency_required, false);
  assert.equal(result.aris_maturity_controls.controls.helper_inventory_drift_report.can_execute_helper, false);
  assert.equal(result.aris_maturity_controls.controls.fail_closed_invariants.missing_context_policy,
    'fail_closed_with_typed_blocker_ref');
  assert.equal(result.aris_maturity_controls.controls.mcp_stream_reliability_policy.no_silent_drop, true);
  assert.equal(result.codex_attempt_trace_flywheel.surface_kind,
    'opl_agent_lab_codex_attempt_trace_flywheel');
  assert.equal(result.codex_attempt_trace_flywheel.summary.codex_cli_attempt_count, 3);
  assert.equal(result.codex_attempt_trace_flywheel.summary.fork_candidate_count, 0);
  assert.equal(result.codex_attempt_trace_bundle.surface_kind, 'opl_agent_lab_codex_attempt_trace_bundle');
  assert.equal(result.codex_attempt_trace_bundle.summary.attempt_trace_count, 3);
  assert.equal(result.replay_fork_variant_cockpit.surface_kind, 'opl_agent_lab_replay_fork_variant_cockpit');
  assert.equal(result.replay_fork_variant_cockpit.summary.variant_count, 0);
  assert.equal(result.codex_attempt_trace_flywheel.semantic_boundary,
    'refs_only_evidence_learning_loop_not_domain_quality_or_training_authority');
  assert.equal(result.codex_attempt_trace_flywheel.authority_boundary.can_authorize_domain_ready, false);
  assert.equal(result.codex_attempt_trace_flywheel.authority_boundary.can_authorize_quality_verdict, false);
  assert.equal(result.codex_attempt_trace_flywheel.authority_boundary.can_promote_default_agent, false);
  assert.equal(result.codex_attempt_trace_flywheel.authority_boundary.can_train_or_deploy_model_weights, false);
  assert.equal(result.codex_attempt_trace_flywheel.authority_boundary.can_mutate_artifact_body, false);
  assert.equal(result.optimizer_loop.integration_contract_read_model.read_model_id,
    result.integration_contracts.read_model_id);
  assert.equal(result.optimizer_loop.review_trace_ledger.ledger_ref, result.review_trace_ledger.ledger_ref);
  assert.equal(result.optimizer_loop.log_driven_candidate_read_model.read_model_id,
    result.log_driven_mechanism_candidates.read_model_id);
  assert.equal(result.optimizer_loop.ahe_evidence_read_model.read_model_id,
    result.ahe_evidence.read_model_id);
  assert.equal(result.optimizer_loop.executor_capability_aperture.read_model_id,
    result.executor_capability_aperture.read_model_id);
  assert.equal(result.optimizer_loop.codex_attempt_trace_flywheel.read_model_id,
    result.codex_attempt_trace_flywheel.read_model_id);
  assert.equal(result.optimizer_loop.codex_attempt_trace_bundle.bundle_id,
    result.codex_attempt_trace_bundle.bundle_id);
  assert.equal(result.optimizer_loop.replay_fork_variant_cockpit.cockpit_id,
    result.replay_fork_variant_cockpit.cockpit_id);
  assert.equal(result.optimizer_loop.aris_maturity_controls.read_model_id,
    result.aris_maturity_controls.read_model_id);
  assert.equal(result.optimizer_loop.variant_comparison_read_model.read_model_id,
    result.variant_comparison.read_model_id);
  assert.equal(result.optimizer_loop.stage_executor_policy_read_model.read_model_id,
    result.stage_executor_policy.read_model_id);
  assert.equal(result.token_cost_estimates.length, 1);
  assert.equal(result.token_cost_estimates[0].surface_kind, 'opl_agent_lab_cost_estimate');
  assert.equal(result.token_cost_estimates[0].preset_id, 'rca-ppt-40');
  assert.equal(result.token_cost_estimates[0].domain_id, 'redcube-ai');
  assert.equal(result.token_cost_estimates[0].models.text_model, 'gpt-5.5');
  assert.equal(result.token_cost_estimates[0].models.reasoning_effort, 'xhigh');
  assert.equal(result.token_cost_estimates[0].models.image_model, 'gpt-image-2');
  assert.equal(result.token_cost_estimates[0].total_estimate.estimated_cost_usd, 38.84);
  assert.equal(result.token_cost_estimates[0].totals.uncertainty_range_usd.high, 66.028);
  assert.equal(result.token_cost_estimates[0].authority_boundary.can_claim_actual_invoice_cost, false);
  assert.equal(result.token_cost_estimates[0].authority_boundary.can_authorize_quality_verdict, false);
  assert.equal(result.executor_capability_aperture.surface_kind,
    'opl_agent_lab_executor_capability_lease_read_model');
  assert.equal(result.executor_capability_aperture.lease_kind, 'executor_capability_lease');
  assert.equal(result.executor_capability_aperture.read_model_role,
    'runtime_issued_executor_capability_lease');
  assert.equal(result.executor_capability_aperture.summary.codex_cli_task_count, 3);
  assert.equal(result.executor_capability_aperture.summary.non_default_executor_task_count, 0);
  assert.equal(result.executor_capability_aperture.authority_boundary.can_constrain_executor_reasoning, false);
  assert.equal(result.executor_capability_aperture.authority_boundary.can_change_default_executor, false);
  assert.equal(result.executor_capability_aperture.authority_boundary.can_execute_non_default_executor, false);
  assert.equal(result.executor_capability_aperture.authority_boundary.can_claim_quality_equivalence, false);
  assert.equal(result.executor_capability_aperture.authority_boundary.can_claim_tool_semantics_equivalence, false);
  assert.equal(result.executor_capability_aperture.authority_boundary.can_claim_resume_equivalence, false);
  assert.equal(result.executor_capability_aperture.authority_boundary.can_authorize_domain_ready, false);
  assert.equal(result.executor_capability_aperture.authority_boundary.can_authorize_quality_verdict, false);
  assert.equal(result.executor_capability_aperture.authority_boundary.can_mutate_artifact_body, false);
  assert.equal(result.executor_capability_aperture.authority_boundary.can_write_domain_truth, false);
  assert.equal(result.optimizer_loop.mechanism_object.promotion_mode,
    'risk_tiered_auto_promotion_with_independent_ai_review');
  assert.equal(result.stage_executor_policy.surface_kind, 'opl_agent_lab_stage_executor_policy_read_model');
  assert.equal(result.stage_executor_policy.trial_ready_candidate_count, 1);
  assert.equal(result.stage_executor_policy.blocked_candidate_count, 1);
  assert.equal(result.stage_executor_policy.test_matrix.non_default_executor_launch_policy,
    'explicit_binding_required_fail_closed');
  assert.equal(result.mechanism_control_plane.surface_kind, 'opl_agent_lab_mechanism_read_model');
  assert.equal(result.mechanism_control_plane.mechanism_ref, 'mechanism:agent-lab/default-stage-led-agent-mechanism');
  assert.equal(result.mechanism_control_plane.mechanism_promotion_policy.automatic_mechanism_promotion_ready, false);
  assert.equal(result.mechanism_control_plane.independent_ai_review_receipt.review_context_inherits_executor_context,
    false);
  assert.equal(result.optimizer_loop.rl_boundary.can_emit_transition_refs, true);
  assert.equal(result.optimizer_loop.rl_boundary.can_train_or_deploy_model_weights, false);
  assert.equal(result.authority_boundary.can_promote_default_agent_without_gate, false);
});

test('Agent Lab workbench read model is ready for App consumption without taking domain authority', () => {
  const result = buildAgentLabWorkbenchReadModel();

  assert.equal(result.surface_kind, 'opl_agent_lab_workbench_read_model');
  assert.equal(result.status, 'ready_for_app_workbench_consumption');
  assert.equal(result.app_workbench_consumption_ready, true);
  assert.equal(result.observability_export_readiness.ready_to_export_observability_refs, true);
  assert.equal(result.observability_export_readiness.upload_external_service, false);
  assert.equal(result.observability_export_readiness.reads_domain_body, false);
  assert.equal(result.mechanism.surface_kind, 'opl_agent_lab_mechanism_read_model');
  assert.equal(result.mechanism.refs_only, true);
  assert.equal(result.mechanism.mechanism_promotion_policy.automatic_mechanism_promotion_ready, false);
  assert.equal(result.mechanism.mechanism_version_ledger.current_version, result.mechanism.mechanism_version);
  assert.match(result.mechanism.rollback.rollback_target_ref, /^mechanism-version-ref:/);
  assert.equal(result.integration_contracts.surface_kind, 'opl_agent_lab_integration_contract_read_model');
  assert.equal(result.review_trace_ledger.surface_kind, 'opl_agent_lab_review_trace_ledger');
  assert.equal(result.log_driven_mechanism_candidates.summary.candidate_count, 4);
  assert.equal(result.source_results.integration_contract_read_model_ref, result.integration_contracts.read_model_id);
  assert.equal(result.source_results.review_trace_ledger_ref, result.review_trace_ledger.ledger_ref);
  assert.equal(result.source_results.log_driven_mechanism_candidate_read_model_ref,
    result.log_driven_mechanism_candidates.read_model_id);
  assert.equal(result.source_results.aris_maturity_controls_ref, result.aris_maturity_controls.read_model_id);
  assert.equal(result.source_results.ahe_evidence_read_model_ref, result.ahe_evidence.read_model_id);
  assert.equal(result.source_results.executor_capability_aperture_ref,
    result.executor_capability_aperture.read_model_id);
  assert.equal(result.source_results.codex_attempt_trace_flywheel_ref,
    result.codex_attempt_trace_flywheel.read_model_id);
  assert.equal(result.source_results.variant_comparison_read_model_ref, result.variant_comparison.read_model_id);
  assert.equal(result.source_results.stage_executor_policy_read_model_ref,
    result.stage_executor_policy.read_model_id);
  assert.deepEqual(result.source_results.token_cost_estimate_refs,
    result.token_cost_estimates.map((estimate: any) => estimate.estimate_id));
  assert.equal(result.aris_maturity_controls.summary.effort_level_count, 4);
  assert.equal(result.aris_maturity_controls.summary.assurance_level_count, 4);
  assert.equal(result.ahe_evidence.surface_kind, 'opl_agent_lab_ahe_evidence_read_model');
  assert.equal(result.ahe_evidence.summary.promotion_authorized_count, 0);
  assert.equal(result.executor_capability_aperture.surface_kind,
    'opl_agent_lab_executor_capability_lease_read_model');
  assert.equal(result.executor_capability_aperture.lease_kind, 'executor_capability_lease');
  assert.equal(result.executor_capability_aperture.read_model_role,
    'runtime_issued_executor_capability_lease');
  assert.equal(result.executor_capability_aperture.summary.expected_receipt_ref_count, 3);
  assert.equal(result.executor_capability_aperture.authority_boundary.can_execute_non_default_executor, false);
  assert.equal(result.executor_capability_aperture.authority_boundary.can_claim_quality_equivalence, false);
  assert.equal(result.executor_capability_aperture.authority_boundary.can_claim_tool_semantics_equivalence, false);
  assert.equal(result.executor_capability_aperture.authority_boundary.can_claim_resume_equivalence, false);
  assert.equal(result.executor_capability_aperture.authority_boundary.can_mutate_artifact_body, false);
  assert.equal(result.codex_attempt_trace_flywheel.surface_kind,
    'opl_agent_lab_codex_attempt_trace_flywheel');
  assert.equal(result.codex_attempt_trace_flywheel.summary.trace_ready_count, 3);
  assert.equal(result.codex_attempt_trace_bundle.surface_kind, 'opl_agent_lab_codex_attempt_trace_bundle');
  assert.equal(result.replay_fork_variant_cockpit.surface_kind, 'opl_agent_lab_replay_fork_variant_cockpit');
  assert.equal(result.source_results.codex_attempt_trace_bundle_ref,
    result.codex_attempt_trace_bundle.bundle_id);
  assert.equal(result.source_results.replay_fork_variant_cockpit_ref,
    result.replay_fork_variant_cockpit.cockpit_id);
  assert.equal(result.codex_attempt_trace_flywheel.promotion_eligibility.flywheel_can_authorize_domain_ready, false);
  assert.equal(result.codex_attempt_trace_flywheel.promotion_eligibility.flywheel_can_authorize_quality_verdict,
    false);
  assert.equal(result.codex_attempt_trace_flywheel.promotion_eligibility.flywheel_can_promote_default_agent, false);
  assert.equal(result.codex_attempt_trace_flywheel.promotion_eligibility.flywheel_can_train_or_deploy_model_weights,
    false);
  assert.equal(result.codex_attempt_trace_flywheel.promotion_eligibility.flywheel_can_mutate_artifact_body, false);
  assert.equal(result.variant_comparison.surface_kind, 'opl_agent_lab_variant_comparison_read_model');
  assert.equal(result.variant_comparison.summary.variant_count, 3);
  assert.equal(result.variant_comparison.promotion_eligibility.unselected_variants_can_authorize_domain_ready, false);
  assert.equal(result.stage_executor_policy.surface_kind, 'opl_agent_lab_stage_executor_policy_read_model');
  assert.equal(result.stage_executor_policy.default_executor_kind, 'codex_cli');
  assert.equal(result.stage_executor_policy.authority_boundary.can_execute_non_default_executor, false);
  assert.equal(result.token_cost_estimates.length, 1);
  assert.equal(result.token_cost_estimates[0].totals.estimated_cost_per_slide_usd, 0.971);
  assert.equal(result.token_cost_estimates[0].calibration.calibration_status,
    'estimated_from_stage_profile_without_provider_usage_receipt');
  assert.equal(result.optimizer_candidates.length, 6);
  assert.equal(result.promotion_gates.length, 6);
  assert.equal(result.developer_mode_repair_routes.status, 'ready_for_developer_mode_patrol_consumption');
  assert.equal(result.developer_mode_repair_routes.summary.route_count, 2);
  assert.equal(result.online_learning_refs.transitions.length, 6);
  assert.equal(result.online_learning_refs.can_train_or_deploy_model_weights, false);
  assert.equal(result.online_learning_refs.can_promote_default_agent_without_gate, false);
  assert.equal(result.authority_boundary.can_authorize_quality_verdict, false);
});

test('Agent Lab stage executor policy read model supports controlled non-default executor trials', () => {
  const result = buildAgentLabStageExecutorPolicyReadModel(['suite:rca-html-policy-smoke']);

  assert.equal(result.surface_kind, 'opl_agent_lab_stage_executor_policy_read_model');
  assert.equal(result.status, 'ready_for_refs_only_stage_executor_policy_optimization');
  assert.equal(result.default_executor_kind, 'codex_cli');
  assert.deepEqual(result.canonical_non_default_executor_kinds, [
    'hermes_agent',
    'claude_code',
    'antigravity_cli',
  ]);
  assert.equal(result.candidate_count, 3);
  assert.equal(result.trial_ready_candidate_count, 1);
  assert.equal(result.blocked_candidate_count, 1);

  const antigravity = result.policy_candidates.find((candidate: any) =>
    candidate.executor_policy.executor_kind === 'antigravity_cli');
  assert.ok(antigravity);
  assert.equal(antigravity.stage_pattern_ref, 'stage-pattern:rca-html-visual-deliverable-build');
  assert.equal(antigravity.executor_policy.model, 'gemini-3.5-flash');
  assert.equal(antigravity.executor_policy.reasoning_effort, 'high');
  assert.equal(antigravity.executor_policy.executor_binding_ref,
    'executor-binding:antigravity/rca-html-route');
  assert.equal(antigravity.can_launch_without_binding, false);
  assert.equal(antigravity.can_claim_quality_equivalence, false);
  assert.ok(antigravity.required_test_refs.includes(
    'test-ref:agent-lab/stage-executor-policy/rca-html-render-probe',
  ));

  assert.equal(result.test_matrix.baseline_executor_kind, 'codex_cli');
  assert.equal(result.test_matrix.non_default_executor_launch_policy,
    'explicit_binding_required_fail_closed');
  assert.equal(result.test_matrix.quality_equivalence_policy,
    'never_claim_equivalence_from_connectivity_or_speed');
  assert.equal(result.recommended_trials.length, 1);
  assert.equal(result.recommended_trials[0].executor_kind, 'antigravity_cli');
  assert.equal(result.recommended_trials[0].can_start_as_default, false);
  assert.equal(result.typed_blockers[0].blocker_kind, 'non_default_executor_binding_ref_missing');
  assert.equal(result.typed_blockers[0].fallback_allowed, false);
  assert.equal(result.authority_boundary.can_execute_non_default_executor, false);
  assert.equal(result.authority_boundary.can_change_default_executor, false);
  assert.equal(result.authority_boundary.can_claim_quality_equivalence, false);
});

test('Agent Lab Developer Mode repair route projects patrol fixes as refs only', () => {
  const result = buildDeveloperModeAgentLabRepairRouteReadModel();

  assert.equal(result.surface_kind, 'opl_agent_lab_developer_mode_repair_route_read_model');
  assert.equal(result.status, 'ready_for_developer_mode_patrol_consumption');
  assert.equal(result.developer_mode_required, true);
  assert.equal(result.refs_only, true);
  assert.deepEqual(result.patrol_projection.route_outputs, [
    'issue_ref',
    'blocker_ref',
    'owner_route_ref',
    'candidate_fix_ref',
    'repo_worktree_ref',
    'branch_ref',
    'pr_ref',
    'acceptance_evidence_ref',
    'follow_up_queue_item_ref',
  ]);
  assert.equal(result.summary.route_count, 2);
  assert.equal(result.summary.direct_owner_route_count, 1);
  assert.equal(result.summary.fork_pr_route_count, 1);
  assert.equal(result.summary.live_closeout_drill_count, 2);
  assert.equal(result.summary.live_closeout_ready_count, 1);
  assert.equal(result.summary.follow_up_queue_item_ref_count, 2);
  assert.equal(result.route_policy.owner_acceptance_ref,
    'external_owner_ref_only_fixture_refs_do_not_close_owner_acceptance');
  assert.equal(result.live_closeout_evidence.surface_kind,
    'opl_agent_lab_developer_mode_live_closeout_evidence_read_model');
  assert.equal(result.live_closeout_evidence.status, 'closeout_refs_incomplete');
  assert.equal(result.live_closeout_evidence.refs_only, true);
  assert.equal(result.live_closeout_evidence.summary.direct_fix_drill_count, 1);
  assert.equal(result.live_closeout_evidence.summary.fork_pr_drill_count, 1);
  assert.equal(result.live_closeout_evidence.summary.live_external_owner_acceptance_count, 0);
  assert.equal(result.live_closeout_evidence.summary.repo_contract_fixture_drill_count, 1);
  assert.equal(result.live_closeout_evidence.summary.repo_contract_fixture_not_live_repo_count, 1);
  assert.equal(result.live_closeout_evidence.summary.external_owner_acceptance_missing_count, 1);
  assert.equal(result.live_closeout_evidence.summary.fixture_drill_owner_acceptance_open_count, 1);
  assert.equal(result.live_closeout_evidence.summary.external_owner_closeout_refs_ready_count, 1);
  assert.equal(result.live_closeout_evidence.summary.forbidden_owner_receipt_write_count, 0);
  assert.ok(result.live_closeout_evidence.required_closeout_ref_groups.includes('route_eligibility'));
  assert.ok(result.live_closeout_evidence.required_closeout_ref_groups.includes('patrol_observation_ref'));
  assert.ok(result.live_closeout_evidence.required_closeout_ref_groups.includes('diff_ref'));
  assert.ok(result.live_closeout_evidence.required_closeout_ref_groups.includes('verification_refs'));
  assert.ok(result.live_closeout_evidence.required_closeout_ref_groups.includes('no_forbidden_write_ref'));
  assert.ok(result.live_closeout_evidence.required_closeout_ref_groups.includes('commit_ref_or_fork_pr_refs'));
  assert.ok(result.live_closeout_evidence.required_closeout_ref_groups.includes(
    'external_owner_acceptance_ref',
  ));

  for (const route of result.routes) {
    assert.match(route.issue_ref, /^issue-ref:/);
    assert.match(route.blocker_ref, /^blocker-ref:/);
    assert.match(route.owner_route_ref, /^owner-route:/);
    assert.match(route.candidate_fix_ref, /^candidate-fix-ref:/);
    assert.match(route.repo_worktree_ref, /^repo-worktree-ref:/);
    assert.match(route.branch_ref, /^git-branch-ref:/);
    assert.match(route.pr_ref, /^github-pr-ref:/);
    assert.match(route.acceptance_evidence_ref, /^acceptance-evidence-ref:/);
    assert.match(route.follow_up_queue_item_ref, /^queue-item-ref:/);
    assert.equal(route.authority_boundary.writes_domain_truth, false);
    assert.equal(route.authority_boundary.writes_domain_artifact, false);
    assert.equal(route.authority_boundary.writes_memory_body, false);
    assert.equal(route.authority_boundary.writes_quality_verdict, false);
    assert.equal(route.authority_boundary.writes_owner_receipt, false);
    assert.equal(route.authority_boundary.modifies_managed_runtime, false);
  }

  const directRoute = result.routes.find((route) => route.route_mode === 'repo_developer_direct_fix');
  const forkRoute = result.routes.find((route) => route.route_mode === 'fork_pull_request');
  assert.ok(directRoute);
  assert.ok(forkRoute);
  assert.equal(directRoute.repo_developer_match_required, true);
  assert.equal(forkRoute.repo_developer_match_required, false);

  const directDrill = result.live_closeout_evidence.drills.find((drill: any) =>
    drill.route_decision === 'direct-fix');
  const forkPrDrill = result.live_closeout_evidence.drills.find((drill: any) =>
    drill.route_decision === 'fork-PR');
  assert.ok(directDrill);
  assert.ok(forkPrDrill);
  assert.equal(directDrill.route_status, 'closeout_refs_ready');
  assert.equal(directDrill.closeout_claim_status, 'external_owner_closeout_refs_ready');
  assert.equal(directDrill.closeout_refs.route_eligibility, 'eligible_direct_fix');
  assertStringRef(directDrill.closeout_refs.patrol_observation_ref, /^patrol-observation-ref:/);
  assertStringRef(directDrill.closeout_refs.diff_ref, /^diff-ref:/);
  assert.ok(directDrill.closeout_refs.verification_refs.every((ref: string) =>
    ref.startsWith('test-result-ref:')));
  assertStringRef(directDrill.closeout_refs.no_forbidden_write_ref, /^no-forbidden-write-ref:/);
  assertStringRef(directDrill.closeout_refs.commit_ref, /^git-commit-ref:/);
  assert.equal(directDrill.closeout_refs.fork_repo_ref, null);
  assert.equal(directDrill.closeout_refs.pr_review_ref, null);
  assertStringRef(directDrill.closeout_refs.owner_acceptance_ref, /^external-owner-ref:/);
  assert.equal(directDrill.closeout_refs.owner_acceptance_ref_kind, 'live_external_owner_ref');
  assert.equal(directDrill.closeout_refs.owner_acceptance_status, 'external_owner_acceptance_observed');
  assert.equal(directDrill.closeout_refs.owner_acceptance_is_owner_receipt, false);
  assert.equal(directDrill.closeout_refs.evidence_source, 'live_external_owner_evidence');
  assert.equal(forkPrDrill.route_status, 'closeout_refs_incomplete');
  assert.equal(forkPrDrill.closeout_claim_status, 'fixture_drill_owner_acceptance_open');
  assert.equal(forkPrDrill.closeout_refs.route_eligibility, 'eligible_fork_pr');
  assertStringRef(forkPrDrill.closeout_refs.patrol_observation_ref, /^patrol-observation-ref:/);
  assertStringRef(forkPrDrill.closeout_refs.diff_ref, /^diff-ref:/);
  assert.ok(forkPrDrill.closeout_refs.verification_refs.every((ref: string) =>
    ref.startsWith('test-result-ref:')));
  assertStringRef(forkPrDrill.closeout_refs.no_forbidden_write_ref, /^no-forbidden-write-ref:/);
  assert.equal(forkPrDrill.closeout_refs.commit_ref, null);
  assertStringRef(forkPrDrill.closeout_refs.fork_repo_ref, /^repo-contract-fixture-ref:/);
  assertStringRef(forkPrDrill.closeout_refs.pr_review_ref, /^repo-contract-fixture-ref:/);
  assertStringRef(forkPrDrill.closeout_refs.owner_acceptance_ref, /^repo-contract-fixture-ref:/);
  assert.equal(forkPrDrill.closeout_refs.owner_acceptance_ref_kind,
    'repo_contract_fixture_not_owner_receipt');
  assert.equal(forkPrDrill.closeout_refs.owner_acceptance_status, 'fixture_drill_not_owner_acceptance');
  assert.equal(forkPrDrill.closeout_refs.owner_acceptance_is_owner_receipt, false);
  assert.equal(forkPrDrill.closeout_refs.evidence_source, 'repo_contract_test_fixture');
  assert.equal(forkPrDrill.fixture_repo_currentness.status, 'repo_contract_fixture_not_live_repo');
  assert.equal(
    forkPrDrill.fixture_repo_currentness.reason,
    'fixture_repo_ref_requires_real_external_fork_pr_before_closeout',
  );
  assert.equal(forkPrDrill.repo_permission.repo, 'fixture:redcube-ai/fork-pr-drill');
  assert.equal(forkPrDrill.closeout_refs.owner_acceptance_ref_is_external_owner_ref, false);
  assert.ok(forkPrDrill.missing_closeout_refs.includes('external_owner_acceptance_ref'));
  assert.equal(result.live_closeout_evidence.non_authority_outputs.writes_owner_receipt, false);
  assert.equal(result.live_closeout_evidence.non_authority_outputs.modifies_managed_runtime, false);
  assert.equal(result.non_authority_outputs.writes_domain_truth, false);
  assert.equal(result.non_authority_outputs.writes_domain_artifact, false);
  assert.equal(result.non_authority_outputs.writes_memory_body, false);
  assert.equal(result.non_authority_outputs.writes_quality_verdict, false);
  assert.equal(result.non_authority_outputs.writes_owner_receipt, false);
  assert.equal(result.non_authority_outputs.modifies_managed_runtime, false);
  assert.equal(result.authority_boundary.can_write_domain_truth, false);
  assert.equal(result.authority_boundary.can_write_memory_body, false);
  assert.equal(result.authority_boundary.can_authorize_quality_verdict, false);
  assert.equal(result.authority_boundary.can_write_owner_receipt, false);
  assert.equal(result.authority_boundary.can_modify_managed_runtime, false);
});

test('Agent Lab Developer Mode repair route builder classifies live closeout routes from projection and repo permission', () => {
  const projection = {
    surface_id: 'opl_developer_mode',
    status: 'limited',
    enabled: 'on',
    effective_state: 'active_mixed_routes',
    mode: 'developer_apply_safe',
    config_source: 'test',
    auto_enable_github_login: 'gaofeng21cn',
    allowed_route: 'mixed_direct_and_pr',
    github_identity: {
      status: 'ready',
      login: 'gaofeng21cn',
      source: 'env_fixture',
      reason: null,
    },
    repo_authority: {
      status: 'limited',
      required_repo_count: 2,
      direct_write_repo_count: 1,
      pr_route_repo_count: 1,
      blocked_repo_count: 0,
      repos: [],
    },
  } as any;

  const direct = buildDeveloperModeAgentLabRepairRoute({
    developer_mode_projection: projection,
    repo_permission: {
      target_id: 'med-autoscience',
      repo: 'gaofeng21cn/med-autoscience',
      repo_url: 'https://github.com/gaofeng21cn/med-autoscience.git',
      permission: 'write',
      direct_write_allowed: true,
      allowed_route: 'direct_repo_fix',
      status: 'ready',
    },
    patrol_observation_refs: {
      patrol_observation_ref: 'patrol-observation-ref:mas/live-blocker',
      issue_ref: 'issue-ref:mas/live-blocker',
      blocker_ref: 'blocker-ref:mas/live-blocker',
      diff_ref: 'diff-ref:mas/live-blocker',
      verification_refs: ['test-result-ref:mas/live-blocker'],
      no_forbidden_write_ref: 'no-forbidden-write-ref:mas/live-blocker',
      commit_ref: 'git-commit-ref:mas/live-blocker',
      owner_acceptance_ref: 'external-owner-ref:mas/live-blocker-accepted',
    },
  });

  assert.equal(direct.surface_kind, 'opl_agent_lab_developer_mode_dynamic_repair_route');
  assert.equal(direct.route_decision, 'direct-fix');
  assert.equal(direct.route_status, 'closeout_refs_ready');
  assert.equal(direct.closeout_claim_status, 'external_owner_closeout_refs_ready');
  assert.equal(direct.closeout_refs.developer_mode_projection_ref, direct.developer_mode_projection_ref);
  assert.equal(direct.closeout_refs.route_eligibility, 'eligible_direct_fix');
  assert.equal(direct.closeout_refs.patrol_observation_ref, 'patrol-observation-ref:mas/live-blocker');
  assert.equal(direct.closeout_refs.diff_ref, 'diff-ref:mas/live-blocker');
  assert.deepEqual(direct.closeout_refs.verification_refs, ['test-result-ref:mas/live-blocker']);
  assert.equal(direct.closeout_refs.no_forbidden_write_ref, 'no-forbidden-write-ref:mas/live-blocker');
  assert.equal(direct.closeout_refs.commit_ref, 'git-commit-ref:mas/live-blocker');
  assert.equal(direct.closeout_refs.fork_repo_ref, null);
  assert.equal(direct.closeout_refs.pr_review_ref, null);
  assert.equal(direct.closeout_refs.owner_acceptance_ref, 'external-owner-ref:mas/live-blocker-accepted');
  assert.deepEqual(direct.missing_closeout_refs, []);
  assert.equal(direct.authority_boundary.writes_owner_receipt, false);
  assert.equal(direct.authority_boundary.writes_domain_truth, false);
  assert.equal(direct.authority_boundary.modifies_managed_runtime, false);

  const fork = buildDeveloperModeAgentLabRepairRoute({
    developer_mode_projection: projection,
    repo_permission: {
      target_id: 'redcube-ai',
      repo: 'redcube-ai/redcube-ai',
      repo_url: 'https://github.com/redcube-ai/redcube-ai.git',
      permission: 'read',
      direct_write_allowed: false,
      allowed_route: 'fork_pull_request',
      status: 'limited',
    },
    patrol_observation_refs: {
      patrol_observation_ref: 'patrol-observation-ref:rca/live-blocker',
      diff_ref: 'diff-ref:rca/live-blocker',
      verification_refs: ['test-result-ref:rca/live-blocker'],
      no_forbidden_write_ref: 'no-forbidden-write-ref:rca/live-blocker',
      fork_repo_ref: 'github-fork-ref:developer/redcube-ai',
      pr_review_ref: 'github-pr-review-ref:rca/live-blocker',
      owner_acceptance_ref: 'external-owner-ref:rca/live-blocker-reviewed',
    },
  });

  assert.equal(fork.route_decision, 'fork-PR');
  assert.equal(fork.route_status, 'closeout_refs_ready');
  assert.equal(fork.closeout_claim_status, 'external_owner_closeout_refs_ready');
  assert.equal(fork.closeout_refs.route_eligibility, 'eligible_fork_pr');
  assert.equal(fork.closeout_refs.commit_ref, null);
  assert.equal(fork.closeout_refs.fork_repo_ref, 'github-fork-ref:developer/redcube-ai');
  assert.equal(fork.closeout_refs.pr_review_ref, 'github-pr-review-ref:rca/live-blocker');
  assert.deepEqual(fork.missing_closeout_refs, []);

  const observeOnly = buildDeveloperModeAgentLabRepairRoute({
    developer_mode_projection: {
      ...projection,
      status: 'ready',
      effective_state: 'observe_only',
      mode: 'external_observe',
      allowed_route: 'observe_only',
    },
    repo_permission: {
      target_id: 'med-autogrant',
      repo: 'gaofeng21cn/med-autogrant',
      permission: 'write',
      direct_write_allowed: true,
      allowed_route: 'direct_repo_fix',
      status: 'ready',
    },
    patrol_observation_refs: ['patrol-observation-ref:mag/observe-only'],
  });

  assert.equal(observeOnly.route_decision, 'observe-only');
  assert.equal(observeOnly.route_status, 'closeout_refs_incomplete');
  assert.equal(observeOnly.closeout_claim_status, 'external_owner_acceptance_missing');
  assert.equal(observeOnly.closeout_refs.route_eligibility, 'eligible_observe_only');
  assert.ok(observeOnly.missing_closeout_refs.includes('diff_ref'));
  assert.ok(observeOnly.missing_closeout_refs.includes('external_owner_acceptance_ref'));

  const blocked = buildDeveloperModeAgentLabRepairRoute({
    developer_mode_projection: {
      ...projection,
      status: 'blocked',
      effective_state: 'blocked',
      allowed_route: 'blocked',
    },
    repo_permission: {
      target_id: 'med-autogrant',
      repo: 'gaofeng21cn/med-autogrant',
      permission: null,
      direct_write_allowed: false,
      allowed_route: 'blocked',
      status: 'blocked',
    },
    patrol_observation_refs: ['patrol-observation-ref:mag/blocked'],
  });

  assert.equal(blocked.route_decision, 'blocked');
  assert.equal(blocked.route_status, 'blocked');
  assert.equal(blocked.closeout_claim_status, 'blocked');
  assert.equal(blocked.closeout_refs.route_eligibility, 'blocked_developer_mode_projection');

  const mixed = buildDeveloperModeAgentLabRepairRoute({
    developer_mode_projection: projection,
    repo_permission: projection.repo_authority,
    patrol_observation_refs: ['patrol-observation-ref:family/mixed'],
  });

  assert.equal(mixed.route_decision, 'mixed');
  assert.equal(mixed.route_status, 'closeout_refs_ready');
  assert.equal(mixed.closeout_claim_status, 'route_eligibility_only_not_route_closeout');
  assert.equal(mixed.closeout_refs.route_eligibility, 'eligible_mixed_routes');

  const invalidOwnerAcceptance = buildDeveloperModeAgentLabRepairRoute({
    developer_mode_projection: projection,
    repo_permission: {
      target_id: 'med-autoscience',
      repo: 'gaofeng21cn/med-autoscience',
      permission: 'write',
      direct_write_allowed: true,
      allowed_route: 'direct_repo_fix',
      status: 'ready',
    },
    patrol_observation_refs: {
      patrol_observation_ref: 'patrol-observation-ref:mas/invalid-owner-receipt',
      diff_ref: 'diff-ref:mas/invalid-owner-receipt',
      verification_refs: ['test-result-ref:mas/invalid-owner-receipt'],
      no_forbidden_write_ref: 'no-forbidden-write-ref:mas/invalid-owner-receipt',
      commit_ref: 'git-commit-ref:mas/invalid-owner-receipt',
      owner_acceptance_ref: 'owner-receipt-ref:mas/forbidden-opl-written',
    },
  });

  assert.equal(invalidOwnerAcceptance.route_decision, 'blocked');
  assert.equal(invalidOwnerAcceptance.route_status, 'blocked');
  assert.equal(invalidOwnerAcceptance.closeout_claim_status, 'blocked');
  assert.equal(invalidOwnerAcceptance.closeout_refs.route_eligibility,
    'blocked_owner_acceptance_ref_must_be_external_owner_ref');
  assert.equal(invalidOwnerAcceptance.closeout_refs.owner_acceptance_ref, null);
  assert.ok(invalidOwnerAcceptance.missing_closeout_refs.includes('external_owner_acceptance_ref'));
});

test('Agent Lab mechanism read model makes mechanism editable surfaces first-class without write authority', () => {
  const result = buildAgentLabMechanismReadModel();

  assert.equal(result.surface_kind, 'opl_agent_lab_mechanism_read_model');
  assert.equal(result.version, 'opl-agent-lab-mechanism.v1');
  assert.equal(result.mechanism_ref, 'mechanism:agent-lab/default-stage-led-agent-mechanism');
  assert.equal(result.mechanism_version, 'opl-agent-lab-mechanism.v1');
  assert.equal(result.status, 'review_pending');
  assert.equal(result.editable_surfaces.length, 4);
  assert.ok(result.editable_surfaces.some((surface) => surface.surface_kind === 'stage_policy_ref'));
  assert.equal(result.mechanism_promotion_policy.automatic_mechanism_promotion_ready, false);
  assert.equal(result.mechanism_promotion_policy.risk_tiers.low_risk.auto_promotion, 'auto_promote_to_stable');
  assert.equal(result.mechanism_promotion_policy.risk_tiers.medium_risk.auto_promotion, 'auto_promote_to_canary');
  assert.equal(result.mechanism_promotion_policy.risk_tiers.high_risk.auto_promotion,
    'blocked_route_owner_or_human_gate');
  assert.ok(result.mechanism_promotion_policy.required_gate_refs.includes(
    result.independent_ai_review_receipt.receipt_ref,
  ));
  assert.equal(result.independent_ai_review_receipt.receipt_kind, 'independent_ai_review_receipt_ref');
  assert.equal(result.independent_ai_review_receipt.receipt_source, 'generated_fixture');
  assert.equal(result.independent_ai_review_receipt.review_context_inherits_executor_context, false);
  assert.equal(result.independent_ai_review_assessment.review_status, 'review_pending');
  assert.equal(result.independent_ai_review_assessment.ai_review_approved, false);
  assert.ok(result.independent_ai_review_assessment.missing_required_fields.includes('reviewer_ref'));
  assert.equal(result.mechanism_version_ledger.current_version, result.mechanism_version);
  assert.equal(result.mechanism_version_ledger.versions.length, 2);
  assert.equal(result.integration_contracts.summary.contract_count, 3);
  assert.equal(result.review_trace_ledger.summary.trace_count, 3);
  assert.equal(result.review_trace_ledger.summary.independent_no_shared_context_count, 2);
  assert.equal(result.log_driven_mechanism_candidates.summary.candidate_count, 4);
  assert.equal(result.aris_maturity_controls.summary.control_count, 4);
  assert.equal(result.aris_maturity_controls.runtime_dependency_required, false);
  assert.equal(result.next_mechanism_candidate.log_mined_candidate_refs.length, 4);
  assert.equal(result.next_mechanism_candidate.maturity_control_refs.length, 4);
  assert.equal(result.next_mechanism_candidate.review_trace_ledger_ref, result.review_trace_ledger.ledger_ref);
  assert.match(result.rollback.rollback_target_ref, /^mechanism-version-ref:/);
  assert.equal(result.meta_edit_receipt.receipt_kind, 'mechanism_meta_edit_receipt_ref');
  assert.equal(result.meta_edit_receipt.writes_domain_truth, false);
  assert.equal(result.meta_edit_receipt.writes_memory_body, false);
  assert.equal(result.meta_edit_receipt.mutates_artifact, false);
  assert.equal(result.meta_edit_receipt.trains_or_deploys_model_weights, false);
  assert.equal(result.meta_edit_receipt.promotes_default_agent, false);
  assert.equal(result.evolution_segment.segment_kind, 'mechanism_baseline_segment_ref');
  assert.equal(result.evidence_delta.domain_truth_delta_written, false);
  assert.equal(result.evidence_delta.memory_body_delta_written, false);
  assert.equal(result.evidence_delta.artifact_delta_written, false);
  assert.equal(result.next_mechanism_candidate.risk_tier, 'medium_risk');
  assert.equal(result.next_mechanism_candidate.default_promotion, false);
  assert.equal(result.next_mechanism_candidate.candidate_status, 'review_pending');
  assert.equal(result.next_mechanism_candidate.promotion_decision, 'blocked_from_auto_promotion');
  assert.match(result.next_mechanism_candidate.promotion_receipt_ref, /^mechanism-promotion-receipt:/);
  assert.match(result.next_mechanism_candidate.rollback_target_ref, /^mechanism-version-ref:/);
  assert.equal(result.refs_only, true);
  assert.equal(result.authority_boundary.can_write_domain_truth, false);
});

test('Agent Lab evolution result emits versioned auto-promotion decisions without domain truth, memory, artifact, or weight writes', () => {
  const result = buildAgentLabEvolutionResult(buildSampleAgentLabSuite());

  assert.equal(result.surface_kind, 'opl_agent_lab_evolution_result');
  assert.equal(result.status, 'blocked_from_auto_promotion');
  assert.equal(result.mechanism_ref, 'mechanism:agent-lab/default-stage-led-agent-mechanism');
  assert.equal(result.mechanism_version, 'opl-agent-lab-mechanism.v1');
  assert.equal(result.editable_surfaces.length, 4);
  assert.equal(result.integration_contracts.surface_kind, 'opl_agent_lab_integration_contract_read_model');
  assert.equal(result.review_trace_ledger.surface_kind, 'opl_agent_lab_review_trace_ledger');
  assert.equal(result.log_driven_mechanism_candidates.surface_kind,
    'opl_agent_lab_log_driven_mechanism_candidate_read_model');
  assert.equal(result.aris_maturity_controls.surface_kind, 'opl_agent_lab_aris_maturity_controls_read_model');
  assert.equal(result.ahe_evidence.surface_kind, 'opl_agent_lab_ahe_evidence_read_model');
  assert.equal(result.variant_comparison.surface_kind, 'opl_agent_lab_variant_comparison_read_model');
  assert.equal(result.log_mined_candidate_refs.length, 4);
  assert.equal(result.mechanism_promotion_decision.automatic_mechanism_promotion_ready, false);
  assert.equal(result.mechanism_promotion_decision.promotion_decision, 'blocked_from_auto_promotion');
  assert.equal(result.mechanism_promotion_decision.independent_ai_review_assessment.review_status,
    'review_pending');
  assert.equal(result.mechanism_promotion_decision.risk_tier, 'medium_risk');
  assert.equal(result.mechanism_promotion_decision.canary.required, true);
  assert.match(result.mechanism_promotion_decision.rollback_target_ref, /^mechanism-version-ref:/);
  assert.equal(result.independent_ai_review_receipt.receipt_source, 'generated_fixture');
  assert.equal(result.independent_ai_review_assessment.ai_review_approved, false);
  assert.equal(result.independent_ai_review_receipt.review_context_inherits_executor_context, false);
  assert.match(result.promotion_receipt.receipt_ref, /^mechanism-promotion-receipt:/);
  assert.equal(result.promotion_receipt.promoted_to_status, 'blocked');
  assert.equal(result.meta_edit_receipt.writes_domain_truth, false);
  assert.equal(result.meta_edit_receipt.writes_memory_body, false);
  assert.equal(result.meta_edit_receipt.mutates_artifact, false);
  assert.equal(result.evolution_segment.segment_kind, 'mechanism_suite_evolution_segment_ref');
  assert.equal(result.evidence_delta.suite_status, 'passed');
  assert.equal(result.evidence_delta.blocked_evidence_refs.length, 0);
  assert.equal(result.evidence_delta.domain_truth_delta_written, false);
  assert.equal(result.evidence_delta.memory_body_delta_written, false);
  assert.equal(result.evidence_delta.artifact_delta_written, false);
  assert.equal(result.next_mechanism_candidate.source_candidate_refs.length, 3);
  assert.equal(result.next_mechanism_candidate.source_transition_refs.length, 3);
  assert.equal(result.next_mechanism_candidate.source_log_mined_candidate_refs.length, 4);
  assert.equal(result.next_mechanism_candidate.source_variant_candidate_refs.length, 3);
  assert.equal(result.next_mechanism_candidate.selected_variant_candidate_ref,
    result.variant_comparison.selected_candidate_ref);
  assert.equal(result.next_mechanism_candidate.source_maturity_control_refs.length, 4);
  assert.equal(result.next_mechanism_candidate.review_trace_ledger_ref, result.review_trace_ledger.ledger_ref);
  assert.equal(result.next_mechanism_candidate.default_promotion, false);
  assert.equal(result.next_mechanism_candidate.promotion_decision, 'blocked_from_auto_promotion');
  assert.equal(result.automatic_model_training_ready, false);
  assert.equal(result.automatic_mechanism_promotion_ready, false);
  assert.equal(result.automatic_default_agent_promotion_ready, 'risk_tiered_after_independent_ai_review');
  assert.equal(result.refs_only, true);
  assert.equal(result.authority_boundary.can_train_or_deploy_model_weights, false);
});

test('Agent Lab export envelope maps refs to connector payloads without uploading or reading domain bodies', () => {
  const inspect = buildAgentLabExportEnvelope('inspect-ai');
  const openinference = buildAgentLabExportEnvelope('openinference');
  const langfuse = buildAgentLabExportEnvelope('langfuse');
  const phoenix = buildAgentLabExportEnvelope('phoenix');
  const json = buildAgentLabExportEnvelope('json');

  assert.equal(inspect.surface_kind, 'opl_agent_lab_export_envelope');
  assert.equal(inspect.target, 'inspect-ai');
  assert.equal(inspect.upload_external_service, false);
  assert.equal(inspect.reads_domain_body, false);
  assert.equal((inspect.connector_payload as any).tasks.length, 6);
  assert.equal((openinference.connector_payload as any).traces.length, 6);
  assert.ok((openinference.connector_payload as any).traces.some((trace: any) =>
    trace.trace_ref === 'trace-ref:codex/mag-grant-section-smoke'));
  assert.equal((langfuse.connector_payload as any).datasets.length, 2);
  assert.equal((phoenix.connector_payload as any).experiments.length, 2);
  assert.equal((json.connector_payload as any).suite_results.length, 2);
  assert.equal(inspect.source_refs.integration_contract_refs.length, 3);
  assert.equal(inspect.source_refs.review_trace_refs.length, 3);
  assert.equal(inspect.source_refs.log_mined_candidate_refs.length, 4);
  assert.equal(inspect.source_refs.aris_maturity_control_refs.length, 4);
  assert.ok(inspect.source_refs.review_evidence_refs.includes('evidence-ref:agent-lab/no-forbidden-write-proof'));
  assert.equal(inspect.authority_boundary.can_authorize_export_verdict, false);
});

test('Agent Lab optimize returns gated candidate and RL transition refs without training or default promotion', () => {
  const result = buildAgentLabOptimizeResult(buildSampleAgentLabSuite());

  assert.equal(result.surface_kind, 'opl_agent_lab_optimize_result');
  assert.equal(result.ahe_evidence.surface_kind, 'opl_agent_lab_ahe_evidence_read_model');
  assert.equal(result.variant_comparison.surface_kind, 'opl_agent_lab_variant_comparison_read_model');
  assert.equal(result.status, 'review_pending');
  assert.equal(result.suite_result.status, 'passed');
  assert.equal(result.gated_optimizer_candidate_set.candidate_count, 3);
  assert.equal(result.gated_optimizer_candidate_set.promotable_candidate_count, 0);
  assert.equal(result.gated_optimizer_candidate_set.auto_promotable_candidate_count, 0);
  assert.equal(result.gated_optimizer_candidate_set.regression_guard_only_count, 3);
  assert.equal(result.gated_optimizer_candidate_set.ai_review_approved_count, 0);
  assert.ok(result.gated_optimizer_candidate_set.candidates.every((candidate: any) =>
    candidate.independent_ai_review_ref && candidate.rollback_target_ref));
  assert.ok(result.gated_optimizer_candidate_set.candidates.every((candidate: any) =>
    candidate.independent_ai_review_assessment.review_status === 'review_pending'));
  assert.equal(result.log_driven_mechanism_candidates.summary.candidate_count, 4);
  assert.equal(result.log_mined_candidate_refs.length, 4);
  assert.equal(result.rl_transition_refs.transition_count, 3);
  assert.equal(result.automatic_mechanism_promotion_ready, false);
  assert.equal(result.automatic_model_training_ready, false);
  assert.equal(result.automatic_default_agent_promotion_ready, 'risk_tiered_after_independent_ai_review');
  assert.equal(result.authority_boundary.can_promote_default_agent_without_gate, false);
});

test('Agent Lab optimize treats real review without failure-delta safety refs as regression guard only', () => {
  const suite = buildSampleAgentLabSuite();
  const candidateRef = suite.tasks[0].improvement_candidate.candidate_ref;
  suite.tasks[0] = {
    ...suite.tasks[0],
    mechanism_evolution_inputs: {
      ...(suite.tasks[0].mechanism_evolution_inputs ?? {}),
      independent_ai_review_receipt: realIndependentAiReviewReceipt(candidateRef),
    },
  };

  const result = buildAgentLabOptimizeResult(suite);
  const approvedCandidate = result.gated_optimizer_candidate_set.candidates.find((candidate: any) =>
    candidate.candidate_ref === candidateRef);

  assert.equal(result.status, 'review_pending');
  assert.equal(result.gated_optimizer_candidate_set.ai_review_approved_count, 1);
  assert.equal(result.gated_optimizer_candidate_set.auto_promotable_candidate_count, 0);
  assert.equal(result.gated_optimizer_candidate_set.regression_guard_only_count, 3);
  assert.ok(approvedCandidate);
  assert.equal(approvedCandidate.independent_ai_review_assessment.review_status, 'approved');
  assert.equal(approvedCandidate.candidate_status, 'regression_guard_only');
  assert.equal(approvedCandidate.automatic_mechanism_promotion_ready, false);
  assert.equal(approvedCandidate.promotion_decision, 'blocked');
});

test('Agent Lab optimize auto-promotes only when real review and promotion safety refs are complete', () => {
  const suite = buildSampleAgentLabSuite();
  const candidateRef = suite.tasks[1].improvement_candidate.candidate_ref;
  const failureDeltaRef = 'failure-delta:mag/controlled-soak-stage-policy';
  const reviewReceipt = realIndependentAiReviewReceipt(candidateRef, 'medium_risk');
  suite.tasks[1] = {
    ...suite.tasks[1],
    improvement_candidate: {
      ...suite.tasks[1].improvement_candidate,
      evidence_refs: [...suite.tasks[1].improvement_candidate.evidence_refs, failureDeltaRef],
    },
    mechanism_evolution_inputs: {
      ...(suite.tasks[1].mechanism_evolution_inputs ?? {}),
      independent_ai_review_receipt: reviewReceipt,
    },
    promotion_gate: {
      ...suite.tasks[1].promotion_gate,
      failure_delta_refs: [failureDeltaRef],
      independent_ai_review_receipt_refs: [reviewReceipt.receipt_ref],
      promotion_receipt_refs: ['mechanism-promotion-receipt:mag/controlled-soak-stage-policy'],
      rollback_target_refs: ['mechanism-version-ref:mag/controlled-soak-current'],
      canary_observation_refs: ['canary-observation-ref:mag/controlled-soak-stage-policy'],
    },
  };

  const result = buildAgentLabOptimizeResult(suite);
  const approvedCandidate = result.gated_optimizer_candidate_set.candidates.find((candidate: any) =>
    candidate.candidate_ref === candidateRef);

  assert.equal(result.status, 'gated_candidate_set_ready');
  assert.equal(result.gated_optimizer_candidate_set.ai_review_approved_count, 1);
  assert.equal(result.gated_optimizer_candidate_set.auto_promotable_candidate_count, 1);
  assert.equal(result.gated_optimizer_candidate_set.regression_guard_only_count, 2);
  assert.ok(approvedCandidate);
  assert.equal(approvedCandidate.promotion_safety_assessment.safety_status, 'promotion_ready');
  assert.equal(approvedCandidate.promotion_safety_assessment.automatic_mechanism_promotion_ready, true);
  assert.equal(approvedCandidate.automatic_mechanism_promotion_ready, true);
  assert.equal(approvedCandidate.promotion_decision, 'auto_promote_to_canary');
});

test('Agent Lab variant comparison exposes winner-only promotion eligibility and loser learning refs', () => {
  const suite = buildSampleAgentLabSuite();
  const firstCandidateRef = suite.tasks[0].improvement_candidate.candidate_ref;
  const secondCandidateRef = suite.tasks[1].improvement_candidate.candidate_ref;
  const firstFailureDeltaRef = 'failure-delta:mas/variant-prompt-routing';
  const secondFailureDeltaRef = 'failure-delta:mag/variant-stage-policy';
  const firstReviewReceipt = realIndependentAiReviewReceipt(firstCandidateRef, 'low_risk');
  const secondReviewReceipt = realIndependentAiReviewReceipt(secondCandidateRef, 'medium_risk');
  suite.tasks[0] = {
    ...suite.tasks[0],
    improvement_candidate: {
      ...suite.tasks[0].improvement_candidate,
      evidence_refs: [...suite.tasks[0].improvement_candidate.evidence_refs, firstFailureDeltaRef],
    },
    mechanism_evolution_inputs: {
      ...(suite.tasks[0].mechanism_evolution_inputs ?? {}),
      independent_ai_review_receipt: firstReviewReceipt,
    },
    promotion_gate: {
      ...suite.tasks[0].promotion_gate,
      failure_delta_refs: [firstFailureDeltaRef],
      independent_ai_review_receipt_refs: [firstReviewReceipt.receipt_ref],
      promotion_receipt_refs: ['mechanism-promotion-receipt:mas/variant-prompt-routing'],
      rollback_target_refs: ['mechanism-version-ref:mas/variant-prompt-routing-current'],
      canary_observation_refs: ['canary-observation-ref:mas/variant-prompt-routing'],
    },
  };
  suite.tasks[1] = {
    ...suite.tasks[1],
    improvement_candidate: {
      ...suite.tasks[1].improvement_candidate,
      evidence_refs: [...suite.tasks[1].improvement_candidate.evidence_refs, secondFailureDeltaRef],
    },
    mechanism_evolution_inputs: {
      ...(suite.tasks[1].mechanism_evolution_inputs ?? {}),
      independent_ai_review_receipt: secondReviewReceipt,
    },
    promotion_gate: {
      ...suite.tasks[1].promotion_gate,
      failure_delta_refs: [secondFailureDeltaRef],
      independent_ai_review_receipt_refs: [secondReviewReceipt.receipt_ref],
      promotion_receipt_refs: ['mechanism-promotion-receipt:mag/variant-stage-policy'],
      rollback_target_refs: ['mechanism-version-ref:mag/variant-stage-policy-current'],
      canary_observation_refs: ['canary-observation-ref:mag/variant-stage-policy'],
    },
  };

  const suiteResult = buildAgentLabOptimizeResult(suite).suite_result;
  const comparison = buildAgentLabVariantComparisonReadModel({
    suiteResult,
    selectedCandidateRef: secondCandidateRef,
  });
  const winner = comparison.variants.find((variant: any) => variant.candidate_ref === secondCandidateRef);
  const unselectedPromotable = comparison.variants.find((variant: any) =>
    variant.candidate_ref === firstCandidateRef);

  assert.equal(comparison.surface_kind, 'opl_agent_lab_variant_comparison_read_model');
  assert.equal(comparison.selected_candidate_ref, secondCandidateRef);
  assert.deepEqual(comparison.promotion_eligibility.risk_tiered_promotion_gate_candidate_refs, [
    secondCandidateRef,
  ]);
  assert.ok(winner);
  assert.equal(winner.role, 'winner');
  assert.equal(winner.promotion_eligibility.selected_for_risk_tiered_gate, true);
  assert.equal(winner.promotion_eligibility.eligible_for_risk_tiered_promotion_gate, true);
  assert.equal(winner.promotion_eligibility.can_authorize_domain_ready, false);
  assert.equal(winner.promotion_eligibility.can_promote_default_agent, false);
  assert.ok(unselectedPromotable);
  assert.equal(unselectedPromotable.role, 'loser');
  assert.equal(unselectedPromotable.learning_only, true);
  assert.equal(unselectedPromotable.promotion_eligibility.selected_for_risk_tiered_gate, false);
  assert.equal(unselectedPromotable.promotion_eligibility.eligible_for_risk_tiered_promotion_gate, false);
  assert.ok(unselectedPromotable.promotion_eligibility.blocked_reason_refs.includes(
    'blocked-ref:agent-lab/unselected-variant-learning-only',
  ));
  assert.ok(comparison.per_variant_evidence_delta.every((delta: any) =>
    delta.domain_truth_delta_written === false
    && delta.memory_body_delta_written === false
    && delta.artifact_delta_written === false));
  assert.equal(comparison.promotion_eligibility.unselected_variants_can_authorize_domain_ready, false);
  assert.equal(comparison.promotion_eligibility.unselected_variants_can_promote_default_agent, false);
  assert.equal(comparison.promotion_eligibility.selected_winner_required_for_existing_promotion_gate, true);
});
