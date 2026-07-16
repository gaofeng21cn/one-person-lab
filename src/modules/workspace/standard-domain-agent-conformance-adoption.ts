import {
  isRecord,
  optionalString,
  collectFieldValues,
  readJsonFile,
  stringList,
  type JsonRecord,
} from '../pack/index.ts';

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

const REQUIRED_STAGE_RUN_NATIVE_UNITS = [
  'stage_folder',
  'stage_manifest',
  'role_artifacts',
  'progress_receipt_or_owner_answer_or_hard_stop',
];

const REQUIRED_STAGE_RUN_OBJECT_MODELS = [
  'StageRun',
  'RoleArtifactRef',
  'ProgressDeltaReceipt',
  'OwnerReceipt',
  'TypedBlocker',
  'ReadModel',
];

const REQUIRED_STAGE_RUN_STATE_FLAGS = [
  'provider_completion_counts_as_domain_accepted',
  'file_presence_counts_as_stage_complete',
  'latest_json_counts_as_domain_accepted',
  'read_model_can_select_semantic_route',
  'quality_debt_counts_as_quality_acceptance',
];

const REQUIRED_STAGE_RUN_STATE_TRUE_FLAGS = [
  'readable_artifact_counts_as_progress_input',
  'codex_can_route_to_any_declared_stage',
];

const REQUIRED_STAGE_RUN_AUTHORITY_FALSE_FLAGS = [
  'opl_can_write_domain_truth',
  'opl_can_mutate_artifact_body',
  'opl_can_sign_domain_owner_receipt',
  'opl_can_create_typed_blocker',
  'opl_can_authorize_quality_or_export',
  'provider_completion_counts_as_domain_accepted',
  'read_model_can_be_truth_source',
];

const REQUIRED_STAGE_RUN_LAUNCH_HARD_BLOCKERS = [
  'identity',
  'owner',
  'scope',
  'selected_executor',
  'authority_boundary',
  'forbidden_write',
  'currentness',
  'permission_or_credential',
  'irreversible_action',
  'explicit_human_gate',
];

const STAGE_RUN_STRATEGY_ADVISORY_REFS = [
  'prompt_refs',
  'skill_refs',
  'tool_affordance_refs',
  'knowledge_refs',
  'rubric_refs',
  'evaluation_refs',
];

const REQUIRED_STAGE_RUN_CANARY_STRATEGY_LAYERS = [
  'candidate_generation',
  'grounded_reflection',
  'comparative_selection',
  'evolution_and_revision',
  'strategy_retrospective',
  'independent_quality_gate',
];

const REQUIRED_STAGE_RUN_CANARY_ROLE_ARTIFACT_REFS = [
  'candidate_pool_ref',
  'reflection_review_ref',
  'ranking_selection_ref',
  'revision_lineage_ref',
  'strategy_retrospective_ref',
  'independent_gate_ref',
];

const REQUIRED_STAGE_RUN_CANARY_AUTHORITY_FALSE_FLAGS = [
  'controlled_canary_claims_live_domain_progress',
  'provider_completion_counts_as_closeout',
  'file_presence_counts_as_closeout',
  'read_model_counts_as_closeout',
  'conformance_pass_counts_as_closeout',
  'opl_can_write_domain_truth',
  'opl_can_mutate_artifact_body',
  'opl_can_sign_owner_receipt',
  'opl_can_create_typed_blocker',
  'opl_can_authorize_quality_or_export',
];

const FORBIDDEN_STAGE_RUN_CANARY_CLAIM_FIELDS = [
  'domain_ready',
  'domain_ready_claimed',
  'claims_domain_ready',
  'quality_ready',
  'quality_verdict',
  'quality_or_export_authorized',
  'export_ready',
  'export_verdict',
  'publication_ready',
  'artifact_ready',
  'artifact_authority',
  'production_ready',
  'live_domain_progress',
  'live_domain_progress_claimed',
  'claims_live_domain_progress',
  'closeout_claims_live_domain_progress',
];

const FORBIDDEN_STAGE_RUN_CANARY_CLAIM_STRING_VALUES = [
  'true',
  'ready',
  'accepted',
  'approved',
  'authorized',
  'complete',
  'completed',
  'passed',
  'production_ready',
  'domain_ready',
  'live_domain_progress',
];

function refString(value: unknown) {
  return optionalString(value) ?? (isRecord(value) ? optionalString(value.ref) : null);
}

function refList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return [...new Set(value.map(refString).filter((entry): entry is string => Boolean(entry)))];
  }
  if (!isRecord(value)) {
    return [];
  }
  const directRef = refString(value);
  const nestedRefs = refList(value.refs);
  return [...new Set([
    ...(directRef ? [directRef] : []),
    ...nestedRefs,
  ])];
}

function falseOrNeutralClaimValue(value: unknown) {
  if (value === false || value === null || value === undefined) {
    return true;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === ''
      || normalized === 'false'
      || normalized === '0'
      || normalized === 'pending'
      || normalized === 'domain_gate_pending'
      || normalized.startsWith('not_')
      || normalized.startsWith('no_')
      || normalized.endsWith('_pending');
  }
  return false;
}

function buildForbiddenStageRunCanaryClaimFindings(evidence: JsonRecord | null) {
  if (!evidence) {
    return [];
  }
  return FORBIDDEN_STAGE_RUN_CANARY_CLAIM_FIELDS.flatMap((field) =>
    collectFieldValues(evidence, field)
      .filter((entry) => {
        if (!falseOrNeutralClaimValue(entry.value)) {
          return true;
        }
        if (typeof entry.value !== 'string') {
          return false;
        }
        return FORBIDDEN_STAGE_RUN_CANARY_CLAIM_STRING_VALUES.includes(
          entry.value.trim().toLowerCase(),
        );
      })
      .map((entry) => ({
        path: entry.path,
        field,
        value: entry.value,
      }))
  );
}

function buildStageRunCanaryOperatorSummary(input: {
  authority: JsonRecord;
  blockers: string[];
  closeout: JsonRecord;
  currentPointerRef: string | null;
  domainId: string | null;
  evidenceScope: string | null;
  roleArtifactRefs: JsonRecord;
  stageId: string | null;
  stageManifestRef: string | null;
  stageRunRef: string | null;
  strategyTrace: JsonRecord;
  terminalOutcome: string | null;
}) {
  const cognitiveWork = REQUIRED_STAGE_RUN_CANARY_STRATEGY_LAYERS.map((layer) => ({
    layer,
    refs: refList(input.strategyTrace[layer]),
    ref_count: refList(input.strategyTrace[layer]).length,
  }));
  const roleArtifacts = REQUIRED_STAGE_RUN_CANARY_ROLE_ARTIFACT_REFS.map((field) => ({
    role: field,
    ref: refString(input.roleArtifactRefs[field]),
  }));
  const closeoutRef = refString(input.closeout.owner_receipt_ref)
    ?? refString(input.closeout.typed_blocker_ref);
  return {
    surface_kind: 'opl_stage_run_controlled_canary_operator_summary',
    owner: 'one-person-lab',
    status: input.blockers.length === 0 ? 'ready' : 'blocked',
    read_model_role: 'operator_visible_cognitive_work_refs_without_domain_progress_claim',
    domain_id: input.domainId,
    stage_id: input.stageId,
    evidence_scope: input.evidenceScope,
    stage_run_ref: input.stageRunRef,
    stage_manifest_ref: input.stageManifestRef,
    current_pointer_ref: input.currentPointerRef,
    cognitive_work: {
      strategy_layer_count: cognitiveWork.length,
      strategy_ref_count: cognitiveWork.reduce((total, layer) => total + layer.ref_count, 0),
      layers: cognitiveWork,
    },
    role_artifacts: {
      required_role_count: roleArtifacts.length,
      resolved_role_count: roleArtifacts.filter((artifact) => artifact.ref !== null).length,
      refs: roleArtifacts,
    },
    closeout_summary: {
      terminal_outcome: input.terminalOutcome,
      closeout_ref: closeoutRef,
      independent_quality_gate_ref_count:
        refList(input.strategyTrace.independent_quality_gate).length,
      same_attempt_self_review: input.closeout.same_attempt_self_review ?? null,
    },
    visible_progress_policy: {
      controlled_fixture_counts_as_live_domain_progress: false,
      conformance_pass_counts_as_domain_ready: false,
      provider_completion_counts_as_closeout:
        input.authority.provider_completion_counts_as_closeout ?? null,
      read_model_counts_as_closeout:
        input.authority.read_model_counts_as_closeout ?? null,
    },
    authority_boundary: {
      refs_only: input.authority.refs_only ?? null,
      can_claim_live_domain_progress: false,
      can_claim_domain_ready: false,
      can_claim_quality_or_export_ready: false,
      can_claim_artifact_ready: false,
      can_claim_production_ready: false,
      can_sign_owner_receipt: false,
      can_create_typed_blocker: false,
    },
    blockers: input.blockers,
  };
}

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

export function buildStageRunKernelProfileChecks(repoDir: string) {
  const profileFile = readJsonFile(repoDir, 'contracts/stage_run_kernel_profile.json');
  const profile = isRecord(profileFile.payload) ? profileFile.payload : null;
  const stateMachine = isRecord(profile?.stage_run_state_machine) ? profile.stage_run_state_machine : {};
  const codexSemanticRoutePolicy = isRecord(profile?.codex_semantic_route_policy)
    ? profile.codex_semantic_route_policy
    : {};
  const projectionBoundary = isRecord(profile?.projection_boundary) ? profile.projection_boundary : {};
  const objectModels = isRecord(profile?.object_models) ? profile.object_models : {};
  const stageRunModel = isRecord(objectModels.StageRun) ? objectModels.StageRun : {};
  const stageRunAuthority = isRecord(stageRunModel.authority_boundary) ? stageRunModel.authority_boundary : {};
  const stageContextPolicy = isRecord(profile?.stage_context_policy)
    ? profile.stage_context_policy
    : {};
  const defaultReadSurface = isRecord(profile?.default_read_surface)
    ? profile.default_read_surface
    : {};
  const oplMasBoundary = isRecord(profile?.opl_mas_boundary) ? profile.opl_mas_boundary : {};
  const forbiddenOplAuthority = stringList(oplMasBoundary.forbidden_opl_authority);
  const authority = isRecord(profile?.authority_boundary) ? profile.authority_boundary : {};
  const stageNativeUnit = stringList(profile?.stage_native_unit);
  const requiredObjectModels = stringList(profile?.required_object_models);
  const launchHardBlockers = stringList(stageContextPolicy.hard_blockers);
  const launchAdvisoryRefs = stringList(stageContextPolicy.advisory_refs);
  const hasObjectModel = (model: string) => model === 'RoleArtifactRef'
    ? requiredObjectModels.includes('RoleArtifactRef') || requiredObjectModels.includes('ArtifactRef')
    : requiredObjectModels.includes(model);
  const stateFlagValue = (flag: string) => {
    if (flag === 'file_presence_counts_as_stage_complete') {
      return stateMachine.file_presence_counts_as_stage_complete
        ?? stateMachine.stage_folder_files_count_as_next_stage_ready;
    }
    if (flag === 'read_model_can_select_semantic_route') {
      return stateMachine.read_model_can_select_semantic_route
        ?? projectionBoundary.projection_can_authorize_next_stage;
    }
    return stateMachine[flag];
  };
  const authorityValue = (flag: string) => {
    if (flag === 'opl_can_write_domain_truth') {
      return authority.opl_can_write_domain_truth
        ?? authority.can_write_mas_truth
        ?? projectionBoundary.projection_can_write_truth
        ?? (forbiddenOplAuthority.includes('write_mas_study_truth') ? false : undefined);
    }
    if (flag === 'opl_can_mutate_artifact_body') {
      return authority.opl_can_mutate_artifact_body
        ?? stageRunAuthority.can_mutate_domain_artifact_body
        ?? (forbiddenOplAuthority.includes('mutate_domain_artifact_body') ? false : undefined);
    }
    if (flag === 'opl_can_sign_domain_owner_receipt') {
      return authority.opl_can_sign_domain_owner_receipt
        ?? authority.can_sign_owner_receipt
        ?? stageRunAuthority.can_sign_owner_receipt
        ?? (forbiddenOplAuthority.includes('sign_mas_owner_receipt') ? false : undefined);
    }
    if (flag === 'opl_can_create_typed_blocker') {
      return authority.opl_can_create_typed_blocker
        ?? authority.can_replace_typed_blocker
        ?? stageRunAuthority.can_replace_typed_blocker
        ?? (forbiddenOplAuthority.includes('replace_mas_typed_blocker') ? false : undefined);
    }
    if (flag === 'opl_can_authorize_quality_or_export') {
      return authority.opl_can_authorize_quality_or_export
        ?? (forbiddenOplAuthority.includes('authorize_publication_quality') ? false : undefined);
    }
    if (flag === 'provider_completion_counts_as_domain_accepted') {
      return authority.provider_completion_counts_as_domain_accepted
        ?? stateMachine.provider_completion_counts_as_domain_accepted;
    }
    if (flag === 'read_model_can_be_truth_source') {
      return authority.read_model_can_be_truth_source
        ?? projectionBoundary.projection_can_write_truth;
    }
    return authority[flag];
  };
  const blockers = [
    profileFile.status === 'resolved' ? null : `stage_run_kernel_profile_${profileFile.status}`,
    profile ? null : 'stage_run_kernel_profile_not_declared',
    ['opl_stage_run_kernel_profile', 'mas_opl_stage_run_kernel_profile'].includes(optionalString(profile?.surface_kind) ?? '')
      ? null
      : 'stage_run_kernel_profile_surface_kind_invalid',
    ['contracts/opl-framework/stage-run-kernel-contract.json', 'human_doc:mas_opl_stage_native_state_machine'].includes(
      optionalString(profile?.kernel_contract_ref) ?? optionalString(profile?.source_design_ref) ?? '',
    )
      ? null
      : 'stage_run_kernel_profile_contract_ref_invalid',
    optionalString(profile?.stage_manifest_schema_ref) === 'contracts/opl-framework/stage-manifest.schema.json'
      || stringList(isRecord(profile?.stage_folder_manifest) ? profile.stage_folder_manifest.required_manifest_sections : []).includes('required_role_artifacts')
      ? null
      : 'stage_run_kernel_profile_stage_manifest_schema_ref_invalid',
    optionalString(profile?.role_artifact_ref_schema_ref) === 'contracts/opl-framework/role-artifact-ref.schema.json'
      || isRecord(isRecord(profile?.stage_folder_manifest) ? profile.stage_folder_manifest.role_artifact_contract : null)
      ? null
      : 'stage_run_kernel_profile_role_artifact_ref_schema_ref_invalid',
    optionalString(profile?.owner_receipt_schema_ref) === 'contracts/opl-framework/stage-owner-receipt.schema.json'
      || stringList(profile?.required_object_models).includes('OwnerReceipt')
      ? null
      : 'stage_run_kernel_profile_owner_receipt_schema_ref_invalid',
    optionalString(profile?.typed_blocker_schema_ref) === 'contracts/opl-framework/stage-typed-blocker.schema.json'
      || stringList(profile?.required_object_models).includes('TypedBlocker')
      ? null
      : 'stage_run_kernel_profile_typed_blocker_schema_ref_invalid',
    ['minimal_state_shell_not_domain_controller_system', 'minimal_state_shell_not_mas_controller_system'].includes(optionalString(profile?.kernel_role) ?? '')
      ? null
      : 'stage_run_kernel_profile_kernel_role_invalid',
    ...REQUIRED_STAGE_RUN_NATIVE_UNITS
      .filter((unit) => !stageNativeUnit.includes(unit))
      .map((unit) => `stage_run_kernel_profile_native_unit_missing:${unit}`),
    ...REQUIRED_STAGE_RUN_OBJECT_MODELS
      .filter((model) => !hasObjectModel(model))
      .map((model) => `stage_run_kernel_profile_object_model_missing:${model}`),
    ...REQUIRED_STAGE_RUN_STATE_FLAGS
      .filter((flag) => stateFlagValue(flag) !== false)
      .map((flag) => `stage_run_kernel_profile_state_flag_must_be_false:${flag}`),
    ...REQUIRED_STAGE_RUN_STATE_TRUE_FLAGS
      .filter((flag) => stateFlagValue(flag) !== true)
      .map((flag) => `stage_run_kernel_profile_state_flag_must_be_true:${flag}`),
    ...REQUIRED_STAGE_RUN_LAUNCH_HARD_BLOCKERS
      .filter((field) => !launchHardBlockers.includes(field))
      .map((field) => `stage_run_kernel_profile_launch_hard_blocker_missing:${field}`),
    ...STAGE_RUN_STRATEGY_ADVISORY_REFS
      .filter((field) => !launchAdvisoryRefs.includes(field))
      .map((field) => `stage_run_kernel_profile_advisory_ref_missing:${field}`),
    stageContextPolicy.advisory_refs_can_block_launch === false
      ? null
      : 'stage_run_kernel_profile_advisory_refs_can_block_launch',
    ...STAGE_RUN_STRATEGY_ADVISORY_REFS
      .filter((field) => launchHardBlockers.includes(field))
      .map((field) => `stage_run_kernel_profile_strategy_ref_promoted_to_launch_blocker:${field}`),
    optionalString(defaultReadSurface.root) === 'stage_run_current_owner_delta'
      ? null
      : 'stage_run_kernel_profile_default_read_surface_invalid',
    defaultReadSurface.raw_worklist_default === false
      ? null
      : 'stage_run_kernel_profile_raw_worklist_default_forbidden',
    defaultReadSurface.readiness_default === false
      ? null
      : 'stage_run_kernel_profile_readiness_default_forbidden',
    defaultReadSurface.replay_packet_default === false
      ? null
      : 'stage_run_kernel_profile_replay_packet_default_forbidden',
    optionalString(codexSemanticRoutePolicy.semantic_route_decision_owner) === 'decisive_codex_attempt'
      ? null
      : 'stage_run_kernel_profile_semantic_route_decision_owner_invalid',
    optionalString(codexSemanticRoutePolicy.stage_transition_materialization_owner)
        === 'opl_stage_run_controller'
      ? null
      : 'stage_run_kernel_profile_stage_transition_materialization_owner_invalid',
    Object.hasOwn(codexSemanticRoutePolicy, 'semantic_owner')
      ? 'stage_run_kernel_profile_legacy_semantic_owner_forbidden'
      : null,
    codexSemanticRoutePolicy.readable_artifact_allows_any_declared_stage === true
      ? null
      : 'stage_run_kernel_profile_readable_artifact_route_policy_invalid',
    codexSemanticRoutePolicy.provider_completion_is_route_decision === false
      ? null
      : 'stage_run_kernel_profile_provider_completion_route_authority_invalid',
    codexSemanticRoutePolicy.file_presence_without_readability_is_progress === false
      ? null
      : 'stage_run_kernel_profile_unreadable_file_progress_invalid',
    codexSemanticRoutePolicy.quality_budget_exhaustion_blocks_route === false
      ? null
      : 'stage_run_kernel_profile_quality_budget_exhaustion_must_not_block_route',
    codexSemanticRoutePolicy.owner_receipt_required_for_quality_or_ready_claim === true
      ? null
      : 'stage_run_kernel_profile_owner_receipt_required_for_quality_or_ready_claim',
    codexSemanticRoutePolicy.framework_can_accept_reject_rank_or_override_route === false
      ? null
      : 'stage_run_kernel_profile_framework_semantic_route_authority_forbidden',
    profile?.transition_authority === undefined
      ? null
      : 'stage_run_kernel_profile_second_transition_authority_plane_forbidden',
    ...REQUIRED_STAGE_RUN_AUTHORITY_FALSE_FLAGS
      .filter((flag) => authorityValue(flag) !== false)
      .map((flag) => `stage_run_kernel_profile_authority_flag_must_be_false:${flag}`),
  ].filter((entry): entry is string => Boolean(entry));
  return {
    status: blockers.length === 0 ? 'passed' : 'blocked',
    profile_status: blockers.length === 0 ? 'declared' : 'blocked',
    profile_source: 'contracts/stage_run_kernel_profile.json',
    kernel_contract_ref: optionalString(profile?.kernel_contract_ref),
    kernel_role: optionalString(profile?.kernel_role),
    stage_native_unit: stageNativeUnit,
    required_object_models: requiredObjectModels,
    stage_run_state_machine: Object.fromEntries(
      [...REQUIRED_STAGE_RUN_STATE_FLAGS, ...REQUIRED_STAGE_RUN_STATE_TRUE_FLAGS]
        .map((flag) => [flag, stateFlagValue(flag) ?? null]),
    ),
    stage_context_policy: {
      hard_blockers: launchHardBlockers,
      advisory_refs: launchAdvisoryRefs,
      advisory_refs_can_block_launch:
        stageContextPolicy.advisory_refs_can_block_launch ?? null,
    },
    default_read_surface: {
      root: optionalString(defaultReadSurface.root),
      raw_worklist_default: defaultReadSurface.raw_worklist_default ?? null,
      readiness_default: defaultReadSurface.readiness_default ?? null,
      replay_packet_default: defaultReadSurface.replay_packet_default ?? null,
    },
    codex_semantic_route_policy: {
      semantic_route_decision_owner:
        optionalString(codexSemanticRoutePolicy.semantic_route_decision_owner),
      stage_transition_materialization_owner:
        optionalString(codexSemanticRoutePolicy.stage_transition_materialization_owner),
      readable_artifact_allows_any_declared_stage:
        codexSemanticRoutePolicy.readable_artifact_allows_any_declared_stage ?? null,
      provider_completion_is_route_decision:
        codexSemanticRoutePolicy.provider_completion_is_route_decision ?? null,
      file_presence_without_readability_is_progress:
        codexSemanticRoutePolicy.file_presence_without_readability_is_progress ?? null,
      quality_budget_exhaustion_blocks_route:
        codexSemanticRoutePolicy.quality_budget_exhaustion_blocks_route ?? null,
      owner_receipt_required_for_quality_or_ready_claim:
        codexSemanticRoutePolicy.owner_receipt_required_for_quality_or_ready_claim ?? null,
      framework_can_accept_reject_rank_or_override_route:
        codexSemanticRoutePolicy.framework_can_accept_reject_rank_or_override_route ?? null,
    },
    authority_boundary: Object.fromEntries(
      REQUIRED_STAGE_RUN_AUTHORITY_FALSE_FLAGS.map((flag) => [flag, authorityValue(flag) ?? null]),
    ),
    blockers,
  };
}

export function buildStageRunCanaryEvidenceChecks(repoDir: string) {
  const evidenceFile = readJsonFile(repoDir, 'contracts/stage_run_canary_evidence.json');
  const evidence = isRecord(evidenceFile.payload) ? evidenceFile.payload : null;
  const strategyTrace = isRecord(evidence?.strategy_trace) ? evidence.strategy_trace : {};
  const roleArtifactRefs = isRecord(evidence?.role_artifact_refs) ? evidence.role_artifact_refs : {};
  const closeout = isRecord(evidence?.closeout) ? evidence.closeout : {};
  const authority = isRecord(evidence?.authority_boundary) ? evidence.authority_boundary : {};
  const terminalOutcome = optionalString(closeout.terminal_outcome);
  const forbiddenClaimFindings = buildForbiddenStageRunCanaryClaimFindings(evidence);
  const hasCloseoutRef = refString(closeout.owner_receipt_ref) !== null
    || refString(closeout.typed_blocker_ref) !== null;
  const blockers = [
    evidenceFile.status === 'resolved' ? null : `stage_run_canary_evidence_${evidenceFile.status}`,
    evidence ? null : 'stage_run_canary_evidence_not_declared',
    optionalString(evidence?.surface_kind) === 'opl_stage_run_controlled_canary_evidence'
      ? null
      : 'stage_run_canary_evidence_surface_kind_invalid',
    optionalString(evidence?.version) === 'stage-run-controlled-canary.v1'
      ? null
      : 'stage_run_canary_evidence_version_invalid',
    optionalString(evidence?.evidence_scope) === 'controlled_fixture_not_live_domain_progress'
      ? null
      : 'stage_run_canary_evidence_scope_invalid',
    optionalString(evidence?.domain_id) ? null : 'stage_run_canary_evidence_domain_id_missing',
    optionalString(evidence?.canary_id) ? null : 'stage_run_canary_evidence_canary_id_missing',
    optionalString(evidence?.stage_id) ? null : 'stage_run_canary_evidence_stage_id_missing',
    refString(evidence?.stage_run_ref) ? null : 'stage_run_canary_evidence_stage_run_ref_missing',
    refString(evidence?.stage_manifest_ref) ? null : 'stage_run_canary_evidence_stage_manifest_ref_missing',
    refString(evidence?.current_pointer_ref) ? null : 'stage_run_canary_evidence_current_pointer_ref_missing',
    ...REQUIRED_STAGE_RUN_CANARY_STRATEGY_LAYERS
      .filter((layer) => refList(strategyTrace[layer]).length === 0)
      .map((layer) => `stage_run_canary_evidence_strategy_layer_missing:${layer}`),
    ...REQUIRED_STAGE_RUN_CANARY_ROLE_ARTIFACT_REFS
      .filter((field) => refString(roleArtifactRefs[field]) === null)
      .map((field) => `stage_run_canary_evidence_role_artifact_ref_missing:${field}`),
    ['owner_receipt', 'typed_blocker'].includes(terminalOutcome ?? '')
      ? null
      : 'stage_run_canary_evidence_terminal_outcome_invalid',
    hasCloseoutRef ? null : 'stage_run_canary_evidence_closeout_ref_missing',
    closeout.same_attempt_self_review === false
      ? null
      : 'stage_run_canary_evidence_same_attempt_self_review_forbidden',
    authority.refs_only === true
      ? null
      : 'stage_run_canary_evidence_refs_only_boundary_missing',
    ...REQUIRED_STAGE_RUN_CANARY_AUTHORITY_FALSE_FLAGS
      .filter((flag) => authority[flag] !== false)
      .map((flag) => `stage_run_canary_evidence_authority_flag_must_be_false:${flag}`),
    ...forbiddenClaimFindings
      .map((finding) => `stage_run_canary_evidence_forbidden_claim:${finding.field}:${finding.path}`),
  ].filter((entry): entry is string => Boolean(entry));
  const evidenceScope = optionalString(evidence?.evidence_scope);
  const domainId = optionalString(evidence?.domain_id);
  const stageId = optionalString(evidence?.stage_id);
  const stageRunRef = refString(evidence?.stage_run_ref);
  const stageManifestRef = refString(evidence?.stage_manifest_ref);
  const currentPointerRef = refString(evidence?.current_pointer_ref);
  return {
    status: blockers.length === 0 ? 'passed' : 'blocked',
    evidence_status: blockers.length === 0 ? 'declared' : 'blocked',
    evidence_source: 'contracts/stage_run_canary_evidence.json',
    evidence_scope: evidenceScope,
    domain_id: domainId,
    canary_id: optionalString(evidence?.canary_id),
    stage_id: stageId,
    stage_run_ref: stageRunRef,
    stage_manifest_ref: stageManifestRef,
    current_pointer_ref: currentPointerRef,
    strategy_trace: Object.fromEntries(
      REQUIRED_STAGE_RUN_CANARY_STRATEGY_LAYERS.map((layer) => [layer, refList(strategyTrace[layer])]),
    ),
    role_artifact_refs: Object.fromEntries(
      REQUIRED_STAGE_RUN_CANARY_ROLE_ARTIFACT_REFS.map((field) => [field, refString(roleArtifactRefs[field])]),
    ),
    closeout: {
      terminal_outcome: terminalOutcome,
      owner_receipt_ref: refString(closeout.owner_receipt_ref),
      typed_blocker_ref: refString(closeout.typed_blocker_ref),
      same_attempt_self_review: closeout.same_attempt_self_review ?? null,
    },
    authority_boundary: {
      refs_only: authority.refs_only ?? null,
      ...Object.fromEntries(
        REQUIRED_STAGE_RUN_CANARY_AUTHORITY_FALSE_FLAGS.map((flag) => [flag, authority[flag] ?? null]),
      ),
    },
    forbidden_claim_scan: {
      status: forbiddenClaimFindings.length === 0 ? 'passed' : 'blocked',
      forbidden_claim_count: forbiddenClaimFindings.length,
      findings: forbiddenClaimFindings,
      scanned_source: 'contracts/stage_run_canary_evidence.json',
      policy: 'controlled_canary_may_show_cognitive_work_refs_but_cannot_claim_live_domain_progress_domain_ready_quality_export_artifact_or_production_ready',
    },
    operator_summary: buildStageRunCanaryOperatorSummary({
      authority,
      blockers,
      closeout,
      currentPointerRef,
      domainId,
      evidenceScope,
      roleArtifactRefs,
      stageId,
      stageManifestRef,
      stageRunRef,
      strategyTrace,
      terminalOutcome,
    }),
    blockers,
  };
}

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
