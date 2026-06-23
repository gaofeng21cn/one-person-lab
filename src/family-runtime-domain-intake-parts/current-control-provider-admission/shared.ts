import fs from 'node:fs';
import path from 'node:path';

import type { EnqueueInput } from '../../family-runtime-command.ts';

export type CurrentControlProviderAdmissionExportContext = {
  cwd: string;
  source: string;
  owner_fingerprint: string;
};

export type CurrentControlProviderAdmissionCandidateFields = {
  studyId: string;
  actionType: string;
  workUnitId: string;
  workUnitFingerprint: string;
  nextOwner: string;
  currentControlCommand: Record<string, unknown>;
  transitionRuntimeResult: Record<string, unknown>;
};

export type CurrentControlProviderAdmissionActionQueueContext = {
  handoff: Record<string, unknown>;
  ownerRoute: Record<string, unknown> | null;
};

export type CurrentControlProviderAdmissionActionQueueIdentity = {
  actionFingerprint: string;
  sourceFingerprint: string;
  obligationId: string | null;
  routeIdentityKey: string | null;
  attemptIdempotencyKey: string | null;
};

export type CurrentControlProviderAdmissionInputContext = {
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

export type CurrentControlProviderAdmissionBlocked = {
  reason: string;
  task: unknown;
  repair_action?: Record<string, unknown>;
};

export type CurrentControlTransitionReadbackPublication = {
  published: boolean;
  status: 'transition_non_advancing_apply_recorded';
  ref: string;
  study_id: string | null;
  action_type: string | null;
  work_unit_id: string | null;
  idempotency_key: string | null;
  runtime_readback_status: string | null;
};

export type CurrentControlTransitionReadbackResult = {
  publication?: CurrentControlTransitionReadbackPublication;
  blocked?: CurrentControlProviderAdmissionBlocked;
};

export type CurrentControlProviderAdmissionReadbackPublishInput = {
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

export type CurrentControlExistingTaskRow = {
  task_id?: string;
  domain_id: string;
  task_kind: string;
  payload_json: string;
  dedupe_key: string | null;
  status: string;
  priority?: number | null;
  source?: string | null;
};

export type ExistingCurrentControlReadbackPublication = {
  published: true;
  ref: string;
  idempotency_key: string | null;
  study_id: string | null;
  status: string;
  source: 'existing_terminal_queue_readback';
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function optionalScalarString(value: unknown) {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

export function recoveryObligationId(value: Record<string, unknown> | null | undefined) {
  return optionalString(value?.recovery_obligation_id)
    ?? optionalString(value?.paper_recovery_obligation_id);
}

export function stringList(value: unknown) {
  return Array.isArray(value)
    ? value
        .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
        .map((entry) => entry.trim())
    : [];
}

export function uniqueStrings(values: Array<string | null>) {
  return [...new Set(values.filter((entry): entry is string => Boolean(entry)))];
}

export function exportProfileRef(output: Record<string, unknown>) {
  const profile = isRecord(output.profile) ? output.profile : null;
  return optionalString(profile?.profile_ref);
}

export function exportProfileName(output: Record<string, unknown>) {
  const profile = isRecord(output.profile) ? output.profile : null;
  return optionalString(profile?.profile_name);
}

export function exportWorkspaceRoot(output: Record<string, unknown>) {
  const workspace = isRecord(output.workspace) ? output.workspace : null;
  return optionalString(workspace?.workspace_root);
}

export function currentControlStatePath(output: Record<string, unknown>) {
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

export function domainProgressTransitionRuntimeLogPath(workspaceRoot: string | null) {
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

export function readJsonRecord(filePath: string) {
  try {
    const payload = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
    return isRecord(payload) ? payload : null;
  } catch {
    return null;
  }
}

export function domainProgressTransitionApply(value: Record<string, unknown>) {
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

export function workspaceRelativeRef(value: string | null, workspaceRoot: string | null) {
  if (!value || !workspaceRoot || !path.isAbsolute(value)) {
    return value;
  }
  const relative = path.relative(workspaceRoot, value);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    return value;
  }
  return relative.split(path.sep).join('/');
}

export function currentControlStagePacketRefs(input: {
  candidate: Record<string, unknown>;
  workspaceRoot: string | null;
}) {
  return uniqueStrings([
    workspaceRelativeRef(optionalString(input.candidate.stage_packet_ref), input.workspaceRoot),
    ...stringList(input.candidate.stage_packet_refs).map((ref) => workspaceRelativeRef(ref, input.workspaceRoot)),
    ...stringList(input.candidate.checkpoint_refs).map((ref) => workspaceRelativeRef(ref, input.workspaceRoot)),
  ]);
}

export function recordStagePacketRefs(value: Record<string, unknown> | null, workspaceRoot: string | null) {
  if (!value) {
    return [];
  }
  return uniqueStrings([
    workspaceRelativeRef(optionalString(value.stage_packet_ref), workspaceRoot),
    ...stringList(value.stage_packet_refs).map((ref) => workspaceRelativeRef(ref, workspaceRoot)),
    ...stringList(value.checkpoint_refs).map((ref) => workspaceRelativeRef(ref, workspaceRoot)),
  ]);
}

export function sameOptionalIdentity(candidateValue: string | null, currentValue: string | null) {
  return !currentValue || Boolean(candidateValue && candidateValue === currentValue);
}

export function stagePacketIdentityMatches(input: {
  candidate: Record<string, unknown>;
  current: Record<string, unknown> | null;
  workspaceRoot: string | null;
}) {
  const currentStagePacketRefs = recordStagePacketRefs(input.current, input.workspaceRoot);
  if (currentStagePacketRefs.length === 0) {
    return true;
  }
  const candidateStagePacketRefs = currentControlStagePacketRefs({
    candidate: input.candidate,
    workspaceRoot: input.workspaceRoot,
  });
  return currentStagePacketRefs.some((ref) => candidateStagePacketRefs.includes(ref));
}

export function defaultExecutorDispatchRefByConvention(input: {
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

export function providerAdmissionSourceRefs(input: {
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

export function transitionReadbackSourceRefs(input: {
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

export function providerAdmissionDedupeKey(input: {
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

export function validStageTransitionAuthorityBoundary(value: unknown) {
  if (!isRecord(value)) {
    return false;
  }
  if (optionalString(value.surface_kind) === 'mas_domain_progress_transition_request_boundary') {
    return optionalString(value.target_runtime_owner) === 'one-person-lab'
      && optionalString(value.target_runtime_kind) === 'DomainProgressTransitionRuntime'
      && optionalString(value.authority_role) === 'domain_policy_request_only'
      && value.mas_can_create_opl_outbox_record === false
      && value.mas_can_create_opl_event === false
      && value.mas_can_create_opl_stage_run === false
      && value.mas_can_authorize_provider_admission === false
      && value.mas_can_mark_provider_attempt_running === false
      && value.provider_completion_is_domain_completion === false;
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

export function providerObservationBoundaryFromCurrentControl() {
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

export function currentControlCurrentnessBasis(input: {
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
