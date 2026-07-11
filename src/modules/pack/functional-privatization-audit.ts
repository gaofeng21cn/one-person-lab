import {
  buildEmptyFunctionalEvidenceGateProjection,
  buildFunctionalPrivatizationAuditEnvelopeFromAudit,
  buildFunctionalSourcePurityTailReadModel,
  FUNCTIONAL_PRIVATIZATION_AUDIT_ENVELOPE_CONTRACT,
  type FunctionalPrivatizationAuditSourceFieldRole,
} from './functional-privatization-envelope.ts';
import { privatePlatformResidueGateFromRecord } from './private-platform-residue-deletion-gate.ts';
import type {
  FunctionalEvidenceGateProjection,
  FunctionalExternalEvidenceRequestPack,
  FunctionalOplReplacementExpectation,
  FunctionalPrivatizationAudit,
  FunctionalPrivatizationAuditItem,
  FunctionalPrivatizationMigrationClass,
  FunctionalPrivatizationStandardizationLayer,
} from './functional-privatization-audit-types.ts';
import { isRecord } from '../../kernel/contract-validation.ts';
import {
  stringList,
  stringValue,
} from '../../kernel/json-record.ts';
export type {
  FunctionalEvidenceGateProjection,
  FunctionalExternalEvidenceRequest,
  FunctionalExternalEvidenceRequestPack,
  FunctionalOplReplacementExpectation,
  FunctionalPrivatizationAudit,
  FunctionalPrivatizationAuditItem,
  FunctionalPrivatizationAuditVisibility,
  FunctionalPrivatizationMigrationClass,
  FunctionalPrivatizationStandardizationLayer,
} from './functional-privatization-audit-types.ts';

type JsonRecord = Record<string, unknown>;

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
    ...FUNCTIONAL_PRIVATIZATION_AUDIT_ENVELOPE_CONTRACT.accepted_source_shapes,
  ],
  migration_classes: [
    'opl_hosted_surface',
    'opl_generated_surface',
    'declarative_pack',
    'minimal_authority_function',
    'refs_only_domain_adapter',
    'opl_storage_substrate_mas_refs_projection',
    'domain_handler_target',
    'native_helper_implementation',
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
} satisfies FunctionalPrivatizationAudit['summary'];

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
  const standardSource = nestedRecord(manifest, ['functional_privatization_audit']);
  if (standardSource) {
    if (isRecord(standardSource.functional_consumer_boundary)) {
      return {
        source: standardSource.functional_consumer_boundary,
        sourceField: 'functional_consumer_boundary',
        sourceFieldRole: 'legacy_import_adapter' as const,
        legacyImportSourceFields: ['functional_consumer_boundary'],
      };
    }
    if (isRecord(standardSource.privatized_functional_module_audit)) {
      return {
        source: standardSource.privatized_functional_module_audit,
        sourceField: 'privatized_functional_module_audit',
        sourceFieldRole: 'legacy_import_adapter' as const,
        legacyImportSourceFields: ['privatized_functional_module_audit'],
      };
    }
    if (isRecord(standardSource.mag_consumer_thinning_contract)
      && isRecord(standardSource.mag_consumer_thinning_contract.privatized_functional_module_audit)) {
      return {
        source: standardSource.mag_consumer_thinning_contract.privatized_functional_module_audit,
        sourceField: 'mag_consumer_thinning_contract.privatized_functional_module_audit',
        sourceFieldRole: 'legacy_import_adapter' as const,
        legacyImportSourceFields: ['mag_consumer_thinning_contract.privatized_functional_module_audit'],
      };
    }
    if (isRecord(standardSource.runtime_framework)
      && isRecord(standardSource.runtime_framework.rca_thin_surface_policy)
      && isRecord(standardSource.runtime_framework.rca_thin_surface_policy.privatized_functional_module_audit)) {
      return {
        source: standardSource.runtime_framework.rca_thin_surface_policy.privatized_functional_module_audit,
        sourceField: 'runtime_framework.rca_thin_surface_policy.privatized_functional_module_audit',
        sourceFieldRole: 'legacy_import_adapter' as const,
        legacyImportSourceFields: [
          'runtime_framework.rca_thin_surface_policy.privatized_functional_module_audit',
        ],
      };
    }
    return {
      source: standardSource,
      sourceField: 'functional_privatization_audit',
      sourceFieldRole: 'standard_contract_source' as const,
      legacyImportSourceFields: [],
    };
  }

  const legacySources: Array<{
    source: JsonRecord | null;
    sourceField: string;
  }> = [
    {
      source: nestedRecord(manifest, ['privatized_functional_module_audit']),
      sourceField: 'privatized_functional_module_audit',
    },
    {
      source: nestedRecord(manifest, ['mag_consumer_thinning_contract', 'privatized_functional_module_audit']),
      sourceField: 'mag_consumer_thinning_contract.privatized_functional_module_audit',
    },
    {
      source: nestedRecord(manifest, ['runtime_framework', 'rca_thin_surface_policy', 'privatized_functional_module_audit']),
      sourceField: 'runtime_framework.rca_thin_surface_policy.privatized_functional_module_audit',
    },
    {
      source: nestedRecord(manifest, ['functional_consumer_boundary']),
      sourceField: 'functional_consumer_boundary',
    },
  ];
  const legacy = legacySources.find((entry) => entry.source);
  if (!legacy?.source) {
    return {
      source: null,
      sourceField: null,
      sourceFieldRole: null,
      legacyImportSourceFields: [] as string[],
    };
  }
  return {
    source: legacy.source,
    sourceField: legacy.sourceField,
    sourceFieldRole: 'legacy_import_adapter' as FunctionalPrivatizationAuditSourceFieldRole,
    legacyImportSourceFields: [legacy.sourceField],
  };
}

function isCompactCanonicalAudit(source: JsonRecord) {
  return source.surface_kind === 'functional_privatization_audit'
    && typeof source.schema_version === 'number'
    && Boolean(stringValue(source.owner))
    && Array.isArray(source.modules);
}

function compactAuditSchemaBlockers(source: JsonRecord) {
  if (!isCompactCanonicalAudit(source)) {
    return [];
  }

  const blockers = [
    stringValue(source.domain_id) ? null : 'compact_functional_audit_missing_domain_id',
    stringValue(source.target_domain_id) ? null : 'compact_functional_audit_missing_target_domain_id',
    isRecord(source.authority_boundary) ? null : 'compact_functional_audit_missing_authority_boundary',
    Array.isArray(source.retired_generated_surface_provenance)
      ? null
      : 'compact_functional_audit_missing_retired_generated_surface_provenance',
    Array.isArray(source.retired_generated_surface_provenance)
      && source.retired_generated_surface_provenance.length > 0
        ? null
        : 'compact_functional_audit_requires_retired_generated_surface_provenance_entry',
    isRecord(source.bridge_exit_gate) ? null : 'compact_functional_audit_missing_bridge_exit_gate',
  ].filter((entry): entry is string => Boolean(entry));
  const expectedLayers: Record<string, FunctionalPrivatizationStandardizationLayer> = {
    minimal_authority_function: 'authority_function_inventory',
    refs_only_domain_adapter: 'private_platform_residue_inventory',
  };

  for (const [index, module] of recordList(source.modules).entries()) {
    const classification = stringValue(module.classification);
    const expectedLayer = classification ? expectedLayers[classification] : undefined;
    if (!expectedLayer) {
      blockers.push(`compact_functional_audit_invalid_module_classification:${index}`);
      continue;
    }
    if (!stringValue(module.module_id)) {
      blockers.push(`compact_functional_audit_missing_module_id:${index}`);
    }
    if (!Array.isArray(module.code_paths)) {
      blockers.push(`compact_functional_audit_missing_code_paths:${index}`);
    }
    if (!Array.isArray(module.active_callers)) {
      blockers.push(`compact_functional_audit_missing_active_callers:${index}`);
    }
    if (!stringValue(module.migration_action)) {
      blockers.push(`compact_functional_audit_missing_migration_action:${index}`);
    }
    if (!stringValue(module.retention_reason)) {
      blockers.push(`compact_functional_audit_missing_retention_reason:${index}`);
    }
    if (stringValue(module.standardization_layer) !== expectedLayer) {
      blockers.push(`compact_functional_audit_standardization_layer_mismatch:${index}`);
    }
  }

  const bridgeExitGate = isRecord(source.bridge_exit_gate) ? source.bridge_exit_gate : null;
  if (bridgeExitGate) {
    const allowedBridgeFields = new Set([
      'physical_delete_authorization_refs',
      'no_forbidden_write_refs',
      'provenance_refs',
    ]);
    for (const field of Object.keys(bridgeExitGate)) {
      if (!allowedBridgeFields.has(field)) {
        blockers.push(`compact_functional_audit_bridge_exit_gate_unsupported_field:${field}`);
      }
    }
    for (const field of allowedBridgeFields) {
      if (!Array.isArray(bridgeExitGate[field])) {
        blockers.push(`compact_functional_audit_bridge_exit_gate_missing_ref_list:${field}`);
      }
    }
  }

  const retiredProvenance = Array.isArray(source.retired_generated_surface_provenance)
    ? source.retired_generated_surface_provenance
    : [];
  for (const [index, value] of retiredProvenance.entries()) {
    if (!isRecord(value)) {
      blockers.push(`compact_functional_audit_retired_provenance_invalid_entry:${index}`);
      continue;
    }
    const provenance = value;
    if (!stringValue(provenance.surface_id)) {
      blockers.push(`compact_functional_audit_retired_provenance_missing_surface_id:${index}`);
    }
    if (!stringValue(provenance.replacement_ref)) {
      blockers.push(`compact_functional_audit_retired_provenance_missing_replacement_ref:${index}`);
    }
    if (!Array.isArray(provenance.provenance_refs)) {
      blockers.push(`compact_functional_audit_retired_provenance_missing_provenance_refs:${index}`);
    }
  }

  return unique(blockers);
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
    || text === 'domain_handler_target'
    || text === 'domain_handler_target_only'
    || text === 'domain_authority_refs'
  ) {
    return 'refs_only_domain_adapter';
  }
  if (text === 'opl_storage_substrate_mas_refs_projection') {
    return 'opl_storage_substrate_mas_refs_projection';
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
    || text === 'native_helper_implementation'
    || text === 'domain_specific_native_helper_implementation'
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
> & {
  semantic_equivalence_status?: string | null;
  semantic_equivalence_reason?: string | null;
};

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
  const explicitSemanticEquivalenceStatus = stringValue(item.semantic_equivalence_status);
  const explicitSemanticEquivalenceReason = stringValue(item.semantic_equivalence_reason);
  const semanticEquivalenceReason = semanticEquivalenceReviewReason(item);
  const semanticEquivalenceStatus =
    explicitSemanticEquivalenceStatus === 'cleared_by_boundary'
    || explicitSemanticEquivalenceStatus === 'review_required'
      ? explicitSemanticEquivalenceStatus
      : semanticEquivalenceReason
        ? 'review_required'
        : 'cleared_by_boundary';
  const standardization = standardizationLayer(item);
  return {
    ...item,
    audit_visibility: reason ? 'attention_required' : 'hidden_by_default',
    audit_reason: reason ?? 'cleared_or_stable_boundary',
    standardization_layer: standardization.layer,
    standardization_layer_reason: standardization.reason,
    semantic_equivalence_status: semanticEquivalenceStatus,
    semantic_equivalence_reason:
      explicitSemanticEquivalenceReason
      ?? semanticEquivalenceReason
      ?? 'cleared_by_current_owner_boundary',
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
  if (item.migration_class === 'opl_storage_substrate_mas_refs_projection') {
    return {
      layer: 'standard_domain_pack_inventory',
      reason: 'opl_storage_substrate_with_domain_refs_projection_not_private_platform_residue',
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
    && record.retired_route_alias_allowed !== true;
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
      stringValue(record.replacement_ref),
      ...stringList(record.provenance_refs),
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
    semantic_equivalence_status: stringValue(record.semantic_equivalence_status),
    semantic_equivalence_reason: stringValue(record.semantic_equivalence_reason),
    semantic_equivalence_evidence_refs: unique([
      ...stringList(record.semantic_equivalence_evidence_refs),
      ...stringList(record.semantic_equivalence_proof_refs),
    ]),
    semantic_equivalence_typed_blocker_refs: unique([
      ...stringList(record.semantic_equivalence_typed_blocker_refs),
      ...stringList(record.typed_blocker_refs),
    ]),
    semantic_equivalence_no_regression_refs: unique([
      ...stringList(record.semantic_equivalence_no_regression_refs),
      ...stringList(record.no_regression_evidence_refs),
      ...stringList(record.no_forbidden_write_refs),
      ...stringList(record.no_forbidden_write_evidence_refs),
      ...stringList(isRecord(record.bridge_exit_gate)
        ? record.bridge_exit_gate.no_forbidden_write_refs
        : []),
    ]),
    private_platform_residue_gate: privatePlatformResidueGateFromRecord(record),
    bridge_exit_gate: isRecord(record.bridge_exit_gate) ? record.bridge_exit_gate : null,
    forbidden_generic_owner_flags: isRecord(record.forbidden_generic_owner_flags)
      ? record.forbidden_generic_owner_flags
      : {},
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

function itemsFromRetiredGeneratedSurfaceProvenance(source: JsonRecord) {
  const bridgeExitGate = isRecord(source.bridge_exit_gate) ? source.bridge_exit_gate : null;
  return recordList(source.retired_generated_surface_provenance).map((entry) => itemFromRecord(
    {
      module_id: stringValue(entry.surface_id) ?? 'unknown_retired_generated_surface',
      classification: 'provenance_or_fixture',
      active_caller_allowed: false,
      tombstone_required: true,
      current_surface_refs: unique([
        stringValue(entry.replacement_ref) ?? '',
        ...stringList(entry.provenance_refs),
      ]),
      retention_reason: 'retired_generated_surface_provenance',
      bridge_exit_gate: bridgeExitGate,
    },
    'retired_generated_surface_provenance',
    'provenance_or_fixture',
  ));
}

function itemsFromPackInventory(manifest: JsonRecord) {
  const inventory = isRecord(manifest.pack_inventory) ? manifest.pack_inventory : null;
  if (!inventory) {
    return [];
  }
  const sourceRef = stringValue(inventory.source_ref) ?? 'pack_inventory.declarative_domain_pack';
  return stringList(inventory.declarative_domain_pack).map((moduleId) => itemFromRecord(
    {
      module_id: moduleId,
      classification: 'declarative_pack',
      current_surface_refs: [sourceRef],
      retention_reason: 'declared_domain_pack_inventory',
    },
    'pack_inventory.declarative_domain_pack',
    'declarative_pack',
  ));
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
    const blockers = ['functional_privatization_audit_missing'];
    const gates = buildEmptyFunctionalEvidenceGateProjection();
    return {
      surface_kind: 'opl_functional_privatization_audit',
      version: 'opl-functional-privatization-audit.v1',
      status: 'missing',
      envelope: buildFunctionalPrivatizationAuditEnvelopeFromAudit({
        status: 'missing',
        sourceField: null,
        sourceFieldRole: null,
        legacyImportSourceFields: [],
        targetDomainId: null,
        summary: EMPTY_SUMMARY,
        evidenceGateProjection: gates,
        externalEvidenceRequestPack: null,
        replacementExpectations: [],
        blockers,
      }),
      source_field: null,
      source_field_role: null,
      legacy_import_source_fields: [],
      target_domain_id: null,
      summary: EMPTY_SUMMARY,
      source_purity_tail_read_model: buildFunctionalSourcePurityTailReadModel(EMPTY_SUMMARY),
      modules: [],
      standard_domain_pack_inventory: [],
      authority_function_inventory: [],
      private_platform_residue_inventory: [],
      required_opl_replacement_primitives: [],
      external_evidence_request_pack: null,
      evidence_gate_projection: gates,
      opl_replacement_expectations: [],
      blockers,
      authority_boundary: {
        opl_can_write_domain_truth: false,
        opl_can_write_memory_body: false,
        opl_can_authorize_quality_or_export: false,
        domain_can_claim_generic_runtime_owner: false,
      },
    };
  }
  const {
    source,
    sourceField,
    sourceFieldRole,
    legacyImportSourceFields,
  } = selectedAuditSource(manifest);
  if (!source) {
    const blockers = ['functional_privatization_audit_missing'];
    const gates = buildEmptyFunctionalEvidenceGateProjection();
    const targetDomainId = stringValue(manifest.target_domain_id);
    return {
      surface_kind: 'opl_functional_privatization_audit',
      version: 'opl-functional-privatization-audit.v1',
      status: 'missing',
      envelope: buildFunctionalPrivatizationAuditEnvelopeFromAudit({
        status: 'missing',
        sourceField: null,
        sourceFieldRole: null,
        legacyImportSourceFields: [],
        targetDomainId,
        summary: EMPTY_SUMMARY,
        evidenceGateProjection: gates,
        externalEvidenceRequestPack: null,
        replacementExpectations: [],
        blockers,
      }),
      source_field: null,
      source_field_role: null,
      legacy_import_source_fields: [],
      target_domain_id: targetDomainId,
      summary: EMPTY_SUMMARY,
      source_purity_tail_read_model: buildFunctionalSourcePurityTailReadModel(EMPTY_SUMMARY),
      modules: [],
      standard_domain_pack_inventory: [],
      authority_function_inventory: [],
      private_platform_residue_inventory: [],
      required_opl_replacement_primitives: [],
      external_evidence_request_pack: null,
      evidence_gate_projection: gates,
      opl_replacement_expectations: [],
      blockers,
      authority_boundary: {
        opl_can_write_domain_truth: false,
        opl_can_write_memory_body: false,
        opl_can_authorize_quality_or_export: false,
        domain_can_claim_generic_runtime_owner: false,
      },
    };
  }
  const compactCanonicalAudit = isCompactCanonicalAudit(source);
  const sourceModules =
    sourceField === 'functional_consumer_boundary'
      ? itemsFromMasBoundary(source)
      : itemsFromStructuredAudit(source);
  const modules = compactCanonicalAudit
    ? [
        ...sourceModules,
        ...itemsFromRetiredGeneratedSurfaceProvenance(source),
        ...itemsFromPackInventory(manifest),
      ]
    : sourceModules;
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
  const allBlockers = unique([
    ...blockers,
    ...compactAuditSchemaBlockers(source),
  ]);
  const normalizedSummary = {
    ...summary,
    blocker_count: allBlockers.length,
  };
  const evidencePack = externalEvidenceRequestPack(source, manifest);
  const gates = evidenceGateProjection(source);
  const replacementExpectations = oplReplacementExpectations(source, manifest);
  const targetDomainId = stringValue(source.target_domain_id) ?? stringValue(manifest.target_domain_id);
  return {
    surface_kind: 'opl_functional_privatization_audit',
    version: 'opl-functional-privatization-audit.v1',
    status: 'resolved',
    envelope: buildFunctionalPrivatizationAuditEnvelopeFromAudit({
      status: 'resolved',
      sourceField,
      sourceFieldRole,
      legacyImportSourceFields,
      targetDomainId,
        summary: normalizedSummary,
      evidenceGateProjection: gates,
      externalEvidenceRequestPack: evidencePack,
      replacementExpectations,
        blockers: allBlockers,
    }),
    source_field: sourceField,
    source_field_role: sourceFieldRole,
    legacy_import_source_fields: legacyImportSourceFields,
    target_domain_id: targetDomainId,
    summary: normalizedSummary,
    source_purity_tail_read_model: buildFunctionalSourcePurityTailReadModel(normalizedSummary),
    modules,
    standard_domain_pack_inventory: standardDomainPackItems,
    authority_function_inventory: authorityFunctionItems,
    private_platform_residue_inventory: privatePlatformResidueItems,
    required_opl_replacement_primitives: requiredOplReplacementPrimitives,
    external_evidence_request_pack: evidencePack,
    evidence_gate_projection: gates,
    opl_replacement_expectations: replacementExpectations,
    blockers: allBlockers,
    authority_boundary: {
      opl_can_write_domain_truth: false,
      opl_can_write_memory_body: false,
      opl_can_authorize_quality_or_export: false,
      domain_can_claim_generic_runtime_owner: false,
    },
  };
}
