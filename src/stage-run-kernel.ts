import { FrameworkContractError } from './contracts.ts';

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

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

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
    .map((event) => optionalRef(event.owner_receipt_ref))
    .filter((entry): entry is string => Boolean(entry));
  const typedBlockerRefs = currentEvents
    .map((event) => optionalRef(event.typed_blocker_ref))
    .filter((entry): entry is string => Boolean(entry));
  const providerAttemptRefs = currentEvents
    .map((event) => optionalRef(event.provider_attempt_ref))
    .filter((entry): entry is string => Boolean(entry));
  const holdRefs = currentEvents.map((event) => optionalRef(event.hold_ref)).filter((entry): entry is string => Boolean(entry));

  return {
    stage_run_id: stageRunId,
    status: statusAfterEvent(lastEvent),
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
