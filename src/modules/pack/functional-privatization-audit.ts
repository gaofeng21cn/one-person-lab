import {
  buildEmptyFunctionalEvidenceGateProjection,
  buildFunctionalPrivatizationAuditEnvelopeFromAudit,
  buildFunctionalSourcePurityTailReadModel,
  FUNCTIONAL_PRIVATIZATION_AUDIT_ENVELOPE_CONTRACT,
} from './functional-privatization-envelope.ts';
import type { FunctionalPrivatizationAudit } from './functional-privatization-audit-types.ts';
import {
  itemsFromPackInventory,
  itemsFromRetiredGeneratedSurfaceProvenance,
  itemsFromStructuredAudit,
} from './functional-privatization-audit-parts/inventory-adapters.ts';
import { unique, type JsonRecord } from './functional-privatization-audit-parts/json-record-helpers.ts';
import {
  compactAuditSchemaBlockers,
  evidenceGateProjection,
  externalEvidenceRequestPack,
  isCompactCanonicalAudit,
  oplReplacementExpectations,
  selectedAuditSource,
} from './functional-privatization-audit-parts/source-projection.ts';
import { EMPTY_SUMMARY, summarize } from './functional-privatization-audit-parts/summary.ts';
import { isRecord } from '../../kernel/contract-validation.ts';
import { stringList, stringValue } from '../../kernel/json-record.ts';

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

function missingAudit(targetDomainId: string | null): FunctionalPrivatizationAudit {
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

export function buildFunctionalPrivatizationAudit(
  manifest: JsonRecord | null | undefined,
): FunctionalPrivatizationAudit {
  if (!isRecord(manifest)) {
    return missingAudit(null);
  }
  const {
    source,
    sourceField,
    sourceFieldRole,
  } = selectedAuditSource(manifest);
  if (!source) {
    return missingAudit(stringValue(manifest.target_domain_id));
  }

  const compactCanonicalAudit = isCompactCanonicalAudit(source);
  const sourceModules = itemsFromStructuredAudit(source);
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
  const allBlockers = unique([...blockers, ...compactAuditSchemaBlockers(source)]);
  const normalizedSummary = { ...summary, blocker_count: allBlockers.length };
  const evidencePack = externalEvidenceRequestPack(source);
  const gates = evidenceGateProjection(source);
  const replacementExpectations = oplReplacementExpectations(source);
  const targetDomainId = stringValue(source.target_domain_id) ?? stringValue(manifest.target_domain_id);

  return {
    surface_kind: 'opl_functional_privatization_audit',
    version: 'opl-functional-privatization-audit.v1',
    status: 'resolved',
    envelope: buildFunctionalPrivatizationAuditEnvelopeFromAudit({
      status: 'resolved',
      sourceField,
      sourceFieldRole,
      targetDomainId,
      summary: normalizedSummary,
      evidenceGateProjection: gates,
      externalEvidenceRequestPack: evidencePack,
      replacementExpectations,
      blockers: allBlockers,
    }),
    source_field: sourceField,
    source_field_role: sourceFieldRole,
    legacy_import_source_fields: [],
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
