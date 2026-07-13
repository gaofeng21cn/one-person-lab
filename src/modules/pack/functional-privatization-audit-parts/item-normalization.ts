import { isRecord } from '../../../kernel/contract-validation.ts';
import { stringList, stringValue } from '../../../kernel/json-record.ts';
import { privatePlatformResidueGateFromRecord } from '../private-platform-residue-deletion-gate.ts';
import type {
  FunctionalPrivatizationAuditItem,
  FunctionalPrivatizationMigrationClass,
  FunctionalPrivatizationStandardizationLayer,
} from '../functional-privatization-audit-types.ts';
import { unique, type JsonRecord } from './json-record-helpers.ts';

function migrationClass(value: unknown): FunctionalPrivatizationMigrationClass {
  const text = stringValue(value);
  if (
    text === 'opl_owned_replacement'
    || text === 'opl_owned_generic_primitive_consumer'
    || text === 'A_opl_owned_mas_consumes'
    || text === 'split_owner_boundary'
    || text === 'opl_owned_generic_envelope_rca_owned_helper_implementation'
    || text === 'opl_owned_observability_stability_read_model_consumed_by_rca'
  ) return 'opl_owned_replacement';
  if (text === 'opl_hosted_surface' || text === 'hosted_surface') return 'opl_hosted_surface';
  if (
    text === 'domain_authority'
    || text === 'mag_owned_grant_truth_receipt_verdict'
    || text === 'rca_owned_visual_domain_authority'
  ) return 'domain_authority';
  if (
    text === 'domain_thin_adapter'
    || text === 'refs_only_adapter'
    || text === 'refs_only_domain_adapter'
    || text === 'refs_only_projection'
    || text === 'domain_handler_target'
    || text === 'domain_handler_target_only'
    || text === 'domain_authority_refs'
  ) return 'refs_only_domain_adapter';
  if (text === 'opl_storage_substrate_mas_refs_projection') return 'opl_storage_substrate_mas_refs_projection';
  if (
    text === 'opl_generated_surface'
    || text === 'generated_surface'
    || text === 'generated_surface_handoff'
    || text === 'opl_generated_cli_mcp_product_sidecar_status'
  ) return 'opl_generated_surface';
  if (
    text === 'declarative_pack'
    || text === 'declarative_pack_surface'
    || text === 'declarative_pack_generated_surface'
    || text === 'domain_declarative_pack'
    || text === 'stage_policy_schema_fixture_pack'
  ) return 'declarative_pack';
  if (
    text === 'minimal_authority_function'
    || text === 'domain_minimal_authority_function'
    || text === 'authority_function'
    || text === 'native_helper_implementation'
    || text === 'domain_specific_native_helper_implementation'
  ) return 'minimal_authority_function';
  if (text === 'temporary_migration_bridge' || text === 'migration_bridge') return 'temporary_migration_bridge';
  if (
    text === 'diagnostic_cleanup_path'
    || text === 'legacy_cleanup_no_active_caller_gate'
    || text === 'legacy_cleanup_physical_retired'
    || text === 'cleanup_diagnostic_path'
  ) return 'diagnostic_cleanup_path';
  if (
    text === 'provenance_or_fixture'
    || text === 'legacy_proof_tombstone'
    || text === 'history_tombstone'
    || text === 'provenance_fixture'
  ) return 'provenance_or_fixture';
  if (text === 'retire_tombstone' || text === 'retire_when_replaced_or_uncalled') return 'retire_tombstone';
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
  if (item.blocker) return 'blocker';
  if (item.migration_class === 'opl_owned_replacement') return 'opl_replacement_pending';
  if (item.migration_class === 'temporary_migration_bridge') return 'migration_bridge_pending';
  if (item.migration_class === 'retire_tombstone') return 'legacy_tombstone_pending';
  if (item.migration_class === 'diagnostic_cleanup_path' && item.active_caller_allowed) {
    return 'diagnostic_cleanup_path_still_active';
  }
  if (item.tombstone_required && item.active_caller_allowed) return 'tombstone_has_active_caller';
  return null;
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
  const statusText = [item.active_caller_status, item.migration_action, item.module_id]
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
  ) return 'active_caller_wording_requires_opl_semantic_equivalence_proof';
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

export function itemFromRecord(
  record: JsonRecord,
  source: string,
  fallbackClass: FunctionalPrivatizationMigrationClass,
): FunctionalPrivatizationAuditItem {
  const moduleId =
    stringValue(record.module_id)
    ?? stringValue(record.surface_id)
    ?? stringValue(record.primitive)
    ?? 'unknown_functional_module';
  const itemClass = record.migration_class || record.migrationClass || record.classification
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
    active_caller_status: stringValue(record.active_caller_status) ?? stringValue(record.activeCallerStatus),
    migration_action: stringValue(record.migration_action) ?? stringValue(record.migrationAction),
    retention_reason: stringValue(record.retention_reason) ?? stringValue(record.retentionReason),
    cannot_absorb_reason: stringValue(record.cannot_absorb_reason) ?? stringValue(record.cannotAbsorbReason),
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
      ...stringList(isRecord(record.bridge_exit_gate) ? record.bridge_exit_gate.no_forbidden_write_refs : []),
    ]),
    private_platform_residue_gate: privatePlatformResidueGateFromRecord(record),
    bridge_exit_gate: isRecord(record.bridge_exit_gate) ? record.bridge_exit_gate : null,
    forbidden_generic_owner_flags: isRecord(record.forbidden_generic_owner_flags)
      ? record.forbidden_generic_owner_flags
      : {},
  });
}
