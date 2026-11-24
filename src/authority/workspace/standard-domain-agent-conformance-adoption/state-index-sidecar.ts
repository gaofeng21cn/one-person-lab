import {
  isRecord,
  optionalString,
  readJsonFile,
  stringList,
  type JsonRecord,
} from '../../packages/index.ts';
const REQUIRED_STATE_INDEX_DATABASES = [
  'queue',
  'lifecycle_index',
  'artifact_index',
  'operator_read_model',
];

const REQUIRED_STATE_INDEX_REF_FIELDS = [
  'domain_id',
  'program_id',
  'stage_id',
  'attempt_id',
  'surface_id',
  'source_ref',
  'receipt_ref',
  'content_hash',
  'observed_at',
  'indexed_at',
  'index_version',
  'rebuild_epoch',
];

const REQUIRED_STATE_INDEX_AUTHORITY_FLAGS = [
  'sqlite_sidecar_source_of_truth',
  'sqlite_record_counts_as_stage_complete',
  'opl_can_write_domain_truth',
  'opl_can_write_memory_body',
  'opl_can_write_artifact_body',
  'opl_can_store_large_artifact_blob_in_sqlite',
  'opl_can_create_domain_owner_receipt',
  'opl_can_authorize_quality_or_export',
  'domain_repo_can_own_generic_sqlite_persistence_engine',
];
export function buildStateIndexKernelAdoptionChecks(repoDir: string) {
  const adoptionFile = readJsonFile(repoDir, 'contracts/state_index_kernel_adoption.json');
  const stageArtifactAdoptionFile = readJsonFile(repoDir, 'contracts/stage_artifact_kernel_adoption.json');
  const stageArtifactAdoption = isRecord(stageArtifactAdoptionFile.payload)
    ? stageArtifactAdoptionFile.payload
    : null;
  const sidecarAdoption = isRecord(stageArtifactAdoption?.opl_state_index_kernel_adoption)
    ? stageArtifactAdoption.opl_state_index_kernel_adoption
    : null;
  if (adoptionFile.status !== 'resolved' && sidecarAdoption) {
    return buildOplStateIndexKernelSidecarChecks(sidecarAdoption, stageArtifactAdoptionFile.status);
  }
  const adoption = isRecord(adoptionFile.payload) ? adoptionFile.payload : null;
  const authority = isRecord(adoption?.authority_boundary) ? adoption.authority_boundary : {};
  const compactionPolicy = isRecord(adoption?.compaction_policy) ? adoption.compaction_policy : {};
  const maintenancePolicy = isRecord(adoption?.maintenance_policy) ? adoption.maintenance_policy : {};
  const requiredDatabases = stringList(adoption?.required_index_databases);
  const requiredFields = stringList(adoption?.required_ref_fields);
  const domainRefSources = stringList(adoption?.domain_ref_sources);
  const blockers = stateIndexKernelAdoptionBlockers({
    adoption,
    adoptionFileStatus: adoptionFile.status,
    authority,
    compactionPolicy,
    domainRefSources,
    maintenancePolicy,
    requiredDatabases,
    requiredFields,
  });
  return {
    status: blockers.length === 0 ? 'passed' : 'blocked',
    policy_status: blockers.length === 0 ? 'declared' : 'blocked',
    policy_source: 'contracts/state_index_kernel_adoption.json',
    kernel_contract_ref: optionalString(adoption?.kernel_contract_ref),
    sqlite_role: optionalString(adoption?.sqlite_role),
    physical_truth_role: optionalString(adoption?.physical_truth_role),
    required_index_databases: requiredDatabases,
    required_ref_fields: requiredFields,
    domain_ref_sources: domainRefSources,
    compaction_policy: {
      small_file_runtime_refs_may_be_indexed:
        compactionPolicy.small_file_runtime_refs_may_be_indexed ?? null,
      large_payload_strategy: optionalString(compactionPolicy.large_payload_strategy),
      index_rebuild_source: optionalString(compactionPolicy.index_rebuild_source),
      app_reads_projection_not_sqlite_directly:
        compactionPolicy.app_reads_projection_not_sqlite_directly ?? null,
    },
    maintenance_policy: {
      journal_mode: optionalString(maintenancePolicy.journal_mode),
      busy_timeout_ms: maintenancePolicy.busy_timeout_ms ?? null,
      checkpoint_required: maintenancePolicy.checkpoint_required ?? null,
      backup_required: maintenancePolicy.backup_required ?? null,
      integrity_check_required: maintenancePolicy.integrity_check_required ?? null,
      optimize_required: maintenancePolicy.optimize_required ?? null,
      network_filesystem_multi_writer_supported:
        maintenancePolicy.network_filesystem_multi_writer_supported ?? null,
    },
    authority_boundary: Object.fromEntries(
      REQUIRED_STATE_INDEX_AUTHORITY_FLAGS.map((flag) => [flag, authority[flag] ?? null]),
    ),
    blockers,
  };
}

const OPL_STATE_INDEX_KERNEL_SIDECAR_VERSION = 'opl-state-index-kernel-sidecar-adoption.v1';

const OPL_STATE_INDEX_KERNEL_SIDECAR_REQUIRED_AUTHORITY: Record<string, boolean> = {
  opl_owns_state_index_kernel: true,
  opl_can_store_refs_hashes_provenance: true,
  opl_can_rebuild_sidecar_index: true,
  sqlite_can_be_truth_source: false,
};

const OPL_STATE_INDEX_KERNEL_DOMAIN_OWNERSHIP_KINDS = new Set([
  'artifact_authority',
  'artifact_body',
  'artifact_index_truth',
  'domain_truth',
  'export_verdict',
  'file_authority',
  'memory_body',
  'owner_receipt',
  'quality_verdict',
  'review_export_verdict',
  'visual_truth',
]);

function isDomainSidecarStorageAuthority(field: string) {
  return /^sqlite_can_store_[a-z0-9_]+_(body|judgment|verdict)$/.test(field);
}

function isDomainOwnershipDeclaration(field: string, value: unknown) {
  const match = /^([a-z][a-z0-9_]*)_owns_([a-z][a-z0-9_]*)$/.exec(field);
  // Domain declarations describe domain-held truth; they cannot claim OPL substrate ownership.
  return value === true
    && !field.startsWith('opl_')
    && !field.startsWith('sqlite_')
    && match !== null
    && OPL_STATE_INDEX_KERNEL_DOMAIN_OWNERSHIP_KINDS.has(match[2]);
}

function buildOplStateIndexKernelSidecarChecks(adoption: JsonRecord, adoptionFileStatus: string) {
  const authority = isRecord(adoption.authority_boundary) ? adoption.authority_boundary : {};
  const rebuildPolicy = isRecord(adoption.rebuild_policy) ? adoption.rebuild_policy : {};
  const domainStorageAuthorityEntries = Object.entries(authority).filter(([field]) =>
    isDomainSidecarStorageAuthority(field),
  );
  const bodyStorageAuthorityEntries = domainStorageAuthorityEntries.filter(([flag]) => flag.endsWith('_body'));
  const verdictStorageAuthorityEntries = domainStorageAuthorityEntries.filter(([flag]) =>
    flag.endsWith('_judgment') || flag.endsWith('_verdict'),
  );
  const unsupportedAuthorityFields = Object.keys(authority).filter((field) =>
    !Object.hasOwn(OPL_STATE_INDEX_KERNEL_SIDECAR_REQUIRED_AUTHORITY, field)
      && !isDomainSidecarStorageAuthority(field)
      && !isDomainOwnershipDeclaration(field, authority[field]),
  );
  const blockers = [
    adoptionFileStatus === 'resolved' ? null : `state_index_kernel_sidecar_adoption_${adoptionFileStatus}`,
    optionalString(adoption.surface_kind) === 'opl_state_index_kernel_sidecar_adoption'
      ? null
      : 'state_index_kernel_sidecar_surface_kind_invalid',
    optionalString(adoption.version) === OPL_STATE_INDEX_KERNEL_SIDECAR_VERSION
      ? null
      : 'state_index_kernel_sidecar_version_invalid',
    optionalString(adoption.owner) === 'one-person-lab'
      ? null
      : 'state_index_kernel_sidecar_owner_must_be_opl',
    optionalString(adoption.sidecar_owner) === 'one-person-lab'
      ? null
      : 'state_index_kernel_sidecar_owner_must_be_opl',
    optionalString(adoption.consumer) && optionalString(adoption.consumer) !== 'one-person-lab'
      ? null
      : 'state_index_kernel_sidecar_consumer_invalid',
    optionalString(adoption.adoption_status) === 'deferred_until_measured_trigger'
      ? null
      : 'state_index_kernel_sidecar_deferred_state_invalid',
    adoption.sqlite_enabled_now === false
      ? null
      : 'state_index_kernel_sidecar_sqlite_must_be_disabled',
    optionalString(adoption.index_backend) === 'sqlite_sidecar_index'
      ? null
      : 'state_index_kernel_sidecar_backend_invalid',
    adoption.sidecar_is_domain_runtime === false
      ? null
      : 'state_index_kernel_sidecar_must_not_be_domain_runtime',
    rebuildPolicy.rebuildable === true
      ? null
      : 'state_index_kernel_sidecar_must_be_rebuildable',
    rebuildPolicy.delete_safe === true
      ? null
      : 'state_index_kernel_sidecar_delete_safety_missing',
    authority.opl_owns_state_index_kernel === OPL_STATE_INDEX_KERNEL_SIDECAR_REQUIRED_AUTHORITY.opl_owns_state_index_kernel
      ? null
      : 'state_index_kernel_sidecar_opl_owner_missing',
    authority.opl_can_store_refs_hashes_provenance
      === OPL_STATE_INDEX_KERNEL_SIDECAR_REQUIRED_AUTHORITY.opl_can_store_refs_hashes_provenance
      ? null
      : 'state_index_kernel_sidecar_refs_only_policy_missing',
    authority.opl_can_rebuild_sidecar_index
      === OPL_STATE_INDEX_KERNEL_SIDECAR_REQUIRED_AUTHORITY.opl_can_rebuild_sidecar_index
      ? null
      : 'state_index_kernel_sidecar_opl_rebuild_authority_missing',
    authority.sqlite_can_be_truth_source
      === OPL_STATE_INDEX_KERNEL_SIDECAR_REQUIRED_AUTHORITY.sqlite_can_be_truth_source
      ? null
      : 'state_index_kernel_sidecar_truth_authority_must_be_false',
    bodyStorageAuthorityEntries.length > 0 && bodyStorageAuthorityEntries.every(([, value]) => value === false)
      ? null
      : 'state_index_kernel_sidecar_artifact_body_authority_must_be_false',
    verdictStorageAuthorityEntries.length > 0 && verdictStorageAuthorityEntries.every(([, value]) => value === false)
      ? null
      : 'state_index_kernel_sidecar_verdict_authority_must_be_false',
    ...unsupportedAuthorityFields.map(
      (field) => `state_index_kernel_sidecar_authority_field_unsupported:${field}`,
    ),
  ].filter((entry): entry is string => Boolean(entry));
  return {
    status: blockers.length === 0 ? 'passed' : 'blocked',
    policy_status: blockers.length === 0 ? 'declared' : 'blocked',
    policy_source: 'contracts/stage_artifact_kernel_adoption.json#/opl_state_index_kernel_adoption',
    kernel_contract_ref: 'contracts/opl-framework/state-index-kernel-contract.json',
    sqlite_role: 'rebuildable_refs_only_sidecar_index',
    physical_truth_role: null,
    required_index_databases: [],
    required_ref_fields: [],
    domain_ref_sources: [],
    compaction_policy: {},
    maintenance_policy: {},
    authority_boundary: authority,
    sidecar: {
      owner: optionalString(adoption.owner),
      consumer: optionalString(adoption.consumer),
      adoption_status: optionalString(adoption.adoption_status),
      sqlite_enabled_now: adoption.sqlite_enabled_now ?? null,
      sidecar_owner: optionalString(adoption.sidecar_owner),
      sidecar_is_domain_runtime: adoption.sidecar_is_domain_runtime ?? null,
      rebuildable: rebuildPolicy.rebuildable ?? null,
      delete_safe: rebuildPolicy.delete_safe ?? null,
    },
    blockers,
  };
}

function stateIndexKernelAdoptionBlockers(input: {
  adoption: JsonRecord | null;
  adoptionFileStatus: string;
  authority: JsonRecord;
  compactionPolicy: JsonRecord;
  domainRefSources: string[];
  maintenancePolicy: JsonRecord;
  requiredDatabases: string[];
  requiredFields: string[];
}) {
  return [
    ...stateIndexIdentityBlockers(input.adoption, input.adoptionFileStatus),
    ...missingStateIndexDatabaseBlockers(input.requiredDatabases),
    ...missingStateIndexFieldBlockers(input.requiredFields),
    input.domainRefSources.length > 0 ? null : 'state_index_kernel_domain_ref_sources_missing',
    ...stateIndexCompactionPolicyBlockers(input.compactionPolicy),
    ...stateIndexMaintenancePolicyBlockers(input.maintenancePolicy),
    ...stateIndexAuthorityBoundaryBlockers(input.authority),
  ].filter((entry): entry is string => Boolean(entry));
}

function stateIndexIdentityBlockers(adoption: JsonRecord | null, adoptionFileStatus: string) {
  return [
    adoptionFileStatus === 'resolved' ? null : `state_index_kernel_adoption_${adoptionFileStatus}`,
    adoption ? null : 'state_index_kernel_adoption_not_declared',
    optionalString(adoption?.surface_kind) === 'opl_state_index_kernel_adoption'
      ? null
      : 'state_index_kernel_adoption_surface_kind_invalid',
    optionalString(adoption?.kernel_contract_ref) === 'contracts/opl-framework/state-index-kernel-contract.json'
      ? null
      : 'state_index_kernel_contract_ref_invalid',
    optionalString(adoption?.sqlite_role) === 'rebuildable_refs_only_sidecar_index'
      ? null
      : 'state_index_kernel_sqlite_role_invalid',
    optionalString(adoption?.physical_truth_role) === 'stage_folder_manifest_receipt_artifact_body_file_truth'
      ? null
      : 'state_index_kernel_physical_truth_role_invalid',
  ];
}

function missingStateIndexDatabaseBlockers(requiredDatabases: string[]) {
  return REQUIRED_STATE_INDEX_DATABASES
    .filter((database) => !requiredDatabases.includes(database))
    .map((database) => `state_index_kernel_database_missing:${database}`);
}

function missingStateIndexFieldBlockers(requiredFields: string[]) {
  return REQUIRED_STATE_INDEX_REF_FIELDS
    .filter((field) => !requiredFields.includes(field))
    .map((field) => `state_index_kernel_required_ref_field_missing:${field}`);
}

function stateIndexCompactionPolicyBlockers(compactionPolicy: JsonRecord) {
  return [
    compactionPolicy.small_file_runtime_refs_may_be_indexed === true
      ? null
      : 'state_index_kernel_small_file_compaction_policy_missing',
    compactionPolicy.large_payload_strategy === 'store_preview_hash_and_refs_never_body'
      ? null
      : 'state_index_kernel_large_payload_strategy_invalid',
    compactionPolicy.index_rebuild_source === 'physical_stage_folder_manifest_receipt_refs'
      ? null
      : 'state_index_kernel_rebuild_source_invalid',
    compactionPolicy.app_reads_projection_not_sqlite_directly === true
      ? null
      : 'state_index_kernel_app_projection_boundary_missing',
  ];
}

function stateIndexMaintenancePolicyBlockers(maintenancePolicy: JsonRecord) {
  return [
    maintenancePolicy.journal_mode === 'WAL'
      ? null
      : 'state_index_kernel_journal_mode_must_be_wal',
    maintenancePolicy.busy_timeout_ms === 5000
      ? null
      : 'state_index_kernel_busy_timeout_invalid',
    maintenancePolicy.checkpoint_required === true
      ? null
      : 'state_index_kernel_checkpoint_policy_missing',
    maintenancePolicy.backup_required === true
      ? null
      : 'state_index_kernel_backup_policy_missing',
    maintenancePolicy.integrity_check_required === true
      ? null
      : 'state_index_kernel_integrity_policy_missing',
    maintenancePolicy.optimize_required === true
      ? null
      : 'state_index_kernel_optimize_policy_missing',
    maintenancePolicy.network_filesystem_multi_writer_supported === false
      ? null
      : 'state_index_kernel_network_multi_writer_must_be_false',
  ];
}

function stateIndexAuthorityBoundaryBlockers(authority: JsonRecord) {
  return REQUIRED_STATE_INDEX_AUTHORITY_FLAGS
    .filter((flag) => authority[flag] !== false)
    .map((flag) => `state_index_kernel_authority_flag_must_be_false:${flag}`);
}
