type JsonRecord = Record<string, unknown>;

type SettingsAction = {
  action_id: string;
  label: string;
  section_id: string;
  task_kind: 'read' | 'repair' | 'sync' | 'apply' | 'reload' | 'cleanup_plan' | 'configure';
  taxonomy: string;
  delegated_surface: string;
  payload_fields: string[];
  mutates: string;
  dry_run_supported: boolean;
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

const SETTINGS_CONTROL_CENTER_CONTRACT_REF =
  'contracts/opl-framework/settings-control-center-action-read-model-contract.json';

const SETTINGS_CONTROL_CENTER_ACTION_IDS = [
  'settings_repair_model_access',
  'settings_sync_capabilities',
  'settings_apply_opl_packages',
  'settings_reload_codex_surface',
  'settings_prune_runtime_roots_dry_run',
] as const;

const SETTINGS_CONTROL_CENTER_GROUPS: SettingsControlCenterGroup[] = [
  {
    group_id: 'overview',
    label: 'Overview',
    role: 'control_center_summary',
    route_id: 'general',
    action_section_ids: ['model_access', 'capabilities', 'packages', 'runtime_roots'],
    ordinary_entry_policy: 'top_level_control_center_route',
  },
  {
    group_id: 'setup_access',
    label: 'Setup & Access',
    role: 'connect_models_accounts_workspace_web_remote',
    route_id: 'access',
    action_section_ids: ['model_access', 'codex_surface'],
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
    action_section_ids: ['packages', 'capabilities', 'runtime_roots'],
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
    action_section_ids: ['codex_surface'],
    ordinary_entry_policy: 'top_level_control_center_route',
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
    verify_action_id: 'developer_supervisor_refresh',
  },
  {
    action_id: 'settings_sync_capabilities',
    label: 'Sync capabilities',
    section_id: 'capabilities',
    task_kind: 'sync',
    taxonomy: 'settings.capabilities.sync',
    delegated_surface: 'opl connect reconcile-modules',
    payload_fields: [],
    mutates: 'opl_module_checkout',
    dry_run_supported: true,
    verify_action_id: 'provider_scheduler_status',
  },
  {
    action_id: 'settings_apply_opl_packages',
    label: 'Apply OPL packages',
    section_id: 'packages',
    task_kind: 'apply',
    taxonomy: 'settings.packages.apply',
    delegated_surface: 'opl connect update --module <all-default-modules>',
    payload_fields: [],
    mutates: 'opl_module_checkout',
    dry_run_supported: true,
    verify_action_id: 'provider_scheduler_status',
  },
  {
    action_id: 'settings_reload_codex_surface',
    label: 'Reload Codex surface',
    section_id: 'codex_surface',
    task_kind: 'reload',
    taxonomy: 'settings.codex_surface.reload',
    delegated_surface: 'opl connect sync-skills --domain scholarskills --scope <workspace|quest>',
    payload_fields: ['scope', 'target_path'],
    mutates: 'opl_codex_visible_skill_projection',
    dry_run_supported: true,
    verify_action_id: 'developer_supervisor_refresh',
  },
  {
    action_id: 'settings_prune_runtime_roots_dry_run',
    label: 'Plan runtime roots cleanup',
    section_id: 'runtime_roots',
    task_kind: 'cleanup_plan',
    taxonomy: 'settings.runtime_roots.cleanup_plan',
    delegated_surface: 'opl app action execute --action settings_prune_runtime_roots_dry_run',
    payload_fields: [],
    mutates: 'none_read_only',
    dry_run_supported: true,
    verify_action_id: 'settings_prune_runtime_roots_dry_run',
  },
];

function asRecord(value: unknown): JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function statusTone(status: string | null) {
  if (!status) return 'unknown';
  return ['ready', 'healthy', 'ok', 'installed', 'enabled', 'stable'].includes(status)
    ? 'ready'
    : 'attention_needed';
}

function routeFor(actionId: string) {
  return `opl app action execute --action ${actionId}`;
}

function actionState(action: SettingsAction, input: BuildSettingsControlCenterInput) {
  if (action.action_id === 'settings_repair_model_access') {
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
    mutates: action.mutates,
    authority_flags: {
      can_write_domain_truth: false,
      can_sign_domain_receipt: false,
      can_create_owner_receipt: false,
      can_create_typed_blocker: false,
      can_write_runtime_queue: false,
      can_authorize_quality_verdict: false,
      can_claim_app_release_ready: false,
    },
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

  return {
    surface_kind: 'opl_settings_control_center.v1',
    schema_version: 'settings-control-center.v1',
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
    },
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
    action_taxonomy: Object.fromEntries(
      SETTINGS_CONTROL_CENTER_ACTIONS.map((action) => [action.action_id, action.taxonomy]),
    ),
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
