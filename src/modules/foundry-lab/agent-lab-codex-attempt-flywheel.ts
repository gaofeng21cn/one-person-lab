import { AGENT_LAB_AUTHORITY_BOUNDARY } from './agent-lab-authority.ts';
import { stableId } from '../../kernel/stable-id.ts';
import type { AgentLabSuite, AgentLabTaskManifest } from './agent-lab.ts';

type JsonRecord = Record<string, unknown>;

const CODEX_ATTEMPT_TRACE_REF_FIELDS = [
  'command_refs',
  'file_refs',
  'subagent_refs',
  'worktree_refs',
  'test_refs',
  'web_source_refs',
  'typed_blocker_refs',
  'review_receipt_refs',
  'next_run_falsification_refs',
] as const;

type CodexAttemptTraceRefField = typeof CODEX_ATTEMPT_TRACE_REF_FIELDS[number];

const CODEX_ATTEMPT_TRACE_FLYWHEEL_AUTHORITY_BOUNDARY = {
  ...AGENT_LAB_AUTHORITY_BOUNDARY,
  contract_role: 'refs_only_evidence_learning_loop_read_model',
  can_authorize_domain_ready: false,
  can_authorize_quality_verdict: false,
  can_promote_default_agent: false,
  can_train_or_deploy_model_weights: false,
  can_mutate_artifact_body: false,
  can_write_domain_truth: false,
};

const DEFAULT_REPLAY_FORK_VARIANT_COUNT = 3;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
}

function stringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return unique(value.filter((entry): entry is string => typeof entry === 'string'));
}

function nestedTraceRecords(task: AgentLabTaskManifest) {
  const inputs = isRecord(task.mechanism_evolution_inputs) ? task.mechanism_evolution_inputs : {};
  return [
    task.trajectory,
    isRecord(inputs.codex_attempt_trace) ? inputs.codex_attempt_trace : null,
    isRecord(inputs.agent_lab_codex_attempt_trace) ? inputs.agent_lab_codex_attempt_trace : null,
    isRecord(inputs.attempt_trace) ? inputs.attempt_trace : null,
  ].filter(isRecord);
}

function refsForField(task: AgentLabTaskManifest, field: CodexAttemptTraceRefField) {
  return unique(nestedTraceRecords(task).flatMap((record) => stringList(record[field])));
}

function slugRef(value: string) {
  return value.replace(/[^a-zA-Z0-9:_/-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function runRecordByTaskId(results: unknown[] | undefined) {
  const byTaskId = new Map<string, JsonRecord>();
  for (const result of results ?? []) {
    if (isRecord(result) && typeof result.task_id === 'string') {
      byTaskId.set(result.task_id, result);
    }
  }
  return byTaskId;
}

function resultStrings(record: JsonRecord | undefined, key: string) {
  return record ? stringList(record[key]) : [];
}

function numericValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function replayForkVariantCount(task: AgentLabTaskManifest) {
  const inputs = isRecord(task.mechanism_evolution_inputs) ? task.mechanism_evolution_inputs : {};
  const configured = numericValue(inputs.replay_fork_variant_count);
  if (!configured) {
    return DEFAULT_REPLAY_FORK_VARIANT_COUNT;
  }
  return Math.max(1, Math.floor(configured));
}

function missingTraceFieldBlockerRefs(task: AgentLabTaskManifest, refsByField: Record<CodexAttemptTraceRefField, string[]>) {
  return CODEX_ATTEMPT_TRACE_REF_FIELDS
    .filter((field) => refsByField[field].length === 0)
    .map((field) => `typed-blocker-ref:agent-lab/${slugRef(task.task_id)}/codex-attempt-trace-${field}-missing`);
}

function executorBlockerRefs(task: AgentLabTaskManifest) {
  return task.trajectory.agent_executor === 'codex_cli'
    ? []
    : [`typed-blocker-ref:agent-lab/${slugRef(task.task_id)}/non-codex-first-executor`];
}

function runBlockedEvidenceRefs(run: JsonRecord | undefined) {
  if (!run) {
    return [];
  }
  const promotionSafetyAssessment = isRecord(run.promotion_safety_assessment)
    ? run.promotion_safety_assessment
    : {};
  return unique([
    ...resultStrings(run, 'failure_taxonomy').map((entry) => `failure-taxonomy-ref:${entry}`),
    ...stringList(promotionSafetyAssessment.missing_required_refs).map((entry) =>
      `missing-required-ref:${entry}`),
    ...stringList(promotionSafetyAssessment.failure_delta_refs),
  ]);
}

function forkCandidates(input: {
  suiteId: string;
  task: AgentLabTaskManifest;
  refsByField: Record<CodexAttemptTraceRefField, string[]>;
  blockedEvidenceRefs: string[];
  nextRunFalsificationRefs: string[];
}) {
  if (input.blockedEvidenceRefs.length === 0) {
    return [];
  }
  const base = [
    {
      fork_kind: 'prompt_variant',
      variant_suffix: 'prompt-context-tightening',
      target_ref: input.task.improvement_candidate.target_ref,
    },
    {
      fork_kind: 'stage_policy_variant',
      variant_suffix: 'stage-gate-falsification',
      target_ref: input.task.promotion_gate.gate_ref,
    },
    {
      fork_kind: 'reviewer_blocker_variant',
      variant_suffix: 'reviewer-blocker-isolation',
      target_ref: input.task.scorecard.scorecard_ref,
    },
  ];

  return base.slice(0, replayForkVariantCount(input.task)).map((candidate, index) => {
    const candidateRef = `variant-candidate-ref:agent-lab/${slugRef(input.task.task_id)}/${candidate.variant_suffix}`;
    const regressionCount = input.blockedEvidenceRefs.length + index + 1;
    const evidenceDelta = {
      delta_ref: stableId('oalcfd', [input.suiteId, input.task.task_id, candidateRef, input.blockedEvidenceRefs]),
      blocked_evidence_refs: input.blockedEvidenceRefs,
      added_evidence_refs: unique([
        ...input.task.improvement_candidate.evidence_refs,
        ...input.blockedEvidenceRefs,
      ]),
      domain_truth_delta_written: false,
      memory_body_delta_written: false,
      artifact_delta_written: false,
    };

    return {
      candidate_ref: candidateRef,
      fork_kind: candidate.fork_kind,
      source_task_id: input.task.task_id,
      source_candidate_ref: input.task.improvement_candidate.candidate_ref,
      target_ref: candidate.target_ref,
      evidence_delta: evidenceDelta,
      command_refs: input.refsByField.command_refs,
      file_refs: input.refsByField.file_refs,
      subagent_refs: input.refsByField.subagent_refs,
      worktree_refs: input.refsByField.worktree_refs,
      test_refs: input.refsByField.test_refs,
      web_source_refs: input.refsByField.web_source_refs,
      reviewer_refs: input.refsByField.review_receipt_refs,
      blocker_refs: input.blockedEvidenceRefs,
      predicted_impact_refs: input.blockedEvidenceRefs.map((ref) =>
        `predicted-impact-ref:agent-lab/${slugRef(input.task.task_id)}/${slugRef(ref)}`),
      next_run_falsification_refs: input.nextRunFalsificationRefs.length > 0
        ? input.nextRunFalsificationRefs
        : input.blockedEvidenceRefs.map((ref) =>
          `next-run-falsification-ref:agent-lab/${slugRef(input.task.task_id)}/${slugRef(ref)}`),
      cost_duration: {
        estimate_ref: `cost-duration-estimate-ref:agent-lab/${slugRef(input.task.task_id)}/${candidate.variant_suffix}`,
        estimate_basis: 'ref_count_and_blocker_count_estimate_only',
        estimated_cost_units: input.blockedEvidenceRefs.length + input.refsByField.command_refs.length + index + 1,
        estimated_duration_minutes: 5 + (input.blockedEvidenceRefs.length * 2) + (index * 3),
        actual_provider_usage_receipt_ref: null,
      },
      regression_count: regressionCount,
      learning_only: true,
      promotion_eligibility: {
        eligible_for_variant_eval: true,
        eligible_for_existing_promotion_gate: false,
        promotion_eligible: false,
        required_before_promotion_refs: [
          'independent-ai-review-receipt-ref',
          'no-forbidden-write-proof-ref',
          'promotion-receipt-ref',
          'rollback-target-ref',
          'canary-observation-ref',
        ],
        can_authorize_domain_ready: false,
        can_authorize_quality_verdict: false,
        can_promote_default_agent: false,
        can_train_or_deploy_model_weights: false,
        can_mutate_artifact_body: false,
        can_mutate_artifact: false,
      },
      authority_boundary: CODEX_ATTEMPT_TRACE_FLYWHEEL_AUTHORITY_BOUNDARY,
    };
  });
}

function buildCodexAttemptTraceBundle(input: {
  suiteId: string;
  attempts: Array<{
    task_id: string;
    domain_id: string;
    attempt_trace_ref: string;
    command_refs: string[];
    file_refs: string[];
    subagent_refs: string[];
    worktree_refs: string[];
    test_refs: string[];
    web_source_refs: string[];
    typed_blocker_refs: string[];
    review_receipt_refs: string[];
    blocked_evidence_refs: string[];
  }>;
}) {
  const traces = input.attempts.map((attempt) => ({
    attempt_trace_ref: attempt.attempt_trace_ref,
    task_id: attempt.task_id,
    domain_id: attempt.domain_id,
    command_refs: attempt.command_refs,
    file_refs: attempt.file_refs,
    subagent_refs: attempt.subagent_refs,
    worktree_refs: attempt.worktree_refs,
    test_refs: attempt.test_refs,
    web_source_refs: attempt.web_source_refs,
    reviewer_refs: attempt.review_receipt_refs,
    blocker_refs: unique([...attempt.typed_blocker_refs, ...attempt.blocked_evidence_refs]),
    refs_only: true,
    authority_boundary: CODEX_ATTEMPT_TRACE_FLYWHEEL_AUTHORITY_BOUNDARY,
  }));
  return {
    surface_kind: 'opl_agent_lab_codex_attempt_trace_bundle',
    version: 'opl-agent-lab.v1.codex-attempt-trace-bundle',
    bundle_id: stableId('oalcatb', [input.suiteId, traces.map((trace) => trace.attempt_trace_ref)]),
    suite_id: input.suiteId,
    refs_only: true,
    traces,
    refs: {
      attempt_trace_refs: traces.map((trace) => trace.attempt_trace_ref),
      command_refs: unique(traces.flatMap((trace) => trace.command_refs)),
      file_refs: unique(traces.flatMap((trace) => trace.file_refs)),
      subagent_refs: unique(traces.flatMap((trace) => trace.subagent_refs)),
      worktree_refs: unique(traces.flatMap((trace) => trace.worktree_refs)),
      test_refs: unique(traces.flatMap((trace) => trace.test_refs)),
      web_source_refs: unique(traces.flatMap((trace) => trace.web_source_refs)),
      reviewer_refs: unique(traces.flatMap((trace) => trace.reviewer_refs)),
      blocker_refs: unique(traces.flatMap((trace) => trace.blocker_refs)),
    },
    summary: {
      attempt_trace_count: traces.length,
      command_ref_count: unique(traces.flatMap((trace) => trace.command_refs)).length,
      file_ref_count: unique(traces.flatMap((trace) => trace.file_refs)).length,
      subagent_ref_count: unique(traces.flatMap((trace) => trace.subagent_refs)).length,
      worktree_ref_count: unique(traces.flatMap((trace) => trace.worktree_refs)).length,
      test_ref_count: unique(traces.flatMap((trace) => trace.test_refs)).length,
      web_source_ref_count: unique(traces.flatMap((trace) => trace.web_source_refs)).length,
      reviewer_ref_count: unique(traces.flatMap((trace) => trace.reviewer_refs)).length,
      blocker_ref_count: unique(traces.flatMap((trace) => trace.blocker_refs)).length,
    },
    authority_boundary: CODEX_ATTEMPT_TRACE_FLYWHEEL_AUTHORITY_BOUNDARY,
  };
}

function buildReplayForkVariantCockpit(input: {
  suiteId: string;
  variants: Array<{
    candidate_ref: string;
    source_task_id: string;
    evidence_delta: { delta_ref: string; blocked_evidence_refs: string[] };
    predicted_impact_refs: string[];
    next_run_falsification_refs: string[];
    cost_duration: JsonRecord;
    regression_count: number;
    learning_only: boolean;
    promotion_eligibility: JsonRecord;
  }>;
}) {
  const learningOnlyVariantRefs = input.variants
    .filter((variant) => variant.learning_only)
    .map((variant) => variant.candidate_ref);
  const promotionEligibleVariantRefs = input.variants
    .filter((variant) => variant.promotion_eligibility.promotion_eligible === true)
    .map((variant) => variant.candidate_ref);

  return {
    surface_kind: 'opl_agent_lab_replay_fork_variant_cockpit',
    version: 'opl-agent-lab.v1.replay-fork-variant-cockpit',
    cockpit_id: stableId('oalrfvc', [input.suiteId, input.variants.map((variant) => variant.candidate_ref)]),
    suite_id: input.suiteId,
    refs_only: true,
    variants: input.variants,
    learning_only_variant_refs: learningOnlyVariantRefs,
    promotion_eligible_variant_refs: promotionEligibleVariantRefs,
    refs: {
      variant_candidate_refs: input.variants.map((variant) => variant.candidate_ref),
      evidence_delta_refs: unique(input.variants.map((variant) => variant.evidence_delta.delta_ref)),
      blocked_evidence_refs: unique(input.variants.flatMap((variant) => variant.evidence_delta.blocked_evidence_refs)),
      predicted_impact_refs: unique(input.variants.flatMap((variant) => variant.predicted_impact_refs)),
      next_run_falsification_refs: unique(input.variants.flatMap((variant) => variant.next_run_falsification_refs)),
    },
    summary: {
      variant_count: input.variants.length,
      blocked_evidence_ref_count: unique(input.variants.flatMap((variant) =>
        variant.evidence_delta.blocked_evidence_refs)).length,
      learning_only_variant_count: learningOnlyVariantRefs.length,
      promotion_eligible_variant_count: promotionEligibleVariantRefs.length,
      regression_count: input.variants.reduce((total, variant) => total + variant.regression_count, 0),
    },
    promotion_eligibility: {
      selected_variant_required_for_existing_promotion_gate: true,
      unselected_variants_can_authorize_domain_ready: false,
      unselected_variants_can_authorize_quality_verdict: false,
      unselected_variants_can_mutate_artifact: false,
      unselected_variants_can_promote_default_agent: false,
    },
    authority_boundary: CODEX_ATTEMPT_TRACE_FLYWHEEL_AUTHORITY_BOUNDARY,
  };
}

export function buildAgentLabCodexAttemptTraceFlywheel(input: {
  suite: AgentLabSuite;
  results?: unknown[];
}) {
  const resultByTaskId = runRecordByTaskId(input.results);
  const attempts = input.suite.tasks.map((task) => {
    const refsByField = Object.fromEntries(CODEX_ATTEMPT_TRACE_REF_FIELDS.map((field) => [
      field,
      refsForField(task, field),
    ])) as Record<CodexAttemptTraceRefField, string[]>;
    const generatedBlockerRefs = unique([
      ...missingTraceFieldBlockerRefs(task, refsByField),
      ...executorBlockerRefs(task),
    ]);
    const typedBlockerRefs = unique([
      ...refsByField.typed_blocker_refs,
      ...generatedBlockerRefs,
    ]);
    const run = resultByTaskId.get(task.task_id);
    const blockedEvidenceRefs = runBlockedEvidenceRefs(run);
    const status = generatedBlockerRefs.length > 0
      ? 'typed_blocker'
      : blockedEvidenceRefs.length > 0
        ? 'blocked_evidence_ready_for_fork'
        : 'trace_ready';
    const variants = forkCandidates({
      suiteId: input.suite.suite_id,
      task,
      refsByField,
      blockedEvidenceRefs,
      nextRunFalsificationRefs: refsByField.next_run_falsification_refs ?? [],
    });

    return {
      task_id: task.task_id,
      domain_id: task.domain_id,
      attempt_trace_ref: stableId('oalcat', [input.suite.suite_id, task.task_id, refsByField, blockedEvidenceRefs]),
      executor_binding: {
        executor: task.trajectory.agent_executor,
        codex_cli_first_class: task.trajectory.agent_executor === 'codex_cli',
        executor_first: true,
      },
      status,
      ...refsByField,
      typed_blocker_refs: typedBlockerRefs,
      generated_typed_blocker_refs: generatedBlockerRefs,
      blocked_evidence_refs: blockedEvidenceRefs,
      fork_candidate_refs: variants.map((variant) => variant.candidate_ref),
      variant_candidates: variants,
      evidence_learning_loop: {
        loop_role: 'collect_blocked_evidence_refs_then_fork_variant_candidates_for_next_run_falsification',
        refs_only: true,
        can_apply_learning_to_domain_truth: false,
        can_mutate_artifact_body: false,
      },
      authority_boundary: CODEX_ATTEMPT_TRACE_FLYWHEEL_AUTHORITY_BOUNDARY,
    };
  });
  const variantCandidates = attempts.flatMap((attempt) => attempt.variant_candidates);
  const codexAttemptTraceBundle = buildCodexAttemptTraceBundle({
    suiteId: input.suite.suite_id,
    attempts,
  });
  const replayForkVariantCockpit = buildReplayForkVariantCockpit({
    suiteId: input.suite.suite_id,
    variants: variantCandidates,
  });

  return {
    surface_kind: 'opl_agent_lab_codex_attempt_trace_flywheel',
    version: 'opl-agent-lab.v1.codex-attempt-trace-flywheel',
    read_model_id: stableId('oalcatf', [
      input.suite.suite_id,
      attempts.map((attempt) => attempt.attempt_trace_ref),
      variantCandidates.map((candidate) => candidate.candidate_ref),
    ]),
    suite_id: input.suite.suite_id,
    refs_only: true,
    semantic_boundary: 'refs_only_evidence_learning_loop_not_domain_quality_or_training_authority',
    required_trace_ref_fields: CODEX_ATTEMPT_TRACE_REF_FIELDS,
    codex_attempt_trace_bundle: codexAttemptTraceBundle,
    replay_fork_variant_cockpit: replayForkVariantCockpit,
    attempts,
    variant_candidates: variantCandidates,
    refs: {
      attempt_trace_refs: attempts.map((attempt) => attempt.attempt_trace_ref),
      command_refs: unique(attempts.flatMap((attempt) => attempt.command_refs)),
      file_refs: unique(attempts.flatMap((attempt) => attempt.file_refs)),
      subagent_refs: unique(attempts.flatMap((attempt) => attempt.subagent_refs)),
      worktree_refs: unique(attempts.flatMap((attempt) => attempt.worktree_refs)),
      test_refs: unique(attempts.flatMap((attempt) => attempt.test_refs)),
      web_source_refs: unique(attempts.flatMap((attempt) => attempt.web_source_refs)),
      typed_blocker_refs: unique(attempts.flatMap((attempt) => attempt.typed_blocker_refs)),
      review_receipt_refs: unique(attempts.flatMap((attempt) => attempt.review_receipt_refs)),
      blocked_evidence_refs: unique(attempts.flatMap((attempt) => attempt.blocked_evidence_refs)),
      variant_candidate_refs: variantCandidates.map((candidate) => candidate.candidate_ref),
      evidence_delta_refs: unique(variantCandidates.map((candidate) => candidate.evidence_delta.delta_ref)),
      predicted_impact_refs: unique(variantCandidates.flatMap((candidate) => candidate.predicted_impact_refs)),
      next_run_falsification_refs: unique(variantCandidates.flatMap((candidate) =>
        candidate.next_run_falsification_refs)),
    },
    summary: {
      attempt_count: attempts.length,
      codex_cli_attempt_count: attempts.filter((attempt) => attempt.executor_binding.codex_cli_first_class).length,
      trace_ready_count: attempts.filter((attempt) => attempt.status === 'trace_ready').length,
      typed_blocker_count: attempts.filter((attempt) => attempt.status === 'typed_blocker').length,
      blocked_evidence_attempt_count: attempts.filter((attempt) =>
        attempt.blocked_evidence_refs.length > 0).length,
      fork_candidate_count: variantCandidates.length,
      promotion_eligible_candidate_count: 0,
      learning_only_variant_count: replayForkVariantCockpit.summary.learning_only_variant_count,
      regression_count: replayForkVariantCockpit.summary.regression_count,
    },
    promotion_eligibility: {
      flywheel_can_authorize_domain_ready: false,
      flywheel_can_authorize_quality_verdict: false,
      flywheel_can_promote_default_agent: false,
      flywheel_can_train_or_deploy_model_weights: false,
      flywheel_can_mutate_artifact_body: false,
      variant_candidates_require_existing_promotion_gate: true,
    },
    authority_boundary: CODEX_ATTEMPT_TRACE_FLYWHEEL_AUTHORITY_BOUNDARY,
  };
}
