import fs from 'node:fs';
import path from 'node:path';

import type {
  EnqueueInput,
  FamilyRuntimeDomainId,
} from '../family-runtime-command.ts';
import {
  appendDomainProgressTransitionRuntimeResult,
  appendDomainProgressTransitionRuntimeResultJsonl,
  buildNonAdvancingApplyRuntimeResult,
  buildDomainProgressTransitionRuntimeResult,
  createDomainProgressTransitionRuntimeLog,
  DOMAIN_PROGRESS_TRANSITION_RUNTIME_ID,
  normalizeDomainProgressTransitionCommand,
  readDomainProgressTransitionRuntimeReadbackJsonl,
} from '../family-runtime-domain-progress-transition-runtime.ts';

export type CurrentControlProviderAdmissionExportContext = {
  cwd: string;
  source: string;
  owner_fingerprint: string;
};

type CurrentControlProviderAdmissionCandidateFields = {
  studyId: string;
  actionType: string;
  workUnitId: string;
  workUnitFingerprint: string;
  nextOwner: string;
  currentControlCommand: Record<string, unknown>;
  transitionRuntimeResult: Record<string, unknown>;
};

type CurrentControlProviderAdmissionActionQueueContext = {
  handoff: Record<string, unknown>;
  ownerRoute: Record<string, unknown> | null;
};

type CurrentControlProviderAdmissionActionQueueIdentity = {
  actionFingerprint: string;
  sourceFingerprint: string;
  obligationId: string | null;
  routeIdentityKey: string | null;
  attemptIdempotencyKey: string | null;
};

type CurrentControlProviderAdmissionInputContext = {
  workspaceRoot: string | null;
  profileName: string | null;
  profileRef: string | null;
  dispatchAuthority: string;
  dispatchPath: string | null;
  dispatchRef: string | null;
  stagePacketRefs: string[];
  stagePacketRef: string | null;
  routeIdentityKey: string;
  attemptIdempotencyKey: string;
  sourceFingerprint: string;
  obligationId: string | null;
  sourceRefs: Array<Record<string, unknown>>;
  currentnessBasis: Record<string, unknown> | null;
  currentControlCommand: Record<string, unknown>;
  transitionRuntimeResult: Record<string, unknown>;
  transitionRuntimeLogAppend: Record<string, unknown> | null;
  transitionRuntimeLogRef: string | null;
  transitionRuntimeLiveReadback: Record<string, unknown> | null;
  domainProgressTransitionApply: Record<string, unknown> | null;
};

type CurrentControlProviderAdmissionBlocked = {
  reason: string;
  task: unknown;
  repair_action?: Record<string, unknown>;
};

type CurrentControlTransitionReadbackPublication = {
  published: boolean;
  status: 'transition_non_advancing_apply_recorded';
  ref: string;
  study_id: string | null;
  action_type: string | null;
  work_unit_id: string | null;
  idempotency_key: string | null;
  runtime_readback_status: string | null;
};

type CurrentControlTransitionReadbackResult = {
  publication?: CurrentControlTransitionReadbackPublication;
  blocked?: CurrentControlProviderAdmissionBlocked;
};

type CurrentControlProviderAdmissionReadbackPublishInput = {
  output: Record<string, unknown>;
  taskInput: EnqueueInput;
  taskResult: {
    accepted?: boolean;
    requeued_from_terminal?: boolean;
    current_control_provider_admission_consumed?: Record<string, unknown>;
    idempotent_noop?: boolean;
    task?: { payload?: Record<string, unknown> };
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function optionalScalarString(value: unknown) {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function validCompleteTransitionRuntimeLiveReadback(value: Record<string, unknown>) {
  const latestTransactionReadback = isRecord(value.latest_transaction_readback)
    ? value.latest_transaction_readback
    : null;
  return optionalString(value.surface_kind) === 'opl_domain_progress_transition_runtime_live_readback'
    && optionalString(value.runtime_id) === DOMAIN_PROGRESS_TRANSITION_RUNTIME_ID
    && optionalString(value.runtime_readback_status) === 'complete_transaction'
    && value.transaction_complete === true
    && latestTransactionReadback?.same_transaction_event_and_outbox === true
    && latestTransactionReadback?.same_outbox_identity === true
    && latestTransactionReadback?.same_stage_run_identity === true;
}

function recoveryObligationId(value: Record<string, unknown> | null | undefined) {
  return optionalString(value?.recovery_obligation_id)
    ?? optionalString(value?.paper_recovery_obligation_id);
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value
        .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
        .map((entry) => entry.trim())
    : [];
}

function uniqueStrings(values: Array<string | null>) {
  return [...new Set(values.filter((entry): entry is string => Boolean(entry)))];
}

function exportProfileRef(output: Record<string, unknown>) {
  const profile = isRecord(output.profile) ? output.profile : null;
  return optionalString(profile?.profile_ref);
}

function exportProfileName(output: Record<string, unknown>) {
  const profile = isRecord(output.profile) ? output.profile : null;
  return optionalString(profile?.profile_name);
}

function exportWorkspaceRoot(output: Record<string, unknown>) {
  const workspace = isRecord(output.workspace) ? output.workspace : null;
  return optionalString(workspace?.workspace_root);
}

function currentControlStatePath(output: Record<string, unknown>) {
  const workspaceRoot = exportWorkspaceRoot(output);
  if (!workspaceRoot) {
    return null;
  }
  return path.join(
    workspaceRoot,
    'runtime',
    'artifacts',
    'supervision',
    'opl_current_control_state',
    'latest.json',
  );
}

function domainProgressTransitionRuntimeLogPath(workspaceRoot: string | null) {
  return workspaceRoot
    ? path.join(
      workspaceRoot,
      'runtime',
      'artifacts',
      'supervision',
      'domain_progress_transition_runtime',
      'command_event_log.jsonl',
    )
    : null;
}

function readJsonRecord(filePath: string) {
  try {
    const payload = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
    return isRecord(payload) ? payload : null;
  } catch {
    return null;
  }
}

function domainProgressTransitionApply(value: Record<string, unknown>) {
  const direct = isRecord(value.domain_progress_transition_apply)
    ? value.domain_progress_transition_apply
    : null;
  if (!direct) {
    return null;
  }
  const boundary = isRecord(direct.authority_boundary) ? direct.authority_boundary : null;
  const runtimeApplyTarget = isRecord(direct.runtime_apply_target) ? direct.runtime_apply_target : null;
  return optionalString(direct.surface_kind) === 'opl_domain_progress_transition_packet'
    && optionalString(direct.transition_kind) === 'execute_current_owner_delta'
    && optionalString(runtimeApplyTarget?.kind) === 'provider_attempt_or_owner_callable'
    && runtimeApplyTarget?.provider_admission_required === true
    && runtimeApplyTarget?.domain_truth_owner === 'med-autoscience'
    && boundary?.opl_can_write_mas_truth === false
    && boundary?.opl_can_create_domain_owner_receipt === false
    && boundary?.opl_can_create_domain_typed_blocker === false
    && boundary?.provider_completion_is_domain_ready === false
    ? direct
    : null;
}

function workspaceRelativeRef(value: string | null, workspaceRoot: string | null) {
  if (!value || !workspaceRoot || !path.isAbsolute(value)) {
    return value;
  }
  const relative = path.relative(workspaceRoot, value);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    return value;
  }
  return relative.split(path.sep).join('/');
}

function currentControlStagePacketRefs(input: {
  candidate: Record<string, unknown>;
  workspaceRoot: string | null;
}) {
  return uniqueStrings([
    workspaceRelativeRef(optionalString(input.candidate.stage_packet_ref), input.workspaceRoot),
    ...stringList(input.candidate.stage_packet_refs).map((ref) => workspaceRelativeRef(ref, input.workspaceRoot)),
    ...stringList(input.candidate.checkpoint_refs).map((ref) => workspaceRelativeRef(ref, input.workspaceRoot)),
  ]);
}

function defaultExecutorDispatchRefByConvention(input: {
  workspaceRoot: string | null;
  studyId: string;
  actionType: string;
}) {
  if (!input.workspaceRoot) {
    return null;
  }
  const ref = [
    'studies',
    input.studyId,
    'artifacts',
    'supervision',
    'consumer',
    'default_executor_dispatches',
    `${input.actionType}.json`,
  ].join('/');
  const filePath = path.join(input.workspaceRoot, ref);
  return fs.existsSync(filePath) ? ref : null;
}

function providerAdmissionSourceRefs(input: {
  candidate: Record<string, unknown>;
  currentControlRef: string;
  workspaceRoot: string | null;
  dispatchRef: string | null;
}) {
  const refs: Array<Record<string, unknown>> = [{
    role: 'mas_opl_current_control_state',
    ref: workspaceRelativeRef(input.currentControlRef, input.workspaceRoot),
    exists: true,
  }];
  const executionRef = optionalString(input.candidate.execution_ref);
  if (executionRef) {
    refs.push({
      role: 'mas_default_executor_execution',
      ref: workspaceRelativeRef(executionRef, input.workspaceRoot),
      exists: true,
    });
  }
  if (input.dispatchRef) {
    refs.push({
      role: 'mas_default_executor_dispatch',
      ref: input.dispatchRef,
      exists: true,
    });
  }
  return refs;
}

function transitionReadbackSourceRefs(input: {
  candidate: Record<string, unknown>;
  currentControlRef: string;
  workspaceRoot: string | null;
  dispatchRef: string | null;
  stagePacketRefs: string[];
}) {
  const refs = providerAdmissionSourceRefs({
    candidate: input.candidate,
    currentControlRef: input.currentControlRef,
    workspaceRoot: input.workspaceRoot,
    dispatchRef: input.dispatchRef,
  });
  for (const ref of input.stagePacketRefs) {
    refs.push({
      role: 'mas_authorized_stage_packet',
      ref,
      exists: true,
    });
  }
  return refs;
}

function providerAdmissionDedupeKey(input: {
  candidate: Record<string, unknown>;
  routeIdentityKey: string;
  attemptIdempotencyKey: string;
  profileName: string | null;
  studyId: string;
  actionType: string;
  dispatchAuthority: string;
  sourceFingerprint: string;
}) {
  return input.attemptIdempotencyKey
    ?? input.routeIdentityKey
    ?? [
      'mas',
      input.profileName ?? 'current-control',
      input.studyId,
      'default-executor',
      input.actionType,
      input.dispatchAuthority,
      input.sourceFingerprint,
    ].join(':');
}

function validStageTransitionAuthorityBoundary(value: unknown) {
  if (!isRecord(value)) {
    return false;
  }
  return optionalString(value.producer_kind) === 'runtime_provider'
    && optionalString(value.intent_kind) === 'provider_observation'
    && value.stage_transition_authority === 'one-person-lab'
    && value.intent_can_write_stage_current_pointer === false
    && value.intent_can_write_stage_run_terminal_state === false
    && value.intent_can_publish_current_owner_delta === false
    && value.intent_can_write_domain_truth === false
    && value.intent_can_create_owner_receipt === false
    && value.intent_can_create_typed_blocker === false
    && value.provider_completion_counts_as_stage_transition === false
    && value.read_model_update_counts_as_stage_transition === false
    && value.worklist_update_counts_as_stage_transition === false
    && value.evidence_event_counts_as_stage_transition === false
    && value.agent_lab_output_counts_as_stage_transition === false;
}

function providerObservationBoundaryFromCurrentControl() {
  return {
    producer_kind: 'runtime_provider',
    intent_kind: 'provider_observation',
    stage_transition_authority: 'one-person-lab',
    intent_can_write_stage_current_pointer: false,
    intent_can_write_stage_run_terminal_state: false,
    intent_can_publish_current_owner_delta: false,
    intent_can_write_domain_truth: false,
    intent_can_create_owner_receipt: false,
    intent_can_create_typed_blocker: false,
    provider_completion_counts_as_stage_transition: false,
    read_model_update_counts_as_stage_transition: false,
    worklist_update_counts_as_stage_transition: false,
    evidence_event_counts_as_stage_transition: false,
    agent_lab_output_counts_as_stage_transition: false,
  };
}

function currentControlCurrentnessBasis(input: {
  currentControl: Record<string, unknown>;
  action: Record<string, unknown>;
  ownerRoute: Record<string, unknown> | null;
  workUnitId: string;
  workUnitFingerprint: string;
}) {
  const contract = isRecord(input.ownerRoute?.currentness_contract)
    ? input.ownerRoute.currentness_contract
    : null;
  const basis = isRecord(contract?.basis) ? contract.basis : {};
  const digestBasis = isRecord(input.ownerRoute?.currentness_digest_basis)
    ? input.ownerRoute.currentness_digest_basis
    : null;
  return {
    schema_version: input.currentControl.schema_version ?? null,
    surface: optionalString(input.currentControl.surface),
    generated_at: optionalString(input.currentControl.generated_at),
    observed_generation:
      optionalScalarString(input.currentControl.observed_generation)
      ?? optionalScalarString(input.currentControl.source_generation)
      ?? optionalScalarString(input.currentControl.generation),
    derived_generation:
      optionalScalarString(input.ownerRoute?.derived_generation)
      ?? optionalScalarString(contract?.derived_generation)
      ?? optionalScalarString(basis.derived_generation)
      ?? optionalScalarString(input.currentControl.derived_generation),
    work_unit_id: optionalString(basis.work_unit_id) ?? input.workUnitId,
    work_unit_fingerprint: optionalString(basis.work_unit_fingerprint) ?? input.workUnitFingerprint,
    truth_epoch: optionalString(input.ownerRoute?.truth_epoch) ?? optionalString(basis.truth_epoch),
    runtime_health_epoch:
      optionalString(input.ownerRoute?.runtime_health_epoch) ?? optionalString(basis.runtime_health_epoch),
    source_eval_id: optionalString(basis.source_eval_id),
    ...(digestBasis ? { currentness_digest_basis: digestBasis } : {}),
  };
}

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

function currentControlProviderAdmissionCandidateFromTransitionRequestTask(
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

function currentControlTransitionPendingCandidateFromTask(input: EnqueueInput) {
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

function currentControlStudyRecord(
  currentControl: Record<string, unknown>,
  studyId: string,
) {
  const studies = currentControl.studies;
  const studyRecords = Array.isArray(studies)
    ? studies
    : isRecord(studies)
      ? Object.values(studies)
      : [];
  return studyRecords.find((study): study is Record<string, unknown> =>
    isRecord(study) && optionalString(study.study_id) === studyId
  ) ?? null;
}

function currentControlAllowsNonAdvancingTransitionReadback(input: {
  currentControl: Record<string, unknown>;
  candidate: Record<string, unknown>;
}) {
  const studyId = optionalString(input.candidate.study_id);
  if (!studyId) {
    return false;
  }
  const study = currentControlStudyRecord(input.currentControl, studyId);
  const studyAction = isRecord(study?.current_control_action) ? study.current_control_action : {};
  const rootAction = isRecord(input.currentControl.current_executable_owner_action)
    ? input.currentControl.current_executable_owner_action
    : {};
  const actionType = optionalString(input.candidate.action_type);
  const workUnitId = optionalString(input.candidate.work_unit_id);
  const workUnitFingerprint = optionalString(input.candidate.work_unit_fingerprint);
  const actionMatchesRoot =
    !optionalString(rootAction.action_type)
    || (
      optionalString(rootAction.action_type) === actionType
      && optionalString(rootAction.work_unit_id) === workUnitId
      && (
        !optionalString(rootAction.work_unit_fingerprint)
        || optionalString(rootAction.work_unit_fingerprint) === workUnitFingerprint
      )
    );
  const studyStatus = optionalString(studyAction.status);
  return actionMatchesRoot
    && (
      studyStatus === 'transition_request_pending'
      || studyAction.provider_admission_requires_opl_runtime_result === true
      || optionalString(input.candidate.dispatch_status) === 'transition_request_pending'
      || optionalString(input.candidate.blocked_reason) === 'opl_execution_authorization_required'
    );
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

function currentControlProviderAdmissionCandidates(currentControl: Record<string, unknown>) {
  const rootCandidates = Array.isArray(currentControl.provider_admission_candidates)
    ? currentControl.provider_admission_candidates
    : [];
  if (rootCandidates.length > 0) {
    return rootCandidates;
  }
  return nestedCurrentControlActionItems(currentControl).map((item) => {
    if (!isRecord(item)) {
      return item;
    }
    if (optionalString(item.status) === 'provider_admission_pending') {
      return item;
    }
    return currentControlProviderAdmissionCandidateFromActionQueueItem(currentControl, item) ?? item;
  });
}

function mergeCurrentControlProviderAdmissionCandidates(
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

function mergeProviderAdmissionCandidate(
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

function removeProviderAdmissionCandidate(
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

function transitionRequestPendingCountAfterAdmission(currentControl: Record<string, unknown>) {
  const count = typeof currentControl.transition_request_pending_count === 'number'
    && Number.isFinite(currentControl.transition_request_pending_count)
    ? currentControl.transition_request_pending_count
    : 0;
  return Math.max(0, count - 1);
}

function terminalConsumedReadback(input: {
  currentControl: Record<string, unknown>;
  candidate: Record<string, unknown>;
  consumed: Record<string, unknown>;
}) {
  const studyId = optionalString(input.candidate.study_id);
  const retainedRootCandidates = removeProviderAdmissionCandidate(
    input.currentControl.provider_admission_candidates,
    input.candidate,
  );
  const terminalReadback = {
    surface_kind: 'opl_current_control_provider_admission_terminal_consumed_readback',
    status: 'provider_admission_terminal_consumed',
    reason: optionalString(input.consumed.reason)
      ?? 'terminal_stage_attempt_consumed_same_transition_identity',
    terminal_stage_attempt_id: optionalString(input.consumed.terminal_stage_attempt_id),
    terminal_stage_attempt_status: optionalString(input.consumed.terminal_stage_attempt_status),
    terminal_provider_status: optionalString(input.consumed.terminal_provider_status),
    closeout_refs: stringList(input.consumed.closeout_refs),
    currentness_identity: isRecord(input.consumed.currentness_identity)
      ? input.consumed.currentness_identity
      : null,
    provider_completion_is_domain_completion: false,
    provider_completion_is_domain_ready: false,
  };
  const studies = Array.isArray(input.currentControl.studies)
    ? input.currentControl.studies.map((study) => {
        if (!isRecord(study) || optionalString(study.study_id) !== studyId) {
          return study;
        }
        const retainedStudyCandidates = removeProviderAdmissionCandidate(
          study.provider_admission_candidates,
          input.candidate,
        );
        return {
          ...study,
          current_control_action: {
            ...(isRecord(study.current_control_action) ? study.current_control_action : {}),
            status: 'provider_admission_terminal_consumed',
            reason: 'opl_terminal_stage_attempt_consumed_provider_admission',
            provider_admission_requires_opl_runtime_result: false,
            provider_completion_is_domain_completion: false,
            provider_completion_is_domain_ready: false,
            terminal_stage_attempt_id: terminalReadback.terminal_stage_attempt_id,
          },
          provider_admission_pending_count: retainedStudyCandidates.length,
          transition_request_pending_count: 0,
          provider_admission_candidates: retainedStudyCandidates,
          latest_provider_admission_terminal_consumed_readback: terminalReadback,
        };
      })
    : input.currentControl.studies;
  return {
    ...input.currentControl,
    current_control_refresh_source: 'opl_transition_runtime_readback_provider_admission_terminal_consumed',
    provider_admission_pending_count: retainedRootCandidates.length,
    transition_request_pending_count: transitionRequestPendingCountAfterAdmission(input.currentControl),
    provider_admission_candidates: retainedRootCandidates,
    ...(Array.isArray(input.currentControl.studies) ? { studies } : {}),
    latest_provider_admission_identity: input.candidate.provider_admission_identity,
    latest_provider_admission_terminal_consumed_readback: terminalReadback,
    provider_admission_projection_metadata: {
      surface_kind: 'opl_current_control_provider_admission_projection_metadata',
      projection_role: 'console_read_model_from_runway_transition_runtime',
      authority: false,
      domain_truth_owner: 'med-autoscience',
      substrate_owner: 'one-person-lab',
      provider_completion_is_domain_completion: false,
      idempotency_key: optionalString(input.candidate.attempt_idempotency_key),
      route_identity_key: optionalString(input.candidate.route_identity_key),
      terminal_stage_attempt_id: terminalReadback.terminal_stage_attempt_id,
      terminal_consumed: true,
    },
  };
}

function publishProviderAdmissionCandidateToCurrentControl(input: {
  currentControl: Record<string, unknown>;
  candidate: Record<string, unknown>;
}) {
  const studyId = optionalString(input.candidate.study_id);
  const studies = Array.isArray(input.currentControl.studies)
    ? input.currentControl.studies.map((study) => {
        if (!isRecord(study) || optionalString(study.study_id) !== studyId) {
          return study;
        }
        return {
          ...study,
          current_control_action: {
            ...(isRecord(study.current_control_action) ? study.current_control_action : {}),
            status: 'provider_admission_pending',
            reason: 'opl_transition_runtime_readback_published',
            provider_admission_requires_opl_runtime_result: false,
            provider_admission_identity_ref:
              optionalString(input.candidate.provider_admission_identity_ref)
              ?? (isRecord(input.candidate.provider_admission_identity)
                ? optionalString(input.candidate.provider_admission_identity.provider_admission_identity_ref)
                : null),
          },
          provider_admission_pending_count: 1,
          transition_request_pending_count: 0,
          provider_admission_candidates: mergeProviderAdmissionCandidate(
            study.provider_admission_candidates,
            input.candidate,
          ),
        };
      })
    : input.currentControl.studies;
  return {
    ...input.currentControl,
    current_control_refresh_source: 'opl_transition_runtime_readback_provider_admission',
    provider_admission_pending_count: mergeProviderAdmissionCandidate(
      input.currentControl.provider_admission_candidates,
      input.candidate,
    ).length,
    transition_request_pending_count: transitionRequestPendingCountAfterAdmission(input.currentControl),
    provider_admission_candidates: mergeProviderAdmissionCandidate(
      input.currentControl.provider_admission_candidates,
      input.candidate,
    ),
    ...(Array.isArray(input.currentControl.studies) ? { studies } : {}),
    opl_domain_progress_transition_runtime_live_readback:
      input.candidate.opl_domain_progress_transition_runtime_live_readback,
    opl_domain_progress_transition_live_readback:
      input.candidate.opl_domain_progress_transition_live_readback,
    latest_provider_admission_identity: input.candidate.provider_admission_identity,
    provider_admission_projection_metadata: {
      surface_kind: 'opl_current_control_provider_admission_projection_metadata',
      projection_role: 'console_read_model_from_runway_transition_runtime',
      authority: false,
      domain_truth_owner: 'med-autoscience',
      substrate_owner: 'one-person-lab',
      provider_completion_is_domain_completion: false,
      idempotency_key: optionalString(input.candidate.attempt_idempotency_key),
      route_identity_key: optionalString(input.candidate.route_identity_key),
    },
  };
}

export function publishCurrentControlProviderAdmissionReadback(
  input: CurrentControlProviderAdmissionReadbackPublishInput,
) {
  if (
    !input.taskResult.accepted
    && !input.taskResult.requeued_from_terminal
    && !input.taskResult.idempotent_noop
  ) {
    return { published: false, reason: 'task_not_admitted' };
  }
  const payload = isRecord(input.taskInput.payload)
    ? input.taskInput.payload
    : isRecord(input.taskResult.task?.payload)
      ? input.taskResult.task.payload
      : null;
  if (!payload || !isRecord(payload.provider_admission_identity)) {
    return { published: false, reason: 'provider_admission_identity_missing' };
  }
  const liveReadback = isRecord(payload.opl_domain_progress_transition_runtime_live_readback)
    ? payload.opl_domain_progress_transition_runtime_live_readback
    : isRecord(payload.provider_admission_identity.opl_domain_progress_transition_runtime_live_readback)
      ? payload.provider_admission_identity.opl_domain_progress_transition_runtime_live_readback
      : null;
  if (!liveReadback) {
    return { published: false, reason: 'transition_runtime_live_readback_missing' };
  }
  if (!validCompleteTransitionRuntimeLiveReadback(liveReadback)) {
    return { published: false, reason: 'transition_runtime_live_readback_incomplete' };
  }
  const currentControlRef = currentControlStatePath(input.output);
  if (!currentControlRef || !fs.existsSync(currentControlRef)) {
    return { published: false, reason: 'current_control_state_missing' };
  }
  const currentControl = readJsonRecord(currentControlRef);
  if (!currentControl) {
    return { published: false, reason: 'invalid_current_control_state' };
  }
  const candidate: Record<string, unknown> = {
    ...payload,
    status: 'provider_admission_pending',
    owner_route_current: true,
    provider_admission_schema_source:
      optionalString(payload.provider_admission_schema_source)
      ?? 'transition_runtime_readback',
    provider_admission_identity: payload.provider_admission_identity,
    opl_domain_progress_transition_runtime_live_readback: liveReadback,
    opl_domain_progress_transition_live_readback: liveReadback,
  };
  const consumed = isRecord(input.taskResult.current_control_provider_admission_consumed)
    ? input.taskResult.current_control_provider_admission_consumed
    : null;
  const updated = consumed
    ? terminalConsumedReadback({
        currentControl,
        candidate,
        consumed,
      })
    : publishProviderAdmissionCandidateToCurrentControl({
        currentControl,
        candidate,
      });
  fs.mkdirSync(path.dirname(currentControlRef), { recursive: true });
  fs.writeFileSync(currentControlRef, `${JSON.stringify(updated, null, 2)}\n`, 'utf8');
  return {
    published: true,
    ref: currentControlRef,
    idempotency_key: optionalString(candidate.attempt_idempotency_key),
    study_id: optionalString(candidate.study_id),
    ...(consumed ? { status: 'provider_admission_terminal_consumed' } : {}),
  };
}

function currentControlTransitionFields(
  candidate: Record<string, unknown>,
): {
  fields?: Omit<
    CurrentControlProviderAdmissionCandidateFields,
    'currentControlCommand' | 'transitionRuntimeResult'
  >;
  blocked?: CurrentControlProviderAdmissionBlocked;
} {
  const studyId = optionalString(candidate.study_id);
  const actionType = optionalString(candidate.action_type);
  const workUnitId = optionalString(candidate.work_unit_id);
  const workUnitFingerprint = optionalString(candidate.work_unit_fingerprint)
    ?? optionalString(candidate.action_fingerprint)
    ?? optionalString(candidate.source_fingerprint);
  const nextOwner = optionalString(candidate.next_executable_owner);
  if (!studyId || !actionType || !workUnitId || !workUnitFingerprint || !nextOwner) {
    return { blocked: { reason: 'current_control_transition_non_advancing_apply_identity_missing', task: candidate } };
  }
  if (candidate.provider_completion_is_domain_completion === true) {
    return {
      blocked: {
        reason: 'current_control_transition_non_advancing_apply_claims_domain_completion',
        task: candidate,
      },
    };
  }
  if (!validStageTransitionAuthorityBoundary(candidate.stage_transition_authority_boundary)) {
    return {
      blocked: {
        reason: 'current_control_transition_non_advancing_apply_missing_stage_authority_boundary',
        task: candidate,
      },
    };
  }
  return {
    fields: {
      studyId,
      actionType,
      workUnitId,
      workUnitFingerprint,
      nextOwner,
    },
  };
}

function nonAdvancingApplyCommand(input: {
  candidate: Record<string, unknown>;
  fields: Omit<
    CurrentControlProviderAdmissionCandidateFields,
    'currentControlCommand' | 'transitionRuntimeResult'
  >;
  stagePacketRef: string;
  stagePacketRefs: string[];
  routeIdentityKey: string;
  attemptIdempotencyKey: string;
  sourceFingerprint: string;
  dispatchRef: string | null;
}) {
  const currentnessBasis = isRecord(input.candidate.currentness_basis)
    ? input.candidate.currentness_basis
    : {};
  const sourceGeneration =
    optionalScalarString(input.candidate.source_generation)
    ?? optionalScalarString(currentnessBasis.truth_epoch)
    ?? optionalScalarString(currentnessBasis.observed_generation)
    ?? input.sourceFingerprint;
  const expectedVersion =
    optionalScalarString(input.candidate.expected_version)
    ?? optionalScalarString(currentnessBasis.runtime_health_epoch)
    ?? optionalScalarString(currentnessBasis.derived_generation)
    ?? sourceGeneration;
  const command = {
    surface_kind: 'opl_current_control_non_advancing_apply_command_outbox_record',
    runtime_kind: 'DomainProgressTransitionRuntime',
    transition_kind: 'NonAdvancingApply',
    aggregate_identity: {
      aggregate_kind: 'study_work_unit',
      aggregate_id: `${input.fields.studyId}::${input.fields.workUnitId}`,
      study_id: input.fields.studyId,
      work_unit_id: input.fields.workUnitId,
      work_unit_fingerprint: input.fields.workUnitFingerprint,
    },
    action_type: input.fields.actionType,
    work_unit_id: input.fields.workUnitId,
    work_unit_fingerprint: input.fields.workUnitFingerprint,
    next_owner: input.fields.nextOwner,
    idempotency_key: input.attemptIdempotencyKey,
    route_identity_key: input.routeIdentityKey,
    attempt_idempotency_key: input.attemptIdempotencyKey,
    source_generation: sourceGeneration,
    expected_version: expectedVersion,
    source_fingerprint: input.sourceFingerprint,
    stage_packet_ref: input.stagePacketRef,
    stage_packet_refs: input.stagePacketRefs,
    selected_dispatch_ref: input.dispatchRef ?? input.stagePacketRef,
    stage_run_identity: {
      stage_run_id: `stage-run:${input.fields.studyId}:${input.fields.workUnitId}`,
      route_identity_key: input.routeIdentityKey,
      attempt_idempotency_key: input.attemptIdempotencyKey,
      selected_dispatch_ref: input.dispatchRef ?? input.stagePacketRef,
      stage_packet_ref: input.stagePacketRef,
      stage_packet_refs: input.stagePacketRefs,
      provider_attempt_ref: `opl://non-advancing-apply/${input.fields.studyId}/${encodeURIComponent(input.attemptIdempotencyKey)}`,
      attempt_lease_ref: `opl://attempt-leases/${input.attemptIdempotencyKey}`,
      workflow_ref: `opl://workflows/${input.attemptIdempotencyKey}`,
      source_generation: sourceGeneration,
      source_fingerprint: input.sourceFingerprint,
      truth_epoch: optionalString(currentnessBasis.truth_epoch) ?? input.sourceFingerprint,
      runtime_health_epoch: optionalString(currentnessBasis.runtime_health_epoch) ?? input.sourceFingerprint,
      work_unit_fingerprint: input.fields.workUnitFingerprint,
    },
    postcondition: {
      kind: 'non_advancing_apply_typed_blocker_ref',
      exactly_one_transition_required: true,
      non_advancing_apply_on_no_outcome: true,
      outcome_owner: 'one-person-lab',
      domain_state_owner: 'med-autoscience',
    },
    outcome: {
      kind: 'non_advancing_apply_typed_blocker_ref',
      reason: 'opl_transition_request_missing_for_authorized_stage_packet',
      stable_outcome: true,
      provider_completion_is_domain_completion: false,
      provider_completion_is_domain_ready: false,
      paper_progress_delta: false,
    },
    authority_boundary: {
      opl_can_write_domain_truth: false,
      opl_can_write_mas_truth: false,
      opl_can_create_domain_owner_receipt: false,
      opl_can_create_domain_typed_blocker: false,
      provider_completion_is_domain_completion: false,
      provider_completion_is_domain_ready: false,
      non_advancing_apply_counts_as_paper_progress: false,
    },
  };
  const normalized = normalizeDomainProgressTransitionCommand(command, input.fields);
  if (normalized.blocked) {
    return {
      blocked: {
        reason: normalized.blocked.reason.replace(
          'domain_progress_transition_',
          'current_control_transition_non_advancing_apply_',
        ),
        task: input.candidate,
      },
    };
  }
  return normalized.command
    ? { command: normalized.command }
    : {
        blocked: {
          reason: 'current_control_transition_non_advancing_apply_command_missing',
          task: input.candidate,
        },
      };
}

function removeStudyProviderAdmissionCandidates(candidates: unknown, studyId: string | null) {
  const existing = Array.isArray(candidates)
    ? candidates.filter((entry): entry is Record<string, unknown> => isRecord(entry))
    : [];
  if (!studyId) {
    return existing;
  }
  return existing.filter((entry) => optionalString(entry.study_id) !== studyId);
}

function publishNonAdvancingApplyToCurrentControl(input: {
  currentControl: Record<string, unknown>;
  candidate: Record<string, unknown>;
  currentControlRef: string;
  workspaceRoot: string | null;
  fields: Omit<
    CurrentControlProviderAdmissionCandidateFields,
    'currentControlCommand' | 'transitionRuntimeResult'
  >;
  runtimeResult: Record<string, unknown>;
  runtimeLogAppend: Record<string, unknown>;
  runtimeLogRef: string | null;
  runtimeLiveReadback: Record<string, unknown>;
  sourceRefs: Array<Record<string, unknown>>;
}) {
  const studyId = input.fields.studyId;
  const readback = {
    surface_kind: 'opl_current_control_transition_non_advancing_apply_readback',
    status: 'transition_non_advancing_apply_recorded',
    reason: 'opl_transition_request_missing_for_authorized_stage_packet',
    study_id: studyId,
    action_type: input.fields.actionType,
    work_unit_id: input.fields.workUnitId,
    work_unit_fingerprint: input.fields.workUnitFingerprint,
    idempotency_key: optionalString(input.candidate.attempt_idempotency_key),
    route_identity_key: optionalString(input.candidate.route_identity_key),
    stage_packet_ref: optionalString(input.candidate.stage_packet_ref),
    stage_packet_refs: stringList(input.candidate.stage_packet_refs),
    runtime_result: input.runtimeResult,
    runtime_log_append: input.runtimeLogAppend,
    ...(input.runtimeLogRef ? { runtime_log_ref: input.runtimeLogRef } : {}),
    runtime_live_readback: input.runtimeLiveReadback,
    exactly_one_outcome: isRecord(input.runtimeLiveReadback.exactly_one_outcome)
      ? input.runtimeLiveReadback.exactly_one_outcome
      : null,
    source_refs: input.sourceRefs,
    authority_boundary: {
      domain_truth_owner: 'med-autoscience',
      substrate_owner: 'one-person-lab',
      opl_can_write_mas_truth: false,
      opl_can_create_domain_owner_receipt: false,
      opl_can_create_domain_typed_blocker: false,
      provider_completion_is_domain_completion: false,
      provider_completion_is_domain_ready: false,
      paper_progress_delta: false,
    },
  };
  const replayAudit = isRecord(input.runtimeLiveReadback.replay_audit)
    ? input.runtimeLiveReadback.replay_audit
    : null;
  const projectionMetadata = {
    surface_kind: 'opl_current_control_domain_progress_transition_projection_metadata',
    projection_role: 'non_advancing_apply_current_transition_readback',
    authority: false,
    domain_truth_owner: 'med-autoscience',
    substrate_owner: 'one-person-lab',
    runtime_readback_status: optionalString(input.runtimeLiveReadback.runtime_readback_status),
    transaction_complete: input.runtimeLiveReadback.transaction_complete === true,
    provider_admission_allowed: false,
    current_executable_owner_action_allowed: false,
    paper_progress_delta: false,
    provider_completion_is_domain_completion: false,
    provider_completion_is_domain_ready: false,
    non_advancing_apply: true,
    replay_audit_status: replayAudit ? optionalString(replayAudit.replay_status) : null,
    replay_audit_consumable: replayAudit?.read_model_projection_consumable === true,
    replay_audit: replayAudit,
    source_runtime_projection_metadata: isRecord(input.runtimeLiveReadback.projection_metadata)
      ? input.runtimeLiveReadback.projection_metadata
      : null,
  };
  const rootCandidates = removeStudyProviderAdmissionCandidates(
    input.currentControl.provider_admission_candidates,
    studyId,
  );
  const studies = Array.isArray(input.currentControl.studies)
    ? input.currentControl.studies.map((study) => {
        if (!isRecord(study) || optionalString(study.study_id) !== studyId) {
          return study;
        }
        return {
          ...study,
          current_control_action: {
            ...(isRecord(study.current_control_action) ? study.current_control_action : {}),
            status: 'transition_non_advancing_apply_recorded',
            reason: 'opl_transition_request_missing_for_authorized_stage_packet',
            provider_admission_requires_opl_runtime_result: false,
            provider_completion_is_domain_completion: false,
            provider_completion_is_domain_ready: false,
            paper_progress_delta: false,
            non_advancing_apply: true,
          },
          provider_admission_pending_count: 0,
          transition_request_pending_count: 0,
          provider_admission_candidates: removeStudyProviderAdmissionCandidates(
            study.provider_admission_candidates,
            studyId,
          ),
          domain_progress_transition_non_advancing_apply_readback: readback,
          domain_progress_transition_projection_metadata: projectionMetadata,
        };
      })
    : input.currentControl.studies;
  const updated = {
    ...input.currentControl,
    current_control_refresh_source: 'opl_transition_runtime_readback_non_advancing_apply',
    provider_admission_pending_count: rootCandidates.length,
    transition_request_pending_count: 0,
    current_executable_owner_action: null,
    provider_admission_candidates: rootCandidates,
    ...(Array.isArray(input.currentControl.studies) ? { studies } : {}),
    domain_progress_transition_non_advancing_apply_readback: readback,
    domain_progress_transition_projection_metadata: projectionMetadata,
  };
  fs.mkdirSync(path.dirname(input.currentControlRef), { recursive: true });
  fs.writeFileSync(input.currentControlRef, `${JSON.stringify(updated, null, 2)}\n`, 'utf8');
  return {
    published: true,
    status: 'transition_non_advancing_apply_recorded' as const,
    ref: input.currentControlRef,
    study_id: studyId,
    action_type: input.fields.actionType,
    work_unit_id: input.fields.workUnitId,
    idempotency_key: optionalString(input.candidate.attempt_idempotency_key),
    runtime_readback_status: optionalString(input.runtimeLiveReadback.runtime_readback_status),
  };
}

function recordCurrentControlTransitionNonAdvancingApply(input: {
  currentControl: Record<string, unknown>;
  candidate: Record<string, unknown>;
  output: Record<string, unknown>;
  currentControlRef: string;
}): CurrentControlTransitionReadbackResult {
  if (optionalString(input.candidate.status) !== 'transition_request_pending') {
    return {};
  }
  if (input.candidate.owner_route_current !== true) {
    return {};
  }
  if (!currentControlAllowsNonAdvancingTransitionReadback({
    currentControl: input.currentControl,
    candidate: input.candidate,
  })) {
    return {
      blocked: {
        reason: 'current_control_transition_non_advancing_apply_not_current',
        task: input.candidate,
      },
    };
  }
  const fieldsResult = currentControlTransitionFields(input.candidate);
  if (fieldsResult.blocked) {
    return { blocked: fieldsResult.blocked };
  }
  if (!fieldsResult.fields) {
    return {
      blocked: {
        reason: 'current_control_transition_non_advancing_apply_identity_missing',
        task: input.candidate,
      },
    };
  }
  const workspaceRoot = exportWorkspaceRoot(input.output);
  const stagePacketRefs = currentControlStagePacketRefs({
    candidate: input.candidate,
    workspaceRoot,
  });
  const stagePacketRef = stagePacketRefs[0] ?? null;
  if (!stagePacketRef) {
    return {
      blocked: {
        reason: 'current_control_transition_non_advancing_apply_stage_packet_ref_missing',
        task: input.candidate,
      },
    };
  }
  const routeIdentityKey = optionalString(input.candidate.route_identity_key);
  if (!routeIdentityKey) {
    return {
      blocked: {
        reason: 'current_control_transition_non_advancing_apply_route_identity_key_missing',
        task: input.candidate,
      },
    };
  }
  const attemptIdempotencyKey = optionalString(input.candidate.attempt_idempotency_key);
  if (!attemptIdempotencyKey) {
    return {
      blocked: {
        reason: 'current_control_transition_non_advancing_apply_attempt_idempotency_key_missing',
        task: input.candidate,
      },
    };
  }
  const transitionRuntimeLogPath = domainProgressTransitionRuntimeLogPath(workspaceRoot);
  if (!transitionRuntimeLogPath) {
    return {
      blocked: {
        reason: 'current_control_transition_non_advancing_apply_runtime_log_path_missing',
        task: input.candidate,
      },
    };
  }
  const sourceFingerprint = optionalString(input.candidate.source_fingerprint)
    ?? optionalString(input.candidate.action_fingerprint)
    ?? fieldsResult.fields.workUnitFingerprint;
  const dispatchPath = optionalString(input.candidate.dispatch_path);
  const dispatchRef = optionalString(input.candidate.dispatch_ref)
    ?? workspaceRelativeRef(dispatchPath, workspaceRoot)
    ?? stagePacketRef;
  const commandResult = nonAdvancingApplyCommand({
    candidate: input.candidate,
    fields: fieldsResult.fields,
    stagePacketRef,
    stagePacketRefs,
    routeIdentityKey,
    attemptIdempotencyKey,
    sourceFingerprint,
    dispatchRef,
  });
  if (commandResult.blocked) {
    return { blocked: commandResult.blocked };
  }
  if (!commandResult.command) {
    return {
      blocked: {
        reason: 'current_control_transition_non_advancing_apply_command_missing',
        task: input.candidate,
      },
    };
  }
  const runtimeResult = buildNonAdvancingApplyRuntimeResult({
    command: commandResult.command,
    reason: 'opl_transition_request_missing_for_authorized_stage_packet',
  });
  const runtimeLogAppend = appendDomainProgressTransitionRuntimeResultJsonl({
    logPath: transitionRuntimeLogPath,
    result: runtimeResult,
  });
  if (runtimeLogAppend.blocked) {
    return {
      blocked: {
        reason: optionalString(runtimeLogAppend.blocked.reason)
          ?? 'current_control_transition_non_advancing_apply_log_append_blocked',
        task: input.candidate,
      },
    };
  }
  const runtimeLiveReadback = readDomainProgressTransitionRuntimeReadbackJsonl({
    logPath: transitionRuntimeLogPath,
    aggregateIdentity: commandResult.command.aggregate_identity as Record<string, unknown>,
    idempotencyKey: attemptIdempotencyKey,
  });
  if (!validCompleteTransitionRuntimeLiveReadback(runtimeLiveReadback)) {
    return {
      blocked: {
        reason: 'current_control_transition_non_advancing_apply_runtime_readback_incomplete',
        task: input.candidate,
      },
    };
  }
  return {
    publication: publishNonAdvancingApplyToCurrentControl({
      currentControl: input.currentControl,
      candidate: input.candidate,
      currentControlRef: input.currentControlRef,
      workspaceRoot,
      fields: fieldsResult.fields,
      runtimeResult: isRecord(runtimeLogAppend.result) ? runtimeLogAppend.result : runtimeResult,
      runtimeLogAppend,
      runtimeLogRef: workspaceRelativeRef(transitionRuntimeLogPath, workspaceRoot),
      runtimeLiveReadback,
      sourceRefs: transitionReadbackSourceRefs({
        candidate: input.candidate,
        currentControlRef: input.currentControlRef,
        workspaceRoot,
        dispatchRef,
        stagePacketRefs,
      }),
    }),
  };
}

function currentControlProviderAdmissionCandidateFields(
  candidate: Record<string, unknown>,
): { fields?: CurrentControlProviderAdmissionCandidateFields; blocked?: CurrentControlProviderAdmissionBlocked } {
  const studyId = optionalString(candidate.study_id);
  const actionType = optionalString(candidate.action_type);
  const workUnitId = optionalString(candidate.work_unit_id);
  const workUnitFingerprint = optionalString(candidate.work_unit_fingerprint)
    ?? optionalString(candidate.action_fingerprint);
  const nextOwner = optionalString(candidate.next_executable_owner);
  if (!studyId || !actionType || !workUnitId || !workUnitFingerprint || !nextOwner) {
    return { blocked: { reason: 'invalid_current_control_provider_admission_candidate', task: candidate } };
  }
  if (candidate.provider_completion_is_domain_completion === true) {
    return { blocked: { reason: 'current_control_provider_completion_claims_domain_completion', task: candidate } };
  }
  if (!validStageTransitionAuthorityBoundary(candidate.stage_transition_authority_boundary)) {
    return { blocked: { reason: 'current_control_provider_admission_missing_stage_authority_boundary', task: candidate } };
  }
  const commandResult = currentControlCommandOutboxRecord(candidate, {
    studyId,
    actionType,
    workUnitId,
    workUnitFingerprint,
    nextOwner,
  });
  if (commandResult.blocked) {
    return { blocked: commandResult.blocked };
  }
  if (!commandResult.record) {
    return { blocked: { reason: 'current_control_provider_admission_command_record_missing', task: candidate } };
  }
  const transitionAppend = appendDomainProgressTransitionRuntimeResult({
    log: createDomainProgressTransitionRuntimeLog(),
    result: buildDomainProgressTransitionRuntimeResult(commandResult.record),
  });
  if (!transitionAppend.appended) {
    return {
      blocked: {
        reason: optionalString(transitionAppend.blocked?.reason)
          ?? 'current_control_provider_admission_transition_runtime_append_blocked',
        task: candidate,
      },
    };
  }
  return {
    fields: {
      studyId,
      actionType,
      workUnitId,
      workUnitFingerprint,
      nextOwner,
      currentControlCommand: commandResult.record,
      transitionRuntimeResult: transitionAppend.result,
    },
  };
}

function currentControlProviderAdmissionCurrentnessBasis(
  candidate: Record<string, unknown>,
  fields: CurrentControlProviderAdmissionCandidateFields,
) {
  const basis = isRecord(candidate.currentness_basis) ? candidate.currentness_basis : {};
  const observedGeneration =
    optionalScalarString(basis.observed_generation)
    ?? optionalScalarString(fields.currentControlCommand.source_generation);
  const derivedGeneration =
    optionalScalarString(basis.derived_generation)
    ?? optionalScalarString(fields.currentControlCommand.expected_version);
  return {
    ...basis,
    surface: optionalString(basis.surface) ?? 'opl_current_control_provider_admission',
    observed_generation: observedGeneration,
    derived_generation: derivedGeneration,
    work_unit_id: optionalString(basis.work_unit_id) ?? fields.workUnitId,
    work_unit_fingerprint: optionalString(basis.work_unit_fingerprint) ?? fields.workUnitFingerprint,
  };
}

function currentControlCommandOutboxRecord(
  candidate: Record<string, unknown>,
  fields: Omit<
    CurrentControlProviderAdmissionCandidateFields,
    'currentControlCommand' | 'transitionRuntimeResult'
  >,
): { record?: Record<string, unknown>; blocked?: CurrentControlProviderAdmissionBlocked } {
  const command = isRecord(candidate.current_control_command_outbox_record)
    ? candidate.current_control_command_outbox_record
    : isRecord(candidate.opl_domain_progress_transition_request)
      ? candidate.opl_domain_progress_transition_request
      : currentControlCommandFromCompleteRuntimeReadback(candidate);
  if (!command) {
    return {
      blocked: {
        reason: 'current_control_provider_admission_command_record_missing',
        task: candidate,
      },
    };
  }
  const normalized = normalizeDomainProgressTransitionCommand(command, fields);
  if (normalized.blocked) {
    return {
      blocked: {
        reason: normalized.blocked.reason.replace(
          'domain_progress_transition_',
          'current_control_provider_admission_',
        ),
        task: candidate,
      },
    };
  }
  return normalized.command
    ? { record: normalized.command }
    : {
        blocked: {
          reason: 'current_control_provider_admission_command_record_missing',
          task: candidate,
        },
      };
}

function currentControlCommandFromCompleteRuntimeReadback(candidate: Record<string, unknown>) {
  const command = isRecord(candidate.current_control_command)
    ? candidate.current_control_command
    : null;
  const runtimeResult = isRecord(candidate.domain_progress_transition_runtime)
    ? candidate.domain_progress_transition_runtime
    : null;
  const runtimeCommand = isRecord(runtimeResult?.command)
    ? runtimeResult.command
    : null;
  const liveReadback = isRecord(candidate.opl_domain_progress_transition_runtime_live_readback)
    ? candidate.opl_domain_progress_transition_runtime_live_readback
    : null;
  if (!command || !runtimeResult || !runtimeCommand || !liveReadback) {
    return null;
  }
  if (!validCompleteTransitionRuntimeLiveReadback(liveReadback)) {
    return null;
  }
  const commandId = optionalString(command.command_id);
  const runtimeCommandId = optionalString(runtimeCommand.command_id);
  const readbackCommandId = optionalString(isRecord(liveReadback.identity) ? liveReadback.identity.command_id : null);
  if (commandId && runtimeCommandId && commandId !== runtimeCommandId) {
    return null;
  }
  if (commandId && readbackCommandId && commandId !== readbackCommandId) {
    return null;
  }
  const idempotencyKey = optionalString(command.idempotency_key);
  const runtimeIdempotencyKey = optionalString(runtimeCommand.idempotency_key);
  const readbackIdempotencyKey = optionalString(isRecord(liveReadback.identity) ? liveReadback.identity.idempotency_key : null);
  if (idempotencyKey && runtimeIdempotencyKey && idempotencyKey !== runtimeIdempotencyKey) {
    return null;
  }
  if (idempotencyKey && readbackIdempotencyKey && idempotencyKey !== readbackIdempotencyKey) {
    return null;
  }
  return command;
}

function currentControlProviderAdmissionInputContext(input: {
  candidate: Record<string, unknown>;
  output: Record<string, unknown>;
  fields: CurrentControlProviderAdmissionCandidateFields;
  currentControlRef: string;
}): { context?: CurrentControlProviderAdmissionInputContext; blocked?: CurrentControlProviderAdmissionBlocked } {
  const workspaceRoot = exportWorkspaceRoot(input.output);
  const profileName = exportProfileName(input.output);
  const profileRef = exportProfileRef(input.output);
  const dispatchAuthority = optionalString(input.candidate.dispatch_authority)
    ?? 'consumer_default_executor_dispatch';
  const dispatchPath = optionalString(input.candidate.dispatch_path);
  const dispatchRef = optionalString(input.candidate.dispatch_ref)
    ?? workspaceRelativeRef(dispatchPath, workspaceRoot)
    ?? defaultExecutorDispatchRefByConvention({
      workspaceRoot,
      studyId: input.fields.studyId,
      actionType: input.fields.actionType,
    });
  const stagePacketRefs = currentControlStagePacketRefs({
    candidate: input.candidate,
    workspaceRoot,
  });
  const stagePacketRef = stagePacketRefs[0] ?? null;
  if (!stagePacketRef && (optionalString(input.candidate.executor_kind) ?? 'codex_cli_default') === 'codex_cli_default') {
    return {
      blocked: {
        reason: 'current_control_provider_admission_stage_packet_ref_missing',
        task: input.candidate,
        repair_action: currentControlProviderAdmissionRepairAction(
          'current_control_provider_admission_stage_packet_ref_missing',
          ['stage_packet_ref', 'stage_packet_refs'],
          input.fields,
        ),
      },
    };
  }
  const routeIdentityKey = optionalString(input.candidate.route_identity_key);
  if (!routeIdentityKey) {
    return {
      blocked: {
        reason: 'current_control_provider_admission_route_identity_key_missing',
        task: input.candidate,
        repair_action: currentControlProviderAdmissionRepairAction(
          'current_control_provider_admission_route_identity_key_missing',
          ['route_identity_key'],
          input.fields,
        ),
      },
    };
  }
  const attemptIdempotencyKey = optionalString(input.candidate.attempt_idempotency_key);
  if (!attemptIdempotencyKey) {
    return {
      blocked: {
        reason: 'current_control_provider_admission_attempt_idempotency_key_missing',
        task: input.candidate,
        repair_action: currentControlProviderAdmissionRepairAction(
          'current_control_provider_admission_attempt_idempotency_key_missing',
          ['attempt_idempotency_key'],
          input.fields,
        ),
      },
    };
  }
  const sourceFingerprint = optionalString(input.candidate.source_fingerprint)
    ?? optionalString(input.candidate.action_fingerprint)
    ?? input.fields.workUnitFingerprint;
  const obligationId = recoveryObligationId(input.candidate);
  const sourceRefs = providerAdmissionSourceRefs({
    candidate: input.candidate,
    currentControlRef: input.currentControlRef,
    workspaceRoot,
    dispatchRef,
  });
  const currentnessBasis = currentControlProviderAdmissionCurrentnessBasis(
    input.candidate,
    input.fields,
  );
  const transitionRuntimeLogPath = domainProgressTransitionRuntimeLogPath(workspaceRoot);
  const transitionRuntimeLogAppend = transitionRuntimeLogPath
    ? appendDomainProgressTransitionRuntimeResultJsonl({
      logPath: transitionRuntimeLogPath,
      result: buildDomainProgressTransitionRuntimeResult(input.fields.currentControlCommand),
    })
    : null;
  if (transitionRuntimeLogAppend?.blocked) {
    return {
      blocked: {
        reason: optionalString(transitionRuntimeLogAppend.blocked.reason)
          ?? 'current_control_provider_admission_transition_runtime_log_append_blocked',
        task: input.candidate,
      },
    };
  }
  const transitionRuntimeResult = isRecord(transitionRuntimeLogAppend?.result)
    ? transitionRuntimeLogAppend.result
    : input.fields.transitionRuntimeResult;
  const transitionRuntimeLiveReadback = transitionRuntimeLogPath
    ? readDomainProgressTransitionRuntimeReadbackJsonl({
      logPath: transitionRuntimeLogPath,
      aggregateIdentity: input.fields.currentControlCommand.aggregate_identity as Record<string, unknown>,
      idempotencyKey: attemptIdempotencyKey,
    })
    : null;
  const explicitTransitionApply = domainProgressTransitionApply(input.candidate);
  const transitionApply = explicitTransitionApply
    ?? domainProgressTransitionExecuteApply({
      obligationId,
      fields: input.fields,
      context: {
        stagePacketRef,
        stagePacketRefs,
        routeIdentityKey,
        attemptIdempotencyKey,
        sourceFingerprint,
        currentnessBasis,
        dispatchRef,
      },
    });
  return {
    context: {
      workspaceRoot,
      profileName,
      profileRef,
      dispatchAuthority,
      dispatchPath,
      dispatchRef,
      stagePacketRefs,
      stagePacketRef,
      routeIdentityKey,
      attemptIdempotencyKey,
      sourceFingerprint,
      obligationId,
      sourceRefs,
      currentnessBasis,
      currentControlCommand: input.fields.currentControlCommand,
      transitionRuntimeResult,
      transitionRuntimeLogAppend,
      transitionRuntimeLogRef: workspaceRelativeRef(transitionRuntimeLogPath, workspaceRoot),
      transitionRuntimeLiveReadback,
      domainProgressTransitionApply: transitionApply,
    },
  };
}

function currentControlProviderAdmissionRepairAction(
  reason: string,
  missingFields: string[],
  fields: CurrentControlProviderAdmissionCandidateFields,
) {
  return {
    surface_kind: 'opl_current_control_provider_admission_repair_action',
    action_id: 'materialize_current_control_provider_admission_identity',
    repair_owner: 'med-autoscience',
    substrate_owner: 'one-person-lab',
    reason,
    study_id: fields.studyId,
    action_type: fields.actionType,
    work_unit_id: fields.workUnitId,
    work_unit_fingerprint: fields.workUnitFingerprint,
    missing_fields: missingFields,
    required_fields: ['stage_packet_ref', 'stage_packet_refs', 'route_identity_key', 'attempt_idempotency_key'],
    preflight: {
      status: 'blocked',
      can_dispatch_provider_attempt: false,
      stale_sidecar_pending_task_must_remain_suppressed: true,
      materialization_owner: 'med-autoscience',
      substrate_owner: 'one-person-lab',
      missing_fields: missingFields,
      required_fields: ['stage_packet_ref', 'stage_packet_refs', 'route_identity_key', 'attempt_idempotency_key'],
      blocked_reason: reason,
    },
    accepted_materialization: {
      owner_route_must_emit_selected_stage_packet: true,
      owner_route_must_emit_route_identity_key: true,
      owner_route_must_emit_attempt_idempotency_key: true,
    },
    forbidden_fallbacks: {
      dispatch_ref_as_stage_packet_ref: 'forbidden',
      generic_idempotency_key_as_route_identity_key: 'forbidden',
      generic_idempotency_key_as_attempt_idempotency_key: 'forbidden',
      opl_materializes_mas_truth: 'forbidden',
    },
    command_hints: [
      {
        purpose: 'generate_selected_stage_packet',
        owner: 'med-autoscience',
        substrate_owner: 'one-person-lab',
        command_ref: [
          'mas current-control stage-packet materialize',
          `--study ${fields.studyId}`,
          `--action ${fields.actionType}`,
          `--work-unit ${fields.workUnitId}`,
        ].join(' '),
        writes_domain_truth: true,
        opl_must_not_execute_as_truth_writer: true,
      },
      {
        purpose: 'refresh_owner_route_identity',
        owner: 'med-autoscience',
        substrate_owner: 'one-person-lab',
        command_ref: [
          'mas current-control owner-route refresh',
          `--study ${fields.studyId}`,
          `--action ${fields.actionType}`,
          `--work-unit ${fields.workUnitId}`,
        ].join(' '),
        required_output_fields: ['route_identity_key', 'attempt_idempotency_key'],
        writes_domain_truth: true,
        opl_must_not_execute_as_truth_writer: true,
      },
      {
        purpose: 'materialize_current_control_provider_admission_identity',
        owner: 'med-autoscience',
        substrate_owner: 'one-person-lab',
        command_ref: [
          'mas current-control provider-admission materialize-identity',
          `--study ${fields.studyId}`,
          `--action ${fields.actionType}`,
          `--work-unit ${fields.workUnitId}`,
        ].join(' '),
        required_output_fields: ['stage_packet_ref', 'stage_packet_refs', 'route_identity_key', 'attempt_idempotency_key'],
        writes_domain_truth: true,
        opl_must_not_execute_as_truth_writer: true,
      },
    ],
    output_contract: {
      owner_repo: 'med-autoscience',
      output_surface: 'runtime/artifacts/supervision/opl_current_control_state/latest.json',
      provider_admission_candidate_must_include_required_fields: true,
    },
    authority_boundary: {
      opl_can_write_mas_truth: false,
      opl_can_create_domain_owner_receipt: false,
      opl_can_create_domain_typed_blocker: false,
      repair_action_counts_as_domain_ready: false,
    },
  };
}

function domainProgressTransitionExecuteApply(input: {
  obligationId: string | null;
  fields: CurrentControlProviderAdmissionCandidateFields;
  context: {
    stagePacketRef: string | null;
    stagePacketRefs: string[];
    routeIdentityKey: string;
    attemptIdempotencyKey: string;
    sourceFingerprint: string;
    currentnessBasis: Record<string, unknown> | null;
    dispatchRef: string | null;
  };
}) {
  if (!input.obligationId || !input.context.stagePacketRef) {
    return null;
  }
  const truthEpoch = optionalString(input.context.currentnessBasis?.truth_epoch)
    ?? input.context.sourceFingerprint;
  const runtimeHealthEpoch = optionalString(input.context.currentnessBasis?.runtime_health_epoch)
    ?? input.context.sourceFingerprint;
  const decisionId = [
    input.obligationId,
    'execute_current_owner_delta',
    `stage-run:${input.fields.studyId}:${input.fields.workUnitId}`,
    input.context.routeIdentityKey,
    input.context.attemptIdempotencyKey,
  ].join('|');
  const providerAdmissionIdentityRef = [
    'opl://provider-admission',
    input.fields.studyId,
    input.fields.actionType,
    input.context.attemptIdempotencyKey,
  ].join('/');
  return {
    surface_kind: 'opl_domain_progress_transition_packet',
    obligation_id: input.obligationId,
    transition_runtime_kind: 'DomainProgressTransitionRuntime',
    transition_decision_ref: decisionId,
    transition_kind: 'execute_current_owner_delta',
    brand_module_partition: {
      Runway: 'current-control provider admission and exactly-one apply selection',
      Pack: 'domain-declared command/outbox identity and postcondition',
      Stagecraft: 'StageRun identity and stage packet replay semantics',
      Console: 'read-model metadata projection',
      Vault: 'append-only outbox/event/replay refs',
    },
    exactly_one_apply: {
      scope: 'stage_run_identity',
      selected: true,
      non_advancing_apply: false,
    },
    read_model_metadata: {
      observed_generation: optionalScalarString(input.context.currentnessBasis?.observed_generation),
      derived_generation: optionalScalarString(input.context.currentnessBasis?.derived_generation),
      source_generation: optionalScalarString(input.fields.currentControlCommand.source_generation),
      expected_version: optionalScalarString(input.fields.currentControlCommand.expected_version),
    },
    replay_fixture: {
      command_outbox_ref: `opl://domain-progress-transition/outbox/${encodeURIComponent(input.context.attemptIdempotencyKey)}`,
      stage_run_identity_ref: `opl://domain-progress-transition/stage-run/${encodeURIComponent(input.context.routeIdentityKey)}`,
      replay_reads_body: false,
    },
    transition_ref: [
      'mas://current-owner-delta',
      input.fields.studyId,
      input.fields.workUnitId,
      input.fields.workUnitFingerprint,
    ].join('/'),
    provider_admission_identity_ref: providerAdmissionIdentityRef,
    current_identity: {
      stage_run_id: `stage-run:${input.fields.studyId}:${input.fields.workUnitId}`,
      route_identity_key: input.context.routeIdentityKey,
      attempt_idempotency_key: input.context.attemptIdempotencyKey,
      selected_dispatch_ref: input.context.dispatchRef ?? input.context.stagePacketRef,
      stage_packet_ref: input.context.stagePacketRef,
      stage_packet_refs: input.context.stagePacketRefs,
      provider_attempt_ref: providerAdmissionIdentityRef,
      attempt_lease_ref: `opl://attempt-leases/${input.context.attemptIdempotencyKey}`,
      workflow_ref: `opl://workflows/${input.context.attemptIdempotencyKey}`,
      source_fingerprint: input.context.sourceFingerprint,
      truth_epoch: truthEpoch,
      runtime_health_epoch: runtimeHealthEpoch,
      work_unit_fingerprint: input.fields.workUnitFingerprint,
    },
    runtime_apply_target: {
      kind: 'provider_attempt_or_owner_callable',
      provider_admission_required: true,
      owner_callable_required: true,
      terminal_closeout_consumption_required: false,
      recovery_action_materialization_required: false,
      human_resume_token_required: false,
      stable_typed_blocker_required: false,
      domain_truth_owner: 'med-autoscience',
      substrate_owner: 'one-person-lab',
    },
    authority_boundary: {
      opl_can_write_mas_truth: false,
      opl_can_create_domain_owner_receipt: false,
      opl_can_create_domain_typed_blocker: false,
      provider_completion_is_domain_ready: false,
    },
    state_index_projection: {
      payload_refs_only: true,
      indexed_refs: {
        obligation_id: input.obligationId,
        transition_decision_ref: decisionId,
        transition_ref: [
          'mas://current-owner-delta',
          input.fields.studyId,
          input.fields.workUnitId,
          input.fields.workUnitFingerprint,
        ].join('/'),
        stage_run_id: `stage-run:${input.fields.studyId}:${input.fields.workUnitId}`,
        route_identity_key: input.context.routeIdentityKey,
        attempt_idempotency_key: input.context.attemptIdempotencyKey,
        source_fingerprint: input.context.sourceFingerprint,
        work_unit_fingerprint: input.fields.workUnitFingerprint,
      },
    },
  };
}

function currentControlProviderAdmissionInputFrom(
  domainId: FamilyRuntimeDomainId,
  candidate: Record<string, unknown>,
  output: Record<string, unknown>,
  exportContext: CurrentControlProviderAdmissionExportContext,
  currentControlRef: string,
): { input?: EnqueueInput; blocked?: CurrentControlProviderAdmissionBlocked } {
  if (domainId !== 'medautoscience') {
    return { blocked: { reason: 'unsupported_current_control_provider_admission_domain', task: candidate } };
  }
  if (optionalString(candidate.status) !== 'provider_admission_pending' || candidate.owner_route_current !== true) {
    return {};
  }
  const candidateFields = currentControlProviderAdmissionCandidateFields(candidate);
  if (candidateFields.blocked) {
    return { blocked: candidateFields.blocked };
  }
  if (!candidateFields.fields) {
    return { blocked: { reason: 'invalid_current_control_provider_admission_candidate', task: candidate } };
  }
  const {
    studyId,
    actionType,
    workUnitId,
    workUnitFingerprint,
    nextOwner,
  } = candidateFields.fields;
  const contextResult = currentControlProviderAdmissionInputContext({
    candidate,
    output,
    fields: candidateFields.fields,
    currentControlRef,
  });
  if (contextResult.blocked) {
    return { blocked: contextResult.blocked };
  }
  if (!contextResult.context) {
    return { blocked: { reason: 'invalid_current_control_provider_admission_candidate', task: candidate } };
  }
  const {
    workspaceRoot,
    profileName,
    profileRef,
    dispatchAuthority,
    dispatchPath,
    dispatchRef,
    stagePacketRefs,
    stagePacketRef,
    routeIdentityKey,
    attemptIdempotencyKey,
    sourceFingerprint,
    obligationId,
    sourceRefs,
    currentnessBasis,
    currentControlCommand,
    transitionRuntimeResult,
    transitionRuntimeLogAppend,
    transitionRuntimeLogRef,
    transitionRuntimeLiveReadback,
    domainProgressTransitionApply,
  } = contextResult.context;
  const providerAdmissionIdentity = {
    ...candidate,
    current_control_command_outbox_record: currentControlCommand,
    current_control_command: currentControlCommand,
    domain_progress_transition_runtime: transitionRuntimeResult,
    ...(transitionRuntimeLogAppend
      ? { domain_progress_transition_log_append: transitionRuntimeLogAppend }
      : {}),
    ...(transitionRuntimeLogRef ? { domain_progress_transition_log_ref: transitionRuntimeLogRef } : {}),
    ...(transitionRuntimeLiveReadback
      ? {
        opl_domain_progress_transition_runtime_live_readback: transitionRuntimeLiveReadback,
        opl_domain_progress_transition_live_readback: transitionRuntimeLiveReadback,
      }
      : {}),
    opl_transition_event: transitionRuntimeResult.transition_event,
    opl_transition_outbox_item: transitionRuntimeResult.transactional_outbox_item,
    projection_metadata: transitionRuntimeResult.projection_metadata,
    read_model_rebuild_metadata: transitionRuntimeResult.read_model_rebuild_metadata,
    transition_idempotency_readback: transitionRuntimeResult.idempotency_readback,
    ...(domainProgressTransitionApply
      ? {
        domain_progress_transition_apply: domainProgressTransitionApply,
      }
      : {}),
  };
  const schemaSource = optionalString(candidate.provider_admission_schema_source);
  return {
    input: {
      domainId,
      taskKind: 'domain_owner/default-executor-dispatch',
      payload: {
        ...(profileRef ? { profile: profileRef } : {}),
        ...(profileName ? { profile_name: profileName } : {}),
        ...(workspaceRoot ? { workspace_root: workspaceRoot } : {}),
        study_id: studyId,
        quest_id: optionalString(candidate.quest_id) ?? studyId,
        action_type: actionType,
        work_unit_id: workUnitId,
        work_unit_fingerprint: workUnitFingerprint,
        action_fingerprint: optionalString(candidate.action_fingerprint) ?? workUnitFingerprint,
        source_fingerprint: sourceFingerprint,
        route_identity_key: routeIdentityKey,
        attempt_idempotency_key: attemptIdempotencyKey,
        dispatch_authority: dispatchAuthority,
        executor_kind: optionalString(candidate.executor_kind) ?? 'codex_cli_default',
        ...(dispatchRef ? { dispatch_ref: dispatchRef } : {}),
        ...(stagePacketRef ? { stage_packet_ref: stagePacketRef } : {}),
        ...(stagePacketRefs.length > 0 ? { checkpoint_refs: stagePacketRefs } : {}),
        ...(stagePacketRefs.length > 0 ? { stage_packet_refs: stagePacketRefs } : {}),
        ...(dispatchPath ? { dispatch_path: dispatchPath } : {}),
        ...(optionalString(candidate.execution_ref) ? { execution_ref: optionalString(candidate.execution_ref) } : {}),
        authority_boundary: 'mas_default_executor_dispatch_request_only',
        next_executable_owner: nextOwner,
        owner_route_current: true,
        provider_attempt_or_lease_required: candidate.provider_attempt_or_lease_required !== false,
        provider_completion_is_domain_completion: false,
        stage_transition_authority_boundary: candidate.stage_transition_authority_boundary,
        ...(obligationId ? { recovery_obligation_id: obligationId } : {}),
        ...(optionalString(candidate.provider_admission_schema_source)
          ? { provider_admission_schema_source: optionalString(candidate.provider_admission_schema_source) }
          : {}),
        ...(optionalString(candidate.required_output_surface)
          ? { required_output_surface: optionalString(candidate.required_output_surface) }
          : {}),
        ...(currentnessBasis ? { owner_route_currentness_basis: currentnessBasis } : {}),
        current_control_command_outbox_record: currentControlCommand,
        current_control_command: currentControlCommand,
        domain_progress_transition_runtime: transitionRuntimeResult,
        ...(transitionRuntimeLogAppend
          ? { domain_progress_transition_log_append: transitionRuntimeLogAppend }
          : {}),
        ...(transitionRuntimeLogRef ? { domain_progress_transition_log_ref: transitionRuntimeLogRef } : {}),
        ...(transitionRuntimeLiveReadback
          ? {
            opl_domain_progress_transition_runtime_live_readback: transitionRuntimeLiveReadback,
            opl_domain_progress_transition_live_readback: transitionRuntimeLiveReadback,
          }
          : {}),
        opl_transition_event: transitionRuntimeResult.transition_event,
        opl_transition_outbox_item: transitionRuntimeResult.transactional_outbox_item,
        projection_metadata: transitionRuntimeResult.projection_metadata,
        read_model_rebuild_metadata: transitionRuntimeResult.read_model_rebuild_metadata,
        transition_idempotency_readback: transitionRuntimeResult.idempotency_readback,
        ...(domainProgressTransitionApply
          ? {
            domain_progress_transition_apply: domainProgressTransitionApply,
          }
          : {}),
        source_refs: sourceRefs,
        ...(isRecord(candidate.source_refs) ? { provider_admission_source_refs: candidate.source_refs } : {}),
        provider_admission_identity: providerAdmissionIdentity,
        opl_domain_export_context: {
          command_source: exportContext.source,
          owner_fingerprint: exportContext.owner_fingerprint,
          command_cwd: exportContext.cwd,
        },
      },
      dedupeKey: providerAdmissionDedupeKey({
        candidate,
        routeIdentityKey,
        attemptIdempotencyKey,
        profileName,
        studyId,
        actionType,
        dispatchAuthority,
        sourceFingerprint,
      }),
      priority: Number.isInteger(candidate.priority) ? candidate.priority as number : 95,
      source: schemaSource === 'transition_request_pending_task'
        ? 'opl-current-control-transition-request'
        : 'opl-current-control-provider-admission',
      requiresApproval: false,
    },
  };
}

export function currentControlProviderAdmissionInputs(
  domainId: FamilyRuntimeDomainId,
  output: Record<string, unknown>,
  exportContext: CurrentControlProviderAdmissionExportContext,
  pendingInputs: EnqueueInput[] = [],
) {
  const currentControlRef = currentControlStatePath(output);
  if (!currentControlRef || !fs.existsSync(currentControlRef)) {
    return { inputs: [], blocked: [], current_control_readback_publications: [] };
  }
  const currentControl = readJsonRecord(currentControlRef);
  if (!currentControl) {
    return {
      inputs: [],
      blocked: [{ reason: 'invalid_current_control_state', task: { ref: currentControlRef } }],
      current_control_readback_publications: [],
    };
  }
  const candidates = currentControlProviderAdmissionCandidates(currentControl);
  const transitionReadbackCandidates: Record<string, unknown>[] = [];
  for (const input of pendingInputs) {
    const candidate = currentControlProviderAdmissionCandidateFromTransitionRequestTask(input);
    if (candidate) {
      mergeCurrentControlProviderAdmissionCandidates(candidates, candidate);
    }
    const transitionCandidate = currentControlTransitionPendingCandidateFromTask(input);
    if (transitionCandidate?.candidate) {
      transitionReadbackCandidates.push(transitionCandidate.candidate);
    }
  }
  const inputs: EnqueueInput[] = [];
  const blocked: CurrentControlProviderAdmissionBlocked[] = [];
  const currentControlReadbackPublications: CurrentControlTransitionReadbackPublication[] = [];
  for (const candidate of transitionReadbackCandidates) {
    const result = recordCurrentControlTransitionNonAdvancingApply({
      currentControl,
      candidate,
      output,
      currentControlRef,
    });
    if (result.publication) {
      currentControlReadbackPublications.push(result.publication);
      blocked.push({
        reason: 'current_control_transition_non_advancing_apply_recorded',
        task: candidate,
      });
    } else if (result.blocked) {
      blocked.push(result.blocked);
    }
  }
  for (const input of pendingInputs) {
    const transitionCandidate = currentControlTransitionPendingCandidateFromTask(input);
    if (transitionCandidate?.blocked) {
      blocked.push(transitionCandidate.blocked);
    }
  }
  for (const candidate of candidates) {
    if (!isRecord(candidate)) {
      blocked.push({ reason: 'invalid_current_control_provider_admission_candidate', task: candidate });
      continue;
    }
    const result = currentControlProviderAdmissionInputFrom(
      domainId,
      candidate,
      output,
      exportContext,
      currentControlRef,
    );
    if (result.input) {
      inputs.push(result.input);
    } else if (result.blocked) {
      blocked.push(result.blocked);
    }
  }
  return {
    inputs,
    blocked,
    current_control_readback_publications: currentControlReadbackPublications,
  };
}
