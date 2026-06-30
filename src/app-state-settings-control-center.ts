import { buildDockerWebuiSettingsReadModel } from './app-state-settings-control-center-parts/docker-webui-read-model.ts';

type JsonRecord = Record<string, unknown>;

type SettingsAction = {
  action_id: string;
  stable_id: string;
  label: string;
  section_id: string;
  task_kind: 'read' | 'repair' | 'sync' | 'apply' | 'reload' | 'cleanup_plan' | 'configure' | 'verify' | 'check' | 'rollback';
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

type SettingsSection = {
  section_id: string;
  label: string;
  description: string;
  state: string;
  source_ref: string;
};

type SettingsControlCenterGroup = {
  group_id: string;
  label: string;
  role: string;
  route_id: string;
  action_section_ids: string[];
  ordinary_entry_policy: string;
};

type SettingsSecondaryRoute = {
  route_id: string;
  group_id: string;
  parent_route_id: string;
  label: string;
  role: string;
  action_section_ids: string[];
  ordinary_entry_policy: string;
};

const SETTINGS_CONTROL_CENTER_CONTRACT_REF =
  'contracts/opl-framework/settings-control-center-action-read-model-contract.json';

const SETTINGS_CONTROL_CENTER_ACTION_IDS = [
  'settings_repair_model_access',
  'settings_verify_workspace',
  'settings_sync_capabilities',
  'settings_apply_opl_packages',
  'settings_reload_codex_surface',
  'settings_check_app_update',
  'settings_prune_runtime_roots_dry_run',
  'settings_rollback_runtime_toolchain',
  'settings_install_docker_webui',
  'settings_configure_webui_api_key',
  'settings_select_webui_seed',
  'settings_run_webui_startup_maintenance',
  'settings_open_docker_webui',
  'settings_diagnose_docker_webui',
] as const;

const SETTINGS_CONTROL_CENTER_GROUPS: SettingsControlCenterGroup[] = [
  {
    group_id: 'overview',
    label: 'Overview',
    role: 'control_center_summary',
    route_id: 'general',
    action_section_ids: ['model_access', 'docker_webui', 'workspace', 'capabilities', 'packages', 'updates', 'runtime_roots'],
    ordinary_entry_policy: 'top_level_control_center_route',
  },
  {
    group_id: 'setup_access',
    label: 'Setup & Access',
    role: 'connect_models_accounts_workspace_web_remote',
    route_id: 'access',
    action_section_ids: ['model_access', 'docker_webui', 'workspace', 'codex_surface'],
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

const SETTINGS_CONTROL_CENTER_SECONDARY_ROUTES: SettingsSecondaryRoute[] = [
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

const SETTINGS_CONTROL_CENTER_ACTION_SECTIONS: SettingsSection[] = [
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
    description: 'App update checks, managed update projection, reload guidance, and explicit rollback planning.',
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
    delegated_surface: 'opl connect reconcile-modules',
    payload_fields: [],
    mutates: 'opl_module_checkout',
    dry_run_supported: true,
    confirmation_required: true,
    danger_level: 'medium',
    impact: 'Reconciles OPL module checkouts and capability exposure through existing OPL-owned routes.',
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
    delegated_surface: 'opl connect update --module <all-default-modules>',
    payload_fields: [],
    mutates: 'opl_module_checkout',
    dry_run_supported: true,
    confirmation_required: true,
    danger_level: 'medium',
    impact: 'Applies package-channel updates only through existing managed module update routes.',
    follow_up_action_ids: ['settings_reload_codex_surface', 'provider_scheduler_status'],
    rollback_action_id: 'settings_rollback_runtime_toolchain',
    verify_action_id: 'provider_scheduler_status',
  },
  {
    action_id: 'settings_reload_codex_surface',
    stable_id: 'reload_codex_surface',
    label: 'Reload Codex surface',
    section_id: 'codex_surface',
    task_kind: 'reload',
    taxonomy: 'settings.codex_surface.reload',
    delegated_surface: 'opl connect sync-skills --domain scholarskills --scope <workspace|quest>',
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
    delegated_surface: 'one-person-lab-app installation_carrier.macos_app status',
    payload_fields: [],
    mutates: 'none_read_only',
    dry_run_supported: true,
    confirmation_required: false,
    danger_level: 'none',
    impact: 'Reads the App-owned installation carrier status; App release truth remains App-owned and outside the Framework managed-update kernel.',
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
    action_id: 'settings_rollback_runtime_toolchain',
    stable_id: 'rollback_runtime_toolchain',
    label: 'Plan runtime toolchain rollback',
    section_id: 'updates',
    task_kind: 'rollback',
    taxonomy: 'settings.updates.rollback_runtime_toolchain',
    delegated_surface: 'opl update rollback --component runtime_toolchain',
    payload_fields: ['receipt_ref'],
    mutates: 'none_read_only',
    dry_run_supported: true,
    confirmation_required: true,
    danger_level: 'high',
    impact: 'Projects the explicit runtime-toolchain rollback route; actual pointer rollback stays behind the managed update authority.',
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

function asRecord(value: unknown): JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asList(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter((entry): entry is JsonRecord => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry)) : [];
}

function statusTone(status: string | null) {
  if (!status) return 'unknown';
  return ['ready', 'healthy', 'ok', 'installed', 'enabled', 'stable'].includes(status)
    ? 'ready'
    : 'attention_needed';
}

const SETTINGS_ISSUE_CATALOG = [
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

function actionCatalogEntry(action: SettingsAction) {
  return {
    stable_id: action.stable_id,
    action_id: action.action_id,
    label: action.label,
    section_id: action.section_id,
    task_kind: action.task_kind,
    taxonomy: action.taxonomy,
    route: routeFor(action.action_id),
    delegated_surface: action.delegated_surface,
    payload_fields: action.payload_fields,
    payload_required: action.payload_fields.length > 0,
    mutates: action.mutates,
    dry_run_supported: action.dry_run_supported,
    confirmation_required: action.confirmation_required,
    danger_level: action.danger_level,
    impact: action.impact,
    rollback_action_id: action.rollback_action_id ?? null,
    follow_up_action_ids: action.follow_up_action_ids,
    verify_action_id: action.verify_action_id ?? null,
    verify_route: action.verify_action_id ? routeFor(action.verify_action_id) : null,
    authority_flags: settingsAuthorityFlags(),
  };
}

function settingsAuthorityFlags() {
  return {
    can_write_domain_truth: false,
    can_sign_domain_receipt: false,
    can_create_owner_receipt: false,
    can_create_typed_blocker: false,
    can_write_runtime_queue: false,
    can_write_provider_queue: false,
    can_read_memory_body: false,
    can_read_artifact_body: false,
    can_authorize_quality_verdict: false,
    can_claim_app_release_ready: false,
    can_claim_production_ready: false,
  };
}

function routeFor(actionId: string) {
  return `opl app action execute --action ${actionId}`;
}

function actionState(action: SettingsAction, input: BuildSettingsControlCenterInput) {
  if (action.action_id === 'settings_repair_model_access') {
    const codex = asRecord(asRecord(input.core).codex);
    return codex.api_key_present === true ? 'ready' : 'attention_needed';
  }
  if (action.action_id === 'settings_configure_webui_api_key') {
    const codex = asRecord(asRecord(input.core).codex);
    return codex.api_key_present === true ? 'ready' : 'attention_needed';
  }
  if (action.action_id === 'settings_sync_capabilities' || action.action_id === 'settings_apply_opl_packages') {
    const summary = asRecord(asRecord(input.modules).summary);
    return summary.healthy_default_modules_count === summary.default_modules_count ? 'ready' : 'attention_needed';
  }
  if (action.action_id === 'settings_prune_runtime_roots_dry_run') {
    return 'plan_only';
  }
  if (action.action_id === 'settings_open_docker_webui' || action.action_id === 'settings_diagnose_docker_webui') {
    return 'ready';
  }
  if (action.action_id === 'settings_rollback_runtime_toolchain') {
    return 'manual_required';
  }
  return 'ready';
}

function sectionState(sectionId: string, input: BuildSettingsControlCenterInput) {
  const relatedActions = SETTINGS_CONTROL_CENTER_ACTIONS.filter((action) => action.section_id === sectionId);
  if (relatedActions.some((action) => actionState(action, input) === 'attention_needed')) {
    return 'attention_needed';
  }
  return SETTINGS_CONTROL_CENTER_ACTION_SECTIONS.find((section) => section.section_id === sectionId)?.state ?? 'available';
}

function groupState(group: SettingsControlCenterGroup, input: BuildSettingsControlCenterInput) {
  if (group.action_section_ids.length === 0) {
    return 'available';
  }
  if (group.action_section_ids.some((sectionId) => sectionState(sectionId, input) === 'attention_needed')) {
    return 'attention_needed';
  }
  return 'available';
}

function buildTaskEntries(input: BuildSettingsControlCenterInput) {
  return SETTINGS_CONTROL_CENTER_ACTIONS.map((action) => ({
    task_id: action.action_id,
    stable_id: action.stable_id,
    action_id: action.action_id,
    section_id: action.section_id,
    label: action.label,
    task_kind: action.task_kind,
    taxonomy: action.taxonomy,
    state: actionState(action, input),
    route: routeFor(action.action_id),
    delegated_surface: action.delegated_surface,
    dry_run_route: `${routeFor(action.action_id)} --dry-run`,
    verify_action_id: action.verify_action_id ?? null,
    verify_route: action.verify_action_id ? routeFor(action.verify_action_id) : null,
    payload_fields: action.payload_fields,
    payload_required: action.payload_fields.length > 0,
    dry_run_supported: action.dry_run_supported,
    confirmation_required: action.confirmation_required,
    danger_level: action.danger_level,
    impact: action.impact,
    rollback_action_id: action.rollback_action_id ?? null,
    follow_up_action_ids: action.follow_up_action_ids,
    mutates: action.mutates,
    authority_flags: settingsAuthorityFlags(),
  }));
}

function buildSettingsIa(taskEntries: ReturnType<typeof buildTaskEntries>) {
  return {
    surface_kind: 'opl_settings_control_center_ia.v1',
    ordinary_entry: 'settings_control_center',
    entry_policy: 'top_level_control_center_route',
    ordinary_route_ids: SETTINGS_CONTROL_CENTER_GROUPS.map((group) => group.route_id),
    secondary_or_deep_link_route_ids: SETTINGS_CONTROL_CENTER_SECONDARY_ROUTES.map((route) => route.route_id),
    route_groups: SETTINGS_CONTROL_CENTER_GROUPS.map((group) => ({
      route_id: group.route_id,
      group_id: group.group_id,
      label: group.label,
      role: group.role,
      action_section_ids: group.action_section_ids,
      action_ids: taskEntries
        .filter((entry) => group.action_section_ids.includes(entry.section_id))
        .map((entry) => entry.action_id),
    })),
    secondary_or_deep_link_routes: SETTINGS_CONTROL_CENTER_SECONDARY_ROUTES.map((route) => ({
      route_id: route.route_id,
      group_id: route.group_id,
      parent_route_id: route.parent_route_id,
      label: route.label,
      role: route.role,
      action_section_ids: route.action_section_ids,
      action_ids: taskEntries
        .filter((entry) => route.action_section_ids.includes(entry.section_id))
        .map((entry) => entry.action_id),
      route_scope: 'secondary_or_deep_link',
      ordinary_entry_policy: route.ordinary_entry_policy,
      app_shell_must_not_promote_to_top_level_tab: true,
    })),
    app_shell_contract: {
      app_consumes_read_model_only: true,
      aion_shell_is_renderer_only: true,
      shell_must_not_infer_domain_truth: true,
      shell_must_not_execute_unlisted_actions: true,
    },
  };
}

function buildAppSettingsReadModel(
  input: BuildSettingsControlCenterInput,
  taskEntries: ReturnType<typeof buildTaskEntries>,
  issueQueue: Array<Record<string, unknown>>,
  settingsIa: ReturnType<typeof buildSettingsIa>,
) {
  const codex = asRecord(asRecord(input.core).codex);
  const defaultProfile = asRecord(codex.default_profile);
  const developerProfile = asRecord(asRecord(input.developerMode).developer_profile);
  const moduleSummary = asRecord(asRecord(input.modules).summary);
  const moduleSource = asRecord(asRecord(input.modules).source);
  const temporal = asRecord(asRecord(input.provider).temporal);
  const workspaceRoot = asRecord(input.paths.workspace_root);
  const familyWorkspaceRoot = asRecord(input.paths.family_workspace_root);
  const modelAccessStatus = codex.api_key_present === true ? 'ready' : 'attention_needed';
  const temporalStatus = asString(temporal.health_status) ?? asString(temporal.status);
  const moduleHealth = `${moduleSummary.healthy_default_modules_count ?? 0}/${moduleSummary.default_modules_count ?? 0}`;

  return {
    surface_kind: 'opl_app_settings_read_model.v1',
    schema_version: 'opl_app_settings_read_model.v1',
    owner: 'one-person-lab',
    source_surface: 'app_state.settings_control_center',
    source_refs: [
      'app_state.core.codex',
      'app_state.developer_mode',
      'app_state.modules',
      'app_state.provider',
      'app_state.paths',
      'app_state.release',
      'app_state.settings_control_center.settings_ia',
      'app_state.settings_control_center.action_catalog',
    ],
    shell_policy: {
      app_consumes_read_model_only: true,
      aion_shell_is_renderer_only: true,
      shell_must_not_rewrite_model_or_reasoning_policy: true,
      shell_must_not_infer_api_key_or_workspace_service_truth: true,
      shell_must_not_execute_unlisted_actions: true,
    },
    page_structure: {
      ordinary_entry: settingsIa.ordinary_entry,
      ordinary_route_ids: settingsIa.ordinary_route_ids,
      secondary_or_deep_link_route_ids: settingsIa.secondary_or_deep_link_route_ids,
      route_groups: settingsIa.route_groups,
      secondary_or_deep_link_routes: settingsIa.secondary_or_deep_link_routes,
      action_sections: SETTINGS_CONTROL_CENTER_ACTION_SECTIONS.map((section) => ({
        section_id: section.section_id,
        label: section.label,
        state: sectionState(section.section_id, input),
        source_ref: section.source_ref,
        action_ids: taskEntries
          .filter((entry) => entry.section_id === section.section_id)
          .map((entry) => entry.action_id),
      })),
    },
    codex_model_policy: {
      source_ref: 'app_state.core.codex',
      model: asString(codex.default_model) ?? asString(defaultProfile.model) ?? 'unknown',
      reasoning_effort: asString(codex.default_reasoning_effort) ?? asString(defaultProfile.model_reasoning_effort),
      model_provider: asString(defaultProfile.model_provider),
      provider_name: asString(defaultProfile.provider_name),
      provider_base_url: asString(codex.provider_base_url) ?? asString(defaultProfile.base_url),
      config_path: asString(codex.config_path),
      profile_source: codex.config_path ? 'local_codex_config' : 'bundled_opl_default_profile',
      api_key_present: codex.api_key_present === true,
      access_status: modelAccessStatus,
      repair_action_id: 'settings_repair_model_access',
      shell_must_not_rewrite_policy: true,
    },
    access_api_key: {
      source_ref: 'app_state.core.codex.api_key_present',
      status: modelAccessStatus,
      api_key_present: codex.api_key_present === true,
      config_path: asString(codex.config_path),
      required_for: 'agent_tasks_from_settings',
      repair_action_id: 'settings_repair_model_access',
      repair_route: routeFor('settings_repair_model_access'),
      developer_mode: {
        status: asString(input.developerMode.status),
        effective_state: asString(input.developerMode.effective_state),
        mode: asString(input.developerMode.mode),
        developer_profile_status: asString(developerProfile.status),
      },
    },
    workspace_services: {
      workspace_root: {
        source_ref: 'app_state.paths.workspace_root',
        selected_path: asString(workspaceRoot.selected_path) ?? asString(input.paths.workspace_root_path),
        source: asString(workspaceRoot.source),
        exists: workspaceRoot.exists === true,
        writable: workspaceRoot.writable === true,
        health_status: asString(workspaceRoot.health_status) ?? 'unknown',
        verify_action_id: 'settings_verify_workspace',
        verify_route: routeFor('settings_verify_workspace'),
      },
      family_workspace_root: {
        source_ref: 'app_state.paths.family_workspace_root',
        selected_path: asString(familyWorkspaceRoot.selected_path),
        source: asString(familyWorkspaceRoot.source),
        role: asString(familyWorkspaceRoot.role),
      },
      modules: {
        source_ref: 'app_state.modules.summary',
        source_mode: asString(moduleSource.mode),
        modules_root: asString(input.paths.modules_root),
        default_modules_count: moduleSummary.default_modules_count ?? 0,
        healthy_default_modules_count: moduleSummary.healthy_default_modules_count ?? 0,
        health: moduleHealth,
        sync_action_id: 'settings_sync_capabilities',
        apply_action_id: 'settings_apply_opl_packages',
      },
      local_services: {
        source_ref: 'app_state.provider.temporal',
        temporal_provider: statusTone(temporalStatus),
        temporal_health_status: asString(temporal.health_status),
        temporal_status: asString(temporal.status),
        selected_provider: asString(input.provider.selected_provider),
        service_action_ids: [
          'settings_sync_capabilities',
          'settings_apply_opl_packages',
          'settings_reload_codex_surface',
        ],
      },
    },
    docker_webui: buildDockerWebuiSettingsReadModel(input, taskEntries, issueQueue),
    local_environment: {
      source_ref: 'app_state.paths + app_state.release + app_state.provider',
      state_dir: asString(input.paths.state_dir),
      modules_root: asString(input.paths.modules_root),
      logs_dir: asString(input.paths.logs_dir),
      update_channel_file: asString(input.paths.update_channel_file),
      developer_supervisor_config_file: asString(input.paths.developer_supervisor_config_file),
      release_channel: asString(input.release.channel) ?? 'unknown',
      app_update_action_id: 'settings_check_app_update',
      runtime_roots_cleanup_action_id: 'settings_prune_runtime_roots_dry_run',
      runtime_toolchain_rollback_action_id: 'settings_rollback_runtime_toolchain',
      temporal_provider: statusTone(temporalStatus),
    },
    action_policy: {
      source_ref: 'app_state.settings_control_center.action_catalog',
      action_surface: 'opl app action execute --json',
      allowed_action_ids: [...SETTINGS_CONTROL_CENTER_ACTION_IDS],
      payload_required_action_ids: taskEntries
        .filter((entry) => entry.payload_required)
        .map((entry) => entry.action_id),
      dry_run_supported_action_ids: taskEntries
        .filter((entry) => entry.dry_run_supported)
        .map((entry) => entry.action_id),
      issue_count: issueQueue.length,
      authority_flags: settingsAuthorityFlags(),
    },
  };
}

function issueRoute(actionId: string | null) {
  return actionId ? routeFor(actionId) : null;
}

function buildIssueQueue(input: BuildSettingsControlCenterInput) {
  const issues: Array<Record<string, unknown>> = [];
  const codex = asRecord(asRecord(input.core).codex);
  const developerProfile = asRecord(asRecord(input.developerMode).developer_profile);
  const developerEffectiveState = asString(input.developerMode.effective_state);
  const moduleItems = asList(input.modules.items);
  const temporal = asRecord(asRecord(input.provider).temporal);

  if (codex.api_key_present !== true) {
    issues.push({
      issue_id: 'model_access_manual_required',
      status_code: 'manual_required',
      label: 'Model access is not configured',
      user_message: 'Codex model access is missing or unreadable. Configure the API key before running WebUI or agent tasks from Settings.',
      severity: 'warning',
      source_ref: 'app_state.core.codex.api_key_present',
      recommended_action_id: 'settings_configure_webui_api_key',
      route: issueRoute('settings_configure_webui_api_key'),
    });
  }

  const dirtyModules = moduleItems.filter((entry) => asString(entry.health_status) === 'dirty');
  if (dirtyModules.length > 0) {
    issues.push({
      issue_id: 'module_dirty_checkout',
      status_code: 'dirty_checkout',
      label: 'Local module checkout has uncommitted changes',
      user_message: 'One or more module checkouts are dirty. Settings will not overwrite them; review or commit those changes first.',
      severity: 'warning',
      source_ref: 'app_state.modules.items[].health_status',
      affected_ids: dirtyModules.map((entry) => asString(entry.module_id)).filter(Boolean),
      recommended_action_id: 'settings_sync_capabilities',
      route: issueRoute('settings_sync_capabilities'),
    });
  }

  const manualModules = moduleItems.filter((entry) =>
    ['missing', 'invalid_checkout'].includes(asString(entry.health_status) ?? '')
  );
  if (manualModules.length > 0) {
    issues.push({
      issue_id: 'module_install_manual_required',
      status_code: 'manual_required',
      label: 'OPL package attention required',
      user_message: 'One or more default OPL packages are missing or invalid. Use the package actions only through OPL-owned routes.',
      severity: 'warning',
      source_ref: 'app_state.modules.items[].health_status',
      affected_ids: manualModules.map((entry) => asString(entry.module_id)).filter(Boolean),
      recommended_action_id: 'settings_apply_opl_packages',
      route: issueRoute('settings_apply_opl_packages'),
    });
  }

  const temporalStatus = asString(temporal.health_status) ?? asString(temporal.status);
  if (temporalStatus && !['ready', 'healthy', 'ok', 'installed', 'enabled', 'stable'].includes(temporalStatus)) {
    issues.push({
      issue_id: 'provider_failed_with_repair',
      status_code: 'failed_with_repair',
      label: 'Runtime provider needs repair or verification',
      user_message: 'The selected runtime provider is not ready. Settings can point to existing repair routes but cannot mark domain work ready.',
      severity: 'error',
      source_ref: 'app_state.provider.temporal',
      recommended_action_id: 'settings_sync_capabilities',
      route: issueRoute('settings_sync_capabilities'),
    });
  }

  if (
    ['ready', 'limited'].includes(asString(developerProfile.status) ?? '')
    && developerEffectiveState
    && developerEffectiveState !== 'disabled'
    && developerEffectiveState !== 'blocked'
  ) {
    issues.push({
      issue_id: 'developer_profile_active',
      status_code: 'developer_profile_active',
      label: 'Developer Mode profile is active',
      user_message: 'Developer Mode can expose supervised repair routes. This does not authorize domain truth writes or release-ready claims.',
      severity: 'info',
      source_ref: 'app_state.developer_mode.developer_profile',
      recommended_action_id: 'settings_repair_model_access',
      route: issueRoute('settings_repair_model_access'),
    });
  }

  return issues.map((issue) => ({
    ...issue,
    owner_surface: 'opl_framework_settings_control_center',
    authority_flags: settingsAuthorityFlags(),
  }));
}

export type BuildSettingsControlCenterInput = {
  profile: 'fast' | 'full';
  core: JsonRecord;
  developerMode: JsonRecord;
  modules: JsonRecord;
  provider: JsonRecord;
  release: JsonRecord;
  paths: JsonRecord;
};

export function buildSettingsControlCenter(input: BuildSettingsControlCenterInput) {
  const codex = asRecord(asRecord(input.core).codex);
  const temporal = asRecord(asRecord(input.provider).temporal);
  const releaseChannel = asString(input.release.channel) ?? 'unknown';
  const moduleSummary = asRecord(asRecord(input.modules).summary);
  const taskEntries = buildTaskEntries(input);
  const issueQueue = buildIssueQueue(input);
  const settingsIa = buildSettingsIa(taskEntries);

  return {
    surface_kind: 'opl_settings_control_center.v2',
    schema_version: 'settings-control-center.v2',
    compatibility_schema_versions: ['settings-control-center.v1'],
    profile: input.profile,
    owner: 'one-person-lab',
    contract_ref: SETTINGS_CONTROL_CENTER_CONTRACT_REF,
    read_surface: input.profile === 'fast'
      ? 'opl app state --profile fast --json#settings_control_center'
      : 'opl app state --profile full --json#settings_control_center',
    action_surface: 'opl app action execute --json',
    allowed_action_ids: [...SETTINGS_CONTROL_CENTER_ACTION_IDS],
    status_summary: {
      model_access: codex.api_key_present === true ? 'ready' : 'attention_needed',
      codex_version: asString(codex.parsed_version) ?? asString(codex.version) ?? 'missing',
      module_health: `${moduleSummary.healthy_default_modules_count ?? 0}/${moduleSummary.default_modules_count ?? 0}`,
      temporal_provider: statusTone(asString(temporal.status) ?? asString(temporal.health_status)),
      release_channel: releaseChannel,
      issue_count: issueQueue.length,
    },
    settings_ia: settingsIa,
    app_settings_read_model: buildAppSettingsReadModel(input, taskEntries, issueQueue, settingsIa),
    control_center_groups: SETTINGS_CONTROL_CENTER_GROUPS.map((group) => ({
      ...group,
      state: groupState(group, input),
      task_entry_count: taskEntries.filter((entry) => group.action_section_ids.includes(entry.section_id)).length,
    })),
    sections: SETTINGS_CONTROL_CENTER_GROUPS.map((group) => ({
      ...group,
      section_id: group.group_id,
      state: groupState(group, input),
      task_entry_count: taskEntries.filter((entry) => group.action_section_ids.includes(entry.section_id)).length,
    })),
    action_sections: SETTINGS_CONTROL_CENTER_ACTION_SECTIONS.map((section) => ({
      ...section,
      state: sectionState(section.section_id, input),
      task_entry_count: taskEntries.filter((entry) => entry.section_id === section.section_id).length,
    })),
    task_entries: taskEntries,
    action_catalog: SETTINGS_CONTROL_CENTER_ACTIONS.map(actionCatalogEntry),
    action_taxonomy: Object.fromEntries(
      SETTINGS_CONTROL_CENTER_ACTIONS.map((action) => [action.action_id, action.taxonomy]),
    ),
    issue_catalog: SETTINGS_ISSUE_CATALOG.map((issue) => ({
      ...issue,
      route: issueRoute(issue.recommended_action_id),
    })),
    issue_queue: issueQueue,
    dry_run_apply_verify_boundary: {
      dry_run: 'preflight_only_no_domain_or_runtime_authority_write',
      apply: 'delegates_only_to_existing_opl_owned_app_action_routes',
      verify: 'read_existing_opl_app_state_or_existing_opl_owned_status_actions',
      runtime_roots_cleanup: 'dry_run_plan_only_no_delete',
    },
    authority_boundary: {
      framework_owner: 'one-person-lab',
      app_repo_owner: 'one-person-lab-app_gui_product_truth_only',
      shell_owner: 'thin_renderer_and_ipc_adapter',
      can_write_domain_truth: false,
      can_sign_domain_receipt: false,
      can_create_owner_receipt: false,
      can_create_typed_blocker: false,
      can_write_runtime_queue: false,
      can_write_provider_queue: false,
      can_read_memory_body: false,
      can_read_artifact_body: false,
      can_authorize_quality_verdict: false,
      can_claim_app_release_ready: false,
      can_claim_production_ready: false,
    },
  };
}

export function settingsControlCenterActionById(actionId: string) {
  return SETTINGS_CONTROL_CENTER_ACTIONS.find((action) => action.action_id === actionId) ?? null;
}
