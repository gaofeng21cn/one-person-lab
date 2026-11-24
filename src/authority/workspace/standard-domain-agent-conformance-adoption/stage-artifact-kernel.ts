import {
  isRecord,
  optionalString,
  readJsonFile,
  stringList,
} from '../../packages/index.ts';
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
