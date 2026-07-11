import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { parseJsonText } from '../../src/kernel/json-file.ts';
import {
  buildSampleAgentLabSuite,
  runAgentLabSuite,
} from '../../src/modules/foundry-lab/agent-lab.ts';
import { buildLonglineAgentLabResult } from '../../src/modules/foundry-lab/agent-lab-longline.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

function readJson(relativePath: string) {
  return parseJsonText(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')) as Record<string, any>;
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

function assertBlockedAuthority(boundary: Record<string, unknown>) {
  for (const key of [
    'can_write_domain_truth',
    'can_write_memory_body',
    'can_authorize_domain_ready',
    'can_authorize_quality_verdict',
    'can_authorize_export_verdict',
    'can_mutate_domain_artifact',
    'can_write_owner_receipt',
    'can_modify_managed_runtime',
    'can_promote_default_agent',
    'can_train_or_deploy_model_weights',
    'can_mutate_artifact_body',
  ]) {
    if (key in boundary) assert.equal(boundary[key], false, key);
  }
}

function assertIncludesAll(values: unknown[], expected: unknown[]) {
  for (const value of expected) assert.ok(values.includes(value), String(value));
}

test('Agent Lab runs MAS, MAG, and RCA task manifests through recovery, scoring, and promotion gates without domain authority', () => {
  const result = runAgentLabSuite(buildSampleAgentLabSuite());

  assert.equal(result.surface_kind, 'opl_agent_lab_suite_result');
  assert.equal(result.version, 'opl-agent-lab.v1');
  assert.equal(result.status, 'passed');
  assert.deepEqual(result.summary, {
    task_count: 3,
    run_count: 3,
    passed_run_count: 3,
    blocked_run_count: 0,
    recovery_probe_count: 5,
    recovery_passed_count: 5,
    scorecard_passed_count: 3,
    ai_review_approved_count: 0,
    improvement_candidate_count: 3,
    promotion_gate_passed_count: 3,
    regression_guard_only_count: 3,
    promotion_safety_ready_count: 0,
    advisory_only_signal_count: 12,
    promotion_safety_blocked_count: 0,
    owner_or_human_gate_required_count: 0,
    promotable_candidate_count: 0,
    memory_body_observed: false,
    forbidden_authority_flag_count: 0,
    stage_completion_policy_blocker_count: 0,
  });
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
  assertBlockedAuthority(result.codex_attempt_trace_flywheel.authority_boundary);
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
  assertBlockedAuthority(result.executor_capability_aperture.authority_boundary);
  assert.deepEqual(result.refs.executor_capability_aperture_refs,
    result.executor_capability_aperture.tasks.map((task: any) => task.aperture_ref));
  assertBlockedAuthority(result.authority_boundary);

  const masRun = result.runs.find((entry) => entry.domain_id === 'med-autoscience');
  assert.ok(masRun);
  assert.equal(masRun.status, 'passed');
  assert.equal(masRun.trajectory.agent_executor, 'codex_cli');
  assert.equal(masRun.trajectory.stage_attempt_refs[0], 'stage-attempt:mas/paper-repair-smoke');
  assert.equal(masRun.scorecard.domain_owned, true);
  assert.equal(masRun.scorecard.opl_scorecard_role, 'scorecard_ref_projection_only');
  assert.equal(masRun.scorecard.scorecard_pass_scope, 'suite_fixture_scorecard_only');
  assert.equal(masRun.independent_ai_review_assessment.review_status, 'review_pending');
  assert.equal(masRun.independent_ai_review_assessment.ai_review_approved, false);
  assert.equal(masRun.promotion_safety_assessment.safety_status, 'regression_guard_only');
  assert.equal(masRun.promotion_safety_assessment.automatic_mechanism_promotion_ready, false);
});

test('Agent Lab keeps empty evaluation provenance out of ordinary suite identity and refs', () => {
  const suite = buildSampleAgentLabSuite();
  const baseline = runAgentLabSuite(suite);
  const explicitEmpty = runAgentLabSuite({
    ...suite,
    evaluation_provenance_refs: [],
    evaluation_provenance_bindings: [],
  });

  assert.equal(explicitEmpty.result_id, baseline.result_id);
  assert.equal(Object.hasOwn(baseline.refs, 'evaluation_provenance_refs'), false);
  assert.equal(Object.hasOwn(explicitEmpty.refs, 'evaluation_provenance_refs'), false);
  assert.equal(Object.hasOwn(explicitEmpty, 'evaluation_provenance_bindings'), false);
  assert.equal(Object.hasOwn(explicitEmpty, 'evaluation_target_agent'), false);
});

test('Agent Lab public runner requires valid target identity for evaluation provenance', () => {
  const suite = buildSampleAgentLabSuite();
  assert.throws(
    () => runAgentLabSuite({
      ...suite,
      evaluation_provenance_refs: ['evaluation-receipt:public-runner/without-target'],
    }),
    /evaluation_target_agent/,
  );
  assert.throws(
    () => runAgentLabSuite({
      ...suite,
      evaluation_provenance_bindings: [{
        receipt_role: 'evaluation_packet',
        receipt_ref: 'evaluation-receipt:public-runner/without-target',
      }],
    }),
    /evaluation_target_agent/,
  );
  for (const target of [
    { domain_id: 'target-agent', target_agent_ref: 'domain-agent:target-agent' },
    {
      domain_id: 'target-agent',
      target_agent_ref: '   ',
      descriptor_ref: '/tmp/target-agent/contracts/domain_descriptor.json',
    },
  ]) {
    assert.throws(
      () => runAgentLabSuite({ ...suite, evaluation_target_agent: target } as any),
      /evaluation_target_agent/,
    );
  }

  const evaluationTarget = {
    domain_id: 'target-agent',
    target_agent_ref: 'domain-agent:target-agent',
    descriptor_ref: '/tmp/target-agent/contracts/domain_descriptor.json',
  };
  for (const invalid of [
    {
      evaluation_target_agent: evaluationTarget,
      evaluation_provenance_refs: ['evaluation-receipt:public-runner/paired'],
    },
    {
      evaluation_target_agent: evaluationTarget,
      evaluation_provenance_refs: ['evaluation-receipt:public-runner/paired'],
      evaluation_provenance_bindings: [{
        receipt_role: 'unknown_evaluation_role',
        receipt_ref: 'evaluation-receipt:public-runner/paired',
      }],
    },
    {
      evaluation_target_agent: evaluationTarget,
      evaluation_provenance_refs: ['evaluation-receipt:public-runner/raw'],
      evaluation_provenance_bindings: [{
        receipt_role: 'evaluation_packet',
        receipt_ref: 'evaluation-receipt:public-runner/binding',
      }],
    },
    {
      evaluation_target_agent: evaluationTarget,
      evaluation_provenance_refs: ['evaluation-receipt:public-runner/context'],
      evaluation_provenance_bindings: [{
        receipt_role: 'evaluation_packet',
        receipt_ref: 'evaluation-receipt:public-runner/context',
        task_id: ' ',
      }],
    },
  ]) {
    assert.throws(() => runAgentLabSuite({ ...suite, ...invalid } as any), /evaluation_provenance/);
  }
  const baseline = runAgentLabSuite(suite);
  const targeted = runAgentLabSuite({ ...suite, evaluation_target_agent: evaluationTarget });
  assert.notEqual(targeted.result_id, baseline.result_id);
  assert.deepEqual(targeted.evaluation_target_agent, evaluationTarget);
});

test('Agent Lab canonicalizes evaluation provenance before stable identity and readback', () => {
  const suite = buildSampleAgentLabSuite();
  const evaluationTarget = {
    domain_id: 'target-agent',
    target_agent_ref: 'domain-agent:target-agent',
    descriptor_ref: '/tmp/target-agent/contracts/domain_descriptor.json',
  };
  const packetRef = 'evaluation-receipt:public-runner/packet';
  const probeARef = 'evaluation-receipt:public-runner/probe-a';
  const probeBRef = 'evaluation-receipt:public-runner/probe-b';
  const packetBinding = { receipt_role: 'evaluation_packet' as const, receipt_ref: packetRef };
  const canonicalBindings = [
    packetBinding,
    {
      receipt_role: 'recovery_probe_observation' as const,
      receipt_ref: probeARef,
      task_id: 'agent-lab-task:target-agent/a',
      probe_ref: 'recovery-probe:target-agent/a',
    },
    {
      receipt_role: 'recovery_probe_observation' as const,
      receipt_ref: probeBRef,
      task_id: 'agent-lab-task:target-agent/b',
      probe_ref: 'recovery-probe:target-agent/b',
    },
  ];
  const first = runAgentLabSuite({
    ...suite,
    evaluation_target_agent: evaluationTarget,
    evaluation_provenance_refs: [probeBRef, packetRef, probeARef, packetRef],
    evaluation_provenance_bindings: [...canonicalBindings].reverse(),
  });
  const reordered = runAgentLabSuite({
    ...suite,
    evaluation_target_agent: evaluationTarget,
    evaluation_provenance_refs: [probeARef, probeBRef, packetRef],
    evaluation_provenance_bindings: canonicalBindings,
  });

  assert.equal(first.result_id, reordered.result_id);
  assert.deepEqual(first.refs.evaluation_provenance_refs, [packetRef, probeARef, probeBRef]);
  assert.deepEqual(first.evaluation_provenance_bindings, canonicalBindings);
  assert.deepEqual(reordered.evaluation_provenance_bindings, canonicalBindings);

  const singleBinding = runAgentLabSuite({
    ...suite,
    evaluation_target_agent: evaluationTarget,
    evaluation_provenance_refs: [packetRef],
    evaluation_provenance_bindings: [packetBinding],
  });
  const duplicateBinding = runAgentLabSuite({
    ...suite,
    evaluation_target_agent: evaluationTarget,
    evaluation_provenance_refs: [packetRef, packetRef],
    evaluation_provenance_bindings: [packetBinding, packetBinding],
  });
  assert.equal(duplicateBinding.result_id, singleBinding.result_id);
  assert.deepEqual(duplicateBinding.refs.evaluation_provenance_refs, [packetRef]);
  assert.deepEqual(duplicateBinding.evaluation_provenance_bindings, [packetBinding]);
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

test('Agent Lab contract is tracked and exported as an OPL framework surface', () => {
  const contract = readJson('contracts/opl-framework/agent-lab-contract.json');
  const packageJson = readJson('package.json');

  assert.equal(contract.contract_kind, 'opl_agent_lab_contract.v1');
  assert.equal(contract.surface_kind, 'opl_agent_lab_contract');
  assert.equal(contract.contract_version, 'opl-agent-lab.v1');
  assertIncludesAll(contract.result_surface.suite_kinds, [
    'agent_lab_sample_suite',
    'agent_lab_longline_suite',
    'agent_lab_external_suite',
    'agent_production_evidence_suite',
  ]);
  assertIncludesAll(contract.result_surface.ref_fields, [
    'mechanism_evolution_input_refs',
    'production_evidence_gate_result_refs',
    'failure_delta_refs',
    'promotion_receipt_refs',
  ]);
  assertIncludesAll(contract.input_surfaces, [
    'variant_candidate_refs',
    'runtime_event_ledger_refs',
    'provider_switch_hygiene_refs',
    'claim_assurance_map_refs',
  ]);
  assert.equal(contract.external_suite_runner_surface.cli, 'opl agent-lab run --suite <suite.json>');
  assert.equal(
    contract.external_suite_runner_surface.evaluation_target_guard.provenance_requires_target,
    true,
  );
  assert.deepEqual(
    contract.external_suite_runner_surface.evaluation_target_guard.binding_canonical_sort_keys,
    ['receipt_role', 'task_id', 'probe_ref', 'receipt_ref'],
  );
  assert.equal(
    contract.external_suite_runner_surface.evaluation_target_guard.duplicate_binding_tuple_policy,
    'deduplicate_before_sort',
  );
  assert.equal(
    contract.external_suite_runner_surface.evaluation_target_guard.reordered_semantics_preserve_result_identity,
    true,
  );
  assert.equal(
    contract.evaluation_work_order_consumer_surface.cli,
    'opl agent-lab evaluation-work-order execute --work-order <work-order.json> [--observations <observation-packet.json>] --output <dir>',
  );
  assert.equal(
    contract.evaluation_work_order_consumer_surface.accepted_work_order.status,
    'ready_for_opl_foundry_lab_evaluation',
  );
  assert.equal(
    contract.evaluation_work_order_consumer_surface.canonical_evaluation_owner,
    'one-person-lab/OPL Foundry Lab',
  );
  assert.equal(
    contract.evaluation_work_order_consumer_surface.canonical_target_owner_closeout_owner,
    'target-domain',
  );
  assertIncludesAll(
    contract.evaluation_work_order_consumer_surface.accepted_work_order.canonical_target_agent_fields,
    ['domain_id', 'target_agent_ref', 'descriptor_ref'],
  );
  assert.equal(
    contract.evaluation_work_order_consumer_surface.observation_packet.required_for_agent_lab_suite_materialization,
    true,
  );
  assert.deepEqual(
    contract.evaluation_work_order_consumer_surface.observation_packet.required_provenance_fields,
    ['evaluation_owner', 'evaluation_receipt_ref'],
  );
  assertIncludesAll(
    contract.evaluation_work_order_consumer_surface.observation_packet.identity_match_fields,
    ['domain_id', 'task_id', 'target_agent_ref', 'probe_ref', 'trajectory_ref', 'scorecard_ref', 'gate_ref'],
  );
  assert.equal(
    contract.evaluation_work_order_consumer_surface.observation_packet.unknown_true_authority_claim_policy,
    'reject_before_agent_lab_execution',
  );
  assert.equal(
    contract.evaluation_work_order_consumer_surface.request_observation_policy.required_observations_owner,
    'opl_agent_lab_canonical_policy',
  );
  assert.equal(
    contract.evaluation_work_order_consumer_surface.request_observation_policy.request_production_gate_is_observation,
    false,
  );
  assert.equal(
    contract.evaluation_work_order_consumer_surface.output_reuse_policy,
    'fail_closed_when_known_evaluation_artifacts_exist',
  );
  assert.equal(
    contract.evaluation_work_order_consumer_surface.evaluation_provenance_bundle.suite_field,
    'evaluation_provenance_refs',
  );
  assert.equal(
    contract.evaluation_work_order_consumer_surface.evaluation_provenance_bundle.binding_field,
    'evaluation_provenance_bindings',
  );
  assert.equal(
    contract.evaluation_work_order_consumer_surface.evaluation_target_identity.suite_field,
    'evaluation_target_agent',
  );
  assert.equal(
    contract.evaluation_work_order_consumer_surface.blocked_suite_result.platform_blocker_policy,
    'missing_observations_or_consumer_platform_gap_only',
  );
  assert.equal(
    contract.evaluation_work_order_consumer_surface.improvement_candidate_scope.unknown_scope_policy,
    'contract_shape_invalid',
  );
  assert.equal(
    contract.evaluation_work_order_consumer_surface.candidate_ref_projection.immediate_improvement_source,
    'evaluation_request.task_intents[].improvement_candidate.candidate_ref',
  );
  assert.equal(
    contract.evaluation_work_order_consumer_surface.production_evidence_gate_observation.request_gate_refs_are_observations,
    false,
  );
  assert.equal(
    contract.evaluation_work_order_consumer_surface.no_observation_result.writes_agent_lab_suite_result,
    false,
  );
  assert.deepEqual(
    contract.evaluation_work_order_consumer_surface.immediate_output_fields,
    [
      'agent_lab_suite_result_ref',
      'foundry_lab_execution_receipt_ref',
      'improvement_candidate_refs',
      'promotion_gate_refs',
    ],
  );
  assert.deepEqual(
    contract.evaluation_work_order_consumer_surface.downstream_conditional_output_fields,
    [
      'mechanism_proposal_refs',
      'scaleout_ledger_refs',
      'target_owner_receipt_or_typed_blocker_ref',
    ],
  );
  assert.equal(
    contract.evaluation_work_order_consumer_surface.authority_boundary.can_create_target_typed_blocker,
    false,
  );
  assert.equal(
    contract.evaluation_work_order_consumer_surface.authority_boundary.can_write_owner_receipt,
    false,
  );
  assert.equal(contract.production_evidence_gate_surface.refs_only, true);
  assert.equal(contract.production_evidence_gate_surface.domain_verdict_claimed, false);
  assert.equal(contract.promotion_safety_assessment_surface.high_risk_policy,
    'high_risk changes require owner_or_human_gate_refs and never set automatic_mechanism_promotion_ready=true');
  assert.equal(contract.mechanism_evolution_input_surface.refs_only, true);
  assertIncludesAll(contract.mechanism_evolution_input_surface.forbidden_payloads, [
    'owner_receipt_body',
    'shared_submission_action',
  ]);
  assert.equal(contract.mechanism_surface.cli, 'opl agent-lab mechanism');
  assert.equal(contract.mechanism_surface.automatic_mechanism_promotion_ready, false);
  assert.equal(contract.developer_mode_repair_route_surface.refs_only, true);
  assert.equal(contract.developer_mode_repair_route_surface.non_authority_outputs.writes_domain_truth, false);
  assert.equal(contract.developer_mode_repair_route_surface.non_authority_outputs.writes_owner_receipt, false);
  assert.equal(contract.evolution_surface.refs_only, true);
  assert.equal(contract.evolution_surface.writes_domain_truth, false);
  assert.equal(contract.evolution_surface.writes_memory_body, false);
  assert.equal(contract.evolution_surface.automatic_mechanism_promotion_ready, false);
  assert.equal(contract.longline_surface.suite_kind, 'agent_lab_longline_suite');
  assert.equal(contract.complete_control_plane_surface.surface_kind, 'opl_agent_lab_complete_control_plane');
  assertIncludesAll(contract.complete_control_plane_surface.readiness_fields, [
    'automatic_mechanism_promotion_ready',
    'ready_to_emit_integration_contracts',
    'ready_to_emit_stage_executor_policy_read_model',
  ]);
  assert.equal(contract.stage_executor_policy_surface.refs_only, true);
  assert.equal(contract.stage_executor_policy_surface.canonical_trial_example.default_path, false);
  assert.equal(contract.integration_contract_surface.refs_only, true);
  assert.equal(contract.review_trace_ledger_surface.refs_only, true);
  assert.equal(contract.log_driven_candidate_surface.refs_only, true);
  assert.equal(contract.aris_maturity_controls_surface.refs_only, true);
  assert.equal(contract.aris_maturity_controls_surface.runtime_dependency_required, false);
  assert.equal(contract.export_surface.surface_kind, 'opl_agent_lab_export_envelope');
  assertIncludesAll(contract.export_surface.source_ref_groups, [
    'complete_control_plane_ref',
    'integration_contract_refs',
    'review_trace_refs',
    'log_mined_candidate_refs',
  ]);
  assert.ok(contract.longline_surface.repo_test_candidates_to_move_to_opl.includes(
    'provider-hosted soak orchestration',
  ));
  assert.equal(packageJson.exports['./agent-lab'], './dist/modules/foundry-lab/agent-lab.js');

  assertIncludesAll(contract.required_observations, [
    'task_manifests_observed',
    'agent_trajectories_observed',
    'recovery_probes_observed',
    'domain_quality_scorecard_refs_observed',
    'failure_taxonomy_observed',
    'improvement_candidates_observed',
    'promotion_gates_observed',
    'no_memory_body_observed',
    'forbidden_authority_flags_all_false',
  ]);

  assertIncludesAll(contract.domain_retained_authority, [
    'domain truth',
    'domain quality verdict',
    'domain artifact authority',
    'domain memory body',
    'writeback accept/reject decision',
    'owner receipt',
  ]);
});

test('Agent Lab longline suite centralizes planned MAS, MAG, and RCA soak tests into OPL-owned read-model gates', () => {
  const result = buildLonglineAgentLabResult();

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
