import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildSampleAgentLabSuite,
  runAgentLabSuite,
} from '../../src/agent-lab.ts';
import { buildLonglineAgentLabSuite } from '../../src/agent-lab-longline.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

function readJson(relativePath: string) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')) as Record<string, any>;
}

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

function sameAttemptIndependentAiReviewReceipt(candidateRef: string, riskTier = 'medium_risk') {
  return {
    ...realIndependentAiReviewReceipt(candidateRef, riskTier),
    review_attempt_ref: `stage-attempt:executor:${candidateRef}`,
  };
}

test('Agent Lab runs MAS, MAG, and RCA task manifests through recovery, scoring, and promotion gates without domain authority', () => {
  const result = runAgentLabSuite(buildSampleAgentLabSuite());

  assert.equal(result.surface_kind, 'opl_agent_lab_suite_result');
  assert.equal(result.version, 'opl-agent-lab.v1');
  assert.equal(result.status, 'passed');
  assert.equal(result.summary.task_count, 3);
  assert.equal(result.summary.run_count, 3);
  assert.equal(result.summary.passed_run_count, 3);
  assert.equal(result.summary.blocked_run_count, 0);
  assert.equal(result.summary.recovery_probe_count, 5);
  assert.equal(result.summary.recovery_passed_count, 5);
  assert.equal(result.summary.scorecard_passed_count, 3);
  assert.equal(result.summary.ai_review_approved_count, 0);
  assert.equal(result.summary.improvement_candidate_count, 3);
  assert.equal(result.summary.promotable_candidate_count, 0);
  assert.equal(result.summary.promotion_gate_passed_count, 3);
  assert.equal(result.summary.regression_guard_only_count, 3);
  assert.equal(result.summary.promotion_safety_ready_count, 0);
  assert.equal(result.summary.promotion_safety_blocked_count, 0);
  assert.equal(result.summary.owner_or_human_gate_required_count, 0);
  assert.equal(result.summary.forbidden_authority_flag_count, 0);
  assert.equal(result.summary.memory_body_observed, false);
  assert.deepEqual(result.missing_observations, []);

  for (const observation of Object.values(result.observations)) {
    assert.equal(observation, true);
  }

  assert.deepEqual(result.domain_summary.map((entry) => entry.domain_id), [
    'med-autoscience',
    'med-autogrant',
    'redcube-ai',
  ]);
  assert.deepEqual(result.refs.domain_quality_scorecard_refs, [
    'quality-scorecard:mas/paper-repair-smoke',
    'quality-scorecard:mag/grant-section-smoke',
    'quality-scorecard:rca/visual-deliverable-smoke',
  ]);
  assert.ok(result.refs.recovery_probe_refs.includes('recovery-probe:common/resume-after-interruption'));
  assert.ok(result.refs.improvement_candidate_refs.includes('improvement-candidate:mag/stage-policy-tightening'));
  assert.ok(result.refs.promotion_gate_refs.includes('promotion-gate:rca/visual-route-smoke'));
  assert.ok(Array.isArray(result.refs.change_evaluation_refs));
  assert.ok(Array.isArray(result.refs.predicted_impact_refs));
  assert.ok(Array.isArray(result.refs.failure_evidence_refs));
  assert.ok(Array.isArray(result.refs.root_cause_refs));
  assert.ok(Array.isArray(result.refs.targeted_fix_refs));
  assert.ok(Array.isArray(result.refs.risk_task_refs));
  assert.ok(Array.isArray(result.refs.next_run_falsification_refs));
  assert.equal(result.codex_attempt_trace_flywheel.surface_kind,
    'opl_agent_lab_codex_attempt_trace_flywheel');
  assert.equal(result.codex_attempt_trace_flywheel.summary.attempt_count, 3);
  assert.equal(result.codex_attempt_trace_flywheel.summary.codex_cli_attempt_count, 3);
  assert.equal(result.codex_attempt_trace_flywheel.summary.trace_ready_count, 3);
  assert.equal(result.codex_attempt_trace_flywheel.summary.typed_blocker_count, 0);
  assert.equal(result.codex_attempt_trace_flywheel.promotion_eligibility.flywheel_can_authorize_domain_ready,
    false);
  assert.equal(result.codex_attempt_trace_flywheel.promotion_eligibility.flywheel_can_authorize_quality_verdict,
    false);
  assert.equal(result.codex_attempt_trace_flywheel.promotion_eligibility.flywheel_can_promote_default_agent,
    false);
  assert.equal(result.codex_attempt_trace_flywheel.promotion_eligibility.flywheel_can_train_or_deploy_model_weights,
    false);
  assert.equal(result.codex_attempt_trace_flywheel.promotion_eligibility.flywheel_can_mutate_artifact_body,
    false);
  assert.equal(result.codex_attempt_trace_flywheel.authority_boundary.can_authorize_domain_ready, false);
  assert.equal(result.codex_attempt_trace_flywheel.authority_boundary.can_authorize_quality_verdict, false);
  assert.equal(result.codex_attempt_trace_flywheel.authority_boundary.can_promote_default_agent, false);
  assert.equal(result.codex_attempt_trace_flywheel.authority_boundary.can_train_or_deploy_model_weights, false);
  assert.equal(result.codex_attempt_trace_flywheel.authority_boundary.can_mutate_artifact_body, false);
  assert.ok(result.refs.codex_attempt_trace_refs.length === 3);
  assert.ok(result.refs.codex_command_refs.includes('command-ref:codex/mas-paper-repair-smoke'));
  assert.ok(result.refs.codex_file_refs.includes('file-ref:mas/current-package-fixture'));
  assert.ok(result.refs.codex_subagent_refs.includes('subagent-ref:codex/mas-reviewer-repair'));
  assert.ok(result.refs.codex_worktree_refs.includes('worktree-ref:codex/mas-paper-repair-smoke'));
  assert.ok(result.refs.codex_test_refs.includes('test-ref:mas/paper-autonomy-smoke'));
  assert.ok(result.refs.codex_web_source_refs.includes('source-ref:mas/reviewer-guideline-fixture'));
  assert.ok(result.refs.codex_review_receipt_refs.includes('review-receipt-ref:mas/ai-reviewer-fixture'));
  assert.equal(result.ahe_evidence.surface_kind, 'opl_agent_lab_ahe_evidence_read_model');
  assert.equal(result.ahe_evidence.summary.promotion_authorized_count, 0);
  assert.equal(result.executor_capability_aperture.surface_kind,
    'opl_agent_lab_executor_capability_lease_read_model');
  assert.equal(result.executor_capability_aperture.previous_surface_kind,
    'opl_agent_lab_executor_capability_aperture_read_model');
  assert.equal(result.executor_capability_aperture.lease_kind, 'executor_capability_lease');
  assert.equal(result.executor_capability_aperture.read_model_role,
    'runtime_issued_executor_capability_lease');
  assert.equal(result.executor_capability_aperture.semantic_boundary,
    'runtime_issued_launch_audit_receipt_boundary_only_not_codex_internal_reasoning_contract');
  assert.equal(result.executor_capability_aperture.default_executor_kind, 'codex_cli');
  assert.equal(result.executor_capability_aperture.summary.codex_cli_task_count, 3);
  assert.equal(result.executor_capability_aperture.summary.expected_receipt_ref_count, 3);
  assert.equal(result.executor_capability_aperture.summary.runtime_issued_lease_count, 3);
  assert.equal(result.executor_capability_aperture.summary.low_risk_count, 3);
  assert.equal(result.executor_capability_aperture.constrains_launch_audit_and_receipt_only, true);
  assert.equal(result.executor_capability_aperture.does_not_constrain_codex_internal_reasoning, true);
  assert.equal(result.executor_capability_aperture.authority_boundary.can_change_default_executor, false);
  assert.equal(result.executor_capability_aperture.authority_boundary.can_execute_non_default_executor, false);
  assert.equal(result.executor_capability_aperture.authority_boundary.can_constrain_executor_reasoning, false);
  assert.equal(result.executor_capability_aperture.authority_boundary.can_claim_quality_equivalence, false);
  assert.equal(result.executor_capability_aperture.authority_boundary.can_claim_tool_semantics_equivalence, false);
  assert.equal(result.executor_capability_aperture.authority_boundary.can_claim_resume_equivalence, false);
  assert.equal(result.executor_capability_aperture.authority_boundary.can_authorize_domain_ready, false);
  assert.equal(result.executor_capability_aperture.authority_boundary.can_authorize_quality_verdict, false);
  assert.equal(result.executor_capability_aperture.authority_boundary.can_mutate_artifact_body, false);
  assert.equal(result.executor_capability_aperture.authority_boundary.can_write_domain_truth, false);
  assert.deepEqual(result.refs.executor_capability_aperture_refs,
    result.executor_capability_aperture.tasks.map((task: any) => task.aperture_ref));
  assert.equal(result.authority_boundary.can_authorize_domain_ready, false);
  assert.equal(result.authority_boundary.can_authorize_quality_verdict, false);
  assert.equal(result.authority_boundary.can_authorize_export_verdict, false);
  assert.equal(result.authority_boundary.can_write_memory_body, false);

  const masRun = result.runs.find((entry) => entry.domain_id === 'med-autoscience');
  assert.ok(masRun);
  assert.equal(masRun.status, 'passed');
  assert.deepEqual(masRun.failure_taxonomy, []);
  assert.equal(masRun.trajectory.agent_executor, 'codex_cli');
  assert.equal(masRun.trajectory.stage_attempt_refs[0], 'stage-attempt:mas/paper-repair-smoke');
  assert.equal(masRun.scorecard.domain_owned, true);
  assert.equal(masRun.scorecard.opl_scorecard_role, 'scorecard_ref_projection_only');
  assert.equal(masRun.scorecard.scorecard_pass_scope, 'suite_fixture_scorecard_only');
  assert.equal(masRun.independent_ai_review_assessment.review_status, 'review_pending');
  assert.equal(masRun.independent_ai_review_assessment.ai_review_approved, false);
  assert.equal(masRun.promotion_safety_assessment.safety_status, 'regression_guard_only');
  assert.equal(masRun.promotion_safety_assessment.automatic_mechanism_promotion_ready, false);
  assert.deepEqual(masRun.promotion_safety_assessment.failure_delta_refs, []);

  const masAperture = result.executor_capability_aperture.tasks.find((entry: any) =>
    entry.domain_id === 'med-autoscience');
  assert.ok(masAperture);
  assert.equal(masAperture.executor.executor_kind, 'codex_cli');
  assert.equal(masAperture.executor.codex_first_class_executor, true);
  assert.equal(masAperture.executor_capability_lease.lease_kind, 'executor_capability_lease');
  assert.equal(masAperture.executor_capability_lease.issued_by, 'opl_runtime');
  assert.equal(masAperture.executor_capability_lease.constrains_launch_audit_and_receipt_only, true);
  assert.equal(masAperture.executor_capability_lease.does_not_constrain_codex_internal_reasoning, true);
  assert.equal(masAperture.model_reasoning.does_not_constrain_ai_reasoning, true);
  assert.equal(masAperture.capabilities.network.network_policy, 'offline');
  assert.equal(masAperture.capabilities.sandbox.sandbox_policy, 'fixture_only_no_artifact_mutation');
  assert.equal(masAperture.capabilities.worktree.workspace_locator_ref,
    'workspace-locator:mas/sample-paper-repair');
  assert.equal(masAperture.expected_receipt.expected_receipt_refs[0],
    'owner-receipt:mas/publication-eval-fixture');
  assert.equal(masAperture.audit_boundary.can_constrain_executor_reasoning, false);
  assert.equal(masAperture.audit_boundary.can_execute_non_default_executor, false);
  assert.equal(masAperture.audit_boundary.can_claim_resume_equivalence, false);
});

test('Agent Lab separates fixture scorecard pass from independent AI review and promotion safety approval', () => {
  const result = runAgentLabSuite(buildSampleAgentLabSuite());

  assert.equal(result.status, 'passed');
  assert.equal(result.summary.scorecard_passed_count, 3);
  assert.equal(result.summary.ai_review_approved_count, 0);
  assert.equal(result.summary.promotable_candidate_count, 0);
  assert.equal(result.summary.promotion_gate_passed_count, 3);
  assert.equal(result.summary.regression_guard_only_count, 3);
  assert.equal(result.summary.promotion_safety_ready_count, 0);

  for (const run of result.runs) {
    assert.equal(run.scorecard.passed, true);
    assert.equal(run.scorecard.scorecard_pass_scope, 'suite_fixture_scorecard_only');
    assert.equal(run.independent_ai_review_assessment.surface_kind,
      'opl_agent_lab_independent_ai_review_assessment');
    assert.equal(run.independent_ai_review_assessment.assessment_mode, 'missing_real_independent_review');
    assert.equal(run.independent_ai_review_assessment.receipt_source, 'missing');
    assert.equal(run.independent_ai_review_assessment.ai_review_approved, false);
    assert.equal(run.independent_ai_review_assessment.review_status, 'review_pending');
    assert.equal(run.promotion_safety_assessment.safety_status, 'regression_guard_only');
    assert.equal(run.promotion_safety_assessment.automatic_mechanism_promotion_ready, false);
  }
});

test('Agent Lab counts real independent AI review separately from automatic promotion safety', () => {
  const suite = buildSampleAgentLabSuite();
  const candidateRef = suite.tasks[0].improvement_candidate.candidate_ref;
  suite.tasks[0] = {
    ...suite.tasks[0],
    mechanism_evolution_inputs: {
      ...(suite.tasks[0].mechanism_evolution_inputs ?? {}),
      independent_ai_review_receipt: realIndependentAiReviewReceipt(candidateRef),
    },
  };

  const result = runAgentLabSuite(suite);
  const reviewedRun = result.runs[0];

  assert.equal(result.status, 'passed');
  assert.equal(result.summary.scorecard_passed_count, 3);
  assert.equal(result.summary.ai_review_approved_count, 1);
  assert.equal(result.summary.promotable_candidate_count, 0);
  assert.equal(reviewedRun.independent_ai_review_assessment.ai_review_approved, true);
  assert.equal(reviewedRun.independent_ai_review_assessment.review_status, 'approved');
  assert.equal(reviewedRun.independent_ai_review_assessment.attempt_separation_verified, true);
  assert.equal(reviewedRun.independent_ai_review_assessment.execution_attempt_ref,
    `stage-attempt:executor:${candidateRef}`);
  assert.equal(reviewedRun.independent_ai_review_assessment.review_attempt_ref,
    `stage-attempt:reviewer:${candidateRef}`);
  assert.equal(reviewedRun.promotion_safety_assessment.safety_status, 'regression_guard_only');
  assert.equal(reviewedRun.promotion_safety_assessment.automatic_mechanism_promotion_ready, false);
  assert.deepEqual(reviewedRun.independent_ai_review_assessment.missing_required_fields, []);
  assert.ok(reviewedRun.mechanism_evolution_input_refs.includes(
    `independent-ai-review-receipt:${candidateRef}`,
  ));
});

test('Agent Lab treats fixture, scorecard, schema completeness, and provider completion as advisory only', () => {
  const suite = buildSampleAgentLabSuite();
  const candidateRef = suite.tasks[0].improvement_candidate.candidate_ref;
  suite.tasks[0] = {
    ...suite.tasks[0],
    improvement_candidate: {
      ...suite.tasks[0].improvement_candidate,
      evidence_refs: [
        ...suite.tasks[0].improvement_candidate.evidence_refs,
        'schema-completeness:agent-lab/manifest-valid',
        'provider-completion:agent-lab/provider-run-completed',
      ],
    },
    mechanism_evolution_inputs: {
      ...(suite.tasks[0].mechanism_evolution_inputs ?? {}),
      independent_ai_review_receipt: realIndependentAiReviewReceipt(candidateRef),
    },
    promotion_gate: {
      ...suite.tasks[0].promotion_gate,
      advisory_only_refs: [
        'fixture:agent-lab/sample-suite-pass',
        'schema-completeness:agent-lab/manifest-valid',
        'provider-completion:agent-lab/provider-run-completed',
      ],
      independent_ai_review_receipt_refs: [`independent-ai-review-receipt:${candidateRef}`],
      promotion_receipt_refs: ['mechanism-promotion-receipt:agent-lab/advisory-only'],
      rollback_target_refs: ['mechanism-version-ref:agent-lab/current'],
      canary_observation_refs: ['canary-observation-ref:agent-lab/advisory-only'],
    },
  };

  const result = runAgentLabSuite(suite);
  const reviewedRun = result.runs[0];

  assert.equal(result.status, 'passed');
  assert.equal(result.summary.ai_review_approved_count, 1);
  assert.equal(result.summary.promotable_candidate_count, 0);
  assert.equal(result.summary.regression_guard_only_count, 3);
  assert.ok(result.summary.advisory_only_signal_count >= 3);
  assert.equal(reviewedRun.independent_ai_review_assessment.ai_review_approved, true);
  assert.equal(reviewedRun.promotion_safety_assessment.safety_status, 'regression_guard_only');
  assert.equal(reviewedRun.promotion_safety_assessment.advisory_only_cannot_promote, true);
  assert.equal(reviewedRun.promotion_safety_assessment.automatic_mechanism_promotion_ready, false);
  assert.ok(reviewedRun.promotion_safety_assessment.advisory_only_refs.includes(
    'schema-completeness:agent-lab/manifest-valid',
  ));
  assert.ok(reviewedRun.promotion_safety_assessment.advisory_only_refs.includes(
    'provider-completion:agent-lab/provider-run-completed',
  ));
  assert.ok(result.refs.advisory_only_signal_refs.includes('fixture:agent-lab/sample-suite-pass'));
});

test('Agent Lab blocks promotion when executor and reviewer attempts are not independent', () => {
  const suite = buildSampleAgentLabSuite();
  const candidateRef = suite.tasks[1].improvement_candidate.candidate_ref;
  const failureDeltaRef = 'failure-delta:mag/controlled-soak-stage-policy';
  const reviewReceipt = sameAttemptIndependentAiReviewReceipt(candidateRef, 'medium_risk');
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

  const result = runAgentLabSuite(suite);
  const blockedRun = result.runs[1];

  assert.equal(result.status, 'blocked');
  assert.equal(result.summary.ai_review_approved_count, 0);
  assert.equal(result.summary.promotable_candidate_count, 0);
  assert.equal(blockedRun.independent_ai_review_assessment.attempt_separation_verified, false);
  assert.equal(blockedRun.independent_ai_review_assessment.review_status, 'blocked_from_auto_promotion');
  assert.equal(blockedRun.promotion_safety_assessment.safety_status, 'promotion_blocked');
  assert.ok(blockedRun.failure_taxonomy.includes('promotion_independent_ai_attempt_separation_missing'));
  assert.ok(blockedRun.failure_taxonomy.includes('promotion_real_independent_ai_review_missing'));
});

test('Agent Lab blocks failure-delta promotion attempts without safety refs', () => {
  const suite = buildSampleAgentLabSuite();
  const failureDeltaRef = 'failure-delta:mag/controlled-soak-stage-policy';
  suite.tasks[1] = {
    ...suite.tasks[1],
    improvement_candidate: {
      ...suite.tasks[1].improvement_candidate,
      evidence_refs: [...suite.tasks[1].improvement_candidate.evidence_refs, failureDeltaRef],
    },
    promotion_gate: {
      ...suite.tasks[1].promotion_gate,
      failure_delta_refs: [failureDeltaRef],
    },
  };

  const result = runAgentLabSuite(suite);
  const blockedRun = result.runs[1];

  assert.equal(result.status, 'blocked');
  assert.equal(result.summary.promotion_safety_blocked_count, 1);
  assert.equal(result.summary.promotable_candidate_count, 0);
  assert.equal(blockedRun.promotion_safety_assessment.safety_status, 'promotion_blocked');
  assert.deepEqual(blockedRun.promotion_safety_assessment.failure_delta_refs, [failureDeltaRef]);
  assert.ok(blockedRun.failure_taxonomy.includes('promotion_independent_ai_review_receipt_missing'));
  assert.ok(blockedRun.failure_taxonomy.includes('promotion_receipt_ref_missing'));
  assert.ok(blockedRun.failure_taxonomy.includes('promotion_rollback_target_ref_missing'));
  assert.ok(blockedRun.failure_taxonomy.includes('promotion_canary_observation_ref_missing'));
  assert.ok(result.missing_observations.includes('promotion_gates_observed'));
  assert.deepEqual(result.refs.failure_delta_refs, [failureDeltaRef]);
  assert.ok(result.codex_attempt_trace_flywheel.summary.fork_candidate_count >= 2);
  assert.ok(result.codex_attempt_trace_flywheel.refs.blocked_evidence_refs.includes(failureDeltaRef));
  assert.ok(result.codex_attempt_trace_flywheel.variant_candidates.every((candidate: any) =>
    candidate.evidence_delta.domain_truth_delta_written === false
    && candidate.evidence_delta.memory_body_delta_written === false
    && candidate.evidence_delta.artifact_delta_written === false
    && candidate.promotion_eligibility.can_authorize_domain_ready === false
    && candidate.promotion_eligibility.can_authorize_quality_verdict === false
    && candidate.promotion_eligibility.can_promote_default_agent === false
    && candidate.promotion_eligibility.can_train_or_deploy_model_weights === false
    && candidate.promotion_eligibility.can_mutate_artifact_body === false));
});

test('Agent Lab allows medium-risk auto-promotion only with real failure delta and safety refs', () => {
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

  const result = runAgentLabSuite(suite);
  const promotedRun = result.runs[1];

  assert.equal(result.status, 'passed');
  assert.equal(result.summary.ai_review_approved_count, 1);
  assert.equal(result.summary.regression_guard_only_count, 2);
  assert.equal(result.summary.promotion_safety_ready_count, 1);
  assert.equal(result.summary.promotion_safety_blocked_count, 0);
  assert.equal(result.summary.promotable_candidate_count, 1);
  assert.equal(promotedRun.promotion_safety_assessment.risk_tier, 'medium_risk');
  assert.equal(promotedRun.promotion_safety_assessment.safety_status, 'promotion_ready');
  assert.equal(promotedRun.promotion_safety_assessment.automatic_mechanism_promotion_ready, true);
  assert.deepEqual(promotedRun.promotion_safety_assessment.missing_required_refs, []);
  assert.deepEqual(result.refs.failure_delta_refs, [failureDeltaRef]);
  assert.deepEqual(result.refs.promotion_independent_ai_review_receipt_refs, [reviewReceipt.receipt_ref]);
});

test('Agent Lab blocks memory body payloads instead of treating them as OPL-applied learning', () => {
  const suite = buildSampleAgentLabSuite();
  suite.tasks[0] = {
    ...suite.tasks[0],
    trajectory: {
      ...suite.tasks[0].trajectory,
      memory_body: 'domain memory body must stay out of OPL Agent Lab',
    },
  };

  const result = runAgentLabSuite(suite);

  assert.equal(result.status, 'blocked');
  assert.equal(result.observations.no_memory_body_observed, false);
  assert.equal(result.summary.memory_body_observed, true);
  assert.ok(result.missing_observations.includes('no_memory_body_observed'));
  assert.equal(result.authority_boundary.can_write_memory_body, false);
});

test('Agent Lab blocks forbidden OPL authority claims in task manifests or scorecards', () => {
  const suite = buildSampleAgentLabSuite();
  suite.authority_boundary = {
    ...suite.authority_boundary,
    can_modify_managed_runtime: true,
  };
  suite.tasks[1] = {
    ...suite.tasks[1],
    scorecard: {
      ...suite.tasks[1].scorecard,
      authority_boundary: {
        ...suite.tasks[1].scorecard.authority_boundary,
        can_authorize_quality_verdict: true,
      },
    },
  };
  suite.tasks[2] = {
    ...suite.tasks[2],
    promotion_gate: {
      ...suite.tasks[2].promotion_gate,
      authority_boundary: {
        ...suite.tasks[2].promotion_gate.authority_boundary,
        can_write_owner_receipt: true,
      },
    },
  };

  const result = runAgentLabSuite(suite);

  assert.equal(result.status, 'blocked');
  assert.equal(result.observations.forbidden_authority_flags_all_false, false);
  assert.equal(result.summary.forbidden_authority_flag_count, 3);
  assert.deepEqual(result.refs.forbidden_authority_flags, [
    'suite:authority_boundary.can_modify_managed_runtime',
    'task:agent-lab-task:mag/grant-section-smoke:scorecard.authority_boundary.can_authorize_quality_verdict',
    'task:agent-lab-task:rca/visual-deliverable-smoke:promotion_gate.authority_boundary.can_write_owner_receipt',
  ]);
  assert.ok(result.missing_observations.includes('forbidden_authority_flags_all_false'));
});

test('Agent Lab projects MAS mechanism evolution inputs as body-free refs for evolve consumption', () => {
  const suite = buildSampleAgentLabSuite();
  suite.tasks[0] = {
    ...suite.tasks[0],
    mechanism_evolution_inputs: {
      surface_kind: 'mas_agent_lab_mechanism_evolution_inputs',
      target_opl_surface: 'opl_agent_lab_evolution_result',
      target_opl_cli: 'opl agent-lab evolve --suite <suite.json> --json',
      automatic_mechanism_promotion_route: 'risk_tiered_auto_promotion_with_independent_ai_review',
      research_wiki_refs: ['file-ref:study/artifacts/research_wiki/latest.json'],
      failed_route_refs: ['failed-route:mas/dm002/internal-quality-language'],
      reviewer_direct_evidence_refs: ['review-ref:mas/dm002/ai-reviewer-direct-evidence'],
      analysis_queue_manifest_refs: ['file-ref:study/artifacts/analysis_queue/latest.json'],
      runtime_event_ledger_refs: ['runtime-event-ledger:mas/dm002/stage-events'],
      provider_switch_hygiene_refs: ['provider-switch-hygiene:mas/dm002/provider-executor'],
      claim_assurance_map_refs: ['claim-assurance:mas/dm002/no-unbacked-claims'],
      helper_skill_drift_guard_refs: ['helper-skill-drift-guard:aris/codex-skill-resolver'],
      assurance_contract_refs: ['assurance-contract:aris/submission-gate'],
      adversarial_review_gate_refs: ['adversarial-review-gate:aris/cross-model-review'],
      experiment_queue_recovery_refs: ['experiment-queue-recovery:aris/retry-wave'],
      publication_aftercare_plan_refs: ['publication-aftercare-plan:aris/resubmit-talk-package'],
      target_editable_surface_refs: ['mechanism-edit-ref:mas/analysis-campaign-queue-routing'],
      evidence_delta_refs: ['evidence-ref:mas/dm002/reviewer-routeback'],
      independent_ai_review_receipt_ref: 'ai-reviewer-receipt:mas/dm002/mechanism-direct-evidence-review',
      version_ledger_ref: 'mechanism-version-ledger:mas/dm002/medical-manuscript-quality',
      rollback_ref: 'mechanism-rollback-ref:mas/agent-lab-medical-manuscript-quality',
      helper_skill_drift_guard: {
        surface_kind: 'aris_helper_skill_drift_guard_refs',
        guard_kind: 'body_free_skill_resolver_drift_guard',
        body_included: false,
        policy_mode: 'fail_closed',
        helper_resolver_chain_refs: ['helper-resolver-chain:aris/codex-skill-mirror'],
        source_commit_pin_refs: ['source-commit-pin:aris/skills-codex'],
        drift_test_refs: ['drift-test:aris/codex-skill-mirror'],
        backfill_command_refs: ['backfill-command:aris/install-aris-codex-reconcile'],
        advisory_policy_refs: ['advisory-policy:aris/local-skill-reconcile'],
        fail_closed_policy_refs: ['fail-closed-policy:aris/skill-source-drift'],
        guard_refs: ['guard-ref:aris/no-silent-helper-drift'],
        resolver_chain: [
          {
            resolver_ref: 'resolver-ref:aris/codex-skill-symlink',
            layer: 'codex_skill_mirror',
            policy_mode: 'fail_closed',
          },
        ],
      },
      assurance_contract: {
        surface_kind: 'aris_assurance_contract_refs',
        contract_kind: 'body_free_submission_assurance_contract',
        body_included: false,
        assurance_contract_refs: ['assurance-contract:aris/submission-gate'],
        input_hash_refs: ['input-hash-ref:aris/current-package'],
        external_verifier_refs: ['external-verifier-ref:aris/cspaper-signal'],
        currentness_proof_refs: ['currentness-proof-ref:aris/no-stale-provider-switch'],
        assurance_trace_refs: ['assurance-trace-ref:aris/submission-audit'],
        submission_gate_refs: ['submission-gate-ref:aris/conference-ready'],
        no_silent_skip_proof_refs: ['no-silent-skip-proof-ref:aris/assurance-gate'],
      },
      adversarial_review_gate: {
        surface_kind: 'aris_adversarial_review_gate_refs',
        gate_kind: 'body_free_cross_model_review_gate',
        body_included: false,
        adversarial_review_gate_refs: ['adversarial-review-gate:aris/cross-model-review'],
        attack_thread_refs: ['attack-thread-ref:aris/reviewer-model-family'],
        defense_thread_refs: ['defense-thread-ref:aris/executor-revision'],
        judge_receipt_refs: ['judge-receipt-ref:aris/no-shared-context'],
        negative_evidence_refs: ['negative-evidence-ref:aris/claim-killed-by-seed-study'],
        unresolved_attack_refs: ['unresolved-attack-ref:aris/no-current-attack'],
        blocker_refs: ['blocker-ref:aris/no-current-review-blocker'],
        debate_trace_refs: ['debate-trace-ref:aris/cross-model-review-loop'],
      },
      experiment_queue_recovery: {
        surface_kind: 'aris_experiment_queue_recovery_refs',
        recovery_kind: 'body_free_experiment_queue_recovery',
        body_included: false,
        experiment_queue_recovery_refs: ['experiment-queue-recovery:aris/retry-wave'],
        queue_refs: ['queue-ref:aris/experiment-wave'],
        state_refs: ['queue-state-ref:aris/retry-ready'],
        retry_refs: ['retry-ref:aris/resource-failure-redrive'],
        retry_reason_refs: ['retry-reason-ref:aris/preempted-gpu'],
        resource_failure_refs: ['resource-failure-ref:aris/remote-gpu-evicted'],
        wave_gate_refs: ['wave-gate-ref:aris/next-ablation-wave'],
        stale_worker_cleanup_refs: ['stale-worker-cleanup-ref:aris/worker-lease-expired'],
        crash_recovery_refs: ['crash-recovery-ref:aris/experiment-process-restart'],
        budget_guard_refs: ['budget-guard-ref:aris/max-gpu-hours'],
      },
      publication_aftercare_plan: {
        surface_kind: 'aris_publication_aftercare_plan_refs',
        plan_kind: 'body_free_publication_aftercare_refs',
        body_included: false,
        publication_aftercare_plan_refs: ['publication-aftercare-plan:aris/resubmit-talk-package'],
        resubmission_plan_refs: ['resubmission-plan-ref:aris/new-venue-route'],
        venue_route_refs: ['venue-route-ref:aris/neurips-to-iclr'],
        talk_package_refs: ['talk-package-ref:aris/beamer-pptx'],
        slides_polish_refs: ['slides-polish-ref:aris/reviewer-facing-talk'],
        overleaf_sync_refs: ['overleaf-sync-ref:aris/no-write-from-opl'],
        author_handoff_refs: ['author-handoff-ref:aris/final-human-submit'],
        external_suite_task_refs: ['external-suite-task-ref:aris/aftercare-smoke'],
      },
      runtime_event_ledger: {
        surface_kind: 'mas_runtime_event_ledger_refs',
        ledger_kind: 'body_free_runtime_event_ledger_refs',
        body_included: false,
        event_ledger_refs: ['runtime-event-ledger:mas/dm002/stage-events'],
        runtime_event_refs: ['runtime-event:mas/dm002/reviewer-routeback'],
        stage_attempt_event_refs: ['stage-attempt-event:mas/dm002/reviewer-repair'],
        provider_event_refs: ['provider-event:temporal/mas-dm002-replay'],
        executor_event_refs: ['executor-event:codex/mas-dm002-reviewer-repair'],
        blocker_refs: ['blocker-ref:mas/dm002/no-current-blocker'],
      },
      provider_switch_hygiene: {
        surface_kind: 'mas_provider_switch_hygiene_refs',
        hygiene_kind: 'body_free_provider_switch_hygiene_refs',
        body_included: false,
        provider_switch_hygiene_refs: ['provider-provider-switch-hygiene:mas/dm002/local-to-temporal'],
        executor_switch_hygiene_refs: ['executor-provider-switch-hygiene:mas/dm002/codex-default'],
        provider_refs: ['provider-ref:temporal/mas-dm002'],
        executor_refs: ['executor-ref:codex-cli/mas-dm002'],
        switch_receipt_refs: ['switch-receipt:mas/dm002/provider-executor'],
        no_downgrade_proof_refs: ['no-downgrade-proof:mas/dm002/provider-executor'],
      },
      claim_assurance_map: {
        surface_kind: 'mas_claim_assurance_map_refs',
        assurance_kind: 'body_free_claim_assurance_map_refs',
        body_included: false,
        claim_assurance_map_refs: ['claim-assurance:mas/dm002/no-unbacked-claims'],
        claim_refs: ['claim-ref:hdl-unit-contamination'],
        direct_evidence_refs: ['direct-evidence-ref:mas/dm002/hdl-unit-contamination'],
        reviewer_receipt_refs: ['reviewer-receipt:mas/dm002/claim-assurance'],
        contradiction_refs: ['contradiction-ref:mas/dm002/no-current-contradiction'],
        uncertainty_refs: ['uncertainty-ref:mas/dm002/hdl-unit-boundary'],
        no_unbacked_claim_proof_refs: ['no-unbacked-claim-proof:mas/dm002'],
      },
      research_memory_graph: {
        surface_kind: 'mas_research_memory_graph',
        graph_kind: 'body_free_research_memory_graph',
        body_included: false,
        manifest_refs: ['file-ref:study/artifacts/research_wiki/latest.json'],
        paper_refs: ['paper-ref:dm002-current-draft'],
        claim_refs: ['claim-ref:hdl-unit-contamination'],
        experiment_refs: ['experiment-ref:external-validation-replay'],
        failed_idea_refs: ['failed-idea:mechanical-completeness-gate'],
        negative_result_refs: ['negative-result:uncalibrated-risk-collapse'],
        reusable_rationale_refs: ['rationale-ref:ai-reviewer-quality-route-back'],
        failed_route_refs: ['failed-route:internal-quality-language'],
      },
      analysis_queue_manifest: {
        surface_kind: 'mas_analysis_queue_manifest',
        manifest_kind: 'body_free_analysis_queue_manifest',
        body_included: false,
        queue_ref: 'analysis-queue:dm002/reviewer-repair',
        state: 'active',
        retry_policy: {
          policy_ref: 'retry-policy:mas/analysis-campaign/manual-owner-retry',
          max_retry_count: 2,
        },
        budget: { budget_ref: 'analysis-budget:dm002/reviewer-repair', max_cost: 8 },
        items: [
          {
            ref: 'analysis-queue:hdl-harmonization',
            state: 'ready',
            retry_count: 1,
            budget_cost: 3,
            source_refs: ['review-ref:hdl-harmonization'],
          },
        ],
        manifest_refs: ['file-ref:study/artifacts/analysis_queue/latest.json'],
      },
    },
  };

  const result = runAgentLabSuite(suite);
  const masRun = result.runs.find((entry) => entry.domain_id === 'med-autoscience');

  assert.ok(masRun);
  const mechanismInputs = masRun.mechanism_evolution_inputs;
  assert.ok(mechanismInputs);
  assert.ok(mechanismInputs.research_memory_graph);
  assert.ok(mechanismInputs.analysis_queue_manifest);
  assert.equal(mechanismInputs.surface_kind, 'mas_agent_lab_mechanism_evolution_inputs');
  assert.equal(mechanismInputs.research_memory_graph.body_included, false);
  assert.equal(mechanismInputs.analysis_queue_manifest.body_included, false);
  assert.ok(mechanismInputs.runtime_event_ledger);
  assert.ok(mechanismInputs.provider_switch_hygiene);
  assert.ok(mechanismInputs.claim_assurance_map);
  assert.ok(mechanismInputs.helper_skill_drift_guard);
  assert.ok(mechanismInputs.assurance_contract);
  assert.ok(mechanismInputs.adversarial_review_gate);
  assert.ok(mechanismInputs.experiment_queue_recovery);
  assert.ok(mechanismInputs.publication_aftercare_plan);
  assert.equal(mechanismInputs.runtime_event_ledger.body_included, false);
  assert.equal(mechanismInputs.provider_switch_hygiene.body_included, false);
  assert.equal(mechanismInputs.claim_assurance_map.body_included, false);
  assert.equal(mechanismInputs.helper_skill_drift_guard.body_included, false);
  assert.equal(mechanismInputs.assurance_contract.body_included, false);
  assert.equal(mechanismInputs.adversarial_review_gate.body_included, false);
  assert.equal(mechanismInputs.experiment_queue_recovery.body_included, false);
  assert.equal(mechanismInputs.publication_aftercare_plan.body_included, false);
  assert.equal(mechanismInputs.helper_skill_drift_guard.can_execute_helper, false);
  assert.equal(mechanismInputs.assurance_contract.can_authorize_submission_action, false);
  assert.equal(mechanismInputs.adversarial_review_gate.can_authorize_quality_verdict, false);
  assert.equal(mechanismInputs.publication_aftercare_plan.can_push_submission, false);
  assert.deepEqual(mechanismInputs.research_memory_graph.claim_refs, [
    'claim-ref:hdl-unit-contamination',
  ]);
  assert.deepEqual(mechanismInputs.analysis_queue_manifest.items.map((item: any) => item.ref), [
    'analysis-queue:hdl-harmonization',
  ]);
  assert.ok(result.refs.mechanism_evolution_input_refs.includes('paper-ref:dm002-current-draft'));
  assert.ok(result.refs.mechanism_evolution_input_refs.includes('analysis-queue:hdl-harmonization'));
  assert.ok(result.refs.mechanism_evolution_input_refs.includes('runtime-event-ledger:mas/dm002/stage-events'));
  assert.ok(result.refs.mechanism_evolution_input_refs.includes(
    'provider-provider-switch-hygiene:mas/dm002/local-to-temporal',
  ));
  assert.ok(result.refs.mechanism_evolution_input_refs.includes('claim-assurance:mas/dm002/no-unbacked-claims'));
  assert.ok(result.refs.mechanism_evolution_input_refs.includes('helper-resolver-chain:aris/codex-skill-mirror'));
  assert.ok(result.refs.mechanism_evolution_input_refs.includes('assurance-contract:aris/submission-gate'));
  assert.ok(result.refs.mechanism_evolution_input_refs.includes('attack-thread-ref:aris/reviewer-model-family'));
  assert.ok(result.refs.mechanism_evolution_input_refs.includes('queue-ref:aris/experiment-wave'));
  assert.ok(result.refs.mechanism_evolution_input_refs.includes('talk-package-ref:aris/beamer-pptx'));
  assert.equal(result.refs.mechanism_evolution_input_refs.includes(''), false);
  assert.equal(result.authority_boundary.can_write_memory_body, false);
});

test('Agent Lab contract is tracked and exported as an OPL framework surface', () => {
  const contract = readJson('contracts/opl-framework/agent-lab-contract.json');
  const packageJson = readJson('package.json');

  assert.equal(contract.contract_kind, 'opl_agent_lab_contract.v1');
  assert.equal(contract.surface_kind, 'opl_agent_lab_contract');
  assert.equal(contract.contract_version, 'opl-agent-lab.v1');
  assert.deepEqual(contract.result_surface.suite_kinds, [
    'agent_lab_sample_suite',
    'agent_lab_longline_suite',
    'agent_lab_external_suite',
    'agent_production_evidence_suite',
  ]);
  assert.ok(contract.result_surface.ref_fields.includes('mechanism_evolution_input_refs'));
  assert.ok(contract.result_surface.ref_fields.includes('production_evidence_gate_result_refs'));
  assert.ok(contract.result_surface.ref_fields.includes('production_evidence_owner_route_refs'));
  assert.ok(contract.result_surface.ref_fields.includes('production_evidence_typed_blocker_refs'));
  assert.ok(contract.result_surface.ref_fields.includes('production_evidence_required_receipt_refs'));
  assert.ok(contract.result_surface.ref_fields.includes('change_evaluation_refs'));
  assert.ok(contract.result_surface.ref_fields.includes('predicted_impact_refs'));
  assert.ok(contract.result_surface.ref_fields.includes('failure_evidence_refs'));
  assert.ok(contract.result_surface.ref_fields.includes('root_cause_refs'));
  assert.ok(contract.result_surface.ref_fields.includes('targeted_fix_refs'));
  assert.ok(contract.result_surface.ref_fields.includes('risk_task_refs'));
  assert.ok(contract.result_surface.ref_fields.includes('next_run_falsification_refs'));
  assert.ok(contract.input_surfaces.includes('variant_candidate_refs'));
  assert.equal(contract.external_suite_runner_surface.surface_kind, 'opl_agent_lab_external_suite_run');
  assert.equal(contract.external_suite_runner_surface.cli, 'opl agent-lab run --suite <suite.json>');
  assert.ok(contract.external_suite_runner_surface.accepted_suite_kinds.includes('agent_production_evidence_suite'));
  assert.equal(contract.production_evidence_gate_surface.surface_kind,
    'opl_agent_lab_production_evidence_gate_result');
  assert.equal(contract.production_evidence_gate_surface.refs_only, true);
  assert.equal(contract.production_evidence_gate_surface.domain_verdict_claimed, false);
  assert.ok(contract.production_evidence_gate_surface.input_ref_groups.includes('owner_route_refs'));
  assert.ok(contract.production_evidence_gate_surface.input_ref_groups.includes('required_receipt_refs'));
  assert.ok(contract.production_evidence_gate_surface.consumer_outputs.includes(
    'agent_lab_run.suite_result.production_evidence_gate_result',
  ));
  assert.ok(contract.result_surface.summary_fields.includes('regression_guard_only_count'));
  assert.ok(contract.result_surface.summary_fields.includes('promotion_safety_ready_count'));
  assert.ok(contract.result_surface.summary_fields.includes('promotion_safety_blocked_count'));
  assert.ok(contract.result_surface.ref_fields.includes('failure_delta_refs'));
  assert.ok(contract.result_surface.ref_fields.includes('promotion_receipt_refs'));
  assert.equal(contract.promotion_safety_assessment_surface.surface_kind,
    'opl_agent_lab_promotion_safety_assessment');
  assert.ok(contract.promotion_safety_assessment_surface.statuses.includes('regression_guard_only'));
  assert.ok(contract.promotion_safety_assessment_surface.statuses.includes('promotion_ready'));
  assert.ok(contract.promotion_safety_assessment_surface.promotion_ready_requires.includes(
    'real failure_delta_refs or evidence_delta_refs',
  ));
  assert.equal(contract.promotion_safety_assessment_surface.high_risk_policy,
    'high_risk changes require owner_or_human_gate_refs and never set automatic_mechanism_promotion_ready=true');
  assert.ok(contract.input_surfaces.includes('runtime_event_ledger_refs'));
  assert.ok(contract.input_surfaces.includes('provider_switch_hygiene_refs'));
  assert.ok(contract.input_surfaces.includes('claim_assurance_map_refs'));
  assert.ok(contract.input_surfaces.includes('helper_skill_drift_guard_refs'));
  assert.ok(contract.input_surfaces.includes('assurance_contract_refs'));
  assert.ok(contract.input_surfaces.includes('adversarial_review_gate_refs'));
  assert.ok(contract.input_surfaces.includes('experiment_queue_recovery_refs'));
  assert.ok(contract.input_surfaces.includes('publication_aftercare_plan_refs'));
  assert.ok(contract.input_surfaces.includes('effort_assurance_axis_refs'));
  assert.ok(contract.input_surfaces.includes('helper_inventory_report_refs'));
  assert.ok(contract.input_surfaces.includes('permission_current_date_invariant_refs'));
  assert.ok(contract.input_surfaces.includes('mcp_stream_reliability_policy_refs'));
  assert.equal(contract.ahe_evidence_surface.surface_kind, 'opl_agent_lab_ahe_evidence_read_model');
  assert.ok(contract.ahe_evidence_surface.required_ref_fields.includes('failure_evidence_refs'));
  assert.ok(contract.ahe_evidence_surface.required_ref_fields.includes('root_cause_refs'));
  assert.ok(contract.ahe_evidence_surface.required_ref_fields.includes('targeted_fix_refs'));
  assert.equal(contract.variant_comparison_surface.surface_kind,
    'opl_agent_lab_variant_comparison_read_model');
  assert.ok(contract.variant_comparison_surface.input_ref_groups.includes('variant_candidate_refs'));
  assert.ok(contract.variant_comparison_surface.output_ref_groups.includes('winner_candidate_ref'));
  assert.equal(contract.mechanism_evolution_input_surface.surface_kind,
    'opl_agent_lab_mechanism_evolution_input_refs');
  assert.equal(contract.mechanism_evolution_input_surface.refs_only, true);
  assert.ok(contract.mechanism_evolution_input_surface.input_ref_groups.includes('runtime_event_ledger_refs'));
  assert.ok(contract.mechanism_evolution_input_surface.input_ref_groups.includes(
    'provider_switch_hygiene_refs',
  ));
  assert.ok(contract.mechanism_evolution_input_surface.input_ref_groups.includes('claim_assurance_map_refs'));
  assert.ok(contract.mechanism_evolution_input_surface.input_ref_groups.includes('helper_skill_drift_guard_refs'));
  assert.ok(contract.mechanism_evolution_input_surface.input_ref_groups.includes('assurance_contract_refs'));
  assert.ok(contract.mechanism_evolution_input_surface.input_ref_groups.includes('adversarial_review_gate_refs'));
  assert.ok(contract.mechanism_evolution_input_surface.input_ref_groups.includes('experiment_queue_recovery_refs'));
  assert.ok(contract.mechanism_evolution_input_surface.input_ref_groups.includes('publication_aftercare_plan_refs'));
  assert.ok(contract.mechanism_evolution_input_surface.typed_body_free_surfaces.includes('runtime_event_ledger'));
  assert.ok(contract.mechanism_evolution_input_surface.typed_body_free_surfaces.includes(
    'provider_switch_hygiene',
  ));
  assert.ok(contract.mechanism_evolution_input_surface.typed_body_free_surfaces.includes('claim_assurance_map'));
  assert.ok(contract.mechanism_evolution_input_surface.typed_body_free_surfaces.includes(
    'helper_skill_drift_guard',
  ));
  assert.ok(contract.mechanism_evolution_input_surface.typed_body_free_surfaces.includes('assurance_contract'));
  assert.ok(contract.mechanism_evolution_input_surface.typed_body_free_surfaces.includes(
    'adversarial_review_gate',
  ));
  assert.ok(contract.mechanism_evolution_input_surface.typed_body_free_surfaces.includes(
    'experiment_queue_recovery',
  ));
  assert.ok(contract.mechanism_evolution_input_surface.typed_body_free_surfaces.includes(
    'publication_aftercare_plan',
  ));
  assert.ok(contract.mechanism_evolution_input_surface.consumer_outputs.includes(
    'agent_lab_evolve.suite_result.refs.mechanism_evolution_input_refs',
  ));
  assert.ok(contract.mechanism_evolution_input_surface.forbidden_payloads.includes('owner_receipt_body'));
  assert.ok(contract.mechanism_evolution_input_surface.forbidden_payloads.includes('shared_submission_action'));
  assert.equal(contract.mechanism_surface.surface_kind, 'opl_agent_lab_mechanism_read_model');
  assert.equal(contract.mechanism_surface.cli, 'opl agent-lab mechanism');
  assert.ok(contract.mechanism_surface.fields.includes('mechanism_ref'));
  assert.ok(contract.mechanism_surface.fields.includes('next_mechanism_candidate'));
  assert.ok(contract.mechanism_surface.fields.includes('mechanism_promotion_policy'));
  assert.ok(contract.mechanism_surface.fields.includes('mechanism_version_ledger'));
  assert.ok(contract.mechanism_surface.fields.includes('independent_ai_review_receipt'));
  assert.ok(contract.mechanism_surface.fields.includes('integration_contracts'));
  assert.ok(contract.mechanism_surface.fields.includes('review_trace_ledger'));
  assert.ok(contract.mechanism_surface.fields.includes('log_driven_mechanism_candidates'));
  assert.ok(contract.mechanism_surface.fields.includes('aris_maturity_controls'));
  assert.ok(contract.mechanism_surface.fields.includes('rollback'));
  assert.equal(contract.mechanism_surface.automatic_mechanism_promotion_ready, false);
  assert.equal(contract.mechanism_surface.required_review_provenance_fields.includes('forbidden_write_scan_ref'),
    true);
  assert.equal(contract.mechanism_surface.risk_tiers.low_risk.auto_promotion, 'auto_promote_to_stable');
  assert.equal(contract.mechanism_surface.risk_tiers.medium_risk.auto_promotion, 'auto_promote_to_canary');
  assert.equal(contract.mechanism_surface.risk_tiers.high_risk.auto_promotion,
    'blocked_route_owner_or_human_gate');
  assert.equal(contract.developer_mode_repair_route_surface.surface_kind,
    'opl_agent_lab_developer_mode_repair_route_read_model');
  assert.equal(contract.developer_mode_repair_route_surface.cli, 'opl agent-lab workbench');
  assert.equal(contract.developer_mode_repair_route_surface.refs_only, true);
  assert.ok(contract.developer_mode_repair_route_surface.input_refs.includes('developer_mode_projection_ref'));
  assert.ok(contract.developer_mode_repair_route_surface.input_refs.includes('repo_permission_ref'));
  assert.deepEqual(contract.developer_mode_repair_route_surface.route_modes, [
    'repo_developer_direct_fix',
    'fork_pull_request',
  ]);
  assert.equal(contract.developer_mode_repair_route_surface.dynamic_route_builder.surface_kind,
    'opl_agent_lab_developer_mode_dynamic_repair_route');
  assert.deepEqual(contract.developer_mode_repair_route_surface.dynamic_route_builder.route_decisions, [
    'blocked',
    'observe-only',
    'direct-fix',
    'fork-PR',
    'mixed',
  ]);
  assert.ok(contract.developer_mode_repair_route_surface.dynamic_route_builder.closeout_ref_fields.includes(
    'developer_mode_projection_ref',
  ));
  assert.ok(contract.developer_mode_repair_route_surface.dynamic_route_builder.closeout_ref_fields.includes(
    'owner_acceptance_ref',
  ));
  assert.ok(contract.developer_mode_repair_route_surface.dynamic_route_builder
    .scaleout_followthrough_ref_fields.includes('route_repetition_refs'));
  assert.ok(contract.developer_mode_repair_route_surface.dynamic_route_builder
    .scaleout_followthrough_ref_fields.includes('risk_tier_auto_promotion_refs'));
  assert.ok(contract.developer_mode_repair_route_surface.dynamic_route_builder
    .scaleout_followthrough_ref_fields.includes('app_patrol_mount_refs'));
  assert.equal(
    contract.developer_mode_repair_route_surface.dynamic_route_builder
      .scaleout_followthrough_ref_policy,
    'route_repetition_risk_tier_auto_promotion_and_app_patrol_mount_refs_are_followthrough_evidence_not_base_route_closeout_owner_receipts_or_ready_verdicts',
  );
  assert.ok(contract.developer_mode_repair_route_surface.dynamic_route_builder.closeout_status_fields.includes(
    'closeout_claim_status',
  ));
  assert.ok(contract.developer_mode_repair_route_surface.dynamic_route_builder.closeout_status_fields.includes(
    'owner_acceptance_status',
  ));
  assert.ok(contract.developer_mode_repair_route_surface.dynamic_route_builder.closeout_claim_statuses.includes(
    'fixture_drill_owner_acceptance_open',
  ));
  assert.ok(contract.developer_mode_repair_route_surface.dynamic_route_builder.owner_acceptance_statuses.includes(
    'fixture_drill_not_owner_acceptance',
  ));
  assert.equal(contract.developer_mode_repair_route_surface.dynamic_route_builder.owner_acceptance_ref_policy,
    'direct_fix_external_owner_ref_fork_pr_github_pr_owner_acceptance_ref_fixture_refs_do_not_close_owner_acceptance');
  assert.ok(contract.developer_mode_repair_route_surface.live_closeout_evidence.required_closeout_ref_groups.includes(
    'external_owner_acceptance_ref',
  ));
  assert.deepEqual(
    contract.developer_mode_repair_route_surface.live_closeout_evidence
      .scaleout_followthrough.open_gate_ids,
    [
      'route_repetition_refs',
      'risk_tier_auto_promotion_refs',
      'app_patrol_mount_refs',
    ],
  );
  assert.ok(contract.developer_mode_repair_route_surface.live_closeout_evidence
    .scaleout_followthrough.required_return_shapes.includes('typed_blocker_ref'));
  assert.equal(contract.developer_mode_repair_route_surface.live_closeout_evidence.owner_acceptance_policy,
    'direct_fix_accepts_external_owner_ref_fork_pr_requires_github_pr_owner_acceptance_ref_no_opl_owner_receipt_write');
  assert.ok(contract.developer_mode_repair_route_surface.output_refs.includes('candidate_fix_ref'));
  assert.ok(contract.developer_mode_repair_route_surface.output_refs.includes('repo_worktree_ref'));
  assert.ok(contract.developer_mode_repair_route_surface.output_refs.includes('pr_ref'));
  assert.equal(contract.developer_mode_repair_route_surface.non_authority_outputs.writes_domain_truth, false);
  assert.equal(contract.developer_mode_repair_route_surface.non_authority_outputs.writes_domain_artifact, false);
  assert.equal(contract.developer_mode_repair_route_surface.non_authority_outputs.writes_memory_body, false);
  assert.equal(contract.developer_mode_repair_route_surface.non_authority_outputs.writes_quality_verdict, false);
  assert.equal(contract.developer_mode_repair_route_surface.non_authority_outputs.writes_owner_receipt, false);
  assert.equal(contract.developer_mode_repair_route_surface.non_authority_outputs.modifies_managed_runtime, false);
  assert.equal(contract.evolution_surface.surface_kind, 'opl_agent_lab_evolution_result');
  assert.equal(contract.evolution_surface.cli, 'opl agent-lab evolve --suite <suite.json>');
  assert.equal(contract.evolution_surface.refs_only, true);
  assert.equal(contract.evolution_surface.writes_domain_truth, false);
  assert.equal(contract.evolution_surface.writes_memory_body, false);
  assert.equal(contract.evolution_surface.mutates_artifact, false);
  assert.equal(contract.evolution_surface.automatic_mechanism_promotion_ready, false);
  assert.equal(contract.evolution_surface.requires_independent_ai_review, true);
  assert.ok(contract.evolution_surface.outputs.includes('integration_contracts'));
  assert.ok(contract.evolution_surface.outputs.includes('review_trace_ledger'));
  assert.ok(contract.evolution_surface.outputs.includes('log_driven_mechanism_candidates'));
  assert.ok(contract.evolution_surface.outputs.includes('log_mined_candidate_refs'));
  assert.ok(contract.evolution_surface.outputs.includes('ahe_evidence'));
  assert.ok(contract.evolution_surface.outputs.includes('variant_comparison'));
  assert.ok(contract.evolution_surface.outputs.includes('mechanism_promotion_decision'));
  assert.ok(contract.evolution_surface.outputs.includes('independent_ai_review_receipt'));
  assert.ok(contract.evolution_surface.outputs.includes('promotion_receipt'));
  assert.ok(contract.evolution_surface.outputs.includes('rollback'));
  assert.equal(contract.longline_surface.surface_kind, 'opl_agent_lab_longline_summary');
  assert.equal(contract.longline_surface.suite_kind, 'agent_lab_longline_suite');
  assert.equal(contract.complete_control_plane_surface.surface_kind, 'opl_agent_lab_complete_control_plane');
  assert.ok(contract.complete_control_plane_surface.eval_adapters.includes('inspect-ai'));
  assert.ok(contract.complete_control_plane_surface.observability_exports.includes('langfuse'));
  assert.ok(contract.complete_control_plane_surface.optimizer_loop_fields.includes('log_driven_candidate_read_model'));
  assert.ok(contract.complete_control_plane_surface.optimizer_loop_fields.includes('ahe_evidence_read_model'));
  assert.ok(contract.complete_control_plane_surface.optimizer_loop_fields.includes('integration_contract_read_model'));
  assert.ok(contract.complete_control_plane_surface.optimizer_loop_fields.includes('review_trace_ledger'));
  assert.ok(contract.complete_control_plane_surface.optimizer_loop_fields.includes('aris_maturity_controls'));
  assert.ok(contract.complete_control_plane_surface.optimizer_loop_fields.includes('variant_comparison_read_model'));
  assert.ok(contract.complete_control_plane_surface.optimizer_loop_fields.includes(
    'stage_executor_policy_read_model',
  ));
  assert.ok(contract.complete_control_plane_surface.readiness_fields.includes('automatic_mechanism_promotion_ready'));
  assert.ok(contract.complete_control_plane_surface.readiness_fields.includes('ai_review_approved_count'));
  assert.ok(contract.complete_control_plane_surface.readiness_fields.includes('ready_to_emit_integration_contracts'));
  assert.ok(contract.complete_control_plane_surface.readiness_fields.includes('ready_to_emit_review_trace_ledger'));
  assert.ok(contract.complete_control_plane_surface.readiness_fields.includes(
    'ready_to_emit_log_driven_mechanism_candidates',
  ));
  assert.ok(contract.complete_control_plane_surface.readiness_fields.includes(
    'ready_to_emit_aris_maturity_controls',
  ));
  assert.ok(contract.complete_control_plane_surface.readiness_fields.includes(
    'ready_to_emit_ahe_evidence_read_model',
  ));
  assert.ok(contract.complete_control_plane_surface.readiness_fields.includes(
    'ready_to_emit_variant_comparison_read_model',
  ));
  assert.ok(contract.complete_control_plane_surface.readiness_fields.includes(
    'ready_to_emit_stage_executor_policy_read_model',
  ));
  assert.equal(contract.stage_executor_policy_surface.surface_kind,
    'opl_agent_lab_stage_executor_policy_read_model');
  assert.equal(contract.stage_executor_policy_surface.cli, 'opl agent-lab stage-executor-policy');
  assert.equal(contract.stage_executor_policy_surface.refs_only, true);
  assert.ok(contract.stage_executor_policy_surface.canonical_non_default_executor_kinds.includes(
    'antigravity_cli',
  ));
  assert.equal(contract.stage_executor_policy_surface.canonical_trial_example.executor_kind, 'antigravity_cli');
  assert.equal(contract.stage_executor_policy_surface.canonical_trial_example.model, 'gemini-3.5-flash');
  assert.equal(contract.stage_executor_policy_surface.canonical_trial_example.reasoning_effort, 'high');
  assert.equal(contract.stage_executor_policy_surface.canonical_trial_example.default_path, false);
  assert.ok(contract.stage_executor_policy_surface.required_policy_fields.includes('executor_binding_ref'));
  assert.ok(contract.stage_executor_policy_surface.required_test_refs.includes('artifact_render_probe_ref'));
  assert.ok(contract.stage_executor_policy_surface.fail_closed_policies.includes(
    'missing binding emits typed blocker rather than falling back to codex_cli',
  ));
  assert.equal(contract.integration_contract_surface.surface_kind,
    'opl_agent_lab_integration_contract_read_model');
  assert.equal(contract.integration_contract_surface.refs_only, true);
  assert.ok(contract.integration_contract_surface.required_fields.includes('activation_predicate'));
  assert.ok(contract.integration_contract_surface.failure_outputs.includes('typed_blocker_ref'));
  assert.equal(contract.review_trace_ledger_surface.surface_kind, 'opl_agent_lab_review_trace_ledger');
  assert.equal(contract.review_trace_ledger_surface.refs_only, true);
  assert.ok(contract.review_trace_ledger_surface.trace_kinds.includes('independent_ai_reviewer_trace_ref'));
  assert.ok(contract.review_trace_ledger_surface.required_fields.includes('no_shared_context'));
  assert.equal(contract.log_driven_candidate_surface.surface_kind,
    'opl_agent_lab_log_driven_mechanism_candidate_read_model');
  assert.equal(contract.log_driven_candidate_surface.refs_only, true);
  assert.ok(contract.log_driven_candidate_surface.input_refs.includes('usage_log_refs'));
  assert.ok(contract.log_driven_candidate_surface.candidate_kinds.includes('workflow_default'));
  assert.equal(contract.aris_maturity_controls_surface.surface_kind,
    'opl_agent_lab_aris_maturity_controls_read_model');
  assert.equal(contract.aris_maturity_controls_surface.refs_only, true);
  assert.equal(contract.aris_maturity_controls_surface.runtime_dependency_required, false);
  assert.ok(contract.aris_maturity_controls_surface.control_groups.includes('effort_assurance_axes'));
  assert.ok(contract.aris_maturity_controls_surface.control_groups.includes('helper_inventory_drift_report'));
  assert.ok(contract.aris_maturity_controls_surface.control_groups.includes('fail_closed_invariants'));
  assert.ok(contract.aris_maturity_controls_surface.control_groups.includes('mcp_stream_reliability_policy'));
  assert.ok(contract.aris_maturity_controls_surface.effort_assurance_axes.effort_levels.includes('deep_soak'));
  assert.ok(contract.aris_maturity_controls_surface.effort_assurance_axes.assurance_levels.includes(
    'independent_review',
  ));
  assert.equal(contract.aris_maturity_controls_surface.helper_inventory_drift_report.fail_policy,
    'fail_closed_on_missing_inventory_or_unverified_drift');
  assert.equal(contract.aris_maturity_controls_surface.helper_inventory_drift_report.can_execute_helper, false);
  assert.equal(contract.aris_maturity_controls_surface.fail_closed_invariants.missing_context_policy,
    'fail_closed_with_typed_blocker_ref');
  assert.equal(contract.aris_maturity_controls_surface.mcp_stream_reliability_policy.no_silent_drop, true);
  assert.ok(contract.aris_maturity_controls_surface.mcp_stream_reliability_policy.required_failure_outputs.includes(
    'stream_replay_ref',
  ));
  assert.ok(contract.aris_maturity_controls_surface.forbidden_payloads.includes('runtime_dependency'));
  assert.equal(contract.export_surface.surface_kind, 'opl_agent_lab_export_envelope');
  assert.ok(contract.export_surface.source_ref_groups.includes('complete_control_plane_ref'));
  assert.ok(contract.export_surface.source_ref_groups.includes('integration_contract_refs'));
  assert.ok(contract.export_surface.source_ref_groups.includes('review_trace_refs'));
  assert.ok(contract.export_surface.source_ref_groups.includes('review_evidence_refs'));
  assert.ok(contract.export_surface.source_ref_groups.includes('log_mined_candidate_refs'));
  assert.ok(contract.export_surface.source_ref_groups.includes('aris_maturity_control_refs'));
  assert.ok(contract.longline_surface.summary_fields.includes('ready_to_reduce_domain_longline_tests'));
  assert.ok(contract.longline_surface.repo_test_candidates_to_move_to_opl.includes(
    'provider-hosted soak orchestration',
  ));
  assert.equal(packageJson.exports['./agent-lab'], './dist/agent-lab.js');

  for (const observation of [
    'task_manifests_observed',
    'agent_trajectories_observed',
    'recovery_probes_observed',
    'domain_quality_scorecard_refs_observed',
    'failure_taxonomy_observed',
    'improvement_candidates_observed',
    'promotion_gates_observed',
    'no_memory_body_observed',
    'forbidden_authority_flags_all_false',
  ]) {
    assert.ok(contract.required_observations.includes(observation));
  }

  for (const retainedAuthority of [
    'domain truth',
    'domain quality verdict',
    'domain artifact authority',
    'domain memory body',
    'writeback accept/reject decision',
    'owner receipt',
  ]) {
    assert.ok(contract.domain_retained_authority.includes(retainedAuthority));
  }
});

test('Agent Lab longline suite centralizes planned MAS, MAG, and RCA soak tests into OPL-owned read-model gates', () => {
  const result = runAgentLabSuite(buildLonglineAgentLabSuite());

  assert.equal(result.status, 'passed');
  assert.equal(result.suite_kind, 'agent_lab_longline_suite');
  assert.equal(result.summary.task_count, 3);
  assert.equal(result.summary.recovery_probe_count, 7);
  assert.equal(result.longline_summary.longline_task_count, 3);
  assert.equal(result.longline_summary.repo_test_replacement_candidate_count, 3);
  assert.equal(result.longline_summary.ready_to_reduce_domain_longline_tests, true);
  assert.deepEqual(result.longline_summary.domain_ids, [
    'med-autoscience',
    'med-autogrant',
    'redcube-ai',
  ]);

  assert.deepEqual(result.longline_summary.recommended_repo_test_disposition, [
    {
      domain_id: 'med-autoscience',
      keep_in_domain_repo: [
        'publication-quality scorer',
        'owner receipt fixture',
        'paper artifact authority checks',
      ],
      move_to_opl_agent_lab: [
        'provider-hosted guarded apply soak orchestration',
        'resume/retry/dead-letter recovery probe',
        'no-forbidden-write cross-domain regression',
      ],
    },
    {
      domain_id: 'med-autogrant',
      keep_in_domain_repo: [
        'fundability scorer',
        'grant owner receipt fixture',
        'proposal artifact authority checks',
      ],
      move_to_opl_agent_lab: [
        'controlled grant-stage soak orchestration',
        'receipt reconciliation projection',
        'no-forbidden-write cross-domain regression',
      ],
    },
    {
      domain_id: 'redcube-ai',
      keep_in_domain_repo: [
        'visual quality scorer',
        'render/export owner receipt fixture',
        'artifact authority checks',
      ],
      move_to_opl_agent_lab: [
        'controlled visual-stage soak orchestration',
        'hosted-attempt reconciliation projection',
        'no-forbidden-write cross-domain regression',
      ],
    },
  ]);

  assert.ok(result.refs.recovery_probe_refs.includes('recovery-probe:longline/temporal-worker-restart-requery'));
  assert.ok(result.refs.promotion_gate_refs.includes('promotion-gate:longline/mas-paper-owner-chain'));
  assert.ok(result.refs.domain_quality_scorecard_refs.includes('quality-scorecard:longline/rca-visual-no-regression'));
  assert.equal(result.authority_boundary.can_authorize_quality_verdict, false);
  assert.equal(result.authority_boundary.can_mutate_domain_artifact, false);
});
