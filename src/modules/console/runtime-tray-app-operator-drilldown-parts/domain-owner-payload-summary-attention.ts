import type { JsonRecord } from '../runtime-tray-snapshot-types.ts';

const DEFAULT_ATTENTION_ITEM_LIMIT = 5;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function record(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function recordList(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.map(stringValue).filter((entry): entry is string => Boolean(entry))
    : [];
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function limitedItems<T>(items: T[]) {
  return {
    items: items.slice(0, DEFAULT_ATTENTION_ITEM_LIMIT),
    omitted_count: Math.max(items.length - DEFAULT_ATTENTION_ITEM_LIMIT, 0),
    total_count: items.length,
  };
}

function authorityBoundary(source: JsonRecord) {
  return {
    ...source,
    can_write_domain_truth: false,
    can_read_memory_body: false,
    can_read_artifact_body: false,
    can_create_owner_receipt: false,
    can_generate_typed_blocker: false,
    can_close_owner_chain: false,
    can_authorize_quality_or_export: false,
    can_claim_domain_ready: false,
    can_claim_production_ready: false,
    refs_only: true,
  };
}

function compactDomain(domain: JsonRecord) {
  const ownerPayloadSummary = record(domain.owner_payload_item_summary);
  const stagePayloadSummary = record(domain.stage_expected_receipt_payload_summary);
  return {
    domain_id: stringValue(domain.domain_id),
    project: stringValue(domain.project),
    target_domain_id: stringValue(domain.target_domain_id),
    owner: stringValue(domain.owner),
    source_surface: stringValue(domain.source_surface),
    source_ref: stringValue(domain.source_ref),
    status: stringValue(domain.status),
    blocked_alias_fields: stringList(record(domain.naming_hygiene_blocker).blocked_alias_fields),
    owner_payload_work_item_count: numberValue(ownerPayloadSummary.work_item_count),
    stage_expected_receipt_payload_stage_count:
      numberValue(stagePayloadSummary.stage_count),
    owner_payload_status: stringValue(ownerPayloadSummary.status),
    stage_expected_receipt_payload_status: stringValue(stagePayloadSummary.status),
    required_operator_payload_refs: Array.from(new Set([
      ...stringList(ownerPayloadSummary.required_operator_payload_refs),
      ...stringList(stagePayloadSummary.required_operator_payload_refs),
    ])),
    required_return_shapes: Array.from(new Set([
      ...stringList(ownerPayloadSummary.required_return_shapes),
      ...stringList(stagePayloadSummary.required_return_shapes),
    ])),
    payload_body_allowed: false,
    success_refs_visible_is_completion: false,
    full_detail_section: 'domain_owner_payload_summary_refs',
    authority_boundary: authorityBoundary(record(domain.authority_boundary)),
  };
}

export function buildDomainOwnerPayloadSummaryAttention(drilldown: JsonRecord) {
  const projection = record(drilldown.domain_owner_payload_summary_refs);
  const summary = record(projection.summary);
  const domains = recordList(projection.domains)
    .map(compactDomain)
    .sort((left, right) => (
      right.owner_payload_work_item_count - left.owner_payload_work_item_count
      || right.stage_expected_receipt_payload_stage_count
        - left.stage_expected_receipt_payload_stage_count
      || String(left.owner).localeCompare(String(right.owner))
      || String(left.domain_id).localeCompare(String(right.domain_id))
    ));
  const limitedDomains = limitedItems(domains);
  return {
    surface_kind: 'opl_domain_owner_payload_summary_attention',
    projection_policy: 'bounded_refs_only_payload_summary_guidance_with_refs_only_ledger_route',
    status: domains.length > 0 ? 'owner_payload_summary_available' : 'clear',
    domain_count: numberValue(summary.domain_count),
    domain_attention_count: limitedDomains.total_count,
    domain_omitted_count: limitedDomains.omitted_count,
    owner_payload_summary_count:
      numberValue(summary.owner_payload_item_summary_count),
    owner_payload_work_item_count:
      numberValue(summary.owner_payload_work_item_count),
    stage_expected_receipt_payload_summary_count:
      numberValue(summary.stage_expected_receipt_payload_summary_count),
    stage_expected_receipt_payload_stage_count:
      numberValue(summary.stage_expected_receipt_payload_stage_count),
    payload_body_allowed_count: numberValue(summary.payload_body_allowed_count),
    domain_ready_claim_count: numberValue(summary.domain_ready_claim_count),
    production_ready_claim_count: numberValue(summary.production_ready_claim_count),
    naming_hygiene_blocker_count: numberValue(summary.naming_hygiene_blocker_count),
    owner_payload_domains: limitedDomains.items,
    full_detail_section: 'domain_owner_payload_summary_refs',
    authority_boundary: authorityBoundary(record(projection.authority_boundary)),
  };
}
