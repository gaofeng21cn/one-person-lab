import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import type { FamilyRuntimeDomainId } from './family-runtime-types.ts';

export const DOMAIN_ROUTE_TASK_KIND_PREFIX = 'domain_route/';
export const DOMAIN_ROUTE_STAGE_ROUTE_TASK_KIND = 'domain_route/stage-route';
export const DOMAIN_ROUTE_RECONCILE_APPLY_TASK_KIND = 'domain_route/reconcile-apply';
export const DOMAIN_ROUTE_RUNTIME_REQUEST_KIND = 'domain_route_stage_route';
export const DOMAIN_ROUTE_TASK_PROJECTION_SURFACE_KIND = 'opl_domain_route_task_projection';
export const DOMAIN_ROUTE_RUNTIME_REQUEST_SURFACE_KIND = 'opl_domain_route_runtime_request';
export const DOMAIN_RUNTIME_OWNER_ROUTE_HANDOFF = 'domain_runtime_owner_route_handoff';
export const OPL_RUNTIME_OWNER_ROUTE = 'opl_runtime_owner_route';

const DOMAIN_ROUTE_ACCEPTED_RUNTIME_RESPONSIBILITIES = [
  'stage_attempt_index',
  'stage_attempt_ledger',
  'liveness_projection',
  'provider_wakeup',
  'typed_blocker_or_temporal_failure_projection',
] as const;

const DOMAIN_ROUTE_AUTHORITY_BOUNDARY = {
  writes_domain_truth: false,
  writes_domain_quality_verdict: false,
  writes_domain_owner_receipt: false,
  writes_domain_typed_blocker: false,
  writes_domain_human_gate: false,
  writes_domain_current_package: false,
  writes_domain_artifact_body: false,
  writes_runtime_queue_from_projection: false,
  writes_opl_outbox_from_projection: false,
  writes_opl_event_from_projection: false,
  writes_opl_stage_run_from_projection: false,
  writes_provider_attempt_from_projection: false,
  provider_completion_is_domain_progress: false,
  provider_completion_is_domain_ready: false,
  sqlite_sidecar_is_projection_index_only: true,
  temporal_owns_attempt_lifecycle_retry_and_failure_history: true,
} as const;

type DomainRouteProjectionTask = {
  domain_id: string;
  task_kind: string;
  dedupe_key: string | null;
};

function recordField(value: unknown) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringField(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

export function domainRouteRuntimeRequest(payload: Record<string, unknown>) {
  const candidates = [
    recordField(payload.runtime_request),
    recordField(payload.domain_route_runtime_request),
    payload,
  ];
  return candidates.find((candidate) =>
    candidate?.surface_kind === DOMAIN_ROUTE_RUNTIME_REQUEST_SURFACE_KIND
    || candidate?.runtime_request_kind === DOMAIN_ROUTE_RUNTIME_REQUEST_KIND
  ) ?? null;
}

function routeEnvelope(payload: Record<string, unknown>) {
  return domainRouteRuntimeRequest(payload) ?? payload;
}

export function isDomainRouteTask(
  _domainId: string,
  taskKind: string,
  payload: Record<string, unknown> = {},
) {
  if (taskKind.startsWith(DOMAIN_ROUTE_TASK_KIND_PREFIX)) {
    return true;
  }
  const runtimeRequest = domainRouteRuntimeRequest(payload);
  return stringField(runtimeRequest?.task_kind)?.startsWith(DOMAIN_ROUTE_TASK_KIND_PREFIX) ?? false;
}

export function domainRouteActionRef(
  taskKind: string,
  payload: Record<string, unknown> = {},
) {
  const envelope = routeEnvelope(payload);
  return stringField(envelope.action_ref)
    ?? stringField(envelope.command_kind)
    ?? (taskKind.startsWith(DOMAIN_ROUTE_TASK_KIND_PREFIX) ? taskKind : null);
}

export function buildDomainRouteSupportProjection() {
  return {
    surface_kind: 'opl_domain_route_support_projection',
    schema_version: 1,
    canonical_surface_kind: DOMAIN_ROUTE_TASK_PROJECTION_SURFACE_KIND,
    runtime_request_surface_kind: DOMAIN_ROUTE_RUNTIME_REQUEST_SURFACE_KIND,
    runtime_request_kind: DOMAIN_ROUTE_RUNTIME_REQUEST_KIND,
    supported_task_kind_prefix: DOMAIN_ROUTE_TASK_KIND_PREFIX,
    canonical_task_kinds: [
      DOMAIN_ROUTE_STAGE_ROUTE_TASK_KIND,
      DOMAIN_ROUTE_RECONCILE_APPLY_TASK_KIND,
    ],
    action_ref_source: 'domain_route_runtime_request.command_kind_or_action_ref',
    profile_source: 'domain_owned_profile_ref',
    owner_route_handoff_ref: DOMAIN_RUNTIME_OWNER_ROUTE_HANDOFF,
    accepted_runtime_owner_route_ref: OPL_RUNTIME_OWNER_ROUTE,
    state_projection: [
      'domain_id',
      'command_kind',
      'route_target',
      'route_identity',
      'attempt_identity',
      'domain_route_handoff_ref',
      'domain_route_transaction_ref',
      'domain_route_command_ref',
      'source_refs',
    ],
    accepted_runtime_responsibilities: [...DOMAIN_ROUTE_ACCEPTED_RUNTIME_RESPONSIBILITIES],
    authority_boundary: DOMAIN_ROUTE_AUTHORITY_BOUNDARY,
  };
}

export function canonicalFamilyRuntimeTaskKind(
  domainId: FamilyRuntimeDomainId,
  taskKind: string,
) {
  const trimmed = taskKind.trim();
  if (trimmed.startsWith('runtime_') || trimmed.startsWith('runtime/')) {
    throw new FrameworkContractError(
      'cli_usage_error',
      'Repo-runtime task prefixes are retired; emit a domain-owned profile and use a canonical domain_route task kind.',
      {
        domain_id: domainId,
        task_kind: trimmed,
        replacement_task_kind: DOMAIN_ROUTE_RECONCILE_APPLY_TASK_KIND,
        tombstone_policy: 'legacy_negative_tests_only',
      },
    );
  }
  return trimmed;
}

export function domainRouteProjection(
  task: DomainRouteProjectionTask,
  payload: Record<string, unknown>,
) {
  if (!isDomainRouteTask(task.domain_id, task.task_kind, payload)) {
    return null;
  }
  const envelope = routeEnvelope(payload);
  const routeIdentity = recordField(envelope.route_identity);
  const attemptIdentity = recordField(envelope.attempt_identity);
  const authorityBoundary = recordField(envelope.authority_boundary);
  return {
    surface_kind: DOMAIN_ROUTE_TASK_PROJECTION_SURFACE_KIND,
    schema_version: 1,
    projection_kind: 'domain_route',
    domain_id: task.domain_id,
    task_kind: task.task_kind,
    status: stringField(envelope.status),
    wait_kind: stringField(envelope.wait_kind),
    profile_ref: stringField(envelope.profile_ref),
    command_kind: stringField(envelope.command_kind),
    action_ref: domainRouteActionRef(task.task_kind, payload),
    route_target: stringField(envelope.route_target),
    route_identity: routeIdentity,
    attempt_identity: attemptIdentity,
    domain_route_handoff_ref: stringField(envelope.domain_route_handoff_ref),
    domain_route_transaction_ref: stringField(envelope.domain_route_transaction_ref),
    domain_route_command_ref: stringField(envelope.domain_route_command_ref),
    source_refs: stringArray(envelope.source_refs),
    blockers: Array.isArray(envelope.blockers) ? envelope.blockers : [],
    can_submit_to_opl_runtime: envelope.can_submit_to_opl_runtime === true,
    runtime_request: domainRouteRuntimeRequest(payload),
    idempotency_key: task.dedupe_key
      ?? stringField(routeIdentity?.dedupe_key)
      ?? stringField(routeIdentity?.request_idempotency_key),
    queue_owner: 'one-person-lab',
    exported_authority_boundary: authorityBoundary,
    authority_boundary: DOMAIN_ROUTE_AUTHORITY_BOUNDARY,
    owner_route_handoff: {
      handoff_ref: DOMAIN_RUNTIME_OWNER_ROUTE_HANDOFF,
      accepted_by: OPL_RUNTIME_OWNER_ROUTE,
      accepted_runtime_responsibilities: [...DOMAIN_ROUTE_ACCEPTED_RUNTIME_RESPONSIBILITIES],
      authority_boundary: DOMAIN_ROUTE_AUTHORITY_BOUNDARY,
    },
  };
}
