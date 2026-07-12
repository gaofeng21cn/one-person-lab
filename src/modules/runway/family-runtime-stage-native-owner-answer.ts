import type { DatabaseSync } from 'node:sqlite';

import {
  resolveDomainOwnerAnswerProjectionProfiles,
  type DomainOwnerAnswerProjectionProfile,
} from '../../kernel/domain-owner-answer-projection-profile.ts';
import { parseJsonText } from '../../kernel/json-file.ts';
import { record, stringValue } from '../../kernel/json-record.ts';
import type { StandardDomainAgentRepoInput } from '../../kernel/standard-domain-agent-family-repos.ts';
import { validateProgressDeltaReceipt } from '../ledger/index.ts';
import type { FamilyRuntimeTaskRow } from './family-runtime-store.ts';
import type { StageAttemptRow } from './family-runtime-stage-attempt-ledger.ts';

const LIVE_ATTEMPT_STATUSES = new Set(['queued', 'running', 'checkpointed', 'human_gate']);

export const STAGE_NATIVE_PROGRESS_OR_OWNER_ANSWER_MISSING_REASON =
  'stage_native_consumable_progress_or_owner_answer_missing_after_default_executor_completion';

export type StageNativeOwnerAnswerProfile = {
  profile_id: string;
  canonical_projection: 'domain_stage_native_owner_answer';
  domain_id: string;
  dispatch_task_kind: string;
  action_type: string;
  work_unit_id: string;
  next_executable_owner: string;
  closeout_surface_kind: string;
  stage_id: string;
  stage_outputs_fragment?: string;
  owner_receipt_ref: string;
  typed_blocker_ref: string;
  relative_owner_receipt_ref: string;
  relative_typed_blocker_ref: string;
};

function stageNativeOwnerAnswerProfile(
  profile: DomainOwnerAnswerProjectionProfile,
): StageNativeOwnerAnswerProfile | null {
  const stageNative = profile.stageNativeOwnerAnswer;
  if (!stageNative) {
    return null;
  }
  return {
    profile_id: profile.profileId,
    canonical_projection: stageNative.canonicalProjection,
    domain_id: profile.domainId,
    dispatch_task_kind: stageNative.dispatchTaskKind,
    action_type: stageNative.actionType,
    work_unit_id: stageNative.workUnitId,
    next_executable_owner: stageNative.nextExecutableOwner,
    closeout_surface_kind: stageNative.closeoutSurfaceKind,
    stage_id: stageNative.stageId,
    stage_outputs_fragment: stageNative.stageOutputsFragment,
    owner_receipt_ref: stageNative.ownerReceiptRef,
    typed_blocker_ref: stageNative.typedBlockerRef,
    relative_owner_receipt_ref: stageNative.relativeOwnerReceiptRef,
    relative_typed_blocker_ref: stageNative.relativeTypedBlockerRef,
  };
}

function stageNativeOwnerAnswerProfileForDomain(
  domainId: string,
  profiles?: readonly DomainOwnerAnswerProjectionProfile[],
  repoInputs?: readonly StandardDomainAgentRepoInput[],
) {
  const profile = (profiles ?? resolveDomainOwnerAnswerProjectionProfiles(repoInputs))
    .find((entry) => entry.domainId === domainId);
  return profile ? stageNativeOwnerAnswerProfile(profile) : null;
}

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

function jsonRecordList(value: string) {
  try {
    const parsed = parseJsonText(value);
    return Array.isArray(parsed)
      ? parsed.map(recordValue).filter((entry): entry is Record<string, unknown> => Boolean(entry))
      : [];
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
  profile: StageNativeOwnerAnswerProfile,
) {
  const fragment = profile.stage_outputs_fragment;
  return Boolean(stringValue(record.stage_id) === profile.stage_id
    || (fragment && stringValue(record.stage_manifest_ref)?.includes(fragment))
    || (fragment && stringValue(record.current_pointer_ref)?.includes(fragment))
    || (fragment && stringValue(record.written_ref)?.includes(fragment))
    || (fragment && stringValue(record.terminal_outcome_ref)?.includes(fragment)));
}

function isStageNativeOwnerAnswerRef(
  ref: string,
  allowRelative: boolean,
  profile: StageNativeOwnerAnswerProfile,
) {
  return ref.includes(profile.owner_receipt_ref)
    || ref.includes(profile.typed_blocker_ref)
    || (allowRelative && (
      ref === profile.relative_owner_receipt_ref
      || ref === profile.relative_typed_blocker_ref
    ));
}

function stageNativeRefCandidates(ref: string, profile: StageNativeOwnerAnswerProfile) {
  const trimmed = ref.trim();
  const studiesIndex = trimmed.indexOf('studies/');
  const artifactsIndex = profile.stage_outputs_fragment
    ? trimmed.indexOf(profile.stage_outputs_fragment)
    : -1;
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
  profile: StageNativeOwnerAnswerProfile,
) {
  // Scoped to an explicit domain-owned default-executor owner-answer profile.
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
  profile: StageNativeOwnerAnswerProfile,
) {
  return refs.some((ref) => stageNativeCloseoutRefMatchesCurrentPayload(ref, currentPayload, profile));
}

function directStageNativeAnswer(
  record: Record<string, unknown>,
  currentPayload: Record<string, unknown>,
  profile: StageNativeOwnerAnswerProfile,
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
  profile: StageNativeOwnerAnswerProfile,
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

function isConsumableProgressReceipt(value: unknown) {
  try {
    const receipt = validateProgressDeltaReceipt(value);
    return ['paper_progress_delta', 'deliverable_progress_delta'].includes(
      receipt.delta_classification,
    ) && receipt.produced_refs.length > 0;
  } catch {
    return false;
  }
}

function hasConsumableArtifactProgressInRecord(record: Record<string, unknown>): boolean {
  if (isConsumableProgressReceipt(record)) {
    return true;
  }
  const receipt = recordValue(record.progress_delta_receipt);
  if (receipt && isConsumableProgressReceipt(receipt)) {
    return true;
  }
  if (
    ['completed', 'completed_with_quality_debt'].includes(stringValue(record.transition_outcome) ?? '')
    && stringList(record.consumable_artifact_refs).length > 0
  ) {
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
    if (nested && hasConsumableArtifactProgressInRecord(nested)) {
      return true;
    }
  }
  return false;
}

function hasStageNativeProgressOrOwnerAnswerInRecord(
  record: Record<string, unknown>,
  currentPayload: Record<string, unknown>,
  profile: StageNativeOwnerAnswerProfile,
) {
  return hasStageNativeAnswerInRecord(record, currentPayload, profile)
    || hasConsumableArtifactProgressInRecord(record);
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
  profile: StageNativeOwnerAnswerProfile,
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

export function isStageNativeOwnerActionFromDomainProfile(input: {
  row: Pick<FamilyRuntimeTaskRow, 'domain_id' | 'task_kind'>;
  payload: Record<string, unknown>;
  profiles?: readonly DomainOwnerAnswerProjectionProfile[];
  repoInputs?: readonly StandardDomainAgentRepoInput[];
}) {
  const profile = stageNativeOwnerAnswerProfileForDomain(
    input.row.domain_id,
    input.profiles,
    input.repoInputs,
  );
  return Boolean(profile && isDomainStageNativeOwnerAction(input.row, input.payload, profile));
}

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

export function payloadReferencesStageNativeOwnerAnswerFromDomainProfile(input: {
  domainId: string;
  payload: Record<string, unknown>;
  profiles?: readonly DomainOwnerAnswerProjectionProfile[];
  repoInputs?: readonly StandardDomainAgentRepoInput[];
}) {
  const profile = stageNativeOwnerAnswerProfileForDomain(
    input.domainId,
    input.profiles,
    input.repoInputs,
  );
  return Boolean(profile && payloadReferencesStageNativeOwnerAnswer(input.payload, profile));
}

export function hasStageNativeOwnerAnswer(
  value: Record<string, unknown> | null,
  currentPayload: Record<string, unknown>,
  profile: StageNativeOwnerAnswerProfile,
) {
  return Boolean(value && hasStageNativeAnswerInRecord(value, currentPayload, profile));
}

export function stageAttemptRowHasStageNativeOwnerAnswerFromDomainProfile(input: {
  row: StageAttemptRow;
  currentPayload: Record<string, unknown>;
  profiles?: readonly DomainOwnerAnswerProjectionProfile[];
  repoInputs?: readonly StandardDomainAgentRepoInput[];
}) {
  const profile = stageNativeOwnerAnswerProfileForDomain(
    input.row.domain_id,
    input.profiles,
    input.repoInputs,
  );
  if (!profile) {
    return false;
  }
  const closeoutRefs = jsonStringList(input.row.closeout_refs_json);
  if (closeoutRefsHaveCurrentStageNativeOwnerAnswer(
    closeoutRefs,
    input.currentPayload,
    profile,
  )) {
    return true;
  }
  const routeImpact = jsonRecord(input.row.route_impact_json);
  return hasStageNativeOwnerAnswer(routeImpact, input.currentPayload, profile);
}

export function stageAttemptRowHasStageNativeProgressOrOwnerAnswerFromDomainProfile(input: {
  row: StageAttemptRow;
  currentPayload: Record<string, unknown>;
  profiles?: readonly DomainOwnerAnswerProjectionProfile[];
  repoInputs?: readonly StandardDomainAgentRepoInput[];
}) {
  const profile = stageNativeOwnerAnswerProfileForDomain(
    input.row.domain_id,
    input.profiles,
    input.repoInputs,
  );
  if (!profile) {
    return false;
  }
  const closeoutRefs = jsonStringList(input.row.closeout_refs_json);
  if (closeoutRefsHaveCurrentStageNativeOwnerAnswer(
    closeoutRefs,
    input.currentPayload,
    profile,
  )) {
    return true;
  }
  const routeImpact = jsonRecord(input.row.route_impact_json);
  if (routeImpact && hasStageNativeProgressOrOwnerAnswerInRecord(
    routeImpact,
    input.currentPayload,
    profile,
  )) {
    return true;
  }
  return jsonRecordList(input.row.activity_events_json).some((activity) =>
    hasStageNativeProgressOrOwnerAnswerInRecord(
      activity,
      input.currentPayload,
      profile,
    )
  );
}

export function stageAttemptPayloadHasStageNativeOwnerAnswerFromDomainProfile(input: {
  domainId: string;
  attempt: StageAttemptPayload;
  currentPayload: Record<string, unknown>;
  profiles?: readonly DomainOwnerAnswerProjectionProfile[];
  repoInputs?: readonly StandardDomainAgentRepoInput[];
}) {
  const profile = stageNativeOwnerAnswerProfileForDomain(
    input.domainId,
    input.profiles,
    input.repoInputs,
  );
  return Boolean(profile && stageAttemptHasStageNativeAnswer(input.attempt, input.currentPayload, profile));
}

export function stageAttemptPayloadHasStageNativeProgressOrOwnerAnswerFromDomainProfile(input: {
  domainId: string;
  attempt: StageAttemptPayload;
  currentPayload: Record<string, unknown>;
  profiles?: readonly DomainOwnerAnswerProjectionProfile[];
  repoInputs?: readonly StandardDomainAgentRepoInput[];
}) {
  const profile = stageNativeOwnerAnswerProfileForDomain(
    input.domainId,
    input.profiles,
    input.repoInputs,
  );
  return Boolean(profile && (
    stageAttemptHasStageNativeAnswer(input.attempt, input.currentPayload, profile)
    || hasConsumableArtifactProgressInRecord(input.attempt.route_impact)
    || input.attempt.activity_events.some((event) => {
      const activity = recordValue(event);
      return Boolean(activity && hasConsumableArtifactProgressInRecord(activity));
    })
  ));
}

export function defaultExecutorMissingStageNativeProgressOrOwnerAnswerRedriveDecision(input: {
  db: DatabaseSync;
  existing: FamilyRuntimeTaskRow;
  existingPayload: Record<string, unknown>;
  nextPayload: Record<string, unknown>;
  stageAttempts: StageAttemptPayload[];
}) {
  const profile = stageNativeOwnerAnswerProfileForDomain(input.existing.domain_id);
  if (
    !['succeeded', 'blocked'].includes(input.existing.status)
    || !profile
    || !isDomainStageNativeOwnerAction(input.existing, input.existingPayload, profile)
    || !isDomainStageNativeOwnerAction(input.existing, input.nextPayload, profile)
  ) {
    return null;
  }
  if (
    input.existing.status === 'blocked'
    && input.existing.dead_letter_reason !== STAGE_NATIVE_PROGRESS_OR_OWNER_ANSWER_MISSING_REASON
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
  if (evidenceRecords.some((record) => record && hasStageNativeProgressOrOwnerAnswerInRecord(
    record,
    input.nextPayload,
    profile,
  ))) {
    return null;
  }
  if (input.stageAttempts.some((attempt) => (
    stageAttemptHasStageNativeAnswer(attempt, input.nextPayload, profile)
    || hasConsumableArtifactProgressInRecord(attempt.route_impact)
    || attempt.activity_events.some((event) => {
      const activity = recordValue(event);
      return Boolean(activity && hasConsumableArtifactProgressInRecord(activity));
    })
  ))) {
    return null;
  }
  return {
    reason: STAGE_NATIVE_PROGRESS_OR_OWNER_ANSWER_MISSING_REASON,
    previous_source_fingerprint: stringValue(input.existingPayload.source_fingerprint),
    next_source_fingerprint: stringValue(input.nextPayload.source_fingerprint),
    previous_work_unit_fingerprint: stringValue(recordValue(input.existingPayload.owner_route_currentness_basis)?.work_unit_fingerprint),
    next_work_unit_fingerprint: stringValue(recordValue(input.nextPayload.owner_route_currentness_basis)?.work_unit_fingerprint),
    stage_attempt_ids: input.stageAttempts.map((attempt) => attempt.stage_attempt_id),
    stage_attempt_statuses: input.stageAttempts.map((attempt) => attempt.status),
  };
}
