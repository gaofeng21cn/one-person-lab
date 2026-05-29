import {
  summarizeStageAttemptUsageProjections,
} from '../family-runtime-stage-attempt-usage.ts';
import type {
  StageAttemptUsageProjection,
} from '../family-runtime-stage-attempt-usage.ts';
import {
  summarizeStageProgressLogs,
} from '../family-runtime-stage-progress-log.ts';
import type {
  StageProgressLogProjection,
} from '../family-runtime-stage-progress-log.ts';
import {
  summarizeMemoryTraceProjections,
} from '../runtime-tray-memory-locator-index.ts';
import type {
  MemoryTraceProjection,
} from '../runtime-tray-memory-locator-index.ts';
import {
  buildFamilyHumanReviewBurdenBudget,
} from '../family-human-review-budget.ts';
import {
  buildWorkbenchGenericProjections,
} from '../runtime-tray-stage-attempt-generic-projections.ts';
import type {
  StageAttemptGenericProjectionInput,
} from '../runtime-tray-stage-attempt-generic-projections.ts';
import { optionalString } from '../runtime-tray-snapshot-utils.ts';
import type { JsonRecord } from '../runtime-tray-snapshot-types.ts';

type StageAttemptProjection = StageAttemptGenericProjectionInput & {
  task_id: string | null;
  provider_kind: string;
  executor_kind: string;
  canonical_outcome: string | null;
  created_at: string;
  updated_at: string;
  local_status: string;
  filter_keys: JsonRecord;
  usage_projection: StageAttemptUsageProjection;
  stage_progress_log?: StageProgressLogProjection;
  memory_trace_projection?: MemoryTraceProjection;
  control_loop_summary?: unknown;
  transition_bridge_evidence?: unknown;
  operator_conflicts?: unknown;
  human_review_burden_budget?: unknown;
};

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function recordListFromUnknown(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function stringListFrom(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

function hasEntries(value: unknown) {
  return Array.isArray(value) && value.length > 0;
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

export function controlLoopAuthorityBoundary() {
  return {
    opl: 'refs_only_control_loop_projection',
    domain: 'truth_quality_action_receipt_owner',
    provider: 'runtime_completion_owner_not_domain_ready_owner',
    can_execute_domain_action: false,
    can_write_domain_truth: false,
    can_write_domain_memory_body: false,
    can_authorize_domain_ready: false,
    can_authorize_quality_verdict: false,
    provider_completion_is_domain_ready: false,
  };
}

export function transitionBridgeFilterKeys(attempt: { transition_bridge_evidence?: unknown }) {
  const projection = transitionBridgeProjection(attempt);
  const summary = transitionBridgeSummary(attempt);
  return {
    has_transition_bridge: projection?.availability === 'transition_bridge_observed',
    has_transition_owner_receipt_refs: Number(summary.owner_receipt_ref_count ?? 0) > 0,
    has_transition_no_regression_evidence_refs: Number(summary.no_regression_evidence_ref_count ?? 0) > 0,
    has_transition_typed_blockers: Number(summary.typed_blocker_count ?? 0) > 0,
  };
}

function countBy<T>(entries: T[], keyFor: (entry: T) => string) {
  return entries.reduce<Record<string, number>>((counts, entry) => {
    const key = keyFor(entry);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function projectionHasHumanGate(attempt: StageAttemptProjection) {
  return Boolean((attempt.filter_keys as JsonRecord).human_gate);
}

function projectionHasResume(attempt: StageAttemptProjection) {
  return Boolean((attempt.filter_keys as JsonRecord).resume_available);
}

function projectionIsDeadLetter(attempt: StageAttemptProjection) {
  return Boolean((attempt.filter_keys as JsonRecord).dead_lettered);
}

function projectionHasAttention(attempt: StageAttemptProjection) {
  return Boolean((attempt.filter_keys as JsonRecord).attention);
}

function transitionBridgeProjection(attempt: { transition_bridge_evidence?: unknown }) {
  const projection = attempt.transition_bridge_evidence;
  return isRecord(projection) ? projection : null;
}

function transitionBridgeSummary(attempt: { transition_bridge_evidence?: unknown }) {
  const summary = transitionBridgeProjection(attempt)?.summary;
  return isRecord(summary) ? summary : {};
}

function memoryRefCounters(attempts: StageAttemptProjection[]) {
  return attempts.reduce((counters, attempt) => {
    const consumedMemoryRefs = Array.isArray(attempt.consumed_memory_refs) ? attempt.consumed_memory_refs : [];
    const writebackReceiptRefs = Array.isArray(attempt.writeback_receipt_refs) ? attempt.writeback_receipt_refs : [];
    counters.consumed_memory_ref_count += consumedMemoryRefs.length;
    counters.writeback_receipt_ref_count += writebackReceiptRefs.length;
    if (consumedMemoryRefs.length > 0) {
      counters.attempts_with_consumed_memory_refs += 1;
    }
    if (writebackReceiptRefs.length > 0) {
      counters.attempts_with_writeback_receipt_refs += 1;
    }
    return counters;
  }, {
    consumed_memory_ref_count: 0,
    writeback_receipt_ref_count: 0,
    attempts_with_consumed_memory_refs: 0,
    attempts_with_writeback_receipt_refs: 0,
  });
}

function attemptControlLoop(attempt: StageAttemptProjection): JsonRecord {
  return isRecord(attempt.control_loop_summary) ? attempt.control_loop_summary : {};
}

function attemptControlLoopState(attempt: StageAttemptProjection): JsonRecord {
  const summary = attemptControlLoop(attempt);
  return isRecord(summary.state) ? summary.state : {};
}

function attemptControlLoopDecision(attempt: StageAttemptProjection): JsonRecord {
  const summary = attemptControlLoop(attempt);
  return isRecord(summary.decision) ? summary.decision : {};
}

function attemptControlLoopActionRoute(attempt: StageAttemptProjection): JsonRecord {
  const summary = attemptControlLoop(attempt);
  return isRecord(summary.action_route) ? summary.action_route : {};
}

function attemptControlLoopReceipts(attempt: StageAttemptProjection): JsonRecord {
  const summary = attemptControlLoop(attempt);
  return isRecord(summary.receipts) ? summary.receipts : {};
}

function buildWorkbenchControlLoopSummary(attempts: StageAttemptProjection[], projectionScope = 'stage_attempt_workbench') {
  const receiptRefs = uniqueStrings(attempts.flatMap((attempt) =>
    stringListFrom(attemptControlLoopReceipts(attempt).receipt_refs)
  ));
  const routeRefs = uniqueStrings(attempts.flatMap((attempt) =>
    stringListFrom(attemptControlLoopActionRoute(attempt).route_refs)
  ));
  return {
    surface_kind: 'opl_stage_attempt_control_loop_summary',
    projection_scope: projectionScope,
    projection_policy: 'refs_only_no_domain_action_no_domain_truth',
    summary: {
      attempt_count: attempts.length,
      route_decision_attempt_count: attempts.filter((attempt) =>
        Boolean(optionalString(attemptControlLoopDecision(attempt).decision))
      ).length,
      action_route_count: routeRefs.length,
      receipt_ref_count: receiptRefs.length,
      blocker_count: attempts.reduce((count, attempt) =>
        count + Number(attemptControlLoopState(attempt).blocker_count ?? 0), 0
      ),
      human_gate_count: attempts.filter((attempt) =>
        attemptControlLoopState(attempt).human_gate === true
      ).length,
      dead_letter_count: attempts.filter((attempt) =>
        attemptControlLoopState(attempt).dead_letter === true
      ).length,
    },
    receipt_refs: receiptRefs,
    action_route_refs: routeRefs,
    attempt_refs: attempts.map((attempt) => `/stage_attempt_workbench/attempts/${attempt.stage_attempt_id}`),
    authority_boundary: controlLoopAuthorityBoundary(),
  };
}

function groupAttempts(attempts: StageAttemptProjection[], keyFor: (attempt: StageAttemptProjection) => string) {
  const grouped = attempts.reduce<Record<string, StageAttemptProjection[]>>((groups, attempt) => {
    const key = keyFor(attempt);
    groups[key] = [...(groups[key] ?? []), attempt];
    return groups;
  }, {});
  return Object.fromEntries(Object.entries(grouped).map(([key, groupAttempts]) => [
    key,
    {
      key,
      total: groupAttempts.length,
      attempt_ids: groupAttempts.map((attempt) => attempt.stage_attempt_id),
      by_status: countBy(groupAttempts, (attempt) => attempt.local_status),
      attention_count: groupAttempts.filter(projectionHasAttention).length,
      human_gate_count: groupAttempts.filter(projectionHasHumanGate).length,
      resume_count: groupAttempts.filter(projectionHasResume).length,
      dead_letter_count: groupAttempts.filter(projectionIsDeadLetter).length,
      memory_ref_counters: memoryRefCounters(groupAttempts),
      usage_projection: summarizeStageAttemptUsageProjections(
        groupAttempts.map((attempt) => attempt.usage_projection),
        'stage_attempt_group',
      ),
      stage_progress_log: summarizeStageProgressLogs(
        groupAttempts
          .map((attempt) => attempt.stage_progress_log)
          .filter((projection): projection is StageProgressLogProjection => Boolean(projection)),
        'stage_attempt_group',
      ),
      memory_trace_projection: summarizeMemoryTraceProjections(
        groupAttempts
          .map((attempt) => attempt.memory_trace_projection)
          .filter((projection): projection is MemoryTraceProjection => Boolean(projection)),
        'stage_attempt_group',
      ),
    },
  ]));
}

function userStageLog(attempt: StageAttemptProjection): JsonRecord {
  const progressLog = attempt.stage_progress_log;
  return isRecord(progressLog?.user_stage_log) ? progressLog.user_stage_log : {};
}

function usageRefs(attempt: StageAttemptProjection) {
  const userLog = userStageLog(attempt);
  const usage = attempt.usage_projection;
  return uniqueStrings([
    ...stringListFrom(userLog.usage_refs),
    ...stringListFrom(userLog.token_usage_refs),
    ...stringListFrom(usage.token.source_refs),
    ...stringListFrom(usage.duration.source_refs),
    ...stringListFrom(usage.api_calls.source_refs),
  ]);
}

function costRefs(attempt: StageAttemptProjection) {
  const userLog = userStageLog(attempt);
  return uniqueStrings([
    ...stringListFrom(userLog.cost_refs),
    ...stringListFrom(attempt.usage_projection.cost.source_refs),
  ]);
}

function buildAttemptHistory(attempts: StageAttemptProjection[], projectionScope = 'stage_attempt_workbench') {
  const entries = attempts.map((attempt, index) => {
    const progressLog = attempt.stage_progress_log;
    const userLog = userStageLog(attempt);
    const duration = isRecord(userLog.duration) ? userLog.duration : {};
    const tokenUsage = isRecord(userLog.token_usage) ? userLog.token_usage : {};
    const cost = isRecord(userLog.cost) ? userLog.cost : {};
    const stageProgressRef = `/stage_attempt_workbench/attempts/${attempt.stage_attempt_id}/stage_progress_log`;
    return {
      surface_kind: 'opl_stage_attempt_history_entry',
      entry_index: index,
      stage_attempt_id: attempt.stage_attempt_id,
      task_id: optionalString(attempt.task_id),
      domain_id: attempt.domain_id,
      stage_id: attempt.stage_id,
      provider_kind: attempt.provider_kind,
      executor_kind: attempt.executor_kind,
      status: attempt.local_status,
      canonical_outcome: optionalString(attempt.canonical_outcome),
      blocked_reason: optionalString(progressLog?.actual_work.blocked_reason),
      stage_name: optionalString(userLog.stage_name) ?? `${attempt.domain_id}/${attempt.stage_id}`,
      problem_summary: optionalString(userLog.problem_summary),
      stage_goal: optionalString(userLog.stage_goal),
      stage_work_done: stringListFrom(userLog.stage_work_done),
      changed_stage_surfaces: stringListFrom(userLog.changed_stage_surfaces),
      outcome: optionalString(userLog.outcome),
      remaining_blockers: stringListFrom(userLog.remaining_blockers),
      duration,
      token_usage: tokenUsage,
      cost,
      observability_status: optionalString(userLog.observability_status) ?? 'missing',
      missing_observability_fields: stringListFrom(userLog.missing_observability_fields),
      usage_refs: usageRefs(attempt),
      cost_refs: costRefs(attempt),
      evidence_refs: uniqueStrings([
        ...stringListFrom(userLog.evidence_refs),
        ...stringListFrom(attempt.closeout_refs),
        ...stringListFrom(attempt.consumed_refs),
        ...stringListFrom(attempt.writeback_receipt_refs),
      ]),
      closeout_refs: stringListFrom(attempt.closeout_refs),
      stage_progress_log_ref: stageProgressRef,
      usage_projection_ref: `/stage_attempt_workbench/attempts/${attempt.stage_attempt_id}/usage_projection`,
      created_at: optionalString(attempt.created_at),
      updated_at: optionalString(attempt.updated_at),
      semantic_status: optionalString(userLog.semantic_status) ?? 'missing_domain_semantic_summary',
      authority_boundary: progressLog?.authority_boundary ?? {
        opl: 'attempt_history_projection_only',
        domain: 'truth_quality_artifact_gate_owner',
        can_write_domain_truth: false,
        can_authorize_quality_verdict: false,
      },
    };
  });
  return {
    surface_kind: 'opl_stage_attempt_history_projection',
    projection_scope: projectionScope,
    projection_policy: 'attempt_history_from_opl_ledger_and_domain_provided_user_stage_log_no_domain_inference',
    attempt_count: entries.length,
    entries,
    refs: {
      stage_progress_log_refs: entries.map((entry) => entry.stage_progress_log_ref),
      usage_projection_refs: entries.map((entry) => entry.usage_projection_ref),
    },
    authority_boundary: {
      opl: 'attempt_history_projection_only',
      domain: 'human_readable_stage_semantics_owner',
      can_infer_domain_semantics: false,
      can_write_domain_truth: false,
      can_authorize_quality_verdict: false,
      provider_completion_is_domain_ready: false,
    },
  };
}

export function buildWorkbenchMetadata(attempts: StageAttemptProjection[]) {
  const operatorConflicts = attempts.flatMap((attempt) => recordListFromUnknown(attempt.operator_conflicts));
  const humanReviewBurdenBudget = buildFamilyHumanReviewBurdenBudget({
    projectionScope: 'stage_attempt_workbench',
    targetDomainId: null,
    gates: attempts.flatMap((attempt) => {
      const budget: JsonRecord = isRecord(attempt.human_review_burden_budget)
        ? attempt.human_review_burden_budget
        : {};
      const gates = recordListFromUnknown(budget.gates);
      return gates.map((gate) => ({
        gate_id: optionalString(gate.gate_id) ?? 'unknown_human_gate',
        gate_type: (
          ['intent_review', 'scope_review', 'boundary_exception_review', 'quality_owner_review', 'artifact_mutation_review']
            .includes(optionalString(gate.gate_type) ?? '')
            ? optionalString(gate.gate_type)
            : 'boundary_exception_review'
        ) as 'intent_review' | 'scope_review' | 'boundary_exception_review' | 'quality_owner_review' | 'artifact_mutation_review',
        owner: optionalString(gate.owner) ?? attempt.domain_id,
        stage_id: optionalString(gate.stage_id) ?? attempt.stage_id,
        required_refs: stringListFrom(gate.required_refs),
        missing_refs: stringListFrom(gate.missing_refs),
        reason: optionalString(gate.reason) ?? 'stage_attempt_human_gate_ref',
        status: gate.status === 'blocked' ? 'blocked' as const : 'ready' as const,
        source: 'gate_ref' as const,
      }));
    }),
  });
  const attentionCounters = {
    total: attempts.filter(projectionHasAttention).length,
    human_gate_count: attempts.filter(projectionHasHumanGate).length,
    resume_count: attempts.filter(projectionHasResume).length,
    dead_letter_count: attempts.filter(projectionIsDeadLetter).length,
    rejected_writes_count: attempts.filter((attempt) => hasEntries(attempt.rejected_writes)).length,
  };
  const groups = {
    by_domain: groupAttempts(attempts, (attempt) => attempt.domain_id),
    by_stage: groupAttempts(attempts, (attempt) => attempt.stage_id),
    by_status: groupAttempts(attempts, (attempt) => attempt.local_status),
  };
  return {
    summary: {
      total: attempts.length,
      by_status: countBy(attempts, (attempt) => attempt.local_status),
      by_domain: countBy(attempts, (attempt) => attempt.domain_id),
      by_stage: countBy(attempts, (attempt) => attempt.stage_id),
      attention_count: attentionCounters.total,
      attention_counters: attentionCounters,
      memory_ref_counters: memoryRefCounters(attempts),
      usage_projection: summarizeStageAttemptUsageProjections(
        attempts.map((attempt) => attempt.usage_projection),
        'stage_attempt_workbench',
      ),
      stage_progress_log: summarizeStageProgressLogs(
        attempts
          .map((attempt) => attempt.stage_progress_log)
          .filter((projection): projection is StageProgressLogProjection => Boolean(projection)),
        'stage_attempt_workbench',
      ),
      memory_trace_projection: summarizeMemoryTraceProjections(
        attempts
          .map((attempt) => attempt.memory_trace_projection)
          .filter((projection): projection is MemoryTraceProjection => Boolean(projection)),
        'stage_attempt_workbench',
      ),
      ...buildWorkbenchGenericProjections(attempts),
      operator_conflict_count: operatorConflicts.length,
      control_loop_summary: buildWorkbenchControlLoopSummary(attempts),
      attempt_history: buildAttemptHistory(attempts),
      human_review_burden_budget: humanReviewBurdenBudget,
      human_gate_count: attentionCounters.human_gate_count,
      resume_count: attentionCounters.resume_count,
      dead_letter_count: attentionCounters.dead_letter_count,
    },
    operator_conflicts: operatorConflicts,
    human_review_burden_budget: humanReviewBurdenBudget,
    groups,
    filter_metadata: {
      group_keys: ['domain_id', 'stage_id', 'status'],
      attention_flags: ['human_gate', 'resume_available', 'dead_lettered', 'blocked', 'rejected_writes'],
      memory_ref_flags: ['has_consumed_memory_refs', 'has_writeback_receipt_refs'],
      usage_projection_flags: ['retry_budget_pressure'],
      transition_bridge_flags: [
        'has_transition_bridge',
        'has_transition_owner_receipt_refs',
        'has_transition_no_regression_evidence_refs',
        'has_transition_typed_blockers',
      ],
    },
  };
}

export const EMPTY_WORKBENCH_METADATA = {
  summary: {
    total: 0,
    by_status: {},
    by_domain: {},
    by_stage: {},
    attention_count: 0,
    attention_counters: {
      total: 0,
      human_gate_count: 0,
      resume_count: 0,
      dead_letter_count: 0,
      rejected_writes_count: 0,
    },
    memory_ref_counters: {
      consumed_memory_ref_count: 0,
      writeback_receipt_ref_count: 0,
      attempts_with_consumed_memory_refs: 0,
      attempts_with_writeback_receipt_refs: 0,
    },
    usage_projection: summarizeStageAttemptUsageProjections([], 'stage_attempt_workbench'),
    stage_progress_log: summarizeStageProgressLogs([], 'stage_attempt_workbench'),
    memory_trace_projection: summarizeMemoryTraceProjections([], 'stage_attempt_workbench'),
    ...buildWorkbenchGenericProjections([]),
    control_loop_summary: buildWorkbenchControlLoopSummary([]),
    attempt_history: buildAttemptHistory([]),
    human_review_burden_budget: buildFamilyHumanReviewBurdenBudget({
      projectionScope: 'stage_attempt_workbench',
      targetDomainId: null,
      gates: [],
    }),
    human_gate_count: 0,
    resume_count: 0,
    dead_letter_count: 0,
  },
  groups: {
    by_domain: {},
    by_stage: {},
    by_status: {},
  },
  operator_conflicts: [],
  human_review_burden_budget: buildFamilyHumanReviewBurdenBudget({
    projectionScope: 'stage_attempt_workbench',
    targetDomainId: null,
    gates: [],
  }),
  filter_metadata: {
    group_keys: ['domain_id', 'stage_id', 'status'],
    attention_flags: ['human_gate', 'resume_available', 'dead_lettered', 'blocked', 'rejected_writes'],
    memory_ref_flags: ['has_consumed_memory_refs', 'has_writeback_receipt_refs'],
    usage_projection_flags: ['retry_budget_pressure'],
    transition_bridge_flags: [
      'has_transition_bridge',
      'has_transition_owner_receipt_refs',
      'has_transition_no_regression_evidence_refs',
      'has_transition_typed_blockers',
    ],
  },
};
