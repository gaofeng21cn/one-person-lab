import {
  record,
  recordList,
  stringValue,
  type JsonRecord,
} from '../../../kernel/json-record.ts';
import {
  buildAppDrilldownRefsOnlyAuthorityBoundaryCore,
} from './authority-boundary.ts';
import { buildOperatorActionRoute, uniqueRefs } from './value-utils.ts';

function schedulerAction(role: string | null) {
  if (role === 'scheduler_cadence_status') {
    return { action: 'status', actionKind: 'provider_scheduler_status', mutation: false, diagnostic: true };
  }
  if (role === 'scheduler_cadence_install_or_update') {
    return { action: 'install', actionKind: 'provider_scheduler_install', mutation: true, diagnostic: false };
  }
  if (role === 'scheduler_cadence_manual_trigger') {
    return { action: 'trigger', actionKind: 'provider_scheduler_trigger', mutation: true, diagnostic: false };
  }
  return null;
}

function providerSloAction(role: string | null) {
  if (role === 'provider_slo:provider_slo_cadence_execution') {
    return {
      action: 'production-proof',
      actionKind: 'provider_slo_cadence_execution',
      args: ['residency', 'proof', '--provider', 'temporal', '--production'],
    };
  }
  return null;
}

function refsOnlyAuthorityBoundary() {
  return {
    opl: 'provider_scheduler_safe_action_shell',
    provider: 'runtime_slo_receipt_owner',
    can_install_domain_daemon: false,
    ...buildAppDrilldownRefsOnlyAuthorityBoundaryCore(),
  };
}

function providerWorkerMutationGuardRouteBlock(providerWorkerActionRoutes: JsonRecord[]) {
  const blockedRoute = providerWorkerActionRoutes.find((route) =>
    stringValue(route.route_status) === 'blocked_by_provider_worker_mutation_guard'
    || stringValue(route.default_actionability_status) === 'blocked_by_provider_worker_mutation_guard'
  );
  if (!blockedRoute) {
    return {};
  }
  return {
    route_status: 'blocked_by_provider_worker_mutation_guard',
    route_status_detail:
      stringValue(blockedRoute.route_status_detail)
      ?? 'Run the managed runtime/current OPL CLI, set OPL_STATE_DIR for an isolated developer worker, explicitly enable OPL Developer Mode developer_apply_safe, or set OPL_ALLOW_DEVELOPER_CHECKOUT_SHARED_WORKER=1.',
    default_actionable: false,
    default_actionability_status: 'blocked_by_provider_worker_mutation_guard',
    provider_worker_mutation_guard: record(blockedRoute.provider_worker_mutation_guard),
    provider_worker_blocked_action_id: stringValue(blockedRoute.action_id),
    provider_worker_repair_action_id: stringValue(blockedRoute.provider_worker_repair_action_id),
    can_submit_to_safe_action_shell: false,
  };
}

export function buildProviderSchedulerActionRoutes(
  periodicExecutionRefs: JsonRecord,
  input: { providerWorkerActionRoutes?: JsonRecord[] } = {},
) {
  const workerMutationGuardBlock = providerWorkerMutationGuardRouteBlock(
    input.providerWorkerActionRoutes ?? [],
  );
  const routes = recordList(periodicExecutionRefs.refs).flatMap((ref) => {
    const role = stringValue(ref.role);
    const providerKind = stringValue(ref.provider_kind) ?? 'temporal';
    if (providerKind !== 'temporal') {
      return [];
    }
    const sloAction = providerSloAction(role);
    if (sloAction) {
      return [buildOperatorActionRoute(sloAction.args, {
        action_id: `provider-slo:${providerKind}:${sloAction.action}`,
        action_kind: sloAction.actionKind,
        provider_kind: providerKind,
        schedule_id: stringValue(ref.schedule_id),
        provider_slo_dispatch_status: stringValue(ref.dispatch_status),
        provider_repair_action_id: stringValue(ref.repair_action_id),
        provider_repair_command: stringValue(ref.repair_command),
        provider_required_next_action: stringValue(ref.required_next_action),
        expected_surface_kind: 'opl_temporal_provider_slo_execution_receipt',
        ...(stringValue(ref.dispatch_status) === 'execution_due_or_repair_required'
          ? workerMutationGuardBlock
          : {}),
        authority_boundary: refsOnlyAuthorityBoundary(),
      }, `opl family-runtime ${sloAction.args.join(' ')}`)];
    }
    return [];
  });
  return uniqueRefs([
    ...routes,
    ...recordList(periodicExecutionRefs.refs)
    .map((ref) => {
      const role = stringValue(ref.role);
      const action = schedulerAction(role);
      const providerKind = stringValue(ref.provider_kind) ?? 'temporal';
      if (!action || providerKind !== 'temporal') {
        return null;
      }
      const args = ['scheduler', action.action, '--provider', providerKind];
      return buildOperatorActionRoute(args, {
        action_id: `provider-scheduler:${providerKind}:${action.action}`,
        action_kind: action.actionKind,
        provider_kind: providerKind,
        schedule_id: stringValue(ref.schedule_id),
        expected_surface_kind: stringValue(ref.expected_surface_kind),
        ...(action.diagnostic
          ? {
              route_status: 'diagnostic_only',
              route_status_detail:
                'Provider scheduler status is a read-only diagnostic query; it remains visible in full detail but is not an operator safe-action tail.',
              default_actionable: false,
              default_actionability_status: 'diagnostic_only_not_operator_actionable',
              can_submit_to_safe_action_shell: true,
            }
          : {}),
        ...(action.mutation ? workerMutationGuardBlock : {}),
        authority_boundary: refsOnlyAuthorityBoundary(),
      }, `opl family-runtime ${args.join(' ')}`);
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)),
  ]);
}
