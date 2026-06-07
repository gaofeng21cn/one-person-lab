import type { DatabaseSync } from 'node:sqlite';

import type { FamilyRuntimeTaskRow } from './family-runtime-store.ts';
import type { StageAttemptRow } from './family-runtime-stage-attempt-ledger.ts';

const DEFAULT_EXECUTOR_DISPATCH_TASK_KIND = 'domain_owner/default-executor-dispatch';
const READINESS_ACTION = 'complete_medical_paper_readiness_surface';
const STAGE_ID = '08-publication_package_handoff';
const STAGE_OUTPUTS_FRAGMENT = `artifacts/stage_outputs/${STAGE_ID}`;
const OWNER_RECEIPT_REF = `${STAGE_OUTPUTS_FRAGMENT}/receipts/owner_receipt.json`;
const TYPED_BLOCKER_REF = `${STAGE_OUTPUTS_FRAGMENT}/receipts/typed_blocker.json`;
const RELATIVE_OWNER_RECEIPT_REF = 'receipts/owner_receipt.json';
const RELATIVE_TYPED_BLOCKER_REF = 'receipts/typed_blocker.json';
const LIVE_ATTEMPT_STATUSES = new Set(['queued', 'running', 'checkpointed', 'human_gate']);

export const MAS_STAGE_NATIVE_OWNER_ANSWER_MISSING_REASON =
  'stage_native_owner_answer_missing_after_default_executor_completion';

type StageAttemptPayload = {
  stage_attempt_id: string;
  status: string;
  closeout_refs: string[];
  route_impact: Record<string, unknown>;
  activity_events: unknown[];
};

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function jsonRecord(value: string) {
  try {
    return recordValue(JSON.parse(value));
  } catch {
    return null;
  }
}

function jsonList(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

function refsFrom(record: Record<string, unknown>, keys: string[]) {
  return keys.flatMap((key) => [
    optionalString(record[key]),
    ...stringList(record[key]),
  ]).filter((entry): entry is string => Boolean(entry));
}

function hasStageNativeContext(record: Record<string, unknown>) {
  return Boolean(optionalString(record.stage_id) === STAGE_ID
    || optionalString(record.stage_manifest_ref)?.includes(STAGE_OUTPUTS_FRAGMENT)
    || optionalString(record.current_pointer_ref)?.includes(STAGE_OUTPUTS_FRAGMENT)
    || optionalString(record.written_ref)?.includes(STAGE_OUTPUTS_FRAGMENT)
    || optionalString(record.terminal_outcome_ref)?.includes(STAGE_OUTPUTS_FRAGMENT));
}

function isStageNativeOwnerAnswerRef(ref: string, allowRelative: boolean) {
  return ref.includes(OWNER_RECEIPT_REF)
    || ref.includes(TYPED_BLOCKER_REF)
    || (allowRelative && (
      ref === RELATIVE_OWNER_RECEIPT_REF
      || ref === RELATIVE_TYPED_BLOCKER_REF
    ));
}

function currentFingerprints(payload: Record<string, unknown>) {
  const basis = recordValue(payload.owner_route_currentness_basis);
  return new Set([
    optionalString(payload.source_fingerprint),
    optionalString(payload.work_unit_fingerprint),
    optionalString(payload.idempotency_key),
    optionalString(basis?.work_unit_fingerprint),
    optionalString(basis?.source_eval_id),
  ].filter((entry): entry is string => Boolean(entry)));
}

function answerFingerprints(record: Record<string, unknown>) {
  const binding = recordValue(record.closeout_binding);
  return new Set([
    optionalString(record.source_fingerprint),
    optionalString(record.work_unit_fingerprint),
    optionalString(record.idempotency_key),
    optionalString(binding?.source_fingerprint),
    optionalString(binding?.work_unit_fingerprint),
    optionalString(binding?.idempotency_key),
  ].filter((entry): entry is string => Boolean(entry)));
}

function fingerprintsMatch(answer: Record<string, unknown>, currentPayload: Record<string, unknown>) {
  const answerSet = answerFingerprints(answer);
  if (answerSet.size === 0) {
    return true;
  }
  const currentSet = currentFingerprints(currentPayload);
  if (currentSet.size === 0) {
    return true;
  }
  return [...answerSet].some((entry) => currentSet.has(entry));
}

function directStageNativeAnswer(record: Record<string, unknown>, currentPayload: Record<string, unknown>) {
  if (
    optionalString(record.surface_kind) === 'medical_paper_readiness_stage_native_closeout'
    && optionalString(record.status) === 'materialized'
    && fingerprintsMatch(record, currentPayload)
  ) {
    const writtenRef = optionalString(record.written_ref)
      ?? optionalString(record.terminal_outcome_ref);
    if (!writtenRef || isStageNativeOwnerAnswerRef(writtenRef, true)) {
      return true;
    }
  }
  const allowRelative = hasStageNativeContext(record);
  const refs = refsFrom(record, [
    'owner_receipt_refs',
    'typed_blocker_refs',
    'owner_receipt_ref',
    'typed_blocker_ref',
    'latest_owner_answer_ref',
    'latest_owner_receipt_ref',
    'latest_typed_blocker_ref',
    'written_ref',
    'terminal_outcome_ref',
    'source_ref',
  ]);
  return refs.some((ref) => isStageNativeOwnerAnswerRef(ref, allowRelative))
    && fingerprintsMatch(record, currentPayload);
}

function hasStageNativeAnswerInRecord(record: Record<string, unknown>, currentPayload: Record<string, unknown>): boolean {
  if (directStageNativeAnswer(record, currentPayload)) {
    return true;
  }
  for (const key of [
    'stage_native_closeout',
    'current_owner_delta',
    'owner_delta_result',
    'owner_result',
    'route_handoff',
    'route_impact',
    'output',
    'dispatch',
    'result',
    'record_payload',
  ]) {
    const nested = recordValue(record[key]);
    if (nested && hasStageNativeAnswerInRecord(nested, currentPayload)) {
      return true;
    }
  }
  const evidence = recordValue(record.domain_dispatch_evidence_record_payload);
  return Boolean(evidence && hasStageNativeAnswerInRecord(evidence, currentPayload));
}

function latestDispatchSucceededPayload(db: DatabaseSync, taskId: string) {
  const row = db.prepare(`
    SELECT payload_json
    FROM events
    WHERE task_id = ? AND event_type = 'task_dispatch_succeeded'
    ORDER BY created_at DESC
    LIMIT 1
  `).get(taskId) as { payload_json: string } | undefined;
  return row ? jsonRecord(row.payload_json) : null;
}

function stageAttemptHasStageNativeAnswer(
  attempt: StageAttemptPayload,
  currentPayload: Record<string, unknown>,
) {
  if (attempt.closeout_refs.some((ref) => isStageNativeOwnerAnswerRef(ref, false))) {
    return true;
  }
  if (hasStageNativeAnswerInRecord(attempt.route_impact, currentPayload)) {
    return true;
  }
  return attempt.activity_events.some((event) => {
    const record = recordValue(event);
    return Boolean(record && hasStageNativeAnswerInRecord(record, currentPayload));
  });
}

export function isMasReadinessStageNativeOwnerAction(
  row: Pick<FamilyRuntimeTaskRow, 'domain_id' | 'task_kind'>,
  payload: Record<string, unknown>,
) {
  return row.domain_id === 'medautoscience'
    && row.task_kind === DEFAULT_EXECUTOR_DISPATCH_TASK_KIND
    && optionalString(payload.action_type) === READINESS_ACTION
    && (
      optionalString(payload.work_unit_id) === null
      || optionalString(payload.work_unit_id) === READINESS_ACTION
    )
    && optionalString(payload.next_executable_owner)?.toLowerCase() === 'medautoscience';
}

export function hasMasStageNativeOwnerAnswer(
  value: Record<string, unknown> | null,
  currentPayload: Record<string, unknown>,
) {
  return Boolean(value && hasStageNativeAnswerInRecord(value, currentPayload));
}

export function stageAttemptRowHasMasStageNativeOwnerAnswer(
  row: StageAttemptRow,
  currentPayload: Record<string, unknown>,
) {
  const closeoutRefs = jsonList(row.closeout_refs_json)
    .filter((entry): entry is string => typeof entry === 'string');
  if (closeoutRefs.some((ref) => isStageNativeOwnerAnswerRef(ref, false))) {
    return true;
  }
  const routeImpact = jsonRecord(row.route_impact_json);
  return hasMasStageNativeOwnerAnswer(routeImpact, currentPayload);
}

export function defaultExecutorMissingStageNativeOwnerAnswerRedriveDecision(input: {
  db: DatabaseSync;
  existing: FamilyRuntimeTaskRow;
  existingPayload: Record<string, unknown>;
  nextPayload: Record<string, unknown>;
  stageAttempts: StageAttemptPayload[];
}) {
  if (
    !['succeeded', 'blocked'].includes(input.existing.status)
    || !isMasReadinessStageNativeOwnerAction(input.existing, input.existingPayload)
    || !isMasReadinessStageNativeOwnerAction(input.existing, input.nextPayload)
  ) {
    return null;
  }
  if (
    input.existing.status === 'blocked'
    && input.existing.dead_letter_reason !== MAS_STAGE_NATIVE_OWNER_ANSWER_MISSING_REASON
  ) {
    return null;
  }
  const liveAttempt = input.stageAttempts.find((attempt) => LIVE_ATTEMPT_STATUSES.has(attempt.status));
  if (liveAttempt) {
    return null;
  }
  const evidenceRecords = [
    input.existingPayload,
    input.nextPayload,
    latestDispatchSucceededPayload(input.db, input.existing.task_id),
  ];
  if (evidenceRecords.some((record) => hasMasStageNativeOwnerAnswer(record, input.nextPayload))) {
    return null;
  }
  if (input.stageAttempts.some((attempt) => stageAttemptHasStageNativeAnswer(attempt, input.nextPayload))) {
    return null;
  }
  return {
    reason: MAS_STAGE_NATIVE_OWNER_ANSWER_MISSING_REASON,
    previous_source_fingerprint: optionalString(input.existingPayload.source_fingerprint),
    next_source_fingerprint: optionalString(input.nextPayload.source_fingerprint),
    previous_work_unit_fingerprint: optionalString(recordValue(input.existingPayload.owner_route_currentness_basis)?.work_unit_fingerprint),
    next_work_unit_fingerprint: optionalString(recordValue(input.nextPayload.owner_route_currentness_basis)?.work_unit_fingerprint),
    stage_attempt_ids: input.stageAttempts.map((attempt) => attempt.stage_attempt_id),
    stage_attempt_statuses: input.stageAttempts.map((attempt) => attempt.status),
  };
}
