import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';

type JsonRecord = Record<string, unknown>;

export type StageRunEventKind =
  | 'stage_run_declared'
  | 'inputs_ready'
  | 'admitted'
  | 'provider_running'
  | 'provider_completed'
  | 'owner_receipt_observed'
  | 'typed_blocker_observed'
  | 'human_decision_required'
  | 'external_resource_required'
  | 'retry_scheduled'
  | 'infrastructure_crashed'
  | 'superseded'
  | 'next_stage_ready'
  | 'artifact_ref_observed'
  | 'hold_projected';

export type StageRunStatus =
  | 'declared'
  | 'inputs_ready'
  | 'admitted'
  | 'running'
  | 'terminalizing'
  | 'domain_accepted'
  | 'next_stage_ready'
  | 'needs_human_decision'
  | 'needs_external_resource'
  | 'retry_scheduled'
  | 'typed_blocked'
  | 'infrastructure_crashed'
  | 'superseded';

export type StageRunEvent = JsonRecord & {
  surface_kind: 'opl_stage_run_event';
  event_id: string;
  event_kind: StageRunEventKind;
  stage_run_id: string;
  generation: number;
  observed_at: string;
};

export type StageRunProjection = {
  stage_run_id: string;
  status: StageRunStatus;
  observed_generation: number;
  spec_ref: string | null;
  consumed_refs: string[];
  owner_receipt_refs: string[];
  typed_blocker_refs: string[];
  provider_attempt_refs: string[];
  hold_refs: string[];
  retry_budget_ref: string | null;
  input_fingerprint: string | null;
  last_event_ref: string;
  artifact_body_included: false;
  memory_body_included: false;
  domain_truth_included: false;
};

export type StageRunReadModel = {
  surface_kind: 'opl_stage_run_read_model';
  version: 'stage-run-kernel.v1';
  projection_role: 'rebuildable_refs_only_projection';
  stage_runs: StageRunProjection[];
  authority_boundary: typeof AUTHORITY_BOUNDARY;
};

export type StageRunAdmissionReport = {
  surface_kind: 'opl_stage_run_admission_report';
  version: 'stage-run-admission.v1';
  phase: 'launch' | 'closeout';
  status: 'passed' | 'passed_with_advisory' | 'blocked';
  launch_blockers: string[];
  closeout_blockers: string[];
  advisory_warnings: string[];
  route_back_recommendations: string[];
  audit_drilldown_refs: string[];
  forbidden_authority_flags: string[];
  consumable_artifact_refs: string[];
  quality_debt_reasons: string[];
  transition_outcome: 'blocked' | 'completed' | 'completed_with_quality_debt' | 'hard_stopped';
  default_blocked: boolean;
  authority_boundary: typeof AUTHORITY_BOUNDARY;
};

export type StageRunExecutionAuthorizationBlocker = {
  surface_kind: 'opl_stage_run_execution_authorization_blocker';
  version: 'stage-run-execution-authorization-blocker.v1';
  owner: 'one-person-lab';
  blocker_code: 'stage_run_execution_authorization_blocked';
  blocked_authority: Array<'execution_authorization' | 'closeout_receipt_binding'>;
  blocker_reasons: string[];
  domain_truth_changed: false;
  owner_receipt_signed: false;
  domain_typed_blocker_created: false;
};

export type StageRunCloseoutBinding = {
  owner_answer_ref: string | null;
  owner_answer_kind:
    | 'owner_receipt'
    | 'quality_gate_receipt'
    | 'typed_blocker'
    | 'human_gate'
    | 'route_back_evidence'
    | null;
  closeout_receipt_ref: string | null;
  bound_to_stage_run: boolean;
  bound_to_stage_manifest: boolean;
  bound_to_current_pointer: boolean;
  bound_to_source_fingerprint: boolean;
  bound_to_idempotency_key: boolean;
  quality_gate_attempt_ref: string | null;
  quality_gate_independent_attempt: boolean | null;
};

export type StageRunExecutionAuthorizationReport = {
  surface_kind: 'opl_stage_run_execution_authorization_report';
  version: 'stage-run-execution-authorization.v1';
  phase: 'launch' | 'closeout';
  status: 'authorized' | 'blocked';
  execution_authorized: boolean;
  launch_blockers: string[];
  closeout_binding_blockers: string[];
  quality_debt_reasons: string[];
  transition_authorized_with_quality_debt: boolean;
  closeout_binding: StageRunCloseoutBinding;
  opl_runtime_blocker: StageRunExecutionAuthorizationBlocker | null;
  authority_boundary: typeof AUTHORITY_BOUNDARY;
};

const AUTHORITY_BOUNDARY = {
  owner: 'one-person-lab',
  opl_can_create_stage_run_spec: true,
  opl_can_update_stage_run_status: true,
  opl_can_append_stage_run_event_refs: true,
  opl_can_rebuild_read_model: true,
  opl_can_account_retry_budget: true,
  opl_can_project_hold_scope: true,
  opl_can_write_domain_truth: false,
  opl_can_mutate_artifact_body: false,
  opl_can_store_memory_body: false,
  opl_can_create_owner_receipt: false,
  opl_can_create_typed_blocker: false,
  opl_can_create_execution_authorization_blocker: true,
  execution_blocker_is_domain_typed_blocker: false,
  execution_blocker_can_change_domain_truth: false,
  opl_can_authorize_publication_or_quality_verdict: false,
  read_model_can_be_truth_source: false,
  provider_completion_counts_as_domain_accepted: false,
  file_presence_counts_as_stage_complete: false,
  latest_json_counts_as_owner_receipt: false,
  sqlite_record_counts_as_domain_progress: false,
} as const;

const FORBIDDEN_BODY_FIELDS = new Set([
  'artifact_body',
  'memory_body',
  'domain_truth_body',
  'owner_receipt_body',
  'typed_blocker_body',
  'publication_verdict_body',
  'quality_verdict_body',
  'manuscript_body',
  'grant_package_body',
  'visual_package_body',
]);

const FORBIDDEN_AUTHORITY_FIELDS = new Set([
  'publication_verdict',
  'quality_verdict',
  'domain_ready',
  'production_ready',
  'owner_receipt_signed_by_opl',
  'typed_blocker_created_by_opl',
]);

function requiredString(value: unknown, field: string) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new FrameworkContractError('contract_shape_invalid', `StageRun event requires ${field}.`, {
      field,
    });
  }
  return value.trim();
}

function requiredGeneration(value: unknown) {
  if (!Number.isInteger(value) || Number(value) < 0) {
    throw new FrameworkContractError('contract_shape_invalid', 'StageRun event requires non-negative integer generation.', {
      field: 'generation',
    });
  }
  return Number(value);
}

function refs(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0))];
}

function optionalRef(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function lastPresent(values: Array<string | null>) {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = values[index];
    if (value) {
      return value;
    }
  }
  return null;
}

function isNonEmptyString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0;
}

function recordField(value: unknown) {
  return isRecord(value) ? value : null;
}

function stringRefs(value: unknown) {
  return refs(value);
}

function currentPointerMatches(input: JsonRecord) {
  const pointer = recordField(input.current_pointer);
  if (!pointer) {
    return false;
  }
  return pointer.stage_run_id === input.stage_run_id
    && pointer.generation === input.generation
    && pointer.current === true;
}

function currentPointerBindingIsValid(input: JsonRecord) {
  return input.current_pointer === undefined || currentPointerMatches(input);
}

function hasSafeAuthorityBoundary(input: JsonRecord) {
  const boundary = recordField(input.authority_boundary);
  if (!boundary) {
    return false;
  }
  return boundary.opl_can_write_domain_truth === false
    && boundary.opl_can_create_owner_receipt === false
    && boundary.opl_can_create_typed_blocker === false;
}

function stageRunIdentityBlockers(input: JsonRecord) {
  return [
    isNonEmptyString(input.stage_run_id) ? null : 'stage_run_id_missing',
    isNonEmptyString(input.domain_id) ? null : 'domain_id_missing',
    isNonEmptyString(input.stage_id) ? null : 'stage_id_missing',
    Number.isInteger(input.generation) && Number(input.generation) >= 0 ? null : 'generation_invalid',
    currentPointerMatches(input) ? null : 'current_pointer_invalid',
  ].filter((entry): entry is string => Boolean(entry));
}

function statusFor(report: Omit<StageRunAdmissionReport, 'status'>): StageRunAdmissionReport['status'] {
  if (report.launch_blockers.length > 0 || report.closeout_blockers.length > 0 || report.forbidden_authority_flags.length > 0) {
    return 'blocked';
  }
  if (report.advisory_warnings.length > 0 || report.route_back_recommendations.length > 0) {
    return 'passed_with_advisory';
  }
  return 'passed';
}

function rejectForbiddenPayloads(event: JsonRecord) {
  const bodyFields = Object.keys(event).filter((field) => FORBIDDEN_BODY_FIELDS.has(field));
  if (bodyFields.length > 0) {
    throw new FrameworkContractError('contract_shape_invalid', 'forbidden_body_payload: StageRun event cannot include body payloads.', {
      code: 'forbidden_body_payload',
      fields: bodyFields,
    });
  }
  const authorityFields = Object.keys(event).filter((field) => FORBIDDEN_AUTHORITY_FIELDS.has(field));
  if (authorityFields.length > 0) {
    throw new FrameworkContractError('contract_shape_invalid', 'forbidden_domain_authority: StageRun event cannot include domain authority verdict fields.', {
      code: 'forbidden_domain_authority',
      fields: authorityFields,
    });
  }
}

export function stageRunEvent(input: JsonRecord): StageRunEvent {
  if (!isRecord(input)) {
    throw new FrameworkContractError('contract_shape_invalid', 'StageRun event must be an object.');
  }
  rejectForbiddenPayloads(input);
  return {
    ...input,
    surface_kind: 'opl_stage_run_event',
    event_id: requiredString(input.event_id, 'event_id'),
    event_kind: requiredString(input.event_kind, 'event_kind') as StageRunEventKind,
    stage_run_id: requiredString(input.stage_run_id, 'stage_run_id'),
    generation: requiredGeneration(input.generation),
    observed_at: requiredString(input.observed_at, 'observed_at'),
  };
}

export function evaluateStageRunAdmission(input: JsonRecord): StageRunAdmissionReport {
  const phase: StageRunAdmissionReport['phase'] = input.phase === 'closeout' ? 'closeout' : 'launch';
  const launchBlockers: string[] = [];
  const closeoutBlockers: string[] = [];
  const advisoryWarnings = stringRefs(input.missing_strategy_refs)
    .map((entry) => `strategy_ref_missing:${entry}`);
  const routeBackRecommendations = stringRefs(input.route_back_missing_refs)
    .map((entry) => `route_back_missing:${entry}`);
  const auditDrilldownRefs = stringRefs(input.audit_drilldown_refs);
  const forbiddenAuthorityFlags: string[] = [];
  const consumableArtifactRefs = stringRefs(input.consumable_artifact_refs);
  const qualityDebtReasons = stringRefs(input.quality_debt_refs);

  if (phase === 'launch') {
    launchBlockers.push(...stageRunIdentityBlockers(input));
    if (!isNonEmptyString(input.owner)) {
      launchBlockers.push('owner_missing');
    }
    if (stringRefs(input.scope_refs).length === 0) {
      launchBlockers.push('scope_refs_missing');
    }
    if (!isNonEmptyString(input.selected_executor)) {
      launchBlockers.push('selected_executor_missing');
    }
    if (!hasSafeAuthorityBoundary(input)) {
      launchBlockers.push('authority_boundary_invalid');
    }
    if (stringRefs(input.required_role_artifacts).length === 0) {
      launchBlockers.push('required_role_artifacts_missing');
    }
    if (!isNonEmptyString(input.expected_receipt_or_blocker_shape)) {
      launchBlockers.push('expected_receipt_or_typed_blocker_shape_missing');
    }
    if (stringRefs(input.input_refs).length === 0) {
      launchBlockers.push('input_refs_missing');
    }
    if (input.forbidden_write_required === true) {
      launchBlockers.push('forbidden_write_required');
    }
    if (stringRefs(input.replay_audit_refs).length === 0) {
      launchBlockers.push('replay_audit_lineage_missing');
    }
  } else {
    const requiredRoles = stringRefs(input.required_role_artifacts);
    const producedRoles = stringRefs(input.produced_role_artifacts);
    closeoutBlockers.push(...stageRunIdentityBlockers(input));
    if (input.manifest_valid !== true) {
      closeoutBlockers.push('manifest_invalid');
    }
    for (const role of requiredRoles) {
      if (!producedRoles.includes(role)) {
        closeoutBlockers.push(`required_role_artifact_missing:${role}`);
      }
    }
    if (requiredRoles.length === 0) {
      closeoutBlockers.push('required_role_artifacts_missing');
    }
    const ownerReceiptRefs = stringRefs(input.owner_receipt_refs);
    const typedBlockerRefs = stringRefs(input.typed_blocker_refs);
    const qualityGateReceiptRefs = stringRefs(input.quality_gate_receipt_refs);
    const ownerAnswerObserved = ownerReceiptRefs.length > 0
      || typedBlockerRefs.length > 0
      || qualityGateReceiptRefs.length > 0;
    if (!ownerAnswerObserved && consumableArtifactRefs.length === 0) {
      closeoutBlockers.push('consumable_artifact_or_owner_answer_missing');
    } else if (!ownerAnswerObserved) {
      advisoryWarnings.push('owner_answer_missing_transition_continues_with_quality_debt');
      qualityDebtReasons.push('owner_answer_missing_for_quality_or_ready_claim');
    }
    if (stringRefs(input.content_hashes).length === 0) {
      closeoutBlockers.push('content_hashes_missing');
    }
    if (stringRefs(input.lineage_refs).length === 0) {
      closeoutBlockers.push('lineage_refs_missing');
    }
    if (input.provider_completed === true) {
      advisoryWarnings.push('provider_completed_alone_cannot_authorize_quality_or_ready');
    }
    if (input.read_model_refreshed === true) {
      advisoryWarnings.push('read_model_refreshed_alone_cannot_authorize_quality_or_ready');
    }
    if (input.file_presence === true) {
      advisoryWarnings.push('file_presence_alone_cannot_authorize_quality_or_ready');
    }
    if (input.conformance_passed === true) {
      advisoryWarnings.push('conformance_passed_alone_cannot_authorize_quality_or_ready');
    }
  }

  const defaultBlocked = launchBlockers.length > 0
    || closeoutBlockers.length > 0
    || forbiddenAuthorityFlags.length > 0;
  const typedHardStopObserved = phase === 'closeout' && stringRefs(input.typed_blocker_refs).length > 0;
  const ownerOrQualityReceiptObserved = phase === 'closeout' && (
    stringRefs(input.owner_receipt_refs).length > 0
    || stringRefs(input.quality_gate_receipt_refs).length > 0
  );

  const base: Omit<StageRunAdmissionReport, 'status'> = {
    surface_kind: 'opl_stage_run_admission_report' as const,
    version: 'stage-run-admission.v1' as const,
    phase,
    launch_blockers: [...new Set(launchBlockers)],
    closeout_blockers: [...new Set(closeoutBlockers)],
    advisory_warnings: [...new Set(advisoryWarnings)],
    route_back_recommendations: [...new Set(routeBackRecommendations)],
    audit_drilldown_refs: [...new Set(auditDrilldownRefs)],
    forbidden_authority_flags: [...new Set(forbiddenAuthorityFlags)],
    consumable_artifact_refs: [...new Set(consumableArtifactRefs)],
    quality_debt_reasons: [...new Set(qualityDebtReasons)],
    transition_outcome: defaultBlocked
      ? 'blocked'
      : typedHardStopObserved
        ? 'hard_stopped'
        : ownerOrQualityReceiptObserved || phase === 'launch'
          ? 'completed'
          : 'completed_with_quality_debt',
    default_blocked: defaultBlocked,
    authority_boundary: AUTHORITY_BOUNDARY,
  };
  return {
    ...base,
    status: statusFor(base),
  };
}

function requiredRefBlocker(input: JsonRecord, field: string, blocker: string) {
  return isNonEmptyString(input[field]) ? null : blocker;
}

function launchAuthorizationBlockers(input: JsonRecord) {
  return [
    ...stageRunIdentityBlockers(input),
    requiredRefBlocker(input, 'selected_executor', 'selected_executor_missing'),
    requiredRefBlocker(input, 'source_fingerprint', 'source_fingerprint_missing'),
    requiredRefBlocker(input, 'idempotency_key', 'idempotency_key_missing'),
    requiredRefBlocker(input, 'provider_attempt_ref', 'provider_attempt_ref_missing'),
    requiredRefBlocker(input, 'attempt_lease_ref', 'attempt_lease_ref_missing'),
    input.attempt_lease_status === undefined || input.attempt_lease_status === 'active'
      ? null
      : 'attempt_lease_not_active',
    requiredRefBlocker(input, 'execution_authorization_decision_ref', 'execution_authorization_decision_ref_missing'),
    requiredRefBlocker(input, 'workspace_scope_ref', 'workspace_scope_ref_missing'),
    requiredRefBlocker(input, 'artifact_scope_ref', 'artifact_scope_ref_missing'),
    hasSafeAuthorityBoundary(input) ? null : 'authority_boundary_invalid',
    input.forbidden_write_required === true ? 'forbidden_write_required' : null,
  ].filter((entry): entry is string => Boolean(entry));
}

function buildCloseoutBinding(input: JsonRecord): StageRunCloseoutBinding {
  const closeoutReceiptRef = optionalRef(input.closeout_receipt_ref);
  const ownerAnswerRef = optionalRef(input.owner_answer_ref) ?? closeoutReceiptRef;
  const explicitOwnerAnswerKind = optionalRef(input.owner_answer_kind);
  const ownerAnswerKind = ownerAnswerRef === null
    ? null
    : explicitOwnerAnswerKind === 'typed_blocker'
      || explicitOwnerAnswerKind === 'quality_gate_receipt'
      || explicitOwnerAnswerKind === 'human_gate'
      || explicitOwnerAnswerKind === 'route_back_evidence'
        ? explicitOwnerAnswerKind
        : 'owner_receipt';
  const ownerAnswerStageRunId = input.owner_answer_stage_run_id ?? input.closeout_receipt_stage_run_id;
  const ownerAnswerGeneration = input.owner_answer_generation ?? input.closeout_receipt_generation;
  const stageManifestRef = optionalRef(input.stage_manifest_ref);
  const ownerAnswerStageManifestRef =
    optionalRef(input.owner_answer_manifest_ref) ?? optionalRef(input.closeout_receipt_manifest_ref);
  const currentPointerRef = optionalRef(input.current_pointer_ref);
  const ownerAnswerCurrentPointerRef =
    optionalRef(input.owner_answer_current_pointer_ref) ?? optionalRef(input.closeout_receipt_current_pointer_ref);
  const sourceFingerprint = optionalRef(input.source_fingerprint);
  const ownerAnswerSourceFingerprint =
    optionalRef(input.owner_answer_source_fingerprint) ?? optionalRef(input.closeout_receipt_source_fingerprint);
  const idempotencyKey = optionalRef(input.idempotency_key);
  const ownerAnswerIdempotencyKey =
    optionalRef(input.owner_answer_idempotency_key) ?? optionalRef(input.closeout_receipt_idempotency_key);
  const providerAttemptRef = optionalRef(input.provider_attempt_ref);
  const qualityGateAttemptRef =
    optionalRef(input.quality_gate_attempt_ref) ?? optionalRef(input.owner_answer_attempt_ref);
  const qualityGateIndependentAttempt = ownerAnswerKind === 'quality_gate_receipt'
    ? qualityGateAttemptRef !== null && qualityGateAttemptRef !== providerAttemptRef
    : null;
  return {
    owner_answer_ref: ownerAnswerRef,
    owner_answer_kind: ownerAnswerKind,
    closeout_receipt_ref: closeoutReceiptRef,
    bound_to_stage_run:
      ownerAnswerRef !== null
      && ownerAnswerStageRunId === input.stage_run_id
      && ownerAnswerGeneration === input.generation,
    bound_to_stage_manifest:
      ownerAnswerRef !== null
      && stageManifestRef !== null
      && ownerAnswerStageManifestRef === stageManifestRef,
    bound_to_current_pointer:
      ownerAnswerRef !== null
      && currentPointerRef !== null
      && ownerAnswerCurrentPointerRef === currentPointerRef,
    bound_to_source_fingerprint:
      ownerAnswerRef !== null
      && sourceFingerprint !== null
      && ownerAnswerSourceFingerprint === sourceFingerprint,
    bound_to_idempotency_key:
      ownerAnswerRef !== null
      && idempotencyKey !== null
      && ownerAnswerIdempotencyKey === idempotencyKey,
    quality_gate_attempt_ref: qualityGateAttemptRef,
    quality_gate_independent_attempt: qualityGateIndependentAttempt,
  };
}

function closeoutBindingBlockers(binding: StageRunCloseoutBinding) {
  return [
    binding.owner_answer_ref ? null : 'closeout_receipt_ref_missing',
    binding.bound_to_stage_run ? null : 'closeout_receipt_stage_run_binding_missing',
    binding.bound_to_stage_manifest ? null : 'closeout_receipt_stage_manifest_binding_missing',
    binding.bound_to_current_pointer ? null : 'closeout_receipt_current_pointer_binding_missing',
    binding.bound_to_source_fingerprint ? null : 'closeout_receipt_source_fingerprint_binding_missing',
    binding.bound_to_idempotency_key ? null : 'closeout_owner_answer_idempotency_binding_missing',
    binding.owner_answer_kind !== 'quality_gate_receipt' || binding.quality_gate_attempt_ref
      ? null
      : 'quality_gate_independent_attempt_binding_missing',
    binding.owner_answer_kind !== 'quality_gate_receipt'
      || binding.quality_gate_attempt_ref === null
      || binding.quality_gate_independent_attempt === true
      ? null
      : 'quality_gate_same_attempt_self_review_forbidden',
  ].filter((entry): entry is string => Boolean(entry));
}

function executionAuthorizationBlocker(
  launchBlockers: string[],
  closeoutBlockers: string[],
): StageRunExecutionAuthorizationBlocker | null {
  const blockerReasons = [...new Set([...launchBlockers, ...closeoutBlockers])];
  if (blockerReasons.length === 0) {
    return null;
  }
  return {
    surface_kind: 'opl_stage_run_execution_authorization_blocker',
    version: 'stage-run-execution-authorization-blocker.v1',
    owner: 'one-person-lab',
    blocker_code: 'stage_run_execution_authorization_blocked',
    blocked_authority: [
      launchBlockers.length > 0 ? 'execution_authorization' : null,
      closeoutBlockers.length > 0 ? 'closeout_receipt_binding' : null,
    ].filter((entry): entry is 'execution_authorization' | 'closeout_receipt_binding' => Boolean(entry)),
    blocker_reasons: blockerReasons,
    domain_truth_changed: false,
    owner_receipt_signed: false,
    domain_typed_blocker_created: false,
  };
}

export function evaluateStageRunExecutionAuthorization(input: JsonRecord): StageRunExecutionAuthorizationReport {
  const phase: StageRunExecutionAuthorizationReport['phase'] = input.phase === 'closeout' ? 'closeout' : 'launch';
  const launchBlockers = [...new Set(launchAuthorizationBlockers(input))];
  const closeoutBinding = buildCloseoutBinding(input);
  const consumableArtifactRefs = stringRefs(input.consumable_artifact_refs);
  const rawCloseoutBindingBlockers = phase === 'closeout'
    ? [...new Set(closeoutBindingBlockers(closeoutBinding))]
    : [];
  const qualityOnlyBindingBlockers = new Set([
    'quality_gate_independent_attempt_binding_missing',
    'quality_gate_same_attempt_self_review_forbidden',
  ]);
  const transitionWithoutOwnerAnswer = phase === 'closeout'
    && closeoutBinding.owner_answer_ref === null
    && consumableArtifactRefs.length > 0;
  const qualityGateDebtForward = phase === 'closeout'
    && consumableArtifactRefs.length > 0
    && rawCloseoutBindingBlockers.some((reason) => qualityOnlyBindingBlockers.has(reason));
  const closeoutBindingBlockerList = transitionWithoutOwnerAnswer
    ? []
    : rawCloseoutBindingBlockers.filter((reason) => !(
        qualityGateDebtForward && qualityOnlyBindingBlockers.has(reason)
      ));
  const qualityDebtReasons = [
    ...(transitionWithoutOwnerAnswer ? ['owner_answer_missing_for_quality_or_ready_claim'] : []),
    ...rawCloseoutBindingBlockers.filter((reason) => (
      qualityGateDebtForward && qualityOnlyBindingBlockers.has(reason)
    )),
    ...stringRefs(input.quality_debt_refs),
  ];
  const runtimeBlocker = executionAuthorizationBlocker(launchBlockers, closeoutBindingBlockerList);
  const executionAuthorized = runtimeBlocker === null;
  return {
    surface_kind: 'opl_stage_run_execution_authorization_report',
    version: 'stage-run-execution-authorization.v1',
    phase,
    status: executionAuthorized ? 'authorized' : 'blocked',
    execution_authorized: executionAuthorized,
    launch_blockers: launchBlockers,
    closeout_binding_blockers: closeoutBindingBlockerList,
    quality_debt_reasons: [...new Set(qualityDebtReasons)],
    transition_authorized_with_quality_debt:
      phase === 'closeout' && executionAuthorized && qualityDebtReasons.length > 0,
    closeout_binding: closeoutBinding,
    opl_runtime_blocker: runtimeBlocker,
    authority_boundary: AUTHORITY_BOUNDARY,
  };
}

function producerRole(event: StageRunEvent) {
  return optionalRef(event.producer_role) ?? optionalRef(event.producer_kind);
}

function stageTransitionAuthorityCanAdvance(event: StageRunEvent) {
  if (!currentPointerBindingIsValid(event)) {
    return false;
  }
  const producer = producerRole(event);
  switch (event.event_kind) {
    case 'owner_receipt_observed':
    case 'typed_blocker_observed':
      return producer === null || producer === 'domain_owner';
    case 'human_decision_required':
      return producer === null || producer === 'domain_owner' || producer === 'human_operator';
    default:
      return true;
  }
}

function isLifecycleNeutralEvent(event: StageRunEvent) {
  return event.event_kind === 'artifact_ref_observed' || event.event_kind === 'hold_projected';
}

function statusAfterEvent(event: StageRunEvent): StageRunStatus {
  switch (event.event_kind) {
    case 'stage_run_declared':
      return 'declared';
    case 'inputs_ready':
      return 'inputs_ready';
    case 'admitted':
      return 'admitted';
    case 'provider_running':
      return 'running';
    case 'provider_completed':
      return 'terminalizing';
    case 'owner_receipt_observed':
      return 'domain_accepted';
    case 'typed_blocker_observed':
      return 'typed_blocked';
    case 'human_decision_required':
      return 'needs_human_decision';
    case 'external_resource_required':
      return 'needs_external_resource';
    case 'retry_scheduled':
      return 'retry_scheduled';
    case 'infrastructure_crashed':
      return 'infrastructure_crashed';
    case 'superseded':
      return 'superseded';
    case 'next_stage_ready':
      return 'next_stage_ready';
    case 'artifact_ref_observed':
    case 'hold_projected':
      return 'declared';
  }
}

function statusAfterEvents(events: StageRunEvent[]): StageRunStatus {
  let status: StageRunStatus = 'declared';
  for (const event of events) {
    if (isLifecycleNeutralEvent(event)) {
      continue;
    }
    if (!stageTransitionAuthorityCanAdvance(event)) {
      continue;
    }
    status = statusAfterEvent(event);
  }
  return status;
}

function collectProjection(stageRunId: string, events: StageRunEvent[]): StageRunProjection {
  const observedGeneration = Math.max(...events.map((event) => event.generation));
  const currentEvents = events
    .filter((event) => event.generation === observedGeneration)
    .sort((left, right) => left.observed_at.localeCompare(right.observed_at) || left.event_id.localeCompare(right.event_id));
  const lastEvent = currentEvents.at(-1);
  if (!lastEvent) {
    throw new FrameworkContractError('contract_shape_invalid', 'StageRun projection requires at least one current-generation event.', {
      stage_run_id: stageRunId,
    });
  }

  const consumedRefs = currentEvents.flatMap((event) => refs(event.input_refs));
  const artifactRefs = currentEvents.map((event) => optionalRef(event.artifact_ref)).filter((entry): entry is string => Boolean(entry));
  const ownerReceiptRefs = currentEvents
    .filter((event) => event.event_kind === 'owner_receipt_observed' && stageTransitionAuthorityCanAdvance(event))
    .map((event) => optionalRef(event.owner_receipt_ref))
    .filter((entry): entry is string => Boolean(entry));
  const typedBlockerRefs = currentEvents
    .filter((event) => event.event_kind === 'typed_blocker_observed' && stageTransitionAuthorityCanAdvance(event))
    .map((event) => optionalRef(event.typed_blocker_ref))
    .filter((entry): entry is string => Boolean(entry));
  const providerAttemptRefs = currentEvents
    .map((event) => optionalRef(event.provider_attempt_ref))
    .filter((entry): entry is string => Boolean(entry));
  const holdRefs = currentEvents.map((event) => optionalRef(event.hold_ref)).filter((entry): entry is string => Boolean(entry));

  return {
    stage_run_id: stageRunId,
    status: statusAfterEvents(currentEvents),
    observed_generation: observedGeneration,
    spec_ref: currentEvents.map((event) => optionalRef(event.spec_ref)).find((entry): entry is string => Boolean(entry)) ?? null,
    consumed_refs: [...new Set([...consumedRefs, ...artifactRefs])],
    owner_receipt_refs: [...new Set(ownerReceiptRefs)],
    typed_blocker_refs: [...new Set(typedBlockerRefs)],
    provider_attempt_refs: [...new Set(providerAttemptRefs)],
    hold_refs: [...new Set(holdRefs)],
    retry_budget_ref: lastPresent(currentEvents.map((event) => optionalRef(event.retry_budget_ref))),
    input_fingerprint: lastPresent(currentEvents.map((event) => optionalRef(event.input_fingerprint))),
    last_event_ref: lastEvent.event_id,
    artifact_body_included: false,
    memory_body_included: false,
    domain_truth_included: false,
  };
}

export function rebuildStageRunReadModel(events: StageRunEvent[]): StageRunReadModel {
  const byStageRun = new Map<string, StageRunEvent[]>();
  for (const event of events.map((entry) => stageRunEvent(entry))) {
    byStageRun.set(event.stage_run_id, [...(byStageRun.get(event.stage_run_id) ?? []), event]);
  }

  return {
    surface_kind: 'opl_stage_run_read_model',
    version: 'stage-run-kernel.v1',
    projection_role: 'rebuildable_refs_only_projection',
    stage_runs: [...byStageRun.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([stageRunId, stageRunEvents]) => collectProjection(stageRunId, stageRunEvents)),
    authority_boundary: AUTHORITY_BOUNDARY,
  };
}
