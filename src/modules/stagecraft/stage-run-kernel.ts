import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';

type JsonRecord = Record<string, unknown>;

export type StageRunEventKind =
  | 'stage_run_declared'
  | 'inputs_ready'
  | 'stage_context_observed'
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
  | 'context_observed'
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

export type StageRunProgressReport = {
  surface_kind: 'opl_stage_run_progress_report';
  version: 'stage-run-progress.v1';
  phase: 'launch' | 'closeout';
  status: 'progress_ready' | 'progress_ready_with_quality_debt' | 'hard_stopped';
  launch_hard_stop_reasons: string[];
  closeout_hard_stop_reasons: string[];
  advisory_warnings: string[];
  route_back_recommendations: string[];
  audit_drilldown_refs: string[];
  forbidden_authority_flags: string[];
  consumable_artifact_refs: string[];
  progress_diagnostic_refs: string[];
  quality_debt_reasons: string[];
  transition_outcome: 'completed' | 'completed_with_quality_debt' | 'hard_stopped';
  default_hard_stopped: boolean;
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
  opl_can_block_next_declared_stage_for_missing_transport_receipt: false,
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
    return true;
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
    input.generation === undefined || (Number.isInteger(input.generation) && Number(input.generation) >= 0)
      ? null
      : 'generation_invalid',
    input.current_pointer === undefined || currentPointerMatches(input) ? null : 'current_pointer_invalid',
  ].filter((entry): entry is string => Boolean(entry));
}

function statusFor(report: Omit<StageRunProgressReport, 'status'>): StageRunProgressReport['status'] {
  if (report.launch_hard_stop_reasons.length > 0
    || report.closeout_hard_stop_reasons.length > 0
    || report.forbidden_authority_flags.length > 0) {
    return 'hard_stopped';
  }
  if (report.advisory_warnings.length > 0 || report.route_back_recommendations.length > 0) {
    return 'progress_ready_with_quality_debt';
  }
  return 'progress_ready';
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

export function evaluateStageRunProgress(input: JsonRecord): StageRunProgressReport {
  const phase: StageRunProgressReport['phase'] = input.phase === 'closeout' ? 'closeout' : 'launch';
  const launchHardStopReasons: string[] = [];
  const closeoutHardStopReasons: string[] = [];
  const advisoryWarnings = stringRefs(input.missing_strategy_refs)
    .map((entry) => `strategy_ref_missing:${entry}`);
  const routeBackRecommendations = stringRefs(input.route_back_missing_refs)
    .map((entry) => `route_back_missing:${entry}`);
  const auditDrilldownRefs = stringRefs(input.audit_drilldown_refs);
  const forbiddenAuthorityFlags: string[] = [];
  const consumableArtifactRefs = stringRefs(input.consumable_artifact_refs);
  const progressDiagnosticRefs = stringRefs(input.progress_diagnostic_refs);
  const qualityDebtReasons = stringRefs(input.quality_debt_refs);

  if (phase === 'launch') {
    launchHardStopReasons.push(...stageRunIdentityBlockers(input));
    if (!isNonEmptyString(input.owner)) {
      advisoryWarnings.push('owner_missing_domain_context_may_supply_owner');
    }
    if (stringRefs(input.scope_refs).length === 0) {
      advisoryWarnings.push('scope_refs_missing_executor_may_infer_with_quality_debt');
    }
    if (!isNonEmptyString(input.selected_executor)) {
      advisoryWarnings.push('selected_executor_missing_defaults_to_codex_cli');
    }
    if (input.authority_boundary === undefined) {
      advisoryWarnings.push('authority_boundary_missing_framework_uses_no_authority_defaults');
    } else if (!hasSafeAuthorityBoundary(input)) {
      launchHardStopReasons.push('authority_boundary_invalid');
    }
    if (stringRefs(input.required_role_artifacts).length === 0) {
      advisoryWarnings.push('required_role_artifacts_missing_executor_may_start_from_available_inputs');
    }
    if (!isNonEmptyString(input.expected_receipt_or_blocker_shape)) {
      advisoryWarnings.push('expected_receipt_shape_missing_framework_will_derive_progress_envelope');
    }
    if (stringRefs(input.input_refs).length === 0) {
      advisoryWarnings.push('input_refs_missing_stage_may_start_from_declared_context');
    }
    if (input.forbidden_write_required === true) {
      launchHardStopReasons.push('forbidden_write_required');
    }
    if (stringRefs(input.replay_audit_refs).length === 0) {
      advisoryWarnings.push('replay_audit_lineage_missing_framework_will_derive_lineage');
    }
  } else {
    const requiredRoles = stringRefs(input.required_role_artifacts);
    const producedRoles = stringRefs(input.produced_role_artifacts);
    closeoutHardStopReasons.push(...stageRunIdentityBlockers(input));
    if (input.manifest_valid !== true) {
      advisoryWarnings.push('manifest_invalid_framework_derives_minimal_manifest');
      qualityDebtReasons.push('manifest_invalid_nonblocking');
    }
    for (const role of requiredRoles) {
      if (!producedRoles.includes(role)) {
        advisoryWarnings.push(`required_role_artifact_missing:${role}`);
        qualityDebtReasons.push(`required_role_artifact_missing:${role}`);
      }
    }
    if (requiredRoles.length === 0) {
      advisoryWarnings.push('required_role_artifacts_missing_nonblocking');
      qualityDebtReasons.push('required_role_artifacts_missing');
    }
    const ownerReceiptRefs = stringRefs(input.owner_receipt_refs);
    const typedBlockerRefs = stringRefs(input.typed_blocker_refs);
    const qualityGateReceiptRefs = stringRefs(input.quality_gate_receipt_refs);
    const ownerAnswerObserved = ownerReceiptRefs.length > 0
      || typedBlockerRefs.length > 0
      || qualityGateReceiptRefs.length > 0;
    if (!ownerAnswerObserved && consumableArtifactRefs.length === 0) {
      advisoryWarnings.push('no_stage_output_forwarded_as_progress_diagnostic');
      qualityDebtReasons.push('no_consumable_artifact_or_owner_answer');
      const stageRunId = typeof input.stage_run_id === 'string' && input.stage_run_id.trim()
        ? input.stage_run_id.trim()
        : 'unknown-stage-run';
      progressDiagnosticRefs.push(`opl://stage-run/${encodeURIComponent(stageRunId)}/no-output-diagnostic`);
    } else if (!ownerAnswerObserved) {
      advisoryWarnings.push('owner_answer_missing_transition_continues_with_quality_debt');
      qualityDebtReasons.push('owner_answer_missing_for_quality_or_ready_claim');
    }
    if (stringRefs(input.content_hashes).length === 0) {
      advisoryWarnings.push('content_hashes_missing_framework_derives_hashes');
      qualityDebtReasons.push('content_hashes_missing');
    }
    if (stringRefs(input.lineage_refs).length === 0) {
      advisoryWarnings.push('lineage_refs_missing_framework_derives_lineage');
      qualityDebtReasons.push('lineage_refs_missing');
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

  const explicitHardStopReasons = [
    input.permission_or_safety_blocked === true ? 'permission_or_safety_boundary' : null,
    input.irreversible_action_without_authority === true ? 'irreversible_action_without_authority' : null,
    input.human_decision_required === true ? 'explicit_human_decision_required' : null,
    input.executor_unavailable === true ? 'selected_executor_unavailable' : null,
  ].filter((reason): reason is string => reason !== null);
  if (phase === 'launch') {
    launchHardStopReasons.push(...explicitHardStopReasons);
  } else {
    closeoutHardStopReasons.push(...explicitHardStopReasons);
  }

  const defaultHardStopped = launchHardStopReasons.length > 0
    || closeoutHardStopReasons.length > 0
    || forbiddenAuthorityFlags.length > 0;
  const ownerOrQualityReceiptObserved = phase === 'closeout' && (
    stringRefs(input.owner_receipt_refs).length > 0
    || stringRefs(input.quality_gate_receipt_refs).length > 0
  );

  const base: Omit<StageRunProgressReport, 'status'> = {
    surface_kind: 'opl_stage_run_progress_report' as const,
    version: 'stage-run-progress.v1' as const,
    phase,
    launch_hard_stop_reasons: [...new Set(launchHardStopReasons)],
    closeout_hard_stop_reasons: [...new Set(closeoutHardStopReasons)],
    advisory_warnings: [...new Set(advisoryWarnings)],
    route_back_recommendations: [...new Set(routeBackRecommendations)],
    audit_drilldown_refs: [...new Set(auditDrilldownRefs)],
    forbidden_authority_flags: [...new Set(forbiddenAuthorityFlags)],
    consumable_artifact_refs: [...new Set(consumableArtifactRefs)],
    progress_diagnostic_refs: [...new Set(progressDiagnosticRefs)],
    quality_debt_reasons: [...new Set(qualityDebtReasons)],
    transition_outcome: defaultHardStopped
      ? 'hard_stopped'
      : ownerOrQualityReceiptObserved || phase === 'launch'
          ? 'completed'
          : 'completed_with_quality_debt',
    default_hard_stopped: defaultHardStopped,
    authority_boundary: AUTHORITY_BOUNDARY,
  };
  return {
    ...base,
    status: statusFor(base),
  };
}

function producerRole(event: StageRunEvent) {
  return optionalRef(event.producer_role) ?? optionalRef(event.producer_kind);
}

function eventIdentityIsProjectable(event: StageRunEvent) {
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
    case 'stage_context_observed':
      return 'context_observed';
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
    if (!eventIdentityIsProjectable(event)) {
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
    .filter((event) => event.event_kind === 'owner_receipt_observed' && eventIdentityIsProjectable(event))
    .map((event) => optionalRef(event.owner_receipt_ref))
    .filter((entry): entry is string => Boolean(entry));
  const typedBlockerRefs = currentEvents
    .filter((event) => event.event_kind === 'typed_blocker_observed' && eventIdentityIsProjectable(event))
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
