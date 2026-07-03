import fs from 'node:fs';

import { FrameworkContractError } from '../charter/index.ts';
import {
  ensureOplStateDir,
  resolveOplStatePaths,
  stableId,
  type OplStatePaths,
} from '../runway/index.ts';

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
  idempotencyKey?: string | null;
  sourceRef?: string | null;
};

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
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

export function readFeedbackOpsEvents(paths: OplStatePaths = resolveOplStatePaths()) {
  if (!fs.existsSync(paths.agent_lab_feedbackops_event_ledger_file)) {
    return [];
  }
  const parsed = JSON.parse(fs.readFileSync(paths.agent_lab_feedbackops_event_ledger_file, 'utf8'));
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
  fs.writeFileSync(
    paths.agent_lab_feedbackops_event_ledger_file,
    `${JSON.stringify(events, null, 2)}\n`,
    'utf8',
  );
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

function developerModeExecutionAllowed(developerMode: JsonRecord | null | undefined) {
  if (!developerMode) {
    return false;
  }
  return (
    asString(developerMode.effective_state) === 'active_direct'
    || asString(developerMode.allowed_route) === 'direct_repo_fix'
  );
}

function statusForEvent(event: JsonRecord, developerMode: JsonRecord | null | undefined) {
  if (asString(event.completion_ref) || asString(event.blocker_ref)) {
    return 'completed_or_blocker';
  }
  if (asString(event.developer_work_order_candidate_ref)) {
    return developerModeExecutionAllowed(developerMode) ? 'executable' : 'queued_requires_developer_mode';
  }
  return 'suite_ready';
}

export function buildFeedbackOpsReadModel(input: {
  events?: JsonRecord[];
  developerMode?: JsonRecord | null;
} = {}) {
  const events = input.events ?? readFeedbackOpsEvents();
  const statusItems = events.map((event) => {
    const status = statusForEvent(event, input.developerMode);
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
      runnable: status === 'executable',
      terminal: status === 'completed_or_blocker',
      action_route_ref: status === 'executable'
        ? `work-order-execute-candidate:${targetAgentId}/${eventId}`
        : null,
      execution_surface: status === 'executable' ? 'opl work-order execute' : null,
      execution_precondition: status === 'queued_requires_developer_mode'
        ? 'developer_mode_active_direct_required'
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
