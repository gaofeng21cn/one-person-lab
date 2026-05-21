import { AGENT_LAB_AUTHORITY_BOUNDARY } from './agent-lab-authority.ts';
import { stableId } from './family-runtime-ids.ts';
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
  ];

  return base.map((candidate) => {
    const candidateRef = `variant-candidate-ref:agent-lab/${slugRef(input.task.task_id)}/${candidate.variant_suffix}`;
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
      predicted_impact_refs: input.blockedEvidenceRefs.map((ref) =>
        `predicted-impact-ref:agent-lab/${slugRef(input.task.task_id)}/${slugRef(ref)}`),
      next_run_falsification_refs: input.nextRunFalsificationRefs.length > 0
        ? input.nextRunFalsificationRefs
        : input.blockedEvidenceRefs.map((ref) =>
          `next-run-falsification-ref:agent-lab/${slugRef(input.task.task_id)}/${slugRef(ref)}`),
      promotion_eligibility: {
        eligible_for_variant_eval: true,
        eligible_for_existing_promotion_gate: false,
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
      },
      authority_boundary: CODEX_ATTEMPT_TRACE_FLYWHEEL_AUTHORITY_BOUNDARY,
    };
  });
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
