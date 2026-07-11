import type { ManagedUpdateOwnerRoute } from '../managed-update-owner-boundary.ts';

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

export type AgentPackageLifecycleAction =
  | 'registry_refresh'
  | 'manifest_validate'
  | 'install'
  | 'update'
  | 'repair'
  | 'uninstall'
  | 'hide'
  | 'unhide'
  | 'enable'
  | 'disable'
  | 'home_shortcut_preferences_set';

export type AgentPackageLifecycleCondition = {
  condition_id:
    | 'package_lock_present'
    | 'package_not_installed'
    | 'physical_surface_materialized'
    | 'physical_surface_not_requested'
    | 'physical_surface_removed'
    | 'codex_reload_required';
  package_id: string | null;
  status: 'ok' | 'attention_needed';
  reason: string;
  action_ref: string | null;
};

export type AgentPackageLifecycleUxReadback = {
  status: 'available' | 'installed' | 'not_installed' | 'validated_no_write' | 'attention_needed';
  conditions: AgentPackageLifecycleCondition[];
  recommended_action: string | null;
  lifecycle_action_refs: AgentPackageLifecycleAction[];
};

export type AgentPackageRegistryRefreshInput = {
  registryUrl: string;
};

export type AgentPackageManifestValidateInput = {
  manifestUrl?: string | null;
  registryUrl?: string | null;
  packageId?: string | null;
  trustTier?: string | null;
  sourceKind?: AgentPackageSourceKind | null;
};

export type AgentPackageInstallInput = AgentPackageManifestValidateInput & {
  dryRun?: boolean;
  agentRoot?: string | null;
};

export type AgentPackagePackageActionInput = {
  packageId: string;
  dryRun?: boolean;
  agentRoot?: string | null;
};

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
};

export type AgentPackageRegistryEntry = {
  package_id: string;
  display_name: string;
  publisher: string;
  source: string;
  manifest_url: string;
  latest_version: string;
  trust_tier: string;
  starter_default: boolean;
  codex_visible_entry: string | null;
  required_skill_ids: string[];
  optional_skill_ids: string[];
  home_shortcut_ids: string[];
  display_policy: string | null;
  ordinary_user_source: AgentPackageOrdinaryUserSource | null;
};

export type AgentPackageOrdinaryUserSource = {
  kind: 'ghcr_oci_artifact_rolling_latest';
  artifact_ref: string;
  ordinary_user_ref: string;
  immutable_version_ref: string;
  latest_is_only_ordinary_user_channel: true;
  install_truth: string[];
  latest_is_install_truth: false;
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
  rolling_tag: 'latest';
  promotion_policy: 'daily_candidate_gates_then_promote_latest';
  install_truth: 'resolved_digest_lock';
};

export type AgentPackageManifest = {
  package_id: string;
  agent_id: string;
  display_name: string;
  publisher: string;
  version: string;
  source: string;
  codex_surface: Record<string, unknown>;
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
  plugin_id: string | null;
  plugin_source_path: string | null;
  plugin_payload_manifest_url: string | null;
  plugin_payload_manifest_sha256: string | null;
  plugin_payload_cache_path: string | null;
};

export type AgentPackagePhysicalSurface = {
  surface_kind: 'opl_agent_package_physical_codex_surface';
  status: 'not_requested' | 'validated_no_write' | 'materialized' | 'removed';
  package_id: string;
  plugin_id: string | null;
  marketplace_id: string | null;
  codex_home: string;
  codex_config_path: string;
  plugin_source_path: string | null;
  plugin_manifest_path: string | null;
  codex_plugin_cache_path: string | null;
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
  authority_boundary: AgentPackageAuthorityBoundary;
};

export type AgentPackageDescriptorReadback = {
  manifest_url: string | null;
  manifest_sha256: string | null;
  registry_url: string | null;
  package_version: string | null;
  rollback_ref: string | null;
  source_kind: AgentPackageLifecycleReceipt['source_kind'] | AgentPackageSourceKind | null;
  trust_tier: string | null;
};

export type AgentPackageDigestReadback = {
  manifest_sha256: string | null;
  version_or_source_digest: string | null;
  plugin_payload_manifest_sha256: string | null;
  resolved_digest: string | null;
  install_truth: string | null;
  content_identity_fields: string[];
};

export type AgentPackageLockReadback = {
  package_lock_ref: string | null;
  lifecycle_receipt_ref: string | null;
  lock_file: string;
  lifecycle_ledger_file: string;
};

export type AgentPackageCarrierAdapterReadback = {
  adapter_kind: 'codex_plugin_carrier';
  carrier: 'codex_plugin';
  source_surface: 'codex_surface';
  projection_role: 'package_carrier_adapter';
  owns_package_core: false;
  owns_domain_truth: false;
  status: AgentPackagePhysicalSurface['status'];
  plugin_id: string | null;
  plugin_source_path: string | null;
  plugin_manifest_path: string | null;
  codex_plugin_cache_path: string | null;
  plugin_payload_manifest_url: string | null;
  plugin_payload_manifest_sha256: string | null;
  plugin_payload_cache_path: string | null;
  materialized_required_skill_ids: string[];
  materialized_required_skill_paths: string[];
  writes_performed: boolean;
  reload_required: boolean;
  failure_reason: string | null;
};

export type AgentPackageLock = {
  surface_kind: 'opl_agent_package_lock';
  package_id: string;
  agent_id: string;
  display_name: string;
  publisher: string;
  version_or_source_digest: string;
  package_version: string;
  installed_at: string;
  updated_at: string;
  codex_visible_entry: string;
  bundled_required_skill_ids: string[];
  optional_skill_refs: string[];
  source_kind: AgentPackageSourceKind;
  trust_tier: string;
  action_receipt_id: string;
  rollback_ref: string;
  manifest_url: string;
  manifest_sha256: string;
  oci_ref?: string;
  resolved_digest?: string;
  immutable_tag?: string;
  rolling_tag?: 'latest';
  install_truth?: 'resolved_digest_lock';
  permission_scope_sha256: string;
  lock_ref: string;
  physical_surface?: AgentPackagePhysicalSurface;
  exposure_state?: 'visible' | 'hidden' | 'enabled' | 'disabled';
  exposure_updated_at?: string;
};

export type AgentPackageCoreReadback = {
  core_kind: 'opl_agent_package_core';
  package_id: string;
  descriptor: AgentPackageDescriptorReadback;
  digest: AgentPackageDigestReadback;
  dependencies: {
    required_skill_ids: string[];
    optional_skill_refs: string[];
  };
  trust: {
    trust_tier: string | null;
  };
  lock: AgentPackageLockReadback;
  lifecycle: {
    latest_receipt_ref: string | null;
    latest_action: AgentPackageLifecycleAction | null;
    status: AgentPackageLifecycleUxReadback['status'];
    conditions: AgentPackageLifecycleCondition[];
    recommended_action: string | null;
    action_refs: AgentPackageLifecycleAction[];
  };
  exposure: {
    state: AgentPackageLock['exposure_state'] | null;
  };
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
  package_lock_ref: string | null;
  rollback_ref: string | null;
  source_kind: AgentPackageSourceKind | 'registry_url';
  trust_tier: string | null;
  writes_performed: boolean;
  source_surface: 'opl_connect_agent_package_registry';
  authority_boundary: AgentPackageAuthorityBoundary;
  physical_surface?: AgentPackagePhysicalSurface;
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

export type AgentPackageHomeShortcutPreferenceFile = {
  surface_kind: 'opl_agent_package_home_shortcut_preferences';
  version: 'g1';
  updated_at: string;
  preferences: AgentPackageHomeShortcutPreference[];
};

export type AgentPackageRegistryCache = {
  surface_kind: 'opl_agent_package_registry_cache';
  version: 'opl-agent-package-registry-cache.v1';
  refreshed_at: string;
  registry_url: string;
  registry_sha256: string;
  entry_count: number;
  entries: AgentPackageRegistryEntry[];
};

export type AgentPackageLockIndex = {
  surface_kind: 'opl_agent_package_lock_index';
  version: 'opl-agent-package-lock-index.v1';
  packages: AgentPackageLock[];
};

export type AgentPackageLifecycleLedger = {
  surface_kind: 'opl_agent_package_lifecycle_ledger';
  version: 'opl-agent-package-lifecycle-ledger.v1';
  receipts: AgentPackageLifecycleReceipt[];
};

export type AgentPackageOwnerRouteReadbackItem = {
  package_id: string;
  descriptor: AgentPackageDescriptorReadback;
  digest: AgentPackageDigestReadback;
  lock: AgentPackageLockReadback;
  materializer: {
    status: AgentPackagePhysicalSurface['status'];
    plugin_id: string | null;
    plugin_source_path: string | null;
    plugin_manifest_path: string | null;
    codex_plugin_cache_path: string | null;
    plugin_payload_manifest_url: string | null;
    plugin_payload_manifest_sha256: string | null;
    plugin_payload_cache_path: string | null;
    materialized_required_skill_ids: string[];
    materialized_required_skill_paths: string[];
    writes_performed: boolean;
    reload_required: boolean;
    failure_reason: string | null;
  };
  lifecycle_ux: AgentPackageLifecycleUxReadback;
  package_core: AgentPackageCoreReadback;
  carrier_adapters: AgentPackageCarrierAdapterReadback[];
  authority_boundary: AgentPackageAuthorityBoundary;
};

export type AgentPackageOwnerRouteReadback = {
  surface_kind: 'opl_agent_package_owner_route_readback';
  owner_route: ManagedUpdateOwnerRoute;
  command_refs: {
    list: string;
    status: string;
    apply: string;
    repair: string;
  };
  selected_package_id: string | null;
  package_count: number;
  packages: AgentPackageOwnerRouteReadbackItem[];
  no_package_manager_boundary: {
    package_manager_claim: false;
    clean_managed_scope: 'clean_opl_managed_module_roots_only';
    forbidden_claims: string[];
  };
  authority_boundary: AgentPackageAuthorityBoundary;
};
