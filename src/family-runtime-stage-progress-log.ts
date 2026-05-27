import type { StageAttemptUsageProjection } from './family-runtime-stage-attempt-usage.ts';
import {
  buildTemporalStageAttemptVisibility,
  buildTemporalWebUiRef,
} from './family-runtime-temporal-visibility.ts';

type JsonRecord = Record<string, unknown>;

export type StageProgressLogInput = {
  stageAttemptId: string;
  projectionScope?: string;
  providerKind: string;
  executorKind: string;
  domainId: string;
  stageId: string;
  workflowId: string;
  taskId?: string | null;
  workspaceLocator: JsonRecord;
  sourceFingerprint?: string | null;
  status: string;
  blockedReason?: string | null;
  checkpointRefs: string[];
  closeoutRefs: string[];
  consumedRefs: string[];
  consumedMemoryRefs: string[];
  writebackReceiptRefs: string[];
  humanGateRefs?: string[];
  retryBudget: JsonRecord;
  attemptCount: number;
  providerRun: JsonRecord;
  activityEvents: unknown[];
  routeImpact: JsonRecord;
  latestCloseout?: JsonRecord | null;
  closeoutReceiptStatus?: string | null;
  nextOwner: string;
  domainReadyVerdict?: string | null;
  canonicalOutcome?: string | null;
  usageProjection: StageAttemptUsageProjection;
  createdAt?: string | null;
  updatedAt?: string | null;
};

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function refsFromUnknown(value: unknown): string[] {
  if (typeof value === 'string' && value.trim()) {
    return [value.trim()];
  }
  if (Array.isArray(value)) {
    return value.flatMap(refsFromUnknown);
  }
  if (isRecord(value)) {
    return [
      stringValue(value.ref),
      stringValue(value.ref_id),
      stringValue(value.path),
      stringValue(value.uri),
    ].filter((ref): ref is string => Boolean(ref));
  }
  return [];
}

function refsFromRecord(record: JsonRecord | null | undefined, keys: string[]) {
  if (!record) {
    return [];
  }
  return keys.flatMap((key) => refsFromUnknown(record[key]));
}

function recordList(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function packetLikeRef(value: string) {
  return value.startsWith('packet:')
    || value.includes('/stage_packets/')
    || value.endsWith('.stage-packet.json')
    || value.endsWith('/stage-packet.json');
}

function stagePacketRefs(input: StageProgressLogInput) {
  return uniqueStrings([
    ...input.activityEvents.filter(isRecord).flatMap((event) => refsFromUnknown(event.stage_packet_ref)),
    ...input.checkpointRefs.filter(packetLikeRef),
    ...refsFromUnknown(input.workspaceLocator.stage_packet_ref),
    ...refsFromUnknown(input.workspaceLocator.stage_packet_refs),
  ]);
}

function activityEventRefs(input: StageProgressLogInput) {
  return input.activityEvents
    .map((event, index) => isRecord(event)
      ? [
          stringValue(event.event_ref),
          stringValue(event.ref),
          `stage_attempt:${input.stageAttemptId}#activity_events[${index}]`,
        ].filter((ref): ref is string => Boolean(ref))[0]
      : `stage_attempt:${input.stageAttemptId}#activity_events[${index}]`)
    .filter((ref): ref is string => Boolean(ref));
}

function firstActivityAt(events: JsonRecord[]) {
  return events.map((event) => stringValue(event.event_time)).find((value): value is string => Boolean(value)) ?? null;
}

function latestActivityAt(events: JsonRecord[]) {
  return events.map((event) => stringValue(event.event_time)).filter((value): value is string => Boolean(value)).at(-1) ?? null;
}

function stageProgressAuthorityBoundary() {
  return {
    opl: 'stage_progress_observability_projection_only',
    domain: 'truth_quality_artifact_gate_owner',
    provider: 'runtime_lifecycle_owner_not_domain_ready_owner',
    can_execute_domain_action: false,
    can_write_domain_truth: false,
    can_write_domain_memory_body: false,
    can_authorize_domain_ready: false,
    can_authorize_quality_verdict: false,
    provider_completion_is_domain_ready: false,
  };
}

export function buildStageProgressLog(input: StageProgressLogInput) {
  const activityEvents = input.activityEvents.filter(isRecord);
  const ownerReceiptRefs = uniqueStrings([
    ...refsFromRecord(input.latestCloseout, [
      'owner_receipt_ref',
      'owner_receipt_refs',
      'domain_owner_receipt_ref',
      'domain_owner_receipt_refs',
    ]),
    ...refsFromRecord(input.routeImpact, [
      'owner_receipt_ref',
      'owner_receipt_refs',
      'domain_owner_receipt_ref',
      'domain_owner_receipt_refs',
    ]),
  ]);
  const typedBlockerRefs = uniqueStrings([
    ...refsFromRecord(input.latestCloseout, ['typed_blocker_ref', 'typed_blocker_refs']),
    ...refsFromRecord(input.routeImpact, ['typed_blocker_ref', 'typed_blocker_refs']),
  ]);
  const routeRefs = uniqueStrings([
    ...refsFromRecord(input.routeImpact, [
      'route_ref',
      'route_refs',
      'proposal_ref',
      'proposal_refs',
      'quality_ref',
      'quality_refs',
      'readiness_ref',
      'readiness_refs',
      'handoff_ref',
      'handoff_refs',
    ]),
    ...refsFromUnknown(input.workspaceLocator.dispatch_ref),
  ]);
  const sourceRefs = uniqueStrings(refsFromUnknown(input.workspaceLocator.source_refs));
  const dispatchRefs = uniqueStrings([
    ...refsFromUnknown(input.workspaceLocator.dispatch_ref),
    ...refsFromUnknown(input.workspaceLocator.dispatch_refs),
  ]);
  const durationMsObserved = numberValue(input.usageProjection.duration.duration_ms_observed);
  const durationTelemetryStatus = Number(input.usageProjection.duration.observed_count) > 0 ? 'observed' : 'missing';
  const temporalVisibility = buildTemporalStageAttemptVisibility({
    providerKind: input.providerKind,
    stageAttemptId: input.stageAttemptId,
    workflowId: input.workflowId,
    domainId: input.domainId,
    stageId: input.stageId,
    taskId: input.taskId,
    sourceFingerprint: input.sourceFingerprint,
    executorKind: input.executorKind,
    providerRun: input.providerRun,
  });
  return {
    surface_kind: 'opl_stage_progress_log',
    projection_scope: input.projectionScope ?? 'stage_attempt',
    projection_policy: 'temporal_backed_opl_refs_only_stage_observability_no_domain_truth',
    stage_attempt_id: input.stageAttemptId,
    domain_id: input.domainId,
    stage_id: input.stageId,
    temporal_visibility: temporalVisibility,
    temporal_webui_ref: temporalVisibility
      ? buildTemporalWebUiRef(temporalVisibility)
      : null,
    intended_work: {
      provider_kind: input.providerKind,
      executor_kind: input.executorKind,
      workflow_id: input.workflowId,
      domain_id: input.domainId,
      stage_id: input.stageId,
      task_id: input.taskId ?? null,
      source_fingerprint: input.sourceFingerprint ?? null,
      workspace_locator: input.workspaceLocator,
      workspace_root: stringValue(input.workspaceLocator.workspace_root),
      runtime_root: stringValue(input.workspaceLocator.runtime_root),
      artifact_root: stringValue(input.workspaceLocator.artifact_root),
      profile_ref: stringValue(input.workspaceLocator.profile_ref),
      source_refs: sourceRefs,
      dispatch_refs: dispatchRefs,
      stage_packet_refs: stagePacketRefs(input),
      retry_budget: {
        ...input.retryBudget,
        attempt_count: input.attemptCount,
        max_attempts: numberValue(input.retryBudget.max_attempts),
      },
    },
    actual_work: {
      status: input.status,
      blocked_reason: input.blockedReason ?? null,
      provider_status: stringValue(input.providerRun.provider_status),
      closeout_receipt_status: input.closeoutReceiptStatus ?? null,
      canonical_outcome: input.canonicalOutcome ?? null,
      closeout_refs: input.closeoutRefs,
      consumed_refs: input.consumedRefs,
      consumed_memory_refs: input.consumedMemoryRefs,
      writeback_receipt_refs: input.writebackReceiptRefs,
      rejected_writes: recordList(input.latestCloseout?.rejected_writes),
      rejected_write_count: recordList(input.latestCloseout?.rejected_writes).length,
      route_impact: input.routeImpact,
      route_decision: stringValue(input.routeImpact.decision),
      next_owner: input.nextOwner,
      domain_ready_verdict: input.domainReadyVerdict ?? null,
    },
    timeline: {
      created_at: input.createdAt ?? null,
      updated_at: input.updatedAt ?? null,
      provider_started_at: stringValue(input.providerRun.started_at),
      provider_completed_at: stringValue(input.providerRun.completed_at),
      last_heartbeat_at: stringValue(input.providerRun.last_heartbeat_at),
      first_activity_event_at: firstActivityAt(activityEvents),
      latest_activity_event_at: latestActivityAt(activityEvents),
      activity_event_count: activityEvents.length,
      duration_ms_observed: durationMsObserved,
      duration_telemetry_status: durationTelemetryStatus,
    },
    usage: input.usageProjection,
    evidence_refs: {
      checkpoint_refs: input.checkpointRefs,
      closeout_refs: input.closeoutRefs,
      consumed_refs: input.consumedRefs,
      consumed_memory_refs: input.consumedMemoryRefs,
      writeback_receipt_refs: input.writebackReceiptRefs,
      human_gate_refs: input.humanGateRefs ?? [],
      owner_receipt_refs: ownerReceiptRefs,
      typed_blocker_refs: typedBlockerRefs,
      route_refs: routeRefs,
      source_refs: sourceRefs,
      dispatch_refs: dispatchRefs,
      stage_packet_refs: stagePacketRefs(input),
      activity_event_refs: activityEventRefs(input),
      activity_event_count: activityEvents.length,
    },
    authority_boundary: stageProgressAuthorityBoundary(),
  };
}
