import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError } from './contracts.ts';
import { buildAgentPlatformSurfaceOwnershipForRepo } from './agent-platform-surface-ownership.ts';
import { buildGeneratedAgentInterfaces } from './domain-pack-compiler.ts';
import {
  defaultFamilyRepoInputs,
  DEFAULT_FAMILY_REPOS,
} from './standard-domain-agent-family-repos.ts';
import { buildEvidenceTailClassification } from './standard-domain-agent-conformance-evidence-tail.ts';
import { buildPhysicalMorphologyChecks } from './standard-domain-agent-conformance-physical-morphology.ts';
import { validateStandardDomainAgentScaffold } from './standard-domain-agent-scaffold.ts';
import {
  collectFieldValues,
  isRecord,
  optionalString,
  readJsonFile,
  stringList,
  unique,
  type JsonRecord,
} from './standard-domain-agent-conformance-utils.ts';
import type { FrameworkContracts } from './types.ts';

interface RepoInput {
  requested_agent_id: string | null;
  repo_dir: string;
}

function readDomainId(repoDir: string, fallback: string | null) {
  const descriptor = readJsonFile(repoDir, 'contracts/domain_descriptor.json').payload;
  if (!isRecord(descriptor)) {
    return fallback ?? path.basename(repoDir);
  }
  return optionalString(descriptor.domain_id)
    ?? optionalString(descriptor.domain_label)
    ?? fallback
    ?? path.basename(repoDir);
}

function directLegacyPackRootFields(packCompilerInput: unknown) {
  if (!isRecord(packCompilerInput)) {
    return [];
  }
  return [
    'canonical_repo_source_semantic_pack_root',
    'domain_pack_root',
    'canonical_repo_source_semantic_pack',
  ].filter((field) => packCompilerInput[field] !== undefined && packCompilerInput[field] !== null);
}

function requiredPackPaths(packCompilerInput: unknown) {
  if (!isRecord(packCompilerInput)) {
    return [];
  }
  const sourceRefs = isRecord(packCompilerInput.source_refs) ? packCompilerInput.source_refs : {};
  return unique([
    ...stringList(packCompilerInput.required_domain_pack_paths),
    ...stringList(sourceRefs.required_domain_pack_paths),
  ]);
}

function parseConformanceArgs(args: string[]): RepoInput[] {
  const repos: RepoInput[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--repo-dir' && args[index + 1]) {
      repos.push({
        requested_agent_id: null,
        repo_dir: args[index + 1],
      });
      index += 1;
      continue;
    }
    if (token === '--agent' && args[index + 1]) {
      const value = args[index + 1];
      const separator = value.indexOf('=');
      if (separator <= 0 || separator === value.length - 1) {
        throw new FrameworkContractError('cli_usage_error', 'agents conformance --agent expects <agent_id>=<repo_dir>.', {
          usage: 'opl agents conformance [--repo-dir <path> ...] [--agent <id>=<path> ...]',
        });
      }
      repos.push({
        requested_agent_id: value.slice(0, separator),
        repo_dir: value.slice(separator + 1),
      });
      index += 1;
      continue;
    }
    if (token === '--family-defaults') {
      continue;
    }
    throw new FrameworkContractError('cli_usage_error', `Unknown agents conformance option: ${token}.`, {
      usage: 'opl agents conformance [--repo-dir <path> ...] [--agent <id>=<path> ...]',
    });
  }

  const selected = repos.length > 0 ? repos : defaultFamilyRepoInputs();
  if (selected.length === 0) {
    throw new FrameworkContractError('cli_usage_error', 'agents conformance could not discover family agent repos.', {
      usage: 'opl agents conformance [--repo-dir <path> ...] [--agent <id>=<path> ...]',
      default_repo_directories: DEFAULT_FAMILY_REPOS.map((repo) => repo.directory),
      env_override: 'OPL_FAMILY_WORKSPACE_ROOT',
    });
  }
  return selected.map((repo) => ({
    requested_agent_id: repo.requested_agent_id,
    repo_dir: path.resolve(repo.repo_dir),
  }));
}

function buildGeneratedInterfaceCheck(repoDir: string) {
  try {
    const result = buildGeneratedAgentInterfaces({} as FrameworkContracts, ['--repo-dir', repoDir]);
    const bundle = result.generated_agent_interfaces;
    const wrapperBundle = isRecord(bundle.generated_wrapper_bundle) ? bundle.generated_wrapper_bundle : null;
    const targetProof = isRecord(bundle.active_caller_target_proof) ? bundle.active_caller_target_proof : null;
    const cutoverProof = isRecord(bundle.active_caller_cutover_proof) ? bundle.active_caller_cutover_proof : null;
    const blockers = [
      optionalString(bundle.status) === 'ready'
        ? null
        : `generated_interfaces_status_not_ready:${optionalString(bundle.status) ?? 'missing'}`,
      optionalString(bundle.owner) === 'one-person-lab'
        ? null
        : `generated_interfaces_owner_not_opl:${optionalString(bundle.owner) ?? 'missing'}`,
      bundle.domain_repo_can_own_generated_surface === false
        ? null
        : 'generated_interfaces_domain_repo_can_own_generated_surface_must_be_false',
      optionalString(wrapperBundle?.status) === 'ready'
        ? null
        : `generated_wrapper_bundle_status_not_ready:${optionalString(wrapperBundle?.status) ?? 'missing'}`,
      optionalString(targetProof?.status) === 'ready'
        ? null
        : `active_caller_target_proof_status_not_ready:${optionalString(targetProof?.status) ?? 'missing'}`,
      optionalString(cutoverProof?.status) === 'cutover_to_opl_generated_or_domain_handler_targets'
        ? null
        : `active_caller_cutover_proof_status_not_ready:${optionalString(cutoverProof?.status) ?? 'missing'}`,
    ].filter((entry): entry is string => Boolean(entry));
    return {
      status: blockers.length === 0 ? 'passed' : 'blocked',
      generated_interfaces_status: optionalString(bundle.status),
      generated_surface_owner: optionalString(bundle.generated_surface_owner),
      domain_repo_can_own_generated_surface: bundle.domain_repo_can_own_generated_surface,
      generated_wrapper_bundle_status: optionalString(wrapperBundle?.status),
      active_caller_target_proof_status: optionalString(targetProof?.status),
      active_caller_cutover_proof_status: optionalString(cutoverProof?.status),
      claims_live_soak_complete: cutoverProof?.claims_live_soak_complete === true,
      claims_domain_ready: cutoverProof?.claims_domain_ready === true,
      blocker_reasons: Array.isArray(bundle.blocker_reasons)
        ? bundle.blocker_reasons.filter((entry): entry is string => typeof entry === 'string')
        : [],
      blockers,
    };
  } catch (error) {
    const code = error instanceof FrameworkContractError ? error.code : 'generated_interfaces_error';
    return {
      status: 'blocked',
      generated_interfaces_status: 'error',
      generated_surface_owner: null,
      domain_repo_can_own_generated_surface: null,
      generated_wrapper_bundle_status: null,
      active_caller_target_proof_status: null,
      active_caller_cutover_proof_status: null,
      claims_live_soak_complete: false,
      claims_domain_ready: false,
      blocker_reasons: [],
      blockers: [`generated_interfaces_error:${code}`],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function buildPackCompilerChecks(repoDir: string) {
  const packCompilerInput = readJsonFile(repoDir, 'contracts/pack_compiler_input.json');
  const payload = packCompilerInput.payload;
  const canonicalPackRoot = isRecord(payload) ? optionalString(payload.canonical_semantic_pack_root) : null;
  const listedPaths = requiredPackPaths(payload);
  const readmeRequiredPaths = listedPaths.filter((entry) => entry === 'README.md' || entry.endsWith('/README.md'));
  const legacyFields = directLegacyPackRootFields(payload);
  const blockers = [
    packCompilerInput.status === 'resolved' ? null : `pack_compiler_input_${packCompilerInput.status}`,
    canonicalPackRoot === 'agent/' ? null : 'pack_compiler_canonical_semantic_pack_root_must_be_agent_slash',
    ...legacyFields.map((field) => `pack_compiler_legacy_pack_root_field:${field}`),
    ...readmeRequiredPaths.map((entry) => `required_domain_pack_path_must_not_be_readme:${entry}`),
    isRecord(payload) && payload.generated_surface_owner === 'one-person-lab'
      ? null
      : 'pack_compiler_generated_surface_owner_must_be_opl',
    isRecord(payload) && payload.domain_repo_can_own_generated_surface === false
      ? null
      : 'pack_compiler_domain_repo_generated_surface_owner_must_be_false',
  ].filter((entry): entry is string => Boolean(entry));
  return {
    status: blockers.length === 0 ? 'passed' : 'blocked',
    contract_status: packCompilerInput.status,
    canonical_semantic_pack_root: canonicalPackRoot,
    legacy_pack_root_fields: legacyFields,
    required_domain_pack_paths: listedPaths,
    readme_required_paths: readmeRequiredPaths,
    generated_surface_owner: isRecord(payload) ? optionalString(payload.generated_surface_owner) : null,
    domain_repo_can_own_generated_surface: isRecord(payload) ? payload.domain_repo_can_own_generated_surface : null,
    blockers,
  };
}

function buildGeneratedSurfaceHandoffChecks(repoDir: string) {
  const generatedSurfaceHandoff = readJsonFile(repoDir, 'contracts/generated_surface_handoff.json');
  const payload = generatedSurfaceHandoff.payload;
  const blockers = [
    generatedSurfaceHandoff.status === 'resolved' ? null : `generated_surface_handoff_${generatedSurfaceHandoff.status}`,
    isRecord(payload) && payload.generated_surface_owner === 'one-person-lab'
      ? null
      : 'generated_surface_handoff_owner_must_be_opl',
    isRecord(payload) && payload.domain_repo_can_own_generated_surface === false
      ? null
      : 'generated_surface_handoff_domain_owner_must_be_false',
  ].filter((entry): entry is string => Boolean(entry));
  return {
    status: blockers.length === 0 ? 'passed' : 'blocked',
    contract_status: generatedSurfaceHandoff.status,
    generated_surface_owner: isRecord(payload) ? optionalString(payload.generated_surface_owner) : null,
    domain_repo_can_own_generated_surface: isRecord(payload) ? payload.domain_repo_can_own_generated_surface : null,
    blockers,
  };
}

function buildPrivateSurfaceChecks(repoDir: string) {
  const functionalAudit = readJsonFile(repoDir, 'contracts/functional_privatization_audit.json');
  const payload = functionalAudit.payload;
  const authority = isRecord(payload) && isRecord(payload.authority_boundary) ? payload.authority_boundary : null;
  const activePathScanStates = collectFieldValues(payload, 'active_path_scan_state')
    .map((entry) => ({
      path: entry.path,
      state: optionalString(entry.value) ?? String(entry.value),
    }));
  const unavailableScans = activePathScanStates.filter((entry) => entry.state === 'not_available');
  const blockers = [
    functionalAudit.status === 'resolved' ? null : `functional_privatization_audit_${functionalAudit.status}`,
    authority?.domain_can_claim_generic_runtime_owner === false
      ? null
      : 'functional_audit_domain_can_claim_generic_runtime_owner_must_be_false',
    authority?.domain_repo_can_own_generated_surface === true
      ? 'functional_audit_domain_repo_can_own_generated_surface_must_not_be_true'
      : null,
    ...unavailableScans.map((entry) => `active_path_scan_state_not_available:${entry.path}`),
  ].filter((entry): entry is string => Boolean(entry));
  return {
    status: blockers.length === 0 ? 'passed' : 'blocked',
    contract_status: functionalAudit.status,
    domain_can_claim_generic_runtime_owner: authority?.domain_can_claim_generic_runtime_owner ?? null,
    domain_repo_can_own_generated_surface: authority?.domain_repo_can_own_generated_surface ?? null,
    active_path_scan_states: activePathScanStates,
    blockers,
  };
}

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

function buildWorkspaceFileLifecycleChecks(repoDir: string) {
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

function buildStageArtifactKernelAdoptionChecks(repoDir: string) {
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

function buildStateIndexKernelAdoptionChecks(repoDir: string) {
  const adoptionFile = readJsonFile(repoDir, 'contracts/state_index_kernel_adoption.json');
  const adoption = isRecord(adoptionFile.payload) ? adoptionFile.payload : null;
  const authority = isRecord(adoption?.authority_boundary) ? adoption.authority_boundary : {};
  const compactionPolicy = isRecord(adoption?.compaction_policy) ? adoption.compaction_policy : {};
  const maintenancePolicy = isRecord(adoption?.maintenance_policy) ? adoption.maintenance_policy : {};
  const requiredDatabases = stringList(adoption?.required_index_databases);
  const requiredFields = stringList(adoption?.required_ref_fields);
  const domainRefSources = stringList(adoption?.domain_ref_sources);
  const blockers = [
    adoptionFile.status === 'resolved' ? null : `state_index_kernel_adoption_${adoptionFile.status}`,
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
    ...REQUIRED_STATE_INDEX_DATABASES
      .filter((database) => !requiredDatabases.includes(database))
      .map((database) => `state_index_kernel_database_missing:${database}`),
    ...REQUIRED_STATE_INDEX_REF_FIELDS
      .filter((field) => !requiredFields.includes(field))
      .map((field) => `state_index_kernel_required_ref_field_missing:${field}`),
    domainRefSources.length > 0 ? null : 'state_index_kernel_domain_ref_sources_missing',
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
    ...REQUIRED_STATE_INDEX_AUTHORITY_FLAGS
      .filter((flag) => authority[flag] !== false)
      .map((flag) => `state_index_kernel_authority_flag_must_be_false:${flag}`),
  ].filter((entry): entry is string => Boolean(entry));
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

function buildRepoConformance(input: RepoInput) {
  const repoDir = path.resolve(input.repo_dir);
  const domainId = readDomainId(repoDir, input.requested_agent_id);
  const scaffoldValidation = validateStandardDomainAgentScaffold({ repoDir }).standard_domain_agent_scaffold_validation;
  const packCompilerChecks = buildPackCompilerChecks(repoDir);
  const generatedSurfaceHandoffChecks = buildGeneratedSurfaceHandoffChecks(repoDir);
  const privateSurfaceChecks = buildPrivateSurfaceChecks(repoDir);
  const generatedInterfaceChecks = buildGeneratedInterfaceCheck(repoDir);
  const platformSurfaceOwnershipChecks = buildAgentPlatformSurfaceOwnershipForRepo(repoDir, input.requested_agent_id);
  const physicalMorphologyChecks = buildPhysicalMorphologyChecks(repoDir, domainId);
  const workspaceFileLifecycleChecks = buildWorkspaceFileLifecycleChecks(repoDir);
  const stageArtifactKernelAdoptionChecks = buildStageArtifactKernelAdoptionChecks(repoDir);
  const stateIndexKernelAdoptionChecks = buildStateIndexKernelAdoptionChecks(repoDir);
  const evidenceTailClassification = buildEvidenceTailClassification(repoDir, domainId, generatedInterfaceChecks);
  const blockers = unique([
    ...scaffoldValidation.blockers,
    ...packCompilerChecks.blockers,
    ...generatedSurfaceHandoffChecks.blockers,
    ...privateSurfaceChecks.blockers,
    ...generatedInterfaceChecks.blockers,
    ...platformSurfaceOwnershipChecks.blockers,
    ...physicalMorphologyChecks.blockers,
    ...workspaceFileLifecycleChecks.blockers,
    ...stageArtifactKernelAdoptionChecks.blockers,
    ...stateIndexKernelAdoptionChecks.blockers,
  ]);

  return {
    repo_dir: repoDir,
    requested_agent_id: input.requested_agent_id,
    domain_id: domainId,
    status: blockers.length === 0 ? 'passed' : 'blocked',
    blockers,
    scaffold_validation: {
      status: scaffoldValidation.status, blockers: scaffoldValidation.blockers,
      agent_pack_validation: scaffoldValidation.agent_pack_validation,
      stage_ref_validation: scaffoldValidation.stage_ref_validation,
      stage_pack_v2_validation: scaffoldValidation.stage_pack_v2_validation,
    },
    pack_compiler_checks: packCompilerChecks,
    generated_surface_handoff_checks: generatedSurfaceHandoffChecks,
    private_surface_checks: privateSurfaceChecks,
    generated_interface_checks: generatedInterfaceChecks,
    platform_surface_ownership_checks: platformSurfaceOwnershipChecks,
    physical_morphology_checks: physicalMorphologyChecks,
    workspace_file_lifecycle_checks: workspaceFileLifecycleChecks,
    stage_artifact_kernel_adoption_checks: stageArtifactKernelAdoptionChecks,
    state_index_kernel_adoption_checks: stateIndexKernelAdoptionChecks,
    evidence_tail_classification: evidenceTailClassification,
  };
}

export function buildStandardDomainAgentConformanceReport(args: string[]) {
  const repos = parseConformanceArgs(args);
  const reports = repos.map(buildRepoConformance);
  const passedCount = reports.filter((report) => report.status === 'passed').length;
  const blockedCount = reports.length - passedCount;
  const productionEvidenceTailCount = reports.reduce(
    (total, report) => total + report.evidence_tail_classification.tail_items.length,
    0,
  );
  return {
    version: 'g2',
    standard_domain_agent_conformance: {
      surface_kind: 'opl_standard_domain_agent_conformance_report',
      owner: 'one-person-lab',
      status: blockedCount === 0 ? 'passed' : 'blocked',
      summary: {
        total_repo_count: reports.length,
        passed_count: passedCount,
        blocked_count: blockedCount,
        structural_conformance_status: blockedCount === 0 ? 'passed' : 'blocked',
        production_evidence_tail_count: productionEvidenceTailCount,
        production_evidence_tail_policy: 'reported_separately_not_a_structural_pass_condition',
      },
      reports,
      authority_boundary: {
        opl_can_write_domain_truth: false,
        opl_can_write_memory_body: false,
        opl_can_authorize_quality_or_export: false,
        conformance_report_can_claim_domain_ready: false,
      },
    },
  };
}
