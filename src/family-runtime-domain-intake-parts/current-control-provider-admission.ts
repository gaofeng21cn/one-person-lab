import fs from 'node:fs';
import path from 'node:path';

import type {
  EnqueueInput,
  FamilyRuntimeDomainId,
} from '../family-runtime-command.ts';
import {
  appendDomainProgressTransitionRuntimeResult,
  appendDomainProgressTransitionRuntimeResultJsonl,
  buildDomainProgressTransitionRuntimeResult,
  createDomainProgressTransitionRuntimeLog,
  normalizeDomainProgressTransitionCommand,
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
  domainProgressTransitionApply: Record<string, unknown> | null;
};

type CurrentControlProviderAdmissionBlocked = {
  reason: string;
  task: unknown;
  repair_action?: Record<string, unknown>;
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
      : null;
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
    domainProgressTransitionApply,
  } = contextResult.context;
  const providerAdmissionIdentity = {
    ...candidate,
    current_control_command: currentControlCommand,
    domain_progress_transition_runtime: transitionRuntimeResult,
    ...(transitionRuntimeLogAppend
      ? { domain_progress_transition_log_append: transitionRuntimeLogAppend }
      : {}),
    ...(transitionRuntimeLogRef ? { domain_progress_transition_log_ref: transitionRuntimeLogRef } : {}),
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
        current_control_command: currentControlCommand,
        domain_progress_transition_runtime: transitionRuntimeResult,
        ...(transitionRuntimeLogAppend
          ? { domain_progress_transition_log_append: transitionRuntimeLogAppend }
          : {}),
        ...(transitionRuntimeLogRef ? { domain_progress_transition_log_ref: transitionRuntimeLogRef } : {}),
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
    return { inputs: [], blocked: [] };
  }
  const currentControl = readJsonRecord(currentControlRef);
  if (!currentControl) {
    return {
      inputs: [],
      blocked: [{ reason: 'invalid_current_control_state', task: { ref: currentControlRef } }],
    };
  }
  const candidates = [
    ...currentControlProviderAdmissionCandidates(currentControl),
    ...pendingInputs
      .map(currentControlProviderAdmissionCandidateFromTransitionRequestTask)
      .filter((candidate): candidate is Record<string, unknown> => Boolean(candidate)),
  ];
  const inputs: EnqueueInput[] = [];
  const blocked: CurrentControlProviderAdmissionBlocked[] = [];
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
  return { inputs, blocked };
}
