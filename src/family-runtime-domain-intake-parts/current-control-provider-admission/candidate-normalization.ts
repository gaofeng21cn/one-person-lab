import type { EnqueueInput } from '../../family-runtime-command.ts';

import {
  type CurrentControlProviderAdmissionActionQueueContext,
  type CurrentControlProviderAdmissionActionQueueIdentity,
  type CurrentControlProviderAdmissionCandidateFields,
  currentControlCurrentnessBasis,
  domainProgressTransitionApply,
  isRecord,
  optionalString,
  providerObservationBoundaryFromCurrentControl,
  recoveryObligationId,
} from './shared.ts';

function actionQueueProviderAdmissionContext(
  action: Record<string, unknown>,
): CurrentControlProviderAdmissionActionQueueContext {
  const handoff = isRecord(action.handoff_packet) ? action.handoff_packet : {};
  const ownerRoute = isRecord(handoff.owner_route)
    ? handoff.owner_route
    : isRecord(action.owner_route)
      ? action.owner_route
      : null;
  return { handoff, ownerRoute };
}

function actionQueueAttemptProtocolAllowsProviderAdmission(ownerRoute: Record<string, unknown> | null) {
  const protocol = isRecord(ownerRoute?.owner_route_attempt_protocol)
    ? ownerRoute.owner_route_attempt_protocol
    : null;
  const authorityBoundary = isRecord(protocol?.authority_boundary) ? protocol.authority_boundary : null;
  const completionBoundary = isRecord(protocol?.completion_boundary) ? protocol.completion_boundary : null;
  const runtimeCompletionGuard = isRecord(protocol?.runtime_completion_guard)
    ? protocol.runtime_completion_guard
    : null;
  const oplOwns = Array.isArray(authorityBoundary?.opl_owns)
    ? authorityBoundary.opl_owns
    : [];
  return protocol?.dispatchable === true
    && oplOwns.includes('queue')
    && oplOwns.includes('attempt')
    && completionBoundary?.provider_completion_is_domain_ready === false
    && runtimeCompletionGuard?.provider_completion_is_domain_completion === false;
}

function actionQueueProviderAdmissionFields(input: {
  action: Record<string, unknown>;
  handoff: Record<string, unknown>;
  ownerRoute: Record<string, unknown> | null;
}): Omit<
  CurrentControlProviderAdmissionCandidateFields,
  'currentControlCommand' | 'transitionRuntimeResult'
> | null {
  const contract = isRecord(input.ownerRoute?.currentness_contract)
    ? input.ownerRoute.currentness_contract
    : null;
  const basis = isRecord(contract?.basis) ? contract.basis : null;
  const studyId = optionalString(input.action.study_id)
    ?? optionalString(input.handoff.study_id)
    ?? optionalString(input.ownerRoute?.study_id);
  const actionType = optionalString(input.action.action_type) ?? optionalString(input.handoff.action_type);
  const workUnitId = optionalString(input.action.controller_work_unit_id)
    ?? optionalString(input.action.executable_work_unit)
    ?? optionalString(input.action.next_work_unit)
    ?? optionalString(basis?.work_unit_id);
  const workUnitFingerprint = optionalString(input.action.work_unit_fingerprint)
    ?? optionalString(input.ownerRoute?.work_unit_fingerprint)
    ?? optionalString(basis?.work_unit_fingerprint)
    ?? optionalString(input.action.action_fingerprint);
  const nextOwner = optionalString(input.handoff.next_executable_owner)
    ?? optionalString(input.handoff.owner)
    ?? optionalString(input.action.owner)
    ?? optionalString(input.action.recommended_owner)
    ?? optionalString(input.ownerRoute?.next_owner);
  if (!studyId || !actionType || !workUnitId || !workUnitFingerprint || !nextOwner) {
    return null;
  }
  return {
    studyId,
    actionType,
    workUnitId,
    workUnitFingerprint,
    nextOwner,
  };
}

function actionQueueProviderAdmissionIdentity(input: {
  action: Record<string, unknown>;
  handoff: Record<string, unknown>;
  ownerRoute: Record<string, unknown> | null;
  workUnitFingerprint: string;
}): CurrentControlProviderAdmissionActionQueueIdentity {
  const actionFingerprint = optionalString(input.action.action_fingerprint) ?? input.workUnitFingerprint;
  const sourceFingerprint = optionalString(input.action.source_fingerprint)
    ?? optionalString(input.ownerRoute?.source_fingerprint)
    ?? actionFingerprint;
  const obligationId = recoveryObligationId(input.action)
    ?? recoveryObligationId(input.handoff)
    ?? recoveryObligationId(input.ownerRoute);
  const routeIdentityKey = optionalString(input.action.route_identity_key)
    ?? optionalString(input.handoff.route_identity_key)
    ?? optionalString(input.ownerRoute?.route_identity_key);
  const attemptIdempotencyKey = optionalString(input.action.attempt_idempotency_key)
    ?? optionalString(input.handoff.attempt_idempotency_key)
    ?? optionalString(input.ownerRoute?.attempt_idempotency_key);
  return {
    actionFingerprint,
    sourceFingerprint,
    obligationId,
    routeIdentityKey,
    attemptIdempotencyKey,
  };
}

function currentControlProviderAdmissionCandidateFromActionQueueItem(
  currentControl: Record<string, unknown>,
  action: Record<string, unknown>,
) {
  const { handoff, ownerRoute } = actionQueueProviderAdmissionContext(action);
  if (!actionQueueAttemptProtocolAllowsProviderAdmission(ownerRoute)) {
    return null;
  }
  const fields = actionQueueProviderAdmissionFields({ action, handoff, ownerRoute });
  if (!fields) {
    return null;
  }
  const identity = actionQueueProviderAdmissionIdentity({
    action,
    handoff,
    ownerRoute,
    workUnitFingerprint: fields.workUnitFingerprint,
  });
  return {
    ...action,
    status: 'provider_admission_pending',
    owner_route_current: true,
    study_id: fields.studyId,
    quest_id: optionalString(handoff.quest_id) ?? optionalString(ownerRoute?.quest_id) ?? fields.studyId,
    action_type: fields.actionType,
    work_unit_id: fields.workUnitId,
    work_unit_fingerprint: fields.workUnitFingerprint,
    action_fingerprint: identity.actionFingerprint,
    source_fingerprint: identity.sourceFingerprint,
    dispatch_authority: optionalString(action.dispatch_authority) ?? 'opl_current_control_state_handoff',
    next_executable_owner: fields.nextOwner,
    provider_attempt_or_lease_required: true,
    provider_completion_is_domain_completion: false,
    stage_transition_authority_boundary: providerObservationBoundaryFromCurrentControl(),
    ...(identity.obligationId ? { recovery_obligation_id: identity.obligationId } : {}),
    required_output_surface: optionalString(action.required_output_surface),
    idempotency_key: optionalString(handoff.idempotency_key) ?? optionalString(ownerRoute?.idempotency_key),
    ...(identity.routeIdentityKey ? { route_identity_key: identity.routeIdentityKey } : {}),
    ...(identity.attemptIdempotencyKey ? { attempt_idempotency_key: identity.attemptIdempotencyKey } : {}),
    ...(isRecord(action.current_control_command_outbox_record)
      ? { current_control_command_outbox_record: action.current_control_command_outbox_record }
      : {}),
    ...(isRecord(action.opl_domain_progress_transition_request)
      ? { opl_domain_progress_transition_request: action.opl_domain_progress_transition_request }
      : {}),
    currentness_basis: currentControlCurrentnessBasis({
      currentControl,
      action,
      ownerRoute,
      workUnitId: fields.workUnitId,
      workUnitFingerprint: fields.workUnitFingerprint,
    }),
    ...(
      domainProgressTransitionApply(action)
        ? {
          domain_progress_transition_apply: domainProgressTransitionApply(action),
        }
        : {}
    ),
    provider_admission_schema_source: 'action_queue',
  };
}

export function currentControlProviderAdmissionCandidateFromTransitionRequestTask(
  input: EnqueueInput,
) {
  if (
    input.domainId !== 'medautoscience'
    || input.taskKind !== 'domain_owner/default-executor-dispatch'
  ) {
    return null;
  }
  const request = isRecord(input.payload.opl_domain_progress_transition_request)
    ? input.payload.opl_domain_progress_transition_request
    : null;
  if (!request) {
    return null;
  }
  const studyId = optionalString(input.payload.study_id)
    ?? optionalString(request.aggregate_identity && isRecord(request.aggregate_identity)
      ? request.aggregate_identity.study_id
      : null);
  const actionType = optionalString(input.payload.action_type)
    ?? optionalString(request.action_type);
  const workUnitId = optionalString(input.payload.work_unit_id)
    ?? optionalString(request.aggregate_identity && isRecord(request.aggregate_identity)
      ? request.aggregate_identity.work_unit_id
      : null);
  const workUnitFingerprint = optionalString(input.payload.work_unit_fingerprint)
    ?? optionalString(input.payload.action_fingerprint)
    ?? optionalString(request.aggregate_identity && isRecord(request.aggregate_identity)
      ? request.aggregate_identity.work_unit_fingerprint
      : null);
  const nextOwner = optionalString(input.payload.next_executable_owner)
    ?? optionalString(input.payload.domain_owner)
    ?? optionalString(input.payload.owner)
    ?? optionalString(request.next_owner);
  const routeIdentityKey = optionalString(input.payload.route_identity_key)
    ?? optionalString(request.route_identity_key)
    ?? optionalString(input.payload.attempt_idempotency_key)
    ?? optionalString(request.idempotency_key);
  const attemptIdempotencyKey = optionalString(input.payload.attempt_idempotency_key)
    ?? optionalString(request.idempotency_key);
  if (!studyId || !actionType || !workUnitId || !workUnitFingerprint || !nextOwner) {
    return null;
  }
  const currentnessBasis = isRecord(input.payload.owner_route_currentness_basis)
    ? input.payload.owner_route_currentness_basis
    : isRecord(input.payload.currentness_basis)
      ? input.payload.currentness_basis
      : {};
  return {
    status: 'provider_admission_pending',
    owner_route_current: input.payload.owner_route_current !== false,
    study_id: studyId,
    quest_id: optionalString(input.payload.quest_id) ?? studyId,
    action_type: actionType,
    work_unit_id: workUnitId,
    work_unit_fingerprint: workUnitFingerprint,
    action_fingerprint: optionalString(input.payload.action_fingerprint) ?? workUnitFingerprint,
    source_fingerprint: optionalString(input.payload.source_fingerprint)
      ?? optionalString(input.payload.action_fingerprint)
      ?? workUnitFingerprint,
    dispatch_authority: optionalString(input.payload.dispatch_authority)
      ?? 'domain_owner_transition_request',
    dispatch_path: optionalString(input.payload.dispatch_path),
    dispatch_ref: optionalString(input.payload.dispatch_ref),
    executor_kind: optionalString(input.payload.executor_kind) ?? 'codex_cli_default',
    next_executable_owner: nextOwner,
    provider_attempt_or_lease_required: input.payload.provider_attempt_or_lease_required !== false,
    provider_completion_is_domain_completion: false,
    stage_transition_authority_boundary: isRecord(input.payload.stage_transition_authority_boundary)
      ? input.payload.stage_transition_authority_boundary
      : providerObservationBoundaryFromCurrentControl(),
    ...(routeIdentityKey ? { route_identity_key: routeIdentityKey } : {}),
    ...(attemptIdempotencyKey ? { attempt_idempotency_key: attemptIdempotencyKey } : {}),
    ...(optionalString(input.payload.stage_packet_ref) ? { stage_packet_ref: optionalString(input.payload.stage_packet_ref) } : {}),
    ...(Array.isArray(input.payload.stage_packet_refs) ? { stage_packet_refs: input.payload.stage_packet_refs } : {}),
    ...(Array.isArray(input.payload.checkpoint_refs) ? { checkpoint_refs: input.payload.checkpoint_refs } : {}),
    ...(optionalString(input.payload.required_output_surface)
      ? { required_output_surface: optionalString(input.payload.required_output_surface) }
      : {}),
    ...(recoveryObligationId(input.payload) ? { recovery_obligation_id: recoveryObligationId(input.payload) } : {}),
    currentness_basis: {
      ...currentnessBasis,
      work_unit_id: optionalString(currentnessBasis.work_unit_id) ?? workUnitId,
      work_unit_fingerprint: optionalString(currentnessBasis.work_unit_fingerprint) ?? workUnitFingerprint,
    },
    opl_domain_progress_transition_request: request,
    provider_admission_schema_source: 'transition_request_pending_task',
    priority: input.priority,
  };
}

export function currentControlTransitionPendingCandidateFromTask(input: EnqueueInput) {
  if (
    input.domainId !== 'medautoscience'
    || input.taskKind !== 'domain_owner/default-executor-dispatch'
  ) {
    return null;
  }
  if (
    isRecord(input.payload.opl_domain_progress_transition_request)
    || isRecord(input.payload.current_control_command_outbox_record)
  ) {
    return null;
  }
  const requiresOplRuntime =
    input.payload.execution_requires_opl_authorization === true
    || optionalString(input.payload.blocked_reason) === 'opl_execution_authorization_required'
    || optionalString(input.payload.dispatch_status) === 'transition_request_pending'
    || optionalString(input.payload.reason) === 'current_control_transition_request_pending';
  if (!requiresOplRuntime) {
    return null;
  }
  const ownerRoute = isRecord(input.payload.owner_route) ? input.payload.owner_route : {};
  const currentnessBasis = isRecord(input.payload.owner_route_currentness_basis)
    ? input.payload.owner_route_currentness_basis
    : isRecord(input.payload.currentness_basis)
      ? input.payload.currentness_basis
      : isRecord(ownerRoute.currentness_contract)
        && isRecord(ownerRoute.currentness_contract.basis)
        ? ownerRoute.currentness_contract.basis
        : {};
  const studyId = optionalString(input.payload.study_id)
    ?? optionalString(input.payload.quest_id)
    ?? optionalString(ownerRoute.study_id);
  const actionType = optionalString(input.payload.action_type);
  const workUnitId = optionalString(input.payload.work_unit_id)
    ?? optionalString(currentnessBasis.work_unit_id);
  const workUnitFingerprint = optionalString(input.payload.work_unit_fingerprint)
    ?? optionalString(input.payload.action_fingerprint)
    ?? optionalString(input.payload.source_fingerprint)
    ?? optionalString(currentnessBasis.work_unit_fingerprint);
  const nextOwner = optionalString(input.payload.next_executable_owner)
    ?? optionalString(input.payload.domain_owner)
    ?? optionalString(input.payload.owner)
    ?? optionalString(ownerRoute.next_owner);
  if (!studyId || !actionType || !workUnitId || !workUnitFingerprint || !nextOwner) {
    return {
      blocked: {
        reason: 'current_control_transition_non_advancing_apply_identity_missing',
        task: {
          domain_id: input.domainId,
          task_kind: input.taskKind,
          ...input.payload,
        },
      },
    };
  }
  const routeIdentityKey = optionalString(input.payload.route_identity_key)
    ?? optionalString(ownerRoute.route_identity_key)
    ?? optionalString(ownerRoute.idempotency_key)
    ?? optionalString(input.payload.attempt_idempotency_key);
  const attemptIdempotencyKey = optionalString(input.payload.attempt_idempotency_key)
    ?? optionalString(ownerRoute.attempt_idempotency_key)
    ?? optionalString(ownerRoute.idempotency_key)
    ?? routeIdentityKey;
  return {
    candidate: {
      ...input.payload,
      status: 'transition_request_pending',
      owner_route_current: input.payload.owner_route_current !== false,
      study_id: studyId,
      quest_id: optionalString(input.payload.quest_id) ?? studyId,
      action_type: actionType,
      work_unit_id: workUnitId,
      work_unit_fingerprint: workUnitFingerprint,
      action_fingerprint: optionalString(input.payload.action_fingerprint) ?? workUnitFingerprint,
      source_fingerprint: optionalString(input.payload.source_fingerprint)
        ?? optionalString(input.payload.action_fingerprint)
        ?? workUnitFingerprint,
      dispatch_authority: optionalString(input.payload.dispatch_authority)
        ?? 'consumer_default_executor_dispatch',
      dispatch_path: optionalString(input.payload.dispatch_path),
      dispatch_ref: optionalString(input.payload.dispatch_ref),
      executor_kind: optionalString(input.payload.executor_kind) ?? 'codex_cli_default',
      next_executable_owner: nextOwner,
      provider_attempt_or_lease_required: false,
      provider_completion_is_domain_completion: false,
      stage_transition_authority_boundary: isRecord(input.payload.stage_transition_authority_boundary)
        ? input.payload.stage_transition_authority_boundary
        : providerObservationBoundaryFromCurrentControl(),
      ...(routeIdentityKey ? { route_identity_key: routeIdentityKey } : {}),
      ...(attemptIdempotencyKey ? { attempt_idempotency_key: attemptIdempotencyKey } : {}),
      ...(optionalString(input.payload.stage_packet_ref)
        ? { stage_packet_ref: optionalString(input.payload.stage_packet_ref) }
        : {}),
      ...(Array.isArray(input.payload.stage_packet_refs) ? { stage_packet_refs: input.payload.stage_packet_refs } : {}),
      ...(Array.isArray(input.payload.checkpoint_refs) ? { checkpoint_refs: input.payload.checkpoint_refs } : {}),
      ...(recoveryObligationId(input.payload) ? { recovery_obligation_id: recoveryObligationId(input.payload) } : {}),
      currentness_basis: {
        ...currentnessBasis,
        work_unit_id: optionalString(currentnessBasis.work_unit_id) ?? workUnitId,
        work_unit_fingerprint: optionalString(currentnessBasis.work_unit_fingerprint) ?? workUnitFingerprint,
      },
      provider_admission_schema_source: 'authorized_stage_packet_without_transition_request',
      task_kind: input.taskKind,
      domain_id: input.domainId,
      priority: input.priority,
    },
  };
}

function nestedCurrentControlActionItems(currentControl: Record<string, unknown>) {
  const items: unknown[] = [];
  if (Array.isArray(currentControl.action_queue)) {
    items.push(...currentControl.action_queue);
  }
  const studies = currentControl.studies;
  const studyRecords = Array.isArray(studies)
    ? studies
    : isRecord(studies)
      ? Object.values(studies)
      : [];
  for (const study of studyRecords) {
    if (!isRecord(study)) {
      continue;
    }
    if (Array.isArray(study.action_queue)) {
      items.push(...study.action_queue);
    }
    if (Array.isArray(study.provider_admission_candidates)) {
      items.push(...study.provider_admission_candidates);
    }
  }
  return items;
}

export function currentControlProviderAdmissionCandidates(currentControl: Record<string, unknown>) {
  const rootCandidates = Array.isArray(currentControl.provider_admission_candidates)
    ? currentControl.provider_admission_candidates
    : [];
  const candidates = [...rootCandidates];
  for (const item of nestedCurrentControlActionItems(currentControl)) {
    if (!isRecord(item)) {
      mergeCurrentControlProviderAdmissionCandidates(candidates, item);
      continue;
    }
    const candidate = optionalString(item.status) === 'provider_admission_pending'
      ? item
      : currentControlProviderAdmissionCandidateFromActionQueueItem(currentControl, item) ?? item;
    mergeCurrentControlProviderAdmissionCandidates(candidates, candidate);
  }
  return candidates;
}

export function mergeCurrentControlProviderAdmissionCandidates(
  candidates: unknown[],
  candidate: unknown,
) {
  if (!isRecord(candidate)) {
    candidates.push(candidate);
    return;
  }
  const identity = providerAdmissionCandidateIdentity(candidate);
  if (identity) {
    const existingIndex = candidates.findIndex((entry) =>
      isRecord(entry) && providerAdmissionCandidateIdentity(entry) === identity
    );
    if (existingIndex >= 0) {
      candidates[existingIndex] = {
        ...candidates[existingIndex] as Record<string, unknown>,
        ...candidate,
      };
      return;
    }
  }
  candidates.push(candidate);
}

function providerAdmissionCandidateIdentity(candidate: Record<string, unknown>) {
  return optionalString(candidate.attempt_idempotency_key)
    ?? optionalString(candidate.route_identity_key)
    ?? optionalString(candidate.idempotency_key)
    ?? optionalString(candidate.work_unit_fingerprint)
    ?? optionalString(candidate.action_fingerprint);
}

export function mergeProviderAdmissionCandidate(
  candidates: unknown,
  candidate: Record<string, unknown>,
) {
  const identity = providerAdmissionCandidateIdentity(candidate);
  const existing = Array.isArray(candidates)
    ? candidates.filter((entry): entry is Record<string, unknown> => isRecord(entry))
    : [];
  const retained = existing.filter((entry) => {
    const entryIdentity = providerAdmissionCandidateIdentity(entry);
    return !identity || entryIdentity !== identity;
  });
  return [candidate, ...retained];
}

export function removeProviderAdmissionCandidate(
  candidates: unknown,
  candidate: Record<string, unknown>,
) {
  const identity = providerAdmissionCandidateIdentity(candidate);
  const existing = Array.isArray(candidates)
    ? candidates.filter((entry): entry is Record<string, unknown> => isRecord(entry))
    : [];
  return existing.filter((entry) => {
    const entryIdentity = providerAdmissionCandidateIdentity(entry);
    return !identity || entryIdentity !== identity;
  });
}

export function transitionRequestPendingCountAfterAdmission(currentControl: Record<string, unknown>) {
  const count = typeof currentControl.transition_request_pending_count === 'number'
    && Number.isFinite(currentControl.transition_request_pending_count)
    ? currentControl.transition_request_pending_count
    : 0;
  return Math.max(0, count - 1);
}
