import type { JsonRecord } from '../runtime-tray-snapshot-types.ts';
import {
  buildAppDrilldownRefsOnlyAuthorityBoundaryCore,
} from './authority-boundary.ts';

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function recordList(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function uniqueRefs<T extends { ref: string; role?: string | null }>(values: T[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = `${value.role ?? ''}:${value.ref}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function schedulerAction(role: string | null) {
  if (role === 'scheduler_cadence_status') {
    return { action: 'status', actionKind: 'provider_scheduler_status' };
  }
  if (role === 'scheduler_cadence_install_or_update') {
    return { action: 'install', actionKind: 'provider_scheduler_install' };
  }
  if (role === 'scheduler_cadence_manual_trigger') {
    return { action: 'trigger', actionKind: 'provider_scheduler_trigger' };
  }
  if (role === 'scheduler_tick_provider_slo_and_queue_dispatch') {
    return { action: 'tick', actionKind: 'provider_scheduler_tick' };
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

export function buildProviderSchedulerActionRoutes(periodicExecutionRefs: JsonRecord) {
  const routes = recordList(periodicExecutionRefs.refs).flatMap((ref) => {
    const role = stringValue(ref.role);
    const providerKind = stringValue(ref.provider_kind) ?? 'temporal';
    if (providerKind !== 'temporal') {
      return [];
    }
    const sloAction = providerSloAction(role);
    if (sloAction) {
      return [{
        ref: `opl family-runtime ${sloAction.args.join(' ')}`,
        opl_cli_args: sloAction.args,
        role: 'operator_action_route',
        action_id: `provider-slo:${providerKind}:${sloAction.action}`,
        action_kind: sloAction.actionKind,
        owner: 'opl',
        route_target_kind: 'opl_cli',
        execution_policy: 'opl_safe_action_shell',
        execution_surface: 'opl runtime action execute',
        stage_attempt_id: null,
        domain_id: null,
        stage_id: null,
        provider_kind: providerKind,
        schedule_id: stringValue(ref.schedule_id),
        provider_slo_dispatch_status: stringValue(ref.dispatch_status),
        provider_repair_action_id: stringValue(ref.repair_action_id),
        provider_repair_command: stringValue(ref.repair_command),
        provider_required_next_action: stringValue(ref.required_next_action),
        expected_surface_kind: 'opl_temporal_provider_slo_execution_receipt',
        can_execute: false as const,
        authority_boundary: refsOnlyAuthorityBoundary(),
      }];
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
      return {
        ref: `opl family-runtime ${args.join(' ')}`,
        opl_cli_args: args,
        role: 'operator_action_route',
        action_id: `provider-scheduler:${providerKind}:${action.action}`,
        action_kind: action.actionKind,
        owner: 'opl',
        route_target_kind: 'opl_cli',
        execution_policy: 'opl_safe_action_shell',
        execution_surface: 'opl runtime action execute',
        stage_attempt_id: null,
        domain_id: null,
        stage_id: null,
        provider_kind: providerKind,
        schedule_id: stringValue(ref.schedule_id),
        expected_surface_kind: stringValue(ref.expected_surface_kind),
        can_execute: false as const,
        authority_boundary: refsOnlyAuthorityBoundary(),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)),
  ]);
}
