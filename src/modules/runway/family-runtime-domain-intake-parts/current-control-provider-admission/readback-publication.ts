import fs from 'node:fs';
import path from 'node:path';

import { parseJsonText } from '../../../../kernel/json-file.ts';
import { validCompleteTransitionRuntimeLiveReadback } from '../../family-runtime-domain-progress-transition-runtime-parts/live-readback-validation.ts';

import {
  mergeProviderAdmissionCandidate,
  removeProviderAdmissionCandidate,
  transitionRequestPendingCountAfterAdmission,
} from './candidate-normalization.ts';
import {
  type CurrentControlExistingTaskRow,
  type CurrentControlProviderAdmissionReadbackPublishInput,
  type ExistingCurrentControlReadbackPublication,
  currentControlStatePath,
  isRecord,
  optionalString,
  readJsonRecord,
  stringList,
} from './shared.ts';

function transitionPendingCandidateIdentity(candidate: Record<string, unknown>) {
  const sourceRefs = isRecord(candidate.source_refs) ? candidate.source_refs : {};
  const policyResult = isRecord(candidate.paper_progress_policy_result) ? candidate.paper_progress_policy_result : {};
  const request = isRecord(candidate.opl_domain_progress_transition_request)
    ? candidate.opl_domain_progress_transition_request
    : isRecord(candidate.opl_runtime_carrier)
      ? candidate.opl_runtime_carrier
    : isRecord(policyResult.opl_domain_progress_transition_request)
      ? policyResult.opl_domain_progress_transition_request
      : isRecord(policyResult.opl_runtime_carrier)
        ? policyResult.opl_runtime_carrier
      : {};
  return {
    attemptIdempotencyKey:
      optionalString(candidate.attempt_idempotency_key)
      ?? optionalString(sourceRefs.attempt_idempotency_key)
      ?? optionalString(request.attempt_idempotency_key)
      ?? optionalString(request.idempotency_key),
    routeIdentityKey:
      optionalString(candidate.route_identity_key)
      ?? optionalString(sourceRefs.route_identity_key)
      ?? optionalString(request.route_identity_key)
      ?? optionalString(request.attempt_idempotency_key)
      ?? optionalString(request.idempotency_key),
    studyId:
      optionalString(candidate.study_id)
      ?? optionalString(sourceRefs.study_id)
      ?? optionalString(request.study_id),
    actionType:
      optionalString(candidate.action_type)
      ?? optionalString(sourceRefs.action_type)
      ?? optionalString(request.action_type),
    workUnitId:
      optionalString(candidate.work_unit_id)
      ?? optionalString(sourceRefs.work_unit_id)
      ?? optionalString(request.work_unit_id),
    workUnitFingerprint:
      optionalString(candidate.work_unit_fingerprint)
      ?? optionalString(candidate.action_fingerprint)
      ?? optionalString(sourceRefs.work_unit_fingerprint)
      ?? optionalString(request.work_unit_fingerprint)
      ?? (isRecord(request.aggregate_identity)
        ? optionalString(request.aggregate_identity.work_unit_fingerprint)
        : null),
  };
}

function transitionPendingCandidates(currentControl: Record<string, unknown>) {
  const candidates: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  const append = (value: unknown, allowedStatuses: Set<string>) => {
    if (!isRecord(value)) {
      return;
    }
    const status = optionalString(value.status);
    if (!status || !allowedStatuses.has(status)) {
      return;
    }
    const identity = transitionPendingCandidateIdentity(value);
    const key = identity.attemptIdempotencyKey
      ? `attempt:${identity.attemptIdempotencyKey}`
      : identity.routeIdentityKey
        ? `route:${identity.routeIdentityKey}`
        : [
          identity.studyId,
          identity.actionType,
          identity.workUnitId,
          identity.workUnitFingerprint,
        ].join('|');
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    candidates.push(value);
  };
  const transitionPendingStatuses = new Set(['transition_request_pending']);
  if (Array.isArray(currentControl.provider_admission_candidates)) {
    currentControl.provider_admission_candidates.forEach((candidate) =>
      append(candidate, transitionPendingStatuses)
    );
  }
  const currentAction = isRecord(currentControl.current_executable_owner_action)
    ? currentControl.current_executable_owner_action
    : null;
  append(currentAction, transitionPendingStatuses);
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
    append(study.current_control_action, transitionPendingStatuses);
    if (Array.isArray(study.provider_admission_candidates)) {
      study.provider_admission_candidates.forEach((candidate) =>
        append(candidate, transitionPendingStatuses)
      );
    }
  }
  return candidates;
}

function providerAdmissionCurrentCandidates(currentControl: Record<string, unknown>) {
  const candidates: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  const append = (value: unknown) => {
    if (!isRecord(value)) {
      return;
    }
    const status = optionalString(value.status);
    if (status !== 'transition_request_pending' && status !== 'provider_admission_pending') {
      return;
    }
    const identity = transitionPendingCandidateIdentity(value);
    const key = identity.attemptIdempotencyKey
      ? `attempt:${identity.attemptIdempotencyKey}`
      : identity.routeIdentityKey
        ? `route:${identity.routeIdentityKey}`
        : [
          identity.studyId,
          identity.actionType,
          identity.workUnitId,
          identity.workUnitFingerprint,
        ].join('|');
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    candidates.push(value);
  };
  if (Array.isArray(currentControl.provider_admission_candidates)) {
    currentControl.provider_admission_candidates.forEach(append);
  }
  const currentAction = isRecord(currentControl.current_executable_owner_action)
    ? currentControl.current_executable_owner_action
    : null;
  append(currentAction);
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
    append(study.current_control_action);
    if (Array.isArray(study.provider_admission_candidates)) {
      study.provider_admission_candidates.forEach(append);
    }
  }
  return candidates;
}

function runtimeReadbackFromPayload(payload: Record<string, unknown>) {
  const providerAdmissionIdentity = isRecord(payload.provider_admission_identity)
    ? payload.provider_admission_identity
    : {};
  return isRecord(payload.opl_domain_progress_transition_runtime_live_readback)
    ? payload.opl_domain_progress_transition_runtime_live_readback
    : isRecord(providerAdmissionIdentity.opl_domain_progress_transition_runtime_live_readback)
      ? providerAdmissionIdentity.opl_domain_progress_transition_runtime_live_readback
      : null;
}

function payloadMatchesTransitionPendingCandidate(
  payload: Record<string, unknown>,
  candidate: Record<string, unknown>,
) {
  const candidateIdentity = transitionPendingCandidateIdentity(candidate);
  const readback = runtimeReadbackFromPayload(payload);
  const readbackIdentity = isRecord(readback?.identity) ? readback.identity : {};
  const stageRunIdentity = isRecord(readbackIdentity.stage_run_identity)
    ? readbackIdentity.stage_run_identity
    : {};
  const payloadProviderAdmissionIdentity = isRecord(payload.provider_admission_identity)
    ? payload.provider_admission_identity
    : {};
  const payloadAttemptId =
    optionalString(payload.attempt_idempotency_key)
    ?? optionalString(payloadProviderAdmissionIdentity.attempt_idempotency_key)
    ?? optionalString(readbackIdentity.idempotency_key)
    ?? optionalString(stageRunIdentity.attempt_idempotency_key);
  const payloadRouteId =
    optionalString(payload.route_identity_key)
    ?? optionalString(payloadProviderAdmissionIdentity.route_identity_key)
    ?? optionalString(stageRunIdentity.route_identity_key)
    ?? payloadAttemptId;
  if (!candidateIdentity.attemptIdempotencyKey || payloadAttemptId !== candidateIdentity.attemptIdempotencyKey) {
    return false;
  }
  if (candidateIdentity.routeIdentityKey && payloadRouteId && payloadRouteId !== candidateIdentity.routeIdentityKey) {
    return false;
  }
  const aggregateIdentity = isRecord(readbackIdentity.aggregate_identity)
    ? readbackIdentity.aggregate_identity
    : {};
  const payloadStudyId = optionalString(payload.study_id) ?? optionalString(aggregateIdentity.study_id);
  const payloadActionType = optionalString(payload.action_type);
  const payloadWorkUnitId = optionalString(payload.work_unit_id) ?? optionalString(aggregateIdentity.work_unit_id);
  const payloadWorkUnitFingerprint =
    optionalString(payload.work_unit_fingerprint)
    ?? optionalString(payload.action_fingerprint)
    ?? optionalString(aggregateIdentity.work_unit_fingerprint);
  return (!candidateIdentity.studyId || payloadStudyId === candidateIdentity.studyId)
    && (!candidateIdentity.actionType || payloadActionType === candidateIdentity.actionType)
    && (!candidateIdentity.workUnitId || payloadWorkUnitId === candidateIdentity.workUnitId)
    && (!candidateIdentity.workUnitFingerprint || payloadWorkUnitFingerprint === candidateIdentity.workUnitFingerprint);
}

function parseExistingTaskPayload(row: CurrentControlExistingTaskRow) {
  try {
    const payload = parseJsonText(row.payload_json);
    return isRecord(payload) ? payload : null;
  } catch {
    return null;
  }
}

type CurrentControlExistingStageAttempt = {
  stage_attempt_id: string;
  status: string;
  closeout_receipt_status?: string | null;
  closeout_refs?: unknown;
  provider_run?: unknown;
  workspace_locator?: unknown;
  task_id?: string | null;
};

function terminalConsumedFromExistingStageAttempt(
  row: CurrentControlExistingTaskRow,
  stageAttemptsByTask?: Map<string, CurrentControlExistingStageAttempt[]>,
) {
  const taskId = optionalString(row.task_id);
  if (!taskId || !stageAttemptsByTask) {
    return null;
  }
  const attempts = stageAttemptsByTask.get(taskId) ?? [];
  const terminal = attempts.find((attempt) =>
    (attempt.status === 'completed' || attempt.status === 'succeeded')
    && attempt.closeout_receipt_status === 'accepted_typed_closeout'
  );
  if (!terminal) {
    return null;
  }
  const providerRun = isRecord(terminal.provider_run) ? terminal.provider_run : {};
  const workspaceLocator = isRecord(terminal.workspace_locator) ? terminal.workspace_locator : {};
  return {
    reason: 'terminal_stage_attempt_consumed_same_transition_identity',
    terminal_stage_attempt_id: optionalString(terminal.stage_attempt_id),
    terminal_stage_attempt_status: optionalString(terminal.status),
    terminal_provider_status: optionalString(providerRun.provider_status),
    closeout_refs: stringList(terminal.closeout_refs),
    currentness_identity: {
      task_id: taskId,
      stage_attempt_id: optionalString(terminal.stage_attempt_id),
      study_id: optionalString(workspaceLocator.study_id),
      action_type: optionalString(workspaceLocator.action_type),
      work_unit_id: optionalString(workspaceLocator.work_unit_id),
      work_unit_fingerprint:
        optionalString(workspaceLocator.work_unit_fingerprint)
        ?? optionalString(workspaceLocator.domain_source_fingerprint),
      route_identity_key:
        optionalString(workspaceLocator.route_identity_key)
        ?? optionalString(workspaceLocator.attempt_idempotency_key),
      attempt_idempotency_key: optionalString(workspaceLocator.attempt_idempotency_key),
    },
  };
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

export function publishExistingCurrentControlProviderAdmissionReadbacks(input: {
  output: Record<string, unknown>;
  existingTasks: CurrentControlExistingTaskRow[];
  stageAttemptsByTask?: Map<string, CurrentControlExistingStageAttempt[]>;
}) {
  const currentControlRef = currentControlStatePath(input.output);
  if (!currentControlRef || !fs.existsSync(currentControlRef)) {
    return [];
  }
  const currentControl = readJsonRecord(currentControlRef);
  if (!currentControl) {
    return [];
  }
  const candidates = providerAdmissionCurrentCandidates(currentControl);
  if (candidates.length === 0) {
    return [];
  }
  const publications: ExistingCurrentControlReadbackPublication[] = [];
  const terminalStatuses = new Set(['succeeded', 'completed']);
  for (const candidate of candidates) {
    for (const row of input.existingTasks) {
      if (
        row.domain_id !== 'medautoscience'
        || row.task_kind !== 'domain_owner/default-executor-dispatch'
        || !terminalStatuses.has(row.status)
      ) {
        continue;
      }
      const payload = parseExistingTaskPayload(row);
      const liveReadback = payload ? runtimeReadbackFromPayload(payload) : null;
      if (
        !payload
        || !liveReadback
        || !validCompleteTransitionRuntimeLiveReadback(liveReadback)
        || !payloadMatchesTransitionPendingCandidate(payload, candidate)
      ) {
        continue;
      }
      const published = publishCurrentControlProviderAdmissionReadback({
        output: input.output,
        taskInput: {
          domainId: 'medautoscience',
          taskKind: 'domain_owner/default-executor-dispatch',
          payload,
          dedupeKey: row.dedupe_key ?? undefined,
          priority: row.priority ?? undefined,
          source: row.source ?? 'opl-existing-current-control-readback',
          requiresApproval: false,
        },
        taskResult: {
          accepted: false,
          idempotent_noop: true,
          ...(terminalConsumedFromExistingStageAttempt(row, input.stageAttemptsByTask)
            ? {
              current_control_provider_admission_consumed:
                terminalConsumedFromExistingStageAttempt(row, input.stageAttemptsByTask)!,
            }
            : {}),
          task: {
            domain_id: 'medautoscience',
            task_kind: 'domain_owner/default-executor-dispatch',
            payload,
            dedupe_key: row.dedupe_key,
            status: row.status,
          } as never,
        },
      });
      if (published.published && 'ref' in published) {
        publications.push({
          published: true,
          ref: published.ref,
          idempotency_key: 'idempotency_key' in published
            ? published.idempotency_key
            : optionalString(payload.attempt_idempotency_key),
          study_id: 'study_id' in published
            ? published.study_id
            : optionalString(payload.study_id),
          status: 'status' in published
            ? published.status as string
            : 'provider_admission_pending',
          source: 'existing_terminal_queue_readback',
        });
      }
    }
  }
  return publications;
}
