import { isRecord } from '../../../kernel/contract-validation.ts';
import { stringList, stringValue } from '../../../kernel/json-record.ts';
import type { FunctionalPrivatizationAuditSourceFieldRole } from '../functional-privatization-envelope.ts';
import type {
  FunctionalEvidenceGateProjection,
  FunctionalExternalEvidenceRequestPack,
  FunctionalOplReplacementExpectation,
  FunctionalPrivatizationStandardizationLayer,
} from '../functional-privatization-audit-types.ts';
import { nestedRecord, recordList, unique, type JsonRecord } from './json-record-helpers.ts';

export function externalEvidenceRequestPack(source: JsonRecord, manifest: JsonRecord) {
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

export function evidenceGateProjection(source: JsonRecord) {
  const sourceRefs: string[] = [];
  const collect = (recordValue: JsonRecord | null, pointer: string) => {
    if (!recordValue) {
      return { evidenceGateIds: [] as string[], bridgeModuleIds: [] as string[] };
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

export function oplReplacementExpectations(source: JsonRecord, manifest: JsonRecord) {
  const expectations = recordList(
    nestedRecord(source, ['mag_consumer_thinning_contract'])?.opl_replacement_expectations,
  );
  const manifestExpectations = recordList(
    nestedRecord(manifest, ['mag_consumer_thinning_contract'])?.opl_replacement_expectations,
  );
  const productManifestExpectations = recordList(
    nestedRecord(manifest, ['product_entry_manifest', 'mag_consumer_thinning_contract'])
      ?.opl_replacement_expectations,
  );
  return [...expectations, ...manifestExpectations, ...productManifestExpectations].map((entry) => ({
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

export function selectedAuditSource(manifest: JsonRecord) {
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

  const legacySources: Array<{ source: JsonRecord | null; sourceField: string }> = [
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

export function isCompactCanonicalAudit(source: JsonRecord) {
  return source.surface_kind === 'functional_privatization_audit'
    && typeof source.schema_version === 'number'
    && Boolean(stringValue(source.owner))
    && Array.isArray(source.modules);
}

export function compactAuditSchemaBlockers(source: JsonRecord) {
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
    if (!stringValue(module.module_id)) blockers.push(`compact_functional_audit_missing_module_id:${index}`);
    if (!Array.isArray(module.code_paths)) blockers.push(`compact_functional_audit_missing_code_paths:${index}`);
    if (!Array.isArray(module.active_callers)) blockers.push(`compact_functional_audit_missing_active_callers:${index}`);
    if (!stringValue(module.migration_action)) blockers.push(`compact_functional_audit_missing_migration_action:${index}`);
    if (!stringValue(module.retention_reason)) blockers.push(`compact_functional_audit_missing_retention_reason:${index}`);
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
      if (!allowedBridgeFields.has(field)) blockers.push(`compact_functional_audit_bridge_exit_gate_unsupported_field:${field}`);
    }
    for (const field of allowedBridgeFields) {
      if (!Array.isArray(bridgeExitGate[field])) blockers.push(`compact_functional_audit_bridge_exit_gate_missing_ref_list:${field}`);
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
    if (!stringValue(value.surface_id)) blockers.push(`compact_functional_audit_retired_provenance_missing_surface_id:${index}`);
    if (!stringValue(value.replacement_ref)) blockers.push(`compact_functional_audit_retired_provenance_missing_replacement_ref:${index}`);
    if (!Array.isArray(value.provenance_refs)) blockers.push(`compact_functional_audit_retired_provenance_missing_provenance_refs:${index}`);
  }
  return unique(blockers);
}
