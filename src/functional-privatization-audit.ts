type JsonRecord = Record<string, unknown>;

export type FunctionalPrivatizationMigrationClass =
  | 'opl_owned_replacement'
  | 'opl_hosted_surface'
  | 'opl_generated_surface'
  | 'declarative_pack'
  | 'minimal_authority_function'
  | 'refs_only_domain_adapter'
  | 'temporary_migration_bridge'
  | 'diagnostic_cleanup_path'
  | 'provenance_or_fixture'
  | 'domain_authority'
  | 'retire_tombstone';

export type FunctionalPrivatizationAuditVisibility = 'attention_required' | 'hidden_by_default';
export type FunctionalPrivatizationStandardizationLayer =
  | 'standard_domain_pack_inventory'
  | 'authority_function_inventory'
  | 'private_platform_residue_inventory';

export type FunctionalPrivatizationAuditItem = {
  module_id: string;
  source: string;
  migration_class: FunctionalPrivatizationMigrationClass;
  current_owner: string | null;
  opl_replacement_owner: 'one-person-lab' | null;
  domain_allowed_role: string | null;
  current_surface_refs: string[];
  expected_opl_primitives: string[];
  retained_domain_authority: string[];
  code_paths: string[];
  active_callers: string[];
  active_caller_status: string | null;
  migration_action: string | null;
  retention_reason: string | null;
  cannot_absorb_reason: string | null;
  active_caller_allowed: boolean;
  tombstone_required: boolean;
  blocker: string | null;
  audit_visibility: FunctionalPrivatizationAuditVisibility;
  audit_reason: string;
  standardization_layer: FunctionalPrivatizationStandardizationLayer;
  standardization_layer_reason: string;
  semantic_equivalence_status: 'cleared_by_boundary' | 'review_required';
  semantic_equivalence_reason: string;
};

export type FunctionalExternalEvidenceRequest = {
  request_id: string;
  status: string;
  required_evidence_refs: string[];
  required_return_shapes: string[];
  required_receipt_shapes: string[];
  forbidden_payload_classes: string[];
  accepted_payload_policy: string | null;
  source_pointer: string | null;
};

export type FunctionalExternalEvidenceRequestPack = {
  surface_kind: 'opl_external_evidence_request_pack_projection';
  request_pack_id: string | null;
  owner: string | null;
  request_owner: string | null;
  requested_from: string[];
  policy: string | null;
  requests: FunctionalExternalEvidenceRequest[];
  summary: {
    request_count: number;
    open_request_count: number;
  };
};

export type FunctionalEvidenceGateProjection = {
  surface_kind: 'opl_domain_evidence_gate_projection';
  status: 'empty' | 'evidence_gates_open';
  remaining_evidence_gate_ids: string[];
  remaining_bridge_module_ids: string[];
  source_refs: string[];
  summary: {
    remaining_evidence_gate_count: number;
    remaining_bridge_module_count: number;
  };
};

export type FunctionalOplReplacementExpectation = {
  primitive_id: string;
  owner: string | null;
  state: string | null;
  opl_provides: string[];
  domain_keeps: string[];
  implemented_in_domain: boolean | null;
  source_pointer: string;
};

export type FunctionalPrivatizationAudit = {
  surface_kind: 'opl_functional_privatization_audit';
  version: 'opl-functional-privatization-audit.v1';
  status: 'missing' | 'resolved';
  source_field: string | null;
  target_domain_id: string | null;
  summary: {
    total_module_count: number;
    opl_owned_replacement_count: number;
    opl_hosted_surface_count: number;
    opl_generated_surface_count: number;
    declarative_pack_count: number;
    minimal_authority_function_count: number;
    refs_only_domain_adapter_count: number;
    temporary_migration_bridge_count: number;
    diagnostic_cleanup_path_count: number;
    provenance_or_fixture_count: number;
    domain_authority_count: number;
    retire_tombstone_count: number;
    active_private_generic_residue_count: number;
    blocker_count: number;
    default_watchlist_count: number;
    default_hidden_cleared_count: number;
    default_watchlist_module_ids: string[];
    standard_domain_pack_inventory_count: number;
    authority_function_inventory_count: number;
    private_platform_residue_inventory_count: number;
    standard_domain_pack_module_ids: string[];
    authority_function_module_ids: string[];
    private_platform_residue_module_ids: string[];
    semantic_equivalence_review_count: number;
    semantic_equivalence_cleared_count: number;
    semantic_equivalence_review_module_ids: string[];
  };
  modules: FunctionalPrivatizationAuditItem[];
  standard_domain_pack_inventory: FunctionalPrivatizationAuditItem[];
  authority_function_inventory: FunctionalPrivatizationAuditItem[];
  private_platform_residue_inventory: FunctionalPrivatizationAuditItem[];
  required_opl_replacement_primitives: string[];
  external_evidence_request_pack: FunctionalExternalEvidenceRequestPack | null;
  evidence_gate_projection: FunctionalEvidenceGateProjection;
  opl_replacement_expectations: FunctionalOplReplacementExpectation[];
  blockers: string[];
  authority_boundary: {
    opl_can_write_domain_truth: false;
    opl_can_write_memory_body: false;
    opl_can_authorize_quality_or_export: false;
    domain_can_claim_generic_runtime_owner: false;
  };
};

export const FUNCTIONAL_PRIVATIZATION_AUDIT_CONTRACT = {
  surface_kind: 'opl_functional_privatization_audit_contract',
  version: 'opl-functional-privatization-audit.v1',
  owner: 'one-person-lab',
  purpose: 'Normalize domain-declared non-knowledge functional module audits into one OPL replacement/readout surface.',
  module_inventory_fields: [
    'module_id',
    'classification',
    'code_paths',
    'active_callers',
    'active_caller_status',
    'migration_action',
    'retention_reason',
    'cannot_absorb_reason',
    'standardization_layer',
    'standardization_layer_reason',
  ],
  standardization_layers: [
    'standard_domain_pack_inventory',
    'authority_function_inventory',
    'private_platform_residue_inventory',
  ],
  accepted_source_fields: [
    'functional_privatization_audit',
    'privatized_functional_module_audit',
    'functional_consumer_boundary',
    'mag_consumer_thinning_contract.privatized_functional_module_audit',
    'runtime_framework.rca_thin_surface_policy.privatized_functional_module_audit',
  ],
  migration_classes: [
    'opl_hosted_surface',
    'opl_generated_surface',
    'declarative_pack',
    'minimal_authority_function',
    'refs_only_domain_adapter',
    'temporary_migration_bridge',
    'diagnostic_cleanup_path',
    'provenance_or_fixture',
    'domain_authority',
    'retire_tombstone',
  ],
  authority_boundary: {
    opl_owns_generic_runtime_primitives: true,
    domain_owns_truth_quality_artifact_memory_and_receipts: true,
    opl_can_write_domain_truth: false,
    opl_can_write_memory_body: false,
    opl_can_authorize_quality_or_export: false,
  },
} as const;

const EMPTY_SUMMARY = {
  total_module_count: 0,
  opl_owned_replacement_count: 0,
  opl_hosted_surface_count: 0,
  opl_generated_surface_count: 0,
  declarative_pack_count: 0,
  minimal_authority_function_count: 0,
  refs_only_domain_adapter_count: 0,
  temporary_migration_bridge_count: 0,
  diagnostic_cleanup_path_count: 0,
  provenance_or_fixture_count: 0,
  domain_authority_count: 0,
  retire_tombstone_count: 0,
  active_private_generic_residue_count: 0,
  blocker_count: 0,
  default_watchlist_count: 0,
  default_hidden_cleared_count: 0,
  default_watchlist_module_ids: [],
  standard_domain_pack_inventory_count: 0,
  authority_function_inventory_count: 0,
  private_platform_residue_inventory_count: 0,
  standard_domain_pack_module_ids: [],
  authority_function_module_ids: [],
  private_platform_residue_module_ids: [],
  semantic_equivalence_review_count: 0,
  semantic_equivalence_cleared_count: 0,
  semantic_equivalence_review_module_ids: [],
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function stringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => stringValue(entry))
    .filter((entry): entry is string => Boolean(entry));
}

function recordList(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function nestedRecord(root: JsonRecord, path: string[]) {
  let current: unknown = root;
  for (const key of path) {
    if (!isRecord(current)) {
      return null;
    }
    current = current[key];
  }
  return isRecord(current) ? current : null;
}

function externalEvidenceRequestPack(source: JsonRecord, manifest: JsonRecord) {
  const pack =
    nestedRecord(source, ['mag_consumer_thinning_contract', 'external_evidence_request_pack'])
    ?? nestedRecord(source, ['external_evidence_request_pack'])
    ?? nestedRecord(manifest, ['mag_consumer_thinning_contract', 'external_evidence_request_pack'])
    ?? nestedRecord(manifest, ['product_entry_manifest', 'mag_consumer_thinning_contract', 'external_evidence_request_pack']);
  if (!pack) {
    return null;
  }
  const requests = recordList(pack.requests).map((request) => ({
    request_id:
      stringValue(request.request_id)
      ?? stringValue(request.gate_id)
      ?? stringValue(request.id)
      ?? 'unknown_external_evidence_request',
    status:
      stringValue(request.status)
      ?? stringValue(request.request_status)
      ?? 'requested_not_received',
    required_evidence_refs: unique([
      ...stringList(request.required_evidence_refs),
      ...stringList(request.required_refs),
      ...stringList(request.required_source_refs),
    ]),
    required_return_shapes: unique([
      ...stringList(request.required_return_shapes),
      ...stringList(request.allowed_return_shapes),
    ]),
    required_receipt_shapes: unique([
      ...stringList(request.required_receipt_shapes),
      ...stringList(request.required_receipts),
      ...stringList(request.required_receipt_refs),
    ]),
    forbidden_payload_classes: unique([
      ...stringList(request.forbidden_payload_classes),
      ...stringList(request.forbidden_completion_claims),
      ...stringList(request.forbidden_payloads),
    ]),
    accepted_payload_policy: stringValue(request.accepted_payload_policy),
    source_pointer: stringValue(request.source_pointer) ?? stringValue(request.request_ref),
  }));
  return {
    surface_kind: 'opl_external_evidence_request_pack_projection',
    request_pack_id: stringValue(pack.request_pack_id),
    owner: stringValue(pack.owner),
    request_owner: stringValue(pack.request_owner),
    requested_from: stringList(pack.requested_from),
    policy: stringValue(pack.policy),
    requests,
    summary: {
      request_count: requests.length,
      open_request_count: requests.filter((request) => (
        request.status !== 'received'
        && request.status !== 'complete'
        && request.status !== 'verified'
      )).length,
    },
  } satisfies FunctionalExternalEvidenceRequestPack;
}

function evidenceGateProjection(source: JsonRecord) {
  const sourceRefs: string[] = [];
  const collect = (recordValue: JsonRecord | null, pointer: string) => {
    if (!recordValue) {
      return {
        evidenceGateIds: [] as string[],
        bridgeModuleIds: [] as string[],
      };
    }
    sourceRefs.push(pointer);
    return {
      evidenceGateIds: stringList(recordValue.remaining_evidence_gate_ids),
      bridgeModuleIds: stringList(recordValue.remaining_bridge_module_ids),
    };
  };
  const projections = [
    collect(nestedRecord(source, ['functional_structure_gap_closure']), '/functional_structure_gap_closure'),
    collect(nestedRecord(source, ['bridge_exit_gate']), '/bridge_exit_gate'),
    collect(
      nestedRecord(source, ['generated_interface_consumption', 'bridge_exit_gate']),
      '/generated_interface_consumption/bridge_exit_gate',
    ),
    collect(
      nestedRecord(source, ['mag_consumer_thinning_contract', 'generated_surface_handoff', 'bridge_exit_gate']),
      '/mag_consumer_thinning_contract/generated_surface_handoff/bridge_exit_gate',
    ),
  ];
  const remainingEvidenceGateIds = unique(projections.flatMap((projection) => projection.evidenceGateIds));
  const remainingBridgeModuleIds = unique(projections.flatMap((projection) => projection.bridgeModuleIds));
  return {
    surface_kind: 'opl_domain_evidence_gate_projection',
    status: remainingEvidenceGateIds.length > 0 || remainingBridgeModuleIds.length > 0
      ? 'evidence_gates_open'
      : 'empty',
    remaining_evidence_gate_ids: remainingEvidenceGateIds,
    remaining_bridge_module_ids: remainingBridgeModuleIds,
    source_refs: unique(sourceRefs),
    summary: {
      remaining_evidence_gate_count: remainingEvidenceGateIds.length,
      remaining_bridge_module_count: remainingBridgeModuleIds.length,
    },
  } satisfies FunctionalEvidenceGateProjection;
}

function oplReplacementExpectations(source: JsonRecord, manifest: JsonRecord) {
  const expectations =
    recordList(nestedRecord(source, ['mag_consumer_thinning_contract'])?.opl_replacement_expectations);
  const manifestExpectations =
    recordList(nestedRecord(manifest, ['mag_consumer_thinning_contract'])?.opl_replacement_expectations);
  const productManifestExpectations =
    recordList(
      nestedRecord(manifest, ['product_entry_manifest', 'mag_consumer_thinning_contract'])
        ?.opl_replacement_expectations,
    );
  return [
    ...expectations,
    ...manifestExpectations,
    ...productManifestExpectations,
  ]
    .map((entry) => ({
      primitive_id:
        stringValue(entry.primitive_id)
        ?? stringValue(entry.primitive)
        ?? 'unknown_opl_replacement_primitive',
      owner: stringValue(entry.owner),
      state: stringValue(entry.state),
      opl_provides: stringList(entry.opl_provides),
      domain_keeps: unique([
        ...stringList(entry.mag_keeps),
        ...stringList(entry.domain_keeps),
        ...stringList(entry.rca_keeps),
      ]),
      implemented_in_domain:
        typeof entry.implemented_in_mag === 'boolean'
          ? entry.implemented_in_mag
          : typeof entry.implemented_in_domain === 'boolean'
            ? entry.implemented_in_domain
            : null,
      source_pointer: '/mag_consumer_thinning_contract/opl_replacement_expectations',
    } satisfies FunctionalOplReplacementExpectation));
}

function selectedAuditSource(manifest: JsonRecord) {
  const direct =
    nestedRecord(manifest, ['functional_privatization_audit'])
    ?? nestedRecord(manifest, ['privatized_functional_module_audit'])
    ?? nestedRecord(manifest, ['mag_consumer_thinning_contract', 'privatized_functional_module_audit'])
    ?? nestedRecord(manifest, ['runtime_framework', 'rca_thin_surface_policy', 'privatized_functional_module_audit'])
    ?? nestedRecord(manifest, ['functional_consumer_boundary']);
  if (!direct) {
    return { source: null, sourceField: null };
  }
  const sourceField =
    manifest.functional_privatization_audit === direct
      ? 'functional_privatization_audit'
      : manifest.privatized_functional_module_audit === direct
        ? 'privatized_functional_module_audit'
        : nestedRecord(manifest, ['mag_consumer_thinning_contract', 'privatized_functional_module_audit']) === direct
          ? 'mag_consumer_thinning_contract.privatized_functional_module_audit'
          : nestedRecord(manifest, ['runtime_framework', 'rca_thin_surface_policy', 'privatized_functional_module_audit']) === direct
            ? 'runtime_framework.rca_thin_surface_policy.privatized_functional_module_audit'
            : 'functional_consumer_boundary';
  return { source: direct, sourceField };
}

function migrationClass(value: unknown): FunctionalPrivatizationMigrationClass {
  const text = stringValue(value);
  if (
    text === 'opl_owned_replacement'
    || text === 'opl_owned_generic_primitive_consumer'
    || text === 'A_opl_owned_mas_consumes'
    || text === 'split_owner_boundary'
    || text === 'opl_owned_generic_envelope_rca_owned_helper_implementation'
    || text === 'opl_owned_observability_stability_read_model_consumed_by_rca'
  ) {
    return 'opl_owned_replacement';
  }
  if (text === 'opl_hosted_surface' || text === 'hosted_surface') {
    return 'opl_hosted_surface';
  }
  if (
    text === 'domain_authority'
    || text === 'mag_owned_grant_truth_receipt_verdict'
    || text === 'rca_owned_visual_domain_authority'
  ) {
    return 'domain_authority';
  }
  if (
    text === 'domain_thin_adapter'
    || text === 'refs_only_adapter'
    || text === 'refs_only_domain_adapter'
    || text === 'refs_only_projection'
  ) {
    return 'refs_only_domain_adapter';
  }
  if (
    text === 'opl_generated_surface'
    || text === 'generated_surface'
    || text === 'generated_surface_handoff'
    || text === 'opl_generated_cli_mcp_product_sidecar_status'
  ) {
    return 'opl_generated_surface';
  }
  if (
    text === 'declarative_pack'
    || text === 'declarative_pack_surface'
    || text === 'declarative_pack_generated_surface'
    || text === 'domain_declarative_pack'
    || text === 'stage_policy_schema_fixture_pack'
  ) {
    return 'declarative_pack';
  }
  if (
    text === 'minimal_authority_function'
    || text === 'domain_minimal_authority_function'
    || text === 'authority_function'
  ) {
    return 'minimal_authority_function';
  }
  if (text === 'temporary_migration_bridge' || text === 'migration_bridge') {
    return 'temporary_migration_bridge';
  }
  if (
    text === 'diagnostic_cleanup_path'
    || text === 'legacy_cleanup_no_active_caller_gate'
    || text === 'legacy_cleanup_physical_retired'
    || text === 'cleanup_diagnostic_path'
  ) {
    return 'diagnostic_cleanup_path';
  }
  if (
    text === 'provenance_or_fixture'
    || text === 'legacy_proof_tombstone'
    || text === 'history_tombstone'
    || text === 'provenance_fixture'
  ) {
    return 'provenance_or_fixture';
  }
  if (text === 'retire_tombstone' || text === 'retire_when_replaced_or_uncalled') {
    return 'retire_tombstone';
  }
  return 'temporary_migration_bridge';
}

type FunctionalPrivatizationAuditItemDraft = Omit<
  FunctionalPrivatizationAuditItem,
  | 'audit_visibility'
  | 'audit_reason'
  | 'standardization_layer'
  | 'standardization_layer_reason'
  | 'semantic_equivalence_status'
  | 'semantic_equivalence_reason'
>;

function attentionReason(item: FunctionalPrivatizationAuditItemDraft) {
  if (item.blocker) {
    return 'blocker';
  }
  if (item.migration_class === 'opl_owned_replacement') {
    return 'opl_replacement_pending';
  }
  if (item.migration_class === 'temporary_migration_bridge') {
    return 'migration_bridge_pending';
  }
  if (item.migration_class === 'retire_tombstone') {
    return 'legacy_tombstone_pending';
  }
  if (item.migration_class === 'diagnostic_cleanup_path' && item.active_caller_allowed) {
    return 'diagnostic_cleanup_path_still_active';
  }
  if (item.tombstone_required && item.active_caller_allowed) {
    return 'tombstone_has_active_caller';
  }
  return null;
}

function withAuditVisibility(item: FunctionalPrivatizationAuditItemDraft): FunctionalPrivatizationAuditItem {
  const reason = attentionReason(item);
  const semanticEquivalenceReason = semanticEquivalenceReviewReason(item);
  const standardization = standardizationLayer(item);
  return {
    ...item,
    audit_visibility: reason ? 'attention_required' : 'hidden_by_default',
    audit_reason: reason ?? 'cleared_or_stable_boundary',
    standardization_layer: standardization.layer,
    standardization_layer_reason: standardization.reason,
    semantic_equivalence_status: semanticEquivalenceReason ? 'review_required' : 'cleared_by_boundary',
    semantic_equivalence_reason: semanticEquivalenceReason ?? 'cleared_by_current_owner_boundary',
  };
}

function standardizationLayer(item: FunctionalPrivatizationAuditItemDraft): {
  layer: FunctionalPrivatizationStandardizationLayer;
  reason: string;
} {
  if (item.migration_class === 'declarative_pack') {
    return {
      layer: 'standard_domain_pack_inventory',
      reason: 'domain_supplied_standard_pack_content_not_private_platform',
    };
  }
  if (item.migration_class === 'minimal_authority_function' || item.migration_class === 'domain_authority') {
    return {
      layer: 'authority_function_inventory',
      reason: 'domain_authority_function_behind_opl_standard_interface',
    };
  }
  return {
    layer: 'private_platform_residue_inventory',
    reason: 'requires_opl_generated_hosted_surface_refs_only_adapter_or_retirement_gate',
  };
}

function semanticEquivalenceReviewReason(item: FunctionalPrivatizationAuditItemDraft) {
  const statusText = [
    item.active_caller_status,
    item.migration_action,
    item.module_id,
  ]
    .filter((entry): entry is string => Boolean(entry))
    .join(' ')
    .toLowerCase();
  if (
    statusText.includes('active_private')
    || statusText.includes('mixed_generic')
    || statusText.includes('pending')
    || statusText.includes('should_move')
    || statusText.includes('should_derive')
    || statusText.includes('handoff_required')
    || statusText.includes('until_opl')
    || statusText.includes('lifecycle_candidate')
  ) {
    return 'active_caller_wording_requires_opl_semantic_equivalence_proof';
  }
  return null;
}

function itemFromRecord(
  record: JsonRecord,
  source: string,
  fallbackClass: FunctionalPrivatizationMigrationClass,
): FunctionalPrivatizationAuditItem {
  const moduleId =
    stringValue(record.module_id)
    ?? stringValue(record.surface_id)
    ?? stringValue(record.primitive)
    ?? 'unknown_functional_module';
  const itemClass =
    record.migration_class || record.migrationClass || record.classification
      ? migrationClass(record.migration_class ?? record.migrationClass ?? record.classification)
      : fallbackClass;
  const currentOwner =
    stringValue(record.owner)
    ?? (record.rca_owned_visual_domain_authority === true ? 'redcube_ai' : null)
    ?? (
      itemClass === 'opl_owned_replacement'
        || itemClass === 'opl_hosted_surface'
        || itemClass === 'opl_generated_surface'
        ? 'one-person-lab'
        : null
    );
  const expectedOplPrimitives = unique([
    ...stringList(record.opl_expected_primitives),
    ...stringList(record.expected_opl_primitives),
    stringValue(record.opl_generic_primitive),
  ].filter((entry): entry is string => Boolean(entry)));
  const retainedDomainAuthority = unique([
    ...stringList(record.mag_retained_authority),
    ...stringList(record.rca_retained_authority),
    ...stringList(record.retained_domain_authority),
  ]);
  const activeCallerAllowed =
    itemClass !== 'retire_tombstone'
    && itemClass !== 'provenance_or_fixture'
    && record.active_caller_allowed !== false
    && record.compatibility_alias_allowed !== false;
  const blocker =
    stringValue(record.blocker)
    ?? (record.claims_opl_replacement_exists === false ? 'opl_replacement_evidence_pending' : null)
    ?? (record.declares_production_soak_complete === true ? 'invalid_live_soak_claim' : null);
  return withAuditVisibility({
    module_id: moduleId,
    source,
    migration_class: itemClass,
    current_owner: currentOwner,
    opl_replacement_owner:
      itemClass === 'opl_owned_replacement'
        || itemClass === 'opl_hosted_surface'
        || itemClass === 'opl_generated_surface'
        ? 'one-person-lab'
        : null,
    domain_allowed_role:
      stringValue(record.mag_role)
      ?? stringValue(record.rca_scope)
      ?? stringValue(record.domain_allowed_role),
    current_surface_refs: unique([
      ...stringList(record.current_surface_refs),
      stringValue(record.surface_ref),
    ].filter((entry): entry is string => Boolean(entry))),
    expected_opl_primitives: expectedOplPrimitives,
    retained_domain_authority: retainedDomainAuthority,
    code_paths: unique([
      ...stringList(record.code_paths),
      ...stringList(record.codePaths),
      stringValue(record.code_path),
      stringValue(record.codePath),
    ].filter((entry): entry is string => Boolean(entry))),
    active_callers: unique([
      ...stringList(record.active_callers),
      ...stringList(record.activeCallers),
      stringValue(record.active_caller),
      stringValue(record.activeCaller),
    ].filter((entry): entry is string => Boolean(entry))),
    active_caller_status:
      stringValue(record.active_caller_status)
      ?? stringValue(record.activeCallerStatus),
    migration_action:
      stringValue(record.migration_action)
      ?? stringValue(record.migrationAction),
    retention_reason:
      stringValue(record.retention_reason)
      ?? stringValue(record.retentionReason),
    cannot_absorb_reason:
      stringValue(record.cannot_absorb_reason)
      ?? stringValue(record.cannotAbsorbReason),
    active_caller_allowed: activeCallerAllowed,
    tombstone_required:
      Boolean(record.tombstone_required)
      || itemClass === 'retire_tombstone'
      || itemClass === 'provenance_or_fixture',
    blocker,
  });
}

function itemsFromModuleInventory(source: JsonRecord, sourcePath: string) {
  return recordList(source.functional_module_inventory)
    .map((entry) => itemFromRecord(entry, `${sourcePath}.functional_module_inventory`, 'temporary_migration_bridge'));
}

function itemsFromMasBoundary(source: JsonRecord) {
  const inventoryItems = itemsFromModuleInventory(source, 'functional_consumer_boundary');
  if (inventoryItems.length > 0) {
    return inventoryItems;
  }
  const classification = isRecord(source.functional_surface_classification)
    ? source.functional_surface_classification
    : {};
  const modules: FunctionalPrivatizationAuditItem[] = [];
  for (const moduleId of stringList(classification.A_opl_owned_mas_consumes)) {
    modules.push(itemFromRecord(
      {
        module_id: moduleId,
        owner: 'one-person-lab',
        classification: 'A_opl_owned_mas_consumes',
        opl_expected_primitives: stringList(
          isRecord(source.runtime_lifecycle_sqlite_role)
            && isRecord(source.runtime_lifecycle_sqlite_role.replacement_expectation)
            ? source.runtime_lifecycle_sqlite_role.replacement_expectation.expected_replacements
            : [],
        ),
      },
      'functional_consumer_boundary.functional_surface_classification.A',
      'opl_owned_replacement',
    ));
  }
  for (const moduleId of stringList(classification.B_mas_domain_authority)) {
    modules.push(itemFromRecord(
      {
        module_id: moduleId,
        owner: 'med-autoscience',
        classification: 'domain_authority',
      },
      'functional_consumer_boundary.functional_surface_classification.B',
      'domain_authority',
    ));
  }
  for (const moduleId of stringList(classification.C_retire_when_replaced_or_uncalled)) {
    modules.push(itemFromRecord(
      {
        module_id: moduleId,
        owner: 'none_active',
        classification: 'retire_tombstone',
        active_caller_allowed: false,
      },
      'functional_consumer_boundary.functional_surface_classification.C',
      'retire_tombstone',
    ));
  }
  return modules;
}

function itemsFromStructuredAudit(source: JsonRecord) {
  const modules = [
    ...recordList(source.modules).map((entry) => itemFromRecord(entry, 'modules', 'temporary_migration_bridge')),
    ...recordList(source.opl_owned_generic_primitive_consumers).map((entry) =>
      itemFromRecord(entry, 'opl_owned_generic_primitive_consumers', 'opl_owned_replacement')),
    ...recordList(source.declarative_pack_surfaces).map((entry) =>
      itemFromRecord(entry, 'declarative_pack_surfaces', 'declarative_pack')),
    ...recordList(source.refs_only_adapter_surfaces).map((entry) =>
      itemFromRecord(entry, 'refs_only_adapter_surfaces', 'refs_only_domain_adapter')),
    ...recordList(source.mag_owned_grant_authority_surfaces).map((entry) =>
      itemFromRecord(entry, 'mag_owned_grant_authority_surfaces', 'minimal_authority_function')),
    ...recordList(source.retire_or_tombstone_surfaces).map((entry) =>
      itemFromRecord(entry, 'retire_or_tombstone_surfaces', 'provenance_or_fixture')),
  ];
  return modules;
}

function summarize(items: FunctionalPrivatizationAuditItem[]) {
  const blockers = unique(items.map((item) => item.blocker).filter((entry): entry is string => Boolean(entry)));
  const activePrivateGenericResidueCount = items.filter((item) =>
    item.migration_class === 'opl_owned_replacement'
    || item.migration_class === 'temporary_migration_bridge'
  ).length;
  const watchlistItems = items.filter((item) => item.audit_visibility === 'attention_required');
  const semanticEquivalenceReviewItems = items.filter((item) =>
    item.semantic_equivalence_status === 'review_required'
  );
  const standardDomainPackItems = items.filter((item) =>
    item.standardization_layer === 'standard_domain_pack_inventory'
  );
  const authorityFunctionItems = items.filter((item) =>
    item.standardization_layer === 'authority_function_inventory'
  );
  const privatePlatformResidueItems = items.filter((item) =>
    item.standardization_layer === 'private_platform_residue_inventory'
  );
  return {
    summary: {
      total_module_count: items.length,
      opl_owned_replacement_count: items.filter((item) => item.migration_class === 'opl_owned_replacement').length,
      opl_hosted_surface_count: items.filter((item) => item.migration_class === 'opl_hosted_surface').length,
      opl_generated_surface_count: items.filter((item) => item.migration_class === 'opl_generated_surface').length,
      declarative_pack_count: items.filter((item) => item.migration_class === 'declarative_pack').length,
      minimal_authority_function_count: items.filter((item) =>
        item.migration_class === 'minimal_authority_function'
      ).length,
      refs_only_domain_adapter_count: items.filter((item) =>
        item.migration_class === 'refs_only_domain_adapter'
      ).length,
      temporary_migration_bridge_count: items.filter((item) =>
        item.migration_class === 'temporary_migration_bridge'
      ).length,
      diagnostic_cleanup_path_count: items.filter((item) =>
        item.migration_class === 'diagnostic_cleanup_path'
      ).length,
      provenance_or_fixture_count: items.filter((item) =>
        item.migration_class === 'provenance_or_fixture'
      ).length,
      domain_authority_count: items.filter((item) => item.migration_class === 'domain_authority').length,
      retire_tombstone_count: items.filter((item) => item.migration_class === 'retire_tombstone').length,
      active_private_generic_residue_count: activePrivateGenericResidueCount,
      blocker_count: blockers.length,
      default_watchlist_count: watchlistItems.length,
      default_hidden_cleared_count: items.length - watchlistItems.length,
      default_watchlist_module_ids: watchlistItems.map((item) => item.module_id),
      standard_domain_pack_inventory_count: standardDomainPackItems.length,
      authority_function_inventory_count: authorityFunctionItems.length,
      private_platform_residue_inventory_count: privatePlatformResidueItems.length,
      standard_domain_pack_module_ids: standardDomainPackItems.map((item) => item.module_id),
      authority_function_module_ids: authorityFunctionItems.map((item) => item.module_id),
      private_platform_residue_module_ids: privatePlatformResidueItems.map((item) => item.module_id),
      semantic_equivalence_review_count: semanticEquivalenceReviewItems.length,
      semantic_equivalence_cleared_count: items.length - semanticEquivalenceReviewItems.length,
      semantic_equivalence_review_module_ids: semanticEquivalenceReviewItems.map((item) => item.module_id),
    },
    blockers,
    standardDomainPackItems,
    authorityFunctionItems,
    privatePlatformResidueItems,
  };
}

export function buildFunctionalPrivatizationAudit(
  manifest: JsonRecord | null | undefined,
): FunctionalPrivatizationAudit {
  if (!isRecord(manifest)) {
    return {
      surface_kind: 'opl_functional_privatization_audit',
      version: 'opl-functional-privatization-audit.v1',
      status: 'missing',
      source_field: null,
      target_domain_id: null,
      summary: EMPTY_SUMMARY,
      modules: [],
      standard_domain_pack_inventory: [],
      authority_function_inventory: [],
      private_platform_residue_inventory: [],
      required_opl_replacement_primitives: [],
      external_evidence_request_pack: null,
      evidence_gate_projection: {
        surface_kind: 'opl_domain_evidence_gate_projection',
        status: 'empty',
        remaining_evidence_gate_ids: [],
        remaining_bridge_module_ids: [],
        source_refs: [],
        summary: {
          remaining_evidence_gate_count: 0,
          remaining_bridge_module_count: 0,
        },
      },
      opl_replacement_expectations: [],
      blockers: ['functional_privatization_audit_missing'],
      authority_boundary: {
        opl_can_write_domain_truth: false,
        opl_can_write_memory_body: false,
        opl_can_authorize_quality_or_export: false,
        domain_can_claim_generic_runtime_owner: false,
      },
    };
  }
  const { source, sourceField } = selectedAuditSource(manifest);
  if (!source) {
    return {
      surface_kind: 'opl_functional_privatization_audit',
      version: 'opl-functional-privatization-audit.v1',
      status: 'missing',
      source_field: null,
      target_domain_id: stringValue(manifest.target_domain_id),
      summary: EMPTY_SUMMARY,
      modules: [],
      standard_domain_pack_inventory: [],
      authority_function_inventory: [],
      private_platform_residue_inventory: [],
      required_opl_replacement_primitives: [],
      external_evidence_request_pack: null,
      evidence_gate_projection: {
        surface_kind: 'opl_domain_evidence_gate_projection',
        status: 'empty',
        remaining_evidence_gate_ids: [],
        remaining_bridge_module_ids: [],
        source_refs: [],
        summary: {
          remaining_evidence_gate_count: 0,
          remaining_bridge_module_count: 0,
        },
      },
      opl_replacement_expectations: [],
      blockers: ['functional_privatization_audit_missing'],
      authority_boundary: {
        opl_can_write_domain_truth: false,
        opl_can_write_memory_body: false,
        opl_can_authorize_quality_or_export: false,
        domain_can_claim_generic_runtime_owner: false,
      },
    };
  }
  const modules =
    isRecord(source.functional_surface_classification)
      ? itemsFromMasBoundary(source)
      : itemsFromStructuredAudit(source);
  const requiredOplReplacementPrimitives = unique([
    ...modules.flatMap((item) => item.expected_opl_primitives),
    ...stringList(source.opl_must_absorb_code_surfaces),
    ...stringList(source.opl_owned_generic_primitives),
  ]);
  const {
    summary,
    blockers,
    standardDomainPackItems,
    authorityFunctionItems,
    privatePlatformResidueItems,
  } = summarize(modules);
  const evidencePack = externalEvidenceRequestPack(source, manifest);
  const gates = evidenceGateProjection(source);
  const replacementExpectations = oplReplacementExpectations(source, manifest);
  return {
    surface_kind: 'opl_functional_privatization_audit',
    version: 'opl-functional-privatization-audit.v1',
    status: 'resolved',
    source_field: sourceField,
    target_domain_id: stringValue(source.target_domain_id) ?? stringValue(manifest.target_domain_id),
    summary,
    modules,
    standard_domain_pack_inventory: standardDomainPackItems,
    authority_function_inventory: authorityFunctionItems,
    private_platform_residue_inventory: privatePlatformResidueItems,
    required_opl_replacement_primitives: requiredOplReplacementPrimitives,
    external_evidence_request_pack: evidencePack,
    evidence_gate_projection: gates,
    opl_replacement_expectations: replacementExpectations,
    blockers,
    authority_boundary: {
      opl_can_write_domain_truth: false,
      opl_can_write_memory_body: false,
      opl_can_authorize_quality_or_export: false,
      domain_can_claim_generic_runtime_owner: false,
    },
  };
}
