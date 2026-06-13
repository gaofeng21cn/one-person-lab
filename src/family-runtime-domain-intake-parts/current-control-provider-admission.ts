import fs from 'node:fs';
import path from 'node:path';

import type {
  EnqueueInput,
  FamilyRuntimeDomainId,
} from '../family-runtime-command.ts';

export type CurrentControlProviderAdmissionExportContext = {
  cwd: string;
  source: string;
  owner_fingerprint: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
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

function readJsonRecord(filePath: string) {
  try {
    const payload = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
    return isRecord(payload) ? payload : null;
  } catch {
    return null;
  }
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
  dispatchRef: string | null;
}) {
  return uniqueStrings([
    workspaceRelativeRef(optionalString(input.candidate.stage_packet_ref), input.workspaceRoot),
    ...stringList(input.candidate.stage_packet_refs).map((ref) => workspaceRelativeRef(ref, input.workspaceRoot)),
    ...stringList(input.candidate.checkpoint_refs).map((ref) => workspaceRelativeRef(ref, input.workspaceRoot)),
    input.dispatchRef,
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
  profileName: string | null;
  studyId: string;
  actionType: string;
  dispatchAuthority: string;
  sourceFingerprint: string;
}) {
  return optionalString(input.candidate.idempotency_key)
    ?? optionalString(input.candidate.dedupe_key)
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
    work_unit_id: optionalString(basis.work_unit_id) ?? input.workUnitId,
    work_unit_fingerprint: optionalString(basis.work_unit_fingerprint) ?? input.workUnitFingerprint,
    truth_epoch: optionalString(input.ownerRoute?.truth_epoch) ?? optionalString(basis.truth_epoch),
    runtime_health_epoch:
      optionalString(input.ownerRoute?.runtime_health_epoch) ?? optionalString(basis.runtime_health_epoch),
    source_eval_id: optionalString(basis.source_eval_id),
    ...(digestBasis ? { currentness_digest_basis: digestBasis } : {}),
  };
}

function currentControlProviderAdmissionCandidateFromActionQueueItem(
  currentControl: Record<string, unknown>,
  action: Record<string, unknown>,
) {
  const handoff = isRecord(action.handoff_packet) ? action.handoff_packet : {};
  const ownerRoute = isRecord(handoff.owner_route)
    ? handoff.owner_route
    : isRecord(action.owner_route)
      ? action.owner_route
      : null;
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
  if (
    protocol?.dispatchable !== true
    || !oplOwns.includes('queue')
    || !oplOwns.includes('attempt')
    || completionBoundary?.provider_completion_is_domain_ready !== false
    || runtimeCompletionGuard?.provider_completion_is_domain_completion !== false
  ) {
    return null;
  }
  const studyId = optionalString(action.study_id) ?? optionalString(handoff.study_id) ?? optionalString(ownerRoute?.study_id);
  const actionType = optionalString(action.action_type) ?? optionalString(handoff.action_type);
  const workUnitId = optionalString(action.controller_work_unit_id)
    ?? optionalString(action.executable_work_unit)
    ?? optionalString(action.next_work_unit)
    ?? optionalString(isRecord(ownerRoute?.currentness_contract)
      && isRecord(ownerRoute.currentness_contract.basis)
      ? ownerRoute.currentness_contract.basis.work_unit_id
      : null);
  const workUnitFingerprint = optionalString(action.work_unit_fingerprint)
    ?? optionalString(ownerRoute?.work_unit_fingerprint)
    ?? optionalString(isRecord(ownerRoute?.currentness_contract)
      && isRecord(ownerRoute.currentness_contract.basis)
      ? ownerRoute.currentness_contract.basis.work_unit_fingerprint
      : null)
    ?? optionalString(action.action_fingerprint);
  const nextOwner = optionalString(handoff.next_executable_owner)
    ?? optionalString(handoff.owner)
    ?? optionalString(action.owner)
    ?? optionalString(action.recommended_owner)
    ?? optionalString(ownerRoute?.next_owner);
  if (!studyId || !actionType || !workUnitId || !workUnitFingerprint || !nextOwner) {
    return null;
  }
  const actionFingerprint = optionalString(action.action_fingerprint) ?? workUnitFingerprint;
  const sourceFingerprint = optionalString(action.source_fingerprint)
    ?? optionalString(ownerRoute?.source_fingerprint)
    ?? actionFingerprint;
  const obligationId = recoveryObligationId(action)
    ?? recoveryObligationId(handoff)
    ?? recoveryObligationId(ownerRoute);
  return {
    ...action,
    status: 'provider_admission_pending',
    owner_route_current: true,
    study_id: studyId,
    quest_id: optionalString(handoff.quest_id) ?? optionalString(ownerRoute?.quest_id) ?? studyId,
    action_type: actionType,
    work_unit_id: workUnitId,
    work_unit_fingerprint: workUnitFingerprint,
    action_fingerprint: actionFingerprint,
    source_fingerprint: sourceFingerprint,
    dispatch_authority: optionalString(action.dispatch_authority) ?? 'opl_current_control_state_handoff',
    next_executable_owner: nextOwner,
    provider_attempt_or_lease_required: true,
    provider_completion_is_domain_completion: false,
    stage_transition_authority_boundary: providerObservationBoundaryFromCurrentControl(),
    ...(obligationId ? { recovery_obligation_id: obligationId } : {}),
    required_output_surface: optionalString(action.required_output_surface),
    idempotency_key: optionalString(handoff.idempotency_key) ?? optionalString(ownerRoute?.idempotency_key),
    currentness_basis: currentControlCurrentnessBasis({
      currentControl,
      action,
      ownerRoute,
      workUnitId,
      workUnitFingerprint,
    }),
    provider_admission_schema_source: 'action_queue',
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

function currentControlProviderAdmissionInputFrom(
  domainId: FamilyRuntimeDomainId,
  candidate: Record<string, unknown>,
  output: Record<string, unknown>,
  exportContext: CurrentControlProviderAdmissionExportContext,
  currentControlRef: string,
): { input?: EnqueueInput; blocked?: { reason: string; task: unknown } } {
  if (domainId !== 'medautoscience') {
    return { blocked: { reason: 'unsupported_current_control_provider_admission_domain', task: candidate } };
  }
  if (optionalString(candidate.status) !== 'provider_admission_pending' || candidate.owner_route_current !== true) {
    return {};
  }
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
  const workspaceRoot = exportWorkspaceRoot(output);
  const profileName = exportProfileName(output);
  const profileRef = exportProfileRef(output);
  const dispatchAuthority = optionalString(candidate.dispatch_authority)
    ?? 'consumer_default_executor_dispatch';
  const dispatchPath = optionalString(candidate.dispatch_path);
  const dispatchRef = optionalString(candidate.dispatch_ref)
    ?? workspaceRelativeRef(dispatchPath, workspaceRoot)
    ?? defaultExecutorDispatchRefByConvention({ workspaceRoot, studyId, actionType });
  const stagePacketRefs = currentControlStagePacketRefs({
    candidate,
    workspaceRoot,
    dispatchRef,
  });
  const stagePacketRef = stagePacketRefs[0] ?? null;
  if (!stagePacketRef && (optionalString(candidate.executor_kind) ?? 'codex_cli_default') === 'codex_cli_default') {
    return {
      blocked: {
        reason: 'current_control_provider_admission_stage_packet_ref_missing',
        task: candidate,
      },
    };
  }
  const sourceFingerprint = optionalString(candidate.source_fingerprint)
    ?? optionalString(candidate.action_fingerprint)
    ?? workUnitFingerprint;
  const obligationId = recoveryObligationId(candidate);
  const sourceRefs = providerAdmissionSourceRefs({
    candidate,
    currentControlRef,
    workspaceRoot,
    dispatchRef,
  });
  const currentnessBasis = isRecord(candidate.currentness_basis) ? candidate.currentness_basis : null;
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
        source_refs: sourceRefs,
        ...(isRecord(candidate.source_refs) ? { provider_admission_source_refs: candidate.source_refs } : {}),
        provider_admission_identity: candidate,
        opl_domain_export_context: {
          command_source: exportContext.source,
          owner_fingerprint: exportContext.owner_fingerprint,
          command_cwd: exportContext.cwd,
        },
      },
      dedupeKey: providerAdmissionDedupeKey({
        candidate,
        profileName,
        studyId,
        actionType,
        dispatchAuthority,
        sourceFingerprint,
      }),
      priority: Number.isInteger(candidate.priority) ? candidate.priority as number : 95,
      source: 'opl-current-control-provider-admission',
      requiresApproval: false,
    },
  };
}

export function currentControlProviderAdmissionInputs(
  domainId: FamilyRuntimeDomainId,
  output: Record<string, unknown>,
  exportContext: CurrentControlProviderAdmissionExportContext,
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
  const candidates = currentControlProviderAdmissionCandidates(currentControl);
  const inputs: EnqueueInput[] = [];
  const blocked: Array<{ reason: string; task: unknown }> = [];
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
