import { FrameworkContractError } from './contracts.ts';
import type { FamilyRuntimeDomainId } from './family-runtime-types.ts';

export const MAS_DOMAIN_ROUTE_RECONCILE_APPLY = 'domain_route/reconcile-apply';
export const MAS_DOMAIN_ROUTE_RECONCILE_APPLY_ACTION = 'domain_route_reconcile_apply';
export const MAS_PUBLICATION_AFTERCARE_ANALYSIS_QUEUE = 'publication_aftercare/analysis-queue-progress';
export const MAS_PUBLICATION_AFTERCARE_REVIEWER_REFRESH = 'publication_aftercare/reviewer-refresh';

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

export function isMasDomainRouteReconcileApply(domainId: string, taskKind: string) {
  return domainId === 'medautoscience'
    && taskKind === MAS_DOMAIN_ROUTE_RECONCILE_APPLY;
}

export function isMasOwnerRouteTask(domainId: string, taskKind: string) {
  return domainId === 'medautoscience' && MAS_OWNER_ROUTE_TASK_ACTIONS.has(taskKind);
}

function arrayField(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function stringField(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
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
    idempotency_key: task.dedupe_key,
    authority_boundary: {
      writes_mas_truth: false,
      writes_publication_quality: false,
      writes_artifact_gate: false,
      writes_current_package: false,
      queue_owns_attempts_retry_and_dead_letter: true,
    },
  };
}
