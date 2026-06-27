import type { DatabaseSync } from 'node:sqlite';

import {
  providerAdmissionCurrentnessIdentity,
  sameProviderAdmissionCurrentnessIdentity,
} from '../family-runtime-mas-current-control-admission-currentness.ts';
import { listStageAttemptsForTask } from '../family-runtime-stage-attempts.ts';
import type { FamilyRuntimeTaskRow } from '../family-runtime-store.ts';
import { throwProviderOnlyRedriveBlocked } from './protocol.ts';

type StageAttemptPayload = ReturnType<typeof listStageAttemptsForTask>[number];
type RedriveCurrentnessIdentity = NonNullable<ReturnType<typeof redriveCurrentnessIdentity>>;

const LIVE_PROVIDER_ATTEMPT_STATUSES = new Set(['queued', 'running', 'checkpointed', 'human_gate']);
const ACCEPTED_CLOSEOUT_RECEIPT_STATUS = 'accepted_typed_closeout';
const PROVIDER_RUNTIME_BLOCKER_REF_PATTERN = /^opl:\/\/stage-attempts\/[^/]+\/runtime-blockers\/[^/]+$/;
const ACCEPTED_ADVANCING_DELTA_SHAPES = [
  'candidate_hash',
  'owner_answer_ref',
  'typed_blocker_ref',
  'human_gate_ref',
  'paper_facing_delta_ref',
] as const;

function nestedRecord(value: unknown) {
  return isRecord(value) ? value : null;
}

function paperMissionStageRouteCurrentnessIdentity(payload: Record<string, unknown>) {
  if (payload.runtime_request_kind !== 'mas_paper_mission_stage_route') {
    return null;
  }
  const stageRunRequest = nestedRecord(payload.stage_run_request);
  const handoff = nestedRecord(payload.opl_route_handoff_record);
  const carrier = nestedRecord(handoff?.opl_runtime_carrier);
  const routeIdentityKey = stringValue(payload.route_identity_key)
    ?? stringValue(stageRunRequest?.route_identity_key)
    ?? stringValue(carrier?.route_identity_key);
  const attemptIdempotencyKey = stringValue(payload.attempt_idempotency_key)
    ?? stringValue(payload.idempotency_key)
    ?? stringValue(stageRunRequest?.attempt_idempotency_key)
    ?? stringValue(carrier?.attempt_idempotency_key)
    ?? stringValue(carrier?.idempotency_key);
  if (!routeIdentityKey || !attemptIdempotencyKey) {
    return null;
  }
  return {
    identity_kind: 'paper_mission_stage_route' as const,
    study_id: stringValue(payload.study_id),
    mission_id: stringValue(payload.mission_id),
    candidate_ref: stringValue(payload.candidate_ref),
    paper_mission_transaction_ref: stringValue(payload.paper_mission_transaction_ref),
    opl_route_command_ref: stringValue(payload.opl_route_command_ref),
    route_identity_key: routeIdentityKey,
    attempt_idempotency_key: attemptIdempotencyKey,
    request_idempotency_key: stringValue(payload.request_idempotency_key)
      ?? stringValue(stageRunRequest?.request_idempotency_key)
      ?? stringValue(carrier?.request_idempotency_key),
  };
}

function providerAdmissionRedriveCurrentnessIdentity(payload: Record<string, unknown>) {
  const identity = providerAdmissionCurrentnessIdentity(payload, { requirePendingStatus: false });
  if (!identity) {
    return null;
  }
  const hasSelectedStagePacket = Boolean(identity.stage_packet_ref && identity.stage_packet_refs.length > 0);
  const hasCurrentnessBasis = Boolean(
    identity.work_unit_id
    && identity.work_unit_fingerprint
    && (
      identity.route_identity_key
      || identity.attempt_idempotency_key
      || identity.source_eval_id
      || identity.truth_epoch
      || identity.runtime_health_epoch
      || identity.action_fingerprint
    ),
  );
  return hasSelectedStagePacket && hasCurrentnessBasis
    ? {
        identity_kind: 'provider_admission' as const,
        provider_admission_identity: identity,
      }
    : null;
}

function redriveCurrentnessIdentity(payload: Record<string, unknown>) {
  return providerAdmissionRedriveCurrentnessIdentity(payload)
    ?? paperMissionStageRouteCurrentnessIdentity(payload);
}

function attemptCurrentnessIdentity(attempt: StageAttemptPayload) {
  return redriveCurrentnessIdentity(attempt.workspace_locator);
}

function sameRedriveCurrentnessIdentity(
  attempt: StageAttemptPayload,
  identity: RedriveCurrentnessIdentity,
) {
  const attemptIdentity = attemptCurrentnessIdentity(attempt);
  if (!attemptIdentity || attemptIdentity.identity_kind !== identity.identity_kind) {
    return false;
  }
  if (identity.identity_kind === 'provider_admission') {
    if (attemptIdentity.identity_kind !== 'provider_admission') {
      return false;
    }
    return sameProviderAdmissionCurrentnessIdentity(
      attemptIdentity.provider_admission_identity,
      identity.provider_admission_identity,
    );
  }
  if (attemptIdentity.identity_kind !== 'paper_mission_stage_route') {
    return false;
  }
  return JSON.stringify(attemptIdentity) === JSON.stringify(identity);
}

function linkedProviderAttemptsForRedrive(
  db: DatabaseSync,
  row: FamilyRuntimeTaskRow,
  identity: RedriveCurrentnessIdentity,
) {
  return listStageAttemptsForTask(db, row.task_id).filter((attempt) => (
    attempt.provider_kind === 'temporal'
    && attempt.executor_kind === 'codex_cli'
    && sameRedriveCurrentnessIdentity(attempt, identity)
  ));
}

export function assertProviderOnlyRedriveProtocol(input: {
  db: DatabaseSync;
  row: FamilyRuntimeTaskRow;
  payload: Record<string, unknown>;
  evidenceKind: 'blocked_provider_transport' | 'retry_budget_dead_letter';
}) {
  const identity = redriveCurrentnessIdentity(input.payload);
  if (!identity) {
    return null;
  }
  const linkedAttempts = linkedProviderAttemptsForRedrive(input.db, input.row, identity);
  const acceptedCloseout = linkedAttempts.find((attempt) => (
    attempt.closeout_receipt_status === ACCEPTED_CLOSEOUT_RECEIPT_STATUS
  ));
  if (acceptedCloseout) {
    throwProviderOnlyRedriveBlocked(
      'family-runtime queue redrive is blocked by an accepted typed closeout.',
      'accepted_typed_closeout_exists',
      {
        task_id: input.row.task_id,
        status: input.row.status,
        dead_letter_reason: input.row.dead_letter_reason,
        evidence_kind: input.evidenceKind,
        currentness_identity: identity,
        linked_stage_attempt_id: acceptedCloseout.stage_attempt_id,
        linked_stage_attempt_status: acceptedCloseout.status,
        linked_stage_attempt_blocked_reason: acceptedCloseout.blocked_reason,
      },
    );
  }
  const liveAttempt = linkedAttempts.find((attempt) => LIVE_PROVIDER_ATTEMPT_STATUSES.has(attempt.status));
  if (liveAttempt) {
    throwProviderOnlyRedriveBlocked(
      'family-runtime queue redrive is blocked by a live linked provider attempt.',
      liveAttempt.status === 'queued'
        ? 'newer_queued_provider_redrive_attempt_exists'
        : 'live_linked_provider_attempt_exists',
      {
        task_id: input.row.task_id,
        status: input.row.status,
        dead_letter_reason: input.row.dead_letter_reason,
        evidence_kind: input.evidenceKind,
        currentness_identity: identity,
        linked_stage_attempt_id: liveAttempt.stage_attempt_id,
        linked_stage_attempt_status: liveAttempt.status,
        linked_stage_attempt_blocked_reason: liveAttempt.blocked_reason,
      },
    );
  }
  return {
    currentness_identity: identity,
    linked_provider_attempt_count: linkedAttempts.length,
  };
}

function hasOwnerRefs(value: unknown) {
  if (!isRecord(value)) {
    return false;
  }
  return Boolean(
    stringList(value.owner_receipt_refs).length > 0
    || stringValue(value.owner_receipt_ref)
    || stringList(value.domain_receipt_refs).length > 0
    || stringValue(value.domain_receipt_ref)
    || stringList(value.typed_blocker_refs).length > 0
    || stringValue(value.typed_blocker_ref)
  );
}

function hasStringField(record: Record<string, unknown>, fields: string[]) {
  return fields.some((field) => {
    const value = record[field];
    return stringValue(value) || stringList(value).length > 0;
  });
}

function hasNestedStringField(record: Record<string, unknown>, fields: string[]) {
  return hasStringField(record, fields)
    || Object.values(record).some((value) => isRecord(value) && hasStringField(value, fields));
}

function hasCandidateHash(payload: Record<string, unknown>) {
  return hasNestedStringField(payload, [
    'candidate_hash',
    'candidate_content_hash',
    'candidate_fingerprint',
    'package_hash',
    'package_content_hash',
    'source_content_hash',
  ]);
}

function hasOwnerAnswerShape(payload: Record<string, unknown>) {
  return hasNestedStringField(payload, [
    'owner_answer_ref',
    'owner_answer_refs',
    'domain_owner_receipt_ref',
    'domain_owner_receipt_refs',
    'owner_receipt_ref',
    'owner_receipt_refs',
    'domain_receipt_ref',
    'domain_receipt_refs',
    'route_back_evidence_ref',
    'route_back_evidence_refs',
  ]);
}

function hasTypedBlockerRef(payload: Record<string, unknown>) {
  return hasNestedStringField(payload, [
    'typed_blocker_ref',
    'typed_blocker_refs',
    'latest_typed_blocker_ref',
  ]);
}

function hasHumanGateRef(payload: Record<string, unknown>) {
  return hasNestedStringField(payload, [
    'human_gate_ref',
    'human_gate_refs',
  ]);
}

function hasPaperFacingDeltaRef(payload: Record<string, unknown>) {
  return hasNestedStringField(payload, [
    'paper_facing_delta_ref',
    'paper_facing_delta_refs',
    'paper_delta_ref',
    'paper_delta_refs',
    'paper_body_delta_ref',
    'paper_body_delta_refs',
    'submission_delta_ref',
    'submission_delta_refs',
    'manuscript_delta_ref',
    'manuscript_delta_refs',
  ]);
}

function hasAdvancingOwnerDelta(payload: Record<string, unknown>) {
  return hasCandidateHash(payload)
    || hasOwnerAnswerShape(payload)
    || hasTypedBlockerRef(payload)
    || hasHumanGateRef(payload)
    || hasPaperFacingDeltaRef(payload);
}

function routeBackOrDomainGateSignal(attempt: StageAttemptPayload) {
  const routeImpact = isRecord(attempt.route_impact) ? attempt.route_impact : {};
  const workspaceLocator = isRecord(attempt.workspace_locator) ? attempt.workspace_locator : {};
  const commandKind = stringValue(routeImpact.command_kind) ?? stringValue(workspaceLocator.command_kind);
  const domainReadyVerdict = stringValue(routeImpact.domain_ready_verdict);
  const reason = stringValue(routeImpact.reason) ?? stringValue(attempt.blocked_reason);
  if (commandKind === 'route_back') {
    return 'route_back';
  }
  if (domainReadyVerdict === 'domain_gate_pending') {
    return 'domain_gate_pending';
  }
  const closeoutRefSignal = stringList(attempt.closeout_refs).find((ref) =>
    ref.startsWith('route-back:')
    || ref.startsWith('route_back:')
    || ref.startsWith('domain-gate:')
    || ref.startsWith('domain_gate:')
  );
  if (closeoutRefSignal) {
    return closeoutRefSignal.startsWith('route') ? 'route_back' : 'domain_gate_pending';
  }
  return reason?.includes('route_back') || reason?.includes('domain_gate')
    ? reason
    : null;
}

function nonAdvancingRouteBackAttempt(
  attempts: StageAttemptPayload[],
  input: {
    currentnessIdentity: RedriveCurrentnessIdentity | null;
    payload: Record<string, unknown>;
  },
) {
  if (!input.currentnessIdentity || hasAdvancingOwnerDelta(input.payload)) {
    return null;
  }
  return attempts.find((attempt) => (
    sameRedriveCurrentnessIdentity(attempt, input.currentnessIdentity!)
    && attempt.closeout_receipt_status === ACCEPTED_CLOSEOUT_RECEIPT_STATUS
    && routeBackOrDomainGateSignal(attempt)
    && !hasOwnerRefs(attempt.route_impact)
    && stringList(attempt.human_gate_refs).length === 0
  )) ?? null;
}

function hasDomainCloseoutRefs(attempt: StageAttemptPayload) {
  return stringList(attempt.closeout_refs).some((ref) => (
    !PROVIDER_RUNTIME_BLOCKER_REF_PATTERN.test(ref)
  ));
}

function redriveBlockingDomainCloseoutAttempt(
  attempts: StageAttemptPayload[],
  input: {
    allowRefsOnlyCheckpointAttemptId?: string | null;
    currentnessIdentity?: RedriveCurrentnessIdentity | null;
  } = {},
) {
  const blockingAttempts = input.currentnessIdentity
    ? attempts.filter((attempt) => sameRedriveCurrentnessIdentity(attempt, input.currentnessIdentity!))
    : attempts;
  return blockingAttempts.find((attempt) => (
    !(
      attempt.stage_attempt_id === input.allowRefsOnlyCheckpointAttemptId
      && attempt.closeout_receipt_status === 'domain_handler_receipt_ref_only'
    )
    && (
      attempt.closeout_receipt_status === ACCEPTED_CLOSEOUT_RECEIPT_STATUS
      || hasDomainCloseoutRefs(attempt)
      || hasOwnerRefs(attempt.route_impact)
    )
  )) ?? null;
}

function liveLinkedProviderAttemptForRedrive(attempts: StageAttemptPayload[]) {
  return attempts.find((attempt) => (
    attempt.provider_kind === 'temporal'
    && attempt.executor_kind === 'codex_cli'
    && LIVE_PROVIDER_ATTEMPT_STATUSES.has(attempt.status)
    && attempt.closeout_receipt_status !== ACCEPTED_CLOSEOUT_RECEIPT_STATUS
  )) ?? null;
}

function liveProviderAttemptForRedrive(
  attempts: StageAttemptPayload[],
  identity: RedriveCurrentnessIdentity | null,
) {
  const candidateAttempts = identity
    ? attempts.filter((attempt) => sameRedriveCurrentnessIdentity(attempt, identity))
    : attempts;
  return liveLinkedProviderAttemptForRedrive(candidateAttempts);
}

function taskPayload(row: FamilyRuntimeTaskRow) {
  return JSON.parse(row.payload_json) as Record<string, unknown>;
}

export function assertNoProviderOnlySemanticRedriveBlocker(
  db: DatabaseSync,
  row: FamilyRuntimeTaskRow,
  input: {
    allowLiveAttemptId?: string | null;
    allowRefsOnlyCheckpointAttemptId?: string | null;
    stopLossDomainBlockerReasons: Set<string>;
  },
) {
  if (
    row.status === 'blocked'
    && input.stopLossDomainBlockerReasons.has(row.dead_letter_reason ?? '')
  ) {
    throwProviderOnlyRedriveBlocked(
      'family-runtime queue redrive does not redrive same-lineage stop-loss domain blockers.',
      'same_lineage_stop_loss_domain_blocker',
      {
        task_id: row.task_id,
        status: row.status,
        dead_letter_reason: row.dead_letter_reason,
      },
    );
  }
  const attempts = listStageAttemptsForTask(db, row.task_id);
  const payload = taskPayload(row);
  const currentnessIdentity = redriveCurrentnessIdentity(payload);
  const nonAdvancingAttempt = nonAdvancingRouteBackAttempt(attempts, {
    currentnessIdentity,
    payload,
  });
  if (nonAdvancingAttempt) {
    throwProviderOnlyRedriveBlocked(
      'family-runtime queue redrive requires a fresh MAS-owned executor delta after route-back/domain-gate closeout.',
      'non_advancing_route_back',
      {
        task_id: row.task_id,
        status: row.status,
        dead_letter_reason: row.dead_letter_reason,
        stage_attempt_id: nonAdvancingAttempt.stage_attempt_id,
        route_back_signal: routeBackOrDomainGateSignal(nonAdvancingAttempt),
        paper_mission_transaction_ref: stringValue(payload.paper_mission_transaction_ref),
        route_identity_key: stringValue(currentnessIdentity?.identity_kind === 'paper_mission_stage_route'
          ? currentnessIdentity.route_identity_key
          : null),
        attempt_idempotency_key: stringValue(currentnessIdentity?.identity_kind === 'paper_mission_stage_route'
          ? currentnessIdentity.attempt_idempotency_key
          : null),
        accepted_advancing_delta_shapes: [...ACCEPTED_ADVANCING_DELTA_SHAPES],
        required_owner_delta: 'mas_owned_executor_delta_required',
        provider_redrive_started: false,
      },
    );
  }
  const closeoutAttempt = redriveBlockingDomainCloseoutAttempt(attempts, {
    allowRefsOnlyCheckpointAttemptId: input.allowRefsOnlyCheckpointAttemptId,
    currentnessIdentity,
  });
  if (closeoutAttempt) {
    throwProviderOnlyRedriveBlocked(
      'family-runtime queue redrive does not redrive tasks with domain closeout or owner refs.',
      closeoutAttempt.closeout_receipt_status === ACCEPTED_CLOSEOUT_RECEIPT_STATUS
        ? 'accepted_typed_closeout_exists'
        : 'domain_owner_ref_exists',
      {
        task_id: row.task_id,
        status: row.status,
        dead_letter_reason: row.dead_letter_reason,
        stage_attempt_id: closeoutAttempt.stage_attempt_id,
        closeout_receipt_status: closeoutAttempt.closeout_receipt_status,
      },
    );
  }
  const liveAttempt = liveProviderAttemptForRedrive(attempts, currentnessIdentity);
  if (liveAttempt && liveAttempt.stage_attempt_id !== input.allowLiveAttemptId) {
    throwProviderOnlyRedriveBlocked(
      'family-runtime queue redrive does not duplicate a live linked provider attempt.',
      'live_linked_provider_attempt_exists',
      {
        task_id: row.task_id,
        status: row.status,
        dead_letter_reason: row.dead_letter_reason,
        stage_attempt_id: liveAttempt.stage_attempt_id,
        stage_attempt_status: liveAttempt.status,
      },
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}
