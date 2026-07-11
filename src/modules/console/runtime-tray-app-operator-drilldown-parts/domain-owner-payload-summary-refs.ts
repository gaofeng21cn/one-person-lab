import type { DomainManifestCatalogEntry } from '../../atlas/index.ts';
import {
  record,
  recordList,
  stringList,
  stringValue,
  type JsonRecord,
} from '../../../kernel/json-record.ts';

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function booleanValue(value: unknown) {
  return value === true ? true : value === false ? false : null;
}

function refsPayload(value: unknown, allowedKeys: string[]) {
  const payload = record(value);
  return Object.fromEntries(
    allowedKeys
      .map((key) => [key, stringList(payload[key])] as const)
      .filter(([, refs]) => refs.length > 0),
  );
}

function authorityBoundary() {
  return {
    opl: 'refs_only_domain_owner_payload_summary_projection',
    domain: 'owner_receipt_typed_blocker_truth_quality_and_artifact_authority',
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

function legacyPayloadFieldAliasBlocker(value: JsonRecord) {
  const aliases = record(value.legacy_payload_field_aliases);
  const blockedAliasFields = Object.keys(aliases).filter((key) => key.trim().length > 0);
  if (blockedAliasFields.length === 0) return null;
  return {
    surface_kind: 'opl_domain_owner_payload_summary_naming_hygiene_blocker',
    status: 'blocked_legacy_payload_field_aliases_resurrected',
    source_ref:
      '/operator_evidence_readiness_projection/production_evidence_scaleout_refs'
      + '/legacy_payload_field_aliases',
    blocked_alias_fields: blockedAliasFields.sort(),
    payload_policy: 'canonical_projection_fields_only_no_domain_alias_decoder',
    route_status: 'blocked_no_record_route_generated',
    authority_boundary: authorityBoundary(),
  };
}

function ownerPayloadWorkItem(value: JsonRecord) {
  return {
    item_id: stringValue(value.item_id),
    sequence: numberValue(value.sequence),
    remaining_gap_id: stringValue(value.remaining_gap_id),
    workorder_item_ref: stringValue(value.workorder_item_ref),
    payload_kind: stringValue(value.payload_kind),
    current_payload_template: record(value.current_payload_template),
    success_refs_path_payload: refsPayload(value.success_refs_path_payload, [
      'domain_owner_receipt_refs',
      'no_regression_evidence_refs',
      'owner_chain_refs',
      'typed_blocker_refs',
    ]),
    typed_blocker_path_payload: refsPayload(value.typed_blocker_path_payload, ['typed_blocker_refs']),
    operator_payload_submitted: booleanValue(value.operator_payload_submitted) === true,
    recommended_current_payload_path: stringValue(value.recommended_current_payload_path),
    success_refs_visible_is_completion: false,
    success_claimed: false,
    payload_body_allowed: false,
    owner_chain_closed: false,
    domain_readiness_claimed: false,
    production_readiness_claimed: false,
    authority_boundary: authorityBoundary(),
  };
}

function ownerPayloadItemSummary(value: JsonRecord) {
  const workItems = recordList(value.work_items).map(ownerPayloadWorkItem);
  return {
    surface_kind: stringValue(value.surface_kind) ?? 'domain_owner_payload_item_summary',
    owner: stringValue(value.owner),
    consumer: stringValue(value.consumer),
    status: stringValue(value.status),
    payload_kind: stringValue(value.payload_kind),
    payload_path_policy: stringValue(value.payload_path_policy),
    payload_body_allowed: false,
    empty_payload_template_is_success_evidence: false,
    required_operator_payload_refs: stringList(value.required_operator_payload_refs),
    required_return_shapes: stringList(value.required_return_shapes),
    accepted_payload_paths_ref: stringValue(value.accepted_payload_paths_ref),
    work_item_count: workItems.length,
    work_items: workItems,
    authority_boundary: authorityBoundary(),
  };
}

function stageExpectedReceiptStage(value: JsonRecord) {
  return {
    stage_id: stringValue(value.stage_id),
    sequence: numberValue(value.sequence),
    payload_kind: stringValue(value.payload_kind),
    current_payload_template: record(value.current_payload_template),
    success_refs_path_payload: refsPayload(value.success_refs_path_payload, [
      'domain_receipt_refs',
      'monitor_freshness_refs',
      'runtime_event_refs',
      'typed_blocker_refs',
    ]),
    typed_blocker_path_payload: refsPayload(value.typed_blocker_path_payload, ['typed_blocker_refs']),
    monitor_status: stringValue(value.monitor_status),
    operator_payload_submitted: booleanValue(value.operator_payload_submitted) === true,
    recommended_current_payload_path: stringValue(value.recommended_current_payload_path),
    success_refs_visible_is_completion: false,
    success_claimed: false,
    payload_body_allowed: false,
    closes_owner_chain: false,
    closes_production_ready: false,
    authority_boundary: authorityBoundary(),
  };
}

function stageExpectedReceiptPayloadSummary(value: JsonRecord) {
  const stages = recordList(value.stages).map(stageExpectedReceiptStage);
  return {
    surface_kind: stringValue(value.surface_kind) ?? 'stage_expected_receipt_payload_summary',
    owner: stringValue(value.owner),
    consumer: stringValue(value.consumer),
    status: stringValue(value.status),
    payload_kind: stringValue(value.payload_kind),
    payload_path_policy: stringValue(value.payload_path_policy),
    payload_body_allowed: false,
    empty_payload_template_is_success_evidence: false,
    required_operator_payload_refs: stringList(value.required_operator_payload_refs),
    required_return_shapes: stringList(value.required_return_shapes),
    accepted_payload_paths_ref: stringValue(value.accepted_payload_paths_ref),
    stage_count: stages.length,
    stages,
    authority_boundary: authorityBoundary(),
  };
}

function domainOwnerPayloadSummaryFromProjection(project: DomainManifestCatalogEntry) {
  const manifest = project.status === 'resolved' ? project.manifest : null;
  const projection = record(manifest?.operator_evidence_readiness_projection);
  if (Object.keys(projection).length === 0) return null;
  const productionScaleoutRefs = record(projection.production_evidence_scaleout_refs);
  const namingHygieneBlocker = legacyPayloadFieldAliasBlocker(productionScaleoutRefs);
  const expectedReceiptHandoff = record(projection.opl_expected_receipt_monitor_freshness_handoff);
  const ownerSummarySource = record(productionScaleoutRefs.owner_payload_item_summary);
  const stageSummarySource = record(expectedReceiptHandoff.stage_expected_receipt_payload_summary);
  if (!namingHygieneBlocker
    && Object.keys(ownerSummarySource).length === 0
    && Object.keys(stageSummarySource).length === 0) return null;
  const ownerSummary = Object.keys(ownerSummarySource).length > 0
    ? ownerPayloadItemSummary(ownerSummarySource)
    : null;
  const stageSummary = Object.keys(stageSummarySource).length > 0
    ? stageExpectedReceiptPayloadSummary(stageSummarySource)
    : null;
  return {
    domain_id: project.project_id,
    project: project.project,
    target_domain_id: manifest?.target_domain_id ?? null,
    owner: stringValue(ownerSummary?.owner) ?? stringValue(stageSummary?.owner),
    status: namingHygieneBlocker?.status ?? 'projection_available',
    source_surface: 'operator_evidence_readiness_projection',
    source_ref: '/operator_evidence_readiness_projection',
    owner_payload_item_summary: namingHygieneBlocker ? null : ownerSummary,
    stage_expected_receipt_payload_summary: namingHygieneBlocker ? null : stageSummary,
    naming_hygiene_blocker: namingHygieneBlocker,
    payload_body_allowed: false,
    projection_closes_domain_ready: false,
    projection_claims_production_ready: false,
    authority_boundary: authorityBoundary(),
  };
}

export function buildDomainOwnerPayloadSummaryRefs(input: {
  domainManifestProjects: DomainManifestCatalogEntry[];
}) {
  const domains = input.domainManifestProjects
    .map(domainOwnerPayloadSummaryFromProjection)
    .filter((domain): domain is Exclude<typeof domain, null> => domain !== null);
  return {
    surface_kind: 'opl_app_drilldown_domain_owner_payload_summary_refs',
    projection_policy: 'registered_domain_projection_refs_only_no_domain_shape_decoder',
    summary: {
      domain_count: domains.length,
      owner_payload_item_summary_count:
        domains.filter((domain) => domain.owner_payload_item_summary !== null).length,
      owner_payload_work_item_count: domains.reduce((count, domain) =>
        count + Number(record(domain.owner_payload_item_summary).work_item_count ?? 0), 0),
      stage_expected_receipt_payload_summary_count:
        domains.filter((domain) => domain.stage_expected_receipt_payload_summary !== null).length,
      stage_expected_receipt_payload_stage_count: domains.reduce((count, domain) =>
        count + Number(record(domain.stage_expected_receipt_payload_summary).stage_count ?? 0), 0),
      payload_body_allowed_count: 0,
      domain_ready_claim_count: 0,
      production_ready_claim_count: 0,
      naming_hygiene_blocker_count:
        domains.filter((domain) => domain.naming_hygiene_blocker !== null).length,
    },
    domains,
    authority_boundary: authorityBoundary(),
  };
}
