import { resolveCodexPluginName, type InstalledPackageRecord } from '@opl/pack';

type AppPreferences = {
  enabled: Map<string, boolean>;
  shortcuts: Map<string, Map<string, { visible: boolean | null; sort_order: number | null }>>;
};

function defineAction(id: string, label: string, fields: string[], confirmation: boolean) {
  return {
    action_id: id,
    label,
    owner: 'opl-framework',
    route: 'opld app.action.execute',
    payload_fields: fields,
    confirmation_required: confirmation,
    dry_run_supported: true,
  };
}

const toggle = defineAction('package_app_set_enabled', 'Enable in OPL App', ['package_id', 'enabled'], false);
const preferences = defineAction('agent_package_preferences_set', 'Edit home shortcut', ['package_id', 'shortcut_id'], false);
const uninstall = defineAction('agent_package_uninstall', 'Uninstall', ['package_id'], true);
const contribution = defineAction('package_contribution_execute', 'Run package action', ['package_id', 'ref'], false);

export const packageActions = [toggle, preferences, uninstall, contribution];

function rowAction(definition: ReturnType<typeof defineAction>, semantic: string, payload: Record<string, unknown>) {
  return {
    action_id: definition.action_id,
    action_ref: 'app_state.actions#' + definition.action_id,
    semantic,
    payload,
    required_payload_fields: definition.payload_fields,
    confirmation_required: definition.confirmation_required,
  };
}

function projectHomeShortcuts(pkg: InstalledPackageRecord, prefs: AppPreferences, enabled: boolean) {
  const skills = pkg.manifest.provides?.skills ?? [];
  const defaults = skills.filter(skill => skill.exposure !== 'opt_in');
  return (pkg.manifest.identity.home_shortcuts ?? []).map((shortcut, index) => {
    const preference = prefs.shortcuts.get(pkg.package_id)?.get(shortcut.id);
    // Agent aliases and skill ids can differ. Resolve the declared target to
    // the installed carrier's unique default skill when no exact match exists.
    const skill = skills.find(entry => entry.id === shortcut.target.ref)
      ?? (defaults.length === 1 ? defaults[0] : undefined);
    const route = enabled && pkg.carrier_synced && shortcut.target.kind === 'agent' && skill
      ? {
          route_kind: 'agent_package_shortcut',
          executor: 'codex_cli',
          codex_visible_entry: resolveCodexPluginName(pkg.manifest) + ':' + skill.id,
        }
      : undefined;
    return {
      shortcut_id: shortcut.id,
      label_i18n: shortcut.label,
      default_visible: shortcut.default_visible ?? false,
      user_configurable: true,
      sort_order: preference?.sort_order ?? index,
      ...(route ? { route } : {}),
    };
  });
}

export function projectPackageDirectory(installed: readonly InstalledPackageRecord[], prefs: AppPreferences) {
  const entries = installed.map(pkg => {
    const { identity, ui } = pkg.manifest;
    const appEnabled = prefs.enabled.get(pkg.package_id) ?? true;
    const enabled = pkg.enabled && appEnabled;
    const home = projectHomeShortcuts(pkg, prefs, enabled);
    const apps = ui?.mcp_apps ?? [];
    const availableActions = [
      rowAction(toggle, 'app_enabled', { package_id: pkg.package_id, enabled: !appEnabled }),
    ];
    if (enabled && home.length) availableActions.push(rowAction(preferences, 'preferences', { package_id: pkg.package_id }));
    if (pkg.origin !== 'external') availableActions.push(rowAction(uninstall, 'uninstall', { package_id: pkg.package_id }));
    const description = identity.description ?? identity.summary;
    return {
      package_id: pkg.package_id,
      display_name: identity.name['en-US'] ?? pkg.package_id,
      display_name_i18n: identity.name,
      description: description['en-US'],
      description_i18n: description,
      session_routing_summary_i18n: identity.routing_summary,
      publisher: identity.publisher,
      installed: true,
      installed_version: pkg.version,
      activated: pkg.enabled,
      app_enabled: appEnabled,
      install_state: 'installed',
      catalog_scope: 'software',
      // Pack records install origin, not publisher identity. In particular,
      // installing an arbitrary tarball does not establish official status.
      catalog_origin: pkg.origin === 'external' ? 'external' : 'unknown',
      origin_basis: 'owner_projection',
      catalog_source: { manager: pkg.origin === 'external' ? 'codex_plugin_manager' : 'opl_framework', delivery: 'local' },
      software_type: pkg.intent === 'app' ? 'application' : pkg.intent,
      package_role: pkg.intent === 'agent' ? 'standard_agent' : pkg.intent,
      source_kind: pkg.install_mode,
      distribution_channel: pkg.install_mode === 'dev_link' ? 'development' : 'release',
      presence: { present: true },
      readiness: enabled ? { status: 'installed' } : { status: 'disabled', launch_allowed: false },
      codex_surface_state: pkg.carrier_synced ? 'synced' : 'not_synced',
      home_shortcuts: home,
      home_shortcut_preferences: home.flatMap(shortcut => {
        const preference = prefs.shortcuts.get(pkg.package_id)?.get(shortcut.shortcut_id);
        return preference ? [{ shortcut_id: shortcut.shortcut_id, ...preference }] : [];
      }),
      ...(enabled && apps.length === 1 ? { miniapp_entry: { resource_uri: apps[0]!.resource_uri, arguments: {} } } : {}),
      available_actions: availableActions,
    };
  });
  return {
    surface_kind: 'opl_app_agent_packages_projection',
    directory: { entries, entry_count: entries.length, installed_package_count: installed.length },
    status_index: {
      installed_package_count: installed.length,
      packages: Object.fromEntries(entries.map(entry => [entry.package_id, {
        package_id: entry.package_id,
        installed: true,
        enabled: entry.activated,
      }])),
    },
  };
}
