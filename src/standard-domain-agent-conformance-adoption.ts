import {
  isRecord,
  optionalString,
  readJsonFile,
  stringList,
  type JsonRecord,
} from './standard-domain-agent-conformance-utils.ts';

const REQUIRED_WORKSPACE_LIFECYCLE_ROOTS = [
  'agent/',
  'contracts/',
  'runtime/authority_functions/',
  'docs/',
  'src/ or packages/',
];

const REQUIRED_WORKSPACE_LOCATOR_REFS = [
  'workspace_root_ref',
  'runtime_artifact_root_ref',
  'artifact_locator_ref',
  'restore_or_retention_receipt_ref',
];

const REQUIRED_STAGE_ARTIFACT_ADOPTION_FIELDS = [
  'stage_folder_contract_ref',
  'stage_json_ref',
  'attempt_json_ref',
  'manifest_ref',
  'receipt_ref',
  'current_pointer_ref',
  'canonical_artifact_ref',
  'export_ref',
  'lineage_ref',
  'retention_ref',
];

const REQUIRED_STAGE_ARTIFACT_ADOPTION_AUTHORITY_FLAGS = [
  'opl_can_create_domain_owner_receipt',
  'opl_can_write_domain_truth',
  'opl_can_write_memory_body',
  'opl_can_mutate_domain_artifact_body',
  'opl_can_authorize_quality_or_export',
];

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

export function buildWorkspaceFileLifecycleChecks(repoDir: string) {
  const policyFile = readJsonFile(repoDir, 'contracts/workspace_lifecycle_policy.json');
  const policy = isRecord(policyFile.payload) ? policyFile.payload : null;
  const repoSourceBoundaries = isRecord(policy?.repo_source_boundaries)
    ? policy.repo_source_boundaries
    : null;
  const workspaceRoots = isRecord(policy?.workspace_runtime_artifact_roots)
    ? policy.workspace_runtime_artifact_roots
    : null;
  const byproductPolicy = isRecord(policy?.byproduct_policy) ? policy.byproduct_policy : null;
  const lifecycleSplit = isRecord(policy?.lifecycle_authority_split) ? policy.lifecycle_authority_split : null;
  const authority = isRecord(policy?.authority_boundary) ? policy.authority_boundary : {};
  const requiredRoots = stringList(repoSourceBoundaries?.required_roots);
  const requiredLocatorRefs = stringList(workspaceRoots?.required_locator_refs);
  const blockers = [
    policyFile.status === 'resolved' ? null : `workspace_file_lifecycle_policy_${policyFile.status}`,
    policy ? null : 'workspace_file_lifecycle_policy_not_declared',
    optionalString(policy?.surface_kind) === 'opl_domain_workspace_file_lifecycle_policy'
      ? null
      : 'workspace_file_lifecycle_policy_surface_kind_invalid',
    ...REQUIRED_WORKSPACE_LIFECYCLE_ROOTS
      .filter((root) => !requiredRoots.includes(root))
      .map((root) => `workspace_file_lifecycle_required_root_missing:${root}`),
    repoSourceBoundaries?.runtime_artifacts_live_in_source_repo === false
      ? null
      : 'workspace_file_lifecycle_runtime_artifacts_must_not_live_in_source_repo',
    repoSourceBoundaries?.developer_checkout_may_define_app_runtime_without_explicit_override === false
      ? null
      : 'workspace_file_lifecycle_developer_checkout_override_must_be_explicit',
    workspaceRoots?.externalized === true
      ? null
      : 'workspace_file_lifecycle_roots_must_be_externalized',
    optionalString(workspaceRoots?.repo_source_policy) === 'locator_index_schema_receipt_refs_only'
      ? null
      : 'workspace_file_lifecycle_repo_source_policy_must_be_refs_only',
    ...REQUIRED_WORKSPACE_LOCATOR_REFS
      .filter((ref) => !requiredLocatorRefs.includes(ref))
      .map((ref) => `workspace_file_lifecycle_required_locator_ref_missing:${ref}`),
    byproductPolicy?.caches_and_install_artifacts_externalized === true
      ? null
      : 'workspace_file_lifecycle_byproducts_must_be_externalized',
    byproductPolicy?.ignored_only_is_fallback_not_authority === true
      ? null
      : 'workspace_file_lifecycle_ignore_is_not_authority_missing',
    stringList(lifecycleSplit?.opl_owned_primitives).includes('workspace_lifecycle')
      ? null
      : 'workspace_file_lifecycle_opl_workspace_lifecycle_owner_missing',
    stringList(lifecycleSplit?.domain_owned_authority).includes('owner_receipt')
      ? null
      : 'workspace_file_lifecycle_domain_owner_receipt_authority_missing',
    authority.policy_can_claim_domain_ready_or_artifact_authority === false
      ? null
      : 'workspace_file_lifecycle_policy_must_not_claim_domain_ready',
    authority.opl_can_write_domain_truth === false
      ? null
      : 'workspace_file_lifecycle_opl_can_write_domain_truth_must_be_false',
    authority.opl_can_write_memory_body === false
      ? null
      : 'workspace_file_lifecycle_opl_can_write_memory_body_must_be_false',
    authority.opl_can_mutate_domain_artifact_body === false
      ? null
      : 'workspace_file_lifecycle_opl_can_mutate_domain_artifact_body_must_be_false',
    authority.opl_can_authorize_quality_or_export === false
      ? null
      : 'workspace_file_lifecycle_opl_can_authorize_quality_or_export_must_be_false',
  ].filter((entry): entry is string => Boolean(entry));
  return {
    status: blockers.length === 0 ? 'passed' : 'blocked',
    policy_status: blockers.length === 0 ? 'declared' : 'blocked',
    policy_source: 'contracts/workspace_lifecycle_policy.json',
    repo_source_boundaries: {
      required_roots: requiredRoots,
      runtime_artifacts_live_in_source_repo:
        repoSourceBoundaries?.runtime_artifacts_live_in_source_repo ?? null,
      developer_checkout_may_define_app_runtime_without_explicit_override:
        repoSourceBoundaries?.developer_checkout_may_define_app_runtime_without_explicit_override ?? null,
    },
    workspace_runtime_artifact_roots: {
      externalized: workspaceRoots?.externalized ?? null,
      repo_source_policy: optionalString(workspaceRoots?.repo_source_policy),
      required_locator_refs: requiredLocatorRefs,
    },
    byproduct_policy: {
      caches_and_install_artifacts_externalized:
        byproductPolicy?.caches_and_install_artifacts_externalized ?? null,
      ignored_only_is_fallback_not_authority:
        byproductPolicy?.ignored_only_is_fallback_not_authority ?? null,
    },
    lifecycle_authority_split: {
      opl_owned_primitives: stringList(lifecycleSplit?.opl_owned_primitives),
      domain_owned_authority: stringList(lifecycleSplit?.domain_owned_authority),
    },
    authority_boundary: {
      policy_can_claim_domain_ready_or_artifact_authority:
        authority.policy_can_claim_domain_ready_or_artifact_authority ?? null,
      opl_can_write_domain_truth: authority.opl_can_write_domain_truth ?? null,
      opl_can_write_memory_body: authority.opl_can_write_memory_body ?? null,
      opl_can_mutate_domain_artifact_body: authority.opl_can_mutate_domain_artifact_body ?? null,
      opl_can_authorize_quality_or_export: authority.opl_can_authorize_quality_or_export ?? null,
    },
    blockers,
  };
}

export function buildStageArtifactKernelAdoptionChecks(repoDir: string) {
  const adoptionFile = readJsonFile(repoDir, 'contracts/stage_artifact_kernel_adoption.json');
  const adoption = isRecord(adoptionFile.payload) ? adoptionFile.payload : null;
  const authority = isRecord(adoption?.authority_boundary) ? adoption.authority_boundary : {};
  const kernelRefs = isRecord(adoption?.kernel_refs) ? adoption.kernel_refs : {};
  const domainPackBinding = isRecord(adoption?.domain_pack_binding) ? adoption.domain_pack_binding : {};
  const projectionBoundary = isRecord(adoption?.projection_boundary) ? adoption.projection_boundary : {};
  const terminalStates = stringList(adoption?.terminal_states);
  const stageFolderUnit = stringList(adoption?.stage_folder_unit);
  const requiredFields = stringList(adoption?.required_ref_fields);
  const acceptedSourceRefs = stringList(domainPackBinding.accepted_source_refs);
  const derivedProjectionRefs = stringList(projectionBoundary.derived_projection_refs);
  const blockers = [
    adoptionFile.status === 'resolved' ? null : `stage_artifact_kernel_adoption_${adoptionFile.status}`,
    adoption ? null : 'stage_artifact_kernel_adoption_not_declared',
    optionalString(adoption?.surface_kind) === 'opl_stage_artifact_kernel_adoption'
      ? null
      : 'stage_artifact_kernel_adoption_surface_kind_invalid',
    optionalString(adoption?.kernel_contract_ref) === 'contracts/opl-framework/stage-artifact-runtime-contract.json'
      ? null
      : 'stage_artifact_kernel_contract_ref_invalid',
    kernelRefs.physical_stage_folder_source_of_truth === true
      ? null
      : 'stage_artifact_kernel_physical_folder_truth_missing',
    kernelRefs.derived_index_rebuildable === true
      ? null
      : 'stage_artifact_kernel_derived_index_rebuildable_missing',
    kernelRefs.manifest_receipt_hash_required === true
      ? null
      : 'stage_artifact_kernel_manifest_receipt_hash_required_missing',
    ...REQUIRED_STAGE_ARTIFACT_ADOPTION_FIELDS
      .filter((field) => !requiredFields.includes(field))
      .map((field) => `stage_artifact_kernel_required_ref_field_missing:${field}`),
    ...['Stage Folder', 'Manifest', 'Receipt', 'current pointer']
      .filter((unit) => !stageFolderUnit.includes(unit))
      .map((unit) => `stage_artifact_kernel_unit_missing:${unit}`),
    ...['success', 'blocked', 'skipped', 'deferred']
      .filter((state) => !terminalStates.includes(state))
      .map((state) => `stage_artifact_kernel_terminal_state_missing:${state}`),
    acceptedSourceRefs.length > 0 ? null : 'stage_artifact_kernel_domain_source_refs_missing',
    derivedProjectionRefs.length > 0 ? null : 'stage_artifact_kernel_derived_projection_refs_missing',
    projectionBoundary.file_presence_only_counts_as === 'orphan_or_historical'
      ? null
      : 'stage_artifact_kernel_file_presence_policy_invalid',
    projectionBoundary.provider_completion_counts_as_progress === false
      ? null
      : 'stage_artifact_kernel_provider_completion_policy_invalid',
    ...REQUIRED_STAGE_ARTIFACT_ADOPTION_AUTHORITY_FLAGS
      .filter((flag) => authority[flag] !== false)
      .map((flag) => `stage_artifact_kernel_authority_flag_must_be_false:${flag}`),
  ].filter((entry): entry is string => Boolean(entry));
  return {
    status: blockers.length === 0 ? 'passed' : 'blocked',
    policy_status: blockers.length === 0 ? 'declared' : 'blocked',
    policy_source: 'contracts/stage_artifact_kernel_adoption.json',
    kernel_contract_ref: optionalString(adoption?.kernel_contract_ref),
    stage_folder_unit: stageFolderUnit,
    terminal_states: terminalStates,
    required_ref_fields: requiredFields,
    domain_pack_binding: {
      accepted_source_refs: acceptedSourceRefs,
      domain_output_roles_are_interface: domainPackBinding.domain_output_roles_are_interface ?? null,
      file_name_is_not_interface: domainPackBinding.file_name_is_not_interface ?? null,
    },
    projection_boundary: {
      derived_projection_refs: derivedProjectionRefs,
      file_presence_only_counts_as: optionalString(projectionBoundary.file_presence_only_counts_as),
      provider_completion_counts_as_progress:
        projectionBoundary.provider_completion_counts_as_progress ?? null,
    },
    authority_boundary: Object.fromEntries(
      REQUIRED_STAGE_ARTIFACT_ADOPTION_AUTHORITY_FLAGS.map((flag) => [flag, authority[flag] ?? null]),
    ),
    blockers,
  };
}

export function buildStateIndexKernelAdoptionChecks(repoDir: string) {
  const adoptionFile = readJsonFile(repoDir, 'contracts/state_index_kernel_adoption.json');
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
