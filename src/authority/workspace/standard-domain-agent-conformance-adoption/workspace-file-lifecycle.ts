import {
  isRecord,
  optionalString,
  readJsonFile,
  stringList,
} from '../../packages/index.ts';
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
