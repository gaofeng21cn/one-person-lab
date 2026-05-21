import type { DatabaseSync } from 'node:sqlite';

import type { FamilyRuntimeTaskRow } from './family-runtime-store.ts';
import { insertEvent, stableId } from './family-runtime-store.ts';
import {
  MAS_DOMAIN_ROUTE_RECONCILE_APPLY_ACTION,
  isMasOwnerRouteTask,
  masOwnerRouteActionRef,
} from './family-runtime-mas-domain-route.ts';
import { resolveFamilyRuntimeProviderKind } from './family-runtime-providers.ts';
import {
  createStageAttempt,
  listStageAttemptsForTask,
} from './family-runtime-stage-attempts.ts';
import { buildStageAdmissionLaunchGate } from './family-runtime-stage-admission-gate.ts';

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function recordList(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

function uniqueStrings(values: Array<string | null>) {
  return [...new Set(values.filter((entry): entry is string => Boolean(entry)))];
}

function recordStringRefs(value: Record<string, unknown> | null, singularKeys: string[], listKeys: string[]) {
  if (!value) {
    return [];
  }
  return uniqueStrings([
    ...singularKeys.map((key) => optionalString(value[key])),
    ...listKeys.flatMap((key) => stringList(value[key])),
  ]);
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

function familyTransitionResult(payload: Record<string, unknown>) {
  const transition = isRecord(payload.family_transition) ? payload.family_transition : null;
  if (!transition) {
    return null;
  }
  return optionalString(transition.transition_id) ? transition : null;
}

function stageIdForProviderHostedTask(row: FamilyRuntimeTaskRow, payload: Record<string, unknown>) {
  if (isMasOwnerRouteTask(row.domain_id, row.task_kind)) {
    return row.task_kind;
  }
  if (row.domain_id === 'medautoscience' && row.task_kind === 'paper_autonomy/guarded-apply') {
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
  if (isMasOwnerRouteTask(row.domain_id, row.task_kind)) {
    locator.route_ref = row.task_kind;
    locator.action_ref = masOwnerRouteActionRef(row.task_kind) ?? MAS_DOMAIN_ROUTE_RECONCILE_APPLY_ACTION;
    locator.domain_truth_owner = 'med-autoscience';
    locator.opl_writes_domain_truth = false;
    locator.opl_writes_publication_quality = false;
    locator.opl_writes_artifact_gate = false;
    locator.opl_writes_current_package = false;
  }
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
  const existingAttempts = listStageAttemptsForTask(db, row.task_id);
  const providerKind = resolveFamilyRuntimeProviderKind();
  const expectedSourceFingerprint = sourceFingerprintForProviderHostedTask(row, payload);
  if (existingAttempts.some((attempt) => (
    attempt.provider_kind === providerKind && attempt.source_fingerprint === expectedSourceFingerprint
  ))) {
    return null;
  }
  const stageId = stageIdForProviderHostedTask(row, payload);
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
  });
  const result = createStageAttempt(db, {
    domainId: row.domain_id,
    stageId,
    providerKind,
    workspaceLocator: workspaceLocatorForProviderHostedTask(row, payload),
    sourceFingerprint: expectedSourceFingerprint,
    executorKind: 'domain_sidecar',
    taskId: row.task_id,
    blockedReason: admissionGate.blocked_reason ?? undefined,
  });
  insertEvent(db, {
    taskId: row.task_id,
    domainId: row.domain_id,
    eventType: result.idempotent_noop
      ? 'stage_attempt_idempotent_noop'
      : admissionGate.status === 'blocked'
        ? 'stage_attempt_blocked_by_admission_gate'
      : 'stage_attempt_created_for_provider_hosted_task',
    source: 'opl-family-runtime',
    payload: {
      stage_attempt_id: result.attempt.stage_attempt_id,
      stage_id: stageId,
      provider_kind: result.attempt.provider_kind,
      task_kind: row.task_kind,
      stage_launch_admission_gate: admissionGate,
    },
  });
  return result.attempt;
}
