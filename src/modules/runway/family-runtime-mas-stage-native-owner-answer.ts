import type { DatabaseSync } from 'node:sqlite';

import { parseJsonText } from '../../kernel/json-file.ts';
import { record, stringValue } from '../../kernel/json-record.ts';
import type { FamilyRuntimeTaskRow } from './family-runtime-store.ts';
import type { StageAttemptRow } from './family-runtime-stage-attempt-ledger.ts';

const DEFAULT_EXECUTOR_DISPATCH_TASK_KIND = 'domain_owner/default-executor-dispatch';
const LIVE_ATTEMPT_STATUSES = new Set(['queued', 'running', 'checkpointed', 'human_gate']);

export const MAS_STAGE_NATIVE_OWNER_ANSWER_MISSING_REASON =
  'stage_native_owner_answer_missing_after_default_executor_completion';

export type StageNativeOwnerAnswerProfile = {
  profile_id: string;
  profile_role: 'domain_owned_compatibility_profile';
  source_domain: string;
  domain_truth_owner: string;
  runtime_owner: string;
  compatibility_only: true;
  canonical_projection: 'domain_stage_native_owner_answer';
  domain_id: string;
  dispatch_task_kind: string;
  action_type: string;
  work_unit_id: string;
  next_executable_owner: string;
  closeout_surface_kind: string;
  stage_id: string;
  stage_outputs_fragment: string;
  owner_receipt_ref: string;
  typed_blocker_ref: string;
  relative_owner_receipt_ref: string;
  relative_typed_blocker_ref: string;
};

export const MAS_PUBLICATION_HANDOFF_STAGE_NATIVE_OWNER_ANSWER_PROFILE = {
  profile_id: 'medautoscience.publication_handoff.stage_native_owner_answer.v1',
  profile_role: 'domain_owned_compatibility_profile',
  source_domain: 'medautoscience',
  domain_truth_owner: 'med-autoscience',
  runtime_owner: 'one-person-lab',
  compatibility_only: true,
  canonical_projection: 'domain_stage_native_owner_answer',
  domain_id: 'medautoscience',
  dispatch_task_kind: DEFAULT_EXECUTOR_DISPATCH_TASK_KIND,
  action_type: 'complete_medical_paper_readiness_surface',
  work_unit_id: 'complete_medical_paper_readiness_surface',
  next_executable_owner: 'medautoscience',
  closeout_surface_kind: 'medical_paper_readiness_stage_native_closeout',
  stage_id: '08-publication_package_handoff',
  stage_outputs_fragment: 'artifacts/stage_outputs/08-publication_package_handoff',
  owner_receipt_ref: 'artifacts/stage_outputs/08-publication_package_handoff/receipts/owner_receipt.json',
  typed_blocker_ref: 'artifacts/stage_outputs/08-publication_package_handoff/receipts/typed_blocker.json',
  relative_owner_receipt_ref: 'receipts/owner_receipt.json',
  relative_typed_blocker_ref: 'receipts/typed_blocker.json',
} as const satisfies StageNativeOwnerAnswerProfile;

const DEFAULT_STAGE_NATIVE_OWNER_ANSWER_PROFILE: StageNativeOwnerAnswerProfile =
  MAS_PUBLICATION_HANDOFF_STAGE_NATIVE_OWNER_ANSWER_PROFILE;

type StageAttemptPayload = {
  stage_attempt_id: string;
  status: string;
  closeout_refs: string[];
  route_impact: Record<string, unknown>;
  activity_events: unknown[];
};

function recordValue(value: unknown): Record<string, unknown> | null {
  const parsed = record(value);
  return parsed === value ? parsed : null;
}

function jsonRecord(value: string) {
  try {
    return recordValue(parseJsonText(value));
  } catch {
    return null;
  }
}

function jsonStringList(value: string) {
  try {
    return stringList(parseJsonText(value));
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
    stringValue(record[key]),
    ...stringList(record[key]),
  ]).filter((entry): entry is string => Boolean(entry));
}

function hasStageNativeContext(
  record: Record<string, unknown>,
  profile = DEFAULT_STAGE_NATIVE_OWNER_ANSWER_PROFILE,
) {
  return Boolean(stringValue(record.stage_id) === profile.stage_id
    || stringValue(record.stage_manifest_ref)?.includes(profile.stage_outputs_fragment)
    || stringValue(record.current_pointer_ref)?.includes(profile.stage_outputs_fragment)
    || stringValue(record.written_ref)?.includes(profile.stage_outputs_fragment)
    || stringValue(record.terminal_outcome_ref)?.includes(profile.stage_outputs_fragment));
}

function isStageNativeOwnerAnswerRef(
  ref: string,
  allowRelative: boolean,
  profile = DEFAULT_STAGE_NATIVE_OWNER_ANSWER_PROFILE,
) {
  return ref.includes(profile.owner_receipt_ref)
    || ref.includes(profile.typed_blocker_ref)
    || (allowRelative && (
      ref === profile.relative_owner_receipt_ref
      || ref === profile.relative_typed_blocker_ref
    ));
}

function stageNativeRefCandidates(ref: string, profile = DEFAULT_STAGE_NATIVE_OWNER_ANSWER_PROFILE) {
  const trimmed = ref.trim();
  const studiesIndex = trimmed.indexOf('studies/');
  const artifactsIndex = trimmed.indexOf(profile.stage_outputs_fragment);
  return [...new Set([
    trimmed,
    studiesIndex >= 0 ? trimmed.slice(studiesIndex) : null,
    artifactsIndex >= 0 ? trimmed.slice(artifactsIndex) : null,
  ].filter((entry): entry is string => Boolean(entry)))];
}

function currentFingerprints(payload: Record<string, unknown>) {
  const basis = recordValue(payload.owner_route_currentness_basis);
  return new Set([
    stringValue(payload.source_fingerprint),
    stringValue(payload.work_unit_fingerprint),
    stringValue(payload.idempotency_key),
    stringValue(basis?.work_unit_fingerprint),
    stringValue(basis?.source_eval_id),
  ].filter((entry): entry is string => Boolean(entry)));
}

function answerFingerprints(record: Record<string, unknown>) {
  const binding = recordValue(record.closeout_binding);
  return new Set([
    stringValue(record.source_fingerprint),
    stringValue(record.work_unit_fingerprint),
    stringValue(record.idempotency_key),
    stringValue(binding?.source_fingerprint),
    stringValue(binding?.work_unit_fingerprint),
    stringValue(binding?.idempotency_key),
  ].filter((entry): entry is string => Boolean(entry)));
}

function fingerprintsMatch(answer: Record<string, unknown>, currentPayload: Record<string, unknown>) {
  const answerSet = answerFingerprints(answer);
  const currentSet = currentFingerprints(currentPayload);
  if (answerSet.size === 0 || currentSet.size === 0) {
    return answerSet.size === 0 && currentSet.size === 0;
  }
  return [...answerSet].some((entry) => currentSet.has(entry));
}

function stageNativeCloseoutRefMatchesCurrentPayload(
  ref: string,
  currentPayload: Record<string, unknown>,
  profile = DEFAULT_STAGE_NATIVE_OWNER_ANSWER_PROFILE,
) {
  // Scoped to MAS default-executor owner-answer currentness repair only.
  // StageRun closeout admission still requires the separate idempotency-bound owner receipt / typed blocker gate.
  if (!isStageNativeOwnerAnswerRef(ref, true, profile)) {
    return false;
  }
  const currentSet = currentFingerprints(currentPayload);
  if (currentSet.size === 0) {
    return false;
  }
  const refCandidates = stageNativeRefCandidates(ref, profile);
  return [...currentSet].some((fingerprint) =>
    refCandidates.some((candidate) => fingerprint.includes(candidate))
  );
}

function closeoutRefsHaveCurrentStageNativeOwnerAnswer(
  refs: string[],
  currentPayload: Record<string, unknown>,
  profile = DEFAULT_STAGE_NATIVE_OWNER_ANSWER_PROFILE,
) {
  return refs.some((ref) => stageNativeCloseoutRefMatchesCurrentPayload(ref, currentPayload, profile));
}

function directStageNativeAnswer(
  record: Record<string, unknown>,
  currentPayload: Record<string, unknown>,
  profile = DEFAULT_STAGE_NATIVE_OWNER_ANSWER_PROFILE,
) {
  if (
    stringValue(record.surface_kind) === profile.closeout_surface_kind
    && stringValue(record.status) === 'materialized'
    && fingerprintsMatch(record, currentPayload)
  ) {
    const writtenRef = stringValue(record.written_ref)
      ?? stringValue(record.terminal_outcome_ref);
    if (!writtenRef || isStageNativeOwnerAnswerRef(writtenRef, true, profile)) {
      return true;
    }
  }
  const allowRelative = hasStageNativeContext(record, profile);
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
  return refs.some((ref) => isStageNativeOwnerAnswerRef(ref, allowRelative, profile))
    && fingerprintsMatch(record, currentPayload);
}

function hasStageNativeAnswerInRecord(
  record: Record<string, unknown>,
  currentPayload: Record<string, unknown>,
  profile = DEFAULT_STAGE_NATIVE_OWNER_ANSWER_PROFILE,
): boolean {
  if (directStageNativeAnswer(record, currentPayload, profile)) {
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
    if (nested && hasStageNativeAnswerInRecord(nested, currentPayload, profile)) {
      return true;
    }
  }
  const evidence = recordValue(record.domain_dispatch_evidence_record_payload);
  return Boolean(evidence && hasStageNativeAnswerInRecord(evidence, currentPayload, profile));
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
  profile = DEFAULT_STAGE_NATIVE_OWNER_ANSWER_PROFILE,
) {
  if (closeoutRefsHaveCurrentStageNativeOwnerAnswer(attempt.closeout_refs, currentPayload, profile)) {
    return true;
  }
  if (hasStageNativeAnswerInRecord(attempt.route_impact, currentPayload, profile)) {
    return true;
  }
  return attempt.activity_events.some((event) => {
    const record = recordValue(event);
    return Boolean(record && hasStageNativeAnswerInRecord(record, currentPayload, profile));
  });
}

export function isMasReadinessStageNativeOwnerAction(
  row: Pick<FamilyRuntimeTaskRow, 'domain_id' | 'task_kind'>,
  payload: Record<string, unknown>,
) {
  return isDomainStageNativeOwnerAction(row, payload, DEFAULT_STAGE_NATIVE_OWNER_ANSWER_PROFILE);
}

export function isDomainStageNativeOwnerAction(
  row: Pick<FamilyRuntimeTaskRow, 'domain_id' | 'task_kind'>,
  payload: Record<string, unknown>,
  profile: StageNativeOwnerAnswerProfile,
) {
  return row.domain_id === profile.domain_id
    && row.task_kind === profile.dispatch_task_kind
    && stringValue(payload.action_type) === profile.action_type
    && (
      stringValue(payload.work_unit_id) === null
      || stringValue(payload.work_unit_id) === profile.work_unit_id
    )
    && stringValue(payload.next_executable_owner)?.toLowerCase() === profile.next_executable_owner;
}

export const stageNativeOwnerActionMatchesProfile = isDomainStageNativeOwnerAction;

function sourceRefRecords(payload: Record<string, unknown>) {
  return Array.isArray(payload.source_refs)
    ? payload.source_refs.filter((entry): entry is Record<string, unknown> => Boolean(recordValue(entry)))
    : [];
}

export function payloadReferencesStageNativeOwnerAnswer(
  payload: Record<string, unknown>,
  profile: StageNativeOwnerAnswerProfile,
) {
  const basis = recordValue(payload.owner_route_currentness_basis);
  const ownerRoute = recordValue(payload.owner_route);
  const refs = [
    stringValue(payload.work_unit_fingerprint),
    stringValue(payload.latest_owner_answer_ref),
    stringValue(payload.latest_owner_receipt_ref),
    stringValue(payload.latest_typed_blocker_ref),
    ...stringList(payload.owner_receipt_refs),
    ...stringList(payload.typed_blocker_refs),
    ...refsFrom(basis ?? {}, [
      'work_unit_fingerprint',
      'source_ref',
      'owner_answer_ref',
      'owner_receipt_ref',
      'typed_blocker_ref',
      'latest_owner_answer_ref',
      'latest_owner_receipt_ref',
      'latest_typed_blocker_ref',
    ]),
    ...refsFrom(ownerRoute ?? {}, [
      'work_unit_fingerprint',
      'source_ref',
      'owner_answer_ref',
      'owner_receipt_ref',
      'typed_blocker_ref',
      'latest_owner_answer_ref',
      'latest_owner_receipt_ref',
      'latest_typed_blocker_ref',
    ]),
    ...sourceRefRecords(payload).flatMap((record) => {
      const role = stringValue(record.role) ?? '';
      if (!/(owner|typed_blocker|receipt|stage|work_unit|current)/.test(role)) {
        return [];
      }
      return [
        stringValue(record.ref),
        ...stringList(record.refs),
      ].filter((entry): entry is string => Boolean(entry));
    }),
  ].filter((entry): entry is string => Boolean(entry));
  return refs.some((ref) => isStageNativeOwnerAnswerRef(ref, true, profile));
}

export function masReadinessPayloadReferencesStageNativeOwnerAnswer(payload: Record<string, unknown>) {
  return payloadReferencesStageNativeOwnerAnswer(payload, DEFAULT_STAGE_NATIVE_OWNER_ANSWER_PROFILE);
}

export function hasStageNativeOwnerAnswer(
  value: Record<string, unknown> | null,
  currentPayload: Record<string, unknown>,
  profile: StageNativeOwnerAnswerProfile,
) {
  return Boolean(value && hasStageNativeAnswerInRecord(value, currentPayload, profile));
}

export function hasMasStageNativeOwnerAnswer(
  value: Record<string, unknown> | null,
  currentPayload: Record<string, unknown>,
) {
  return hasStageNativeOwnerAnswer(value, currentPayload, DEFAULT_STAGE_NATIVE_OWNER_ANSWER_PROFILE);
}

export function stageAttemptRowHasMasStageNativeOwnerAnswer(
  row: StageAttemptRow,
  currentPayload: Record<string, unknown>,
) {
  const closeoutRefs = jsonStringList(row.closeout_refs_json);
  if (closeoutRefsHaveCurrentStageNativeOwnerAnswer(
    closeoutRefs,
    currentPayload,
    DEFAULT_STAGE_NATIVE_OWNER_ANSWER_PROFILE,
  )) {
    return true;
  }
  const routeImpact = jsonRecord(row.route_impact_json);
  return hasMasStageNativeOwnerAnswer(routeImpact, currentPayload);
}

export function stageAttemptPayloadHasMasStageNativeOwnerAnswer(
  attempt: StageAttemptPayload,
  currentPayload: Record<string, unknown>,
) {
  return stageAttemptHasStageNativeAnswer(attempt, currentPayload);
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
    previous_source_fingerprint: stringValue(input.existingPayload.source_fingerprint),
    next_source_fingerprint: stringValue(input.nextPayload.source_fingerprint),
    previous_work_unit_fingerprint: stringValue(recordValue(input.existingPayload.owner_route_currentness_basis)?.work_unit_fingerprint),
    next_work_unit_fingerprint: stringValue(recordValue(input.nextPayload.owner_route_currentness_basis)?.work_unit_fingerprint),
    stage_attempt_ids: input.stageAttempts.map((attempt) => attempt.stage_attempt_id),
    stage_attempt_statuses: input.stageAttempts.map((attempt) => attempt.status),
  };
}
