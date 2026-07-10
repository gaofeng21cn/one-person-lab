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
} from '../../src/modules/foundry-lab/agent-lab-complete.ts';
import { buildSampleAgentLabSuite } from '../../src/modules/foundry-lab/agent-lab.ts';

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

function assertBlockedAuthority(boundary: Record<string, unknown>) {
  for (const key of [
    'can_write_domain_truth',
    'can_write_memory_body',
    'can_authorize_domain_ready',
    'can_authorize_quality_verdict',
    'can_write_owner_receipt',
    'can_create_owner_receipt',
    'can_mutate_domain_artifact',
    'can_mutate_artifact_body',
    'can_train_or_deploy_model_weights',
    'can_promote_default_agent',
    'can_promote_default_agent_without_gate',
    'can_execute_non_default_executor',
    'can_change_default_executor',
  ]) {
    if (key in boundary) assert.equal(boundary[key], false, key);
  }
}

test('Agent Lab complete control plane exposes eval adapters, observability exports, and optimizer boundary', () => {
  const result = buildCompleteAgentLabControlPlane();

  assert.equal(result.surface_kind, 'opl_agent_lab_complete_control_plane');
  assert.equal(result.status, 'ready_for_opl_native_use');
  assert.equal(result.readiness.complete_control_plane_ready, true);
  assert.equal(result.readiness.ready_to_connect_inspect_ai_adapter, true);
  assert.equal(result.readiness.ready_to_emit_integration_contracts, true);
  assert.equal(result.readiness.ready_to_emit_review_trace_ledger, true);
  assert.equal(result.readiness.ready_to_emit_log_driven_mechanism_candidates, true);
  assert.equal(result.readiness.ready_to_emit_executor_capability_aperture, true);
  assert.equal(result.readiness.ready_to_emit_codex_attempt_trace_flywheel, true);
  assert.equal(result.readiness.ready_to_emit_stage_executor_policy_read_model, true);
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
  assert.ok(result.optimizer_loop.loop_steps.includes('run_independent_ai_review_without_shared_context'));
  assert.ok(result.optimizer_loop.loop_steps.includes('route_high_risk_to_owner_or_human_gate'));
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
  assert.equal(result.domain_feedback_self_evolution.surface_kind,
    'opl_agent_lab_domain_feedback_self_evolution_read_model');
  assert.equal(result.domain_feedback_self_evolution.status, 'work_order_status_projection_ready');
  assert.equal(result.domain_feedback_self_evolution.summary.queued_count, 0);
  assert.equal(result.domain_feedback_self_evolution.summary.runnable_count, 1);
  assert.equal(result.domain_feedback_self_evolution.summary.completed_or_blocker_count, 0);
  assert.equal(result.domain_feedback_self_evolution.app_projection.creates_runner_or_queue, false);
  assert.equal(result.domain_feedback_self_evolution.authority_boundary.can_write_runtime_db, false);
  assert.equal(result.domain_feedback_self_evolution.authority_boundary.can_create_owner_receipt, false);
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
  assertBlockedAuthority(result.codex_attempt_trace_flywheel.authority_boundary);
  assert.equal(result.optimizer_loop.integration_contract_read_model.read_model_id,
    result.integration_contracts.read_model_id);
  assert.equal(result.optimizer_loop.review_trace_ledger.ledger_ref, result.review_trace_ledger.ledger_ref);
  assert.equal(result.optimizer_loop.executor_capability_aperture.read_model_id,
    result.executor_capability_aperture.read_model_id);
  assert.equal(result.optimizer_loop.codex_attempt_trace_flywheel.read_model_id,
    result.codex_attempt_trace_flywheel.read_model_id);
  assert.equal(result.optimizer_loop.stage_executor_policy_read_model.read_model_id,
    result.stage_executor_policy.read_model_id);
  assert.equal(result.readiness.ready_to_emit_token_cost_estimates, false);
  assert.equal(result.readiness.token_cost_estimate_profile_required, true);
  assert.equal(Object.hasOwn(result, 'token_cost_estimates'), false);
  assert.equal(result.executor_capability_aperture.surface_kind,
    'opl_agent_lab_executor_capability_lease_read_model');
  assert.equal(result.executor_capability_aperture.lease_kind, 'executor_capability_lease');
  assert.equal(result.executor_capability_aperture.read_model_role,
    'runtime_issued_executor_capability_lease');
  assert.equal(result.executor_capability_aperture.summary.codex_cli_task_count, 3);
  assert.equal(result.executor_capability_aperture.summary.non_default_executor_task_count, 0);
  assertBlockedAuthority(result.executor_capability_aperture.authority_boundary);
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
  assertBlockedAuthority(result.authority_boundary);
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
  assert.match(result.mechanism.rollback.rollback_target_ref, /^mechanism-version-ref:/);
  assert.equal(result.integration_contracts.surface_kind, 'opl_agent_lab_integration_contract_read_model');
  assert.equal(result.review_trace_ledger.surface_kind, 'opl_agent_lab_review_trace_ledger');
  assert.equal(result.log_driven_mechanism_candidates.summary.candidate_count, 4);
  assert.equal(result.source_results.integration_contract_read_model_ref, result.integration_contracts.read_model_id);
  assert.equal(result.source_results.review_trace_ledger_ref, result.review_trace_ledger.ledger_ref);
  assert.equal(result.source_results.executor_capability_aperture_ref,
    result.executor_capability_aperture.read_model_id);
  assert.equal(result.source_results.codex_attempt_trace_flywheel_ref,
    result.codex_attempt_trace_flywheel.read_model_id);
  assert.equal(result.source_results.stage_executor_policy_read_model_ref,
    result.stage_executor_policy.read_model_id);
  assert.equal(result.aris_maturity_controls.summary.effort_level_count, 4);
  assert.equal(result.aris_maturity_controls.summary.assurance_level_count, 4);
  assert.equal(result.domain_feedback_self_evolution.summary.work_order_count, 1);
  assert.equal(result.domain_feedback_self_evolution.status_buckets.runnable.length, 1);
  assert.equal(result.domain_feedback_self_evolution.app_projection.action_surface, 'opl work-order execute');
  assertBlockedAuthority(result.domain_feedback_self_evolution.authority_boundary);
  assert.equal(result.ahe_evidence.surface_kind, 'opl_agent_lab_ahe_evidence_read_model');
  assert.equal(result.ahe_evidence.summary.promotion_authorized_count, 0);
  assert.equal(result.executor_capability_aperture.surface_kind,
    'opl_agent_lab_executor_capability_lease_read_model');
  assert.equal(result.executor_capability_aperture.lease_kind, 'executor_capability_lease');
  assert.equal(result.executor_capability_aperture.read_model_role,
    'runtime_issued_executor_capability_lease');
  assert.equal(result.executor_capability_aperture.summary.expected_receipt_ref_count, 3);
  assertBlockedAuthority(result.executor_capability_aperture.authority_boundary);
  assert.equal(result.codex_attempt_trace_flywheel.surface_kind,
    'opl_agent_lab_codex_attempt_trace_flywheel');
  assert.equal(result.codex_attempt_trace_flywheel.summary.trace_ready_count, 3);
  assert.equal(result.codex_attempt_trace_bundle.surface_kind, 'opl_agent_lab_codex_attempt_trace_bundle');
  assert.equal(result.replay_fork_variant_cockpit.surface_kind, 'opl_agent_lab_replay_fork_variant_cockpit');
  assert.equal(result.source_results.codex_attempt_trace_bundle_ref,
    result.codex_attempt_trace_bundle.bundle_id);
  assert.equal(result.source_results.replay_fork_variant_cockpit_ref,
    result.replay_fork_variant_cockpit.cockpit_id);
  assertBlockedAuthority(result.codex_attempt_trace_flywheel.authority_boundary);
  assert.equal(result.variant_comparison.surface_kind, 'opl_agent_lab_variant_comparison_read_model');
  assert.equal(result.variant_comparison.summary.variant_count, 3);
  assert.equal(result.variant_comparison.promotion_eligibility.unselected_variants_can_authorize_domain_ready, false);
  assert.equal(result.stage_executor_policy.surface_kind, 'opl_agent_lab_stage_executor_policy_read_model');
  assert.equal(result.stage_executor_policy.default_executor_kind, 'codex_cli');
  assertBlockedAuthority(result.stage_executor_policy.authority_boundary);
  assert.equal(Object.hasOwn(result, 'token_cost_estimates'), false);
  assert.equal(result.optimizer_candidates.length, 6);
  assert.equal(result.promotion_gates.length, 6);
  assert.equal(result.developer_mode_repair_routes.status, 'ready_for_developer_mode_patrol_consumption');
  assert.equal(result.developer_mode_repair_routes.summary.route_count, 2);
  assert.equal(result.online_learning_refs.transitions.length, 6);
  assert.equal(result.online_learning_refs.can_train_or_deploy_model_weights, false);
  assert.equal(result.online_learning_refs.can_promote_default_agent_without_gate, false);
  assertBlockedAuthority(result.authority_boundary);
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
