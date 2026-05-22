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

function refsOnlyAuthorityBoundary() {
  return {
    opl: 'provider_scheduler_safe_action_shell',
    provider: 'runtime_slo_receipt_owner',
    can_install_domain_daemon: false,
    ...buildAppDrilldownRefsOnlyAuthorityBoundaryCore(),
  };
}

export function buildProviderSchedulerActionRoutes(periodicExecutionRefs: JsonRecord) {
  return uniqueRefs(recordList(periodicExecutionRefs.refs)
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
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)));
}
