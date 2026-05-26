import type { DomainManifestCatalogEntry } from '../domain-manifest/types.ts';
import type { JsonRecord } from '../runtime-tray-snapshot-types.ts';

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
    can_claim_visual_ready: false,
    can_claim_export_ready: false,
    can_claim_domain_ready: false,
    can_claim_production_ready: false,
    can_claim_production_soak_complete: false,
    refs_only: true,
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
    typed_blocker_path_payload: refsPayload(value.typed_blocker_path_payload, [
      'typed_blocker_refs',
    ]),
    operator_payload_submitted: booleanValue(value.operator_payload_submitted) === true,
    recommended_current_payload_path: stringValue(value.recommended_current_payload_path),
    success_refs_visible_is_completion: false,
    success_claimed: false,
    payload_body_allowed: false,
    owner_chain_closed: false,
    domain_readiness_claimed: false,
    production_readiness_claimed: false,
    visual_readiness_claimed: false,
    export_readiness_claimed: false,
    production_soak_complete_claimed: false,
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
    typed_blocker_path_payload: refsPayload(value.typed_blocker_path_payload, [
      'typed_blocker_refs',
    ]),
    monitor_status: stringValue(value.monitor_status),
    operator_payload_submitted: booleanValue(value.operator_payload_submitted) === true,
    recommended_current_payload_path: stringValue(value.recommended_current_payload_path),
    success_refs_visible_is_completion: false,
    success_claimed: false,
    payload_body_allowed: false,
    closes_owner_chain: false,
    closes_production_ready: false,
    domain_readiness_claimed: false,
    production_readiness_claimed: false,
    visual_readiness_claimed: false,
    export_readiness_claimed: false,
    production_soak_complete_claimed: false,
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

export function buildDomainOwnerPayloadSummaryRefs(input: {
  domainManifestProjects: DomainManifestCatalogEntry[];
}) {
  const domains = input.domainManifestProjects.flatMap((project) => {
    const manifest = project.status === 'resolved' ? project.manifest : null;
    const projection = record(manifest?.operator_evidence_readiness_projection);
    if (Object.keys(projection).length === 0) {
      return [];
    }
    const productionScaleoutRefs = record(projection.production_evidence_scaleout_refs);
    const expectedReceiptHandoff =
      record(projection.opl_expected_receipt_monitor_freshness_handoff);
    const ownerSummarySource = record(productionScaleoutRefs.owner_payload_item_summary);
    const stageSummarySource =
      record(expectedReceiptHandoff.stage_expected_receipt_payload_summary);
    if (Object.keys(ownerSummarySource).length === 0
      && Object.keys(stageSummarySource).length === 0) {
      return [];
    }
    const ownerSummary = Object.keys(ownerSummarySource).length > 0
      ? ownerPayloadItemSummary(ownerSummarySource)
      : null;
    const stageSummary = Object.keys(stageSummarySource).length > 0
      ? stageExpectedReceiptPayloadSummary(stageSummarySource)
      : null;
    return [{
      domain_id: project.project_id,
      project: project.project,
      target_domain_id: manifest?.target_domain_id ?? null,
      owner: stringValue(ownerSummary?.owner) ?? stringValue(stageSummary?.owner),
      source_surface: 'operator_evidence_readiness_projection',
      source_ref: '/operator_evidence_readiness_projection',
      owner_payload_item_summary: ownerSummary,
      stage_expected_receipt_payload_summary: stageSummary,
      payload_body_allowed: false,
      projection_closes_domain_ready: false,
      projection_claims_production_ready: false,
      authority_boundary: authorityBoundary(),
    }];
  });
  const ownerPayloadItemSummaryCount =
    domains.filter((domain) => domain.owner_payload_item_summary !== null).length;
  const stageExpectedReceiptPayloadSummaryCount =
    domains.filter((domain) => domain.stage_expected_receipt_payload_summary !== null).length;
  return {
    surface_kind: 'opl_app_drilldown_domain_owner_payload_summary_refs',
    projection_policy:
      'refs_only_domain_owner_payload_guidance_no_owner_receipt_or_typed_blocker_generation',
    summary: {
      domain_count: domains.length,
      owner_payload_item_summary_count: ownerPayloadItemSummaryCount,
      owner_payload_work_item_count: domains.reduce((count, domain) => (
        count + Number(record(domain.owner_payload_item_summary).work_item_count ?? 0)
      ), 0),
      stage_expected_receipt_payload_summary_count: stageExpectedReceiptPayloadSummaryCount,
      stage_expected_receipt_payload_stage_count: domains.reduce((count, domain) => (
        count + Number(record(domain.stage_expected_receipt_payload_summary).stage_count ?? 0)
      ), 0),
      payload_body_allowed_count: 0,
      domain_ready_claim_count: 0,
      production_ready_claim_count: 0,
    },
    domains,
    authority_boundary: authorityBoundary(),
  };
}
