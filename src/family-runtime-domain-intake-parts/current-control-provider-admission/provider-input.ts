import type {
  EnqueueInput,
  FamilyRuntimeDomainId,
} from '../../family-runtime-command.ts';
import {
  appendDomainProgressTransitionRuntimeResult,
  appendDomainProgressTransitionRuntimeResultJsonl,
  buildDomainProgressTransitionRuntimeResult,
  createDomainProgressTransitionRuntimeLog,
  normalizeDomainProgressTransitionCommand,
  readDomainProgressTransitionRuntimeReadbackJsonl,
} from '../../family-runtime-domain-progress-transition-runtime.ts';
import { validCompleteTransitionRuntimeLiveReadback } from '../../family-runtime-domain-progress-transition-runtime-parts/live-readback-validation.ts';

import {
  type CurrentControlProviderAdmissionBlocked,
  type CurrentControlProviderAdmissionCandidateFields,
  type CurrentControlProviderAdmissionExportContext,
  type CurrentControlProviderAdmissionInputContext,
  currentControlStagePacketRefs,
  defaultExecutorDispatchRefByConvention,
  domainProgressTransitionApply,
  domainProgressTransitionRuntimeLogPath,
  exportProfileName,
  exportProfileRef,
  exportWorkspaceRoot,
  isRecord,
  optionalScalarString,
  optionalString,
  providerAdmissionDedupeKey,
  providerAdmissionSourceRefs,
  recoveryObligationId,
  validStageTransitionAuthorityBoundary,
  workspaceRelativeRef,
} from './shared.ts';

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
  if (optionalString(commandResult.record.transition_kind) !== 'StartProviderAttempt') {
    return {
      blocked: {
        reason: 'current_control_provider_admission_requires_start_provider_attempt',
        task: candidate,
      },
    };
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
  const completeReadbackCommand = currentControlCommandFromCompleteRuntimeReadback(candidate);
  const command = isRecord(candidate.current_control_command_outbox_record)
    ? candidate.current_control_command_outbox_record
    : completeReadbackCommand
      ?? (isRecord(candidate.opl_domain_progress_transition_request)
        ? candidate.opl_domain_progress_transition_request
        : null);
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
  const providerAdmissionIdentity = isRecord(candidate.provider_admission_identity)
    ? candidate.provider_admission_identity
    : null;
  const liveReadback = isRecord(candidate.opl_domain_progress_transition_runtime_live_readback)
    ? candidate.opl_domain_progress_transition_runtime_live_readback
    : isRecord(providerAdmissionIdentity?.opl_domain_progress_transition_runtime_live_readback)
      ? providerAdmissionIdentity.opl_domain_progress_transition_runtime_live_readback
      : null;
  if (!liveReadback) {
    return null;
  }
  if (!validCompleteTransitionRuntimeLiveReadback(liveReadback)) {
    return null;
  }
  if (!command || !runtimeResult || !runtimeCommand) {
    return commandFromCompleteRuntimeReadbackIdentity(candidate, liveReadback);
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

function commandFromCompleteRuntimeReadbackIdentity(
  candidate: Record<string, unknown>,
  liveReadback: Record<string, unknown>,
) {
  const identity = isRecord(liveReadback.identity) ? liveReadback.identity : null;
  const aggregateIdentity = isRecord(identity?.aggregate_identity) ? identity.aggregate_identity : null;
  const stageRunIdentity = isRecord(identity?.stage_run_identity) ? identity.stage_run_identity : null;
  const projectionMetadata = isRecord(liveReadback.projection_metadata) ? liveReadback.projection_metadata : null;
  const causality = isRecord(liveReadback.causality) ? liveReadback.causality : null;
  const outcome = isRecord(liveReadback.exactly_one_outcome) ? liveReadback.exactly_one_outcome : null;
  const outcomeKind = providerAdmissionOutcomeKind(liveReadback);
  const idempotencyKey = optionalString(identity?.idempotency_key)
    ?? optionalString(candidate.attempt_idempotency_key)
    ?? optionalString(candidate.idempotency_key);
  const routeIdentityKey = optionalString(stageRunIdentity?.route_identity_key)
    ?? optionalString(candidate.route_identity_key)
    ?? idempotencyKey;
  const attemptIdempotencyKey = optionalString(stageRunIdentity?.attempt_idempotency_key)
    ?? optionalString(candidate.attempt_idempotency_key)
    ?? idempotencyKey;
  const nextOwner = optionalString(candidate.next_executable_owner) ?? optionalString(candidate.owner);
  if (
    !identity
    || !aggregateIdentity
    || !stageRunIdentity
    || !idempotencyKey
    || !nextOwner
    || optionalString(identity.transition_kind) !== 'StartProviderAttempt'
    || !outcomeKind
    || !completeReadbackRepresentsProviderAdmission(liveReadback)
  ) {
    return null;
  }
  if (
    optionalString(candidate.attempt_idempotency_key)
    && optionalString(candidate.attempt_idempotency_key) !== attemptIdempotencyKey
  ) {
    return null;
  }
  if (
    optionalString(candidate.route_identity_key)
    && routeIdentityKey
    && optionalString(candidate.route_identity_key) !== routeIdentityKey
  ) {
    return null;
  }
  const sourceGeneration = optionalScalarString(causality?.source_generation)
    ?? optionalScalarString(stageRunIdentity.source_generation)
    ?? optionalScalarString(projectionMetadata?.observed_generation)
    ?? optionalScalarString(candidate.currentness_basis && isRecord(candidate.currentness_basis)
      ? candidate.currentness_basis.truth_epoch
      : null)
    ?? optionalString(candidate.source_fingerprint);
  const expectedVersion = optionalScalarString(causality?.expected_version)
    ?? optionalScalarString(projectionMetadata?.derived_generation)
    ?? sourceGeneration;
  const commandId = optionalString(identity.command_id);
  if (!commandId || !sourceGeneration || !expectedVersion) {
    return null;
  }
  return {
    surface_kind: 'opl_domain_progress_transition_command',
    runtime_kind: 'DomainProgressTransitionRuntime',
    transition_kind: 'StartProviderAttempt',
    command_id: commandId,
    aggregate_identity: aggregateIdentity,
    action_type: optionalString(candidate.action_type),
    work_unit_id: optionalString(candidate.work_unit_id) ?? optionalString(aggregateIdentity.work_unit_id),
    work_unit_fingerprint:
      optionalString(candidate.work_unit_fingerprint)
      ?? optionalString(candidate.action_fingerprint)
      ?? optionalString(aggregateIdentity.work_unit_fingerprint),
    next_owner: nextOwner,
    idempotency_key: idempotencyKey,
    route_identity_key: routeIdentityKey,
    attempt_idempotency_key: attemptIdempotencyKey,
    source_generation: sourceGeneration,
    expected_version: expectedVersion,
    stage_run_identity: stageRunIdentity,
    postcondition: {
      kind: 'provider_admission_enqueued_or_blocked',
      outcome_owner: 'one-person-lab',
      domain_state_owner: 'med-autoscience',
    },
    outcome: {
      kind: outcomeKind,
      non_advancing_apply: false,
      provider_completion_is_domain_completion: false,
      provider_completion_is_domain_ready: false,
    },
  };
}

function completeReadbackRepresentsProviderAdmission(liveReadback: Record<string, unknown>) {
  const identity = isRecord(liveReadback.identity) ? liveReadback.identity : null;
  const readModelReadback = isRecord(liveReadback.read_model_readback) ? liveReadback.read_model_readback : null;
  const latestOutboxIdentity = isRecord(readModelReadback?.latest_outbox_identity)
    ? readModelReadback.latest_outbox_identity
    : null;
  const latestTransactionReadback = isRecord(liveReadback.latest_transaction_readback)
    ? liveReadback.latest_transaction_readback
    : null;
  const outcomeKind = providerAdmissionOutcomeKind(liveReadback);
  const startProviderOutbox = latestOutboxIdentity
    ? optionalString(latestOutboxIdentity.outbox_kind) === 'start_provider_attempt'
    : latestTransactionReadback?.same_transaction_event_and_outbox === true
      && latestTransactionReadback.outbox_item_present === true;
  return optionalString(identity?.transition_kind) === 'StartProviderAttempt'
    && startProviderOutbox
    && (
      outcomeKind === 'provider_admission_enqueued_or_blocked'
      || outcomeKind === 'provider_admission_requested'
      || outcomeKind === 'provider_admission_accepted'
    );
}

function providerAdmissionOutcomeKind(liveReadback: Record<string, unknown>) {
  const identity = isRecord(liveReadback.identity) ? liveReadback.identity : null;
  const outcome = isRecord(liveReadback.exactly_one_outcome) ? liveReadback.exactly_one_outcome : null;
  const outcomeKind = optionalString(outcome?.outcome_kind)
    ?? optionalString(identity?.outcome_kind);
  return (
    outcomeKind === 'provider_admission_enqueued_or_blocked'
    || outcomeKind === 'provider_admission_requested'
    || outcomeKind === 'provider_admission_accepted'
  )
    ? outcomeKind
    : null;
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
      idempotencyKey: optionalString(input.fields.currentControlCommand.idempotency_key) ?? attemptIdempotencyKey,
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

export function currentControlProviderAdmissionInputFrom(
  domainId: FamilyRuntimeDomainId,
  candidate: Record<string, unknown>,
  output: Record<string, unknown>,
  exportContext: CurrentControlProviderAdmissionExportContext,
  currentControlRef: string,
): { input?: EnqueueInput; blocked?: CurrentControlProviderAdmissionBlocked } {
  if (domainId !== 'medautoscience') {
    return { blocked: { reason: 'unsupported_current_control_provider_admission_domain', task: candidate } };
  }
  if (
    optionalString(candidate.provider_admission_schema_source) === 'transition_request_pending_task'
    && optionalString(candidate.blocked_reason)
  ) {
    return {
      blocked: {
        reason: optionalString(candidate.blocked_reason)!,
        task: candidate,
      },
    };
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
  const transitionRequest = isRecord(candidate.opl_domain_progress_transition_request)
    ? candidate.opl_domain_progress_transition_request
    : null;
  const providerAdmissionIdentity = {
    ...candidate,
    ...(transitionRequest ? { opl_domain_progress_transition_request: transitionRequest } : {}),
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
        idempotency_key: optionalString(currentControlCommand.idempotency_key) ?? attemptIdempotencyKey,
        ...(optionalString(candidate.request_idempotency_key)
          ? { request_idempotency_key: optionalString(candidate.request_idempotency_key) }
          : {}),
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
        ...(transitionRequest ? { opl_domain_progress_transition_request: transitionRequest } : {}),
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
