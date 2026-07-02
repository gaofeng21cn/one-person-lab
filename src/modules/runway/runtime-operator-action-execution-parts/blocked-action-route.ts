type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function blockedActionRouteExecution(
  route: JsonRecord,
  authorityBoundary: JsonRecord,
) {
  const routeStatus = stringValue(route.route_status);
  const actionabilityStatus = stringValue(route.default_actionability_status);
  if (
    routeStatus?.startsWith('blocked_by_')
    || actionabilityStatus?.startsWith('blocked_by_')
    || route.can_submit_to_safe_action_shell === false
  ) {
    return {
      execution_status: 'blocked',
      execution_kind: 'blocked_safe_action_route',
      route_ref: stringValue(route.ref) ?? stringValue(route.action_ref),
      action_kind: stringValue(route.action_kind),
      executed_runtime_command: null,
      result: {
        route_status: routeStatus,
        default_actionability_status: actionabilityStatus,
        route_status_detail: stringValue(route.route_status_detail),
        can_submit_to_safe_action_shell: route.can_submit_to_safe_action_shell === true,
        provider_worker_mutation_guard: isRecord(route.provider_worker_mutation_guard)
          ? route.provider_worker_mutation_guard
          : null,
        provider_worker_blocked_action_id: stringValue(route.provider_worker_blocked_action_id),
        authority_boundary: authorityBoundary,
      },
    };
  }
  return null;
}
