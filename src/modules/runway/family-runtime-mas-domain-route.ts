import { FrameworkContractError } from '../charter/contracts.ts';
import type { FamilyRuntimeDomainId } from './family-runtime-types.ts';

export const MAS_DOMAIN_ROUTE_RECONCILE_APPLY = 'domain_route/reconcile-apply';
export const MAS_DOMAIN_ROUTE_RECONCILE_APPLY_ACTION = 'domain_route_reconcile_apply';
export const MAS_RUNTIME_OWNER_ROUTE_HANDOFF = 'mas_runtime_owner_route_handoff';
export const OPL_RUNTIME_OWNER_ROUTE = 'opl_runtime_owner_route';
const MAS_PUBLICATION_AFTERCARE_ANALYSIS_QUEUE = 'publication_aftercare/analysis-queue-progress';
const MAS_PUBLICATION_AFTERCARE_REVIEWER_REFRESH = 'publication_aftercare/reviewer-refresh';

const MAS_DOMAIN_ROUTE_SUPPORTED_TASK_KINDS = [
  MAS_DOMAIN_ROUTE_RECONCILE_APPLY,
  MAS_PUBLICATION_AFTERCARE_ANALYSIS_QUEUE,
  MAS_PUBLICATION_AFTERCARE_REVIEWER_REFRESH,
] as const;

const MAS_DOMAIN_ROUTE_ACTION_REFS = [
  MAS_DOMAIN_ROUTE_RECONCILE_APPLY_ACTION,
  'ai_reviewer_recheck_execute_dispatch',
] as const;

const MAS_DOMAIN_ROUTE_STATE_PROJECTION_FIELDS = [
  'study_id',
  'route_ref',
  'action_ref',
  'source_refs',
  'source_fingerprint',
  'idempotency_key',
] as const;

const MAS_DOMAIN_ROUTE_ACCEPTED_RUNTIME_RESPONSIBILITIES = [
  'generic_runtime_queue',
  'stage_attempt_ledger',
  'liveness_projection',
  'provider_wakeup',
  'redrive_retry_dead_letter',
] as const;

const MAS_DOMAIN_ROUTE_AUTHORITY_BOUNDARY =
  'OPL queues and dispatches MAS domain route refs but never writes MAS truth, publication quality, artifact gates, or current_package.';

type MasDomainRouteProjectionTask = {
  domain_id: string;
  task_kind: string;
  dedupe_key: string | null;
};

const MAS_OWNER_ROUTE_TASK_ACTIONS = new Map([
  [MAS_DOMAIN_ROUTE_RECONCILE_APPLY, MAS_DOMAIN_ROUTE_RECONCILE_APPLY_ACTION],
  [MAS_PUBLICATION_AFTERCARE_ANALYSIS_QUEUE, MAS_DOMAIN_ROUTE_RECONCILE_APPLY_ACTION],
  [MAS_PUBLICATION_AFTERCARE_REVIEWER_REFRESH, 'ai_reviewer_recheck_execute_dispatch'],
]);

export function buildMasDomainRouteSupportProjection() {
  return {
    owner_route_handoff_ref: MAS_RUNTIME_OWNER_ROUTE_HANDOFF,
    accepted_runtime_owner_route_ref: OPL_RUNTIME_OWNER_ROUTE,
    supported_task_kinds: [...MAS_DOMAIN_ROUTE_SUPPORTED_TASK_KINDS],
    action_refs: [...MAS_DOMAIN_ROUTE_ACTION_REFS],
    state_projection: [...MAS_DOMAIN_ROUTE_STATE_PROJECTION_FIELDS],
    repair_command: 'medautosci domain-handler dispatch --task <task.json> --format json',
    accepted_runtime_responsibilities: [...MAS_DOMAIN_ROUTE_ACCEPTED_RUNTIME_RESPONSIBILITIES],
    authority_boundary: MAS_DOMAIN_ROUTE_AUTHORITY_BOUNDARY,
  };
}

export function canonicalFamilyRuntimeTaskKind(
  domainId: FamilyRuntimeDomainId,
  taskKind: string,
) {
  const trimmed = taskKind.trim();
  if (domainId === 'medautoscience' && retiredMasRuntimePrefix(trimmed)) {
    throw new FrameworkContractError(
      'cli_usage_error',
      'MAS family runtime task kinds with repo-runtime prefixes are retired; use the domain route task kind.',
      {
        task_kind: trimmed,
        replacement_task_kind: MAS_DOMAIN_ROUTE_RECONCILE_APPLY,
        tombstone_policy: 'legacy_negative_tests_only',
      },
    );
  }
  return trimmed;
}

function retiredMasRuntimePrefix(taskKind: string) {
  return taskKind.startsWith('runtime_') || taskKind.startsWith('runtime/');
}

function isMasDomainRouteReconcileApply(domainId: string, taskKind: string) {
  return domainId === 'medautoscience'
    && taskKind === MAS_DOMAIN_ROUTE_RECONCILE_APPLY;
}

export function isMasOwnerRouteTask(domainId: string, taskKind: string) {
  return domainId === 'medautoscience' && MAS_OWNER_ROUTE_TASK_ACTIONS.has(taskKind);
}

export function masOwnerRouteActionRef(taskKind: string) {
  return MAS_OWNER_ROUTE_TASK_ACTIONS.get(taskKind) ?? null;
}

function arrayField(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function stringField(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function recordField(value: unknown) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function masDomainRouteProjection(
  task: MasDomainRouteProjectionTask,
  payload: Record<string, unknown>,
) {
  if (!isMasOwnerRouteTask(task.domain_id, task.task_kind)) {
    return null;
  }
  const actionRef = MAS_OWNER_ROUTE_TASK_ACTIONS.get(task.task_kind);
  return {
    surface_kind: 'opl_mas_domain_route_task_projection',
    domain_truth_owner: 'med-autoscience',
    queue_owner: 'one-person-lab',
    route_ref: task.task_kind,
    action_ref: actionRef,
    study_id: stringField(payload.study_id),
    source_refs: arrayField(payload.source_refs),
    source_fingerprint: stringField(payload.source_fingerprint),
    owner_route_refs: arrayField(payload.owner_route_refs),
    owner_receipt_refs: arrayField(payload.owner_receipt_refs),
    typed_blocker_refs: arrayField(payload.typed_blocker_refs),
    publication_aftercare_reason: stringField(payload.publication_aftercare_reason),
    runtime_owner_route_reason: stringField(payload.reason ?? payload.continuation_reason),
    runtime_state_path: stringField(payload.runtime_state_path),
    exported_queue_owner: stringField(payload.queue_owner),
    exported_domain_truth_owner: stringField(payload.domain_truth_owner),
    exported_recommended_task_kind: stringField(payload.recommended_task_kind),
    idempotency_key: task.dedupe_key,
    authority_boundary: {
      writes_mas_truth: false,
      writes_publication_quality: false,
      writes_artifact_gate: false,
      writes_current_package: false,
      queue_owns_attempts_retry_and_dead_letter: true,
      opl_owns_generic_runtime_queue_attempt_liveness_redrive: true,
    },
    owner_route_handoff: {
      exported_handoff: recordField(payload.opl_runtime_owner_route_handoff),
      handoff_ref: MAS_RUNTIME_OWNER_ROUTE_HANDOFF,
      accepted_by: OPL_RUNTIME_OWNER_ROUTE,
      accepted_runtime_responsibilities: [
        'generic_runtime_queue',
        'stage_attempt_ledger',
        'liveness_projection',
        'provider_wakeup',
        'redrive_retry_dead_letter',
      ],
      retained_domain_owner: 'med-autoscience',
      authority_boundary: {
        writes_domain_truth: false,
        writes_domain_artifacts: false,
        writes_domain_quality_verdict: false,
        writes_current_package: false,
      },
    },
  };
}
