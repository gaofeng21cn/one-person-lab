import type { DatabaseSync } from 'node:sqlite';

import {
  providerAdmissionCurrentnessIdentity,
  sameProviderAdmissionCurrentnessIdentity,
} from '../family-runtime-mas-current-control-admission-currentness.ts';
import { listStageAttemptsForTask } from '../family-runtime-stage-attempts.ts';
import type { FamilyRuntimeTaskRow } from '../family-runtime-store.ts';
import { throwProviderOnlyRedriveBlocked } from './protocol.ts';

type StageAttemptPayload = ReturnType<typeof listStageAttemptsForTask>[number];
type ProviderRedriveCurrentnessIdentity = NonNullable<ReturnType<typeof redriveCurrentnessIdentity>>;

const LIVE_PROVIDER_ATTEMPT_STATUSES = new Set(['queued', 'running', 'checkpointed', 'human_gate']);
const ACCEPTED_CLOSEOUT_RECEIPT_STATUS = 'accepted_typed_closeout';

function redriveCurrentnessIdentity(payload: Record<string, unknown>) {
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
  return hasSelectedStagePacket && hasCurrentnessBasis ? identity : null;
}

function attemptCurrentnessIdentity(attempt: StageAttemptPayload) {
  return redriveCurrentnessIdentity(attempt.workspace_locator);
}

function sameRedriveCurrentnessIdentity(
  attempt: StageAttemptPayload,
  identity: ProviderRedriveCurrentnessIdentity,
) {
  const attemptIdentity = attemptCurrentnessIdentity(attempt);
  return Boolean(attemptIdentity && sameProviderAdmissionCurrentnessIdentity(attemptIdentity, identity));
}

function linkedProviderAttemptsForRedrive(
  db: DatabaseSync,
  row: FamilyRuntimeTaskRow,
  identity: ProviderRedriveCurrentnessIdentity,
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

function redriveBlockingDomainCloseoutAttempt(
  attempts: StageAttemptPayload[],
  input: {
    allowRefsOnlyCheckpointAttemptId?: string | null;
  } = {},
) {
  return attempts.find((attempt) => (
    !(
      attempt.stage_attempt_id === input.allowRefsOnlyCheckpointAttemptId
      && attempt.closeout_receipt_status === 'domain_handler_receipt_ref_only'
    )
    && (
      attempt.closeout_receipt_status === ACCEPTED_CLOSEOUT_RECEIPT_STATUS
      || stringList(attempt.closeout_refs).length > 0
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
  const closeoutAttempt = redriveBlockingDomainCloseoutAttempt(attempts, {
    allowRefsOnlyCheckpointAttemptId: input.allowRefsOnlyCheckpointAttemptId,
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
  const liveAttempt = liveLinkedProviderAttemptForRedrive(attempts);
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
