import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { getActiveWorkspaceBinding } from './workspace-registry.ts';
import {
  FAMILY_RUNTIME_DOMAIN_IDS,
  type EnqueueInput,
  type FamilyRuntimeDomainProfiles,
  type FamilyRuntimeTaskScope,
  type FamilyRuntimeDomainId,
} from './family-runtime-command.ts';
import {
  familyRuntimePaths,
  insertEvent,
  type taskToPayload,
} from './family-runtime-store.ts';
import {
  runFamilyRuntimeDomainHandlerCommand,
  domainHandlerResultErrorMessage,
} from './family-runtime-domain-handler-process.ts';
import { resolveOplModuleExecCommand } from './system-installation/modules.ts';
import { payloadMatchesTaskScope } from './family-runtime-task-scope.ts';

type DomainExportCommand = {
  argv: string[];
  cwd: string;
  source: 'env_override' | 'module_exec_profile' | 'workspace_binding';
  owner_fingerprint: string;
};

type EnqueueTaskResult = {
  accepted?: boolean;
  requeued_from_terminal?: boolean;
  idempotent_noop?: boolean;
  task?: ReturnType<typeof taskToPayload>;
};

type EnqueueTask = (db: DatabaseSync, input: EnqueueInput) => EnqueueTaskResult;

function masProductionProofArgs(paths?: ReturnType<typeof familyRuntimePaths>) {
  const proofPath = process.env.OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_OPL_PRODUCTION_PROOF?.trim()
    || process.env.OPL_FAMILY_RUNTIME_OPL_PRODUCTION_PROOF?.trim()
    || (
      paths && fs.existsSync(paths.latest_temporal_production_proof)
        ? paths.latest_temporal_production_proof
        : ''
    );
  return proofPath ? ['--opl-production-proof', proofPath] : [];
}

function exportCommandForDomain(
  domainId: FamilyRuntimeDomainId,
  paths?: ReturnType<typeof familyRuntimePaths>,
  domainProfiles?: FamilyRuntimeDomainProfiles,
): DomainExportCommand | null {
  const override = process.env[`OPL_FAMILY_RUNTIME_${domainId.toUpperCase()}_EXPORT`]?.trim();
  if (override) {
    return {
      argv: override.split(/\s+/),
      cwd: process.cwd(),
      source: 'env_override',
      owner_fingerprint: `env_override:${override}`,
    };
  }
  if (domainId === 'medautoscience') {
    const profile = domainProfiles?.medautoscience?.trim()
      || process.env.OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_PROFILE?.trim();
    if (profile) {
      const command = resolveOplModuleExecCommand('medautoscience', [
        'domain-handler',
        'export',
        '--profile',
        profile,
        ...masProductionProofArgs(paths),
        '--format',
        'json',
      ]);
      return {
        argv: command.command_preview,
        cwd: command.working_directory,
        source: 'module_exec_profile',
        owner_fingerprint: [
          'module_exec_profile',
          profile,
          command.module_id,
          command.module.install_origin,
          command.module.git?.head_sha ?? 'unknown-head',
          command.working_directory,
        ].join(':'),
      };
    }

    const binding = getActiveWorkspaceBinding('medautoscience');
    const workspaceLocator = binding?.direct_entry.workspace_locator;
    const profileRef = workspaceLocator?.surface_kind === 'med_autoscience_workspace_profile'
      ? workspaceLocator.profile_ref
      : null;
    if (binding && profileRef) {
      return {
        argv: [
          'uv',
          'run',
          'python',
          '-m',
          'med_autoscience.cli',
          'domain-handler',
          'export',
          '--profile',
          profileRef,
          ...masProductionProofArgs(paths),
          '--format',
          'json',
        ],
        cwd: binding.workspace_path,
        source: 'workspace_binding',
        owner_fingerprint: [
          'workspace_binding',
          binding.workspace_path,
          profileRef,
        ].join(':'),
      };
    }
  }
  return null;
}

function parseDispatchOutput(stdout: string) {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return {};
  }
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return { raw_stdout: trimmed };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFamilyRuntimeDomainId(value: string): value is FamilyRuntimeDomainId {
  return FAMILY_RUNTIME_DOMAIN_IDS.includes(value as FamilyRuntimeDomainId);
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function canonicalFamilyRuntimeDomainId(value: unknown): FamilyRuntimeDomainId | null {
  const raw = optionalString(value);
  if (!raw) {
    return null;
  }
  const normalized = raw.toLowerCase();
  const aliases: Record<string, FamilyRuntimeDomainId> = {
    mas: 'medautoscience',
    'med-autoscience': 'medautoscience',
    med_autoscience: 'medautoscience',
    medautoscience: 'medautoscience',
    mag: 'medautogrant',
    'med-auto-grant': 'medautogrant',
    'med-autogrant': 'medautogrant',
    med_auto_grant: 'medautogrant',
    med_autogrant: 'medautogrant',
    medautogrant: 'medautogrant',
    rca: 'redcube',
    redcube: 'redcube',
    'redcube-ai': 'redcube',
    redcube_ai: 'redcube',
    oma: 'opl-meta-agent',
    oplmetaagent: 'opl-meta-agent',
    'opl-meta-agent': 'opl-meta-agent',
    opl_meta_agent: 'opl-meta-agent',
  };
  return aliases[normalized] ?? null;
}

function taskPayloadFrom(item: Record<string, unknown>) {
  return isRecord(item.payload) ? item.payload : {};
}

function inputMatchesTaskScope(input: EnqueueInput, taskScope?: FamilyRuntimeTaskScope) {
  if (!taskScope) {
    return true;
  }
  if (taskScope.domainId && input.domainId !== taskScope.domainId) {
    return false;
  }
  if (taskScope.taskKind && input.taskKind !== taskScope.taskKind) {
    return false;
  }
  return payloadMatchesTaskScope(input.payload, taskScope);
}

function taskPayloadBlockedByForbiddenWrite(payload: Record<string, unknown>) {
  return payload.domain_truth_write === true || payload.artifact_gate_override === true;
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

function explicitRefFromRecord(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }
  for (const key of ['ref', 'route_ref', 'owner_route_ref', 'handoff_ref']) {
    const ref = optionalString(value[key]);
    if (ref) {
      return ref;
    }
  }
  return null;
}

function ownerRouteRefsFrom(item: Record<string, unknown>) {
  return [...new Set([
    ...stringList(item.owner_route_refs),
    optionalString(item.owner_route_ref),
    explicitRefFromRecord(item.owner_route),
  ].filter((entry): entry is string => Boolean(entry)))];
}

function handoffPayloadFrom(item: Record<string, unknown>) {
  const handoff = isRecord(item.opl_runtime_owner_route_handoff)
    ? item.opl_runtime_owner_route_handoff
    : isRecord(item.owner_route_handoff)
      ? item.owner_route_handoff
      : null;
  if (!handoff) {
    return {};
  }
  return {
    opl_runtime_owner_route_handoff: handoff,
  };
}

function domainDispatchEvidencePayloadFrom(item: Record<string, unknown>) {
  return isRecord(item.domain_dispatch_evidence_record_payload)
    ? { domain_dispatch_evidence_record_payload: item.domain_dispatch_evidence_record_payload }
    : {};
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
  exportContext: DomainExportCommand,
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
    ?? workspaceRelativeRef(dispatchPath, workspaceRoot);
  const stagePacketRefs = currentControlStagePacketRefs({
    candidate,
    workspaceRoot,
    dispatchRef,
  });
  const stagePacketRef = stagePacketRefs[0] ?? null;
  const sourceFingerprint = optionalString(candidate.source_fingerprint)
    ?? optionalString(candidate.action_fingerprint)
    ?? workUnitFingerprint;
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

function currentControlProviderAdmissionInputs(
  domainId: FamilyRuntimeDomainId,
  output: Record<string, unknown>,
  exportContext: DomainExportCommand,
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

function currentControlAdmissionStudyIds(inputs: EnqueueInput[]) {
  return new Set(inputs
    .map((input) => optionalString(input.payload.study_id))
    .filter((studyId): studyId is string => Boolean(studyId)));
}

function suppressStaleDefaultExecutorInputs(inputs: EnqueueInput[], currentAdmissionInputs: EnqueueInput[]) {
  const currentStudyIds = currentControlAdmissionStudyIds(currentAdmissionInputs);
  if (currentStudyIds.size === 0) {
    return { inputs, suppressed_count: 0 };
  }
  const retained = inputs.filter((input) => {
    const studyId = optionalString(input.payload.study_id);
    return !(
      input.domainId === 'medautoscience'
      && input.taskKind === 'domain_owner/default-executor-dispatch'
      && studyId !== null
      && currentStudyIds.has(studyId)
    );
  });
  return {
    inputs: retained,
    suppressed_count: inputs.length - retained.length,
  };
}

function pendingTaskInputFrom(
  domainId: FamilyRuntimeDomainId,
  item: Record<string, unknown>,
  source: string,
  exportContext: DomainExportCommand,
): { input?: EnqueueInput; blocked?: { reason: string; task: unknown } } {
  const declaredDomain = typeof item.domain_id === 'string' ? item.domain_id : domainId;
  const exportedDomain = canonicalFamilyRuntimeDomainId(declaredDomain);
  const taskKind = optionalString(item.task_kind) ?? optionalString(item.recommended_task_kind) ?? '';
  const payload = taskPayloadFrom(item);
  if (!exportedDomain || !isFamilyRuntimeDomainId(exportedDomain) || !taskKind) {
    return { blocked: { reason: 'invalid_domain_or_task_kind', task: item } };
  }
  if (taskPayloadBlockedByForbiddenWrite(payload)) {
    return { blocked: { reason: 'domain_forbidden_write', task: item } };
  }
  const ownerRouteRefs = ownerRouteRefsFrom(item);
  return {
    input: {
      domainId: exportedDomain,
      taskKind,
      payload: {
        ...payload,
        ...(typeof item.source_fingerprint === 'string' ? { source_fingerprint: item.source_fingerprint } : {}),
        ...(Array.isArray(item.source_refs) ? { source_refs: item.source_refs } : {}),
        ...(ownerRouteRefs.length > 0 ? { owner_route_refs: ownerRouteRefs } : {}),
        ...(Array.isArray(item.owner_receipt_refs) ? { owner_receipt_refs: item.owner_receipt_refs } : {}),
        ...(Array.isArray(item.typed_blocker_refs) ? { typed_blocker_refs: item.typed_blocker_refs } : {}),
        ...(typeof item.dispatch_owner === 'string' ? { dispatch_owner: item.dispatch_owner } : {}),
        ...(typeof item.profile_name === 'string' ? { profile_name: item.profile_name } : {}),
        ...(typeof item.domain_truth_owner === 'string' ? { domain_truth_owner: item.domain_truth_owner } : {}),
        ...(typeof item.queue_owner === 'string' ? { queue_owner: item.queue_owner } : {}),
        ...(typeof item.recommended_task_kind === 'string' ? { recommended_task_kind: item.recommended_task_kind } : {}),
        ...(typeof item.reason === 'string' ? { reason: item.reason } : {}),
        ...(typeof item.runtime_state_path === 'string' ? { runtime_state_path: item.runtime_state_path } : {}),
        ...domainDispatchEvidencePayloadFrom(item),
        opl_domain_export_context: {
          command_source: exportContext.source,
          owner_fingerprint: exportContext.owner_fingerprint,
          command_cwd: exportContext.cwd,
        },
        ...handoffPayloadFrom(item),
      },
      dedupeKey: typeof item.dedupe_key === 'string' ? item.dedupe_key : undefined,
      priority: Number.isInteger(item.priority) ? item.priority as number : 0,
      source: typeof item.source === 'string' ? item.source : source,
      requiresApproval: item.requires_approval === true,
    },
  };
}

function toPendingTaskInputs(
  domainId: FamilyRuntimeDomainId,
  output: Record<string, unknown>,
  source: string,
  exportContext: DomainExportCommand,
) {
  const tasks = Array.isArray(output.pending_family_tasks) ? output.pending_family_tasks : [];
  const inputs: EnqueueInput[] = [];
  const blocked: Array<{ reason: string; task: unknown }> = [];
  for (const task of tasks) {
    if (!isRecord(task)) {
      blocked.push({ reason: 'invalid_pending_task', task });
      continue;
    }
    const result = pendingTaskInputFrom(domainId, task, source, exportContext);
    if (result.input) {
      inputs.push(result.input);
    } else if (result.blocked) {
      blocked.push(result.blocked);
    }
  }
  return { inputs, blocked };
}

function familyTransitionMatrixResult(output: Record<string, unknown>) {
  const matrix = isRecord(output.family_transition_matrix_result)
    ? output.family_transition_matrix_result
    : output.surface_kind === 'family_transition_matrix_result'
      ? output
      : null;
  if (!matrix) {
    return null;
  }
  return matrix.surface_kind === 'family_transition_matrix_result' ? matrix : null;
}

function ownerRouteOwnerFrom(result: Record<string, unknown>) {
  const ownerRoute = isRecord(result.owner_route) ? result.owner_route : null;
  return optionalString(ownerRoute?.owner);
}

function transitionTaskInputFromMatrixEntry(
  domainId: FamilyRuntimeDomainId,
  matrix: Record<string, unknown>,
  entry: unknown,
  source: string,
): { input?: EnqueueInput; blocked?: { reason: string; task: unknown } } {
  if (!isRecord(entry)) {
    return { blocked: { reason: 'invalid_transition_matrix_entry', task: entry } };
  }
  const result = isRecord(entry.result) ? entry.result : null;
  const specId = optionalString(matrix.spec_id);
  const caseId = optionalString(entry.case_id);
  const transitionId = optionalString(result?.transition_id);
  if (!result || result.surface_kind !== 'family_transition_result' || !specId || !caseId || !transitionId) {
    return { blocked: { reason: 'invalid_transition_matrix_result', task: entry } };
  }
  const declaredDomain = optionalString(result.domain_id);
  const exportedDomain = declaredDomain ? canonicalFamilyRuntimeDomainId(declaredDomain) : domainId;
  if (!exportedDomain || !isFamilyRuntimeDomainId(exportedDomain)) {
    return { blocked: { reason: 'invalid_transition_domain', task: entry } };
  }
  const sourceRef = `family_transition_matrix_result:${specId}:${caseId}`;
  return {
    input: {
      domainId: exportedDomain,
      taskKind: 'family_transition/domain_tick',
      payload: {
        family_transition: result,
        source_refs: [
          {
            role: 'family_transition_matrix_case',
            ref: sourceRef,
          },
        ],
        opl_provider_hosted_stage_attempt: true,
        authority_boundary: {
          opl_can_write_domain_truth: false,
          opl_executes_domain_action: false,
          opl_authorizes_domain_verdict: false,
          domain_transition_owner: ownerRouteOwnerFrom(result) ?? 'domain_agent',
        },
      },
      dedupeKey: `${specId}:${caseId}:${transitionId}`,
      priority: 60,
      source,
    },
  };
}

function transitionTaskInputsFromMatrix(
  domainId: FamilyRuntimeDomainId,
  output: Record<string, unknown>,
  source: string,
) {
  const matrix = familyTransitionMatrixResult(output);
  if (!matrix) {
    return { inputs: [], blocked: [] };
  }
  const entries = Array.isArray(matrix.results) ? matrix.results : [];
  const inputs: EnqueueInput[] = [];
  const blocked: Array<{ reason: string; task: unknown }> = [];
  for (const entry of entries) {
    const result = transitionTaskInputFromMatrixEntry(domainId, matrix, entry, source);
    if (result.input) {
      inputs.push(result.input);
    } else if (result.blocked) {
      blocked.push(result.blocked);
    }
  }
  return { inputs, blocked };
}

function exportedTaskInputs(
  domainId: FamilyRuntimeDomainId,
  output: Record<string, unknown>,
  source: string,
  exportContext: DomainExportCommand,
  taskScope?: FamilyRuntimeTaskScope,
) {
  const pending = toPendingTaskInputs(domainId, output, source, exportContext);
  const currentControl = currentControlProviderAdmissionInputs(domainId, output, exportContext);
  const pendingAfterCurrentControl = suppressStaleDefaultExecutorInputs(pending.inputs, currentControl.inputs);
  const transitions = transitionTaskInputsFromMatrix(domainId, output, source);
  const exportedInputs = [...currentControl.inputs, ...pendingAfterCurrentControl.inputs, ...transitions.inputs];
  const inputs = exportedInputs.filter((taskInput) => inputMatchesTaskScope(taskInput, taskScope));
  return {
    inputs,
    blocked: [...currentControl.blocked, ...pending.blocked, ...transitions.blocked],
    filtered_count: exportedInputs.length - inputs.length,
    suppressed_count: pendingAfterCurrentControl.suppressed_count,
  };
}

export function hydrateDomainTasks(
  db: DatabaseSync,
  paths: ReturnType<typeof familyRuntimePaths>,
  input: {
    domainId?: FamilyRuntimeDomainId;
    source: string;
    taskScope?: FamilyRuntimeTaskScope;
    domainProfiles?: FamilyRuntimeDomainProfiles;
  },
  enqueueTask: EnqueueTask,
) {
  const scopedDomainId = input.domainId ?? input.taskScope?.domainId;
  const domains = scopedDomainId ? [scopedDomainId] : [...FAMILY_RUNTIME_DOMAIN_IDS];
  const exports = [];
  let enqueuedCount = 0;
  let requeuedCount = 0;
  let idempotentNoopCount = 0;
  let blockedCount = 0;
  let filteredCount = 0;
  let suppressedCount = 0;
  for (const domainId of domains) {
    const command = exportCommandForDomain(domainId, paths, input.domainProfiles);
    if (!command) {
      exports.push({ domain_id: domainId, status: 'skipped', reason: 'export_command_not_configured' });
      continue;
    }
    const result = runFamilyRuntimeDomainHandlerCommand(command.argv, {
      cwd: command.cwd,
      env: process.env,
    });
    const stdout = result.stdout ?? '';
    const stderr = result.stderr ?? '';
    const exitCode = result.exit_code;
    if (exitCode !== 0) {
      blockedCount += 1;
      exports.push({
        domain_id: domainId,
        status: result.timed_out ? 'timeout' : 'failed',
        command_preview: command.argv,
        command_cwd: command.cwd,
        command_source: command.source,
        error: domainHandlerResultErrorMessage(result, 'Domain export'),
        ...(result.recovery ? { domain_handler_recovery: result.recovery } : {}),
      });
      continue;
    }
    const output = parseDispatchOutput(stdout);
    const { inputs, blocked, filtered_count, suppressed_count } = exportedTaskInputs(
      domainId,
      output,
      input.source,
      command,
      input.taskScope,
    );
    blockedCount += blocked.length;
    filteredCount += filtered_count;
    suppressedCount += suppressed_count;
    const acceptedTasks = [];
    for (const taskInput of inputs) {
      const resultPayload = enqueueTask(db, taskInput);
      acceptedTasks.push(resultPayload);
      if (resultPayload.accepted) {
        enqueuedCount += 1;
        if (resultPayload.requeued_from_terminal) {
          requeuedCount += 1;
        }
      } else if (resultPayload.idempotent_noop) {
        idempotentNoopCount += 1;
      }
    }
    exports.push({
      domain_id: domainId,
      status: 'completed',
      command_preview: command.argv,
      command_cwd: command.cwd,
      command_source: command.source,
      ...(result.recovery ? { domain_handler_recovery: result.recovery } : {}),
      exported_count: inputs.length + blocked.length,
      filtered_count,
      suppressed_count,
      enqueued_count: acceptedTasks.filter((task) => task.accepted).length,
      requeued_count: acceptedTasks.filter((task) => task.requeued_from_terminal).length,
      idempotent_noop_count: acceptedTasks.filter((task) => task.idempotent_noop).length,
      blocked_count: blocked.length,
      blocked,
    });
  }
  insertEvent(db, {
    eventType: 'domain_intake_completed',
    source: input.source,
    payload: {
      enqueued_count: enqueuedCount,
      requeued_count: requeuedCount,
      idempotent_noop_count: idempotentNoopCount,
      blocked_count: blockedCount,
      filtered_count: filteredCount,
      suppressed_count: suppressedCount,
      task_scope: input.taskScope ?? null,
    },
  });
  return {
    source: input.source,
    task_scope: input.taskScope ?? null,
    enqueued_count: enqueuedCount,
    requeued_count: requeuedCount,
    idempotent_noop_count: idempotentNoopCount,
    blocked_count: blockedCount,
    filtered_count: filteredCount,
    suppressed_count: suppressedCount,
    exports,
  };
}
