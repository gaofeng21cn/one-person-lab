import { AGENT_LAB_AUTHORITY_BOUNDARY } from './agent-lab-authority.ts';
import { stableId } from '../runway/index.ts';

type StageExecutorPolicyCandidate = {
  candidate_ref: string;
  candidate_kind: 'stage_executor_policy';
  stage_pattern_ref: string;
  route_example_ref: string;
  executor_policy: {
    executor_kind: 'codex_cli' | 'antigravity_cli' | 'claude_code' | 'hermes_agent';
    model: string;
    reasoning_effort: string;
    provider: string;
    executor_binding_ref: string | null;
    executor_labels: string[];
    required_capabilities: string[];
    receipt_requirements: string[];
  };
  comparison_hypothesis_ref: string;
  optimization_target_refs: string[];
  required_test_refs: string[];
  status: 'baseline_default' | 'ready_for_controlled_trial' | 'blocked_missing_binding';
  can_launch_without_binding: boolean;
  can_claim_quality_equivalence: boolean;
  can_change_default_executor: boolean;
};

const POLICY_CANDIDATES: StageExecutorPolicyCandidate[] = [
  {
    candidate_ref: 'stage-executor-policy-candidate:codex-cli/default-stage-pack',
    candidate_kind: 'stage_executor_policy',
    stage_pattern_ref: 'stage-pattern:generic-open-ended-agent-work',
    route_example_ref: 'route-example:opl/default-codex-stage',
    executor_policy: {
      executor_kind: 'codex_cli',
      model: 'inherited_codex_default',
      reasoning_effort: 'inherited_codex_default',
      provider: 'openai',
      executor_binding_ref: 'opl://executors/codex-cli/default',
      executor_labels: ['default', 'first_class', 'general_expert_work'],
      required_capabilities: [
        'workspace_editing',
        'shell_tools',
        'repo_verification',
        'structured_receipt',
      ],
      receipt_requirements: [
        'stage_attempt_receipt_ref',
        'executor_receipt_ref',
        'no_forbidden_write_proof_ref',
      ],
    },
    comparison_hypothesis_ref: 'hypothesis-ref:agent-lab/stage-executor-policy/codex-default-baseline',
    optimization_target_refs: [
      'optimization-target-ref:general-correctness',
      'optimization-target-ref:maintainability',
      'optimization-target-ref:verification-depth',
    ],
    required_test_refs: [
      'test-ref:agent-lab/stage-executor-policy/codex-baseline-receipt',
      'test-ref:agent-lab/stage-executor-policy/no-forbidden-write',
    ],
    status: 'baseline_default',
    can_launch_without_binding: true,
    can_claim_quality_equivalence: false,
    can_change_default_executor: false,
  },
  {
    candidate_ref: 'stage-executor-policy-candidate:rca-html-route/antigravity-gemini-flash-high',
    candidate_kind: 'stage_executor_policy',
    stage_pattern_ref: 'stage-pattern:rca-html-visual-deliverable-build',
    route_example_ref: 'route-example:rca/ppt-html-route',
    executor_policy: {
      executor_kind: 'antigravity_cli',
      model: 'gemini-3.5-flash',
      reasoning_effort: 'high',
      provider: 'google',
      executor_binding_ref: 'executor-binding:antigravity/rca-html-route',
      executor_labels: ['non_default', 'experimental', 'html_route_candidate', 'fast_iteration'],
      required_capabilities: [
        'html_generation',
        'visual_layout_iteration',
        'json_or_text_output',
        'stage_attempt_closeout_packet',
      ],
      receipt_requirements: [
        'executor_binding_ref',
        'stage_attempt_receipt_ref',
        'executor_receipt_ref',
        'artifact_render_probe_ref',
        'no_forbidden_write_proof_ref',
        'quality_non_equivalence_notice',
      ],
    },
    comparison_hypothesis_ref: 'hypothesis-ref:agent-lab/stage-executor-policy/rca-html-antigravity-speed',
    optimization_target_refs: [
      'optimization-target-ref:rca-html-route-latency',
      'optimization-target-ref:html-layout-quality',
      'optimization-target-ref:artifact-render-pass-rate',
    ],
    required_test_refs: [
      'test-ref:agent-lab/stage-executor-policy/antigravity-binding-required',
      'test-ref:agent-lab/stage-executor-policy/rca-html-render-probe',
      'test-ref:agent-lab/stage-executor-policy/codex-baseline-comparison',
      'test-ref:agent-lab/stage-executor-policy/no-equivalence-claim',
    ],
    status: 'ready_for_controlled_trial',
    can_launch_without_binding: false,
    can_claim_quality_equivalence: false,
    can_change_default_executor: false,
  },
  {
    candidate_ref: 'stage-executor-policy-candidate:independent-review/claude-code-or-hermes',
    candidate_kind: 'stage_executor_policy',
    stage_pattern_ref: 'stage-pattern:independent-ai-review-or-audit',
    route_example_ref: 'route-example:agent-lab/no-shared-context-review',
    executor_policy: {
      executor_kind: 'claude_code',
      model: 'explicit_non_default_review_model',
      reasoning_effort: 'high',
      provider: 'explicit_adapter',
      executor_binding_ref: null,
      executor_labels: ['non_default', 'reviewer_candidate', 'requires_explicit_binding'],
      required_capabilities: [
        'independent_review',
        'direct_evidence_audit',
        'structured_receipt',
      ],
      receipt_requirements: [
        'executor_binding_ref',
        'review_attempt_ref',
        'no_shared_context_ref',
        'reviewer_provenance_ref',
      ],
    },
    comparison_hypothesis_ref: 'hypothesis-ref:agent-lab/stage-executor-policy/independent-reviewer-diversity',
    optimization_target_refs: [
      'optimization-target-ref:review-independence',
      'optimization-target-ref:direct-evidence-coverage',
    ],
    required_test_refs: [
      'test-ref:agent-lab/stage-executor-policy/non-default-binding-required',
      'test-ref:agent-lab/stage-executor-policy/no-shared-context-review',
    ],
    status: 'blocked_missing_binding',
    can_launch_without_binding: false,
    can_claim_quality_equivalence: false,
    can_change_default_executor: false,
  },
];

export function buildAgentLabStageExecutorPolicyReadModel(sourceRefs: string[] = []) {
  const candidates = POLICY_CANDIDATES;
  const candidateRefs = candidates.map((candidate) => candidate.candidate_ref);
  const trialReady = candidates.filter((candidate) => candidate.status === 'ready_for_controlled_trial');
  const blocked = candidates.filter((candidate) => candidate.status === 'blocked_missing_binding');
  const requiredTestRefs = [...new Set(candidates.flatMap((candidate) => candidate.required_test_refs))];

  return {
    surface_kind: 'opl_agent_lab_stage_executor_policy_read_model',
    version: 'opl-agent-lab.v1.stage-executor-policy',
    read_model_id: stableId('oalsep', [candidateRefs, sourceRefs]),
    status: 'ready_for_refs_only_stage_executor_policy_optimization',
    refs_only: true,
    default_executor_kind: 'codex_cli',
    canonical_non_default_executor_kinds: ['hermes_agent', 'claude_code', 'antigravity_cli'],
    candidate_count: candidates.length,
    trial_ready_candidate_count: trialReady.length,
    blocked_candidate_count: blocked.length,
    policy_candidates: candidates,
    test_matrix: {
      matrix_ref: stableId('oalsept', [candidateRefs, requiredTestRefs]),
      required_test_refs: requiredTestRefs,
      required_observation_refs: [
        'stage_attempt_receipt_ref',
        'executor_receipt_ref',
        'executor_binding_ref',
        'latency_or_duration_ref',
        'artifact_render_probe_ref',
        'no_forbidden_write_proof_ref',
        'independent_ai_review_ref',
      ],
      baseline_executor_kind: 'codex_cli',
      non_default_executor_launch_policy: 'explicit_binding_required_fail_closed',
      quality_equivalence_policy: 'never_claim_equivalence_from_connectivity_or_speed',
      default_promotion_policy: 'requires_agent_lab_gate_owner_route_and_real_receipts',
    },
    recommended_trials: trialReady.map((candidate) => ({
      trial_ref: stableId('oalseptr', [candidate.candidate_ref, sourceRefs]),
      candidate_ref: candidate.candidate_ref,
      stage_pattern_ref: candidate.stage_pattern_ref,
      executor_kind: candidate.executor_policy.executor_kind,
      model: candidate.executor_policy.model,
      reasoning_effort: candidate.executor_policy.reasoning_effort,
      provider: candidate.executor_policy.provider,
      required_test_refs: candidate.required_test_refs,
      can_start_as_default: false,
    })),
    typed_blockers: blocked.map((candidate) => ({
      blocker_ref: stableId('oalsepb', [candidate.candidate_ref, 'missing-binding']),
      candidate_ref: candidate.candidate_ref,
      blocker_kind: 'non_default_executor_binding_ref_missing',
      required_ref: 'executor_binding_ref',
      fallback_allowed: false,
    })),
    authority_boundary: {
      ...AGENT_LAB_AUTHORITY_BOUNDARY,
      can_execute_non_default_executor: false,
      can_change_default_executor: false,
      can_claim_quality_equivalence: false,
      can_claim_tool_semantics_equivalence: false,
      can_claim_resume_equivalence: false,
    },
  };
}
