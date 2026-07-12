import type { DatabaseSync } from 'node:sqlite';

import type { FamilyRuntimeTaskRow } from './family-runtime-store.ts';
import { insertEvent, nowIso, stableId } from './family-runtime-store.ts';
import {
  FAMILY_RUNTIME_STAGE_ATTEMPT_STATUS,
  FAMILY_RUNTIME_TASK_COLUMNS,
  FAMILY_RUNTIME_TASK_STATUS,
  taskLeaseProjectionSelectSql,
  type TaskLeaseProjectionRow,
} from './family-runtime-queue-projection-boundary.ts';
import {
  domainRouteActionRef,
  isDomainRouteTask,
} from './family-runtime-domain-route.ts';
import {
  isStageNativeOwnerActionFromDomainProfile,
  payloadReferencesStageNativeOwnerAnswerFromDomainProfile,
} from './family-runtime-stage-native-owner-answer.ts';
import { DOMAIN_AUTONOMY_TASK_KINDS } from './family-runtime-domain-autonomy.ts';
import { resolveFamilyRuntimeProviderKind } from './family-runtime-providers.ts';
import {
  createStageAttempt,
  listStageAttempts,
  listStageAttemptsForTask,
} from './family-runtime-stage-attempts.ts';
import {
  buildStageRunCurrentnessIdentity,
  sameStageRunRouteCurrentnessIdentity,
} from './family-runtime-stage-run-currentness-identity.ts';
import { providerAdmissionCurrentnessIdentity } from './family-runtime-provider-admission-currentness.ts';
import {
  buildStageAdmissionLaunchGate,
  capabilityRegistryLaunchGateInputFromPayload,
} from './family-runtime-stage-admission-gate.ts';
import {
  combineStageAdmissionGateWithCheckoutCurrentness,
  providerHostedCheckoutCurrentnessPreflight,
} from './family-runtime-provider-hosted-attempts-parts/admission-currentness.ts';
export {
  DEFAULT_EXECUTOR_DISPATCH_TASK_KIND,
  DEFAULT_EXECUTOR_TRANSPORT_ONLY_ADMISSION_SUPERSEDED_REASON,
  isAdmittedDefaultExecutorNextOwner,
  isTransportOnlyDefaultExecutorAdmissionCheckpoint,
} from './family-runtime-provider-hosted-attempts-parts/default-executor-admission.ts';
import {
  DEFAULT_EXECUTOR_DISPATCH_TASK_KIND,
  DEFAULT_EXECUTOR_TRANSPORT_ONLY_ADMISSION_SUPERSEDED_REASON,
  isAdmittedDefaultExecutorNextOwner,
} from './family-runtime-provider-hosted-attempts-parts/default-executor-admission.ts';
export {
  defaultExecutorDispatchRef,
  defaultExecutorSourceFingerprint,
} from './family-runtime-provider-hosted-attempts-parts/source-identity.ts';
import {
  defaultExecutorDispatchIdentityRef,
  defaultExecutorDispatchRef,
  defaultExecutorSourceFingerprint,
  defaultExecutorStageCheckpointRefs,
  defaultExecutorStagePacketRefs,
  hasDefaultExecutorDispatchIdentity,
} from './family-runtime-provider-hosted-attempts-parts/source-identity.ts';
import {
  exportOwnerFingerprint,
  isRecord,
  defaultExecutorCurrentnessBasis,
  optionalString,
  recordList,
  recordStringRefs,
  sameOptionalStringField,
  sameStringField,
  stringList,
  uniqueStrings,
} from './family-runtime-provider-hosted-attempts-parts/values.ts';

function isSameDefaultExecutorDispatch(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
) {
  const sameDispatchRef = sameStringField(left, right, 'dispatch_ref');
  const sameDomainSourceFingerprint = sameStringField(left, right, 'domain_source_fingerprint');
  return sameStringField(left, right, 'workspace_root')
    && sameStringField(left, right, 'work_unit_id')
    && sameStringField(left, right, 'action_type')
    && (sameDispatchRef || sameDomainSourceFingerprint);
}

function isSameDefaultExecutorWorkUnitStage(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
) {
  return sameStringField(left, right, 'workspace_root')
    && sameStringField(left, right, 'work_unit_id');
}

function isSameDefaultExecutorWorkUnitActionStage(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
) {
  return isSameDefaultExecutorWorkUnitStage(left, right)
    && sameStringField(left, right, 'action_type');
}

const DEFAULT_EXECUTOR_LIVE_ATTEMPT_STATUSES = new Set<string>([
  FAMILY_RUNTIME_STAGE_ATTEMPT_STATUS.queued,
  FAMILY_RUNTIME_STAGE_ATTEMPT_STATUS.running,
  FAMILY_RUNTIME_STAGE_ATTEMPT_STATUS.checkpointed,
  FAMILY_RUNTIME_STAGE_ATTEMPT_STATUS.humanGate,
]);
const DEFAULT_EXECUTOR_CROSS_TASK_STARTED_ATTEMPT_STATUSES = new Set<string>([
  FAMILY_RUNTIME_STAGE_ATTEMPT_STATUS.running,
  FAMILY_RUNTIME_STAGE_ATTEMPT_STATUS.checkpointed,
  FAMILY_RUNTIME_STAGE_ATTEMPT_STATUS.humanGate,
]);
const DEFAULT_EXECUTOR_CROSS_TASK_LIVE_TASK_STATUSES = new Set<string>([
  FAMILY_RUNTIME_TASK_STATUS.queued,
  FAMILY_RUNTIME_TASK_STATUS.running,
  FAMILY_RUNTIME_TASK_STATUS.retryWaiting,
  FAMILY_RUNTIME_TASK_STATUS.succeeded,
]);
const DEFAULT_EXECUTOR_TERMINAL_PROVIDER_STATUSES = new Set(['completed', 'failed', 'blocked', 'timed_out']);
const DEFAULT_EXECUTOR_SUPERSEDED_REASON = 'default_executor_superseded_by_current_source';
const DEFAULT_EXECUTOR_TASK_LEASE_MS = 5 * 60 * 1000;

function hasActiveDefaultExecutorTaskLease(db: DatabaseSync, taskId: string | null) {
  if (!taskId) {
    return false;
  }
  const row = db.prepare(`
    SELECT ${taskLeaseProjectionSelectSql()}
    FROM tasks
    WHERE task_id = ?
  `).get(taskId) as TaskLeaseProjectionRow | undefined;
  const leaseExpiresAtText = row?.[FAMILY_RUNTIME_TASK_COLUMNS.leaseExpiresAt] ?? null;
  if (
    row?.status !== FAMILY_RUNTIME_TASK_STATUS.running
    || !row[FAMILY_RUNTIME_TASK_COLUMNS.leaseOwner]
    || !leaseExpiresAtText
  ) {
    return false;
  }
  const leaseExpiresAt = Date.parse(leaseExpiresAtText);
  return Number.isFinite(leaseExpiresAt) && leaseExpiresAt > Date.now();
}

function isCrossTaskLiveDefaultExecutorAttempt(
  db: DatabaseSync,
  attempt: ReturnType<typeof listStageAttempts>[number],
  workspaceLocator: Record<string, unknown>,
) {
  if (DEFAULT_EXECUTOR_TERMINAL_PROVIDER_STATUSES.has(optionalString(attempt.provider_run.provider_status) ?? '')) {
    return false;
  }
  if (!hasLiveDefaultExecutorLinkedTask(db, attempt.task_id)) {
    return false;
  }
  if (DEFAULT_EXECUTOR_CROSS_TASK_STARTED_ATTEMPT_STATUSES.has(attempt.status)) {
    return true;
  }
  return attempt.status === 'queued'
    && hasActiveDefaultExecutorTaskLease(db, attempt.task_id)
    && (
      sameOptionalStringField(attempt.workspace_locator, workspaceLocator, 'domain_source_fingerprint')
      || (
        isSameDefaultExecutorWorkUnitStage(attempt.workspace_locator, workspaceLocator)
        && !isSameDefaultExecutorWorkUnitActionStage(attempt.workspace_locator, workspaceLocator)
      )
    );
}

function liveDefaultExecutorAttemptBlocksCandidate(
  attempt: ReturnType<typeof listStageAttempts>[number],
  candidateRow: FamilyRuntimeTaskRow,
  candidatePayload: Record<string, unknown>,
) {
  if (attempt.blocked_reason === DEFAULT_EXECUTOR_SUPERSEDED_REASON) {
    return false;
  }
  if (
    optionalString(candidatePayload.action_type) === 'run_quality_repair_batch'
    && isStageNativeOwnerActionFromDomainProfile({
      row: {
        domain_id: attempt.domain_id,
        task_kind: attempt.stage_id,
      },
      payload: attempt.workspace_locator,
    })
    && payloadReferencesStageNativeOwnerAnswerFromDomainProfile({
      domainId: attempt.domain_id,
      payload: attempt.workspace_locator,
    })
  ) {
    return false;
  }
  const candidateLocator = workspaceLocatorForProviderHostedTask(candidateRow, candidatePayload);
  if (
    isSameDefaultExecutorDispatch(attempt.workspace_locator, candidateLocator)
    || isSameDefaultExecutorWorkUnitActionStage(attempt.workspace_locator, candidateLocator)
  ) {
    return sameDefaultExecutorStageRunIdentity(attempt, candidateRow, candidatePayload);
  }
  return isSameDefaultExecutorWorkUnitStage(attempt.workspace_locator, candidateLocator);
}

function blockingLiveDefaultExecutorAttemptBlocksCandidate(
  attempt: ReturnType<typeof listStageAttempts>[number],
  candidateRow: FamilyRuntimeTaskRow,
  candidatePayload: Record<string, unknown>,
) {
  if (attempt.blocked_reason === DEFAULT_EXECUTOR_SUPERSEDED_REASON) {
    return false;
  }
  if (
    optionalString(candidatePayload.action_type) === 'run_quality_repair_batch'
    && isStageNativeOwnerActionFromDomainProfile({
      row: {
        domain_id: attempt.domain_id,
        task_kind: attempt.stage_id,
      },
      payload: attempt.workspace_locator,
    })
    && payloadReferencesStageNativeOwnerAnswerFromDomainProfile({
      domainId: attempt.domain_id,
      payload: attempt.workspace_locator,
    })
  ) {
    return false;
  }
  const candidateLocator = workspaceLocatorForProviderHostedTask(candidateRow, candidatePayload);
  if (
    isSameDefaultExecutorDispatch(attempt.workspace_locator, candidateLocator)
    || isSameDefaultExecutorWorkUnitActionStage(attempt.workspace_locator, candidateLocator)
  ) {
    return sameExplicitDefaultExecutorStageRunIdentityOrUnspecified(attempt, candidateRow, candidatePayload);
  }
  return isSameDefaultExecutorWorkUnitStage(attempt.workspace_locator, candidateLocator);
}

function sameDefaultExecutorStageRunIdentity(
  attempt: ReturnType<typeof listStageAttempts>[number],
  candidateRow: FamilyRuntimeTaskRow,
  candidatePayload: Record<string, unknown>,
) {
  const candidateIdentity = buildStageRunCurrentnessIdentity({
    task: {
      domain_id: candidateRow.domain_id,
      task_id: candidateRow.task_id,
      payload: candidatePayload,
    },
    taskPayload: {
      ...candidatePayload,
      workspace_locator: workspaceLocatorForProviderHostedTask(candidateRow, candidatePayload),
    },
    stageAttempt: {},
  });
  const attemptIdentity = buildStageRunCurrentnessIdentity({
    task: {
      domain_id: attempt.domain_id,
      task_id: attempt.task_id ?? undefined,
      payload: attempt.workspace_locator,
    },
    taskPayload: attempt.workspace_locator,
    stageAttempt: attempt,
  });
  return sameStageRunRouteCurrentnessIdentity(candidateIdentity, attemptIdentity);
}

function hasExplicitDefaultExecutorStageRunIdentity(payload: Record<string, unknown>) {
  const basis = defaultExecutorCurrentnessBasis(payload);
  return Boolean(
    optionalString(basis?.work_unit_fingerprint)
    || optionalString(basis?.source_eval_id)
    || optionalString(basis?.truth_epoch)
    || optionalString(basis?.runtime_health_epoch)
    || optionalString(payload.work_unit_fingerprint)
    || optionalString(payload.source_eval_id)
    || optionalString(payload.truth_epoch)
    || optionalString(payload.runtime_health_epoch)
    || optionalString(payload.idempotency_key),
  );
}

function sameExplicitDefaultExecutorStageRunIdentityOrUnspecified(
  attempt: ReturnType<typeof listStageAttempts>[number],
  candidateRow: FamilyRuntimeTaskRow,
  candidatePayload: Record<string, unknown>,
) {
  if (!hasExplicitDefaultExecutorStageRunIdentity(candidatePayload)) {
    return true;
  }
  return sameDefaultExecutorStageRunIdentity(attempt, candidateRow, candidatePayload);
}

function hasLiveDefaultExecutorLinkedTask(db: DatabaseSync, taskId: string | null) {
  if (!taskId) {
    return false;
  }
  const row = db.prepare(`
    SELECT status
    FROM tasks
    WHERE task_id = ?
  `).get(taskId) as Pick<FamilyRuntimeTaskRow, 'status'> | undefined;
  return Boolean(row && DEFAULT_EXECUTOR_CROSS_TASK_LIVE_TASK_STATUSES.has(row.status));
}

function transitionBridgeEvidence(transition: Record<string, unknown>) {
  const receipt = isRecord(transition.receipt) ? transition.receipt : null;
  const projection = isRecord(transition.projection) ? transition.projection : null;
  const typedBlockers = [
    ...recordList(transition.typed_blockers),
    ...(isRecord(transition.typed_blocker) ? [transition.typed_blocker] : []),
    ...recordList(projection?.typed_blockers),
    ...(isRecord(projection?.typed_blocker) ? [projection.typed_blocker] : []),
  ];
  const receiptRefs = uniqueStrings([
    ...recordStringRefs(receipt, [], ['receipt_refs']),
    ...recordStringRefs(projection, ['receipt_ref'], ['receipt_refs']),
  ]);
  const ownerReceiptRefs = uniqueStrings([
    ...receiptRefs,
    ...recordStringRefs(receipt, ['owner_receipt_ref'], ['owner_receipt_refs']),
    ...recordStringRefs(projection, ['owner_receipt_ref'], ['owner_receipt_refs']),
  ]);
  const noRegressionEvidenceRefs = uniqueStrings([
    ...recordStringRefs(transition, ['no_regression_evidence_ref'], ['no_regression_evidence_refs']),
    ...recordStringRefs(receipt, ['no_regression_evidence_ref'], ['no_regression_evidence_refs']),
    ...recordStringRefs(projection, ['no_regression_evidence_ref'], ['no_regression_evidence_refs']),
  ]);
  const typedBlockerRefs = uniqueStrings([
    ...typedBlockers.flatMap((blocker) => stringList(blocker.refs)),
    ...recordStringRefs(projection, ['typed_blocker_ref'], ['typed_blocker_refs']),
  ]);
  return {
    receipt_refs: receiptRefs,
    owner_receipt_refs: ownerReceiptRefs,
    no_regression_evidence_refs: noRegressionEvidenceRefs,
    typed_blocker_refs: typedBlockerRefs,
    typed_blockers: typedBlockers,
    domain_owner_receipt_observed: ownerReceiptRefs.length > 0,
    no_regression_evidence_observed: noRegressionEvidenceRefs.length > 0,
    typed_blocker_count: typedBlockers.length,
    opl_evidence_boundary: 'refs_only_no_domain_verdict_authority',
  };
}

function providerHostedTaskDeclared(payload: Record<string, unknown>) {
  return payload.opl_provider_hosted_stage_attempt === true
    || payload.provider_hosted_stage_attempt === true
    || Boolean(optionalString(payload.provider_attempt_id))
    || isRecord(payload.family_transition)
    || isRecord(payload.controlled_stage_attempt)
    || isRecord(payload.controlled_stage_attempt_projection)
    || isRecord(payload.controlled_soak_no_regression_attempt);
}

function stageAdmissionRequired(payload: Record<string, unknown>) {
  return payload.opl_stage_launch_admission_required === true
    || payload.require_stage_admission === true;
}

export function defaultExecutorProviderAttemptOrLeaseRequired(payload: Record<string, unknown>) {
  return payload.provider_attempt_or_lease_required === true;
}

function familyTransitionResult(payload: Record<string, unknown>) {
  const transition = isRecord(payload.family_transition) ? payload.family_transition : null;
  if (!transition) {
    return null;
  }
  return optionalString(transition.transition_id) ? transition : null;
}

export function isDefaultExecutorDispatchTask(
  row: Pick<FamilyRuntimeTaskRow, 'domain_id' | 'task_kind'>,
  payload: Record<string, unknown>,
) {
  const nextOwner = optionalString(payload.next_executable_owner);
  return row.task_kind === DEFAULT_EXECUTOR_DISPATCH_TASK_KIND
    && hasDefaultExecutorDispatchIdentity(payload)
    && isAdmittedDefaultExecutorNextOwner(nextOwner)
    && ['codex_cli_default', 'codex_cli'].includes(optionalString(payload.executor_kind) ?? '');
}

export function defaultExecutorDispatchIdentity(
  row: FamilyRuntimeTaskRow,
  payload: Record<string, unknown>,
) {
  if (!isDefaultExecutorDispatchTask(row, payload)) {
    return null;
  }
  const locator = workspaceLocatorForProviderHostedTask(row, payload);
  return stableId('default_executor_dispatch_identity', [
    row.domain_id,
    row.task_kind,
    optionalString(locator.workspace_root),
    optionalString(locator.work_unit_id),
    optionalString(locator.action_type),
    defaultExecutorDispatchIdentityRef(payload),
  ]);
}

export function defaultExecutorWorkUnitActionIdentity(
  row: FamilyRuntimeTaskRow,
  payload: Record<string, unknown>,
) {
  if (!isDefaultExecutorDispatchTask(row, payload)) {
    return null;
  }
  const locator = workspaceLocatorForProviderHostedTask(row, payload);
  return stableId('default_executor_work_unit_action_identity', [
    row.domain_id,
    row.task_kind,
    optionalString(locator.workspace_root),
    optionalString(locator.work_unit_id),
    optionalString(locator.action_type),
  ]);
}

export function defaultExecutorWorkUnitIdentity(
  row: FamilyRuntimeTaskRow,
  payload: Record<string, unknown>,
) {
  if (!isDefaultExecutorDispatchTask(row, payload)) {
    return null;
  }
  const locator = workspaceLocatorForProviderHostedTask(row, payload);
  return stableId('default_executor_work_unit_identity', [
    row.domain_id,
    row.task_kind,
    optionalString(locator.workspace_root),
    optionalString(locator.work_unit_id),
  ]);
}

export function defaultExecutorDomainSourceFingerprint(payload: Record<string, unknown>) {
  return defaultExecutorSourceFingerprint(payload);
}

export function findLiveDefaultExecutorDispatchAttempt(
  db: DatabaseSync,
  row: FamilyRuntimeTaskRow,
  payload: Record<string, unknown>,
) {
  if (!isDefaultExecutorDispatchTask(row, payload)) {
    return null;
  }
  const providerKind = resolveFamilyRuntimeProviderKind();
  const stageId = stageIdForProviderHostedTask(row, payload);
  if (!stageId) {
    return null;
  }
  const workspaceLocator = workspaceLocatorForProviderHostedTask(row, payload);
  return listStageAttempts(db).find((attempt) => (
    attempt.task_id !== row.task_id
    && attempt.provider_kind === providerKind
    && attempt.executor_kind === 'codex_cli'
    && attempt.domain_id === row.domain_id
    && attempt.stage_id === stageId
    && isCrossTaskLiveDefaultExecutorAttempt(db, attempt, workspaceLocator)
    && sameDefaultExecutorStageRunIdentity(attempt, row, payload)
    && isSameDefaultExecutorDispatch(attempt.workspace_locator, workspaceLocator)
  )) ?? null;
}

export function findBlockingLiveDefaultExecutorDispatchAttempt(
  db: DatabaseSync,
  row: FamilyRuntimeTaskRow,
  payload: Record<string, unknown>,
) {
  if (!isDefaultExecutorDispatchTask(row, payload)) {
    return null;
  }
  const providerKind = resolveFamilyRuntimeProviderKind();
  const stageId = stageIdForProviderHostedTask(row, payload);
  if (!stageId) {
    return null;
  }
  const workspaceLocator = workspaceLocatorForProviderHostedTask(row, payload);
  return listStageAttempts(db).find((attempt) => (
    attempt.task_id !== row.task_id
    && attempt.provider_kind === providerKind
    && attempt.executor_kind === 'codex_cli'
    && attempt.domain_id === row.domain_id
    && attempt.stage_id === stageId
    && isCrossTaskLiveDefaultExecutorAttempt(db, attempt, workspaceLocator)
    && isSameDefaultExecutorDispatch(attempt.workspace_locator, workspaceLocator)
    && sameExplicitDefaultExecutorStageRunIdentityOrUnspecified(attempt, row, payload)
  )) ?? null;
}

export function findLiveDefaultExecutorStudyAttempt(
  db: DatabaseSync,
  row: FamilyRuntimeTaskRow,
  payload: Record<string, unknown>,
) {
  if (!isDefaultExecutorDispatchTask(row, payload)) {
    return null;
  }
  const providerKind = resolveFamilyRuntimeProviderKind();
  const stageId = stageIdForProviderHostedTask(row, payload);
  if (!stageId) {
    return null;
  }
  const workspaceLocator = workspaceLocatorForProviderHostedTask(row, payload);
  return listStageAttempts(db).find((attempt) => (
    attempt.task_id !== row.task_id
    && attempt.provider_kind === providerKind
    && attempt.executor_kind === 'codex_cli'
    && attempt.domain_id === row.domain_id
    && attempt.stage_id === stageId
    && isCrossTaskLiveDefaultExecutorAttempt(db, attempt, workspaceLocator)
    && isSameDefaultExecutorWorkUnitStage(attempt.workspace_locator, workspaceLocator)
    && liveDefaultExecutorAttemptBlocksCandidate(attempt, row, payload)
  )) ?? null;
}

export function findBlockingLiveDefaultExecutorWorkUnitAttempt(
  db: DatabaseSync,
  row: FamilyRuntimeTaskRow,
  payload: Record<string, unknown>,
) {
  if (!isDefaultExecutorDispatchTask(row, payload)) {
    return null;
  }
  const providerKind = resolveFamilyRuntimeProviderKind();
  const stageId = stageIdForProviderHostedTask(row, payload);
  if (!stageId) {
    return null;
  }
  const workspaceLocator = workspaceLocatorForProviderHostedTask(row, payload);
  return listStageAttempts(db).find((attempt) => (
    attempt.task_id !== row.task_id
    && attempt.provider_kind === providerKind
    && attempt.executor_kind === 'codex_cli'
    && attempt.domain_id === row.domain_id
    && attempt.stage_id === stageId
    && isCrossTaskLiveDefaultExecutorAttempt(db, attempt, workspaceLocator)
    && isSameDefaultExecutorWorkUnitStage(attempt.workspace_locator, workspaceLocator)
    && blockingLiveDefaultExecutorAttemptBlocksCandidate(attempt, row, payload)
  )) ?? null;
}

export function refreshDefaultExecutorLiveAttemptTaskLease(
  db: DatabaseSync,
  input: {
    attempt: ReturnType<typeof listStageAttempts>[number] | null;
    source?: string;
    reason: string;
  },
) {
  const taskId = input.attempt?.task_id;
  if (!taskId) {
    return null;
  }
  const row = db.prepare(`
    SELECT *
    FROM tasks
    WHERE task_id = ?
  `).get(taskId) as FamilyRuntimeTaskRow | undefined;
  const refreshableTaskStatuses = new Set<string>([
    FAMILY_RUNTIME_TASK_STATUS.queued,
    FAMILY_RUNTIME_TASK_STATUS.retryWaiting,
    FAMILY_RUNTIME_TASK_STATUS.running,
  ]);
  if (!row || !refreshableTaskStatuses.has(row.status)) {
    return null;
  }
  const leaseOwner = row[FAMILY_RUNTIME_TASK_COLUMNS.leaseOwner] || `opl-family-runtime:${process.pid}`;
  const leaseExpiresAt = new Date(Date.now() + DEFAULT_EXECUTOR_TASK_LEASE_MS).toISOString();
  const refreshedAt = nowIso();
  const attemptCount = Math.max(row.attempts, input.attempt?.attempt_count ?? 0, 1);
  db.prepare(`
    UPDATE tasks
    SET status = 'running', attempts = max(attempts, ?), ${FAMILY_RUNTIME_TASK_COLUMNS.leaseOwner} = ?,
      ${FAMILY_RUNTIME_TASK_COLUMNS.leaseExpiresAt} = ?, last_error = NULL, ${FAMILY_RUNTIME_TASK_COLUMNS.deadLetterReason} = NULL, updated_at = ?
    WHERE task_id = ? AND status IN ('queued', 'retry_waiting', 'running')
  `).run(attemptCount, leaseOwner, leaseExpiresAt, refreshedAt, taskId);
  insertEvent(db, {
    taskId,
    domainId: row.domain_id,
    eventType: 'task_default_executor_live_attempt_lease_refreshed',
    source: input.source ?? 'opl-family-runtime',
    payload: {
      reason: input.reason,
      stage_attempt_id: input.attempt?.stage_attempt_id ?? null,
      previous_status: row.status,
      next_status: 'running',
      previous_lease_owner: row[FAMILY_RUNTIME_TASK_COLUMNS.leaseOwner],
      previous_lease_expires_at: row[FAMILY_RUNTIME_TASK_COLUMNS.leaseExpiresAt],
      [FAMILY_RUNTIME_TASK_COLUMNS.leaseOwner]: leaseOwner,
      [FAMILY_RUNTIME_TASK_COLUMNS.leaseExpiresAt]: leaseExpiresAt,
      authority_boundary: {
        opl: 'provider_transport_lease_refresh_only',
        domain: 'truth_quality_artifact_gate_owner',
        domain_truth_mutation: false,
        publication_quality_mutation: false,
        artifact_gate_mutation: false,
        current_package_mutation: false,
        provider_stage_attempt_started: false,
        provider_completion_is_domain_ready: false,
      },
    },
  });
  return {
    task_id: taskId,
    [FAMILY_RUNTIME_TASK_COLUMNS.leaseOwner]: leaseOwner,
    [FAMILY_RUNTIME_TASK_COLUMNS.leaseExpiresAt]: leaseExpiresAt,
  };
}

export function stageIdForProviderHostedTask(row: FamilyRuntimeTaskRow, payload: Record<string, unknown>) {
  if (isDomainRouteTask(row.domain_id, row.task_kind, payload)) {
    return row.task_kind;
  }
  if (isDefaultExecutorDispatchTask(row, payload)) {
    return row.task_kind;
  }
  if (DOMAIN_AUTONOMY_TASK_KINDS.has(row.task_kind)) {
    return row.task_kind;
  }
  const transition = familyTransitionResult(payload);
  if (transition) {
    return `family_transition:${optionalString(transition.transition_id)}`;
  }
  if (!providerHostedTaskDeclared(payload)) {
    return null;
  }
  for (const key of ['stage_id', 'stageId', 'stage_attempt_stage_id']) {
    const stageId = optionalString(payload[key]);
    if (stageId) {
      return stageId;
    }
  }
  if (row.domain_id === 'redcube' && row.task_kind === 'emit_no_regression_evidence') {
    return 'controlled_visual_stage_attempt';
  }
  if (row.domain_id === 'medautogrant' && row.task_kind.startsWith('autonomy-controller/')) {
    return 'controlled_stage_attempt_projection';
  }
  return null;
}

function workspaceLocatorForProviderHostedTask(row: FamilyRuntimeTaskRow, payload: Record<string, unknown>) {
  const locator: Record<string, unknown> = {
    surface_kind: 'opl_provider_hosted_task_workspace_locator',
    domain_id: row.domain_id,
    task_kind: row.task_kind,
  };
  const providerAdmissionIdentity = isRecord(payload.provider_admission_identity)
    ? payload.provider_admission_identity
    : null;
  if (isDomainRouteTask(row.domain_id, row.task_kind, payload)) {
    locator.route_ref = row.task_kind;
    locator.action_ref = domainRouteActionRef(row.task_kind, payload);
    locator.domain_truth_owner = optionalString(payload.domain_truth_owner);
    locator.opl_writes_domain_truth = false;
    locator.opl_writes_domain_quality_verdict = false;
    locator.opl_writes_domain_artifact_gate = false;
    locator.opl_writes_domain_current_package = false;
  }
  if (isDefaultExecutorDispatchTask(row, payload)) {
    locator.domain_truth_owner = optionalString(payload.domain_truth_owner) ?? row.domain_id;
    locator.opl_writes_domain_truth = false;
    locator.opl_writes_domain_quality_verdict = false;
    locator.opl_writes_domain_artifact_gate = false;
    locator.opl_writes_domain_current_package = false;
    const dispatchRef = defaultExecutorDispatchRef(payload);
    if (dispatchRef) {
      locator.dispatch_ref = dispatchRef;
    }
    const stagePacketRefs = defaultExecutorStagePacketRefs(payload);
    if (stagePacketRefs.length > 0) {
      locator.stage_packet_ref = stagePacketRefs[0];
      locator.stage_packet_refs = stagePacketRefs;
    }
    const basis = defaultExecutorCurrentnessBasis(payload);
    for (const [targetKey, value] of Object.entries({
      work_unit_id: optionalString(payload.work_unit_id)
        ?? optionalString(basis?.work_unit_id)
        ?? optionalString(payload.action_type),
      work_unit_fingerprint: optionalString(payload.work_unit_fingerprint)
        ?? optionalString(payload.action_fingerprint)
        ?? optionalString(basis?.work_unit_fingerprint)
        ?? optionalString(payload.source_fingerprint),
      source_eval_id: optionalString(payload.source_eval_id)
        ?? optionalString(basis?.source_eval_id)
        ?? optionalString(payload.source_fingerprint),
      truth_epoch: optionalString(payload.truth_epoch)
        ?? optionalString(basis?.truth_epoch)
        ?? optionalString(payload.source_fingerprint),
      runtime_health_epoch: optionalString(payload.runtime_health_epoch)
        ?? optionalString(basis?.runtime_health_epoch)
        ?? optionalString(payload.source_fingerprint),
      idempotency_key: optionalString(payload.idempotency_key),
    })) {
      if (value) {
        locator[targetKey] = value;
      }
    }
    for (const [targetKey, value] of Object.entries({
      route_identity_key: optionalString(payload.route_identity_key)
        ?? optionalString(providerAdmissionIdentity?.route_identity_key),
      attempt_idempotency_key: optionalString(payload.attempt_idempotency_key)
        ?? optionalString(providerAdmissionIdentity?.attempt_idempotency_key)
        ?? optionalString(providerAdmissionIdentity?.idempotency_key),
      recovery_obligation_id: optionalString(payload.recovery_obligation_id)
        ?? optionalString(providerAdmissionIdentity?.recovery_obligation_id),
    })) {
      if (value) {
        locator[targetKey] = value;
      }
    }
  }
  if (DOMAIN_AUTONOMY_TASK_KINDS.has(row.task_kind)) {
    locator.domain_truth_owner = optionalString(payload.domain_truth_owner) ?? row.domain_id;
    locator.opl_writes_domain_truth = false;
    locator.opl_writes_domain_quality_verdict = false;
    locator.opl_writes_domain_artifact_gate = false;
    locator.opl_writes_domain_current_package = false;
  }
  for (const key of [
    'profile',
    'profile_name',
    'domain_truth_owner',
    'profile_ref',
    'quest_id',
    'action_type',
    'dispatch_authority',
    'dispatch_ref',
    'stage_packet_ref',
    'next_executable_owner',
    'workspace_root',
    'dispatch_path',
    'runtime_root',
    'artifact_root',
    'input_path',
    'evidence_id',
    'provider_attempt_id',
    'authority_boundary',
  ]) {
    if (typeof payload[key] === 'string' && payload[key].trim()) {
      locator[key] = payload[key];
    }
  }
  const nestedLocator = isRecord(payload.workspace_locator) ? payload.workspace_locator : null;
  if (nestedLocator) {
    locator.workspace_locator = nestedLocator;
  }
  for (const key of [
    'controlled_stage_attempt',
    'controlled_stage_attempt_projection',
    'controlled_soak_no_regression_attempt',
  ]) {
    if (isRecord(payload[key])) {
      locator[key] = payload[key];
    }
  }
  const transition = familyTransitionResult(payload);
  if (transition) {
    locator.family_transition = transition;
    locator.transition_bridge = {
      surface_kind: 'opl_family_transition_provider_bridge',
      transition_id: optionalString(transition.transition_id),
      transition_status: optionalString(transition.status),
      current_state: optionalString(transition.current_state),
      next_state: optionalString(transition.next_state),
      event: optionalString(transition.event),
      owner_route: isRecord(transition.owner_route) ? transition.owner_route : null,
      receipt: isRecord(transition.receipt) ? transition.receipt : null,
      projection: isRecord(transition.projection) ? transition.projection : null,
      evidence: transitionBridgeEvidence(transition),
      opl_executes_domain_action: false,
      opl_writes_domain_truth: false,
      opl_authorizes_domain_verdict: false,
      domain_owner_receipt_required: true,
    };
  }
  const lifecycleApplyRequests = recordList(payload.lifecycle_apply_requests);
  if (lifecycleApplyRequests.length > 0) {
    locator.lifecycle_apply_requests = lifecycleApplyRequests;
  }
  const restoreRefs = Array.isArray(payload.restore_refs)
    ? payload.restore_refs.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
  if (restoreRefs.length > 0) {
    locator.restore_refs = restoreRefs;
  }
  if (Array.isArray(payload.target_studies)) {
    locator.target_studies = payload.target_studies.filter(
      (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0,
    );
  }
  if (Array.isArray(payload.source_refs)) {
    locator.source_refs = payload.source_refs.filter(isRecord);
  }
  for (const key of [
    'owner_route_currentness_basis',
    'owner_route',
    'provider_admission_identity',
    'progress_first_closeout_admission',
  ]) {
    if (isRecord(payload[key])) {
      locator[key] = payload[key];
    }
  }
  if (isDefaultExecutorDispatchTask(row, payload)) {
    locator.domain_truth_owner = optionalString(payload.domain_truth_owner) ?? row.domain_id;
    locator.opl_writes_domain_truth = false;
    locator.opl_writes_domain_quality_verdict = false;
    locator.opl_writes_domain_artifact_gate = false;
    locator.opl_writes_domain_current_package = false;
    locator.domain_source_fingerprint = defaultExecutorSourceFingerprint(payload);
  }
  return locator;
}

function sourceFingerprintForProviderHostedTask(row: FamilyRuntimeTaskRow, payload: Record<string, unknown>) {
  const transition = familyTransitionResult(payload);
  if (transition) {
    return stableId('transition_source', [
      row.domain_id,
      row.task_kind,
      optionalString(transition.transition_id),
      optionalString(transition.current_state),
      optionalString(transition.next_state),
      isRecord(transition.receipt) ? transition.receipt : null,
    ]);
  }
  if (isDefaultExecutorDispatchTask(row, payload)) {
    const admissionIdentity = providerAdmissionCurrentnessIdentity(payload);
    if (admissionIdentity) {
      return stableId('default_executor_provider_admission_source', [
        row.domain_id,
        row.task_kind,
        defaultExecutorDispatchRef(payload),
        defaultExecutorSourceFingerprint(payload),
        exportOwnerFingerprint(payload),
        row.dedupe_key,
        admissionIdentity,
      ]);
    }
    return stableId('default_executor_source', [
      row.domain_id,
      row.task_kind,
      defaultExecutorDispatchRef(payload),
      defaultExecutorSourceFingerprint(payload),
      exportOwnerFingerprint(payload),
      row.dedupe_key,
    ]);
  }
  for (const value of [
    payload.source_fingerprint,
    payload.idempotency_key,
    payload.provider_attempt_id,
    row.dedupe_key,
  ]) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return stableId('task_source', [row.domain_id, row.task_kind, row.task_id]);
}

export function ensureProviderHostedStageAttempt(
  db: DatabaseSync,
  row: FamilyRuntimeTaskRow,
  payload: Record<string, unknown>,
  options: {
    newAttempt?: boolean;
    eventSource?: string;
  } = {},
) {
  const existingAttempts = listStageAttemptsForTask(db, row.task_id);
  const providerKind = resolveFamilyRuntimeProviderKind();
  const expectedSourceFingerprint = sourceFingerprintForProviderHostedTask(row, payload);
  const stageId = stageIdForProviderHostedTask(row, payload);
  const workspaceLocator = workspaceLocatorForProviderHostedTask(row, payload);
  const forceNewAttemptAfterTransportOnlyAdmission = isDefaultExecutorDispatchTask(row, payload)
    && existingAttempts.some((attempt) => (
      attempt.provider_kind === providerKind
      && attempt.source_fingerprint === expectedSourceFingerprint
      && attempt.blocked_reason === DEFAULT_EXECUTOR_TRANSPORT_ONLY_ADMISSION_SUPERSEDED_REASON
    ));
  if (!options.newAttempt && isDefaultExecutorDispatchTask(row, payload) && existingAttempts.some((attempt) => (
    attempt.provider_kind === providerKind
      && DEFAULT_EXECUTOR_LIVE_ATTEMPT_STATUSES.has(attempt.status)
      && attempt.blocked_reason !== DEFAULT_EXECUTOR_SUPERSEDED_REASON
      && attempt.blocked_reason !== DEFAULT_EXECUTOR_TRANSPORT_ONLY_ADMISSION_SUPERSEDED_REASON
  ))) {
    return null;
  }
  if (!options.newAttempt && isDefaultExecutorDispatchTask(row, payload) && stageId) {
    const liveDispatchAttempt = findBlockingLiveDefaultExecutorDispatchAttempt(db, row, payload);
    const liveStudyAttempt = liveDispatchAttempt ?? findBlockingLiveDefaultExecutorWorkUnitAttempt(db, row, payload);
    if (liveStudyAttempt) {
      insertEvent(db, {
        taskId: row.task_id,
        domainId: row.domain_id,
        eventType: 'stage_attempt_live_dispatch_noop',
        source: options.eventSource ?? 'opl-family-runtime',
        payload: {
          reason: liveDispatchAttempt
            ? 'live_stage_attempt_exists_for_dispatch'
            : 'live_stage_attempt_exists_for_study',
          stage_attempt_id: liveStudyAttempt.stage_attempt_id,
          task_id: liveStudyAttempt.task_id,
          dispatch_ref: workspaceLocator.dispatch_ref ?? null,
          action_type: workspaceLocator.action_type ?? null,
          live_action_type: liveStudyAttempt.workspace_locator.action_type ?? null,
          work_unit_id: workspaceLocator.work_unit_id ?? null,
        },
      });
      return null;
    }
  }
  if (!options.newAttempt && existingAttempts.some((attempt) => (
    attempt.provider_kind === providerKind && attempt.source_fingerprint === expectedSourceFingerprint
    && attempt.blocked_reason !== DEFAULT_EXECUTOR_TRANSPORT_ONLY_ADMISSION_SUPERSEDED_REASON
  ))) {
    return null;
  }
  if (!stageId) {
    return null;
  }
  const admissionGate = buildStageAdmissionLaunchGate({
    domainId: row.domain_id,
    stageId,
    taskKind: row.task_kind,
    taskId: row.task_id,
    sourceFingerprint: expectedSourceFingerprint,
    idempotencyKey: expectedSourceFingerprint,
    requireAdmission: stageAdmissionRequired(payload),
    capabilityRegistryGate: capabilityRegistryLaunchGateInputFromPayload(payload, {
      domainId: row.domain_id,
      stageId,
      taskId: row.task_id,
    }),
  });
  const stageLaunchAdmissionGate = combineStageAdmissionGateWithCheckoutCurrentness(
    admissionGate,
    providerHostedCheckoutCurrentnessPreflight(row, workspaceLocator),
  );
  const result = createStageAttempt(db, {
    domainId: row.domain_id,
    stageId,
    providerKind,
    workspaceLocator,
    sourceFingerprint: expectedSourceFingerprint,
    executorKind: isDefaultExecutorDispatchTask(row, payload) ? 'codex_cli' : 'domain_handler',
    taskId: row.task_id,
    newAttempt: options.newAttempt === true || forceNewAttemptAfterTransportOnlyAdmission,
    checkpointRefs: isDefaultExecutorDispatchTask(row, payload)
      ? defaultExecutorStageCheckpointRefs(payload)
      : undefined,
    blockedReason: stageLaunchAdmissionGate.blocked_reason ?? undefined,
    launchAdmissionGate: stageLaunchAdmissionGate,
  });
  insertEvent(db, {
    taskId: row.task_id,
    domainId: row.domain_id,
    eventType: result.idempotent_noop
      ? 'stage_attempt_idempotent_noop'
      : stageLaunchAdmissionGate.status === 'blocked'
        ? 'stage_attempt_blocked_by_admission_gate'
      : 'stage_attempt_created_for_provider_hosted_task',
    source: options.eventSource ?? 'opl-family-runtime',
    payload: {
      stage_attempt_id: result.attempt.stage_attempt_id,
      stage_id: stageId,
      provider_kind: result.attempt.provider_kind,
      task_kind: row.task_kind,
      new_attempt: options.newAttempt === true || forceNewAttemptAfterTransportOnlyAdmission,
      new_attempt_reason: forceNewAttemptAfterTransportOnlyAdmission
        ? DEFAULT_EXECUTOR_TRANSPORT_ONLY_ADMISSION_SUPERSEDED_REASON
        : null,
      stage_launch_admission_gate: stageLaunchAdmissionGate,
    },
  });
  return result.attempt;
}
