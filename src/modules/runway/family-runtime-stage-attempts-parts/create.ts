import { DatabaseSync } from 'node:sqlite';

import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import {
  buildStageAttemptProviderReceipt,
  resolveFamilyRuntimeProviderKind,
} from '../family-runtime-providers.ts';
import { buildLaunchExecutionAuthorization } from '../family-runtime-temporal.ts';
import type {
  FamilyRuntimeDomainId,
  FamilyRuntimeProviderKind,
} from '../family-runtime-types.ts';
import {
  stageAttemptToPayload,
  type StageAttemptRow,
} from '../family-runtime-stage-attempt-ledger.ts';
import { stableId } from '../../../kernel/stable-id.ts';
import {
  buildDuplicateTaskEnvelope,
  buildFamilyConflictSubject,
} from '../../stagecraft/index.ts';
import {
  normalizeJsonList,
  normalizeStageId,
  nowIso,
} from './shared.ts';
import { recordStageRunExecutionAuthorizationReceipts } from '../../stagecraft/index.ts';
import { taskRetryBudgetProjection } from '../family-runtime-queue-projection-boundary.ts';

export type StageAttemptCreateInput = {
  domainId: FamilyRuntimeDomainId;
  stageId: string;
  actionId?: string;
  providerKind?: FamilyRuntimeProviderKind;
  workspaceLocator: Record<string, unknown>;
  idempotencyWorkspaceLocator?: Record<string, unknown>;
  sourceFingerprint?: string;
  executorKind?: string;
  stageAttemptExecutorPolicy?: Record<string, unknown> | null;
  executorBindingRef?: string;
  invocationMode?: string;
  boundedEditRef?: string;
  taskId?: string;
  retryBudget?: Record<string, unknown>;
  checkpointRefs?: string[];
  closeoutRefs?: string[];
  humanGateRefs?: string[];
  routeImpact?: Record<string, unknown>;
  blockedReason?: string;
  launchAdmissionGate?: object;
  launchInvocation?: object;
  newAttempt?: boolean;
  start?: boolean;
};

function stageAttemptBaseIdempotencyKey(input: StageAttemptCreateInput) {
  return stableId('idem', [
    input.domainId,
    normalizedStageId(input.stageId),
    input.actionId?.trim() || null,
    resolveFamilyRuntimeProviderKind(input.providerKind),
    input.idempotencyWorkspaceLocator ?? input.workspaceLocator,
    input.sourceFingerprint?.trim() || null,
    input.stageAttemptExecutorPolicy ?? null,
    input.taskId?.trim() || null,
  ]);
}

export function findIdempotentStageAttempt(db: DatabaseSync, input: StageAttemptCreateInput) {
  if (input.newAttempt) return null;
  const idempotencyKey = stageAttemptBaseIdempotencyKey(input);
  const existing = db.prepare(`
    SELECT * FROM stage_attempts WHERE idempotency_key = ? ORDER BY created_at ASC LIMIT 1
  `).get(idempotencyKey) as StageAttemptRow | undefined;
  return existing ? stageAttemptToPayload(existing) : null;
}

function normalizedStageId(stageId: string) {
  try {
    return normalizeStageId(stageId);
  } catch {
    throw new FrameworkContractError('cli_usage_error', 'Stage attempt requires a non-empty stage id.', {
      required: ['--stage'],
    });
  }
}

function stageAttemptOrdinalForNewAttempt(
  db: DatabaseSync,
  input: {
    domainId: FamilyRuntimeDomainId;
    stageId: string;
    providerKind: FamilyRuntimeProviderKind;
    taskId: string | null;
  },
) {
  const row = db.prepare(`
    SELECT COUNT(*) AS count
    FROM stage_attempts
    WHERE domain_id = ? AND stage_id = ? AND provider_kind = ?
      AND COALESCE(task_id, '') = COALESCE(?, '')
  `).get(input.domainId, input.stageId, input.providerKind, input.taskId) as { count: number };
  return row.count + 1;
}

export function createStageAttempt(db: DatabaseSync, input: StageAttemptCreateInput) {
  const stageId = normalizedStageId(input.stageId);
  const providerKind = resolveFamilyRuntimeProviderKind(input.providerKind);
  const createdAt = nowIso();
  const sourceFingerprint = input.sourceFingerprint?.trim() || null;
  const executorKind = input.executorKind?.trim() || 'codex_cli';
  const stageAttemptExecutorPolicy = input.stageAttemptExecutorPolicy ?? null;
  const retryBudget = input.retryBudget ?? taskRetryBudgetProjection(3);
  const taskId = input.taskId?.trim() || null;
  const baseIdempotencyKey = stageAttemptBaseIdempotencyKey(input);
  const newAttemptOrdinal = input.newAttempt
    ? stageAttemptOrdinalForNewAttempt(db, {
        domainId: input.domainId,
        stageId,
        providerKind,
        taskId,
      })
    : null;
  const idempotencyKey = input.newAttempt
    ? stableId('idem', [baseIdempotencyKey, 'new_attempt', newAttemptOrdinal])
    : baseIdempotencyKey;
  if (!input.newAttempt) {
    const existing = db.prepare(`
      SELECT * FROM stage_attempts WHERE idempotency_key = ? ORDER BY created_at ASC LIMIT 1
    `).get(idempotencyKey) as StageAttemptRow | undefined;
    if (existing) {
      const attempt = stageAttemptToPayload(existing);
      return {
        created: false,
        idempotent_noop: true,
        attempt,
        conflict_or_blocker_envelopes: [
          buildDuplicateTaskEnvelope({
            subject: buildFamilyConflictSubject({
              domain: attempt.domain_id,
              stageId: attempt.stage_id,
              taskKind: attempt.stage_id,
              sourceFingerprint: attempt.source_fingerprint,
              idempotencyKey: attempt.idempotency_key,
              stageAttemptId: attempt.stage_attempt_id,
              taskId: attempt.task_id,
            }),
            existingAttemptRef: `opl://stage_attempts/${attempt.stage_attempt_id}`,
          }),
        ],
      };
    }
  }
  const stageAttemptId = stableId('sat', [
    input.domainId,
    stageId,
    input.actionId?.trim() || null,
    providerKind,
    input.workspaceLocator,
    sourceFingerprint,
    stageAttemptExecutorPolicy,
    input.taskId ?? null,
    input.newAttempt ? newAttemptOrdinal : createdAt,
  ]);
  const workflowId = stableId('wf', [input.domainId, stageId, stageAttemptId]);
  const launchAuthorization = buildLaunchExecutionAuthorization({
    stageAttemptId,
    workflowId,
    domainId: input.domainId,
    stageId,
    executorKind,
    taskId,
    workspaceLocator: input.workspaceLocator,
    stagePacketRef: normalizeJsonList(input.checkpointRefs)[0] ?? null,
    sourceFingerprint,
    idempotencyKey,
  });
  const launchAuthorizationLedgerRecord = launchAuthorization
    ? recordStageRunExecutionAuthorizationReceipts([launchAuthorization])
    : null;
  const launchAuthorizationReceipt =
    launchAuthorizationLedgerRecord?.status === 'recorded'
      && Array.isArray(launchAuthorizationLedgerRecord.receipts)
      ? launchAuthorizationLedgerRecord.receipts[0]
      : null;
  const workspaceLocator = launchAuthorizationReceipt
    ? {
        ...input.workspaceLocator,
        stage_run_id: launchAuthorizationReceipt.stage_run_id,
        current_pointer_ref: launchAuthorizationReceipt.current_pointer_ref,
        stage_manifest_ref: launchAuthorizationReceipt.stage_manifest_ref,
        provider_attempt_ref: launchAuthorizationReceipt.provider_attempt_ref,
        attempt_lease_ref: launchAuthorizationReceipt.attempt_lease_ref,
        attempt_lease_status: launchAuthorizationReceipt.attempt_lease_status,
        execution_authorization_decision_ref:
          launchAuthorizationReceipt.execution_authorization_decision_ref,
        execution_authorization_receipt_ref: launchAuthorizationReceipt.receipt_ref,
      }
    : input.workspaceLocator;
  const providerReceipt = buildStageAttemptProviderReceipt({
    providerKind,
    stageAttemptId,
    workflowId,
  });
  const providerRun = {
    provider_kind: providerKind,
    workflow_id: workflowId,
    namespace: providerKind === 'temporal' ? process.env.OPL_TEMPORAL_NAMESPACE?.trim() || 'default' : null,
    task_queue: providerKind === 'temporal' ? process.env.OPL_TEMPORAL_TASK_QUEUE?.trim() || 'opl-stage-attempts' : null,
    provider_status: 'registered',
    started_at: null,
    completed_at: null,
    last_heartbeat_at: null,
  };
  const initialActivityEvents: Record<string, unknown>[] = input.launchAdmissionGate
    ? [{
        event_kind: 'stage_launch_admission_gate',
        event_time: createdAt,
        gate: input.launchAdmissionGate,
      }]
    : [];
  if (input.launchInvocation) {
    initialActivityEvents.push({
      event_kind: 'stage_launch_invocation',
      event_time: createdAt,
      invocation: input.launchInvocation,
    });
  }
  const row = {
    stage_attempt_id: stageAttemptId,
    idempotency_key: idempotencyKey,
    provider_kind: providerKind,
    workflow_id: workflowId,
    domain_id: input.domainId,
    stage_id: stageId,
    workspace_locator_json: JSON.stringify(workspaceLocator),
    source_fingerprint: sourceFingerprint,
    executor_kind: executorKind,
    stage_attempt_executor_policy_json: stageAttemptExecutorPolicy
      ? JSON.stringify(stageAttemptExecutorPolicy)
      : null,
    status: input.blockedReason ? 'blocked' : 'queued',
    checkpoint_refs_json: JSON.stringify(normalizeJsonList(input.checkpointRefs)),
    closeout_refs_json: JSON.stringify(normalizeJsonList(input.closeoutRefs)),
    human_gate_refs_json: JSON.stringify(normalizeJsonList(input.humanGateRefs)),
    retry_budget_json: JSON.stringify(retryBudget),
    attempt_count: 0,
    task_id: taskId,
    blocked_reason: input.blockedReason?.trim() || null,
    provider_receipt_json: JSON.stringify(providerReceipt),
    provider_run_json: JSON.stringify(providerRun),
    activity_events_json: JSON.stringify(initialActivityEvents),
    route_impact_json: JSON.stringify(input.routeImpact ?? {}),
    closeout_receipt_status: null,
    created_at: createdAt,
    updated_at: createdAt,
  };
  db.prepare(`
    INSERT INTO stage_attempts(
      stage_attempt_id, idempotency_key, provider_kind, workflow_id, domain_id, stage_id, workspace_locator_json,
      source_fingerprint, executor_kind, stage_attempt_executor_policy_json, status, checkpoint_refs_json, closeout_refs_json,
      human_gate_refs_json, retry_budget_json, attempt_count, task_id, blocked_reason,
      provider_receipt_json, provider_run_json, activity_events_json, route_impact_json,
      closeout_receipt_status, created_at, updated_at
    )
    VALUES (
      @stage_attempt_id, @idempotency_key, @provider_kind, @workflow_id, @domain_id, @stage_id, @workspace_locator_json,
      @source_fingerprint, @executor_kind, @stage_attempt_executor_policy_json, @status, @checkpoint_refs_json, @closeout_refs_json,
      @human_gate_refs_json, @retry_budget_json, @attempt_count, @task_id, @blocked_reason,
      @provider_receipt_json, @provider_run_json, @activity_events_json, @route_impact_json,
      @closeout_receipt_status, @created_at, @updated_at
    )
  `).run(row);
  return {
    created: true,
    idempotent_noop: false,
    attempt: stageAttemptToPayload(row as StageAttemptRow),
    execution_authorization_ledger_record: launchAuthorizationLedgerRecord,
  };
}
