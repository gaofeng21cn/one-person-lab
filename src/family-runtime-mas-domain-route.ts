import { FrameworkContractError } from './contracts.ts';
import type { FamilyRuntimeDomainId } from './family-runtime-types.ts';

export const MAS_DOMAIN_ROUTE_RECONCILE_APPLY = 'domain_route/reconcile-apply';
export const MAS_DOMAIN_ROUTE_RECONCILE_APPLY_ACTION = 'domain_route_reconcile_apply';

type MasDomainRouteProjectionTask = {
  domain_id: string;
  task_kind: string;
  dedupe_key: string | null;
};

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

export function masDomainRouteProjection(
  task: MasDomainRouteProjectionTask,
  payload: Record<string, unknown>,
) {
  if (!isMasDomainRouteReconcileApply(task.domain_id, task.task_kind)) {
    return null;
  }
  return {
    surface_kind: 'opl_mas_domain_route_task_projection',
    domain_truth_owner: 'med-autoscience',
    queue_owner: 'one-person-lab',
    route_ref: MAS_DOMAIN_ROUTE_RECONCILE_APPLY,
    action_ref: MAS_DOMAIN_ROUTE_RECONCILE_APPLY_ACTION,
    study_id: typeof payload.study_id === 'string' ? payload.study_id : null,
    source_refs: Array.isArray(payload.source_refs) ? payload.source_refs : [],
    source_fingerprint: typeof payload.source_fingerprint === 'string' ? payload.source_fingerprint : null,
    idempotency_key: task.dedupe_key,
    authority_boundary: {
      writes_mas_truth: false,
      writes_publication_quality: false,
      writes_artifact_gate: false,
      writes_current_package: false,
    },
  };
}
