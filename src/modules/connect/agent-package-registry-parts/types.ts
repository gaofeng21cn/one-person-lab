export type AgentPackageAuthorityBoundary = {
  refs_only: true;
  can_write_domain_truth: false;
  can_write_domain_memory_body: false;
  can_mutate_domain_artifact_body: false;
  can_authorize_quality_or_export: false;
  can_create_owner_receipt: false;
  can_create_typed_blocker: false;
  can_claim_domain_ready: false;
  can_claim_production_ready: false;
};

export type AgentPackageSourceKind =
  | 'first_party_managed_cohort'
  | 'bundled_full_runtime_modules'
  | 'local_manifest_file'
  | 'manifest_url'
  | 'manifest_import'
  | 'developer_checkout_override';

export type AgentPackageCarrierAuthority = {
  surface_kind: 'opl_agent_package_carrier_authority.v1';
  status: 'verified';
  catalog_ref: string;
  catalog_sha256: string;
  catalog_owner_source_commit: string;
  manifest_carrier_source_commit: string;
  payload_source_commit: string;
  verified_source_commit: string;
};

export type AgentPackageLifecycleAction =
  | 'install'
  | 'update'
  | 'repair'
  | 'activate'
  | 'rollback'
  | 'uninstall'
  | 'hide'
  | 'unhide'
  | 'enable'
  | 'disable';

export type AgentPackageManifestValidateInput = {
  manifestUrl?: string | null;
  registryUrl?: string | null;
  packageId?: string | null;
  trustTier?: string | null;
  sourceKind?: AgentPackageSourceKind | null;
};

export type AgentPackageOperationProvenance = {
  trigger: string;
  initiator: string;
  source_policy: string;
  source_policy_reason: string;
  operation_id: string;
  correlation_id: string;
};

export type AgentPackageInstallInput = AgentPackageManifestValidateInput & {
  dryRun?: boolean;
  agentRoot?: string | null;
  scope?: 'workspace' | 'quest' | null;
  targetWorkspace?: string | null;
  targetQuest?: string | null;
  keepMigrationIds?: string[];
  agentRoots?: Record<string, string>;
  provenance?: AgentPackageOperationProvenance;
};

export type AgentPackageRole =
  | 'standard_agent'
  | 'capability_package'
  | 'workflow_profile';

export type AgentPackagePackageActionInput = {
  packageId: string;
  dryRun?: boolean;
  agentRoot?: string | null;
  scope?: 'workspace' | 'quest' | null;
  targetWorkspace?: string | null;
  targetQuest?: string | null;
  useBoundaryId?: string | null;
  pinnedUseBinding?: AgentPackageUseBinding | null;
};

export type AgentPackageRepairInput = AgentPackagePackageActionInput & AgentPackageManifestValidateInput;

export type AgentPackageHomeShortcutPreferencesSetInput = {
  packageId: string;
  shortcutId: string;
  visible?: boolean | null;
  sortOrder?: number | null;
  dryRun?: boolean;
};

export type FetchJsonResult = {
  source_url: string;
  source_kind: 'http_url' | 'file_url' | 'local_file';
  source_sha256: string;
  payload: unknown;
};

export type AgentPackagePayloadFile = {
  relativePath: string;
  content: Buffer;
  sha256: string | null;
  mode: '100644' | '100755';
  digestVerified: boolean;
};

export type AgentPackageLocalizedText = Record<string, string>;

export type AgentPackageAppContributionViewType =
  | 'list_detail'
  | 'timeline'
  | 'approval_diff'
  | 'task_board'
  | 'artifact_view'
  | 'activity_log';

export type AgentPackageAppContributions = {
  schema_version: 'opl-app-contributions.v1';
  navigation: Array<{
    navigation_id: string;
    label_i18n: AgentPackageLocalizedText;
    view_id: string;
    icon_id?: string;
    sort_order?: number;
  }>;
  views: Array<{
    view_id: string;
    view_type: AgentPackageAppContributionViewType;
    title_i18n: AgentPackageLocalizedText;
    data_ref: string;
    command_ids: string[];
    badge_ids: string[];
    empty_state_i18n?: AgentPackageLocalizedText;
  }>;
  commands: Array<{
    command_id: string;
    label_i18n: AgentPackageLocalizedText;
    action_ref: string;
    confirmation_required: boolean;
  }>;
  badges: Array<{
    badge_id: string;
    label_i18n: AgentPackageLocalizedText;
    data_ref: string;
    tone?: 'neutral' | 'info' | 'success' | 'warning' | 'critical';
  }>;
};

export type AgentPackageHomeShortcutRoute = {
  route_kind: 'agent_package_shortcut';
  executor: 'codex_cli';
  codex_visible_entry: string;
};

export type AgentPackageHomeShortcutPresentation = {
  shortcut_id: string;
  label_i18n: AgentPackageLocalizedText;
  default_visible: boolean;
  user_configurable: boolean;
  route: AgentPackageHomeShortcutRoute;
};

export type AgentPackagePresentation = {
  display_name_i18n: AgentPackageLocalizedText;
  description_i18n: AgentPackageLocalizedText;
  session_routing_summary_i18n: AgentPackageLocalizedText;
  home_shortcuts: AgentPackageHomeShortcutPresentation[];
};

export type AgentPackageConfiguredCodexPluginCarrierDescriptor = {
  packageId: string;
  carrier: {
    kind: 'codex_plugin_manager';
    pluginId: string;
    marketplaceSource: string | null;
  };
  executor: {
    route: 'codex_cli';
    requiredSkillIds: string[];
  };
  publicationRef: string | null;
};

export type AgentPackageRegistryEntry = {
  package_id: string;
  display_name: string;
  publisher: string;
  description: string;
  tags: string[];
  package_role: AgentPackageRole | null;
  source: string;
  manifest_url: string;
  version_source_ref: string;
  selected_version: string | null;
  stable_version: string | null;
  manifest_validation: 'deferred' | 'fetched_manifest' | 'catalog_inline_manifest';
  trust_tier: string;
  starter_default: boolean;
  codex_visible_entry: string | null;
  required_skill_ids: string[];
  optional_skill_ids: string[];
  home_shortcut_ids: string[];
  presentation?: AgentPackagePresentation | null;
  display_policy: string | null;
  ordinary_user_source: AgentPackageOrdinaryUserSource | null;
  configured_codex_plugin_carrier?: AgentPackageConfiguredCodexPluginCarrierDescriptor | null;
  app_contributions?: AgentPackageAppContributions | null;
};

export type AgentPackageOrdinaryUserSource = {
  kind: 'ghcr_oci_artifact_latest_stable';
  registry: 'ghcr.io';
  artifact_ref: string;
  ordinary_user_ref: string;
  immutable_version_ref_pattern: string;
  candidate_ref: string;
  latest_stable_role: 'ordinary_user_latest_stable_pointer_after_candidate_gates';
  latest_stable_is_only_ordinary_user_channel: true;
  daily_candidate_build_gate: 'daily_candidate_build_must_pass_before_promote_latest_stable';
  install_truth: string[];
  latest_stable_is_install_truth: false;
  developer_checkout_auto_apply_allowed: false;
};

export type AgentPackageDistributionPayload = {
  payload_kind: string;
  payload_ref: string;
  payload_digest_ref: string;
  required_skill_pack_lock_refs: string[];
  proof_status: string;
  live_download_proof: false;
  installed_reload_proof: false;
  oci_ref: string;
  oci_media_type: string;
  immutable_tag: string;
  moving_tag: 'latest-stable';
  promotion_policy: 'daily_candidate_gates_then_promote_latest_stable';
  install_truth: 'resolved_digest_lock';
};

export type AgentPackageManifest = {
  package_id: string;
  agent_id: string | null;
  package_role: AgentPackageRole;
  display_name: string;
  publisher: string;
  version: string;
  owner_language_version: AgentPackageOwnerLanguageVersion | null;
  source: string;
  source_repo: string | null;
  source_commit: string | null;
  carrier_source_commit: string | null;
  verified_payload_source_commit: string | null;
  codex_surface: Record<string, unknown>;
  codex_default_exposure?: boolean;
  skill_packs: Record<string, unknown>[];
  entrypoints: Record<string, unknown>[];
  health_check: Record<string, unknown>;
  permissions: unknown[];
  distribution_payload: AgentPackageDistributionPayload | null;
  update_channel: string;
  rollback_ref: string;
  codex_visible_entry: string;
  required_skill_ids: string[];
  optional_skill_refs: string[];
  presentation?: AgentPackagePresentation | null;
  plugin_id: string | null;
  plugin_source_path: string | null;
  plugin_payload_manifest_url: string | null;
  plugin_payload_manifest_sha256: string | null;
  plugin_payload_cache_path: string | null;
  profile_surface: AgentPackageProfileSurfaceConfig | null;
  managed_policy_surface: AgentPackageManagedPolicySurfaceConfig | null;
  runtime_source_carrier: AgentPackageManagedRuntimeSourceCarrier | null;
  managed_update_source: AgentPackageManagedVersionCatalogSource | null;
  capability_dependencies: AgentPackageCapabilityDependency[];
  capability_provider: AgentPackageCapabilityProvider | null;
  content_digest: string | null;
  content_lock_canonicalization: 'ordered_path_nul_file_bytes' | 'ordered_path_length_file_length_bytes' | null;
  content_lock_paths: string[];
  developer_checkout_source?: AgentPackageDeveloperCheckoutSource | null;
  configured_codex_plugin_carrier?: AgentPackageConfiguredCodexPluginCarrierDescriptor | null;
  app_contributions?: AgentPackageAppContributions | null;
};

export type AgentPackageDeveloperCheckoutSource = {
  surface_kind: 'opl_agent_package_developer_checkout_source.v1';
  checkout_path: string;
  owner_manifest_path: string;
  owner_manifest_sha256: string;
  plugin_source_path: string;
  source_git_head_sha: string | null;
  tree_sha256: string;
  payload_digest: string;
  declared_content_digest: string | null;
  copy_paths: string[];
  copy_file_modes: Record<string, '100644' | '100755'>;
};

export type AgentPackageOwnerLanguageVersion = {
  scheme: 'pep440';
  value: string;
};

export type AgentPackageManagedVersionCatalogSource = {
  kind: 'managed_version_catalog';
  transport: 'json_url' | 'opl_oci_channel';
  catalog_ref: string;
  digest_authority: 'manifest_and_content_digest';
};

export type AgentPackageManagedRuntimeSourceCarrier = {
  carrier_kind: 'opl_managed_module_source';
  module_id: string;
};

export type AgentPackageManagedRuntimeSourceState = {
  surface_kind: 'opl_agent_package_managed_runtime_source';
  status: 'validated_no_write' | 'current' | 'retained_on_uninstall' | 'removed';
  carrier_kind: 'opl_managed_module_source';
  module_id: string;
  checkout_path: string;
  source_checkout_path?: string | null;
  ownership: 'package_created' | 'preexisting_adopted';
  source_mode?: 'package_channel' | 'developer_checkout' | 'bundled_full_runtime';
  channel_version: string | null;
  artifact_ref: string | null;
  layer_digest: string | null;
  source_archive_sha256: string | null;
  source_git_head_sha: string | null;
  tree_sha256: string;
  runtime_snapshot_sha256?: string | null;
  rollback_ref: string | null;
  preparation_status: 'validated_no_write' | 'completed';
  bootstrap_command: string[] | null;
  package_prepare_command?: string[] | null;
  health_check_command: string[];
  handler_probe_command: string[];
  health_output_sha256: string | null;
  handler_probe_output_sha256: string | null;
  preparation_root: string | null;
  preparation_scope: 'managed_source_root' | 'developer_checkout_root' | 'developer_snapshot_root' | 'preexisting_read_only_probe';
};

export type AgentPackageManagedRuntimeSourceReadiness = {
  status: 'not_required' | 'missing' | 'current' | 'incompatible';
  operational_ready: boolean;
  module_id: string | null;
  checkout_path: string | null;
  expected_tree_sha256: string | null;
  actual_tree_sha256: string | null;
  reason: string | null;
  provenance_observation?: {
    policy: 'observation_only';
    status: 'unchanged' | 'changed' | 'unavailable';
    recorded_source_git_head_sha: string | null;
    actual_source_git_head_sha: string | null;
    recorded_tree_sha256: string;
    actual_tree_sha256: string | null;
  };
};

export type AgentPackageManagedPolicySurfaceConfig = {
  policy_kind: 'opl_flow_workflow_policy';
  source_path: string;
  schema_path: string;
};

export type AgentPackageManagedPolicyDependency = {
  id: string;
  kind: 'base' | 'codex_skill' | 'codex_plugin' | 'mcp_server' | 'cli' | 'runtime_capability';
  bundle_id?: string;
  offline_bundle?: 'none' | 'full';
  online_install_default: boolean;
  activation: 'always' | 'task_routed' | 'explicit';
  source?: string;
  source_path?: string;
  owner?: string;
  version_requirement?: string;
  install_source?: string;
  lifecycle_owner?: string;
  conflict_policy?: 'managed_reconcile' | 'preserve_user_surface' | 'fail_closed_on_collision';
  credential_policy?: 'none' | 'user_or_provider_owned_not_bundled';
  readiness_adapter?:
    | 'codex_skill_payload'
    | 'binary_version'
    | 'agent_reach_doctor'
    | 'runtime_observation';
  /** Recorded at materialization so projections never infer requiredness from a legacy catalog. */
  relationship?: 'required' | 'recommended';
};

export type AgentPackageFlowCapabilityBundle = {
  id: string;
  label: string;
  relationship: 'experience_baseline' | 'compatible_optional';
  member_refs: string[];
  online_materialization: 'members_marked_default' | 'observe_only';
  full_distribution: 'members_marked_full' | 'none';
  readiness: {
    aggregation: 'all_members' | 'observe_members';
    absence_effect: 'degraded_non_blocking' | 'optional_absent';
    repair_policy: 'framework_or_owner_adapter' | 'none';
  };
};

export type AgentPackageFlowCapabilityPlanItem = AgentPackageManagedPolicyDependency & {
  capability_ref: string;
  relationship: 'required' | 'recommended' | 'compatible_optional';
};

export type AgentPackageFlowCapabilityStrategyProjection = {
  surface_kind: 'opl_flow_capability_strategy_projection.v1';
  authority: 'opl-flow';
  policy_schema: 'opl_flow_workflow_policy.v4';
  policy_sha256: string;
  package: {
    id: string;
    version: string;
  };
  bundles: AgentPackageFlowCapabilityBundle[];
  materialization_plan: {
    target: 'online_default';
    items: AgentPackageFlowCapabilityPlanItem[];
  };
  full_distribution_plan: {
    target: 'full_offline_seed';
    items: AgentPackageFlowCapabilityPlanItem[];
  };
  strategy_digest: string;
};

export type AgentPackageFlowCapabilityBuildResolution = {
  capability_ref: string;
  source_ref: string;
  source_sha256: string;
  version: string | null;
};

export type AgentPackageFlowCapabilityBuildLock = {
  surface_kind: 'opl_flow_capability_build_lock.v1';
  authority: 'opl-framework';
  target: 'full_offline_seed';
  flow_package: {
    id: string;
    version: string;
    policy_sha256: string;
    strategy_digest: string;
  };
  items: Array<AgentPackageFlowCapabilityPlanItem & AgentPackageFlowCapabilityBuildResolution>;
  lock_digest: string;
};

export type AgentPackageManagedPolicyCapabilityReadbackItem = {
  id: string;
  kind: AgentPackageManagedPolicyDependency['kind'];
  status: 'available' | 'missing' | 'drifted' | 'unobserved';
  reason: string | null;
};

export type AgentPackageExperienceBaselineReadback = {
  status: 'not_declared' | 'current' | 'degraded';
  failure_ids: string[];
  repair_command: string | null;
  capabilities: AgentPackageManagedPolicyCapabilityReadbackItem[];
};

export type AgentPackageSpecializedCapabilitiesReadback = {
  status: 'not_declared' | 'available' | 'partial' | 'absent' | 'unobserved';
  repair_command: null;
  capabilities: AgentPackageManagedPolicyCapabilityReadbackItem[];
};

export type AgentPackageCodexModelPolicyProjection = {
  surface_kind: 'opl_codex_model_policy_projection.v1';
  authority: 'opl-flow';
  mode_default: 'auto';
  configured_default: {
    model: string;
    reasoning_effort: string;
  };
  override_precedence: string[];
  catalog_policy: Record<string, unknown>;
  configured_default_role: 'recommendation_only';
  effective_selection: {
    mode: 'fixed' | 'unavailable';
    model: string | null;
    reasoning_effort: string | null;
    source: 'local_codex_config' | 'local_codex_config_unavailable';
    overrides_recommendation: boolean | null;
  };
  role: 'package_recommendation_consumed_from_framework_projection';
};

export type AgentPackageManagedPolicyMigrationAction = {
  surface_kind: 'plugin' | 'skill' | 'service' | 'config_table' | 'prompt_or_agent' | 'historical_self_carrier';
  canonical_id: string;
  migration_id: string;
  source_ref: string;
  backup_ref: string;
  backup_sha256: string;
  source_preexisting: true;
  written_sha256: string | null;
  removed_toml_tables: Array<{
    header: string;
    content: string;
    content_sha256: string;
  }>;
  action: 'backed_up_and_removed_from_discovery';
};

export type AgentPackageManagedPolicyDetectedConflict = {
  migration_id: string;
  surface_kind: AgentPackageManagedPolicyMigrationAction['surface_kind'];
  canonical_id: string;
  physical_ref: string;
};

export type AgentPackageManagedPolicyMigration = {
  surface_kind: 'opl_package_managed_policy_migration';
  status: 'not_requested' | 'validated_no_write' | 'current' | 'applied' | 'rolled_back';
  policy_kind: 'opl_flow_workflow_policy' | null;
  policy_path: string | null;
  schema_path: string | null;
  policy_sha256: string | null;
  inventory_digest: string | null;
  dependency_ids: string[];
  dependencies: AgentPackageManagedPolicyDependency[];
  optional_dependency_ids: string[];
  migration_ids: string[];
  detected_conflicts: AgentPackageManagedPolicyDetectedConflict[];
  actions: AgentPackageManagedPolicyMigrationAction[];
  service_actions: Array<Record<string, unknown>>;
  dependency_sync: Record<string, unknown> | null;
  model_projection: Record<string, unknown> | null;
  capability_strategy: AgentPackageFlowCapabilityStrategyProjection | null;
  backup_root: string | null;
  backup_active: boolean;
  writes_performed: boolean;
  note: string;
};

export type AgentPackageManagedPolicyCurrentness = {
  surface_kind: 'opl_package_managed_policy_currentness';
  status: 'not_requested' | 'current' | 'drifted' | 'invalid';
  policy_kind: AgentPackageManagedPolicySurfaceConfig['policy_kind'] | null;
  policy_path: string | null;
  schema_path: string | null;
  expected_policy_sha256: string | null;
  actual_policy_sha256: string | null;
  inventory_digest: string | null;
  enabled_migration_ids: string[];
  detected_conflicts: AgentPackageManagedPolicyDetectedConflict[];
  dependency_sync: Record<string, unknown> | null;
  required_dependencies_operational?: boolean;
  required_dependency_failure_ids?: string[];
  experience_baseline?: AgentPackageExperienceBaselineReadback;
  specialized_capabilities?: AgentPackageSpecializedCapabilitiesReadback;
  model_projection: AgentPackageCodexModelPolicyProjection | null;
  capability_strategy: AgentPackageFlowCapabilityStrategyProjection | null;
  repair_command: string | null;
  reason: string;
};

export type AgentPackageCapabilityDependency = {
  package_id: string;
  required: boolean;
  dependency_kind: 'hard_runtime_dependency' | 'optional_enhancement';
  version_requirement: string;
  capability_abi: string;
  consumer_profile_id?: string | null;
  required_export_ids: string[];
  required_module_ids: string[];
  bootstrap_manifest_url: string | null;
  dependency_source: AgentPackageManagedVersionCatalogSource | null;
};

export type AgentPackageCapabilityExport = {
  export_id: string;
  skill_id: string;
  install_mode: 'core_required' | 'optional_named_specialty';
};

export type AgentPackageCapabilityConsumerProfile = {
  profile_id: string;
  consumer_agent_id: string;
  required_export_ids: string[];
  required_module_ids: string[];
};

export type AgentPackageCapabilityProvider = {
  capability_abi: string;
  exports: AgentPackageCapabilityExport[];
  module_export_ids: string[];
  consumer_profiles?: AgentPackageCapabilityConsumerProfile[];
};

export type AgentPackageResolvedDependency = {
  package_id: string;
  required: boolean;
  dependency_kind: 'hard_runtime_dependency' | 'optional_enhancement';
  version_requirement: string;
  capability_abi: string;
  consumer_profile_id?: string | null;
  required_export_ids: string[];
  required_module_ids: string[];
  installed_version: string;
  manifest_url: string;
  manifest_sha256: string;
  source_artifact_ref?: string | null;
  artifact_digest?: string | null;
  owner_source_commit?: string | null;
  carrier_authority?: AgentPackageCarrierAuthority | null;
  content_digest: string;
  package_lock_ref: string;
};

export type AgentPackageDependencyReadinessItem = {
  package_id: string;
  required: boolean;
  version_requirement: string;
  capability_abi: string;
  consumer_profile_id: string | null;
  required_export_ids: string[];
  required_module_ids: string[];
  installed_version: string | null;
  manifest_sha256: string | null;
  content_digest: string | null;
  status: 'missing' | 'current' | 'incompatible';
  reasons: string[];
  missing_required_export_ids: string[];
  missing_required_module_ids: string[];
};

export type AgentPackageDependencyReadiness = {
  status: 'missing' | 'current' | 'incompatible';
  operational_ready: boolean;
  dependencies: AgentPackageDependencyReadinessItem[];
};

export type AgentPackageMaterializationReadiness = {
  status: 'not_required' | 'scope_required' | 'missing' | 'current' | 'incompatible';
  scope: 'workspace' | 'quest' | null;
  target_root: string | null;
  required_skill_ids: string[];
  materialized_skill_ids: string[];
  expected_digest: string | null;
  actual_digest: string | null;
  repair_command: string | null;
  core_readiness: {
    status: 'not_required' | 'missing' | 'current' | 'incompatible';
    required_skill_ids: string[];
    materialized_skill_ids: string[];
  };
  specialty_exposure: {
    status: 'not_required' | 'current' | 'degraded';
    declared_skill_ids: string[];
    materialized_skill_ids: string[];
    missing_skill_ids: string[];
  };
};

export type AgentPackageScopeMaterialization = {
  scope: 'workspace' | 'quest';
  target_root: string;
  provider_package_id: string;
  provider_lock_ref: string;
  consumer_profile_id?: string | null;
  transaction_id: string;
  required_skill_ids: string[];
  managed_skill_ids: string[];
  specialty_skill_ids: string[];
  retired_skill_ids: string[];
  skill_digests: Record<string, string>;
  content_digest: string;
  core_digest: string;
  full_export_digest: string;
  materialized_at: string;
};

export type AgentPackageProfileSurfaceConfig = {
  runtime_profile: {
    source_path: string;
    target_id: 'user_agents_profile';
  };
  authoring_sources: Array<{
    source_path: string;
    target_id: 'user_taste_source';
  }>;
  merge_context_paths: string[];
  existing_profile_policy: 'semantic_merge_required';
};

export type AgentPackageProfileMigration = {
  surface_kind: 'opl_package_profile_migration';
  status:
    | 'not_requested'
    | 'validated_no_write'
    | 'installed'
    | 'updated'
    | 'current'
    | 'semantic_merge_required'
    | 'semantic_merge_applied'
    | 'rolled_back'
    | 'retained_on_uninstall';
  source_path: string | null;
  target_path: string | null;
  source_sha256: string | null;
  target_sha256: string | null;
  receipt_path: string | null;
  merge_packet_path: string | null;
  apply_command: string | null;
  authoring_source_paths: string[];
  mutation_actions: Array<{
    surface_kind: 'runtime_profile' | 'authoring_source' | 'profile_receipt';
    operation: 'created' | 'overwritten';
    target_path: string;
    backup_ref: string | null;
    backup_sha256: string | null;
    written_sha256: string;
  }>;
  rollback_backups_retained: boolean;
  writes_performed: boolean;
  note: string;
};

export type AgentPackagePhysicalSurface = {
  surface_kind: 'opl_agent_package_physical_codex_surface';
  status: 'not_requested' | 'validated_no_write' | 'materialized' | 'removed';
  package_id: string;
  plugin_id: string | null;
  marketplace_id: string | null;
  codex_home: string;
  codex_config_path: string;
  codex_config_preexisting: boolean;
  plugin_source_path: string | null;
  plugin_manifest_path: string | null;
  codex_plugin_cache_path: string | null;
  immutable_cache_digest?: string | null;
  marketplace_root: string | null;
  marketplace_path: string | null;
  marketplace_plugin_path: string | null;
  plugin_payload_manifest_url: string | null;
  plugin_payload_manifest_sha256: string | null;
  plugin_payload_cache_path: string | null;
  materialized_required_skill_ids: string[];
  materialized_required_skill_paths: string[];
  removed_paths: string[];
  writes_performed: boolean;
  reload_required: boolean;
  failure_reason: string | null;
  note: string | null;
  profile_config: AgentPackageProfileSurfaceConfig | null;
  profile_migration: AgentPackageProfileMigration;
  managed_policy_config: AgentPackageManagedPolicySurfaceConfig | null;
  workflow_policy_migration: AgentPackageManagedPolicyMigration;
  authority_boundary: AgentPackageAuthorityBoundary;
};

export type AgentPackageLock = {
  surface_kind: 'opl_agent_package_lock';
  package_id: string;
  agent_id: string | null;
  package_role?: AgentPackageRole;
  display_name: string;
  publisher: string;
  version_or_source_digest: string;
  package_version: string;
  owner_language_version: AgentPackageOwnerLanguageVersion | null;
  installed_at: string;
  updated_at: string;
  codex_visible_entry: string;
  bundled_required_skill_ids: string[];
  optional_skill_refs: string[];
  source_kind: AgentPackageSourceKind;
  trust_tier: string;
  rollback_ref: string;
  manifest_url: string;
  manifest_sha256: string;
  source_artifact_ref?: string | null;
  artifact_digest?: string | null;
  owner_source_commit?: string | null;
  carrier_authority?: AgentPackageCarrierAuthority | null;
  release_channel_ref?: string | null;
  release_channel_digest?: string | null;
  oci_ref?: string;
  resolved_digest?: string;
  immutable_tag?: string;
  moving_tag?: 'latest-stable';
  install_truth?: 'resolved_digest_lock';
  permission_scope_sha256: string;
  lock_ref: string;
  physical_surface?: AgentPackagePhysicalSurface;
  exposure_state?: 'visible' | 'hidden' | 'enabled' | 'disabled';
  exposure_updated_at?: string;
  capability_provider: AgentPackageCapabilityProvider | null;
  capability_dependencies: AgentPackageCapabilityDependency[];
  resolved_dependencies: AgentPackageResolvedDependency[];
  dependency_closure_digest: string;
  dependency_transaction_id: string;
  content_digest: string;
  content_lock_canonicalization?:
    | 'ordered_path_nul_file_bytes'
    | 'ordered_path_length_file_length_bytes'
    | null;
  content_lock_paths: string[];
  package_content_digest?: string | null;
  scope_materializations: AgentPackageScopeMaterialization[];
  runtime_source_carrier: AgentPackageManagedRuntimeSourceCarrier | null;
  managed_runtime_source: AgentPackageManagedRuntimeSourceState | null;
  managed_update_source: AgentPackageManagedVersionCatalogSource | null;
  developer_checkout_source?: AgentPackageDeveloperCheckoutSource | null;
};

export type AgentPackageLifecycleReceipt = {
  surface_kind: 'opl_agent_package_lifecycle_receipt';
  receipt_ref: string;
  receipt_status: 'recorded';
  recorded_at: string;
  action: AgentPackageLifecycleAction;
  action_status: 'completed' | 'validated';
  package_id: string | null;
  registry_url: string | null;
  manifest_url: string | null;
  manifest_sha256: string | null;
  source_artifact_ref?: string | null;
  artifact_digest?: string | null;
  owner_source_commit?: string | null;
  carrier_authority?: AgentPackageCarrierAuthority | null;
  release_channel_ref?: string | null;
  release_channel_digest?: string | null;
  package_lock_ref: string | null;
  rollback_ref: string | null;
  source_kind: AgentPackageSourceKind | 'registry_url';
  trust_tier: string | null;
  writes_performed: boolean;
  source_surface: 'opl_connect_agent_package_registry';
  trigger: string;
  initiator: string;
  source_policy: string;
  source_policy_reason: string;
  operation_id: string;
  correlation_id: string;
  authority_boundary: AgentPackageAuthorityBoundary;
  physical_surface?: AgentPackagePhysicalSurface;
  dependency_transaction_id?: string;
  dependency_closure_digest?: string;
  dependency_packages?: Array<{
    package_id: string;
    package_version: string;
    manifest_sha256: string;
    content_digest: string;
    package_lock_ref: string;
    source_artifact_ref?: string | null;
    artifact_digest?: string | null;
    owner_source_commit?: string | null;
    carrier_authority?: AgentPackageCarrierAuthority | null;
    source_kind?: AgentPackageSourceKind;
    developer_checkout_source?: AgentPackageDeveloperCheckoutSource | null;
  }>;
  scope_materialization?: AgentPackageScopeMaterialization;
  scope_materializations?: AgentPackageScopeMaterialization[];
  managed_runtime_source?: AgentPackageManagedRuntimeSourceState | null;
  developer_checkout_source?: AgentPackageDeveloperCheckoutSource | null;
  network_accessed?: false;
  remote_dependency_policy?: 'forbidden';
};

export type AgentPackageUseBinding = {
  surface_kind: 'opl_agent_package_use_binding.v1';
  use_boundary_id: string;
  root_package: {
    package_id: string;
    package_version: string;
    owner_language_version: AgentPackageOwnerLanguageVersion | null;
    package_lock_ref: string;
    manifest_sha256: string;
    content_digest: string;
    source_artifact_ref: string | null;
    artifact_digest: string | null;
    owner_source_commit: string | null;
    carrier_authority: AgentPackageCarrierAuthority | null;
    source_kind?: AgentPackageSourceKind;
    developer_checkout_source?: AgentPackageDeveloperCheckoutSource | null;
  };
  provider_packages: Array<{
    package_id: string;
    package_version: string;
    owner_language_version: AgentPackageOwnerLanguageVersion | null;
    package_lock_ref: string;
    manifest_sha256: string;
    content_digest: string;
    source_artifact_ref: string | null;
    artifact_digest: string | null;
    owner_source_commit: string | null;
    carrier_authority: AgentPackageCarrierAuthority | null;
    source_kind?: AgentPackageSourceKind;
    developer_checkout_source?: AgentPackageDeveloperCheckoutSource | null;
  }>;
  dependency_closure_digest: string;
  source_selection: 'installed_package_lock';
  network_accessed: false;
  remote_dependency_policy: 'forbidden';
  scope: 'workspace' | 'quest';
  target_root: string;
  skill_projection?: AgentPackageSkillProjection | null;
  core_skill_tree_digest: string | null;
  skill_tree_digest: string | null;
  core_readiness: AgentPackageMaterializationReadiness['core_readiness'];
  specialty_exposure: AgentPackageMaterializationReadiness['specialty_exposure'];
};

export type AgentPackageSkillProjection = {
  surface_kind: 'opl_agent_package_skill_projection.v1';
  status: 'materialized' | 'planned_no_write';
  generation_id: string;
  projection_root: string;
  skills_root: string;
  root_package_id: string;
  package_lock_refs: string[];
  root_skill_ids: string[];
  core_skill_ids: string[];
  specialty_skill_ids: string[];
  skill_ids: string[];
  skill_digests: Record<string, string>;
  core_digest: string;
  full_export_digest: string;
};

export type AgentPackageHomeShortcutPreference = {
  shortcut_id: string;
  package_id: string;
  visible: boolean;
  sort_order: number | null;
  source: 'default' | 'user_preference';
  updated_at: string;
  installed: boolean;
};

export type AgentPackageStoredHomeShortcutPreference = {
  shortcut_id: string;
  package_id: string;
  visible: boolean;
  sort_order: number | null;
  source: 'user_preference';
  updated_at: string;
};

export type AgentPackageHomeShortcutPreferenceFile = {
  surface_kind: 'opl_agent_package_home_shortcut_preferences';
  version: 'g1';
  updated_at: string;
  preferences: AgentPackageStoredHomeShortcutPreference[];
};

export type AgentPackageRegistryDocument = {
  registry_url: string;
  registry_sha256: string;
  entries: AgentPackageRegistryEntry[];
};

export type AgentPackageLockIndex = {
  surface_kind: 'opl_agent_package_lock_index';
  version: 'opl-agent-package-lock-index.v1';
  packages: AgentPackageLock[];
};
