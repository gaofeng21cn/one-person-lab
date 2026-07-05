import fs from 'node:fs';

import { resolveOplStatePaths, type OplStatePaths } from '../../kernel/runtime-state-paths.ts';
import { stableId } from '../../kernel/stable-id.ts';
import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import {
  readJsonPayloadFile,
  writeJsonPayloadFile,
} from '../../kernel/json-file.ts';
import { ensureOplStateDir } from '../../kernel/runtime-state-paths.ts';

type JsonRecord = Record<string, unknown>;

export type FeedbackKind =
  | 'bug'
  | 'quality_gap'
  | 'missing_requirement'
  | 'usability'
  | 'style'
  | 'safety'
  | 'owner_gate';

export type DeliveryFeedbackEventInput = {
  targetAgentId: string;
  deliveryRef: string;
  feedbackRef: string;
  feedbackKind?: FeedbackKind;
  feedbackTextRef?: string | null;
  externalSuiteRef?: string | null;
  developerWorkOrderCandidateRef?: string | null;
  completionRef?: string | null;
  blockerRef?: string | null;
  failureTokens?: string[];
  failureEvidenceRefs?: string[];
  capabilityHitRefs?: string[];
  canonicalTargetPaths?: string[];
  requiredVerificationRefs?: string[];
  forbiddenSurfaces?: string[];
  ownerCloseoutBoundaryRef?: string | null;
  idempotencyKey?: string | null;
  sourceRef?: string | null;
};

export type SelfEvolutionCapabilityHitInput = {
  capabilityId: string;
  canonicalTargetPaths: string[];
  requiredVerificationRefs: string[];
  forbiddenSurfaces: string[];
  owner?: string | null;
  ownerCloseoutBoundaryRef?: string | null;
};

export type SelfEvolutionWorkOrderInput = {
  targetAgentId: string;
  feedbackRef: string;
  failureEvidenceRefs: string[];
  failureTokens: string[];
  capabilityHits: SelfEvolutionCapabilityHitInput[];
  sourceRef?: string | null;
};

const FAILURE_TOKEN_REGISTRY_REF = 'contracts/opl-framework/agent-lab-failure-token-registry.json';
const SELF_EVOLUTION_WORK_ORDER_SCHEMA_REF = 'contracts/opl-framework/self-evolution-work-order.schema.json';

const SELF_EVOLUTION_AUTHORITY_BOUNDARY = {
  can_write_domain_truth: false,
  can_write_memory_body: false,
  can_mutate_artifact_body: false,
  can_sign_owner_receipt: false,
  can_create_typed_blocker: false,
  can_authorize_quality_or_export: false,
  can_claim_domain_ready: false,
  can_claim_production_ready: false,
};

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(value
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    .map((entry) => entry.trim()))];
}

function requiredStringList(value: string[], field: string) {
  const normalized = stringList(value);
  if (normalized.length === 0) {
    throw new FrameworkContractError('contract_shape_invalid', `Self-evolution work order requires ${field}.`, {
      field,
    });
  }
  return normalized;
}

function nowIso() {
  return new Date().toISOString();
}

function requiredString(value: string, field: string) {
  const normalized = value.trim();
  if (!normalized) {
    throw new FrameworkContractError('contract_shape_invalid', `Delivery feedback event requires ${field}.`, {
      field,
    });
  }
  return normalized;
}

function defaultIdempotencyKey(input: DeliveryFeedbackEventInput) {
  return [
    input.targetAgentId,
    input.deliveryRef,
    input.feedbackRef,
    input.feedbackKind ?? 'quality_gap',
  ].map((value) => value.trim()).join('|');
}

export function buildDeliveryFeedbackEvent(input: DeliveryFeedbackEventInput) {
  const targetAgentId = requiredString(input.targetAgentId, 'targetAgentId');
  const deliveryRef = requiredString(input.deliveryRef, 'deliveryRef');
  const feedbackRef = requiredString(input.feedbackRef, 'feedbackRef');
  const feedbackKind = input.feedbackKind ?? 'quality_gap';
  const idempotencyKey = input.idempotencyKey?.trim() || defaultIdempotencyKey({
    ...input,
    targetAgentId,
    deliveryRef,
    feedbackRef,
    feedbackKind,
  });
  const externalSuiteRef = input.externalSuiteRef?.trim()
    || `domain-feedback-external-suite-ref:${targetAgentId}/${stableId('feedback_suite', [idempotencyKey])}`;
  const eventId = stableId('feedback_event', [idempotencyKey]);

  return {
    surface_kind: 'opl_delivery_feedback_event',
    version: 'opl-feedbackops.v1',
    event_id: eventId,
    idempotency_key: idempotencyKey,
    target_agent_id: targetAgentId,
    delivery_ref: deliveryRef,
    feedback_ref: feedbackRef,
    feedback_text_ref: input.feedbackTextRef?.trim() || feedbackRef,
    feedback_kind: feedbackKind,
    explicitness: 'explicit_user_revision',
    status: 'captured',
    source_ref: input.sourceRef?.trim() || 'opl feedback submit',
    created_at: nowIso(),
    accepted_feedback_profiles: [
      'target_agent_feedback_external_suite',
    ],
    external_suite_ref: externalSuiteRef,
    developer_work_order_candidate_ref: input.developerWorkOrderCandidateRef?.trim() || null,
    completion_ref: input.completionRef?.trim() || null,
    blocker_ref: input.blockerRef?.trim() || null,
    failure_token_registry_ref: FAILURE_TOKEN_REGISTRY_REF,
    self_evolution_work_order_schema_ref: SELF_EVOLUTION_WORK_ORDER_SCHEMA_REF,
    failure_tokens: stringList(input.failureTokens),
    failure_evidence_refs: stringList(input.failureEvidenceRefs),
    capability_hit_refs: stringList(input.capabilityHitRefs),
    canonical_target_paths: stringList(input.canonicalTargetPaths),
    required_verification_refs: stringList(input.requiredVerificationRefs),
    forbidden_surfaces: stringList(input.forbiddenSurfaces),
    owner_closeout_boundary_ref: input.ownerCloseoutBoundaryRef?.trim() || null,
    developer_mode_required_for_execution: true,
    authority_boundary: {
      can_write_target_domain_truth: false,
      can_write_target_domain_memory_body: false,
      can_mutate_target_domain_artifact_body: false,
      can_authorize_target_domain_quality_or_export: false,
      can_create_owner_receipt: false,
      can_create_typed_blocker: false,
      can_create_human_gate: false,
    },
  };
}

function ownerCloseoutBoundary(owner: string, boundaryRef?: string | null) {
  return {
    owner,
    boundary_ref: boundaryRef ?? `owner-closeout-boundary-ref:${owner}`,
    required_return_shapes: [
      'owner_receipt_ref',
      'typed_blocker_ref',
      'human_gate_ref',
      'route_back_ref',
    ],
    oma_can_write_owner_receipt_body: false,
    agent_lab_can_create_typed_blocker: false,
    target_owner_acceptance_required: true,
  };
}

export function buildSelfEvolutionWorkOrderCandidate(input: SelfEvolutionWorkOrderInput) {
  const targetAgentId = requiredString(input.targetAgentId, 'targetAgentId');
  const feedbackRef = requiredString(input.feedbackRef, 'feedbackRef');
  const failureEvidenceRefs = requiredStringList(input.failureEvidenceRefs, 'failureEvidenceRefs');
  const failureTokens = requiredStringList(input.failureTokens, 'failureTokens');
  if (input.capabilityHits.length === 0) {
    throw new FrameworkContractError('contract_shape_invalid', 'Self-evolution work order requires capabilityHits.', {
      field: 'capabilityHits',
    });
  }
  const capabilityHits = input.capabilityHits.map((hit) => {
    const capabilityId = requiredString(hit.capabilityId, 'capabilityHits.capabilityId');
    const canonicalTargetPaths = requiredStringList(hit.canonicalTargetPaths, `${capabilityId}.canonicalTargetPaths`);
    const requiredVerificationRefs = requiredStringList(
      hit.requiredVerificationRefs,
      `${capabilityId}.requiredVerificationRefs`,
    );
    const forbiddenSurfaces = requiredStringList(hit.forbiddenSurfaces, `${capabilityId}.forbiddenSurfaces`);
    const owner = hit.owner?.trim() || targetAgentId;
    return {
      capability_id: capabilityId,
      canonical_target_paths: canonicalTargetPaths,
      required_verification_refs: requiredVerificationRefs,
      forbidden_surfaces: forbiddenSurfaces,
      owner_closeout_boundary: ownerCloseoutBoundary(owner, hit.ownerCloseoutBoundaryRef),
    };
  });
  const canonicalTargetPaths = [...new Set(capabilityHits.flatMap((hit) => hit.canonical_target_paths))];
  const requiredVerificationRefs = [...new Set(capabilityHits.flatMap((hit) => hit.required_verification_refs))];
  const forbiddenSurfaces = [...new Set(capabilityHits.flatMap((hit) => hit.forbidden_surfaces))];
  const workOrderId = stableId('self_evolution_work_order', [
    targetAgentId,
    feedbackRef,
    failureEvidenceRefs,
    failureTokens,
    capabilityHits.map((hit) => hit.capability_id),
  ]);

  return {
    surface_kind: 'opl_self_evolution_work_order_candidate',
    schema_version: 'opl.self-evolution-work-order.v1',
    schema_ref: SELF_EVOLUTION_WORK_ORDER_SCHEMA_REF,
    work_order_id: workOrderId,
    target_agent_id: targetAgentId,
    source_ref: input.sourceRef?.trim() || feedbackRef,
    feedback_ref: feedbackRef,
    failure_token_registry_ref: FAILURE_TOKEN_REGISTRY_REF,
    failure_evidence_refs: failureEvidenceRefs,
    failure_tokens: failureTokens,
    capability_hits: capabilityHits,
    canonical_target_paths: canonicalTargetPaths,
    required_verification_refs: requiredVerificationRefs,
    forbidden_surfaces: forbiddenSurfaces,
    owner_closeout_boundary: ownerCloseoutBoundary(targetAgentId),
    executable_by: 'opl work-order execute',
    execution_requires_developer_mode: true,
    authority_boundary: SELF_EVOLUTION_AUTHORITY_BOUNDARY,
  };
}

export function readFeedbackOpsEvents(paths: OplStatePaths = resolveOplStatePaths()) {
  if (!fs.existsSync(paths.agent_lab_feedbackops_event_ledger_file)) {
    return [];
  }
  const parsed = readJsonPayloadFile(paths.agent_lab_feedbackops_event_ledger_file);
  if (!Array.isArray(parsed)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'FeedbackOps event ledger must be a JSON array.',
      {
        file: paths.agent_lab_feedbackops_event_ledger_file,
      },
    );
  }
  return parsed.filter(isRecord);
}

function writeFeedbackOpsEvents(events: JsonRecord[], paths: OplStatePaths) {
  ensureOplStateDir(paths);
  writeJsonPayloadFile(paths.agent_lab_feedbackops_event_ledger_file, events);
}

export function submitDeliveryFeedbackEvent(
  input: DeliveryFeedbackEventInput,
  paths: OplStatePaths = resolveOplStatePaths(),
) {
  const event = buildDeliveryFeedbackEvent(input);
  const events = readFeedbackOpsEvents(paths);
  const existing = events.find((entry) => entry.idempotency_key === event.idempotency_key);
  if (existing) {
    return {
      surface_kind: 'opl_feedbackops_submit_receipt',
      status: 'duplicate_idempotent_event',
      event: existing,
      ledger_file: paths.agent_lab_feedbackops_event_ledger_file,
    };
  }
  events.push(event);
  writeFeedbackOpsEvents(events, paths);
  return {
    surface_kind: 'opl_feedbackops_submit_receipt',
    status: 'captured',
    event,
    ledger_file: paths.agent_lab_feedbackops_event_ledger_file,
  };
}

function targetAuthorityForAgent(developerMode: JsonRecord, targetAgentId: string) {
  const targetAuthority = asRecord(developerMode.target_authority);
  const standardTargets = targetAuthority?.standard_targets;
  if (!Array.isArray(standardTargets)) {
    return null;
  }
  return standardTargets
    .map((entry) => asRecord(entry))
    .find((entry) => entry && asString(entry.target_agent_id) === targetAgentId) ?? null;
}

function targetAuthorityAllowsExecution(targetAuthority: JsonRecord | null) {
  if (!targetAuthority) {
    return false;
  }
  const status = asString(targetAuthority.status);
  const allowedRoute = asString(targetAuthority.allowed_route);
  return (
    status !== 'blocked'
    && status !== 'disabled'
    && allowedRoute === 'direct_repo_fix'
  );
}

function developerModeExecutionGate(targetAgentId: string, developerMode: JsonRecord | null | undefined) {
  if (!developerMode) {
    return {
      executable: false,
      route_scope: 'none',
      target_authority: null,
    };
  }

  const targetAuthority = targetAuthorityForAgent(developerMode, targetAgentId);
  if (targetAuthority) {
    return {
      executable: targetAuthorityAllowsExecution(targetAuthority),
      route_scope: 'target_scoped',
      target_authority: targetAuthority,
    };
  }

  return {
    executable:
      asString(developerMode.effective_state) === 'active_direct'
      || asString(developerMode.allowed_route) === 'direct_repo_fix',
    route_scope: 'global_fallback',
    target_authority: null,
  };
}

function statusForEvent(event: JsonRecord, developerMode: JsonRecord | null | undefined) {
  if (asString(event.completion_ref) || asString(event.blocker_ref)) {
    return {
      status: 'completed_or_blocker',
      route_scope: 'none',
      target_authority: null,
    };
  }
  if (asString(event.developer_work_order_candidate_ref)) {
    const targetAgentId = asString(event.target_agent_id) ?? 'unknown-agent';
    const gate = developerModeExecutionGate(targetAgentId, developerMode);
    return {
      status: gate.executable ? 'executable' : 'queued_requires_developer_mode',
      route_scope: gate.route_scope,
      target_authority: gate.target_authority,
    };
  }
  return {
    status: 'suite_ready',
    route_scope: 'none',
    target_authority: null,
  };
}

export function buildFeedbackOpsReadModel(input: {
  events?: JsonRecord[];
  developerMode?: JsonRecord | null;
} = {}) {
  const events = input.events ?? readFeedbackOpsEvents();
  const statusItems = events.map((event) => {
    const statusDecision = statusForEvent(event, input.developerMode);
    const status = statusDecision.status;
    const targetAgentId = asString(event.target_agent_id) ?? 'unknown-agent';
    const eventId = asString(event.event_id) ?? stableId('feedback_event', [event]);
    const workOrderRef = `feedback-work-order:${targetAgentId}/${eventId}`;
    return {
      surface_kind: 'opl_feedbackops_status_item',
      work_order_ref: workOrderRef,
      event_id: eventId,
      domain_id: targetAgentId,
      status,
      state: status,
      trigger_ref: asString(event.feedback_ref),
      delivery_ref: asString(event.delivery_ref),
      feedback_ref: asString(event.feedback_ref),
      external_suite_ref: asString(event.external_suite_ref),
      developer_work_order_candidate_ref: asString(event.developer_work_order_candidate_ref),
      completion_ref: asString(event.completion_ref),
      blocker_ref: asString(event.blocker_ref),
      failure_token_registry_ref: asString(event.failure_token_registry_ref) ?? FAILURE_TOKEN_REGISTRY_REF,
      self_evolution_work_order_schema_ref:
        asString(event.self_evolution_work_order_schema_ref) ?? SELF_EVOLUTION_WORK_ORDER_SCHEMA_REF,
      failure_tokens: stringList(event.failure_tokens),
      failure_evidence_refs: stringList(event.failure_evidence_refs),
      capability_hit_refs: stringList(event.capability_hit_refs),
      canonical_target_paths: stringList(event.canonical_target_paths),
      required_verification_refs: stringList(event.required_verification_refs),
      forbidden_surfaces: stringList(event.forbidden_surfaces),
      owner_closeout_boundary_ref: asString(event.owner_closeout_boundary_ref),
      developer_mode_route_scope: statusDecision.route_scope,
      developer_mode_target_authority: statusDecision.target_authority,
      runnable: status === 'executable',
      terminal: status === 'completed_or_blocker',
      action_route_ref: status === 'executable'
        ? `work-order-execute-candidate:${targetAgentId}/${eventId}`
        : null,
      execution_surface: status === 'executable' ? 'opl work-order execute' : null,
      execution_precondition: status === 'queued_requires_developer_mode'
        ? statusDecision.route_scope === 'target_scoped'
          ? 'target_scoped_developer_mode_direct_route_required'
          : 'developer_mode_active_direct_required'
        : status === 'executable'
          ? 'materialized_developer_work_order_file_required'
          : 'external_suite_or_owner_closeout_required',
      authority_boundary: event.authority_boundary,
    };
  });

  return {
    surface_kind: 'opl_feedbackops_read_model',
    version: 'opl-feedbackops.v1',
    read_model_id: stableId('feedbackops', [events, statusItems]),
    status: 'ready',
    refs_only: true,
    intake_event_count: events.length,
    status_items: statusItems,
    work_order_status_items: statusItems,
    status_buckets: {
      suite_ready: statusItems.filter((item) => item.status === 'suite_ready').map((item) => item.work_order_ref),
      queued_requires_developer_mode: statusItems
        .filter((item) => item.status === 'queued_requires_developer_mode')
        .map((item) => item.work_order_ref),
      executable: statusItems.filter((item) => item.status === 'executable').map((item) => item.work_order_ref),
      completed_or_blocker: statusItems
        .filter((item) => item.status === 'completed_or_blocker')
        .map((item) => item.work_order_ref),
    },
    summary: {
      suite_ready_count: statusItems.filter((item) => item.status === 'suite_ready').length,
      queued_requires_developer_mode_count: statusItems
        .filter((item) => item.status === 'queued_requires_developer_mode').length,
      executable_count: statusItems.filter((item) => item.status === 'executable').length,
      completed_or_blocker_count: statusItems.filter((item) => item.status === 'completed_or_blocker').length,
    },
    app_projection: {
      surface_kind: 'opl_feedbackops_app_projection',
      app_state_ref: 'app_state.operator.workbench.feedbackops',
      action_surface: 'opl work-order execute',
      creates_runner_or_queue: false,
      writes_runtime_db: false,
      writes_provider_queue: false,
      writes_domain_truth: false,
    },
    authority_boundary: {
      can_write_target_domain_truth: false,
      can_write_target_domain_memory_body: false,
      can_mutate_target_domain_artifact_body: false,
      can_authorize_target_domain_quality_or_export: false,
      can_create_owner_receipt: false,
      can_create_typed_blocker: false,
      can_create_human_gate: false,
    },
  };
}

export function buildFeedbackOpsReconcileReceipt(input: {
  developerMode?: JsonRecord | null;
} = {}) {
  return {
    surface_kind: 'opl_feedbackops_reconcile_receipt',
    status: 'reconciled_refs_only',
    read_model: buildFeedbackOpsReadModel({ developerMode: input.developerMode }),
    execution_owner: 'opl_work_order_execute_when_developer_mode_allows',
  };
}
