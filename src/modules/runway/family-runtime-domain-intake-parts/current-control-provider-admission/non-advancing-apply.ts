import fs from 'node:fs';
import path from 'node:path';

import {
  appendDomainProgressTransitionRuntimeResultJsonl,
  buildNonAdvancingApplyRuntimeResult,
  normalizeDomainProgressTransitionCommand,
  readDomainProgressTransitionRuntimeReadbackJsonl,
} from '../../family-runtime-domain-progress-transition-runtime.ts';
import { validCompleteTransitionRuntimeLiveReadback } from '../../family-runtime-domain-progress-transition-runtime-parts/live-readback-validation.ts';

import {
  type CurrentControlProviderAdmissionBlocked,
  type CurrentControlProviderAdmissionCandidateFields,
  type CurrentControlTransitionReadbackResult,
  currentControlStagePacketRefs,
  domainProgressTransitionRuntimeLogPath,
  exportWorkspaceRoot,
  isRecord,
  optionalScalarString,
  optionalString,
  sameOptionalIdentity,
  stagePacketIdentityMatches,
  stringList,
  transitionReadbackSourceRefs,
  validStageTransitionAuthorityBoundary,
  workspaceRelativeRef,
} from './shared.ts';

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
  workspaceRoot: string | null;
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
      && sameOptionalIdentity(
        optionalString(input.candidate.route_identity_key),
        optionalString(rootAction.route_identity_key),
      )
      && sameOptionalIdentity(
        optionalString(input.candidate.attempt_idempotency_key),
        optionalString(rootAction.attempt_idempotency_key),
      )
      && stagePacketIdentityMatches({
        candidate: input.candidate,
        current: rootAction,
        workspaceRoot: input.workspaceRoot,
      })
    );
  const studyStatus = optionalString(studyAction.status);
  const actionMatchesStudy =
    sameOptionalIdentity(
      optionalString(input.candidate.route_identity_key),
      optionalString(studyAction.route_identity_key),
    )
    && sameOptionalIdentity(
      optionalString(input.candidate.attempt_idempotency_key),
      optionalString(studyAction.attempt_idempotency_key),
    )
    && stagePacketIdentityMatches({
      candidate: input.candidate,
      current: studyAction,
      workspaceRoot: input.workspaceRoot,
    });
  return actionMatchesRoot
    && actionMatchesStudy
    && (
      studyStatus === 'transition_request_pending'
      || studyAction.provider_admission_requires_opl_runtime_result === true
      || optionalString(input.candidate.dispatch_status) === 'transition_request_pending'
      || optionalString(input.candidate.blocked_reason) === 'opl_execution_authorization_required'
    );
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
    command_id: [
      'dptc',
      'non-advancing-apply',
      input.fields.studyId,
      input.fields.actionType,
      input.fields.workUnitId,
      input.attemptIdempotencyKey,
      sourceGeneration,
    ].join(':'),
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
      domain_progress_delta: false,
      paper_progress_delta: false,
    },
    authority_boundary: {
      opl_can_write_domain_truth: false,
      opl_can_write_mas_truth: false,
      opl_can_create_domain_owner_receipt: false,
      opl_can_create_domain_typed_blocker: false,
      provider_completion_is_domain_completion: false,
      provider_completion_is_domain_ready: false,
      non_advancing_apply_counts_as_domain_progress: false,
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
      domain_progress_delta: false,
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
    domain_progress_delta: false,
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
            domain_progress_delta: false,
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

export function recordCurrentControlTransitionNonAdvancingApply(input: {
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
  const workspaceRoot = exportWorkspaceRoot(input.output);
  if (!currentControlAllowsNonAdvancingTransitionReadback({
    currentControl: input.currentControl,
    candidate: input.candidate,
    workspaceRoot,
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
