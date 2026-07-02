import type { FamilyRuntimeProviderKind } from '../family-runtime-types.ts';
import { openQueueDb } from '../family-runtime-store.ts';
import {
  listStageAttempts,
  syncStageAttemptFromTemporalTerminalObservation,
} from '../family-runtime-stage-attempts.ts';
import {
  queryTemporalStageAttemptReadModel as defaultQueryTemporalStageAttemptReadModel,
} from '../family-runtime-temporal-query.ts';

type JsonRecord = Record<string, unknown>;

export type EvidenceWorklistTemporalQuery = typeof defaultQueryTemporalStageAttemptReadModel;

export type EvidenceWorklistTerminalObservationSyncInput = {
  providerKind: FamilyRuntimeProviderKind;
  runtimeSnapshot?: unknown;
  candidateStageAttemptIds?: string[];
  queryTemporalStageAttemptReadModel?: EvidenceWorklistTemporalQuery;
};

const TEMPORAL_TERMINAL_SYNC_ATTEMPT_LIMIT = 25;
const TEMPORAL_TERMINAL_SYNC_LIVE_STATUSES = new Set([
  'running',
  'checkpointed',
  'human_gate',
]);

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function record(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function uniqueStringList(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((entry): entry is string => Boolean(entry)))];
}

function stringRecordList(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

export function domainDispatchRecordRouteAttemptIds(runtimeSnapshot: unknown) {
  const drilldown = record(record(record(runtimeSnapshot).runtime_tray_snapshot).app_operator_drilldown);
  const bridge = record(drilldown.app_execution_bridge);
  return uniqueStringList(stringRecordList(bridge.safe_action_routes)
    .filter((route) =>
      stringValue(route.action_kind) === 'domain_dispatch_evidence_receipt_record'
      && route.route_requires_domain_or_app_payload === true
    )
    .map((route) => stringValue(route.stage_attempt_id)));
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.map(stringValue).filter((entry): entry is string => Boolean(entry))
    : [];
}

function stageAttemptSignature(attempt: JsonRecord) {
  return JSON.stringify({
    status: attempt.status,
    blocked_reason: attempt.blocked_reason,
    closeout_receipt_status: attempt.closeout_receipt_status,
    closeout_refs: attempt.closeout_refs,
    route_impact: attempt.route_impact,
    provider_status: record(attempt.provider_run).provider_status,
    provider_completed_at: record(attempt.provider_run).completed_at,
  });
}

function providerRunHasTerminalObservation(attempt: JsonRecord) {
  const terminalObservation = record(record(attempt.provider_run).terminal_observation);
  return Boolean(stringValue(terminalObservation.source) || stringValue(terminalObservation.reason));
}

function shouldQueryTemporalAttempt(attempt: JsonRecord, explicitCandidateIds: Set<string>) {
  if (attempt.provider_kind !== 'temporal') {
    return false;
  }
  const stageAttemptId = stringValue(attempt.stage_attempt_id);
  if (stageAttemptId && explicitCandidateIds.has(stageAttemptId)) {
    return !providerRunHasTerminalObservation(attempt);
  }
  const status = stringValue(attempt.status);
  if (!status) {
    return false;
  }
  if (TEMPORAL_TERMINAL_SYNC_LIVE_STATUSES.has(status)) {
    return true;
  }
  return false;
}

function terminalObservationSyncAuthorityBoundary() {
  return {
    opl: 'provider_terminal_observation_sync_before_refs_only_worklist_projection',
    provider: 'temporal_stage_attempt_status_owner',
    domain: 'truth_quality_artifact_gate_owner',
    can_write_domain_truth: false,
    can_read_memory_body: false,
    can_read_artifact_body: false,
    can_mutate_artifact: false,
    can_generate_domain_owner_receipt: false,
    can_generate_typed_blocker: false,
    can_authorize_domain_ready: false,
    can_authorize_quality_verdict: false,
    can_claim_production_ready: false,
  };
}

function skippedTerminalObservationSync(reason: string) {
  return {
    surface_kind: 'opl_family_runtime_evidence_worklist_terminal_observation_sync',
    sync_policy: 'bounded_pre_snapshot_temporal_terminal_observation_sync',
    status: 'skipped',
    reason,
    enabled: false,
    attempt_limit: TEMPORAL_TERMINAL_SYNC_ATTEMPT_LIMIT,
    candidate_attempt_count: 0,
    queried_attempt_count: 0,
    synced_attempt_count: 0,
    unavailable_observation_count: 0,
    noop_observation_count: 0,
    synced_stage_attempt_ids: [],
    authority_boundary: terminalObservationSyncAuthorityBoundary(),
  };
}

export async function syncTerminalTemporalAttemptsForEvidenceWorklist(
  input: EvidenceWorklistTerminalObservationSyncInput,
) {
  if (input.runtimeSnapshot) {
    return skippedTerminalObservationSync('runtime_snapshot_supplied_by_caller');
  }
  if (input.providerKind !== 'temporal') {
    return skippedTerminalObservationSync('non_temporal_provider_selected');
  }
  const { db, paths } = openQueueDb();
  try {
    const explicitCandidateIds = new Set(input.candidateStageAttemptIds ?? []);
    const candidates = listStageAttempts(db)
      .filter((attempt) => shouldQueryTemporalAttempt(attempt, explicitCandidateIds))
      .slice(0, TEMPORAL_TERMINAL_SYNC_ATTEMPT_LIMIT);
    const queryTemporalStageAttemptReadModel =
      input.queryTemporalStageAttemptReadModel ?? defaultQueryTemporalStageAttemptReadModel;
    let queriedAttemptCount = 0;
    let syncedAttemptCount = 0;
    let unavailableObservationCount = 0;
    let noopObservationCount = 0;
    const syncedStageAttemptIds: string[] = [];
    for (const attempt of candidates) {
      const beforeSignature = stageAttemptSignature(attempt);
      const observation = await queryTemporalStageAttemptReadModel(attempt, { paths });
      queriedAttemptCount += 1;
      if (record(observation).surface_kind === 'temporal_stage_attempt_query_unavailable') {
        unavailableObservationCount += 1;
      }
      const syncedAttempt = syncStageAttemptFromTemporalTerminalObservation(db, observation);
      if (syncedAttempt && stageAttemptSignature(syncedAttempt) !== beforeSignature) {
        syncedAttemptCount += 1;
        syncedStageAttemptIds.push(syncedAttempt.stage_attempt_id);
      } else {
        noopObservationCount += 1;
      }
    }
    return {
      surface_kind: 'opl_family_runtime_evidence_worklist_terminal_observation_sync',
      sync_policy: 'bounded_pre_snapshot_temporal_terminal_observation_sync',
      status: 'synced',
      enabled: true,
      attempt_limit: TEMPORAL_TERMINAL_SYNC_ATTEMPT_LIMIT,
      candidate_attempt_count: candidates.length,
      explicit_candidate_stage_attempt_count: explicitCandidateIds.size,
      queried_attempt_count: queriedAttemptCount,
      synced_attempt_count: syncedAttemptCount,
      unavailable_observation_count: unavailableObservationCount,
      noop_observation_count: noopObservationCount,
      synced_stage_attempt_ids: uniqueStringList(syncedStageAttemptIds),
      authority_boundary: terminalObservationSyncAuthorityBoundary(),
    };
  } finally {
    db.close();
  }
}
