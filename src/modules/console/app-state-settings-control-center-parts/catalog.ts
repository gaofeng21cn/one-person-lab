import {
  MANAGED_UPDATE_OWNER_ACTIONS,
  listAgentPackageSettingsActions,
  managedUpdateCommand,
} from '../../connect/index.ts';

export type SettingsActionTaskKind =
  | 'read'
  | 'repair'
  | 'sync'
  | 'apply'
  | 'reload'
  | 'cleanup_plan'
  | 'configure'
  | 'verify'
  | 'check'
  | 'refresh'
  | 'install'
  | 'uninstall'
  | 'create'
  | 'update'
  | 'delete'
  | 'test'
  | 'set_default'
  | typeof MANAGED_UPDATE_OWNER_ACTIONS.revert;

export type SettingsAction = {
  action_id: string;
  stable_id: string;
  label: string;
  section_id: string;
  task_kind: SettingsActionTaskKind;
  taxonomy: string;
  delegated_surface: string;
  payload_fields: string[];
  mutates: string;
  dry_run_supported: boolean;
  confirmation_required: boolean;
  danger_level: 'none' | 'low' | 'medium' | 'high';
  impact: string;
  follow_up_action_ids: string[];
  rollback_action_id?: string;
  verify_action_id?: string;
};

export type SettingsSection = {
  section_id: string;
  label: string;
  description: string;
  state: string;
  source_ref: string;
};

export type SettingsControlCenterGroup = {
  group_id: string;
  label: string;
  role: string;
  route_id: string;
  action_section_ids: string[];
  ordinary_entry_policy: string;
};

export type SettingsSecondaryRoute = {
  route_id: string;
  group_id: string;
  parent_route_id: string;
  label: string;
  role: string;
  action_section_ids: string[];
  ordinary_entry_policy: string;
};

export type ConsumerOnlyTruthSurface = {
  surface: string;
  owner: string;
  truth_owner: string;
  app_aion_role: string;
  local_truth_allowed: false;
  current_source_ref: string;
  delegated_action_id: string | null;
  receipt_ref_or_typed_blocker_ref: string | null;
  blocked_reason: string | null;
  required_visible_refs: string[];
  app_owner_receipt_ref_or_typed_blocker_ref?: string | null;
  current_owner_delta_ref?: string;
  runtime_status_source_ref?: string;
  owner_route_ref?: string;
  package_descriptor_ref?: string;
  cleanup_lane_ref?: string;
  domain_owner_decision_ref_or_typed_blocker_ref?: string | null;
};

export const SETTINGS_CONTROL_CENTER_CONTRACT_REF =
  'contracts/opl-framework/settings-control-center-action-read-model-contract.json';

export const APP_AION_ALLOWED_LOCAL_SCHEDULER_ROLES = [
  'refresh_trigger',
  'ui_maintenance',
  'poll_existing_read_model',
] as const;

export const APP_AION_FORBIDDEN_LOCAL_SCHEDULER_ROLES = [
  'write_policy_truth',
  'write_currentness_truth',
  'write_runtime_truth',
  'write_release_truth',
  'write_domain_private_platform_truth',
  'create_owner_receipt',
  'create_typed_blocker',
] as const;

export const APP_AION_FORBIDDEN_TRUTH_ONLY_PATHS = [
  'aion_shell_settings_store_as_policy_truth',
  'aion_local_scheduler_as_update_truth',
  'app_local_read_model_as_runtime_truth_without_opl_source_ref',
  'shell_docker_probe_as_runtime_ready_claim',
  'gui_release_status_without_app_owner_receipt_or_typed_blocker',
  'private_platform_cleanup_lane_as_ordinary_settings_status',
] as const;

export const APP_AION_REQUIRED_USER_VISIBLE_BOUNDARY_FIELDS = [
  'owner',
  'current_source_ref',
  'blocked_reason',
  'receipt_ref_or_typed_blocker_ref',
  'delegated_action_id',
] as const;

export const APP_AION_CONSUMER_ONLY_AUTHORITY_BOUNDARY = {
  app_aion_can_write_policy_truth: false,
  app_aion_can_write_runtime_truth: false,
  app_aion_can_write_release_truth: false,
  app_aion_can_write_domain_truth: false,
  app_aion_can_create_owner_receipt: false,
  app_aion_can_create_typed_blocker: false,
  app_aion_can_authorize_private_platform_cleanup: false,
  app_aion_can_claim_app_release_ready: false,
  app_aion_can_claim_production_ready: false,
} as const;

export const APP_AION_CONSUMER_ONLY_TRUTH_SURFACES: ConsumerOnlyTruthSurface[] = [
  {
    surface: 'settings_policy',
    owner: 'one-person-lab',
    truth_owner: 'one-person-lab framework settings_control_center contract plus one-person-lab-app product contract',
    app_aion_role: 'render read model and route listed actions',
    local_truth_allowed: false,
    current_source_ref: 'app_state.settings_control_center.contract_ref',
    delegated_action_id: 'app_state.settings_control_center.allowed_action_ids',
    receipt_ref_or_typed_blocker_ref: null,
    blocked_reason: null,
    required_visible_refs: ['owner', 'current_source_ref', 'delegated_action_id'],
  },
  {
    surface: 'app_release_and_installer',
    owner: 'one-person-lab-app',
    truth_owner: 'one-person-lab-app release owner',
    app_aion_role: 'display release owner status, blocker, or receipt ref',
    local_truth_allowed: false,
    current_source_ref: 'app_state.release',
    delegated_action_id: 'settings_check_app_update',
    receipt_ref_or_typed_blocker_ref: null,
    app_owner_receipt_ref_or_typed_blocker_ref: null,
    blocked_reason: 'app_owner_receipt_or_typed_blocker_required_before_release_currentness_claim',
    required_visible_refs: [
      'app_owner_receipt_ref_or_typed_blocker_ref',
      'current_source_ref',
      'blocked_reason',
    ],
  },
  {
    surface: 'runtime_provider_and_stage_status',
    owner: 'one-person-lab',
    truth_owner: 'one-person-lab Runway, StageRun, Temporal provider, and current_owner_delta read model',
    app_aion_role: 'consume opl app state fast/full or explicit operator detail readback',
    local_truth_allowed: false,
    current_source_ref: 'app_state.operator.current_owner_delta_read_model',
    delegated_action_id: 'runtime_operator_detail_readback',
    receipt_ref_or_typed_blocker_ref: null,
    blocked_reason: null,
    current_owner_delta_ref: 'app_state.operator.current_owner_delta',
    runtime_status_source_ref: 'app_state.provider.temporal',
    owner_route_ref: 'app_state.operator.current_owner_delta_read_model.owner_route',
    required_visible_refs: [
      'current_owner_delta_ref',
      'runtime_status_source_ref',
      'owner_route_ref',
    ],
  },
  {
    surface: 'managed_module_and_capability_packages',
    owner: 'one-person-lab',
    truth_owner: 'one-person-lab Pack/Connect package channel and managed update receipt projection',
    app_aion_role: 'show package source, owner, action, and receipt/blocker refs',
    local_truth_allowed: false,
    current_source_ref: 'app_state.modules.source',
    delegated_action_id: 'settings_sync_capabilities',
    receipt_ref_or_typed_blocker_ref: null,
    blocked_reason: 'managed_update_receipt_or_typed_blocker_required_before_package_currentness_claim',
    package_descriptor_ref: 'app_state.modules.items',
    required_visible_refs: [
      'package_descriptor_ref',
      'receipt_ref_or_typed_blocker_ref',
      'delegated_action_id',
    ],
  },
  {
    surface: 'domain_private_platform_residue',
    owner: 'domain-owner-via-private-platform-cleanup-lane',
    truth_owner: 'wrapper-retirement-gate-policy private_platform_cleanup_lane plus domain owner decision',
    app_aion_role: 'developer/operator detail only; never default Settings or first-screen truth',
    local_truth_allowed: false,
    current_source_ref: 'contracts/opl-framework/domain-private-platform-tail-matrix.json',
    delegated_action_id: null,
    receipt_ref_or_typed_blocker_ref: null,
    blocked_reason: 'domain_owner_decision_required_before_private_platform_cleanup_status_claim',
    cleanup_lane_ref: 'contracts/opl-framework/domain-private-platform-tail-matrix.json',
    domain_owner_decision_ref_or_typed_blocker_ref: null,
    required_visible_refs: [
      'cleanup_lane_ref',
      'domain_owner_decision_ref_or_typed_blocker_ref',
    ],
  },
];

export const SETTINGS_CONTROL_CENTER_GROUPS: SettingsControlCenterGroup[] = [
  {
    group_id: 'overview',
    label: 'Overview',
    role: 'control_center_summary',
    route_id: 'general',
    action_section_ids: ['model_access', 'connections', 'docker_webui', 'workspace', 'capabilities', 'packages', 'updates', 'runtime_roots'],
    ordinary_entry_policy: 'top_level_control_center_route',
  },
  {
    group_id: 'setup_access',
    label: 'Setup & Access',
    role: 'connect_models_accounts_workspace_web_remote',
    route_id: 'access',
    action_section_ids: ['model_access', 'connections', 'docker_webui', 'workspace', 'codex_surface'],
    ordinary_entry_policy: 'top_level_control_center_route',
  },
  {
    group_id: 'capabilities',
    label: 'Capabilities',
    role: 'managed_agents_capability_status_and_tools',
    route_id: 'capabilities',
    action_section_ids: ['capabilities', 'codex_surface'],
    ordinary_entry_policy: 'top_level_control_center_route',
  },
  {
    group_id: 'maintenance_updates',
    label: 'Maintenance & Updates',
    role: 'updates_packages_repairs_service_health',
    route_id: 'environment',
    action_section_ids: ['docker_webui', 'packages', 'updates', 'capabilities', 'runtime_roots'],
    ordinary_entry_policy: 'top_level_control_center_route',
  },
  {
    group_id: 'data_storage',
    label: 'Data & Storage',
    role: 'local_data_lifecycle_and_safe_cleanup',
    route_id: 'storage',
    action_section_ids: ['runtime_roots'],
    ordinary_entry_policy: 'top_level_control_center_route',
  },
  {
    group_id: 'preferences',
    label: 'Preferences',
    role: 'appearance_language_startup_behavior',
    route_id: 'appearance',
    action_section_ids: [],
    ordinary_entry_policy: 'top_level_control_center_route',
  },
  {
    group_id: 'advanced',
    label: 'Advanced',
    role: 'developer_diagnostics_versions_links_raw_refs',
    route_id: 'advanced',
    action_section_ids: ['codex_surface', 'updates'],
    ordinary_entry_policy: 'top_level_control_center_route',
  },
];

export const SETTINGS_CONTROL_CENTER_SECONDARY_ROUTES: SettingsSecondaryRoute[] = [
  {
    route_id: 'workspace',
    group_id: 'overview',
    parent_route_id: 'general',
    label: 'Workspace',
    role: 'workspace_root_permissions_and_user_work_product_location',
    action_section_ids: ['workspace', 'runtime_roots'],
    ordinary_entry_policy: 'secondary_page_under_overview_task_entry',
  },
  {
    route_id: 'local-services',
    group_id: 'maintenance_updates',
    parent_route_id: 'environment',
    label: 'Local Services',
    role: 'codex_temporal_background_services_and_capability_pack_health',
    action_section_ids: ['docker_webui', 'codex_surface', 'capabilities', 'packages'],
    ordinary_entry_policy: 'secondary_page_under_maintenance_updates',
  },
  {
    route_id: 'about',
    group_id: 'advanced',
    parent_route_id: 'advanced',
    label: 'About',
    role: 'version_links_and_release_notes',
    action_section_ids: ['updates'],
    ordinary_entry_policy: 'secondary_page_under_advanced',
  },
  {
    route_id: 'update',
    group_id: 'maintenance_updates',
    parent_route_id: 'environment',
    label: 'Update',
    role: 'app_update_status_and_post_update_guidance',
    action_section_ids: ['updates'],
    ordinary_entry_policy: 'secondary_page_under_maintenance_updates',
  },
  {
    route_id: 'theme',
    group_id: 'preferences',
    parent_route_id: 'appearance',
    label: 'Theme',
    role: 'appearance_theme_preferences',
    action_section_ids: [],
    ordinary_entry_policy: 'secondary_page_under_preferences',
  },
];

export const SETTINGS_CONTROL_CENTER_ACTION_SECTIONS: SettingsSection[] = [
  {
    section_id: 'model_access',
    label: 'Model access',
    description: 'Codex CLI, configured model profile, API key presence, and Developer Mode authority.',
    state: 'available',
    source_ref: 'app_state.core.codex + app_state.developer_mode',
  },
  {
    section_id: 'workspace',
    label: 'Workspace',
    description: 'Workspace root, health readback, and user-safe validation entrypoints.',
    state: 'available',
    source_ref: 'app_state.paths + app_state.actions#workspace_health',
  },
  {
    section_id: 'connections',
    label: 'Connections',
    description: 'Framework-owned connection registry with credential handles and typed configuration status.',
    state: 'available',
    source_ref: 'app_state.settings_control_center.connection_registry',
  },
  {
    section_id: 'capabilities',
    label: 'Agents and capabilities',
    description: 'Managed OPL modules, generated assistants, and capability sync actions.',
    state: 'available',
    source_ref: 'app_state.modules + app_state.assistants',
  },
  {
    section_id: 'packages',
    label: 'OPL packages',
    description: 'Module package channel, release channel, and install/update actions.',
    state: 'available',
    source_ref: 'app_state.modules + app_state.release',
  },
  {
    section_id: 'codex_surface',
    label: 'Codex surface',
    description: 'Codex-visible skill/plugin metadata refresh routes.',
    state: 'available',
    source_ref: 'app_state.actions#settings_reload_codex_surface',
  },
  {
    section_id: 'docker_webui',
    label: 'Docker WebUI',
    description: 'One-click install, Codex API key setup, image seed selection, startup maintenance, browser entry, and read-only recovery diagnostics.',
    state: 'available',
    source_ref: 'opl install + opl system configure-codex + opl system startup-maintenance + opl system docker-webui doctor',
  },
  {
    section_id: 'updates',
    label: 'Updates',
    description: 'App update checks, managed update projection, reload guidance, and explicit previous-version planning.',
    state: 'available',
    source_ref: 'opl update status/check + app_state.release',
  },
  {
    section_id: 'runtime_roots',
    label: 'Runtime roots',
    description: 'Workspace root, modules root, state root, and non-mutating cleanup planning.',
    state: 'available',
    source_ref: 'app_state.paths',
  },
];

export const SETTINGS_CONTROL_CENTER_ACTIONS: SettingsAction[] = [
  {
    action_id: 'connection_list',
    stable_id: 'connection_list',
    label: 'List connections',
    section_id: 'connections',
    task_kind: 'read',
    taxonomy: 'settings.connections.list',
    delegated_surface: 'opl connect connections list',
    payload_fields: [],
    mutates: 'none_read_only',
    dry_run_supported: true,
    confirmation_required: false,
    danger_level: 'none',
    impact: 'Reads the Framework-owned connection registry without resolving credential values.',
    follow_up_action_ids: [],
  },
  {
    action_id: 'connection_create',
    stable_id: 'connection_create',
    label: 'Create connection',
    section_id: 'connections',
    task_kind: 'create',
    taxonomy: 'settings.connections.create',
    delegated_surface: 'opl connect connections create',
    payload_fields: ['connection_id', 'name', 'connection_type', 'endpoint', 'credential_handle', 'disabled'],
    mutates: 'opl_connection_registry',
    dry_run_supported: false,
    confirmation_required: true,
    danger_level: 'low',
    impact: 'Stores connection metadata and an owner-backed credential handle; secret values are forbidden.',
    follow_up_action_ids: ['connection_test'],
    verify_action_id: 'connection_list',
  },
  {
    action_id: 'connection_update',
    stable_id: 'connection_update',
    label: 'Update connection',
    section_id: 'connections',
    task_kind: 'update',
    taxonomy: 'settings.connections.update',
    delegated_surface: 'opl connect connections update',
    payload_fields: ['connection_id', 'name', 'connection_type', 'endpoint', 'credential_handle', 'disabled'],
    mutates: 'opl_connection_registry',
    dry_run_supported: false,
    confirmation_required: true,
    danger_level: 'low',
    impact: 'Updates connection metadata and resets configuration status without resolving credential values.',
    follow_up_action_ids: ['connection_test'],
    verify_action_id: 'connection_list',
  },
  {
    action_id: 'connection_delete',
    stable_id: 'connection_delete',
    label: 'Delete connection',
    section_id: 'connections',
    task_kind: 'delete',
    taxonomy: 'settings.connections.delete',
    delegated_surface: 'opl connect connections delete',
    payload_fields: ['connection_id'],
    mutates: 'opl_connection_registry',
    dry_run_supported: false,
    confirmation_required: true,
    danger_level: 'medium',
    impact: 'Deletes non-default connection metadata only; credential owner state is not modified.',
    follow_up_action_ids: ['connection_list'],
    verify_action_id: 'connection_list',
  },
  {
    action_id: 'connection_test',
    stable_id: 'connection_test',
    label: 'Test connection configuration',
    section_id: 'connections',
    task_kind: 'test',
    taxonomy: 'settings.connections.test',
    delegated_surface: 'opl connect connections test',
    payload_fields: ['connection_id'],
    mutates: 'opl_connection_registry_status',
    dry_run_supported: false,
    confirmation_required: false,
    danger_level: 'none',
    impact: 'Checks endpoint syntax and credential-owner availability without returning request or secret material.',
    follow_up_action_ids: [],
    verify_action_id: 'connection_list',
  },
  {
    action_id: 'connection_set_default',
    stable_id: 'connection_set_default',
    label: 'Set default connection',
    section_id: 'connections',
    task_kind: 'set_default',
    taxonomy: 'settings.connections.set_default',
    delegated_surface: 'opl connect connections set_default',
    payload_fields: ['connection_id'],
    mutates: 'opl_connection_registry',
    dry_run_supported: false,
    confirmation_required: true,
    danger_level: 'low',
    impact: 'Selects a non-disabled registry entry as the Framework default connection.',
    follow_up_action_ids: ['connection_list'],
    verify_action_id: 'connection_list',
  },
  {
    action_id: 'settings_repair_model_access',
    stable_id: 'repair_model_access',
    label: 'Repair model access',
    section_id: 'model_access',
    task_kind: 'repair',
    taxonomy: 'settings.model_access.repair',
    delegated_surface: 'opl system developer-supervisor',
    payload_fields: [
      'developerSupervisorEnabled',
      'developerSupervisorMode',
      'developerSupervisorAutoEnableGithubLogin',
    ],
    mutates: 'opl_developer_supervisor_config',
    dry_run_supported: true,
    confirmation_required: true,
    danger_level: 'medium',
    impact: 'May update the OPL Developer Mode supervisor config used for model-access and repository repair routing.',
    follow_up_action_ids: ['developer_supervisor_refresh'],
    verify_action_id: 'developer_supervisor_refresh',
  },
  {
    action_id: 'settings_verify_workspace',
    stable_id: 'verify_workspace',
    label: 'Verify workspace',
    section_id: 'workspace',
    task_kind: 'verify',
    taxonomy: 'settings.workspace.verify',
    delegated_surface: 'opl workspace health',
    payload_fields: ['workspace_path'],
    mutates: 'none_read_only',
    dry_run_supported: true,
    confirmation_required: false,
    danger_level: 'none',
    impact: 'Reads workspace health and generated OPL workspace projections without writing domain truth or owner receipts.',
    follow_up_action_ids: [],
    verify_action_id: 'workspace_health',
  },
  {
    action_id: 'settings_sync_capabilities',
    stable_id: 'sync_capabilities',
    label: 'Sync capabilities',
    section_id: 'capabilities',
    task_kind: 'sync',
    taxonomy: 'settings.capabilities.sync',
    delegated_surface: managedUpdateCommand('apply', 'capability_packages', { json: false }),
    payload_fields: [],
    mutates: 'opl_module_checkout',
    dry_run_supported: true,
    confirmation_required: false,
    danger_level: 'low',
    impact: 'Runs the unified managed update coordinator for clean OPL-managed capability package roots and derived capability exposure.',
    follow_up_action_ids: ['provider_scheduler_status', 'settings_reload_codex_surface'],
    verify_action_id: 'provider_scheduler_status',
  },
  {
    action_id: 'settings_apply_opl_packages',
    stable_id: 'apply_opl_packages',
    label: 'Apply OPL packages',
    section_id: 'packages',
    task_kind: 'apply',
    taxonomy: 'settings.packages.apply',
    delegated_surface: managedUpdateCommand('apply', 'capability_packages', { json: false }),
    payload_fields: [],
    mutates: 'opl_module_checkout',
    dry_run_supported: true,
    confirmation_required: true,
    danger_level: 'medium',
    impact: 'Applies package-channel updates through the managed update coordinator; module update primitives stay behind the capability_packages adapter.',
    follow_up_action_ids: ['settings_reload_codex_surface', 'provider_scheduler_status'],
    rollback_action_id: 'settings_rollback_runtime_substrate',
    verify_action_id: 'provider_scheduler_status',
  },
  ...listAgentPackageSettingsActions(),
  {
    action_id: 'settings_reload_codex_surface',
    stable_id: 'reload_codex_surface',
    label: 'Reload Codex surface',
    section_id: 'codex_surface',
    task_kind: 'reload',
    taxonomy: 'settings.codex_surface.reload',
    delegated_surface: 'opl connect sync-skills --domain mas-scholar-skills --scope <workspace|quest>',
    payload_fields: ['scope', 'target_path'],
    mutates: 'opl_codex_visible_skill_projection',
    dry_run_supported: true,
    confirmation_required: true,
    danger_level: 'low',
    impact: 'Regenerates Codex-visible skill/plugin projection for an explicit workspace or quest target.',
    follow_up_action_ids: ['developer_supervisor_refresh'],
    verify_action_id: 'developer_supervisor_refresh',
  },
  {
    action_id: 'settings_check_app_update',
    stable_id: 'check_app_update',
    label: 'Check App update',
    section_id: 'updates',
    task_kind: 'check',
    taxonomy: 'settings.updates.check_app_update',
    delegated_surface: managedUpdateCommand('status', 'installation_carrier', { json: false }),
    payload_fields: [],
    mutates: 'none_read_only',
    dry_run_supported: true,
    confirmation_required: false,
    danger_level: 'none',
    impact: 'Reads the installation carrier projection through the managed update coordinator; App release truth remains App-owned and outside Framework apply.',
    follow_up_action_ids: ['settings_reload_codex_surface'],
    verify_action_id: 'settings_check_app_update',
  },
  {
    action_id: 'settings_prune_runtime_roots_dry_run',
    stable_id: 'prune_runtime_roots_dry_run',
    label: 'Plan runtime roots cleanup',
    section_id: 'runtime_roots',
    task_kind: 'cleanup_plan',
    taxonomy: 'settings.runtime_roots.cleanup_plan',
    delegated_surface: 'opl app action execute --action settings_prune_runtime_roots_dry_run',
    payload_fields: [],
    mutates: 'none_read_only',
    dry_run_supported: true,
    confirmation_required: false,
    danger_level: 'low',
    impact: 'Reports runtime root cleanup candidates only; it never deletes runtime roots.',
    follow_up_action_ids: [],
    verify_action_id: 'settings_prune_runtime_roots_dry_run',
  },
  {
    action_id: 'settings_rollback_runtime_substrate',
    stable_id: 'rollback_runtime_substrate',
    label: 'Plan runtime substrate restore',
    section_id: 'updates',
    task_kind: MANAGED_UPDATE_OWNER_ACTIONS.revert,
    taxonomy: 'settings.updates.rollback_runtime_substrate',
    delegated_surface: managedUpdateCommand(MANAGED_UPDATE_OWNER_ACTIONS.revert, 'runtime_substrate', { json: false }),
    payload_fields: ['receipt_ref'],
    mutates: 'none_read_only',
    dry_run_supported: true,
    confirmation_required: true,
    danger_level: 'high',
    impact: 'Projects the explicit previous-runtime restore route; actual pointer restore stays behind the managed update authority.',
    follow_up_action_ids: ['settings_check_app_update', 'settings_reload_codex_surface'],
    verify_action_id: 'settings_check_app_update',
  },
  {
    action_id: 'settings_install_docker_webui',
    stable_id: 'install_docker_webui',
    label: 'Install Docker WebUI',
    section_id: 'docker_webui',
    task_kind: 'apply',
    taxonomy: 'settings.docker_webui.install',
    delegated_surface: 'opl install',
    payload_fields: [],
    mutates: 'opl_framework_install_surface',
    dry_run_supported: true,
    confirmation_required: true,
    danger_level: 'medium',
    impact: 'Runs the existing OPL install route for Codex, provider profile, modules, skills, and GUI/WebUI entrypoints without defining WebUI release truth.',
    follow_up_action_ids: ['settings_configure_webui_api_key', 'settings_run_webui_startup_maintenance', 'settings_diagnose_docker_webui'],
    verify_action_id: 'settings_diagnose_docker_webui',
  },
  {
    action_id: 'settings_configure_webui_api_key',
    stable_id: 'configure_webui_api_key',
    label: 'Configure WebUI API key',
    section_id: 'docker_webui',
    task_kind: 'configure',
    taxonomy: 'settings.docker_webui.configure_api_key',
    delegated_surface: 'printf <api-key> | opl system configure-codex --api-key-stdin',
    payload_fields: [],
    mutates: 'local_codex_provider_config',
    dry_run_supported: true,
    confirmation_required: true,
    danger_level: 'medium',
    impact: 'Points the operator to the existing stdin-only Codex config route; Settings must not carry API keys in JSON payloads or logs.',
    follow_up_action_ids: ['settings_run_webui_startup_maintenance', 'settings_diagnose_docker_webui'],
    verify_action_id: 'settings_diagnose_docker_webui',
  },
  {
    action_id: 'settings_select_webui_seed',
    stable_id: 'select_webui_seed',
    label: 'Select WebUI image seed',
    section_id: 'docker_webui',
    task_kind: 'configure',
    taxonomy: 'settings.docker_webui.select_seed',
    delegated_surface: 'OPL_IMAGE_MANIFEST_PATH=<manifest> OPL_IMAGE_SEED_DIR=<seed> opl system startup-maintenance --json',
    payload_fields: ['image_manifest_path', 'image_seed_dir'],
    mutates: 'opl_seed_install_manifest',
    dry_run_supported: true,
    confirmation_required: true,
    danger_level: 'medium',
    impact: 'Selects the image manifest and seed inputs consumed by the existing startup-maintenance path; it does not pull images or publish WebUI releases.',
    follow_up_action_ids: ['settings_run_webui_startup_maintenance', 'settings_diagnose_docker_webui'],
    verify_action_id: 'settings_diagnose_docker_webui',
  },
  {
    action_id: 'settings_run_webui_startup_maintenance',
    stable_id: 'run_webui_startup_maintenance',
    label: 'Run WebUI startup maintenance',
    section_id: 'docker_webui',
    task_kind: 'repair',
    taxonomy: 'settings.docker_webui.startup_maintenance',
    delegated_surface: 'opl system startup-maintenance',
    payload_fields: [],
    mutates: 'opl_managed_runtime_and_seed_state',
    dry_run_supported: true,
    confirmation_required: true,
    danger_level: 'medium',
    impact: 'Runs the existing seed/materialization and managed-maintenance path, then reports Docker WebUI startup readback without claiming runtime ready.',
    follow_up_action_ids: ['settings_diagnose_docker_webui', 'settings_open_docker_webui'],
    verify_action_id: 'settings_diagnose_docker_webui',
  },
  {
    action_id: 'settings_open_docker_webui',
    stable_id: 'open_docker_webui',
    label: 'Open Docker WebUI',
    section_id: 'docker_webui',
    task_kind: 'read',
    taxonomy: 'settings.docker_webui.open',
    delegated_surface: 'opl system docker-webui doctor --json#docker_webui_doctor.browser.url',
    payload_fields: [],
    mutates: 'none_read_only',
    dry_run_supported: true,
    confirmation_required: false,
    danger_level: 'none',
    impact: 'Reads the browser URL from the existing Docker WebUI doctor read model; the App shell owns actual browser navigation.',
    follow_up_action_ids: ['settings_diagnose_docker_webui'],
    verify_action_id: 'settings_diagnose_docker_webui',
  },
  {
    action_id: 'settings_diagnose_docker_webui',
    stable_id: 'diagnose_docker_webui',
    label: 'Diagnose Docker WebUI',
    section_id: 'docker_webui',
    task_kind: 'verify',
    taxonomy: 'settings.docker_webui.diagnose',
    delegated_surface: 'opl system docker-webui doctor',
    payload_fields: [],
    mutates: 'none_read_only',
    dry_run_supported: true,
    confirmation_required: false,
    danger_level: 'none',
    impact: 'Reads Docker CLI, daemon, image, container, mount, port, seed, API key, startup phase, and operator next actions without mutating runtime state.',
    follow_up_action_ids: ['settings_configure_webui_api_key', 'settings_run_webui_startup_maintenance'],
    verify_action_id: 'settings_diagnose_docker_webui',
  },
];

export const SETTINGS_CONTROL_CENTER_ACTION_IDS = SETTINGS_CONTROL_CENTER_ACTIONS.map(
  (action) => action.action_id,
);

export const SETTINGS_ISSUE_CATALOG = [
  {
    status_code: 'needs_reload',
    label: 'Reload needed',
    user_message: 'A settings or package change needs the Codex-visible surface to be reloaded before the App can show the latest capabilities.',
    severity: 'notice',
    recommended_action_id: 'settings_reload_codex_surface',
  },
  {
    status_code: 'manual_required',
    label: 'Manual attention required',
    user_message: 'The Framework can show the safe next action, but this item needs an explicit user or owner action before OPL may mutate anything.',
    severity: 'warning',
    recommended_action_id: 'settings_verify_workspace',
  },
  {
    status_code: 'dirty_checkout',
    label: 'Dirty checkout blocks managed action',
    user_message: 'A visible module checkout has local changes. OPL must not overwrite it from Settings.',
    severity: 'warning',
    recommended_action_id: 'settings_sync_capabilities',
  },
  {
    status_code: 'failed_with_repair',
    label: 'Repair route available',
    user_message: 'A managed component reported a failed state with an explicit repair or verification route.',
    severity: 'error',
    recommended_action_id: 'settings_sync_capabilities',
  },
  {
    status_code: 'developer_profile_active',
    label: 'Developer profile active',
    user_message: 'Developer Mode is active, so Settings may expose supervised repair routes without becoming a domain truth owner.',
    severity: 'info',
    recommended_action_id: 'settings_repair_model_access',
  },
] as const;

function visibleBoundaryValuePresent(value: unknown) {
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return typeof value === 'string' && value.trim().length > 0;
}
function consumerOnlySurfaceField(surface: ConsumerOnlyTruthSurface, field: string) {
  return (surface as unknown as Record<string, unknown>)[field];
}

export function buildAppAionConsumerOnlyReadback() {
  const truthSurfaces = APP_AION_CONSUMER_ONLY_TRUTH_SURFACES.map((surface) => ({ ...surface }));
  const validatorFindings = truthSurfaces.flatMap((surface) =>
    surface.required_visible_refs
      .filter((field) => !visibleBoundaryValuePresent(consumerOnlySurfaceField(surface, field)))
      .map((field) => ({
        finding_id: `${surface.surface}:${field}:missing_required_visible_ref`,
        severity: 'attention',
        surface: surface.surface,
        missing_field: field,
        blocked_reason: 'required_visible_boundary_field_missing',
        required_next_evidence: 'owner_current_source_delegated_action_or_receipt_blocker_ref',
      }))
  );
  const forbiddenAuthorityFlagsEnabled = Object.entries(APP_AION_CONSUMER_ONLY_AUTHORITY_BOUNDARY)
    .filter(([, value]) => value !== false)
    .map(([field]) => field);
  const forbiddenSchedulerRolesEnabled: string[] = [];

  return {
    surface_kind: 'opl_app_aion_consumer_only_readback.v1',
    schema_version: 'opl_app_aion_consumer_only_readback.v1',
    source_contract_ref: SETTINGS_CONTROL_CENTER_CONTRACT_REF,
    source_phase: 'reuse_first_platform_risk_audit_phase_8',
    readback_scope: 'opl_framework_contract_readback_only_no_app_or_aion_repo_mutation',
    validation_status: validatorFindings.length === 0
        && forbiddenAuthorityFlagsEnabled.length === 0
        && forbiddenSchedulerRolesEnabled.length === 0
      ? 'pass'
      : 'attention_required',
    validator_findings: [
      ...validatorFindings,
      ...forbiddenAuthorityFlagsEnabled.map((field) => ({
        finding_id: `authority_boundary:${field}:must_be_false`,
        severity: 'blocker',
        surface: 'authority_boundary',
        missing_field: field,
        blocked_reason: 'app_aion_forbidden_authority_enabled',
        required_next_evidence: 'authority_flag_false',
      })),
      ...forbiddenSchedulerRolesEnabled.map((field) => ({
        finding_id: `local_scheduler:${field}:forbidden_role_enabled`,
        severity: 'blocker',
        surface: 'local_scheduler_policy',
        missing_field: field,
        blocked_reason: 'local_scheduler_truth_role_enabled',
        required_next_evidence: 'scheduler_role_refresh_ui_poll_only',
      })),
    ],
    truth_surfaces: truthSurfaces,
    local_scheduler_policy: {
      aion_local_scheduler_allowed_roles: [...APP_AION_ALLOWED_LOCAL_SCHEDULER_ROLES],
      observed_local_scheduler_roles: [...APP_AION_ALLOWED_LOCAL_SCHEDULER_ROLES],
      forbidden_roles: [...APP_AION_FORBIDDEN_LOCAL_SCHEDULER_ROLES],
      forbidden_roles_enabled: forbiddenSchedulerRolesEnabled,
      scheduler_must_delegate_to: [
        'opl app state --profile fast|full --json',
        'opl app action execute --json',
        'one-person-lab-app release owner receipt or typed blocker',
      ],
    },
    forbidden_truth_only_paths: [...APP_AION_FORBIDDEN_TRUTH_ONLY_PATHS],
    required_user_visible_boundary_fields: [...APP_AION_REQUIRED_USER_VISIBLE_BOUNDARY_FIELDS],
    authority_boundary: APP_AION_CONSUMER_ONLY_AUTHORITY_BOUNDARY,
    forbidden_claims: [
      'app_release_ready_without_app_owner_receipt_or_typed_blocker',
      'runtime_ready_from_shell_docker_probe',
      'settings_policy_truth_from_aion_local_store',
      'domain_private_cleanup_status_from_default_settings',
    ],
  };
}
