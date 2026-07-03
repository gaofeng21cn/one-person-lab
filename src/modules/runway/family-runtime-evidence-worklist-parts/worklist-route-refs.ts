import { firstRef, stringList, stringValue, type JsonRecord } from '../../../kernel/json-record.ts';

export function freshnessRef(route: JsonRecord) {
  return stringValue(route.evidence_source_ref)
    ?? stringValue(route.source_ref)
    ?? firstRef(route.monitor_refs)
    ?? firstRef(route.runtime_event_refs)
    ?? firstRef(route.source_scope_refs)
    ?? stringValue(route.schedule_id)
    ?? '/runtime_tray_snapshot/app_operator_drilldown';
}

export function readOnlyExpectedRefs(route: JsonRecord) {
  return [
    ...stringList(route.expected_receipt_refs),
    ...stringList(route.missing_production_evidence),
    ...stringList(route.required_evidence_refs),
    ...stringList(route.monitor_refs),
    ...stringList(route.runtime_event_refs),
  ];
}

