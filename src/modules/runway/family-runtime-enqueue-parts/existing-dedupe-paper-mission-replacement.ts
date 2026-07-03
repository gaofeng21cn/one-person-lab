import { DatabaseSync } from 'node:sqlite';

import { stringValue as optionalString } from '../../../kernel/json-record.ts';
import { paperMissionStageRouteIdentityValue } from '../family-runtime-paper-mission-stage-route-terminal-sync.ts';
import type { FamilyRuntimeTaskRow } from '../family-runtime-store.ts';
import { updateStageAttemptsForTask } from '../family-runtime-stage-attempts.ts';
import { sourceFingerprint } from './existing-dedupe-decisions.ts';

function recordValue(value: unknown) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stableComparableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => stableComparableValue(entry));
  }
  const record = recordValue(value);
  if (!record) {
    return value;
  }
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((key) => [key, stableComparableValue(record[key])]),
  );
}

function stableComparableJson(value: unknown) {
  if (value === undefined || value === null) {
    return null;
  }
  return JSON.stringify(stableComparableValue(value));
}

const PAPER_MISSION_STALE_WORKSPACE_SUPERSEDED_REASON =
  'paper_mission_stage_route_stale_workspace_superseded_by_domain_workspace_handoff';
const PAPER_MISSION_DOMAIN_GATE_FRESH_HANDOFF_REASONS = new Set([
  'paper_mission_stage_route_domain_gate_pending',
  'paper_mission_stage_route_domain_authority_required',
]);
const PAPER_MISSION_PROVIDER_RUNTIME_FRESH_HANDOFF_REASONS = new Set([
  'codex_cli_provider_unavailable',
  'codex_cli_typed_closeout_not_materialized',
  'closeout_not_materialized',
]);
const PAPER_MISSION_LEGACY_IDENTITY_BLOCKER_FRESH_HANDOFF_REASONS = new Set([
  'paper_mission_route_missing_identity_field:route_identity_key',
  'paper_mission_route_missing_identity_field:attempt_idempotency_key',
]);

function isOplRepoWorkspace(value: string | null) {
  return Boolean(value && /(?:^|\/)one-person-lab(?:\/|$)/.test(value));
}

function paperMissionWorkspaceRoot(payload: Record<string, unknown>) {
  return optionalString(payload.domain_workspace_root)
    ?? optionalString(payload.workspace_root)
    ?? optionalString(payload.repo_root);
}

function isPaperMissionStageRoutePayload(payload: Record<string, unknown>) {
  return payload.surface_kind === 'opl_mas_paper_mission_route_runtime_request'
    && (
      payload.runtime_request_kind === 'mas_paper_mission_stage_route'
      || payload.runtime_request_kind === undefined
    );
}

function paperMissionRouteHandoffRecord(payload: Record<string, unknown>) {
  return recordValue(payload.opl_route_handoff_record)
    ?? recordValue(payload.opl_route_handoff)
    ?? recordValue(payload.route_handoff_record);
}

function paperMissionRouteHandoffRef(payload: Record<string, unknown>) {
  const handoff = paperMissionRouteHandoffRecord(payload);
  return optionalString(payload.opl_route_handoff_ref)
    ?? optionalString(payload.route_handoff_ref)
    ?? optionalString(handoff?.handoff_ref)
    ?? optionalString(handoff?.opl_route_handoff_ref)
    ?? optionalString(handoff?.record_ref)
    ?? optionalString(handoff?.ref);
}

function changedStringField(
  changedFields: string[],
  field: string,
  previousValue: string | null,
  nextValue: string | null,
) {
  if (previousValue !== nextValue) {
    changedFields.push(field);
  }
}

function paperMissionStageRouteFreshHandoffDelta(input: {
  existing: FamilyRuntimeTaskRow;
  existingPayload: Record<string, unknown>;
  nextPayload: Record<string, unknown>;
}) {
  const nextWorkspaceRoot = paperMissionWorkspaceRoot(input.nextPayload)
    ?? optionalString(input.nextPayload.command_cwd);
  if (!nextWorkspaceRoot || isOplRepoWorkspace(nextWorkspaceRoot)) {
    return null;
  }

  const existingWorkspaceRoot = paperMissionWorkspaceRoot(input.existingPayload)
    ?? optionalString(input.existingPayload.command_cwd);
  const previousCandidateRef = optionalString(input.existingPayload.candidate_ref);
  const nextCandidateRef = optionalString(input.nextPayload.candidate_ref);
  const previousTransactionRef = optionalString(input.existingPayload.paper_mission_transaction_ref);
  const nextTransactionRef = optionalString(input.nextPayload.paper_mission_transaction_ref);
  const previousRouteCommandRef = optionalString(input.existingPayload.opl_route_command_ref);
  const nextRouteCommandRef = optionalString(input.nextPayload.opl_route_command_ref);
  const previousHandoffRef = paperMissionRouteHandoffRef(input.existingPayload);
  const nextHandoffRef = paperMissionRouteHandoffRef(input.nextPayload);
  const previousSourceRef = optionalString(input.existingPayload.source_ref);
  const nextSourceRef = optionalString(input.nextPayload.source_ref);
  const previousHandoffRecordJson = stableComparableJson(paperMissionRouteHandoffRecord(input.existingPayload));
  const nextHandoffRecordJson = stableComparableJson(paperMissionRouteHandoffRecord(input.nextPayload));
  const previousSourcePayloadJson = stableComparableJson(input.existingPayload.source_payload);
  const nextSourcePayloadJson = stableComparableJson(input.nextPayload.source_payload);
  const previousSourceFingerprint = sourceFingerprint(input.existingPayload);
  const nextSourceFingerprint = sourceFingerprint(input.nextPayload);
  const changedFields: string[] = [];

  changedStringField(changedFields, 'candidate_ref', previousCandidateRef, nextCandidateRef);
  changedStringField(
    changedFields,
    'paper_mission_transaction_ref',
    previousTransactionRef,
    nextTransactionRef,
  );
  changedStringField(changedFields, 'opl_route_command_ref', previousRouteCommandRef, nextRouteCommandRef);
  changedStringField(changedFields, 'opl_route_handoff_ref', previousHandoffRef, nextHandoffRef);
  changedStringField(changedFields, 'source_ref', previousSourceRef, nextSourceRef);
  changedStringField(
    changedFields,
    'source_fingerprint',
    previousSourceFingerprint,
    nextSourceFingerprint,
  );
  if (previousHandoffRecordJson !== nextHandoffRecordJson) {
    changedFields.push('opl_route_handoff_record');
  }
  if (previousSourcePayloadJson !== nextSourcePayloadJson) {
    changedFields.push('source_payload');
  }
  if (changedFields.length === 0) {
    return null;
  }

  return {
    previous_workspace_root: existingWorkspaceRoot,
    next_workspace_root: nextWorkspaceRoot,
    previous_candidate_ref: previousCandidateRef,
    next_candidate_ref: nextCandidateRef,
    previous_paper_mission_transaction_ref: previousTransactionRef,
    next_paper_mission_transaction_ref: nextTransactionRef,
    previous_opl_route_command_ref: previousRouteCommandRef,
    next_opl_route_command_ref: nextRouteCommandRef,
    previous_opl_route_handoff_ref: previousHandoffRef,
    next_opl_route_handoff_ref: nextHandoffRef,
    previous_source_ref: previousSourceRef,
    next_source_ref: nextSourceRef,
    previous_source_fingerprint: previousSourceFingerprint,
    next_source_fingerprint: nextSourceFingerprint,
    changed_fields: changedFields,
    previous_status: input.existing.status,
  };
}

export function isPaperMissionStageRouteReplacementAllowed(input: {
  existing: FamilyRuntimeTaskRow;
  nextDomainId: string;
  nextTaskKind: string;
  nextPayload: Record<string, unknown>;
  retiredResidueBlock: Record<string, unknown> | null;
  exportedTaskChanged: boolean;
}) {
  if (
    !input.exportedTaskChanged
    || !input.retiredResidueBlock
    || input.existing.domain_id !== 'medautoscience'
    || input.nextDomainId !== 'medautoscience'
    || input.existing.task_kind !== 'paper_mission/stage-route'
    || input.nextTaskKind !== 'paper_mission/stage-route'
    || input.nextPayload.surface_kind !== 'opl_mas_paper_mission_route_runtime_request'
    || (
      input.nextPayload.runtime_request_kind !== 'mas_paper_mission_stage_route'
      && input.nextPayload.runtime_request_kind !== undefined
    )
  ) {
    return null;
  }
  const workspaceRoot = optionalString(input.nextPayload.workspace_root)
    ?? optionalString(input.nextPayload.repo_root)
    ?? optionalString(input.nextPayload.command_cwd);
  if (!workspaceRoot) {
    return null;
  }
  return {
    reason: 'paper_mission_stage_route_runtime_contract_replaced_after_operator_retire',
    operator_retirement_reason: input.retiredResidueBlock.operator_retirement_reason,
    workspace_root: workspaceRoot,
    previous_status: input.existing.status,
  };
}

export function paperMissionStageRouteDomainGateFreshHandoffReplacement(input: {
  existing: FamilyRuntimeTaskRow;
  nextDomainId: string;
  nextTaskKind: string;
  existingPayload: Record<string, unknown>;
  nextPayload: Record<string, unknown>;
  exportedTaskChanged: boolean;
}) {
  const previousDomainGateReason = input.existing.dead_letter_reason ?? input.existing.last_error ?? '';
  if (
    !input.exportedTaskChanged
    || input.existing.domain_id !== 'medautoscience'
    || input.nextDomainId !== 'medautoscience'
    || input.existing.task_kind !== 'paper_mission/stage-route'
    || input.nextTaskKind !== 'paper_mission/stage-route'
    || input.existing.status !== 'blocked'
    || !PAPER_MISSION_DOMAIN_GATE_FRESH_HANDOFF_REASONS.has(previousDomainGateReason)
    || !isPaperMissionStageRoutePayload(input.existingPayload)
    || !isPaperMissionStageRoutePayload(input.nextPayload)
  ) {
    return null;
  }

  const delta = paperMissionStageRouteFreshHandoffDelta(input);
  if (!delta) {
    return null;
  }

  return {
    reason: 'paper_mission_stage_route_domain_gate_fresh_handoff',
    previous_domain_gate_reason: previousDomainGateReason,
    ...delta,
  };
}

export function paperMissionStageRouteProviderRuntimeFreshHandoffReplacement(input: {
  existing: FamilyRuntimeTaskRow;
  nextDomainId: string;
  nextTaskKind: string;
  existingPayload: Record<string, unknown>;
  nextPayload: Record<string, unknown>;
  exportedTaskChanged: boolean;
}) {
  const previousProviderRuntimeReason = input.existing.dead_letter_reason ?? input.existing.last_error ?? '';
  if (
    !input.exportedTaskChanged
    || input.existing.domain_id !== 'medautoscience'
    || input.nextDomainId !== 'medautoscience'
    || input.existing.task_kind !== 'paper_mission/stage-route'
    || input.nextTaskKind !== 'paper_mission/stage-route'
    || input.existing.status !== 'blocked'
    || !PAPER_MISSION_PROVIDER_RUNTIME_FRESH_HANDOFF_REASONS.has(previousProviderRuntimeReason)
    || !isPaperMissionStageRoutePayload(input.existingPayload)
    || !isPaperMissionStageRoutePayload(input.nextPayload)
  ) {
    return null;
  }

  const delta = paperMissionStageRouteFreshHandoffDelta(input);
  if (!delta) {
    return null;
  }

  return {
    reason: 'paper_mission_stage_route_provider_runtime_fresh_handoff',
    previous_provider_runtime_reason: previousProviderRuntimeReason,
    ...delta,
  };
}

export function paperMissionStageRouteLegacyIdentityFreshHandoffReplacement(input: {
  existing: FamilyRuntimeTaskRow;
  nextDomainId: string;
  nextTaskKind: string;
  existingPayload: Record<string, unknown>;
  nextPayload: Record<string, unknown>;
  exportedTaskChanged: boolean;
}) {
  const previousIdentityBlockerReason = input.existing.dead_letter_reason ?? input.existing.last_error ?? '';
  if (
    !input.exportedTaskChanged
    || input.existing.domain_id !== 'medautoscience'
    || input.nextDomainId !== 'medautoscience'
    || input.existing.task_kind !== 'paper_mission/stage-route'
    || input.nextTaskKind !== 'paper_mission/stage-route'
    || input.existing.status !== 'blocked'
    || !PAPER_MISSION_LEGACY_IDENTITY_BLOCKER_FRESH_HANDOFF_REASONS.has(previousIdentityBlockerReason)
    || !isPaperMissionStageRoutePayload(input.existingPayload)
    || !isPaperMissionStageRoutePayload(input.nextPayload)
  ) {
    return null;
  }

  const nextWorkspaceRoot = paperMissionWorkspaceRoot(input.nextPayload)
    ?? optionalString(input.nextPayload.command_cwd);
  if (!nextWorkspaceRoot || isOplRepoWorkspace(nextWorkspaceRoot)) {
    return null;
  }

  const nextRouteIdentityKey = paperMissionStageRouteIdentityValue(input.nextPayload, 'route_identity_key');
  const nextAttemptIdempotencyKey = paperMissionStageRouteIdentityValue(
    input.nextPayload,
    'attempt_idempotency_key',
  );
  if (!nextRouteIdentityKey || !nextAttemptIdempotencyKey) {
    return null;
  }

  const existingWorkspaceRoot = paperMissionWorkspaceRoot(input.existingPayload)
    ?? optionalString(input.existingPayload.command_cwd);
  const previousRouteIdentityKey = paperMissionStageRouteIdentityValue(
    input.existingPayload,
    'route_identity_key',
  );
  const previousAttemptIdempotencyKey = paperMissionStageRouteIdentityValue(
    input.existingPayload,
    'attempt_idempotency_key',
  );
  const previousCandidateRef = optionalString(input.existingPayload.candidate_ref);
  const nextCandidateRef = optionalString(input.nextPayload.candidate_ref);
  const previousTransactionRef = optionalString(input.existingPayload.paper_mission_transaction_ref);
  const nextTransactionRef = optionalString(input.nextPayload.paper_mission_transaction_ref);
  const previousRouteCommandRef = optionalString(input.existingPayload.opl_route_command_ref);
  const nextRouteCommandRef = optionalString(input.nextPayload.opl_route_command_ref);
  const previousHandoffRef = paperMissionRouteHandoffRef(input.existingPayload);
  const nextHandoffRef = paperMissionRouteHandoffRef(input.nextPayload);
  const previousSourceRef = optionalString(input.existingPayload.source_ref);
  const nextSourceRef = optionalString(input.nextPayload.source_ref);
  const previousHandoffRecordJson = stableComparableJson(paperMissionRouteHandoffRecord(input.existingPayload));
  const nextHandoffRecordJson = stableComparableJson(paperMissionRouteHandoffRecord(input.nextPayload));
  const previousSourcePayloadJson = stableComparableJson(input.existingPayload.source_payload);
  const nextSourcePayloadJson = stableComparableJson(input.nextPayload.source_payload);
  const previousSourceFingerprint = sourceFingerprint(input.existingPayload);
  const nextSourceFingerprint = sourceFingerprint(input.nextPayload);
  const changedFields: string[] = [];

  changedStringField(changedFields, 'candidate_ref', previousCandidateRef, nextCandidateRef);
  changedStringField(
    changedFields,
    'paper_mission_transaction_ref',
    previousTransactionRef,
    nextTransactionRef,
  );
  changedStringField(changedFields, 'opl_route_command_ref', previousRouteCommandRef, nextRouteCommandRef);
  changedStringField(changedFields, 'opl_route_handoff_ref', previousHandoffRef, nextHandoffRef);
  changedStringField(changedFields, 'source_ref', previousSourceRef, nextSourceRef);
  changedStringField(
    changedFields,
    'route_identity_key',
    previousRouteIdentityKey,
    nextRouteIdentityKey,
  );
  changedStringField(
    changedFields,
    'attempt_idempotency_key',
    previousAttemptIdempotencyKey,
    nextAttemptIdempotencyKey,
  );
  changedStringField(
    changedFields,
    'source_fingerprint',
    previousSourceFingerprint,
    nextSourceFingerprint,
  );
  if (previousHandoffRecordJson !== nextHandoffRecordJson) {
    changedFields.push('opl_route_handoff_record');
  }
  if (previousSourcePayloadJson !== nextSourcePayloadJson) {
    changedFields.push('source_payload');
  }
  if (changedFields.length === 0) {
    return null;
  }

  return {
    reason: 'paper_mission_stage_route_identity_validator_fresh_handoff',
    previous_identity_blocker_reason: previousIdentityBlockerReason,
    previous_workspace_root: existingWorkspaceRoot,
    next_workspace_root: nextWorkspaceRoot,
    previous_candidate_ref: previousCandidateRef,
    next_candidate_ref: nextCandidateRef,
    previous_paper_mission_transaction_ref: previousTransactionRef,
    next_paper_mission_transaction_ref: nextTransactionRef,
    previous_opl_route_command_ref: previousRouteCommandRef,
    next_opl_route_command_ref: nextRouteCommandRef,
    previous_opl_route_handoff_ref: previousHandoffRef,
    next_opl_route_handoff_ref: nextHandoffRef,
    previous_source_ref: previousSourceRef,
    next_source_ref: nextSourceRef,
    previous_route_identity_key: previousRouteIdentityKey,
    next_route_identity_key: nextRouteIdentityKey,
    previous_attempt_idempotency_key: previousAttemptIdempotencyKey,
    next_attempt_idempotency_key: nextAttemptIdempotencyKey,
    previous_source_fingerprint: previousSourceFingerprint,
    next_source_fingerprint: nextSourceFingerprint,
    changed_fields: changedFields,
    previous_status: input.existing.status,
  };
}

export function stalePaperMissionStageRouteWorkspaceReplacement(input: {
  existing: FamilyRuntimeTaskRow;
  nextDomainId: string;
  nextTaskKind: string;
  existingPayload: Record<string, unknown>;
  nextPayload: Record<string, unknown>;
  exportedTaskChanged: boolean;
  stageAttempts: Array<Record<string, unknown>>;
}) {
  if (
    !input.exportedTaskChanged
    || input.existing.domain_id !== 'medautoscience'
    || input.nextDomainId !== 'medautoscience'
    || input.existing.task_kind !== 'paper_mission/stage-route'
    || input.nextTaskKind !== 'paper_mission/stage-route'
    || !isPaperMissionStageRoutePayload(input.existingPayload)
    || !isPaperMissionStageRoutePayload(input.nextPayload)
  ) {
    return null;
  }

  const nextWorkspaceRoot = paperMissionWorkspaceRoot(input.nextPayload);
  if (!nextWorkspaceRoot || isOplRepoWorkspace(nextWorkspaceRoot)) {
    return null;
  }

  const existingWorkspaceRoot = paperMissionWorkspaceRoot(input.existingPayload)
    ?? optionalString(input.existingPayload.command_cwd);
  const staleStageAttemptIds = input.stageAttempts
    .filter((attempt) => {
      const status = optionalString(attempt.status);
      if (
        status !== 'queued'
        && status !== 'running'
        && status !== 'checkpointed'
        && status !== 'human_gate'
      ) {
        return false;
      }
      const locator = typeof attempt.workspace_locator === 'object' && attempt.workspace_locator !== null
        ? attempt.workspace_locator as Record<string, unknown>
        : {};
      const attemptWorkspaceRoot = paperMissionWorkspaceRoot(locator)
        ?? optionalString(locator.command_cwd);
      return !attemptWorkspaceRoot || isOplRepoWorkspace(attemptWorkspaceRoot);
    })
    .map((attempt) => optionalString(attempt.stage_attempt_id))
    .filter((attemptId): attemptId is string => Boolean(attemptId));
  const existingWorkspaceStale = !existingWorkspaceRoot || isOplRepoWorkspace(existingWorkspaceRoot);
  if (!existingWorkspaceStale && staleStageAttemptIds.length === 0) {
    return null;
  }

  return {
    reason: PAPER_MISSION_STALE_WORKSPACE_SUPERSEDED_REASON,
    previous_workspace_root: existingWorkspaceRoot,
    next_workspace_root: nextWorkspaceRoot,
    stale_stage_attempt_ids: staleStageAttemptIds,
    previous_status: input.existing.status,
  };
}

export function markPaperMissionStageRouteAttemptsSuperseded(
  db: DatabaseSync,
  input: {
    taskId: string;
    stageAttemptIds: string[];
    source: string;
    previousWorkspaceRoot: string | null;
    nextWorkspaceRoot: string;
  },
) {
  if (input.stageAttemptIds.length === 0) {
    return [];
  }
  return updateStageAttemptsForTask(db, {
    taskId: input.taskId,
    stageAttemptIds: input.stageAttemptIds,
    status: 'blocked',
    blockedReason: PAPER_MISSION_STALE_WORKSPACE_SUPERSEDED_REASON,
    activityEvent: {
      activity_kind: 'paper_mission_stage_route_workspace_supersession',
      activity_status: 'blocked',
      blocked_reason: PAPER_MISSION_STALE_WORKSPACE_SUPERSEDED_REASON,
      previous_workspace_root: input.previousWorkspaceRoot,
      next_workspace_root: input.nextWorkspaceRoot,
      source: input.source,
      authority_boundary: {
        opl: 'queue_attempt_workspace_locator_supersession_only',
        domain: 'truth_quality_artifact_gate_owner',
        domain_truth_mutation: false,
        publication_quality_mutation: false,
        artifact_gate_mutation: false,
        current_package_mutation: false,
        provider_completion_is_domain_ready: false,
      },
    },
  });
}
