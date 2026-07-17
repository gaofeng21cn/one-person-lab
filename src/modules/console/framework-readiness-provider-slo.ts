import {
  type JsonRecord,
  record,
  recordList,
  stringValue,
} from './framework-readiness-values.ts';

function routeIsProviderWorkerMutationGuarded(route: JsonRecord) {
  return stringValue(route.route_status) === 'blocked_by_provider_worker_mutation_guard'
    || stringValue(route.default_actionability_status) === 'blocked_by_provider_worker_mutation_guard';
}

function providerSloProductionProofRouteIsMutationGuarded(appOperatorDrilldown: JsonRecord) {
  const routes = [
    ...recordList(record(appOperatorDrilldown.app_execution_bridge).safe_action_routes),
    ...recordList(record(appOperatorDrilldown.operator_action_routing_refs).refs),
  ];
  return routes.some((route) => (
    stringValue(route.action_kind) === 'provider_slo_cadence_execution'
      || stringValue(route.action_id)?.startsWith('provider-slo:') === true
  ) && routeIsProviderWorkerMutationGuarded(route));
}

export function guardedProviderSloOpenTailCount(appOperatorDrilldown: JsonRecord) {
  if (!providerSloProductionProofRouteIsMutationGuarded(appOperatorDrilldown)) {
    return 0;
  }
  return recordList(record(appOperatorDrilldown.production_evidence_tail_ledger).tail_items)
    .filter((item) =>
      stringValue(item.status) === 'open'
      && (
        stringValue(item.tail_item) === 'provider_long_window_slo_evidence'
        || stringValue(item.requirement_kind) === 'provider_long_window_slo_evidence'
        || stringValue(record(item.evidence_requirement).requirement_kind)
          === 'provider_long_window_slo_evidence'
      )
    ).length;
}
