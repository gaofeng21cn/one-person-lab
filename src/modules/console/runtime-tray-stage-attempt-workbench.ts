import * as fs from 'fs';
import type { DatabaseSync } from 'node:sqlite';

import { isRecord } from '../../kernel/contract-validation.ts';
import { resolveDomainOwnerAnswerProjectionProfile } from '../../kernel/domain-owner-answer-projection-profile.ts';
import { parseJsonText } from '../../kernel/json-file.ts';
import { OBSERVABILITY_ATTEMPT_LEDGER_LABEL } from '../../kernel/observability-projection-vocabulary.ts';
import { QUEUE_PROJECTION_VOCABULARY } from '../../kernel/queue-projection-vocabulary.ts';
import {
  buildEffectiveCurrentContextPacket,
  buildFamilyRuntimeControlledApplyContract,
  buildFamilyRuntimeLifecyclePrimitives,
  buildFamilyStallLineage,
  buildModelRouteCostProjection,
  buildStageAttemptTruePathProof,
  buildStageAttemptUsageProjection,
  buildStageProgressLog,
  deriveCurrentControlStateForAttempt,
  deriveCurrentControlStateForTask,
  familyRuntimePaths,
  inspectFamilyRuntimeProviderWithLifecycle,
  isFamilyRuntimeProviderKind,
  latestStageAttemptCloseoutPacketsByAttempt,
  listStageAttemptRows,
  openFamilyRuntimeSqlite,
  stageAttemptSignalsByAttempt,
  type FamilyRuntimeDomainId,
  type FamilyRuntimeProviderKind,
  type TemporalStageAttemptVisibilityReadiness,
} from '../runway/index.ts';
import {
  buildFamilyConflictSubject,
  buildStageAttemptConflictOrBlockerEnvelopes,
  canonicalOutcomeForStageAttempt,
} from '../stagecraft/index.ts';
import {
  buildAttemptGenericProjections,
} from '../runway/index.ts';
import {
  buildAttemptHumanReviewBurdenBudget,
} from '../stagecraft/index.ts';
import {
  buildStageAttemptCloseoutRefsOnlyContract,
  buildStageAttemptLaunchEnvelope,
} from '../stagecraft/index.ts';
import { fileSourceRef, optionalString } from './runtime-tray-snapshot-utils.ts';
import type { JsonRecord, RuntimeTraySourceRef } from './runtime-tray-snapshot-types.ts';
import {
  EMPTY_WORKBENCH_METADATA,
  buildWorkbenchMetadata,
  controlLoopAuthorityBoundary,
  transitionBridgeFilterKeys,
} from './runtime-tray-stage-attempt-workbench-parts/metadata.ts';

type ProviderReadinessOptions = {
  managedProviderProjection?: {
    managed_temporal_state_consistency?: Record<string, unknown> | null;
  } | null;
};

type StageAttemptWorkbenchRow = ReturnType<typeof listStageAttemptRows>[number] & {
  domain_id: FamilyRuntimeDomainId;
};

type StageAttemptProjection = ReturnType<typeof attemptProjection>;

const EMPTY_EFFECTIVE_CURRENT_CONTEXT = buildEffectiveCurrentContextPacket([]);
const EMPTY_FAMILY_STALL_LINEAGE = buildFamilyStallLineage([]);
const WORKBENCH_EVIDENCE_ATTEMPT_LIMIT = 25;
const WORKBENCH_DISTINCT_EVIDENCE_ATTEMPT_LIMIT = 50;

function parseRecord(value: string): JsonRecord {
  try {
    const parsed = parseJsonText(value);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function parseList(value: string): unknown[] {
  try {
    const parsed = parseJsonText(value);
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

function latestActivityByKind(events: JsonRecord[], eventKind: string) {
  return events.filter((event) => optionalString(event.event_kind) === eventKind).at(-1) ?? null;
}

function hasEntries(value: unknown) {
  return Array.isArray(value) && value.length > 0;
}

function stringListFrom(value: unknown) {
  return Array.isArray(value) ? stringList(value) : [];
}

function evidenceAttemptKey(attempt: StageAttemptProjection) {
  const workspaceLocator = isRecord(attempt.workspace_locator) ? attempt.workspace_locator : {};
  return [
    optionalString(attempt.domain_id),
    optionalString(attempt.stage_id),
    optionalString(workspaceLocator.study_id),
    optionalString(workspaceLocator.quest_id),
  ].filter(Boolean).join(':') || optionalString(attempt.stage_attempt_id) || 'unknown-attempt';
}

function selectEvidenceAttempts(attempts: StageAttemptProjection[]) {
  if (attempts.length <= WORKBENCH_EVIDENCE_ATTEMPT_LIMIT) {
    return attempts;
  }
  const selected: StageAttemptProjection[] = [];
  const selectedKeys = new Set<string>();
  for (const attempt of attempts) {
    const key = evidenceAttemptKey(attempt);
    if (selectedKeys.has(key)) {
      continue;
    }
    selected.push(attempt);
    selectedKeys.add(key);
    if (selected.length >= WORKBENCH_DISTINCT_EVIDENCE_ATTEMPT_LIMIT) {
      break;
    }
  }
  return selected;
}

function stringRefsFromUnknown(value: unknown) {
  if (typeof value === 'string' && value.trim()) {
    return [value.trim()];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry) => {
      if (typeof entry === 'string' && entry.trim()) {
        return [entry.trim()];
      }
      if (isRecord(entry)) {
        return [
          optionalString(entry.ref),
          optionalString(entry.ref_id),
          optionalString(entry.path),
          optionalString(entry.uri),
        ].filter((ref): ref is string => Boolean(ref));
      }
      return [];
    });
  }
  if (isRecord(value)) {
    return [
      optionalString(value.ref),
      optionalString(value.ref_id),
      optionalString(value.path),
      optionalString(value.uri),
    ].filter((ref): ref is string => Boolean(ref));
  }
  return [];
}

function researchFrontierBoardFromRouteImpact(routeImpact: JsonRecord) {
  for (const key of [
    'research_frontier_board',
    'opl_research_frontier_projection',
    'frontier_board',
    'stage_candidate_portfolio',
  ]) {
    const value = routeImpact[key];
    if (isRecord(value)) {
      return value as JsonRecord;
    }
  }
  return null;
}

function packetLikeRef(value: string) {
  return value.startsWith('packet:')
    || value.includes('/default_executor_dispatches/')
    || value.includes('/stage_packets/')
    || value.endsWith('.stage-packet.json')
    || value.endsWith('/stage-packet.json');
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function attemptHasHumanGate(row: StageAttemptWorkbenchRow, humanGateRefs: string[], humanGateLedger: JsonRecord[]) {
  return row.status === 'human_gate' || humanGateRefs.length > 0 || humanGateLedger.length > 0;
}

function sourceRefs(queueDb: string): RuntimeTraySourceRef[] {
  return [
    fileSourceRef(`${queueDb}#stage_attempts`, 'stage_attempt_ledger', `OPL stage ${OBSERVABILITY_ATTEMPT_LEDGER_LABEL}`),
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

function stagePacketRefsForAttempt(input: {
  activityEvents: JsonRecord[];
  checkpointRefs: string[];
  workspaceLocator: JsonRecord;
}) {
  return uniqueStrings([
    ...stagePacketRefs(input.activityEvents),
    ...input.checkpointRefs.filter(packetLikeRef),
    ...stringRefsFromUnknown(input.workspaceLocator.stage_packet_ref),
    ...stringRefsFromUnknown(input.workspaceLocator.stage_packet_refs),
    ...stringRefsFromUnknown(input.workspaceLocator.dispatch_ref),
  ]);
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
  checkpointRefs: string[];
  workspaceLocator: JsonRecord;
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
    [QUEUE_PROJECTION_VOCABULARY.deadLetter]: input.isDeadLetter,
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
      stage_packet_refs: stagePacketRefsForAttempt({
        activityEvents: input.activityEvents,
        checkpointRefs: input.checkpointRefs,
        workspaceLocator: input.workspaceLocator,
      }),
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
      [QUEUE_PROJECTION_VOCABULARY.maxAttempts]: typeof retryBudget[QUEUE_PROJECTION_VOCABULARY.maxAttempts] === 'number'
        ? retryBudget[QUEUE_PROJECTION_VOCABULARY.maxAttempts]
        : null,
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

function temporalVisibilityReadinessFromProvider(
  provider: Awaited<ReturnType<typeof inspectFamilyRuntimeProviderWithLifecycle>> | null,
) {
  const readiness = provider?.details?.temporal_visibility_readiness;
  return isRecord(readiness) ? readiness as TemporalStageAttemptVisibilityReadiness : null;
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
  taskPayload: JsonRecord | null = null,
) {
  const providerRun = parseRecord(row.provider_run_json);
  const activityEvents = recordList(parseList(row.activity_events_json));
  const launchInvocationEvent = latestActivityByKind(activityEvents, 'stage_launch_invocation');
  const launchInvocation = isRecord(launchInvocationEvent?.invocation)
    ? launchInvocationEvent.invocation as JsonRecord
    : null;
  const routeImpact = parseRecord(row.route_impact_json);
  const workspaceLocator = normalizedWorkspaceLocator(row, parseRecord(row.workspace_locator_json), taskPayload);
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
    executorKind: row.executor_kind,
    retryBudget: parseRecord(row.retry_budget_json),
    attemptCount: row.attempt_count,
    providerRun,
    activityEvents,
    routeImpact,
  });
  const modelRouteCostProjection = buildModelRouteCostProjection({
    stageAttemptId: row.stage_attempt_id,
    status: row.status,
    blockedReason: row.blocked_reason,
    executorKind: row.executor_kind,
    retryBudget: parseRecord(row.retry_budget_json),
    attemptCount: row.attempt_count,
    providerRun,
    activityEvents,
    routeImpact,
    usageProjection,
  });
  const stageProgressLog = buildStageProgressLog({
    stageAttemptId: row.stage_attempt_id,
    providerKind: row.provider_kind,
    executorKind: row.executor_kind,
    domainId: row.domain_id,
    stageId: row.stage_id,
    workflowId: row.workflow_id,
    taskId: row.task_id,
    workspaceLocator,
    sourceFingerprint: row.source_fingerprint,
    status: row.status,
    blockedReason: row.blocked_reason,
    checkpointRefs,
    closeoutRefs,
    consumedRefs,
    consumedMemoryRefs,
    writebackReceiptRefs,
    humanGateRefs,
    retryBudget: parseRecord(row.retry_budget_json),
    attemptCount: row.attempt_count,
    providerRun,
    temporalVisibilityReadiness: temporalVisibilityReadinessFromProvider(providerReadiness),
    activityEvents,
    routeImpact,
    latestCloseout,
    closeoutReceiptStatus: row.closeout_receipt_status,
    nextOwner,
    domainReadyVerdict,
    canonicalOutcome,
    usageProjection,
    modelRouteCostProjection,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
  const memoryTraceProjection = stageProgressLog.memory_trace_projection;
  const attemptTruePathProof = buildStageAttemptTruePathProof({
    stageAttemptId: row.stage_attempt_id,
    taskId: row.task_id,
    workflowId: row.workflow_id,
    providerKind: row.provider_kind,
    domainId: row.domain_id,
    stageId: row.stage_id,
    status: row.status,
    stageProgressLog,
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
    [QUEUE_PROJECTION_VOCABULARY.deadLetter]: deadLetter,
    domain_ready_verdict: domainReadyVerdict,
    controlled_apply_contract: controlledApplyContract,
    lifecycle_primitives: lifecyclePrimitives,
    current_provider_readiness: currentProviderReadiness,
    research_frontier_board: researchFrontierBoardFromRouteImpact(routeImpact),
  });
  const humanReviewBurdenBudget = buildAttemptHumanReviewBurdenBudget({
    targetDomainId: row.domain_id,
    stageId: row.stage_id,
    humanGateRefs,
    humanGateLedger,
    routeImpact,
  });
  const attemptLaunchEnvelope = buildStageAttemptLaunchEnvelope({
    stageAttemptId: row.stage_attempt_id,
    domainId: row.domain_id,
    stageId: row.stage_id,
    workspaceLocator,
    sourceFingerprint: row.source_fingerprint,
  });
  const closeoutRefsOnlyContract = buildStageAttemptCloseoutRefsOnlyContract({
    stageAttemptId: row.stage_attempt_id,
    domainId: row.domain_id,
    stageId: row.stage_id,
    closeoutRefs,
    consumedRefs,
    writebackReceiptRefs,
    routeImpact,
  });
  const controlLoopSummary = buildAttemptControlLoopSummary({
    row,
    routeImpact,
    latestCloseout,
    activityEvents,
    checkpointRefs,
    workspaceLocator,
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
    executor_kind: row.executor_kind,
    domain_id: row.domain_id,
    stage_id: row.stage_id,
    workflow_id: row.workflow_id,
    task_id: row.task_id,
    workspace_locator: workspaceLocator,
    source_fingerprint: row.source_fingerprint,
    workflow_status: optionalString(providerRun.provider_status) ?? row.status,
    activity_status: optionalString(activity?.activity_status),
    activity_kind: optionalString(activity?.activity_kind),
    launch_invocation: launchInvocation,
    attempt_launch_envelope: attemptLaunchEnvelope,
    closeout_refs_only_contract: closeoutRefsOnlyContract,
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
    memory_trace_projection: memoryTraceProjection,
    model_route_cost_projection: modelRouteCostProjection,
    stage_progress_log: stageProgressLog,
    attempt_true_path_proof: attemptTruePathProof,
    temporal_visibility: stageProgressLog.temporal_visibility,
    temporal_webui_ref: stageProgressLog.temporal_webui_ref,
    ...genericProjections,
    next_owner: nextOwner,
    human_gate_refs: humanGateRefs,
    human_gate_ledger: humanGateLedger,
    human_review_burden_budget: humanReviewBurdenBudget,
    user_instruction_ledger: userInstructionLedger,
    resume_ledger: resumeLedger,
    user_instructions: userInstructionLedger,
    resume_signals: resumeLedger,
    [QUEUE_PROJECTION_VOCABULARY.deadLetter]: deadLetter,
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

function normalizedWorkspaceLocator(
  row: StageAttemptWorkbenchRow,
  workspaceLocator: JsonRecord,
  taskPayload: JsonRecord | null,
) {
  const profile = resolveDomainOwnerAnswerProjectionProfile(row.domain_id);
  if (
    !profile?.stageNativeOwnerAnswer
    || row.stage_id !== profile.stageNativeOwnerAnswer.dispatchTaskKind
    || optionalString(workspaceLocator.domain_source_fingerprint)
  ) {
    return workspaceLocator;
  }
  const domainSourceFingerprint = optionalString(taskPayload?.source_fingerprint);
  return domainSourceFingerprint
    ? { ...workspaceLocator, domain_source_fingerprint: domainSourceFingerprint }
    : workspaceLocator;
}

function taskPayloadsById(db: DatabaseSync, taskIds: string[]) {
  const uniqueTaskIds = [...new Set(taskIds.filter((taskId) => taskId.trim().length > 0))];
  if (uniqueTaskIds.length === 0) {
    return new Map<string, JsonRecord>();
  }
  const rows = db.prepare(`
    SELECT task_id, payload_json
    FROM tasks
    WHERE task_id IN (${uniqueTaskIds.map(() => '?').join(',')})
  `).all(...uniqueTaskIds) as Array<{ task_id: string; payload_json: string }>;
  return new Map(rows.map((row) => [row.task_id, parseRecord(row.payload_json)]));
}

function currentControlStatesByTaskId(db: DatabaseSync, taskIds: string[]) {
  const uniqueTaskIds = [...new Set(taskIds.filter((taskId) => taskId.trim().length > 0))];
  return new Map(uniqueTaskIds.map((taskId) => [taskId, deriveCurrentControlStateForTask(db, taskId)]));
}

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
      memory_trace_projection: EMPTY_WORKBENCH_METADATA.summary.memory_trace_projection,
      model_route_cost_projection: EMPTY_WORKBENCH_METADATA.summary.model_route_cost_projection,
      stage_progress_log: EMPTY_WORKBENCH_METADATA.summary.stage_progress_log,
      package_export_lifecycle: EMPTY_WORKBENCH_METADATA.summary.package_export_lifecycle,
      research_frontier_board: EMPTY_WORKBENCH_METADATA.summary.research_frontier_board,
      action_routing: EMPTY_WORKBENCH_METADATA.summary.action_routing,
      transition_bridge_evidence: EMPTY_WORKBENCH_METADATA.summary.transition_bridge_evidence,
      control_loop_summary: EMPTY_WORKBENCH_METADATA.summary.control_loop_summary,
      attempt_history: EMPTY_WORKBENCH_METADATA.summary.attempt_history,
      human_review_burden_budget: EMPTY_WORKBENCH_METADATA.human_review_burden_budget,
      effective_current_context: EMPTY_EFFECTIVE_CURRENT_CONTEXT,
      family_stall_lineage: EMPTY_FAMILY_STALL_LINEAGE,
      source_refs: sourceRefs(queueDb),
      authority_boundary: {
        opl: 'attempt_control_metadata_projection_only',
        domain: 'truth_quality_artifact_gate_owner',
      },
    };
  }

  const db = openFamilyRuntimeSqlite(queueDb, { readOnly: true });
  try {
    const allRows = listStageAttemptRows(db) as StageAttemptWorkbenchRow[];
    const rows = allRows.slice(0, 25);
    const attemptIds = allRows.map((row) => row.stage_attempt_id);
    const taskPayloads = taskPayloadsById(
      db,
      allRows.map((row) => row.task_id).filter((taskId): taskId is string => Boolean(taskId)),
    );
    const currentControlStates = currentControlStatesByTaskId(
      db,
      allRows.map((row) => row.task_id).filter((taskId): taskId is string => Boolean(taskId)),
    );
    const latestCloseouts = latestStageAttemptCloseoutPacketsByAttempt(db, attemptIds);
    const signals = stageAttemptSignalsByAttempt(db, attemptIds);
    const providerReadiness = await currentProviderReadinessByKind(allRows, paths, options);
    const evidenceAttempts = allRows.map((row) => {
      const providerKind = providerKindForRow(row);
      return attemptProjection(
        row,
        latestCloseouts.get(row.stage_attempt_id) ?? null,
        signals.get(row.stage_attempt_id) ?? [],
        providerKind ? providerReadiness.get(providerKind) ?? null : null,
        row.task_id ? taskPayloads.get(row.task_id) ?? null : null,
      );
    });
    const evidenceAttemptsWithControlState = evidenceAttempts.map((attempt) => ({
      ...attempt,
      current_control_state: attempt.task_id
        ? currentControlStates.get(attempt.task_id) ?? null
        : deriveCurrentControlStateForAttempt(db, attempt.stage_attempt_id),
    }));
    const attempts = evidenceAttemptsWithControlState.slice(0, 25);
    const projectedEvidenceAttempts = selectEvidenceAttempts(evidenceAttemptsWithControlState);
    const metadata = buildWorkbenchMetadata(attempts);
    const effectiveCurrentContext = buildEffectiveCurrentContextPacket(projectedEvidenceAttempts);
    const familyStallLineage = buildFamilyStallLineage(projectedEvidenceAttempts);
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
      memory_trace_projection: metadata.summary.memory_trace_projection,
      model_route_cost_projection: metadata.summary.model_route_cost_projection,
      stage_progress_log: metadata.summary.stage_progress_log,
      package_export_lifecycle: metadata.summary.package_export_lifecycle,
      research_frontier_board: metadata.summary.research_frontier_board,
      action_routing: metadata.summary.action_routing,
      transition_bridge_evidence: metadata.summary.transition_bridge_evidence,
      control_loop_summary: metadata.summary.control_loop_summary,
      attempt_history: metadata.summary.attempt_history,
      human_review_burden_budget: metadata.human_review_burden_budget,
      effective_current_context: effectiveCurrentContext,
      family_stall_lineage: familyStallLineage,
      attempts,
      evidence_attempts: projectedEvidenceAttempts,
      evidence_attempt_count: evidenceAttemptsWithControlState.length,
      attempt_list_limit: 25,
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
      memory_trace_projection: EMPTY_WORKBENCH_METADATA.summary.memory_trace_projection,
      model_route_cost_projection: EMPTY_WORKBENCH_METADATA.summary.model_route_cost_projection,
      stage_progress_log: EMPTY_WORKBENCH_METADATA.summary.stage_progress_log,
      package_export_lifecycle: EMPTY_WORKBENCH_METADATA.summary.package_export_lifecycle,
      research_frontier_board: EMPTY_WORKBENCH_METADATA.summary.research_frontier_board,
      action_routing: EMPTY_WORKBENCH_METADATA.summary.action_routing,
      transition_bridge_evidence: EMPTY_WORKBENCH_METADATA.summary.transition_bridge_evidence,
      control_loop_summary: EMPTY_WORKBENCH_METADATA.summary.control_loop_summary,
      attempt_history: EMPTY_WORKBENCH_METADATA.summary.attempt_history,
      human_review_burden_budget: EMPTY_WORKBENCH_METADATA.human_review_burden_budget,
      effective_current_context: EMPTY_EFFECTIVE_CURRENT_CONTEXT,
      family_stall_lineage: EMPTY_FAMILY_STALL_LINEAGE,
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
