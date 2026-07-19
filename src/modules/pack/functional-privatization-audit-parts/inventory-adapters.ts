import { isRecord } from '../../../kernel/contract-validation.ts';
import { stringList, stringValue } from '../../../kernel/json-record.ts';
import { itemFromRecord } from './item-normalization.ts';
import { recordList, unique, type JsonRecord } from './json-record-helpers.ts';

export function itemsFromStructuredAudit(source: JsonRecord) {
  return recordList(source.modules)
    .map((entry) => itemFromRecord(entry, 'modules', 'temporary_migration_bridge'));
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
