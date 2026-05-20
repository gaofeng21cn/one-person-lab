import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAgentLabExportEnvelope,
  buildAgentLabEvolutionResult,
  buildAgentLabMechanismReadModel,
  buildAgentLabOptimizeResult,
  buildAgentLabWorkbenchReadModel,
  buildCompleteAgentLabControlPlane,
  buildDeveloperModeAgentLabRepairRoute,
  buildDeveloperModeAgentLabRepairRouteReadModel,
} from '../../src/agent-lab-complete.ts';
import { buildSampleAgentLabSuite } from '../../src/agent-lab.ts';

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
    'collect_usage_and_blocker_event_refs',
    'mine_real_logs_into_mechanism_candidate_refs',
    'optional_web_research_for_mechanism_context',
    'freeze_dataset_or_longline_suite',
    'score_with_domain_owned_scorecard_refs',
    'validate_cross_surface_integration_contracts',
    'select_mechanism_editable_surface_refs',
    'emit_meta_edit_receipt_ref',
    'generate_next_mechanism_candidate_ref',
    'classify_mechanism_change_risk',
    'run_independent_ai_review_without_shared_context',
    'record_review_trace_refs',
    'run_regression_and_recovery_gates',
    'auto_promote_low_and_medium_risk_with_versioned_canary',
    'route_high_risk_to_owner_or_human_gate',
    'record_rollback_target_ref',
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
  assert.equal(result.optimizer_loop.integration_contract_read_model.read_model_id,
    result.integration_contracts.read_model_id);
  assert.equal(result.optimizer_loop.review_trace_ledger.ledger_ref, result.review_trace_ledger.ledger_ref);
  assert.equal(result.optimizer_loop.log_driven_candidate_read_model.read_model_id,
    result.log_driven_mechanism_candidates.read_model_id);
  assert.equal(result.optimizer_loop.aris_maturity_controls.read_model_id,
    result.aris_maturity_controls.read_model_id);
  assert.equal(result.optimizer_loop.mechanism_object.promotion_mode,
    'risk_tiered_auto_promotion_with_independent_ai_review');
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
  assert.equal(result.aris_maturity_controls.summary.effort_level_count, 4);
  assert.equal(result.aris_maturity_controls.summary.assurance_level_count, 4);
  assert.equal(result.optimizer_candidates.length, 6);
  assert.equal(result.promotion_gates.length, 6);
  assert.equal(result.developer_mode_repair_routes.status, 'ready_for_developer_mode_patrol_consumption');
  assert.equal(result.developer_mode_repair_routes.summary.route_count, 2);
  assert.equal(result.online_learning_refs.transitions.length, 6);
  assert.equal(result.online_learning_refs.can_train_or_deploy_model_weights, false);
  assert.equal(result.online_learning_refs.can_promote_default_agent_without_gate, false);
  assert.equal(result.authority_boundary.can_authorize_quality_verdict, false);
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
  assert.equal(result.summary.follow_up_queue_item_ref_count, 2);

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

test('Agent Lab Developer Mode dynamic repair route gates direct, fork, observe, mixed, and blocked closeout', () => {
  const baseProjection = {
    status: 'ready',
    effective_state: 'enabled',
    mode: 'developer_mode',
    surface_id: 'developer-mode-surface:opl/main',
  };
  const basePatrolRefs = {
    patrol_observation_ref: 'patrol-observation-ref:agent-lab/direct-ready',
    diff_ref: 'diff-ref:opl/agent-lab-direct-ready',
    verification_refs: ['test-result-ref:opl/agent-lab-direct-ready'],
    no_forbidden_write_ref: 'no-forbidden-write-ref:opl/agent-lab-direct-ready',
    owner_acceptance_ref: 'external-owner-ref:opl/framework-owner/direct-ready',
  };

  const direct = buildDeveloperModeAgentLabRepairRoute({
    developer_mode_projection: baseProjection,
    repo_permission: {
      target_id: 'repo:one-person-lab',
      repo: 'one-person-lab',
      permission: 'write',
      direct_write_allowed: true,
      allowed_route: 'direct_repo_fix',
    },
    patrol_observation_refs: {
      ...basePatrolRefs,
      commit_ref: 'git-commit-ref:opl/direct-ready',
    },
  });
  assert.equal(direct.surface_kind, 'opl_agent_lab_developer_mode_dynamic_repair_route');
  assert.equal(direct.route_decision, 'direct-fix');
  assert.equal(direct.route_status, 'closeout_refs_ready');
  assert.equal(direct.closeout_refs.route_eligibility, 'eligible_direct_fix');
  assert.equal(direct.closeout_refs.commit_ref, 'git-commit-ref:opl/direct-ready');
  assert.deepEqual(direct.missing_closeout_refs, []);
  assert.equal(direct.authority_boundary.writes_owner_receipt, false);
  assert.equal(direct.authority_boundary.writes_domain_truth, false);

  const fork = buildDeveloperModeAgentLabRepairRoute({
    developer_mode_projection: baseProjection,
    repo_permission: {
      target_id: 'repo:external-agent',
      repo: 'external-agent',
      permission: 'read',
      direct_write_allowed: false,
      allowed_route: 'fork_pull_request',
    },
    patrol_observation_refs: {
      ...basePatrolRefs,
      patrol_observation_ref: 'patrol-observation-ref:agent-lab/fork-ready',
      fork_repo_ref: 'fork-repo-ref:external-agent/operator-fork',
      pr_review_ref: 'pr-review-ref:external-agent/agent-lab-patrol',
    },
  });
  assert.equal(fork.route_decision, 'fork-PR');
  assert.equal(fork.route_status, 'closeout_refs_ready');
  assert.equal(fork.closeout_refs.route_eligibility, 'eligible_fork_pr');
  assert.equal(fork.closeout_refs.fork_repo_ref, 'fork-repo-ref:external-agent/operator-fork');
  assert.equal(fork.closeout_refs.pr_review_ref, 'pr-review-ref:external-agent/agent-lab-patrol');
  assert.deepEqual(fork.missing_closeout_refs, []);

  const observeOnly = buildDeveloperModeAgentLabRepairRoute({
    developer_mode_projection: {
      ...baseProjection,
      effective_state: 'observe_only',
      allowed_route: 'observe_only',
    },
    repo_permission: {
      target_id: 'repo:observe-only-agent',
      repo: 'observe-only-agent',
      permission: 'read',
    },
    patrol_observation_refs: ['patrol-observation-ref:agent-lab/observe-only'],
  });
  assert.equal(observeOnly.route_decision, 'observe-only');
  assert.equal(observeOnly.route_status, 'closeout_refs_incomplete');
  assert.equal(observeOnly.closeout_refs.route_eligibility, 'eligible_observe_only');
  assert.ok(observeOnly.missing_closeout_refs.includes('diff_ref'));
  assert.ok(observeOnly.missing_closeout_refs.includes('external_owner_acceptance_ref'));

  const mixed = buildDeveloperModeAgentLabRepairRoute({
    developer_mode_projection: {
      ...baseProjection,
      allowed_route: 'mixed_direct_and_pr',
    },
    repo_permission: {
      target_id: 'repo:family-agents',
      direct_write_repo_count: 1,
      pr_route_repo_count: 1,
    },
    patrol_observation_refs: basePatrolRefs,
  });
  assert.equal(mixed.route_decision, 'mixed');
  assert.equal(mixed.route_status, 'closeout_refs_ready');
  assert.equal(mixed.closeout_refs.route_eligibility, 'eligible_mixed_routes');

  const blockedProjection = buildDeveloperModeAgentLabRepairRoute({
    developer_mode_projection: {
      ...baseProjection,
      status: 'blocked',
    },
    repo_permission: {
      target_id: 'repo:blocked-agent',
      repo: 'blocked-agent',
      permission: 'write',
    },
    patrol_observation_refs: basePatrolRefs,
  });
  assert.equal(blockedProjection.route_decision, 'blocked');
  assert.equal(blockedProjection.route_status, 'blocked');
  assert.equal(blockedProjection.closeout_refs.route_eligibility, 'blocked_developer_mode_projection');

  const ownerReceiptNotAccepted = buildDeveloperModeAgentLabRepairRoute({
    developer_mode_projection: baseProjection,
    repo_permission: {
      target_id: 'repo:one-person-lab',
      repo: 'one-person-lab',
      permission: 'write',
      direct_write_allowed: true,
    },
    patrol_observation_refs: {
      ...basePatrolRefs,
      owner_acceptance_ref: 'owner-receipt-ref:opl/framework-owner/not-external',
      commit_ref: 'git-commit-ref:opl/not-accepted',
    },
  });
  assert.equal(ownerReceiptNotAccepted.route_decision, 'blocked');
  assert.equal(ownerReceiptNotAccepted.route_status, 'blocked');
  assert.equal(ownerReceiptNotAccepted.closeout_refs.route_eligibility,
    'blocked_owner_acceptance_ref_must_be_external_owner_ref');
  assert.equal(ownerReceiptNotAccepted.closeout_refs.owner_acceptance_ref, null);
  assert.ok(ownerReceiptNotAccepted.missing_closeout_refs.includes('external_owner_acceptance_ref'));
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
  assert.equal((openinference.connector_payload as any).traces.length, 4);
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
