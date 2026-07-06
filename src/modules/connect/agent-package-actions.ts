import { MANAGED_UPDATE_OWNER_ACTIONS } from './managed-update-owner-boundary.ts';

export type AgentPackageAppActionId =
  | 'refresh_registry'
  | 'install_from_manifest_url'
  | 'agent_package_update'
  | 'agent_package_rollback'
  | 'agent_package_repair'
  | 'agent_package_uninstall'
  | 'agent_package_hide'
  | 'agent_package_unhide'
  | 'agent_package_enable'
  | 'agent_package_disable'
  | 'agent_package_home_shortcut_preferences_set';

export type AgentPackageActionTaskKind =
  | 'refresh'
  | 'install'
  | 'uninstall'
  | 'repair'
  | 'configure'
  | typeof MANAGED_UPDATE_OWNER_ACTIONS.revert;

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

export const AGENT_PACKAGE_ACTION_CATALOG = [
  {
    action_id: 'refresh_registry',
    aliases: ['agent_registry_refresh'],
    stable_id: 'refresh_agent_package_registry',
    label: 'Refresh agent registry',
    section_id: 'capabilities',
    task_kind: 'refresh',
    taxonomy: 'settings.capabilities.agent_registry.refresh',
    delegated_surface: 'opl connect agent-packages registry refresh --registry-url <registry_url>',
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
    delegated_surface: 'opl connect agent-packages install --manifest-url <manifest_url>',
    payload_fields: ['manifest_url', 'registry_url', 'package_id', 'trust_tier', 'source_kind'],
    mutates: 'opl_agent_package_lock_and_lifecycle_receipt',
    dry_run_supported: true,
    confirmation_required: true,
    danger_level: 'medium',
    impact: 'Validates one manifest and records package lock/receipt refs without owning agent domain semantics.',
    follow_up_action_ids: ['settings_reload_codex_surface'],
    verify_action_id: 'settings_reload_codex_surface',
  },
  {
    action_id: 'agent_package_update',
    aliases: [],
    stable_id: 'update_agent_package',
    label: 'Update agent package',
    section_id: 'capabilities',
    task_kind: 'install',
    taxonomy: 'settings.capabilities.agent_package.update',
    delegated_surface: 'opl connect agent-packages update --manifest-url <manifest_url>',
    payload_fields: ['manifest_url', 'registry_url', 'package_id', 'trust_tier', 'source_kind'],
    mutates: 'opl_agent_package_lock_and_lifecycle_receipt',
    dry_run_supported: true,
    confirmation_required: true,
    danger_level: 'medium',
    impact: 'Replaces an installed package lock through the package core lifecycle without owning carrier-specific release truth.',
    follow_up_action_ids: ['settings_reload_codex_surface'],
    verify_action_id: 'settings_reload_codex_surface',
  },
  {
    action_id: 'agent_package_rollback', // reuse-first: allow owner-routed lifecycle projection, not package-manager truth.
    aliases: [],
    stable_id: 'rollback_agent_package',
    label: 'Rollback agent package',
    section_id: 'capabilities',
    task_kind: MANAGED_UPDATE_OWNER_ACTIONS.revert,
    taxonomy: 'settings.capabilities.agent_package.rollback', // reuse-first: allow owner-routed lifecycle projection, not package-manager truth.
    delegated_surface: 'opl connect agent-packages rollback --manifest-url <manifest_url>', // reuse-first: allow owner-routed lifecycle projection, not package-manager truth.
    payload_fields: ['manifest_url', 'registry_url', 'package_id', 'trust_tier', 'source_kind'],
    mutates: 'opl_agent_package_lock_and_lifecycle_receipt',
    dry_run_supported: true,
    confirmation_required: true,
    danger_level: 'medium',
    impact: 'Records a rollback lock/receipt through the package core lifecycle without claiming App release or domain readiness.', // reuse-first: allow owner-routed lifecycle projection, not package-manager truth.
    follow_up_action_ids: ['settings_reload_codex_surface'],
    verify_action_id: 'settings_reload_codex_surface',
  },
  {
    action_id: 'agent_package_repair',
    aliases: [],
    stable_id: 'repair_agent_package',
    label: 'Repair agent package',
    section_id: 'capabilities',
    task_kind: 'repair',
    taxonomy: 'settings.capabilities.agent_package.repair',
    delegated_surface: 'opl connect agent-packages repair --package-id <package_id>',
    payload_fields: ['package_id'],
    mutates: 'opl_agent_package_lock_and_lifecycle_receipt',
    dry_run_supported: true,
    confirmation_required: true,
    danger_level: 'medium',
    impact: 'Re-materializes the package carrier surface from the existing lock and records a lifecycle receipt.',
    follow_up_action_ids: ['settings_reload_codex_surface'],
    verify_action_id: 'settings_reload_codex_surface',
  },
  {
    action_id: 'agent_package_uninstall',
    aliases: [],
    stable_id: 'uninstall_agent_package',
    label: 'Uninstall agent package',
    section_id: 'capabilities',
    task_kind: 'uninstall',
    taxonomy: 'settings.capabilities.agent_package.uninstall',
    delegated_surface: 'opl connect agent-packages uninstall --package-id <package_id>',
    payload_fields: ['package_id'],
    mutates: 'opl_agent_package_lock_and_lifecycle_receipt',
    dry_run_supported: true,
    confirmation_required: true,
    danger_level: 'medium',
    impact: 'Removes the package lock and materialized carrier refs without deleting domain truth.',
    follow_up_action_ids: ['settings_reload_codex_surface'],
    verify_action_id: 'settings_reload_codex_surface',
  },
  {
    action_id: 'agent_package_hide',
    aliases: [],
    stable_id: 'hide_agent_package',
    label: 'Hide agent package',
    section_id: 'capabilities',
    task_kind: 'configure',
    taxonomy: 'settings.capabilities.agent_package.hide',
    delegated_surface: 'opl connect agent-packages hide --package-id <package_id>',
    payload_fields: ['package_id'],
    mutates: 'opl_agent_package_exposure_state',
    dry_run_supported: true,
    confirmation_required: false,
    danger_level: 'low',
    impact: 'Hides package exposure while keeping the package lock and carrier refs intact.',
    follow_up_action_ids: [],
    verify_action_id: 'agent_package_hide',
  },
  {
    action_id: 'agent_package_unhide',
    aliases: [],
    stable_id: 'unhide_agent_package',
    label: 'Unhide agent package',
    section_id: 'capabilities',
    task_kind: 'configure',
    taxonomy: 'settings.capabilities.agent_package.unhide',
    delegated_surface: 'opl connect agent-packages unhide --package-id <package_id>',
    payload_fields: ['package_id'],
    mutates: 'opl_agent_package_exposure_state',
    dry_run_supported: true,
    confirmation_required: false,
    danger_level: 'low',
    impact: 'Restores package exposure without changing package core or carrier materialization.',
    follow_up_action_ids: [],
    verify_action_id: 'agent_package_unhide',
  },
  {
    action_id: 'agent_package_enable',
    aliases: [],
    stable_id: 'enable_agent_package',
    label: 'Enable agent package',
    section_id: 'capabilities',
    task_kind: 'configure',
    taxonomy: 'settings.capabilities.agent_package.enable',
    delegated_surface: 'opl connect agent-packages enable --package-id <package_id>',
    payload_fields: ['package_id'],
    mutates: 'opl_agent_package_exposure_state',
    dry_run_supported: true,
    confirmation_required: false,
    danger_level: 'low',
    impact: 'Enables package exposure without reinstalling or claiming domain readiness.',
    follow_up_action_ids: [],
    verify_action_id: 'agent_package_enable',
  },
  {
    action_id: 'agent_package_disable',
    aliases: [],
    stable_id: 'disable_agent_package',
    label: 'Disable agent package',
    section_id: 'capabilities',
    task_kind: 'configure',
    taxonomy: 'settings.capabilities.agent_package.disable',
    delegated_surface: 'opl connect agent-packages disable --package-id <package_id>',
    payload_fields: ['package_id'],
    mutates: 'opl_agent_package_exposure_state',
    dry_run_supported: true,
    confirmation_required: false,
    danger_level: 'low',
    impact: 'Disables package exposure without uninstalling the package core lock.',
    follow_up_action_ids: [],
    verify_action_id: 'agent_package_disable',
  },
  {
    action_id: 'agent_package_home_shortcut_preferences_set',
    aliases: [],
    stable_id: 'set_agent_package_home_shortcut_preferences',
    label: 'Set Home shortcut preference',
    section_id: 'capabilities',
    task_kind: 'configure',
    taxonomy: 'settings.capabilities.agent_package.home_shortcut_preferences',
    delegated_surface: 'opl connect agent-packages home-shortcut-preferences set --package-id <package_id> --shortcut-id <shortcut_id>',
    payload_fields: ['package_id', 'shortcut_id', 'visible', 'sort_order'],
    mutates: 'opl_agent_package_home_shortcut_preferences',
    dry_run_supported: true,
    confirmation_required: false,
    danger_level: 'low',
    impact: 'Persists user Home shortcut visibility/order preferences without owning App layout policy or agent domain semantics.',
    follow_up_action_ids: [],
    verify_action_id: 'agent_package_home_shortcut_preferences_set',
  },
] as const satisfies readonly AgentPackageActionCatalogEntry[];

export function findAgentPackageAction(actionId: string): AgentPackageActionCatalogEntry | null {
  return AGENT_PACKAGE_ACTION_CATALOG.find((entry) =>
    entry.action_id === actionId || entry.aliases.some((alias) => alias === actionId)
  ) ?? null;
}

export function agentPackageDelegatedSurface(actionId: string) {
  return findAgentPackageAction(actionId)?.delegated_surface ?? null;
}

export function listAgentPackageSettingsActions() {
  return AGENT_PACKAGE_ACTION_CATALOG.map(({ aliases: _aliases, ...entry }) => ({
    ...entry,
    payload_fields: [...entry.payload_fields],
    follow_up_action_ids: [...entry.follow_up_action_ids],
  }));
}
