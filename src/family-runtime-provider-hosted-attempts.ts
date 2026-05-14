import type { DatabaseSync } from 'node:sqlite';

import type { FamilyRuntimeTaskRow } from './family-runtime-store.ts';
import { insertEvent, stableId } from './family-runtime-store.ts';
import { resolveFamilyRuntimeProviderKind } from './family-runtime-providers.ts';
import {
  createStageAttempt,
  listStageAttemptsForTask,
} from './family-runtime-stage-attempts.ts';

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function recordList(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function providerHostedTaskDeclared(payload: Record<string, unknown>) {
  return payload.opl_provider_hosted_stage_attempt === true
    || payload.provider_hosted_stage_attempt === true
    || Boolean(optionalString(payload.provider_attempt_id))
    || isRecord(payload.controlled_stage_attempt)
    || isRecord(payload.controlled_stage_attempt_projection)
    || isRecord(payload.controlled_soak_no_regression_attempt);
}

function stageIdForProviderHostedTask(row: FamilyRuntimeTaskRow, payload: Record<string, unknown>) {
  if (row.domain_id === 'medautoscience' && row.task_kind === 'paper_autonomy/guarded-apply') {
    return row.task_kind;
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
  for (const key of [
    'profile',
    'profile_name',
    'study_id',
    'workspace_root',
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
  return locator;
}

function sourceFingerprintForProviderHostedTask(row: FamilyRuntimeTaskRow, payload: Record<string, unknown>) {
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
) {
  if (listStageAttemptsForTask(db, row.task_id).length > 0) {
    return null;
  }
  const stageId = stageIdForProviderHostedTask(row, payload);
  if (!stageId) {
    return null;
  }
  const result = createStageAttempt(db, {
    domainId: row.domain_id,
    stageId,
    providerKind: resolveFamilyRuntimeProviderKind(),
    workspaceLocator: workspaceLocatorForProviderHostedTask(row, payload),
    sourceFingerprint: sourceFingerprintForProviderHostedTask(row, payload),
    executorKind: 'domain_sidecar',
    taskId: row.task_id,
  });
  insertEvent(db, {
    taskId: row.task_id,
    domainId: row.domain_id,
    eventType: result.idempotent_noop
      ? 'stage_attempt_idempotent_noop'
      : 'stage_attempt_created_for_provider_hosted_task',
    source: 'opl-family-runtime',
    payload: {
      stage_attempt_id: result.attempt.stage_attempt_id,
      stage_id: stageId,
      provider_kind: result.attempt.provider_kind,
      task_kind: row.task_kind,
    },
  });
  return result.attempt;
}
