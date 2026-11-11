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

export type AgentPackageInstallInput = {
  packageId?: string | null;
  manifestUrl?: string | null;
  trustTier?: 'third_party_unverified' | 'third_party_verified' | null;
  dryRun?: boolean;
};

export type AgentPackageRole =
  | 'standard_agent'
  | 'capability_package'
  | 'workflow_profile';

export type AgentPackageVisibility = 'public' | 'authorized_only';

export type AgentPackageAccessStatus =
  | 'public'
  | 'authorized'
  | 'signed_out'
  | 'forbidden'
  | 'expired'
  | 'revoked'
  | 'unknown';

export type AgentPackageCodexInteractionMode = 'interactive' | 'headless_internal';

export type AgentPackagePackageActionInput = {
  packageId: string;
  dryRun?: boolean;
};

export type AgentPackageRepairInput = AgentPackagePackageActionInput;

export type AgentPackageHomeShortcutPreferencesSetInput = {
  packageId: string;
  shortcutId: string;
  visible?: boolean | null;
  sortOrder?: number | null;
  dryRun?: boolean;
};

export type AgentPackageLocalizedText = Record<string, string>;

export type AgentPackageAppContributionViewType =
  | 'list_detail'
  | 'timeline'
  | 'approval_diff'
  | 'task_board'
  | 'artifact_view'
  | 'activity_log'
  | 'service_status'
  | 'channel_access'
  | 'remote_companion_access';

export type AgentPackageAppContributionUiSlot =
  | 'composer.palette'
  | 'runtime.detail'
  | 'settings.section';

export type AgentPackageAppContributionUiPlacement = {
  contribution_id: string;
  slot: AgentPackageAppContributionUiSlot;
  contribution_kind: 'view' | 'command_group';
  trust_tier: 'declarative' | 'trusted_first_party_renderer';
  scope: 'root' | 'work_item';
  sort_order: number;
  view_id?: string;
  command_ids?: string[];
};

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
  ui?: AgentPackageAppContributionUiPlacement[];
};

export type AgentPackageHomeShortcutRoute = {
  route_kind: 'agent_package_shortcut';
  executor: 'codex_cli';
  codex_visible_entry: string;
};

export type AgentPackageHomeShortcutPresentation = {
  shortcut_id: string;
  icon_id?: string;
  label_i18n: AgentPackageLocalizedText;
  default_visible: boolean;
  user_configurable: boolean;
  route: AgentPackageHomeShortcutRoute;
};

export type AgentPackagePresentation = {
  software_type?: 'agent' | 'application' | 'capability';
  /** Relative, immutable Package asset path. The host must reject remote URLs. */
  icon_ref?: string;
  display_name_i18n: AgentPackageLocalizedText;
  description_i18n: AgentPackageLocalizedText;
  session_routing_summary_i18n: AgentPackageLocalizedText;
  home_shortcuts: AgentPackageHomeShortcutPresentation[];
  miniapp?: AgentPackageMiniAppPresentation;
};

export type AgentPackageMiniAppPresentation = {
  presentation_mode: 'shared_view' | 'dedicated_app' | 'professional_app';
  entry_kind: 'product_entry' | 'runtime_view';
  direct_entry: boolean;
  entry_view_id?: string;
};

export type AgentPackageConfiguredCodexPluginCarrierDescriptor = {
  packageId: string;
  interactionMode?: AgentPackageCodexInteractionMode;
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

export type AgentPackageRuntimeModuleBinding = {
  module_id: string;
  module_kind: string;
  adapter_abi: string;
  profile_ref: string;
  profile_schema_ref: string;
  registry_ref: string;
  registry_schema_ref: string;
  step_schema_ref: string;
  handler: {
    kind: 'typescript_export';
    file: string;
    export: string;
    [key: string]: unknown;
  };
  max_steps: number;
  contained_implementation_files: string[];
  exports: string[];
  [key: string]: unknown;
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
  management_scope: 'local_product' | 'local_component' | 'deployment_target' | 'external_carrier';
  deployment_target: 'cloud' | 'mobile' | 'device' | 'remote_service' | 'unknown' | null;
  publication_channel_admission?: 'admitted' | 'development_only';
  visibility: AgentPackageVisibility;
  access_policy_ref: string | null;
  credential_provider: string | null;
  source_commit: string | null;
  carrier_source_commit: string | null;
  verified_payload_source_commit: string | null;
  codex_surface: Record<string, unknown>;
  codex_default_exposure?: boolean;
  codex_interaction_mode?: AgentPackageCodexInteractionMode;
  skill_packs: Record<string, unknown>[];
  entrypoints: Record<string, unknown>[];
  health_check: Record<string, unknown>;
  permissions: unknown[];
  distribution_payload: AgentPackageDistributionPayload | null;
  update_channel: string;
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
  capability_dependencies: AgentPackageCapabilityDependency[];
  capability_provider: AgentPackageCapabilityProvider | null;
  runtime_module_bindings: AgentPackageRuntimeModuleBinding[];
  content_digest: string | null;
  content_lock_canonicalization: 'ordered_path_length_file_length_bytes' | null;
  content_lock_paths: string[];
  configured_codex_plugin_carrier?: AgentPackageConfiguredCodexPluginCarrierDescriptor | null;
  app_contributions?: AgentPackageAppContributions | null;
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

export type AgentPackageManagedPolicyDetectedConflict = {
  migration_id: string;
  surface_kind: 'plugin' | 'skill' | 'service' | 'config_table' | 'prompt_or_agent' | 'historical_self_carrier';
  canonical_id: string;
  physical_ref: string;
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
  module_id: string;
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
  default_materialized_skill_ids: string[];
  default_materialization_policy: 'all_exported_skills' | 'core_skills_only';
  consumer_profiles?: AgentPackageCapabilityConsumerProfile[];
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

export type AgentPackageWorkspaceSkillRefresh = {
  surface_kind: 'opl_agent_package_workspace_skill_refresh.v1';
  package_id: string;
  status:
    | 'materialized'
    | 'unchanged'
    | 'planned_no_write'
    | 'not_installed'
    | 'attention_needed';
  reason: string | null;
  generation_id: string | null;
  root_skill_ids: string[];
  skill_ids: string[];
  target_workspace: string | null;
  workspace_skills_root: string | null;
  writes_performed: boolean;
  projection: AgentPackageSkillProjection | null;
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

import type { AgentPackageSkillProjection } from '../../../kernel/agent-package-skill-projection.ts';

export type { AgentPackageSkillProjection } from '../../../kernel/agent-package-skill-projection.ts';
