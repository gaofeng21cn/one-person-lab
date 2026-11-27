import { sharedPanelEntry } from '@opl/mcp-app-shared/bridge';
import fs from 'node:fs';
import semver from 'semver';
import { assertRequiredPackageDependency, resolveCodexPluginName, verifyManifestPathsExist, type InstalledPackageRecord, type PackStore } from '@opl/pack';

import { isOfficialCatalogPackage, projectCatalogEntries, type SoftwareCatalogSnapshot } from './package-catalog.ts';
import type { readAppPackagePreferences } from './app-package-preferences.ts';

type AppPreferences = ReturnType<typeof readAppPackagePreferences>;

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

const install = defineAction('agent_package_install', 'Install', ['package_id'], true);
const update = defineAction('agent_package_update', 'Update', ['package_id'], true);
const repair = defineAction('agent_package_repair', 'Repair', ['package_id'], true);
const updates = defineAction('settings_apply_opl_packages', 'Update packages', [], true);
export const packageActions = [install, update, repair, toggle, preferences, uninstall, contribution, updates,
  defineAction('package_operation_start', 'Start Package operation', ['action_id', 'package_id'], true),
  defineAction('package_operation_cancel', 'Cancel Package operation', ['operation_id'], false)];

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

export function projectPackageCurrentness(packageId: string, installed: string, selected?: string) {
  const currentness = selected === undefined || !semver.valid(selected) || !semver.valid(installed) ? 'unknown'
    : semver.gt(selected, installed) ? 'update_available' : 'current';
  return {
    package_currentness: currentness,
    update: currentness === 'update_available' ? rowAction(update, 'update', { package_id: packageId }) : undefined,
  };
}

function filesPresent(pkg: InstalledPackageRecord) {
  try {
    if (!fs.statSync(pkg.install_path).isDirectory()) return false;
    verifyManifestPathsExist(pkg.install_path, pkg.manifest, { allowSymlinks: pkg.install_mode === 'dev_link' });
    return true;
  } catch {
    return false;
  }
}

export function projectPackageDirectory(
  installed: readonly InstalledPackageRecord[], prefs: AppPreferences, catalog: SoftwareCatalogSnapshot,
  store: Pick<PackStore, 'getInstallSource'>,
) {
  const installedById = new Map(installed.map(pkg => [pkg.package_id, pkg]));
  const entries = installed.map(pkg => {
    const { identity, ui } = pkg.manifest;
    const appEnabled = prefs.enabled.get(pkg.package_id) ?? true;
    const enabled = pkg.enabled && appEnabled;
    const home = projectHomeShortcuts(pkg, prefs, enabled);
    const apps = ui?.mcp_apps ?? [];
    const miniApp = enabled && apps.length === 1
      ? { resource_uri: apps[0]!.resource_uri, arguments: {} }
      : sharedPanelEntry({ package_id: pkg.package_id, enabled, ui });
    const availableActions = [
      rowAction(toggle, 'app_enabled', { package_id: pkg.package_id, enabled: !appEnabled }),
    ];
    if (enabled && home.length) availableActions.push(rowAction(preferences, 'preferences', { package_id: pkg.package_id }));
    if (pkg.origin !== 'external') availableActions.push(rowAction(uninstall, 'uninstall', { package_id: pkg.package_id }));
    const description = identity.description ?? identity.summary;
    const catalogEntry = catalog.entries.get(pkg.package_id);
    const managed = pkg.origin === 'opl' && pkg.install_mode === 'release';
    const updateSource = managed ? store.getInstallSource(pkg.package_id) : null;
    const hasOfficialSource = updateSource?.kind === 'official' && updateSource.package_id === pkg.package_id;
    const officialRepository = isOfficialCatalogPackage(catalog, pkg.package_id, identity.repository);
    const official = officialRepository || hasOfficialSource;
    const selectedVersion = official && hasOfficialSource ? catalogEntry?.selected_version : undefined;
    const currentness = projectPackageCurrentness(pkg.package_id, pkg.version, selectedVersion ?? undefined);
    const dependency = catalogEntry?.catalog_scope === 'dependency' || pkg.intent === 'extension'
      || ['mac-media-assets', 'mas-scholar-skills'].includes(pkg.package_id);
    const missingDependencies = (pkg.manifest.dependencies?.packages ?? []).flatMap(requirement => {
      const provider = installedById.get(requirement.id);
      try {
        assertRequiredPackageDependency(pkg.package_id, requirement, provider?.enabled ? provider.manifest : null);
        return [];
      } catch {
        return [requirement.id];
      }
    });
    const files = enabled && filesPresent(pkg);
    const callable = files && missingDependencies.length === 0 && Boolean(
      pkg.manifest.provides?.contribution_handler || pkg.manifest.provides?.cli_extensions?.length
      || pkg.manifest.provides?.cli_bin?.length
      || pkg.manifest.ui?.mcp_apps?.length || pkg.manifest.ui?.dsh_client
      || (pkg.carrier_synced && (pkg.manifest.provides?.skills?.length || pkg.origin === 'external')),
    );
    if (currentness.update) availableActions.push(currentness.update);
    const repairAction = managed ? rowAction(repair, 'repair', { package_id: pkg.package_id }) : undefined;
    if (repairAction) availableActions.push(repairAction);
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
      ...(selectedVersion && { selected_version: selectedVersion }),
      activated: pkg.enabled,
      app_enabled: appEnabled,
      install_state: 'installed',
      catalog_scope: dependency ? 'dependency' : 'software',
      // Pack records install origin, not publisher identity. In particular,
      // installing an arbitrary tarball does not establish official status.
      catalog_origin: official ? 'opl' : pkg.origin === 'external' ? 'external' : 'unknown',
      origin_basis: 'owner_projection',
      catalog_source: { manager: pkg.origin === 'external' ? 'codex_plugin_manager' : 'opl_framework', delivery: 'local' },
      software_type: pkg.intent === 'app' ? 'application' : pkg.intent,
      package_role: pkg.intent === 'agent' ? 'standard_agent' : pkg.intent,
      source_kind: pkg.install_mode,
      distribution_channel: pkg.install_mode === 'dev_link' ? 'development' : 'release',
      presence: { present: true, callable },
      ...currentness,
      ...(repairAction && { repair: repairAction }),
      management_scope: catalogEntry?.management_scope ?? (pkg.origin === 'external' ? 'codex_plugin_manager' : 'opl_packages'),
      deployment_target: catalogEntry?.deployment_target ?? 'local',
      dependency_readiness: { status: missingDependencies.length ? 'missing' : 'ready', missing_package_ids: missingDependencies },
      package_access: catalog.entries.get(pkg.package_id)?.package_access ?? {
        visibility: 'public', status: 'unknown', discover_allowed: true, download_allowed: false,
      },
      ...((identity.icon || catalogEntry?.icon_ref) && { icon_ref: identity.icon ?? catalogEntry?.icon_ref }),
      readiness: enabled ? { status: 'installed' } : { status: 'disabled', launch_allowed: false },
      codex_surface_state: pkg.carrier_synced ? 'synced' : 'not_synced',
      home_shortcuts: home,
      home_shortcut_preferences: home.flatMap(shortcut => {
        const preference = prefs.shortcuts.get(pkg.package_id)?.get(shortcut.shortcut_id);
        return preference ? [{ shortcut_id: shortcut.shortcut_id, ...preference }] : [];
      }),
      ...(miniApp ? { miniapp_entry: miniApp } : {}),
      available_actions: availableActions,
    };
  });
  const missing = projectCatalogEntries(catalog, new Set(entries.map(entry => entry.package_id)));
  return {
    surface_kind: 'opl_app_agent_packages_projection',
    directory: {
      entries: [...entries, ...missing],
      entry_count: entries.length + missing.length,
      installed_package_count: installed.length,
      source_catalog_status: catalog.status,
    },
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
