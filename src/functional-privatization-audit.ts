type JsonRecord = Record<string, unknown>;

export type FunctionalPrivatizationMigrationClass =
  | 'opl_owned_replacement'
  | 'domain_thin_adapter'
  | 'domain_authority'
  | 'retire_tombstone';

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
    domain_thin_adapter_count: number;
    domain_authority_count: number;
    retire_tombstone_count: number;
    blocker_count: number;
  };
  modules: FunctionalPrivatizationAuditItem[];
  required_opl_replacement_primitives: string[];
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
  ],
  accepted_source_fields: [
    'functional_privatization_audit',
    'privatized_functional_module_audit',
    'functional_consumer_boundary',
    'mag_consumer_thinning_contract.privatized_functional_module_audit',
    'runtime_framework.rca_thin_surface_policy.privatized_functional_module_audit',
  ],
  migration_classes: [
    'opl_owned_replacement',
    'domain_thin_adapter',
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
  domain_thin_adapter_count: 0,
  domain_authority_count: 0,
  retire_tombstone_count: 0,
  blocker_count: 0,
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
    text === 'domain_authority'
    || text === 'mag_owned_grant_truth_receipt_verdict'
    || text === 'rca_owned_visual_domain_authority'
  ) {
    return 'domain_authority';
  }
  if (text === 'domain_thin_adapter') {
    return 'domain_thin_adapter';
  }
  if (text === 'retire_tombstone' || text === 'retire_when_replaced_or_uncalled') {
    return 'retire_tombstone';
  }
  if (
    text === 'opl_owned_generic_primitive_consumer'
    || text === 'A_opl_owned_mas_consumes'
    || text === 'split_owner_boundary'
    || text === 'opl_owned_generic_envelope_rca_owned_helper_implementation'
    || text === 'opl_owned_observability_stability_read_model_consumed_by_rca'
  ) {
    return 'opl_owned_replacement';
  }
  return 'domain_thin_adapter';
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
  const itemClass = record.classification ? migrationClass(record.classification) : fallbackClass;
  const currentOwner =
    stringValue(record.owner)
    ?? (record.rca_owned_visual_domain_authority === true ? 'redcube_ai' : null)
    ?? (itemClass === 'opl_owned_replacement' ? 'one-person-lab' : null);
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
    && record.active_caller_allowed !== false
    && record.compatibility_alias_allowed !== false;
  const blocker =
    stringValue(record.blocker)
    ?? (record.claims_opl_replacement_exists === false ? 'opl_replacement_evidence_pending' : null)
    ?? (record.declares_production_soak_complete === true ? 'invalid_live_soak_claim' : null);
  return {
    module_id: moduleId,
    source,
    migration_class: itemClass,
    current_owner: currentOwner,
    opl_replacement_owner: itemClass === 'opl_owned_replacement' ? 'one-person-lab' : null,
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
    tombstone_required: Boolean(record.tombstone_required) || itemClass === 'retire_tombstone',
    blocker,
  };
}

function itemsFromModuleInventory(source: JsonRecord, sourcePath: string) {
  return recordList(source.functional_module_inventory)
    .map((entry) => itemFromRecord(entry, `${sourcePath}.functional_module_inventory`, 'domain_thin_adapter'));
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
    ...recordList(source.modules).map((entry) => itemFromRecord(entry, 'modules', 'domain_thin_adapter')),
    ...recordList(source.opl_owned_generic_primitive_consumers).map((entry) =>
      itemFromRecord(entry, 'opl_owned_generic_primitive_consumers', 'opl_owned_replacement')),
    ...recordList(source.mag_owned_grant_authority_surfaces).map((entry) =>
      itemFromRecord(entry, 'mag_owned_grant_authority_surfaces', 'domain_authority')),
    ...recordList(source.retire_or_tombstone_surfaces).map((entry) =>
      itemFromRecord(entry, 'retire_or_tombstone_surfaces', 'retire_tombstone')),
  ];
  return modules;
}

function summarize(items: FunctionalPrivatizationAuditItem[]) {
  const blockers = unique(items.map((item) => item.blocker).filter((entry): entry is string => Boolean(entry)));
  return {
    summary: {
      total_module_count: items.length,
      opl_owned_replacement_count: items.filter((item) => item.migration_class === 'opl_owned_replacement').length,
      domain_thin_adapter_count: items.filter((item) => item.migration_class === 'domain_thin_adapter').length,
      domain_authority_count: items.filter((item) => item.migration_class === 'domain_authority').length,
      retire_tombstone_count: items.filter((item) => item.migration_class === 'retire_tombstone').length,
      blocker_count: blockers.length,
    },
    blockers,
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
      required_opl_replacement_primitives: [],
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
      required_opl_replacement_primitives: [],
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
  const { summary, blockers } = summarize(modules);
  return {
    surface_kind: 'opl_functional_privatization_audit',
    version: 'opl-functional-privatization-audit.v1',
    status: 'resolved',
    source_field: sourceField,
    target_domain_id: stringValue(source.target_domain_id) ?? stringValue(manifest.target_domain_id),
    summary,
    modules,
    required_opl_replacement_primitives: requiredOplReplacementPrimitives,
    blockers,
    authority_boundary: {
      opl_can_write_domain_truth: false,
      opl_can_write_memory_body: false,
      opl_can_authorize_quality_or_export: false,
      domain_can_claim_generic_runtime_owner: false,
    },
  };
}
