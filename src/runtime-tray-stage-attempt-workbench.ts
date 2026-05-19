import * as fs from 'fs';
import { DatabaseSync } from 'node:sqlite';

import { buildFamilyRuntimeControlledApplyContract } from './family-runtime-controlled-apply.ts';
import { buildFamilyRuntimeLifecyclePrimitives } from './family-runtime-lifecycle.ts';
import {
  buildFamilyConflictSubject,
  buildStageAttemptConflictOrBlockerEnvelopes,
  canonicalOutcomeForStageAttempt,
} from './family-conflict-envelope.ts';
import {
  buildStageAttemptUsageProjection,
  summarizeStageAttemptUsageProjections,
} from './family-runtime-stage-attempt-usage.ts';
import {
  inspectFamilyRuntimeProviderWithLifecycle,
  isFamilyRuntimeProviderKind,
} from './family-runtime-providers.ts';
import { familyRuntimePaths } from './family-runtime-store.ts';
import {
  latestStageAttemptCloseoutPacketsByAttempt,
  listStageAttemptRows,
  stageAttemptSignalsByAttempt,
} from './family-runtime-stage-attempt-ledger.ts';
import type { FamilyRuntimeDomainId, FamilyRuntimeProviderKind } from './family-runtime-types.ts';
import {
  buildAttemptGenericProjections,
  buildWorkbenchGenericProjections,
} from './runtime-tray-stage-attempt-generic-projections.ts';
import {
  buildAttemptHumanReviewBurdenBudget,
  buildFamilyHumanReviewBurdenBudget,
} from './family-human-review-budget.ts';
import { fileSourceRef, optionalString } from './runtime-tray-snapshot-utils.ts';
import type { JsonRecord, RuntimeTraySourceRef } from './runtime-tray-snapshot-types.ts';

type ProviderReadinessOptions = {
  managedProviderProjection?: {
    managed_temporal_state_consistency?: Record<string, unknown> | null;
  } | null;
};

type StageAttemptWorkbenchRow = ReturnType<typeof listStageAttemptRows>[number] & {
  domain_id: FamilyRuntimeDomainId;
};

type StageAttemptProjection = ReturnType<typeof attemptProjection>;

function parseRecord(value: string): JsonRecord {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as JsonRecord : {};
  } catch {
    return {};
  }
}

function parseList(value: string): unknown[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function stringList(value: unknown[]) {
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
}

function recordList(value: unknown[]) {
  return value.filter((entry): entry is JsonRecord => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry));
}

function recordListFromUnknown(value: unknown) {
  return Array.isArray(value) ? recordList(value) : [];
}

function latestActivity(events: JsonRecord[]) {
  return events.at(-1) ?? null;
}

function hasEntries(value: unknown) {
  return Array.isArray(value) && value.length > 0;
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringListFrom(value: unknown) {
  return Array.isArray(value) ? stringList(value) : [];
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function attemptHasHumanGate(row: StageAttemptWorkbenchRow, humanGateRefs: string[], humanGateLedger: JsonRecord[]) {
  return row.status === 'human_gate' || humanGateRefs.length > 0 || humanGateLedger.length > 0;
}

function sourceRefs(queueDb: string): RuntimeTraySourceRef[] {
  return [
    fileSourceRef(`${queueDb}#stage_attempts`, 'stage_attempt_ledger', 'OPL stage attempt ledger'),
    fileSourceRef(`${queueDb}#stage_attempt_closeouts`, 'stage_attempt_closeout_ledger', 'OPL stage closeout ledger'),
  ];
}

function providerKindForRow(row: StageAttemptWorkbenchRow): FamilyRuntimeProviderKind | null {
  return isFamilyRuntimeProviderKind(row.provider_kind) ? row.provider_kind : null;
}

function stringRefsFromRecord(value: JsonRecord, keys: string[]) {
  return uniqueStrings(keys.flatMap((key) => {
    const entry = value[key];
    return typeof entry === 'string' ? [entry] : stringListFrom(entry);
  }));
}

function stagePacketRefs(activityEvents: JsonRecord[]) {
  return uniqueStrings(activityEvents
    .map((event) => optionalString(event.stage_packet_ref))
    .filter((ref): ref is string => Boolean(ref)));
}

function signalRefs(signals: JsonRecord[]) {
  return signals.map((signal) => ({
    signal_id: optionalString(signal.signal_id),
    signal_kind: optionalString(signal.signal_kind),
    source: optionalString(signal.source),
  })).filter((signal) => signal.signal_id || signal.signal_kind || signal.source);
}

function actionRouteRefs(actionRouting: JsonRecord) {
  return uniqueStrings(recordList(Array.isArray(actionRouting.actions) ? actionRouting.actions : [])
    .map((action) => optionalString(action.command_or_surface_ref))
    .filter((ref): ref is string => Boolean(ref)));
}

function controlLoopAuthorityBoundary() {
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

function blockerStatus(input: {
  attentionFlags: string[];
  isHumanGate: boolean;
  isDeadLetter: boolean;
  isBlocked: boolean;
}) {
  if (input.isDeadLetter) {
    return 'dead_lettered';
  }
  if (input.isHumanGate) {
    return 'human_gate';
  }
  if (input.isBlocked || input.attentionFlags.length > 0) {
    return 'blocked_by_attention';
  }
  return 'clear';
}

function buildAttemptControlLoopSummary(input: {
  row: StageAttemptWorkbenchRow;
  routeImpact: JsonRecord;
  latestCloseout: JsonRecord | null;
  activityEvents: JsonRecord[];
  signals: JsonRecord[];
  nextOwner: string;
  closeoutRefs: string[];
  writebackReceiptRefs: string[];
  rejectedWrites: unknown[];
  attentionFlags: string[];
  humanGateRefs: string[];
  isHumanGate: boolean;
  isDeadLetter: boolean;
  isBlocked: boolean;
  actionRouting: JsonRecord;
  deadLetter: JsonRecord | null;
}) {
  const receiptRefs = uniqueStrings([
    ...input.closeoutRefs,
    ...input.writebackReceiptRefs,
    ...stringRefsFromRecord(input.routeImpact, [
      'receipt_ref',
      'receipt_refs',
      'owner_receipt_ref',
      'owner_receipt_refs',
      'no_regression_evidence_ref',
      'no_regression_evidence_refs',
    ]),
  ]);
  const routeRefs = actionRouteRefs(input.actionRouting);
  const sourceSignalRefs = signalRefs(input.signals);
  const retryBudget = parseRecord(input.row.retry_budget_json);
  const state = {
    status: input.row.status,
    blocker_status: blockerStatus(input),
    blocker_count: input.rejectedWrites.length + (input.isBlocked ? 1 : 0) + (input.isHumanGate ? 1 : 0)
      + (input.isDeadLetter ? 1 : 0),
    attention_flags: input.attentionFlags,
    human_gate: input.isHumanGate,
    human_gate_refs: input.humanGateRefs,
    dead_letter: input.isDeadLetter,
    dead_letter_reason: optionalString(input.deadLetter?.reason),
  };
  return {
    surface_kind: 'opl_stage_attempt_control_loop_summary',
    projection_scope: 'stage_attempt',
    projection_policy: 'refs_only_no_domain_action_no_domain_truth',
    stage_attempt_id: input.row.stage_attempt_id,
    domain_id: input.row.domain_id,
    stage_id: input.row.stage_id,
    trigger: {
      source_fingerprint: input.row.source_fingerprint,
      stage_packet_refs: stagePacketRefs(input.activityEvents),
      source_signal_refs: sourceSignalRefs,
      source_signal_count: sourceSignalRefs.length,
    },
    decision: {
      decision: optionalString(input.routeImpact.decision),
      proposal_refs: stringRefsFromRecord(input.routeImpact, ['proposal_ref', 'proposal_refs']),
      route_impact_refs: stringRefsFromRecord(input.routeImpact, [
        'quality_refs',
        'readiness_refs',
        'slo_ref',
        'package_refs',
        'export_refs',
        'gap_report_refs',
        'handoff_refs',
      ]),
      domain_ready_verdict: optionalString(input.latestCloseout?.domain_ready_verdict)
        ?? optionalString(input.routeImpact.domain_ready_verdict),
    },
    action_route: {
      next_owner: input.nextOwner,
      route_refs: routeRefs,
      route_count: routeRefs.length,
      execution_policy: 'route_only_no_execution',
    },
    receipts: {
      receipt_refs: receiptRefs,
      receipt_ref_count: receiptRefs.length,
      closeout_refs: input.closeoutRefs,
      writeback_receipt_refs: input.writebackReceiptRefs,
    },
    retry_budget: {
      attempt_count: input.row.attempt_count,
      retry_budget: retryBudget,
      max_attempts: typeof retryBudget.max_attempts === 'number' ? retryBudget.max_attempts : null,
    },
    state,
    authority_boundary: controlLoopAuthorityBoundary(),
  };
}

function currentProviderReadinessProjection(
  providerKind: FamilyRuntimeProviderKind | null,
  provider: Awaited<ReturnType<typeof inspectFamilyRuntimeProviderWithLifecycle>> | null,
) {
  if (!providerKind || !provider) {
    return null;
  }
  return {
    surface_kind: 'stage_attempt_current_provider_readiness',
    provider_kind: providerKind,
    provider_ready: provider.ready,
    status: provider.status,
    degraded_reason: provider.degraded_reason,
    capabilities: provider.capabilities,
    details: provider.details,
    provider_receipt_is_creation_time_snapshot: true,
    authority_boundary: {
      opl: 'current_provider_lifecycle_projection_only',
      domain: 'truth_quality_artifact_gate_owner',
    },
  };
}

async function currentProviderReadinessByKind(
  rows: StageAttemptWorkbenchRow[],
  paths: Pick<ReturnType<typeof familyRuntimePaths>, 'root'>,
  options: ProviderReadinessOptions,
) {
  const providerKinds = [...new Set(rows.map(providerKindForRow).filter((kind): kind is FamilyRuntimeProviderKind => Boolean(kind)))];
  const entries = await Promise.all(providerKinds.map(async (providerKind) => [
    providerKind,
    await inspectFamilyRuntimeProviderWithLifecycle(providerKind, paths, options),
  ] as const));
  return new Map(entries);
}

function attemptProjection(
  row: StageAttemptWorkbenchRow,
  latestCloseout: JsonRecord | null,
  signals: JsonRecord[],
  providerReadiness: Awaited<ReturnType<typeof inspectFamilyRuntimeProviderWithLifecycle>> | null,
) {
  const providerRun = parseRecord(row.provider_run_json);
  const activityEvents = recordList(parseList(row.activity_events_json));
  const routeImpact = parseRecord(row.route_impact_json);
  const workspaceLocator = parseRecord(row.workspace_locator_json);
  const activity = latestActivity(activityEvents);
  const checkpointRefs = stringList(parseList(row.checkpoint_refs_json));
  const closeoutRefs = stringList(parseList(row.closeout_refs_json));
  const humanGateRefs = stringList(parseList(row.human_gate_refs_json));
  const humanGateLedger = signals.filter((signal) => signal.signal_kind === 'human_gate');
  const userInstructionLedger = signals.filter((signal) => signal.signal_kind === 'user_instruction');
  const resumeLedger = signals.filter((signal) => signal.signal_kind === 'resume');
  const domainReadyVerdict = optionalString(latestCloseout?.domain_ready_verdict)
    ?? optionalString(routeImpact.domain_ready_verdict);
  const consumedRefs = stringList(Array.isArray(latestCloseout?.consumed_refs) ? latestCloseout.consumed_refs : []);
  const consumedMemoryRefs = stringList(Array.isArray(latestCloseout?.consumed_memory_refs) ? latestCloseout.consumed_memory_refs : []);
  const writebackReceiptRefs = stringList(Array.isArray(latestCloseout?.writeback_receipt_refs) ? latestCloseout.writeback_receipt_refs : []);
  const rejectedWrites = Array.isArray(latestCloseout?.rejected_writes) ? latestCloseout.rejected_writes : [];
  const sourceRefs = stringList(Array.isArray(workspaceLocator.source_refs) ? workspaceLocator.source_refs : []);
  const subject = buildFamilyConflictSubject({
    domain: row.domain_id,
    stageId: row.stage_id,
    taskKind: row.stage_id,
    sourceFingerprint: row.source_fingerprint,
    idempotencyKey: row.idempotency_key,
    stageAttemptId: row.stage_attempt_id,
    taskId: row.task_id,
    sourceRefs,
  });
  const controlledApplyContract = buildFamilyRuntimeControlledApplyContract({
    domainId: row.domain_id,
    stageId: row.stage_id,
    workspaceLocator,
    routeImpact,
  });
  const lifecyclePrimitives = buildFamilyRuntimeLifecyclePrimitives({
    workspaceLocator,
    artifactRefs: [
      ...closeoutRefs,
      ...consumedRefs,
      ...writebackReceiptRefs,
    ],
  });
  const isHumanGate = attemptHasHumanGate(row, humanGateRefs, humanGateLedger);
  const isDeadLetter = row.status === 'dead_lettered';
  const isBlocked = Boolean(row.blocked_reason);
  const nextOwner = optionalString(latestCloseout?.next_owner) ?? optionalString(routeImpact.next_owner) ?? row.domain_id;
  const attentionFlags = [
    isHumanGate ? 'human_gate' : null,
    resumeLedger.length > 0 ? 'resume_available' : null,
    isDeadLetter ? 'dead_lettered' : null,
    isBlocked ? 'blocked' : null,
    rejectedWrites.length > 0 ? 'rejected_writes' : null,
  ].filter((flag): flag is string => Boolean(flag));
  const deadLetter = row.status === 'dead_lettered'
    ? {
        reason: row.blocked_reason,
        task: null,
      }
    : null;
  const artifactRefs = [
    ...closeoutRefs,
    ...consumedRefs,
    ...writebackReceiptRefs,
  ];
  const currentProviderReadiness = currentProviderReadinessProjection(providerKindForRow(row), providerReadiness);
  const conflictOrBlockerEnvelopes = buildStageAttemptConflictOrBlockerEnvelopes({
    subject,
    attemptStatus: row.status,
    blockedReason: row.blocked_reason,
    humanGateRefs,
    humanGateLedger,
    deadLetter,
    rejectedWrites: recordList(rejectedWrites),
    domainReadyVerdict,
    closeoutRefs,
    closeoutReceiptStatus: row.closeout_receipt_status,
    routeImpact,
  });
  const canonicalOutcome = canonicalOutcomeForStageAttempt({
    attemptStatus: row.status,
    closeoutRefs,
    closeoutReceiptStatus: row.closeout_receipt_status,
  });
  const usageProjection = buildStageAttemptUsageProjection({
    stageAttemptId: row.stage_attempt_id,
    status: row.status,
    blockedReason: row.blocked_reason,
    retryBudget: parseRecord(row.retry_budget_json),
    attemptCount: row.attempt_count,
    providerRun,
    activityEvents,
    routeImpact,
  });
  const genericProjections = buildAttemptGenericProjections({
    stage_attempt_id: row.stage_attempt_id,
    domain_id: row.domain_id,
    stage_id: row.stage_id,
    next_owner: nextOwner,
    route_impact: routeImpact,
    workspace_locator: workspaceLocator,
    source_fingerprint: row.source_fingerprint,
    checkpoint_refs: checkpointRefs,
    closeout_refs: closeoutRefs,
    consumed_refs: consumedRefs,
    consumed_memory_refs: consumedMemoryRefs,
    writeback_receipt_refs: writebackReceiptRefs,
    artifact_refs: artifactRefs,
    rejected_writes: rejectedWrites,
    attention_flags: attentionFlags,
    human_gate_refs: humanGateRefs,
    human_gate_ledger: humanGateLedger,
    resume_ledger: resumeLedger,
    dead_letter: deadLetter,
    domain_ready_verdict: domainReadyVerdict,
    controlled_apply_contract: controlledApplyContract,
    lifecycle_primitives: lifecyclePrimitives,
    current_provider_readiness: currentProviderReadiness,
  });
  const humanReviewBurdenBudget = buildAttemptHumanReviewBurdenBudget({
    targetDomainId: row.domain_id,
    stageId: row.stage_id,
    humanGateRefs,
    humanGateLedger,
    routeImpact,
  });
  const controlLoopSummary = buildAttemptControlLoopSummary({
    row,
    routeImpact,
    latestCloseout,
    activityEvents,
    signals,
    nextOwner,
    closeoutRefs,
    writebackReceiptRefs,
    rejectedWrites,
    attentionFlags,
    humanGateRefs,
    isHumanGate,
    isDeadLetter,
    isBlocked,
    actionRouting: genericProjections.action_routing,
    deadLetter,
  });

  return {
    stage_attempt_id: row.stage_attempt_id,
    provider_kind: row.provider_kind,
    domain_id: row.domain_id,
    stage_id: row.stage_id,
    workflow_id: row.workflow_id,
    workspace_locator: workspaceLocator,
    source_fingerprint: row.source_fingerprint,
    workflow_status: optionalString(providerRun.provider_status) ?? row.status,
    activity_status: optionalString(activity?.activity_status),
    activity_kind: optionalString(activity?.activity_kind),
    local_status: row.status,
    heartbeat: {
      last_updated_at: row.updated_at,
      last_heartbeat_at: optionalString(providerRun.last_heartbeat_at),
      checkpoint_refs: checkpointRefs,
    },
    checkpoint_refs: checkpointRefs,
    consumed_refs: consumedRefs,
    consumed_memory_refs: consumedMemoryRefs,
    writeback_receipt_refs: writebackReceiptRefs,
    closeout_refs: closeoutRefs,
    artifact_refs: artifactRefs,
    closeout_receipt_status: row.closeout_receipt_status,
    canonical_outcome: canonicalOutcome,
    domain_ready_verdict: domainReadyVerdict,
    rejected_writes: rejectedWrites,
    route_impact: routeImpact,
    conflict_or_blocker_envelopes: conflictOrBlockerEnvelopes,
    operator_conflicts: conflictOrBlockerEnvelopes,
    operator_label: conflictOrBlockerEnvelopes[0]?.operator_label ?? null,
    usage_projection: usageProjection,
    ...genericProjections,
    next_owner: nextOwner,
    human_gate_refs: humanGateRefs,
    human_gate_ledger: humanGateLedger,
    human_review_burden_budget: humanReviewBurdenBudget,
    user_instruction_ledger: userInstructionLedger,
    resume_ledger: resumeLedger,
    user_instructions: userInstructionLedger,
    resume_signals: resumeLedger,
    dead_letter: deadLetter,
    completion_boundary: {
      provider_completion: row.status === 'completed' ? 'completed' : 'not_completed',
      domain_ready_verdict: domainReadyVerdict,
      provider_completion_is_domain_ready: false,
    },
    controlled_apply_contract: controlledApplyContract,
    lifecycle_primitives: lifecyclePrimitives,
    current_provider_readiness: currentProviderReadiness,
    control_loop_summary: controlLoopSummary,
    filter_keys: {
      domain_id: row.domain_id,
      stage_id: row.stage_id,
      status: row.status,
      provider_kind: row.provider_kind,
      attention: attentionFlags.length > 0,
      human_gate: isHumanGate,
      human_review_budget_status: humanReviewBurdenBudget.status,
      resume_available: resumeLedger.length > 0,
      dead_lettered: isDeadLetter,
      has_consumed_memory_refs: consumedMemoryRefs.length > 0,
      has_writeback_receipt_refs: writebackReceiptRefs.length > 0,
      retry_budget_pressure: ['retry_budget_pressure', 'retry_budget_exhausted'].includes(
        usageProjection.retry_budget.pressure_status,
      ),
      ...transitionBridgeFilterKeys(genericProjections),
    },
    attention_flags: attentionFlags,
    authority_boundary: {
      opl: 'attempt_control_metadata_projection_only',
      domain: 'truth_quality_artifact_gate_owner',
    },
    updated_at: row.updated_at,
    created_at: row.created_at,
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
  return projection && typeof projection === 'object' && !Array.isArray(projection)
    ? projection as JsonRecord
    : null;
}

function transitionBridgeSummary(attempt: { transition_bridge_evidence?: unknown }) {
  const summary = transitionBridgeProjection(attempt)?.summary;
  return summary && typeof summary === 'object' && !Array.isArray(summary) ? summary as JsonRecord : {};
}

function transitionBridgeFilterKeys(attempt: { transition_bridge_evidence?: unknown }) {
  const projection = transitionBridgeProjection(attempt);
  const summary = transitionBridgeSummary(attempt);
  return {
    has_transition_bridge: projection?.availability === 'transition_bridge_observed',
    has_transition_owner_receipt_refs: Number(summary.owner_receipt_ref_count ?? 0) > 0,
    has_transition_no_regression_evidence_refs: Number(summary.no_regression_evidence_ref_count ?? 0) > 0,
    has_transition_typed_blockers: Number(summary.typed_blocker_count ?? 0) > 0,
  };
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
    },
  ]));
}

function workbenchMetadata(attempts: StageAttemptProjection[]) {
  const operatorConflicts = attempts.flatMap((attempt) => recordListFromUnknown(attempt.operator_conflicts));
  const humanReviewBurdenBudget = buildFamilyHumanReviewBurdenBudget({
    projectionScope: 'stage_attempt_workbench',
    targetDomainId: null,
    gates: attempts.flatMap((attempt) => {
      const budget: JsonRecord = isRecord(attempt.human_review_burden_budget)
        ? attempt.human_review_burden_budget
        : {};
      const gatePayload = budget['gates'];
      const gates = recordListFromUnknown(gatePayload);
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
      ...buildWorkbenchGenericProjections(attempts),
      operator_conflict_count: operatorConflicts.length,
      control_loop_summary: buildWorkbenchControlLoopSummary(attempts),
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

const EMPTY_WORKBENCH_METADATA = {
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
    ...buildWorkbenchGenericProjections([]),
    control_loop_summary: buildWorkbenchControlLoopSummary([]),
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

export async function buildStageAttemptWorkbench(options: ProviderReadinessOptions = {}) {
  const paths = familyRuntimePaths();
  const queueDb = paths.queue_db;
  if (!fs.existsSync(queueDb)) {
    return {
      surface_kind: 'opl_stage_attempt_workbench',
      availability: 'missing_ledger',
      provider_completion_is_domain_ready: false,
      attempts: [],
      ...EMPTY_WORKBENCH_METADATA,
      artifact_gallery: EMPTY_WORKBENCH_METADATA.summary.artifact_gallery,
      route_decision_graph: EMPTY_WORKBENCH_METADATA.summary.route_decision_graph,
      review_repair_queue: EMPTY_WORKBENCH_METADATA.summary.review_repair_queue,
      quality_readiness: EMPTY_WORKBENCH_METADATA.summary.quality_readiness,
      observability_slo: EMPTY_WORKBENCH_METADATA.summary.observability_slo,
      workspace_source_intake: EMPTY_WORKBENCH_METADATA.summary.workspace_source_intake,
      memory_locator_index: EMPTY_WORKBENCH_METADATA.summary.memory_locator_index,
      usage_projection: EMPTY_WORKBENCH_METADATA.summary.usage_projection,
      package_export_lifecycle: EMPTY_WORKBENCH_METADATA.summary.package_export_lifecycle,
      action_routing: EMPTY_WORKBENCH_METADATA.summary.action_routing,
      transition_bridge_evidence: EMPTY_WORKBENCH_METADATA.summary.transition_bridge_evidence,
      control_loop_summary: EMPTY_WORKBENCH_METADATA.summary.control_loop_summary,
      human_review_burden_budget: EMPTY_WORKBENCH_METADATA.human_review_burden_budget,
      source_refs: sourceRefs(queueDb),
      authority_boundary: {
        opl: 'attempt_control_metadata_projection_only',
        domain: 'truth_quality_artifact_gate_owner',
      },
    };
  }

  const db = new DatabaseSync(queueDb, { readOnly: true });
  try {
    const rows = listStageAttemptRows(db, 25) as StageAttemptWorkbenchRow[];
    const attemptIds = rows.map((row) => row.stage_attempt_id);
    const latestCloseouts = latestStageAttemptCloseoutPacketsByAttempt(db, attemptIds);
    const signals = stageAttemptSignalsByAttempt(db, attemptIds);
    const providerReadiness = await currentProviderReadinessByKind(rows, paths, options);
    const attempts = rows.map((row) => {
      const providerKind = providerKindForRow(row);
      return attemptProjection(
        row,
        latestCloseouts.get(row.stage_attempt_id) ?? null,
        signals.get(row.stage_attempt_id) ?? [],
        providerKind ? providerReadiness.get(providerKind) ?? null : null,
      );
    });
    const metadata = workbenchMetadata(attempts);
    return {
      surface_kind: 'opl_stage_attempt_workbench',
      availability: 'available',
      provider_completion_is_domain_ready: false,
      ...metadata,
      artifact_gallery: metadata.summary.artifact_gallery,
      route_decision_graph: metadata.summary.route_decision_graph,
      review_repair_queue: metadata.summary.review_repair_queue,
      quality_readiness: metadata.summary.quality_readiness,
      observability_slo: metadata.summary.observability_slo,
      workspace_source_intake: metadata.summary.workspace_source_intake,
      memory_locator_index: metadata.summary.memory_locator_index,
      usage_projection: metadata.summary.usage_projection,
      package_export_lifecycle: metadata.summary.package_export_lifecycle,
      action_routing: metadata.summary.action_routing,
      transition_bridge_evidence: metadata.summary.transition_bridge_evidence,
      control_loop_summary: metadata.summary.control_loop_summary,
      human_review_burden_budget: metadata.human_review_burden_budget,
      attempts,
      source_refs: sourceRefs(queueDb),
      authority_boundary: {
        opl: 'attempt_control_metadata_projection_only',
        domain: 'truth_quality_artifact_gate_owner',
      },
    };
  } catch {
    return {
      surface_kind: 'opl_stage_attempt_workbench',
      availability: 'unavailable',
      provider_completion_is_domain_ready: false,
      attempts: [],
      ...EMPTY_WORKBENCH_METADATA,
      artifact_gallery: EMPTY_WORKBENCH_METADATA.summary.artifact_gallery,
      route_decision_graph: EMPTY_WORKBENCH_METADATA.summary.route_decision_graph,
      review_repair_queue: EMPTY_WORKBENCH_METADATA.summary.review_repair_queue,
      quality_readiness: EMPTY_WORKBENCH_METADATA.summary.quality_readiness,
      observability_slo: EMPTY_WORKBENCH_METADATA.summary.observability_slo,
      workspace_source_intake: EMPTY_WORKBENCH_METADATA.summary.workspace_source_intake,
      memory_locator_index: EMPTY_WORKBENCH_METADATA.summary.memory_locator_index,
      usage_projection: EMPTY_WORKBENCH_METADATA.summary.usage_projection,
      package_export_lifecycle: EMPTY_WORKBENCH_METADATA.summary.package_export_lifecycle,
      action_routing: EMPTY_WORKBENCH_METADATA.summary.action_routing,
      transition_bridge_evidence: EMPTY_WORKBENCH_METADATA.summary.transition_bridge_evidence,
      control_loop_summary: EMPTY_WORKBENCH_METADATA.summary.control_loop_summary,
      human_review_burden_budget: EMPTY_WORKBENCH_METADATA.human_review_burden_budget,
      source_refs: sourceRefs(queueDb),
      authority_boundary: {
        opl: 'attempt_control_metadata_projection_only',
        domain: 'truth_quality_artifact_gate_owner',
      },
    };
  } finally {
    db.close();
  }
}
