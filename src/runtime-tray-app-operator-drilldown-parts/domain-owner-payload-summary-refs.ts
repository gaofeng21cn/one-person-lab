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

const DOMAIN_OWNER_PAYLOAD_REQUIRED_REFS = [
  'domain_owner_receipt_refs',
  'no_regression_evidence_refs',
  'owner_chain_refs',
  'typed_blocker_refs',
];

const DOMAIN_OWNER_PAYLOAD_REQUIRED_RETURN_SHAPES = [
  'domain_owner_receipt_ref',
  'no_regression_evidence_ref',
  'owner_chain_ref',
  'typed_blocker_ref',
];

function refsFromRecordOrTopLevel(value: JsonRecord, key: string) {
  const payload = record(value.record_payload);
  const refs = stringList(payload[key]);
  return refs.length > 0 ? refs : stringList(value[key]);
}

function refsFromMagOwnerPayloadResponse(value: JsonRecord, key: string) {
  const recordPayload = record(value.record_payload);
  const refs = stringList(recordPayload[key]);
  if (refs.length > 0) {
    return refs;
  }
  return stringList(value[key]);
}

function masPaperLineOwnerPayloadWorkItem(value: JsonRecord, index: number) {
  const typedBlockerRefs = refsFromRecordOrTopLevel(value, 'typed_blocker_refs');
  const successRefsPathPayload = {
    domain_owner_receipt_refs: refsFromRecordOrTopLevel(value, 'domain_owner_receipt_refs'),
    no_regression_evidence_refs: refsFromRecordOrTopLevel(value, 'no_regression_evidence_refs'),
    owner_chain_refs: refsFromRecordOrTopLevel(value, 'owner_chain_refs'),
    typed_blocker_refs: typedBlockerRefs,
  };
  return ownerPayloadWorkItem({
    item_id:
      stringValue(value.study_id)
      ?? stringValue(value.task_kind)
      ?? `paper_line_owner_payload_${index + 1}`,
    sequence: index + 1,
    remaining_gap_id: stringValue(value.reason),
    workorder_item_ref:
      `/real_paper_autonomy_guarded_apply_proof/paper_line_provider_canary_closeout/`
      + `paper_line_domain_dispatch_evidence_record_payloads/${index}`,
    payload_kind: 'domain_owner_receipt_or_typed_blocker_refs',
    current_payload_template: {
      domain_owner_receipt_refs: [],
      no_regression_evidence_refs: [],
      owner_chain_refs: [],
      typed_blocker_refs: [],
    },
    success_refs_path_payload: successRefsPathPayload,
    typed_blocker_path_payload: {
      typed_blocker_refs: typedBlockerRefs,
    },
    operator_payload_submitted: booleanValue(value.operator_payload_submitted) === true,
    recommended_current_payload_path:
      typedBlockerRefs.length > 0 ? 'typed_blocker_path' : 'success_refs_path',
  });
}

function masPaperLineOwnerPayloadItemSummary(closeout: JsonRecord) {
  const payloads = recordList(closeout.paper_line_domain_dispatch_evidence_record_payloads);
  const paperLineOwnerSummary = record(closeout.paper_line_owner_payload_summary);
  if (payloads.length === 0 || Object.keys(paperLineOwnerSummary).length === 0) {
    return null;
  }
  return ownerPayloadItemSummary({
    surface_kind: 'mas_paper_line_owner_payload_item_summary',
    owner: 'med-autoscience',
    consumer: 'one_person_lab',
    status: 'per_paper_line_owner_payload_refs_ready',
    payload_kind: 'domain_owner_receipt_or_typed_blocker_refs',
    payload_path_policy:
      'operator_reads_domain_owned_paper_line_success_refs_or_typed_blocker_refs_no_body',
    payload_body_allowed: false,
    empty_payload_template_is_success_evidence: false,
    required_operator_payload_refs: DOMAIN_OWNER_PAYLOAD_REQUIRED_REFS,
    required_return_shapes: DOMAIN_OWNER_PAYLOAD_REQUIRED_RETURN_SHAPES,
    accepted_payload_paths_ref: stringValue(closeout.accepted_payload_paths_ref),
    work_items: payloads.map(masPaperLineOwnerPayloadWorkItem),
  });
}

function magOwnerPayloadWorkItem(value: JsonRecord, sourceRef: string) {
  const typedBlockerRefs = refsFromMagOwnerPayloadResponse(value, 'typed_blocker_refs');
  return ownerPayloadWorkItem({
    item_id: 'mag_owner_payload_response',
    sequence: 1,
    remaining_gap_id: stringValue(value.status),
    workorder_item_ref: `${sourceRef}/record_payload`,
    payload_kind: 'domain_owner_receipt_or_typed_blocker_refs',
    current_payload_template: {
      domain_owner_receipt_refs: [],
      no_regression_evidence_refs: [],
      owner_chain_refs: [],
      typed_blocker_refs: [],
    },
    success_refs_path_payload: {
      domain_owner_receipt_refs:
        refsFromMagOwnerPayloadResponse(value, 'domain_owner_receipt_refs'),
      no_regression_evidence_refs:
        refsFromMagOwnerPayloadResponse(value, 'no_regression_evidence_refs'),
      owner_chain_refs: refsFromMagOwnerPayloadResponse(value, 'owner_chain_refs'),
    },
    typed_blocker_path_payload: {
      typed_blocker_refs: typedBlockerRefs,
    },
    operator_payload_submitted: booleanValue(value.operator_payload_submitted) === true,
    recommended_current_payload_path:
      typedBlockerRefs.length > 0 ? 'typed_blocker_path' : 'success_refs_path',
  });
}

function magOwnerPayloadItemSummary(value: JsonRecord, sourceRef: string) {
  return ownerPayloadItemSummary({
    surface_kind: 'mag_owner_payload_item_summary',
    owner: stringValue(value.owner) ?? 'med-autogrant',
    consumer: 'one_person_lab',
    status: stringValue(value.status),
    payload_kind: 'domain_owner_receipt_or_typed_blocker_refs',
    payload_path_policy: stringValue(value.payload_path_policy),
    payload_body_allowed: false,
    empty_payload_template_is_success_evidence: false,
    required_operator_payload_refs: DOMAIN_OWNER_PAYLOAD_REQUIRED_REFS,
    required_return_shapes: stringList(value.required_return_shapes).length > 0
      ? stringList(value.required_return_shapes)
      : DOMAIN_OWNER_PAYLOAD_REQUIRED_RETURN_SHAPES,
    accepted_payload_paths_ref: `${sourceRef}/accepted_payload_paths`,
    work_items: [magOwnerPayloadWorkItem(value, sourceRef)],
  });
}

function magOwnerPayloadResponseCandidate(manifest: JsonRecord) {
  const productEntryManifest = record(manifest.product_entry_manifest);
  const candidates: Array<{ source_ref: string; payload: JsonRecord }> = [
    {
      source_ref: '/owner_payload_response',
      payload: record(manifest.owner_payload_response),
    },
    {
      source_ref: '/opl_owner_payload_response',
      payload: record(manifest.opl_owner_payload_response),
    },
    {
      source_ref: '/mag_opl_owner_payload_response',
      payload: record(manifest.mag_opl_owner_payload_response),
    },
    {
      source_ref: '/workspace_receipt_scaleout_evidence/owner_payload_response',
      payload: record(record(manifest.workspace_receipt_scaleout_evidence).owner_payload_response),
    },
    {
      source_ref: '/product_entry_manifest/owner_payload_response',
      payload: record(productEntryManifest.owner_payload_response),
    },
    {
      source_ref: '/product_entry_manifest/opl_owner_payload_response',
      payload: record(productEntryManifest.opl_owner_payload_response),
    },
    {
      source_ref: (
        '/product_entry_manifest/workspace_receipt_scaleout_evidence/owner_payload_response'
      ),
      payload: record(
        record(productEntryManifest.workspace_receipt_scaleout_evidence).owner_payload_response,
      ),
    },
  ];
  return candidates.find((candidate) => (
    stringValue(candidate.payload.surface_kind) === 'mag_opl_owner_payload_response'
  )) ?? null;
}

function domainOwnerPayloadSummaryFromOperatorEvidence(project: DomainManifestCatalogEntry) {
  const manifest = project.status === 'resolved' ? project.manifest : null;
  const projection = record(manifest?.operator_evidence_readiness_projection);
  if (Object.keys(projection).length === 0) {
    return null;
  }
  const productionScaleoutRefs = record(projection.production_evidence_scaleout_refs);
  const expectedReceiptHandoff =
    record(projection.opl_expected_receipt_monitor_freshness_handoff);
  const ownerSummarySource = record(productionScaleoutRefs.owner_payload_item_summary);
  const stageSummarySource =
    record(expectedReceiptHandoff.stage_expected_receipt_payload_summary);
  if (Object.keys(ownerSummarySource).length === 0
    && Object.keys(stageSummarySource).length === 0) {
    return null;
  }
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
    source_surface: 'operator_evidence_readiness_projection',
    source_ref: '/operator_evidence_readiness_projection',
    owner_payload_item_summary: ownerSummary,
    stage_expected_receipt_payload_summary: stageSummary,
    payload_body_allowed: false,
    projection_closes_domain_ready: false,
    projection_claims_production_ready: false,
    authority_boundary: authorityBoundary(),
  };
}

function domainOwnerPayloadSummaryFromMasPaperLineCloseout(project: DomainManifestCatalogEntry) {
  const manifest = project.status === 'resolved' ? project.manifest : null;
  const proof = record(manifest?.real_paper_autonomy_guarded_apply_proof);
  const closeout = record(proof.paper_line_provider_canary_closeout);
  if (Object.keys(closeout).length === 0) {
    return null;
  }
  const ownerSummary = masPaperLineOwnerPayloadItemSummary(closeout);
  if (!ownerSummary) {
    return null;
  }
  return {
    domain_id: project.project_id,
    project: project.project,
    target_domain_id: manifest?.target_domain_id ?? null,
    owner: stringValue(ownerSummary.owner),
    source_surface: 'real_paper_autonomy_guarded_apply_proof',
    source_ref:
      '/real_paper_autonomy_guarded_apply_proof/paper_line_provider_canary_closeout',
    owner_payload_item_summary: ownerSummary,
    stage_expected_receipt_payload_summary: null,
    payload_body_allowed: false,
    projection_closes_domain_ready: false,
    projection_claims_production_ready: false,
    authority_boundary: authorityBoundary(),
  };
}

function domainOwnerPayloadSummaryFromMagOwnerPayloadResponse(project: DomainManifestCatalogEntry) {
  const manifest = project.status === 'resolved' ? project.manifest : null;
  const candidate = magOwnerPayloadResponseCandidate(record(manifest));
  if (!candidate) {
    return null;
  }
  const ownerPayloadResponse = candidate.payload;
  const ownerSummary = magOwnerPayloadItemSummary(
    ownerPayloadResponse,
    candidate.source_ref,
  );
  const stageSummarySource =
    record(ownerPayloadResponse.stage_expected_receipt_payload_summary);
  const stageSummary = Object.keys(stageSummarySource).length > 0
    ? stageExpectedReceiptPayloadSummary(stageSummarySource)
    : null;
  if (!ownerSummary && !stageSummary) {
    return null;
  }
  return {
    domain_id: project.project_id,
    project: project.project,
    target_domain_id:
      stringValue(ownerPayloadResponse.target_domain_id)
      ?? stringValue(record(manifest).target_domain_id)
      ?? null,
    owner: stringValue(ownerSummary?.owner) ?? stringValue(stageSummary?.owner),
    source_surface: 'mag_opl_owner_payload_response',
    source_ref: candidate.source_ref,
    owner_payload_item_summary: ownerSummary,
    stage_expected_receipt_payload_summary: stageSummary,
    payload_body_allowed: false,
    projection_closes_domain_ready: false,
    projection_claims_production_ready: false,
    authority_boundary: authorityBoundary(),
  };
}

export function buildDomainOwnerPayloadSummaryRefs(input: {
  domainManifestProjects: DomainManifestCatalogEntry[];
}) {
  const domains = input.domainManifestProjects.flatMap((project) => {
    return [
      domainOwnerPayloadSummaryFromOperatorEvidence(project),
      domainOwnerPayloadSummaryFromMasPaperLineCloseout(project),
      domainOwnerPayloadSummaryFromMagOwnerPayloadResponse(project),
    ].filter((domain): domain is Exclude<typeof domain, null> => domain !== null);
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
