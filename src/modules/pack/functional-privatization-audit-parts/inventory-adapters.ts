import { isRecord } from '../../../kernel/contract-validation.ts';
import { stringList, stringValue } from '../../../kernel/json-record.ts';
import type { FunctionalPrivatizationAuditItem } from '../functional-privatization-audit-types.ts';
import { itemFromRecord } from './item-normalization.ts';
import { recordList, unique, type JsonRecord } from './json-record-helpers.ts';

function itemsFromModuleInventory(source: JsonRecord, sourcePath: string) {
  return recordList(source.functional_module_inventory)
    .map((entry) => itemFromRecord(
      entry,
      `${sourcePath}.functional_module_inventory`,
      'temporary_migration_bridge',
    ));
}

export function itemsFromMasBoundary(source: JsonRecord) {
  const inventoryItems = itemsFromModuleInventory(source, 'functional_consumer_boundary');
  if (inventoryItems.length > 0) return inventoryItems;
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
      { module_id: moduleId, owner: 'med-autoscience', classification: 'domain_authority' },
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

export function itemsFromStructuredAudit(source: JsonRecord) {
  return [
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
}

export function itemsFromRetiredGeneratedSurfaceProvenance(source: JsonRecord) {
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

export function itemsFromPackInventory(manifest: JsonRecord) {
  const inventory = isRecord(manifest.pack_inventory) ? manifest.pack_inventory : null;
  if (!inventory) return [];
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
