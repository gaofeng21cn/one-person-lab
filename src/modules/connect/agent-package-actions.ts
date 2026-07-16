export type AgentPackageAppActionId =
  | 'refresh_registry'
  | 'install_from_manifest_url'
  | 'agent_package_update'
  | 'agent_package_repair'
  | 'agent_package_activate'
  | 'agent_package_uninstall'
  | 'agent_package_preferences_set';

export type AgentPackageActionTaskKind =
  | 'refresh'
  | 'install'
  | 'uninstall'
  | 'repair'
  | 'configure';

export type AgentPackageActionCatalogEntry = {
  action_id: AgentPackageAppActionId;
  aliases: readonly string[];
  stable_id: string;
  label: string;
  section_id: 'capabilities';
  task_kind: AgentPackageActionTaskKind;
  taxonomy: string;
  delegated_surface: string;
  payload_fields: string[];
  mutates: string;
  dry_run_supported: boolean;
  confirmation_required: boolean;
  danger_level: 'low' | 'medium';
  impact: string;
  follow_up_action_ids: string[];
  verify_action_id?: string;
};

const AGENT_PACKAGE_ACTION_CATALOG = [
  {
    action_id: 'refresh_registry',
    aliases: ['agent_registry_refresh'],
    stable_id: 'refresh_agent_package_registry',
    label: 'Refresh agent registry',
    section_id: 'capabilities',
    task_kind: 'refresh',
    taxonomy: 'settings.capabilities.agent_registry.refresh',
    delegated_surface: 'opl packages registry refresh --registry-url <registry_url>',
    payload_fields: ['registry_url'],
    mutates: 'opl_agent_package_registry_cache_and_lifecycle_receipt',
    dry_run_supported: true,
    confirmation_required: false,
    danger_level: 'low',
    impact: 'Fetches and validates a registry catalog for discovery only, then records a Framework-owned refresh receipt.',
    follow_up_action_ids: ['install_from_manifest_url'],
    verify_action_id: 'refresh_registry',
  },
  {
    action_id: 'install_from_manifest_url',
    aliases: ['agent_package_install_from_manifest_url'],
    stable_id: 'install_agent_package_from_manifest_url',
    label: 'Install agent package',
    section_id: 'capabilities',
    task_kind: 'install',
    taxonomy: 'settings.capabilities.agent_package.install',
    delegated_surface: 'opl packages install --manifest-url <manifest_url>',
    payload_fields: ['manifest_url', 'registry_url', 'package_id', 'trust_tier', 'source_kind'],
    mutates: 'opl_agent_package_lock_and_lifecycle_receipt',
    dry_run_supported: true,
    confirmation_required: true,
    danger_level: 'medium',
    impact: 'Validates one manifest and records package lock/receipt refs without owning agent domain semantics.',
    follow_up_action_ids: [],
  },
  {
    action_id: 'agent_package_update',
    aliases: [],
    stable_id: 'update_agent_package',
    label: 'Update agent package',
    section_id: 'capabilities',
    task_kind: 'install',
    taxonomy: 'settings.capabilities.agent_package.update',
    delegated_surface: 'opl packages update --manifest-url <manifest_url>',
    payload_fields: ['manifest_url', 'registry_url', 'package_id', 'trust_tier', 'source_kind'],
    mutates: 'opl_agent_package_lock_and_lifecycle_receipt',
    dry_run_supported: true,
    confirmation_required: true,
    danger_level: 'medium',
    impact: 'Replaces an installed package lock through the package core lifecycle without owning carrier-specific release truth.',
    follow_up_action_ids: [],
  },
  {
    action_id: 'agent_package_repair',
    aliases: [],
    stable_id: 'repair_agent_package',
    label: 'Repair agent package',
    section_id: 'capabilities',
    task_kind: 'repair',
    taxonomy: 'settings.capabilities.agent_package.repair',
    delegated_surface: 'opl packages repair --package-id <package_id>',
    payload_fields: ['package_id'],
    mutates: 'opl_agent_package_lock_and_lifecycle_receipt',
    dry_run_supported: true,
    confirmation_required: true,
    danger_level: 'medium',
    impact: 'Re-materializes the package carrier surface from the existing lock and records a lifecycle receipt.',
    follow_up_action_ids: [],
  },
  {
    action_id: 'agent_package_activate',
    aliases: [],
    stable_id: 'activate_agent_package_for_use',
    label: 'Activate agent package',
    section_id: 'capabilities',
    task_kind: 'configure',
    taxonomy: 'settings.capabilities.agent_package.activate',
    delegated_surface: 'opl packages activate --package-id <package_id> --scope <workspace|quest>',
    payload_fields: ['package_id', 'scope', 'target_workspace', 'target_quest', 'use_boundary_id'],
    mutates: 'opl_agent_package_closure_scope_and_use_receipt',
    dry_run_supported: true,
    confirmation_required: false,
    danger_level: 'low',
    impact: 'Reconciles one package closure and scope at the launch boundary, then returns the immutable use binding.',
    follow_up_action_ids: [],
    verify_action_id: 'agent_package_activate',
  },
  {
    action_id: 'agent_package_uninstall',
    aliases: [],
    stable_id: 'uninstall_agent_package',
    label: 'Uninstall agent package',
    section_id: 'capabilities',
    task_kind: 'uninstall',
    taxonomy: 'settings.capabilities.agent_package.uninstall',
    delegated_surface: 'opl packages uninstall --package-id <package_id>',
    payload_fields: ['package_id'],
    mutates: 'opl_agent_package_lock_and_lifecycle_receipt',
    dry_run_supported: true,
    confirmation_required: true,
    danger_level: 'medium',
    impact: 'Removes the package lock and materialized carrier refs without deleting domain truth.',
    follow_up_action_ids: [],
  },
  {
    action_id: 'agent_package_preferences_set',
    aliases: [],
    stable_id: 'set_agent_package_preferences',
    label: 'Set agent package preferences',
    section_id: 'capabilities',
    task_kind: 'configure',
    taxonomy: 'settings.capabilities.agent_package.preferences',
    delegated_surface: 'opl app action execute --action agent_package_preferences_set',
    payload_fields: ['package_id', 'exposure_action', 'shortcut_id', 'visible', 'sort_order'],
    mutates: 'opl_agent_package_preferences',
    dry_run_supported: true,
    confirmation_required: false,
    danger_level: 'low',
    impact: 'Persists package exposure or Home shortcut user preferences without changing package core, carrier materialization, or agent domain semantics.',
    follow_up_action_ids: [],
    verify_action_id: 'agent_package_preferences_set',
  },
] as const satisfies readonly AgentPackageActionCatalogEntry[];

function findAgentPackageAction(actionId: string): AgentPackageActionCatalogEntry | null {
  return AGENT_PACKAGE_ACTION_CATALOG.find((entry) =>
    entry.action_id === actionId || entry.aliases.some((alias) => alias === actionId)
  ) ?? null;
}

export function agentPackageDelegatedSurface(actionId: string) {
  return findAgentPackageAction(actionId)?.delegated_surface ?? null;
}

export function listAgentPackageSettingsActions() {
  return AGENT_PACKAGE_ACTION_CATALOG
    .filter((entry) => entry.action_id !== 'agent_package_activate')
    .map(({ aliases: _aliases, ...entry }) => ({
      ...entry,
      payload_fields: [...entry.payload_fields],
      follow_up_action_ids: [...entry.follow_up_action_ids],
    }));
}

export function listAgentPackageLaunchActions() {
  return AGENT_PACKAGE_ACTION_CATALOG
    .filter((entry) => entry.action_id === 'agent_package_activate')
    .map(({ aliases: _aliases, ...entry }) => ({
      ...entry,
      payload_fields: [...entry.payload_fields],
      follow_up_action_ids: [...entry.follow_up_action_ids],
    }));
}
