import { FrameworkContractError } from './contracts.ts';
import { stableId } from './family-runtime-ids.ts';

type JsonRecord = Record<string, unknown>;

const STAGE_TRANSITION_INTENT_KINDS = [
  'domain_owner_answer',
  'typed_blocker',
  'human_gate_decision',
  'route_recommendation',
  'provider_observation',
  'read_model_observation',
  'worklist_observation',
  'agent_lab_observation',
  'evidence_observation',
] as const;

const STAGE_TRANSITION_PRODUCER_KINDS = [
  'domain_agent',
  'human_operator',
  'one_person_lab_app',
  'runtime_provider',
  'agent_lab',
  'evidence_vault',
  'read_model',
  'worklist',
  'stage_transition_authority',
] as const;

export type StageTransitionIntentKind =
  typeof STAGE_TRANSITION_INTENT_KINDS[number];

export type StageTransitionProducerKind =
  typeof STAGE_TRANSITION_PRODUCER_KINDS[number];

export type StageTransitionDecisionStatus =
  | 'transition_accepted'
  | 'observation_recorded'
  | 'rejected';

export type StageTransitionIntent = JsonRecord & {
  surface_kind: 'opl_stage_transition_intent';
  schema_version: 'stage-transition-intent.v1';
  intent_id: string;
  intent_kind: StageTransitionIntentKind;
  producer_kind: StageTransitionProducerKind;
  stage_run_id: string;
  generation: number;
  domain_id: string;
  stage_id: string;
  owner: string;
  source_fingerprint: string;
  idempotency_key: string;
  stage_manifest_ref: string;
  current_pointer_ref: string;
  provider_attempt_ref: string;
  attempt_lease_ref: string;
  execution_authorization_decision_ref: string;
  observed_at: string;
};

export type StageTransitionAuthorityDecision = {
  surface_kind: 'opl_stage_transition_authority_decision';
  version: 'stage-transition-authority.v1';
  decision_id: string;
  status: StageTransitionDecisionStatus;
  stage_run_id: string;
  generation: number;
  intent_id: string;
  intent_kind: StageTransitionIntentKind;
  producer_kind: StageTransitionProducerKind;
  accepted_transition_ref: string | null;
  rejection_reasons: string[];
  observation_reasons: string[];
  can_write_stage_current_pointer: boolean;
  can_write_stage_run_terminal_state: boolean;
  can_publish_current_owner_delta: boolean;
  current_owner_delta: JsonRecord | null;
  authority_boundary: typeof AUTHORITY_BOUNDARY;
};

export type StageTransitionAuthorityEvent = {
  surface_kind: 'opl_stage_transition_authority_event';
  version: 'stage-transition-authority-event.v1';
  event_id: string;
  event_kind:
    | 'transition_intent_accepted'
    | 'transition_intent_recorded'
    | 'transition_intent_rejected';
  stage_run_id: string;
  generation: number;
  intent_id: string;
  decision_id: string;
  idempotency_key: string;
  observed_at: string;
  decision_status: StageTransitionDecisionStatus;
  accepted_transition_ref: string | null;
  current_owner_delta_ref: string | null;
  authority_boundary: typeof AUTHORITY_BOUNDARY;
};

export type StageTransitionAuthorityReadModel = {
  surface_kind: 'opl_stage_transition_authority_read_model';
  version: 'stage-transition-authority.v1';
  projection_role: 'single_writer_stage_transition_projection';
  event_log_policy: 'append_only_events_folded_by_stage_run_generation_and_idempotency';
  stage_runs: Array<{
    stage_run_id: string;
    observed_generation: number;
    accepted_transition_ref: string | null;
    current_owner_delta: JsonRecord | null;
    rejected_intent_count: number;
    observation_intent_count: number;
    last_event_ref: string;
  }>;
  events: StageTransitionAuthorityEvent[];
  authority_boundary: typeof AUTHORITY_BOUNDARY;
};

const AUTHORITY_BOUNDARY = {
  owner: 'one-person-lab',
  stage_transition_single_writer: true,
  only_stage_transition_authority_can_write_stage_current_pointer: true,
  only_stage_transition_authority_can_write_stage_run_terminal_state: true,
  only_stage_transition_authority_can_publish_current_owner_delta: true,
  intent_producer_can_write_stage_current_pointer: false,
  intent_producer_can_write_stage_run_terminal_state: false,
  intent_producer_can_publish_current_owner_delta: false,
  provider_completion_counts_as_stage_transition: false,
  read_model_update_counts_as_stage_transition: false,
  worklist_update_counts_as_stage_transition: false,
  evidence_event_counts_as_stage_transition: false,
  agent_lab_output_counts_as_stage_transition: false,
  opl_can_write_domain_truth: false,
  opl_can_create_owner_receipt: false,
  opl_can_create_typed_blocker: false,
  opl_can_authorize_domain_ready: false,
  opl_can_claim_production_ready: false,
} as const;

const REQUIRED_INTENT_AUTHORITY_BOUNDARY = {
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
} as const;

export const STAGE_TRANSITION_INTENT_AUTHORITY_BOUNDARY =
  REQUIRED_INTENT_AUTHORITY_BOUNDARY;

const TRANSITION_CAPABLE_INTENTS = new Set<StageTransitionIntentKind>([
  'domain_owner_answer',
  'typed_blocker',
  'human_gate_decision',
]);

const TRANSITION_CAPABLE_PRODUCERS = new Set<StageTransitionProducerKind>([
  'domain_agent',
  'human_operator',
]);

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
  'domain_ready',
  'production_ready',
  'publication_ready',
  'artifact_ready',
  'quality_verdict',
  'publication_verdict',
  'owner_receipt_signed_by_opl',
  'typed_blocker_created_by_opl',
  'stage_current_pointer_written_by_producer',
  'stage_run_terminal_state_written_by_producer',
]);

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, field: string) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      `Stage transition intent requires ${field}.`,
      { field },
    );
  }
  return value.trim();
}

function requiredEnum<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
) {
  const normalized = requiredString(value, field);
  if (!allowed.includes(normalized as T)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      `Stage transition intent has unsupported ${field}.`,
      { field, value: normalized, allowed },
    );
  }
  return normalized as T;
}

function requiredGeneration(value: unknown) {
  if (!Number.isInteger(value) || Number(value) < 0) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Stage transition intent requires non-negative integer generation.',
      { field: 'generation' },
    );
  }
  return Number(value);
}

function requireIntentAuthorityBoundary(value: unknown) {
  if (!isRecord(value)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Stage transition intent requires refs-only non-authoritative authority_boundary.',
      { field: 'authority_boundary' },
    );
  }

  const violatingFields = Object.entries(REQUIRED_INTENT_AUTHORITY_BOUNDARY)
    .filter(([field, expected]) => value[field] !== expected)
    .map(([field]) => field);
  if (violatingFields.length > 0) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'stage_transition_intent_authority_boundary_invalid: intent producers cannot claim transition or domain authority.',
      { code: 'stage_transition_intent_authority_boundary_invalid', fields: violatingFields },
    );
  }

  return value;
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function refs(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0))];
}

function rejectForbiddenPayloads(value: JsonRecord) {
  const bodyFields = Object.keys(value).filter((field) => FORBIDDEN_BODY_FIELDS.has(field));
  if (bodyFields.length > 0) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'forbidden_body_payload: Stage transition intent cannot include body payloads.',
      { code: 'forbidden_body_payload', fields: bodyFields },
    );
  }
  const authorityFields = Object.keys(value).filter((field) => FORBIDDEN_AUTHORITY_FIELDS.has(field));
  if (authorityFields.length > 0) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'forbidden_domain_authority: Stage transition intent cannot claim domain or stage authority.',
      { code: 'forbidden_domain_authority', fields: authorityFields },
    );
  }
}

function decisionId(intent: StageTransitionIntent, status: StageTransitionDecisionStatus) {
  return stableId('sta_decision', [
    intent.stage_run_id,
    intent.generation,
    intent.intent_id,
    intent.intent_kind,
    intent.producer_kind,
    intent.idempotency_key,
    status,
  ]);
}

function transitionRef(intent: StageTransitionIntent) {
  return `opl://stage-transition-authority/${encodeURIComponent(intent.stage_run_id)}/g${intent.generation}/${encodeURIComponent(intent.idempotency_key)}`;
}

function closeoutBindingRejectionReasons(intent: StageTransitionIntent) {
  const ownerAnswerStageRunId =
    optionalString(intent.owner_answer_stage_run_id) ?? optionalString(intent.closeout_receipt_stage_run_id);
  const ownerAnswerGeneration = intent.owner_answer_generation ?? intent.closeout_receipt_generation;
  const ownerAnswerManifestRef =
    optionalString(intent.owner_answer_manifest_ref) ?? optionalString(intent.closeout_receipt_manifest_ref);
  const ownerAnswerCurrentPointerRef =
    optionalString(intent.owner_answer_current_pointer_ref) ?? optionalString(intent.closeout_receipt_current_pointer_ref);
  const ownerAnswerSourceFingerprint =
    optionalString(intent.owner_answer_source_fingerprint) ?? optionalString(intent.closeout_receipt_source_fingerprint);
  const ownerAnswerIdempotencyKey =
    optionalString(intent.owner_answer_idempotency_key) ?? optionalString(intent.closeout_receipt_idempotency_key);

  return [
    ownerAnswerStageRunId === intent.stage_run_id && ownerAnswerGeneration === intent.generation
      ? null
      : 'closeout_receipt_stage_run_binding_missing',
    ownerAnswerManifestRef === intent.stage_manifest_ref
      ? null
      : 'closeout_receipt_stage_manifest_binding_missing',
    ownerAnswerCurrentPointerRef === intent.current_pointer_ref
      ? null
      : 'closeout_receipt_current_pointer_binding_missing',
    ownerAnswerSourceFingerprint === intent.source_fingerprint
      ? null
      : 'closeout_receipt_source_fingerprint_binding_missing',
    ownerAnswerIdempotencyKey === intent.idempotency_key
      ? null
      : 'closeout_owner_answer_idempotency_binding_missing',
  ].filter((entry): entry is string => Boolean(entry));
}

function transitionPayloadRef(intent: StageTransitionIntent) {
  if (intent.intent_kind === 'typed_blocker') {
    return optionalString(intent.typed_blocker_ref) ?? optionalString(intent.owner_answer_ref);
  }
  if (intent.intent_kind === 'human_gate_decision') {
    return optionalString(intent.human_decision_ref) ?? optionalString(intent.owner_answer_ref);
  }
  return optionalString(intent.owner_receipt_ref)
    ?? optionalString(intent.owner_answer_ref)
    ?? optionalString(intent.closeout_receipt_ref);
}

function observationReasons(intent: StageTransitionIntent) {
  return [
    TRANSITION_CAPABLE_INTENTS.has(intent.intent_kind)
      ? null
      : `${intent.intent_kind}_cannot_drive_stage_transition`,
    TRANSITION_CAPABLE_PRODUCERS.has(intent.producer_kind)
      ? null
      : `${intent.producer_kind}_cannot_write_stage_transition`,
  ].filter((entry): entry is string => Boolean(entry));
}

function buildCurrentOwnerDelta(intent: StageTransitionIntent, acceptedTransitionRef: string) {
  const acceptedAnswerShape = refs(intent.accepted_answer_shape);
  return {
    surface_kind: 'opl_current_owner_delta',
    schema_version: 'current-owner-delta.v1',
    projection_policy: 'default_owner_delta_root_audit_tail_passive',
    default_planning_root: 'current_owner_delta',
    audit_tail_policy:
      'raw_worklist_raw_evidence_replay_typed_blocker_group_private_residue_are_passive_until_folded',
    evidence_vault_policy: 'record_everything_plan_from_nothing',
    delta_id: stableId('cod', [
      intent.stage_run_id,
      intent.generation,
      intent.idempotency_key,
      acceptedTransitionRef,
    ]),
    domain: intent.domain_id,
    task_or_study_ref: optionalString(intent.task_or_study_ref),
    stage_ref: intent.stage_id,
    lineage_ref: acceptedTransitionRef,
    source_fingerprint: intent.source_fingerprint,
    desired_delta_kind:
      intent.intent_kind === 'typed_blocker'
        ? 'typed_blocker'
        : 'owner_answer_or_typed_blocker',
    desired_delta_description:
      optionalString(intent.desired_delta_description)
      ?? 'stage_transition_authority_accepted_owner_answer_or_blocker',
    current_owner: optionalString(intent.next_owner) ?? intent.owner,
    accepted_answer_shape: acceptedAnswerShape.length > 0
      ? acceptedAnswerShape
      : ['owner_receipt', 'typed_blocker', 'human_gate_receipt', 'route_back_ref'],
    hard_gate: {
      state: 'owner_delta_open',
      provider_liveness_required: false,
      human_or_domain_owner_required: true,
      source: 'owner_delta_controller',
      stage_transition_authority_ref: acceptedTransitionRef,
    },
    advisory_warnings: [],
    live_attempt_ref: optionalString(intent.provider_attempt_ref),
    latest_owner_answer_ref: transitionPayloadRef(intent),
    stop_loss_state: {
      status: 'not_triggered',
      fresh_owner_delta_required_to_resume: false,
    },
    audit_refs: {
      stage_transition_authority_ref: acceptedTransitionRef,
      stage_transition_intent_ref: intent.intent_id,
      stage_manifest_ref: intent.stage_manifest_ref,
      current_pointer_ref: intent.current_pointer_ref,
      provider_attempt_ref: intent.provider_attempt_ref,
      execution_authorization_decision_ref: intent.execution_authorization_decision_ref,
    },
    authority_boundary: {
      can_write_domain_truth: false,
      can_create_owner_receipt: false,
      can_create_typed_blocker: false,
      can_close_domain_ready: false,
      can_claim_production_ready: false,
      route_not_stage_strategy: true,
      route_reconciler_role: 'hydrate_reconcile_owner_routes_only',
      route_reconciler_can_generate_candidates: false,
      route_reconciler_can_evaluate_or_rank_candidates: false,
      route_reconciler_can_complete_stage: false,
      route_reconciler_can_sign_receipts: false,
      raw_worklist_can_drive_default_planning: false,
      raw_evidence_can_drive_default_planning: false,
      replay_packet_can_drive_default_planning: false,
      typed_blocker_group_can_drive_default_planning: false,
      private_residue_inventory_can_drive_default_planning: false,
      audit_tail_can_drive_default_planning: false,
      stage_transition_authority_single_writer: true,
    },
  };
}

export function normalizeStageTransitionIntent(input: JsonRecord): StageTransitionIntent {
  if (!isRecord(input)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Stage transition intent must be an object.',
    );
  }
  rejectForbiddenPayloads(input);
  requireIntentAuthorityBoundary(input.authority_boundary);
  return {
    ...input,
    surface_kind: 'opl_stage_transition_intent',
    schema_version: 'stage-transition-intent.v1',
    intent_id: requiredString(input.intent_id, 'intent_id'),
    intent_kind: requiredEnum(input.intent_kind, 'intent_kind', STAGE_TRANSITION_INTENT_KINDS),
    producer_kind: requiredEnum(input.producer_kind, 'producer_kind', STAGE_TRANSITION_PRODUCER_KINDS),
    stage_run_id: requiredString(input.stage_run_id, 'stage_run_id'),
    generation: requiredGeneration(input.generation),
    domain_id: requiredString(input.domain_id, 'domain_id'),
    stage_id: requiredString(input.stage_id, 'stage_id'),
    owner: requiredString(input.owner, 'owner'),
    source_fingerprint: requiredString(input.source_fingerprint, 'source_fingerprint'),
    idempotency_key: requiredString(input.idempotency_key, 'idempotency_key'),
    stage_manifest_ref: requiredString(input.stage_manifest_ref, 'stage_manifest_ref'),
    current_pointer_ref: requiredString(input.current_pointer_ref, 'current_pointer_ref'),
    provider_attempt_ref: requiredString(input.provider_attempt_ref, 'provider_attempt_ref'),
    attempt_lease_ref: requiredString(input.attempt_lease_ref, 'attempt_lease_ref'),
    execution_authorization_decision_ref: requiredString(
      input.execution_authorization_decision_ref,
      'execution_authorization_decision_ref',
    ),
    observed_at: requiredString(input.observed_at, 'observed_at'),
  };
}

export function evaluateStageTransitionIntent(input: JsonRecord): StageTransitionAuthorityDecision {
  const intent = normalizeStageTransitionIntent(input);
  const observationReasonList = observationReasons(intent);
  const rejectionReasons = [
    transitionPayloadRef(intent) ? null : 'owner_answer_or_blocker_ref_missing',
    ...closeoutBindingRejectionReasons(intent),
  ].filter((entry): entry is string => Boolean(entry));
  const status: StageTransitionDecisionStatus =
    observationReasonList.length > 0
      ? 'observation_recorded'
      : rejectionReasons.length > 0
        ? 'rejected'
        : 'transition_accepted';
  const acceptedTransitionRef = status === 'transition_accepted' ? transitionRef(intent) : null;
  return {
    surface_kind: 'opl_stage_transition_authority_decision',
    version: 'stage-transition-authority.v1',
    decision_id: decisionId(intent, status),
    status,
    stage_run_id: intent.stage_run_id,
    generation: intent.generation,
    intent_id: intent.intent_id,
    intent_kind: intent.intent_kind,
    producer_kind: intent.producer_kind,
    accepted_transition_ref: acceptedTransitionRef,
    rejection_reasons: status === 'rejected' ? [...new Set(rejectionReasons)] : [],
    observation_reasons:
      status === 'observation_recorded' ? [...new Set(observationReasonList)] : [],
    can_write_stage_current_pointer: status === 'transition_accepted',
    can_write_stage_run_terminal_state: status === 'transition_accepted',
    can_publish_current_owner_delta: status === 'transition_accepted',
    current_owner_delta: acceptedTransitionRef
      ? buildCurrentOwnerDelta(intent, acceptedTransitionRef)
      : null,
    authority_boundary: AUTHORITY_BOUNDARY,
  };
}

function eventKind(status: StageTransitionDecisionStatus): StageTransitionAuthorityEvent['event_kind'] {
  if (status === 'transition_accepted') {
    return 'transition_intent_accepted';
  }
  if (status === 'observation_recorded') {
    return 'transition_intent_recorded';
  }
  return 'transition_intent_rejected';
}

function buildEvent(intent: StageTransitionIntent, decision: StageTransitionAuthorityDecision): StageTransitionAuthorityEvent {
  return {
    surface_kind: 'opl_stage_transition_authority_event',
    version: 'stage-transition-authority-event.v1',
    event_id: stableId('sta_event', [
      intent.stage_run_id,
      intent.generation,
      intent.idempotency_key,
      decision.decision_id,
    ]),
    event_kind: eventKind(decision.status),
    stage_run_id: intent.stage_run_id,
    generation: intent.generation,
    intent_id: intent.intent_id,
    decision_id: decision.decision_id,
    idempotency_key: intent.idempotency_key,
    observed_at: intent.observed_at,
    decision_status: decision.status,
    accepted_transition_ref: decision.accepted_transition_ref,
    current_owner_delta_ref: decision.current_owner_delta
      ? String(decision.current_owner_delta.lineage_ref)
      : null,
    authority_boundary: AUTHORITY_BOUNDARY,
  };
}

export function rebuildStageTransitionAuthorityReadModel(
  inputs: JsonRecord[],
): StageTransitionAuthorityReadModel {
  const byIdempotency = new Map<string, { intent: StageTransitionIntent; decision: StageTransitionAuthorityDecision }>();
  for (const input of inputs) {
    const intent = normalizeStageTransitionIntent(input);
    const key = [
      intent.stage_run_id,
      intent.generation,
      intent.idempotency_key,
    ].join('\\0');
    if (!byIdempotency.has(key)) {
      byIdempotency.set(key, {
        intent,
        decision: evaluateStageTransitionIntent(intent),
      });
    }
  }

  const events = [...byIdempotency.values()]
    .map(({ intent, decision }) => buildEvent(intent, decision))
    .sort((left, right) => left.observed_at.localeCompare(right.observed_at) || left.event_id.localeCompare(right.event_id));
  const byStageRun = new Map<string, StageTransitionAuthorityEvent[]>();
  for (const event of events) {
    byStageRun.set(event.stage_run_id, [...(byStageRun.get(event.stage_run_id) ?? []), event]);
  }

  return {
    surface_kind: 'opl_stage_transition_authority_read_model',
    version: 'stage-transition-authority.v1',
    projection_role: 'single_writer_stage_transition_projection',
    event_log_policy: 'append_only_events_folded_by_stage_run_generation_and_idempotency',
    stage_runs: [...byStageRun.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([stageRunId, stageRunEvents]) => {
        const observedGeneration = Math.max(...stageRunEvents.map((event) => event.generation));
        const currentEvents = stageRunEvents.filter((event) => event.generation === observedGeneration);
        const accepted = currentEvents
          .filter((event) => event.decision_status === 'transition_accepted')
          .at(-1) ?? null;
        const acceptedDecision = accepted
          ? [...byIdempotency.values()]
            .map(({ decision }) => decision)
            .find((decision) => decision.decision_id === accepted.decision_id) ?? null
          : null;
        const lastEvent = currentEvents.at(-1);
        if (!lastEvent) {
          throw new FrameworkContractError(
            'contract_shape_invalid',
            'Stage transition authority projection requires at least one current-generation event.',
            { stage_run_id: stageRunId },
          );
        }
        return {
          stage_run_id: stageRunId,
          observed_generation: observedGeneration,
          accepted_transition_ref: accepted?.accepted_transition_ref ?? null,
          current_owner_delta: acceptedDecision?.current_owner_delta ?? null,
          rejected_intent_count: currentEvents.filter((event) => event.decision_status === 'rejected').length,
          observation_intent_count: currentEvents.filter((event) => event.decision_status === 'observation_recorded').length,
          last_event_ref: lastEvent.event_id,
        };
      }),
    events,
    authority_boundary: AUTHORITY_BOUNDARY,
  };
}
