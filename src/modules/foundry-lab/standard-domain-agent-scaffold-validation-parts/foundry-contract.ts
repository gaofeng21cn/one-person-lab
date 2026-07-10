import {
  FOUNDRY_AGENT_SERIES_POLICY_BUNDLE_FINGERPRINT,
  FOUNDRY_AGENT_SERIES_POLICY_RELEASE_REF,
  STANDARD_FOUNDRY_AGENT_SERIES_CONTRACT,
} from '../standard-domain-agent-scaffold-constants.ts';
import {
  STANDARD_AGENT_REGISTRY,
  STANDARD_AGENT_SERIES_MEMBERSHIP,
} from '../../../kernel/standard-agent-registry.ts';
import { isPlainRecord, readOptionalString, readStringArray } from './shared.ts';

function forbiddenActivePublicFoundryFieldName(key: string) {
  return key === 'public_surface_role'
    || key === 'foundry_public_surface_role'
    || key === 'forbidden_public_surface_roles';
}

function activePublicFoundryFieldAllowedByPath(pathParts: string[]) {
  return pathParts.includes('standard_public_projection_policy')
    || pathParts.includes('history')
    || pathParts.includes('tombstone');
}

function findForbiddenActivePublicFoundryFields(value: unknown, pathParts: string[] = []): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) =>
      findForbiddenActivePublicFoundryFields(entry, [...pathParts, String(index)])
    );
  }
  if (!isPlainRecord(value)) {
    return [];
  }
  return Object.entries(value).flatMap(([key, entry]) => {
    const currentPath = [...pathParts, key];
    const selfFinding = forbiddenActivePublicFoundryFieldName(key)
      && !activePublicFoundryFieldAllowedByPath(currentPath)
      ? [`foundry_agent_public_projection_forbidden_role_field:${key}`]
      : [];
    return [
      ...selfFinding,
      ...findForbiddenActivePublicFoundryFields(entry, currentPath),
    ];
  });
}

export function validateFoundryAgentSeriesContract(foundryAgentSeries: unknown, enforceToolAffordanceBoundary: boolean) {
  const contract = isPlainRecord(foundryAgentSeries) ? foundryAgentSeries : null;
  const requiredIdentityFields = readStringArray(contract?.required_identity_fields);
  const stageManifestRef = readOptionalString(contract?.stage_manifest_ref);
  const stageControlPlaneRef = readOptionalString(contract?.stage_control_plane_ref);
  const requiredStagePackets = readStringArray(contract?.required_stage_packets);
  const sharedProgressProjectionFields = readStringArray(contract?.shared_progress_projection_fields);
  const contractVersionPolicy = isPlainRecord(contract?.contract_version_policy)
    ? contract.contract_version_policy
    : null;
  const compatibleVersionRange = readStringArray(contractVersionPolicy?.compatible_version_range);
  const sharedReleasePinStrategy = isPlainRecord(contract?.shared_release_pin_strategy)
    ? contract.shared_release_pin_strategy
    : null;
  const supportedPinSources = readStringArray(sharedReleasePinStrategy?.supported_pin_sources);
  const sharedPolicyRelease = isPlainRecord(contract?.shared_policy_release)
    ? contract.shared_policy_release
    : null;
  const seriesDesignProfile = isPlainRecord(contract?.series_design_profile)
    ? contract.series_design_profile
    : null;
  const agentMembershipProjectionPolicy = isPlainRecord(contract?.agent_membership_projection_policy)
    ? contract.agent_membership_projection_policy
    : null;
  const standardPublicProjectionPolicy = isPlainRecord(contract?.standard_public_projection_policy)
    ? contract.standard_public_projection_policy
    : null;
  const allowedActivePublicFoundrySurfaces = readStringArray(
    standardPublicProjectionPolicy?.allowed_active_public_foundry_surfaces,
  );
  const allowedLegacyRetentionContexts = readStringArray(
    standardPublicProjectionPolicy?.non_standard_surface_retention_contexts,
  );
  const workspaceTopologyProfile = isPlainRecord(contract?.workspace_topology_profile)
    ? contract.workspace_topology_profile
    : null;
  const topologyModel = readStringArray(workspaceTopologyProfile?.topology_model);
  const workspaceModes = readStringArray(workspaceTopologyProfile?.workspace_modes);
  const defaultProfiles = isPlainRecord(workspaceTopologyProfile?.default_profiles)
    ? workspaceTopologyProfile.default_profiles
    : null;
  const oneOffWorkspaceProfile = isPlainRecord(defaultProfiles?.one_off)
    ? defaultProfiles.one_off
    : null;
  const seriesWorkspaceProfile = isPlainRecord(defaultProfiles?.series)
    ? defaultProfiles.series
    : null;
  const portfolioWorkspaceProfile = isPlainRecord(defaultProfiles?.portfolio)
    ? defaultProfiles.portfolio
    : null;
  const oneOffSharedResourceRoots = readStringArray(oneOffWorkspaceProfile?.shared_resource_roots);
  const seriesSharedResourceRoots = readStringArray(seriesWorkspaceProfile?.shared_resource_roots);
  const portfolioSharedResourceRoots = readStringArray(portfolioWorkspaceProfile?.shared_resource_roots);
  const domainProfileDefaults = isPlainRecord(workspaceTopologyProfile?.domain_profile_defaults)
    ? workspaceTopologyProfile.domain_profile_defaults
    : null;
  const standardDomainRegistryEntries = STANDARD_AGENT_REGISTRY
    .filter((entry) => entry.series_membership === STANDARD_AGENT_SERIES_MEMBERSHIP);
  const defaultProfileKeys = Object.keys(defaultProfiles ?? {}).sort();
  const expectedDefaultProfileKeys = ['one_off', 'portfolio', 'series'];
  const domainProfileDefaultKeys = Object.keys(domainProfileDefaults ?? {}).sort();
  const expectedDomainProfileDefaultKeys = standardDomainRegistryEntries
    .map((entry) => entry.agent_id)
    .sort();
  const defaultUserInspectionSurface = isPlainRecord(
    workspaceTopologyProfile?.default_user_inspection_surface,
  )
    ? workspaceTopologyProfile.default_user_inspection_surface
    : null;
  const runtimeStateBoundary = isPlainRecord(workspaceTopologyProfile?.runtime_state_boundary)
    ? workspaceTopologyProfile.runtime_state_boundary
    : null;
  const workspaceAuthorityBoundary = isPlainRecord(workspaceTopologyProfile?.authority_boundary)
    ? workspaceTopologyProfile.authority_boundary
    : null;
  const workspaceInitializationPolicy = isPlainRecord(
    workspaceTopologyProfile?.workspace_initialization_policy,
  )
    ? workspaceTopologyProfile.workspace_initialization_policy
    : null;
  const registryDerivedTopology =
    workspaceInitializationPolicy?.infer_series_when_user_requests_multiple_related_projects === true
    && workspaceInitializationPolicy?.infer_portfolio_when_user_requests_shared_workspace_with_multiple_projects === true;
  const sharedLifecyclePipeline = readStringArray(seriesDesignProfile?.shared_lifecycle_pipeline);
  const stagePackSections = readStringArray(seriesDesignProfile?.stage_pack_sections);
  const domainIoProfile = isPlainRecord(seriesDesignProfile?.domain_io_profile)
    ? seriesDesignProfile.domain_io_profile
    : null;
  const sharedCloseoutContract = isPlainRecord(seriesDesignProfile?.shared_closeout_contract)
    ? seriesDesignProfile.shared_closeout_contract
    : null;
  const profileAuthorityInvariants = isPlainRecord(seriesDesignProfile?.authority_invariants)
    ? seriesDesignProfile.authority_invariants
    : null;
  const domainAdapterPolicy = isPlainRecord(contract?.domain_adapter_policy)
    ? contract.domain_adapter_policy
    : null;
  const appProjectionPolicy = isPlainRecord(contract?.app_projection_policy)
    ? contract.app_projection_policy
    : null;
  const authorityBoundary = isPlainRecord(contract?.authority_boundary)
    ? contract.authority_boundary
    : null;
  const toolSectionFinding = stagePackSections.includes('tools')
    ? null
    : 'foundry_agent_series_design_profile_missing_tools_section';
  const domainProfileDefaultBlockers = standardDomainRegistryEntries
    .map((entry) => {
      const allowedKeys = registryDerivedTopology
        ? [entry.agent_id]
        : [entry.agent_id, ...entry.aliases];
      return allowedKeys.some(
        (key) => readOptionalString(domainProfileDefaults?.[key]) === entry.workspace_profile.default_profile_id,
      )
        ? null
        : `foundry_agent_series_workspace_topology_${entry.agent_id}_default_profile_invalid`;
    });
  const blockers = [
    contract ? null : 'foundry_agent_series_contract_missing_or_invalid',
    readOptionalString(contract?.surface_kind) === STANDARD_FOUNDRY_AGENT_SERIES_CONTRACT.surface_kind
      ? null
      : 'foundry_agent_series_surface_kind_invalid',
    readOptionalString(contract?.version) === STANDARD_FOUNDRY_AGENT_SERIES_CONTRACT.version
      ? null
      : 'foundry_agent_series_version_invalid',
    readOptionalString(contractVersionPolicy?.current_version) === STANDARD_FOUNDRY_AGENT_SERIES_CONTRACT.version
      ? null
      : 'foundry_agent_series_current_version_pin_invalid',
    contractVersionPolicy?.exact_version_pin_required === true
      ? null
      : 'foundry_agent_series_exact_version_pin_required',
    compatibleVersionRange.includes(STANDARD_FOUNDRY_AGENT_SERIES_CONTRACT.version)
      ? null
      : 'foundry_agent_series_compatible_version_range_missing_current',
    readOptionalString(contractVersionPolicy?.domain_contract_ref) === 'contracts/foundry_agent_series.json'
      ? null
      : 'foundry_agent_series_domain_contract_ref_invalid',
    readOptionalString(sharedReleasePinStrategy?.owner_release_contract_ref)
      === 'contracts/family-release/shared-owner-release.json'
      ? null
      : 'foundry_agent_series_owner_release_contract_ref_invalid',
    sharedReleasePinStrategy?.owner_managed_latest_stable_channel_required === true
      ? null
      : 'foundry_agent_series_owner_managed_latest_stable_channel_required',
    sharedReleasePinStrategy?.lockfile_resolved_commit_receipt_required === true
      ? null
      : 'foundry_agent_series_lockfile_resolved_commit_receipt_required',
    sharedReleasePinStrategy?.consumer_exact_commit_equality_gate === false
      ? null
      : 'foundry_agent_series_consumer_exact_commit_equality_gate_must_be_false',
    readOptionalString(sharedReleasePinStrategy?.consumer_alignment_check) === 'family:shared-release'
      ? null
      : 'foundry_agent_series_consumer_alignment_check_invalid',
    readOptionalString(sharedPolicyRelease?.policy_release_contract_ref) === FOUNDRY_AGENT_SERIES_POLICY_RELEASE_REF
      ? null
      : 'foundry_agent_series_policy_release_contract_ref_invalid',
    readOptionalString(sharedPolicyRelease?.policy_bundle_fingerprint) === FOUNDRY_AGENT_SERIES_POLICY_BUNDLE_FINGERPRINT
      ? null
      : 'foundry_agent_series_policy_bundle_fingerprint_invalid',
    readOptionalString(sharedPolicyRelease?.fingerprint_algorithm) === 'sha256:stable-json'
      ? null
      : 'foundry_agent_series_policy_fingerprint_algorithm_invalid',
    sharedPolicyRelease?.domain_contract_policy_release_pin_required === true
      ? null
      : 'foundry_agent_series_policy_release_pin_required',
    sharedPolicyRelease?.domain_adapter_must_not_copy_policy_body_as_authority === true
      ? null
      : 'foundry_agent_series_policy_body_copy_authority_forbidden',
    readOptionalString(sharedPolicyRelease?.consumer_alignment_check) === 'foundry:policy-release'
      ? null
      : 'foundry_agent_series_policy_consumer_alignment_check_invalid',
    seriesDesignProfile ? null : 'foundry_agent_series_design_profile_missing_or_invalid',
    readOptionalString(seriesDesignProfile?.surface_kind) === 'opl_foundry_agent_series_design_profile'
      ? null
      : 'foundry_agent_series_design_profile_surface_kind_invalid',
    readOptionalString(seriesDesignProfile?.profile_id) === 'opl_foundry_agent_series_design_profile.v1'
      ? null
      : 'foundry_agent_series_design_profile_id_invalid',
    sharedLifecyclePipeline.includes('domain_material_intake')
      ? null
      : 'foundry_agent_series_design_profile_missing_intake_step',
    sharedLifecyclePipeline.includes('stage_led_agent_execution')
      ? null
      : 'foundry_agent_series_design_profile_missing_stage_execution_step',
    sharedLifecyclePipeline.includes('owner_receipt_or_typed_blocker_closeout')
      ? null
      : 'foundry_agent_series_design_profile_missing_closeout_step',
    sharedLifecyclePipeline.includes('opl_refs_only_projection_and_recovery')
      ? null
      : 'foundry_agent_series_design_profile_missing_projection_step',
    readOptionalString(domainIoProfile?.input_slot) === 'domain_materials_or_task_request'
      ? null
      : 'foundry_agent_series_design_profile_input_slot_invalid',
    readOptionalString(domainIoProfile?.output_slot) === 'domain_deliverable_or_owner_handoff'
      ? null
      : 'foundry_agent_series_design_profile_output_slot_invalid',
    stagePackSections.includes('prompts')
      ? null
      : 'foundry_agent_series_design_profile_missing_prompts_section',
    stagePackSections.includes('stages')
      ? null
      : 'foundry_agent_series_design_profile_missing_stages_section',
    stagePackSections.includes('skills')
      ? null
      : 'foundry_agent_series_design_profile_missing_skills_section',
    enforceToolAffordanceBoundary ? toolSectionFinding : null,
    stagePackSections.includes('knowledge')
      ? null
      : 'foundry_agent_series_design_profile_missing_knowledge_section',
    stagePackSections.includes('quality_gates')
      ? null
      : 'foundry_agent_series_design_profile_missing_quality_gates_section',
    readOptionalString(sharedCloseoutContract?.success_shape) === 'domain_owner_receipt_ref'
      ? null
      : 'foundry_agent_series_design_profile_success_shape_invalid',
    readOptionalString(sharedCloseoutContract?.blocked_shape) === 'domain_owned_typed_blocker_ref'
      ? null
      : 'foundry_agent_series_design_profile_blocked_shape_invalid',
    sharedCloseoutContract?.provider_completion_is_closeout === false
      ? null
      : 'foundry_agent_series_design_profile_provider_completion_must_not_closeout',
    profileAuthorityInvariants?.opl_can_infer_domain_output === false
      ? null
      : 'foundry_agent_series_design_profile_opl_output_inference_forbidden',
    profileAuthorityInvariants?.domain_owns_input_truth_and_output_authority === true
      ? null
      : 'foundry_agent_series_design_profile_domain_authority_required',
    workspaceTopologyProfile ? null : 'foundry_agent_series_workspace_topology_profile_missing_or_invalid',
    readOptionalString(workspaceTopologyProfile?.surface_kind) === 'opl_workspace_topology_profile'
      ? null
      : 'foundry_agent_series_workspace_topology_surface_kind_invalid',
    readOptionalString(workspaceTopologyProfile?.profile_id) === 'opl.workspace_topology_profile.v1'
      ? null
      : 'foundry_agent_series_workspace_topology_profile_id_invalid',
    !registryDerivedTopology || defaultProfileKeys.join('/') === expectedDefaultProfileKeys.join('/')
      ? null
      : 'foundry_agent_series_workspace_topology_default_profile_keys_invalid',
    !registryDerivedTopology || domainProfileDefaultKeys.join('/') === expectedDomainProfileDefaultKeys.join('/')
      ? null
      : 'foundry_agent_series_workspace_topology_domain_profile_default_keys_invalid',
    !registryDerivedTopology
      || !workspaceTopologyProfile
      || !('legacy_domain_profile_aliases' in workspaceTopologyProfile)
      ? null
      : 'foundry_agent_series_workspace_topology_legacy_profile_aliases_forbidden',
    topologyModel.includes('workspace_group')
      ? null
      : 'foundry_agent_series_workspace_topology_missing_workspace_group',
    topologyModel.includes('project_unit')
      ? null
      : 'foundry_agent_series_workspace_topology_missing_project_unit',
    topologyModel.includes('stage_artifact_unit')
      ? null
      : 'foundry_agent_series_workspace_topology_missing_stage_artifact_unit',
    topologyModel.includes('owner_receipt_or_typed_blocker')
      ? null
      : 'foundry_agent_series_workspace_topology_missing_owner_answer_unit',
    readOptionalString(workspaceTopologyProfile?.default_project_stage_outputs_root)
      === 'artifacts/stage_outputs'
      ? null
      : 'foundry_agent_series_workspace_topology_stage_outputs_root_invalid',
    readOptionalString(oneOffWorkspaceProfile?.workspace_mode) === 'one_off'
      ? null
      : 'foundry_agent_series_workspace_topology_default_mode_invalid',
    oneOffWorkspaceProfile?.series_capable_skeleton === true
      ? null
      : 'foundry_agent_series_workspace_topology_default_must_be_series_capable',
    readOptionalString(oneOffWorkspaceProfile?.project_collection_path) === 'projects'
      ? null
      : 'foundry_agent_series_workspace_topology_default_collection_path_invalid',
    readOptionalString(oneOffWorkspaceProfile?.project_stage_outputs_root) === 'artifacts/stage_outputs'
      ? null
      : 'foundry_agent_series_workspace_topology_default_stage_outputs_root_invalid',
    oneOffSharedResourceRoots.includes('shared/sources')
      ? null
      : 'foundry_agent_series_workspace_topology_default_shared_sources_missing',
    readOptionalString(portfolioWorkspaceProfile?.workspace_mode) === 'portfolio'
      ? null
      : 'foundry_agent_series_workspace_topology_portfolio_mode_invalid',
    readOptionalString(portfolioWorkspaceProfile?.project_collection_path) === 'projects'
      ? null
      : 'foundry_agent_series_workspace_topology_portfolio_collection_path_invalid',
    readOptionalString(portfolioWorkspaceProfile?.project_stage_outputs_root)
      === 'artifacts/stage_outputs'
      ? null
      : 'foundry_agent_series_workspace_topology_portfolio_stage_outputs_root_invalid',
    portfolioSharedResourceRoots.includes('data')
      ? null
      : 'foundry_agent_series_workspace_topology_portfolio_shared_data_missing',
    portfolioSharedResourceRoots.includes('literature')
      ? null
      : 'foundry_agent_series_workspace_topology_portfolio_shared_literature_missing',
    portfolioSharedResourceRoots.includes('memory')
      ? null
      : 'foundry_agent_series_workspace_topology_portfolio_shared_memory_missing',
    readOptionalString(seriesWorkspaceProfile?.workspace_mode) === 'series'
      ? null
      : 'foundry_agent_series_workspace_topology_series_mode_invalid',
    readOptionalString(seriesWorkspaceProfile?.project_collection_path) === 'projects'
      ? null
      : 'foundry_agent_series_workspace_topology_series_collection_path_invalid',
    readOptionalString(seriesWorkspaceProfile?.project_stage_outputs_root)
      === 'artifacts/stage_outputs'
      ? null
      : 'foundry_agent_series_workspace_topology_series_stage_outputs_root_invalid',
    seriesSharedResourceRoots.includes('shared/brand')
      ? null
      : 'foundry_agent_series_workspace_topology_series_shared_brand_missing',
    seriesSharedResourceRoots.includes('shared/visual_memory')
      ? null
      : 'foundry_agent_series_workspace_topology_series_visual_memory_missing',
    workspaceModes.includes('one_off')
      ? null
      : 'foundry_agent_series_workspace_topology_missing_one_off_mode',
    workspaceModes.includes('series')
      ? null
      : 'foundry_agent_series_workspace_topology_missing_series_mode',
    workspaceModes.includes('portfolio')
      ? null
      : 'foundry_agent_series_workspace_topology_missing_portfolio_mode',
    ...domainProfileDefaultBlockers,
    readOptionalString(defaultUserInspectionSurface?.ordinary_user_default_surface)
      === 'workspace_local_project_stage_outputs'
      ? null
      : 'foundry_agent_series_workspace_topology_user_surface_invalid',
    readOptionalString(defaultUserInspectionSurface?.project_stage_outputs_pattern)
      === '<project-root>/artifacts/stage_outputs/<stage-id>/'
      ? null
      : 'foundry_agent_series_workspace_topology_user_stage_output_pattern_invalid',
    defaultUserInspectionSurface?.runtime_state_is_default_user_surface === false
      ? null
      : 'foundry_agent_series_workspace_topology_runtime_state_must_not_be_default_surface',
    defaultUserInspectionSurface?.product_views_are_stage_outputs === false
      ? null
      : 'foundry_agent_series_workspace_topology_product_views_must_not_be_stage_outputs',
    readOptionalString(runtimeStateBoundary?.role) === 'provider_backing_provenance_restore_audit'
      ? null
      : 'foundry_agent_series_workspace_topology_runtime_state_role_invalid',
    runtimeStateBoundary?.runtime_state_can_be_canonical_project_root === false
      ? null
      : 'foundry_agent_series_workspace_topology_runtime_state_project_root_forbidden',
    runtimeStateBoundary?.runtime_state_can_close_stage === false
      ? null
      : 'foundry_agent_series_workspace_topology_runtime_state_closeout_forbidden',
    runtimeStateBoundary?.runtime_state_can_replace_owner_receipt_or_typed_blocker === false
      ? null
      : 'foundry_agent_series_workspace_topology_runtime_state_owner_answer_forbidden',
    workspaceAuthorityBoundary?.opl_can_write_domain_truth === false
      ? null
      : 'foundry_agent_series_workspace_topology_domain_truth_authority_forbidden',
    workspaceAuthorityBoundary?.opl_can_create_owner_receipt === false
      ? null
      : 'foundry_agent_series_workspace_topology_owner_receipt_authority_forbidden',
    workspaceAuthorityBoundary?.opl_can_create_typed_blocker === false
      ? null
      : 'foundry_agent_series_workspace_topology_typed_blocker_authority_forbidden',
    workspaceInitializationPolicy?.upgrading_one_off_to_series_must_not_move_existing_project_roots === true
      ? null
      : 'foundry_agent_series_workspace_topology_one_off_series_upgrade_policy_missing',
    supportedPinSources.includes('pyproject.toml')
      ? null
      : 'foundry_agent_series_missing_python_pin_source',
    supportedPinSources.includes('uv.lock')
      ? null
      : 'foundry_agent_series_missing_python_lock_pin_source',
    readOptionalString(contract?.owner) === STANDARD_FOUNDRY_AGENT_SERIES_CONTRACT.owner
      ? null
      : 'foundry_agent_series_owner_must_be_opl',
    readOptionalString(contract?.product_layer) === STANDARD_FOUNDRY_AGENT_SERIES_CONTRACT.product_layer
      ? null
      : 'foundry_agent_series_product_layer_invalid',
    readOptionalString(agentMembershipProjectionPolicy?.policy_id) === 'standard_agent_membership_not_surface_origin'
      ? null
      : 'foundry_agent_membership_projection_policy_missing',
    readOptionalString(agentMembershipProjectionPolicy?.default_membership) === 'standard_domain_agent'
      ? null
      : 'foundry_agent_membership_projection_default_invalid',
    agentMembershipProjectionPolicy?.public_agent_list_must_not_split_by_generated_surface === true
      ? null
      : 'foundry_agent_membership_projection_public_list_must_not_split_by_generated_surface',
    agentMembershipProjectionPolicy?.public_agent_list_must_not_split_by_plugin_transport === true
      ? null
      : 'foundry_agent_membership_projection_public_list_must_not_split_by_plugin_transport',
    agentMembershipProjectionPolicy?.generated_surface_is_membership_axis === false
      ? null
      : 'foundry_agent_membership_projection_generated_surface_must_not_be_membership_axis',
    agentMembershipProjectionPolicy?.generated_surface_is_status_axis === false
      ? null
      : 'foundry_agent_membership_projection_generated_surface_must_not_be_status_axis',
    agentMembershipProjectionPolicy?.plugin_transport_is_membership_axis === false
      ? null
      : 'foundry_agent_membership_projection_plugin_transport_must_not_be_membership_axis',
    agentMembershipProjectionPolicy?.plugin_transport_is_status_axis === false
      ? null
      : 'foundry_agent_membership_projection_plugin_transport_must_not_be_status_axis',
    standardPublicProjectionPolicy ? null : 'foundry_agent_standard_public_projection_policy_missing',
    readOptionalString(standardPublicProjectionPolicy?.surface_kind)
      === 'opl_foundry_agent_standard_public_projection_policy'
      ? null
      : 'foundry_agent_standard_public_projection_policy_surface_kind_invalid',
    readOptionalString(standardPublicProjectionPolicy?.standard_public_foundry_surface)
      === 'opl_generated_hosted_series'
      ? null
      : 'foundry_agent_standard_public_surface_must_be_opl_generated_hosted_series',
    readOptionalString(standardPublicProjectionPolicy?.canonical_inspect_command_pattern)
      === 'opl foundry agents inspect <agent_id>'
      ? null
      : 'foundry_agent_standard_public_inspect_command_invalid',
    allowedActivePublicFoundrySurfaces.includes('opl_foundry_agent_series_spine')
      ? null
      : 'foundry_agent_standard_public_surface_missing_series_spine',
    allowedActivePublicFoundrySurfaces.includes('opl_family_hosted_surfaces')
      ? null
      : 'foundry_agent_standard_public_surface_missing_family_hosted_surfaces',
    standardPublicProjectionPolicy?.active_public_projection_allows_non_opl_foundry_cli === false
      ? null
      : 'foundry_agent_non_opl_foundry_cli_must_not_be_public_standard_surface',
    standardPublicProjectionPolicy?.active_public_projection_allows_domain_owned_cli_as_standard_surface === false
      ? null
      : 'foundry_agent_domain_owned_cli_must_not_be_public_standard_surface',
    standardPublicProjectionPolicy?.active_public_projection_allows_forbidden_surface_roles === true
      ? 'foundry_agent_forbidden_surface_roles_must_not_be_public_standard_surface'
      : null,
    standardPublicProjectionPolicy?.active_public_projection_allows_compatibility_aliases === false
      ? null
      : 'foundry_agent_compatibility_aliases_must_not_be_public_standard_surface',
    standardPublicProjectionPolicy?.active_public_projection_allows_legacy_json_aliases === false
      ? null
      : 'foundry_agent_legacy_json_aliases_must_not_be_public_standard_surface',
    standardPublicProjectionPolicy?.minimal_authority_functions_are_membership_axis === false
      ? null
      : 'foundry_agent_minimal_authority_functions_must_not_be_membership_axis',
    standardPublicProjectionPolicy?.domain_owned_helpers_are_membership_axis === false
      ? null
      : 'foundry_agent_domain_owned_helpers_must_not_be_membership_axis',
    readOptionalString(standardPublicProjectionPolicy?.allowed_domain_owned_helper_context)
      === 'minimal_authority_functions_only'
      ? null
      : 'foundry_agent_domain_owned_helper_context_invalid',
    allowedLegacyRetentionContexts.includes('history')
      ? null
      : 'foundry_agent_legacy_foundry_history_retention_context_missing',
    allowedLegacyRetentionContexts.includes('tombstone')
      ? null
      : 'foundry_agent_legacy_foundry_tombstone_retention_context_missing',
    ...findForbiddenActivePublicFoundryFields(contract),
    readOptionalString(contract?.domain_id) ? null : 'foundry_agent_series_missing_domain_id',
    readOptionalString(contract?.foundry_agent_id) ? null : 'foundry_agent_series_missing_foundry_agent_id',
    readOptionalString(contract?.authority_owner) ? null : 'foundry_agent_series_missing_authority_owner',
    stageManifestRef === 'agent/stages/manifest.json'
      ? null
      : 'foundry_agent_series_stage_manifest_ref_invalid',
    stageControlPlaneRef === 'opl-generated:family_stage_control_plane'
      || stageControlPlaneRef === '/product_entry_manifest/family_stage_control_plane'
      ? null
      : 'foundry_agent_series_generated_stage_control_plane_ref_invalid',
    requiredIdentityFields.includes('domain_id')
      ? null
      : 'foundry_agent_series_missing_identity_domain_id',
    requiredIdentityFields.includes('foundry_agent_id')
      ? null
      : 'foundry_agent_series_missing_identity_foundry_agent_id',
    requiredIdentityFields.includes('authority_owner')
      ? null
      : 'foundry_agent_series_missing_identity_authority_owner',
    requiredIdentityFields.includes('stage_manifest_ref')
      ? null
      : 'foundry_agent_series_missing_identity_stage_manifest_ref',
    requiredStagePackets.includes('progress_delta_policy')
      ? null
      : 'foundry_agent_series_missing_stage_packet_progress_delta_policy',
    requiredStagePackets.includes('stage_completion_policy')
      ? null
      : 'foundry_agent_series_missing_stage_packet_stage_completion_policy',
    requiredStagePackets.includes('typed_blocker_lineage_policy')
      ? null
      : 'foundry_agent_series_missing_stage_packet_typed_blocker_lineage_policy',
    requiredStagePackets.includes('effective_current_context')
      ? null
      : 'foundry_agent_series_missing_stage_packet_effective_current_context',
    requiredStagePackets.includes('owner_receipt_or_typed_blocker_closeout')
      ? null
      : 'foundry_agent_series_missing_stage_packet_closeout',
    sharedProgressProjectionFields.includes('progress_delta_classification')
      ? null
      : 'foundry_agent_series_missing_projection_classification',
    sharedProgressProjectionFields.includes('deliverable_progress_delta')
      ? null
      : 'foundry_agent_series_missing_projection_deliverable_delta',
    sharedProgressProjectionFields.includes('platform_repair_delta')
      ? null
      : 'foundry_agent_series_missing_projection_platform_delta',
    sharedProgressProjectionFields.includes('next_forced_delta')
      ? null
      : 'foundry_agent_series_missing_projection_next_forced_delta',
    domainAdapterPolicy?.no_parallel_progress_schema === true
      ? null
      : 'foundry_agent_series_parallel_progress_schema_must_be_forbidden',
    domainAdapterPolicy?.no_parallel_blocker_lineage_schema === true
      ? null
      : 'foundry_agent_series_parallel_blocker_schema_must_be_forbidden',
    appProjectionPolicy?.app_consumes_shared_progress_projection_only === true
      ? null
      : 'foundry_agent_series_app_shared_projection_required',
    appProjectionPolicy?.app_can_read_domain_body === false
      ? null
      : 'foundry_agent_series_app_domain_body_read_must_be_false',
    authorityBoundary?.opl_owns_series_contract === true
      ? null
      : 'foundry_agent_series_opl_owner_boundary_missing',
    authorityBoundary?.domain_owns_truth_quality_artifact_memory_and_receipts === true
      ? null
      : 'foundry_agent_series_domain_authority_boundary_missing',
  ].filter((entry): entry is string => Boolean(entry));
  return {
    surface_kind: 'opl_foundry_agent_series_contract_validation',
    contract_ref: 'contracts/opl-framework/foundry-agent-series-contract.json',
    status: blockers.length === 0 ? 'passed' : 'blocked',
    required_for_standard_agent: true,
    required_identity_fields: requiredIdentityFields,
    required_stage_packets: requiredStagePackets,
    shared_progress_projection_fields: sharedProgressProjectionFields,
    series_design_profile: seriesDesignProfile,
    agent_membership_projection_policy: agentMembershipProjectionPolicy,
    workspace_topology_profile: workspaceTopologyProfile,
    contract_version_policy: contractVersionPolicy,
    shared_release_pin_strategy: sharedReleasePinStrategy,
    shared_policy_release: sharedPolicyRelease,
    blockers,
    advisory_findings: enforceToolAffordanceBoundary || !toolSectionFinding ? [] : [toolSectionFinding],
  };
}
