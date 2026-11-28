import { isRecord } from '@opl/core';
import {
  OPL_CLOUD_SOFTWARE_SOURCE_ID,
  officialPackageInstallSource,
  officialPackagePrivateSourceId,
  officialPackageRuntimeRoot,
  officialPackageSelectedVersion,
  readOfficialCatalogSelection,
  readCachedOfficialPackageCatalog,
  type CloudEntitledPackage,
  type InstalledPackageRecord,
  type OfficialPackageCatalogEntry,
  type OfficialPackageCatalogOptions,
  type PackStore,
} from '@opl/pack';
import type { CloudPackageOverlayInput } from '../rpc/cloud-software-source.ts';

function localized(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(['en-US', 'zh-CN'].flatMap(locale => {
    const text = value[locale];
    return typeof text === 'string' && text.trim() ? [[locale, text]] : [];
  }));
}

function projectEntry(entry: OfficialPackageCatalogEntry, runtimeRoot: string | null, online: boolean) {
  const manifest = entry.manifest;
  if (manifest?.package_id !== entry.package_id) return;
  const restricted = entry.visibility === 'authorized_only';
  const summary = entry.public_summary;
  if (restricted && (!summary || typeof summary.owner_source_repo !== 'string'
    || !summary.owner_source_repo || summary.owner_source_repo !== manifest.source_repo)) return;

  // Restricted entries expose only their owner-approved public description.
  const presentation = restricted ? summary : manifest.presentation;
  const name = restricted ? summary?.display_name : manifest.display_name;
  if (typeof name !== 'string' || !name.trim()) return;
  const displayNames = localized(isRecord(presentation) && presentation.display_name_i18n);
  const descriptions = localized(isRecord(presentation) && presentation.description_i18n);
  let installable = false;
  let selectedVersion: string | null = null;
  if (!restricted) {
    try {
      selectedVersion = officialPackageSelectedVersion(entry);
      if (online || runtimeRoot) {
        try { officialPackageInstallSource(entry, online ? null : runtimeRoot); }
        catch (error) {
          if (!online || !runtimeRoot) throw error;
          officialPackageInstallSource(entry, runtimeRoot);
        }
        installable = true;
      }
    } catch { /* Keep the listing visible when this installation lacks a source. */ }
  }
  const installAction = {
    action_id: 'agent_package_install',
    action_ref: 'app_state.actions#agent_package_install',
    required_payload_fields: ['package_id'],
    payload: { package_id: entry.package_id },
    confirmation_required: true,
    semantic: 'install',
  };
  return {
    package_id: entry.package_id,
    display_name: name,
    display_name_i18n: displayNames,
    description: descriptions['en-US'] ?? descriptions['zh-CN'] ?? '',
    description_i18n: descriptions,
    software_type: entry.software_type,
    catalog_scope: entry.software_type === 'dependency' || ['mac-media-assets', 'mas-scholar-skills'].includes(entry.package_id) ? 'dependency' : 'software',
    management_scope: 'opl_packages',
    deployment_target: 'local',
    dependency_readiness: { status: 'unknown' },
    ...(typeof manifest.icon_ref === 'string' && !restricted ? { icon_ref: manifest.icon_ref } : {}),
    catalog_origin: 'opl',
    origin_basis: 'owner_projection',
    catalog_source: { manager: 'opl_packages', delivery: 'marketplace', marketplace_id: 'public-registry:opl' },
    ...(restricted ? {} : {
      publisher: manifest.publisher,
      package_role: manifest.package_role ?? (entry.software_type === 'agent' ? 'standard_agent' : undefined),
      selected_version: selectedVersion,
    }),
    installed: false,
    activated: false,
    install_state: 'not_installed',
    package_access: {
      visibility: entry.visibility, status: restricted ? 'unknown' : 'public',
      discover_allowed: true, download_allowed: installable,
    },
    installability: installable
      ? { installable: true }
      : { installable: false, reason: restricted ? 'authorization_required' : 'package_install_source_unavailable' },
    available_actions: installable ? [installAction] : [],
    ...(installable ? { recommended_action: installAction.action_id, recommended_action_ref: installAction } : {}),
  };
}

type CatalogRow = NonNullable<ReturnType<typeof projectEntry>>;
type PrivatePackageAccessInfo = {
  readonly sourceId: string;
  readonly selectedVersion: string;
};
export type SoftwareCatalogSnapshot = {
  readonly status: 'loading' | 'ready' | 'unavailable' | 'stale';
  readonly entries: ReadonlyMap<string, CatalogRow>;
  readonly repositories: ReadonlyMap<string, string>;
  readonly privateAccess?: ReadonlyMap<string, PrivatePackageAccessInfo>;
};

export function projectCatalogEntries(snapshot: SoftwareCatalogSnapshot, installedIds: ReadonlySet<string>): CatalogRow[] {
  return [...snapshot.entries.values()].filter(entry => !installedIds.has(entry.package_id));
}

function buildRestrictedInstallAction(packageId: string) {
  return {
    action_id: 'agent_package_install',
    action_ref: 'app_state.actions#agent_package_install',
    required_payload_fields: ['package_id'],
    payload: { package_id: packageId },
    confirmation_required: true,
    semantic: 'install',
  };
}

function buildUnlistedEntitledEntry(pkg: CloudEntitledPackage) {
  const installAction = buildRestrictedInstallAction(pkg.package_id);
  const displayName = pkg.display_name || pkg.package_id;
  return {
    package_id: pkg.package_id,
    display_name: displayName,
    display_name_i18n: { 'en-US': displayName, 'zh-CN': displayName },
    description: pkg.description ?? '',
    description_i18n: pkg.description ? { 'en-US': pkg.description, 'zh-CN': pkg.description } : {},
    software_type: pkg.software_type ?? 'agent',
    catalog_scope: pkg.software_type === 'dependency' ? 'dependency' : 'software',
    management_scope: 'opl_packages',
    deployment_target: 'local',
    dependency_readiness: { status: 'unknown' },
    catalog_origin: 'opl',
    origin_basis: 'owner_projection',
    catalog_source: { manager: 'opl_packages', delivery: 'marketplace', marketplace_id: OPL_CLOUD_SOFTWARE_SOURCE_ID },
    ...(pkg.selected_version ? { selected_version: pkg.selected_version } : {}),
    installed: false,
    activated: false,
    install_state: 'not_installed',
    package_access: {
      visibility: 'authorized_only',
      status: 'authorized',
      provider_id: 'opl_cloud',
      discover_allowed: true,
      download_allowed: true,
    },
    installability: { installable: true },
    available_actions: [installAction],
    recommended_action: installAction.action_id,
    recommended_action_ref: installAction,
  };
}

export function applyAuthorizedPrivatePackageOverlay<
  T extends { readonly directory: { readonly entries: readonly Record<string, unknown>[] } },
>(
  agentPackages: T,
  catalog: SoftwareCatalogSnapshot,
  authorizedSourceIds: ReadonlySet<string>,
  installedPackages: ReadonlyArray<Pick<InstalledPackageRecord, 'package_id' | 'origin' | 'install_mode'>>,
  store: Pick<PackStore, 'getInstallSource'>,
  projectCurrentness?: (packageId: string, installed: string, selected: string) => {
    package_currentness: string; update?: { action_id: string };
  },
  cloudEntitlements?: CloudPackageOverlayInput,
): T {
  const hasGithubAuth = Boolean(authorizedSourceIds.size && catalog.privateAccess?.size);
  if (!hasGithubAuth && !cloudEntitlements) return agentPackages;
  const installedById = new Map(installedPackages.map(pkg => [pkg.package_id, pkg]));
  const existingIds = new Set<string>();
  let changed = false;
  const entries = agentPackages.directory.entries.map(entry => {
    const packageId = typeof entry.package_id === 'string' ? entry.package_id : '';
    if (packageId) existingIds.add(packageId);
    const priv = catalog.privateAccess?.get(packageId);
    const cloudPkg = packageId ? cloudEntitlements?.packages.get(packageId) : undefined;
    const githubAuthed = Boolean(priv && authorizedSourceIds.has(priv.sourceId));
    const access = isRecord(entry.package_access) ? entry.package_access : undefined;
    const isRestricted = Boolean(priv) || access?.visibility === 'authorized_only';
    if (cloudPkg || githubAuthed) {
      const providerId = cloudPkg ? 'opl_cloud' : 'github_packages';
      const resolvedSelectedVersion = priv?.selectedVersion ?? cloudPkg?.selected_version;
      if (entry.installed === true) {
        const pkg = installedById.get(packageId);
        const updateSource = pkg && entry.catalog_origin === 'opl' && pkg.origin === 'opl' && pkg.install_mode === 'release'
          ? store.getInstallSource(packageId)
          : null;
        const selectedVersion = updateSource?.kind === 'official' && updateSource.package_id === packageId ? resolvedSelectedVersion : undefined;
        const currentness = selectedVersion && typeof entry.installed_version === 'string'
          ? projectCurrentness?.(packageId, entry.installed_version, selectedVersion) : undefined;
        changed = true;
        return {
          ...entry,
          ...(selectedVersion && { selected_version: selectedVersion }),
          ...currentness,
          ...(currentness?.update && Array.isArray(entry.available_actions)
            && { available_actions: [...entry.available_actions, currentness.update] }),
          package_access: { visibility: 'authorized_only', status: 'authorized', provider_id: providerId, discover_allowed: true, download_allowed: true },
        };
      }
      changed = true;
      const installAction = buildRestrictedInstallAction(packageId);
      return {
        ...entry,
        ...(resolvedSelectedVersion ? { selected_version: resolvedSelectedVersion } : {}),
        package_access: {
          visibility: 'authorized_only',
          status: 'authorized',
          provider_id: providerId,
          discover_allowed: true,
          download_allowed: true,
        },
        installability: { installable: true },
        available_actions: [installAction],
        recommended_action: installAction.action_id,
        recommended_action_ref: installAction,
      };
    }
    if (isRestricted && entry.installed !== true && cloudEntitlements
      && (cloudEntitlements.status === 'authorized' || cloudEntitlements.status === 'expired' || cloudEntitlements.status === 'forbidden')) {
      changed = true;
      const accessStatus = cloudEntitlements.status === 'expired' ? 'expired' : 'forbidden';
      const reason = cloudEntitlements.status === 'expired'
        ? 'gateway_session_expired'
        : cloudEntitlements.status === 'forbidden'
          ? 'cloud_entitlement_forbidden'
          : 'package_not_entitled';
      return {
        ...entry,
        package_access: {
          visibility: 'authorized_only',
          status: accessStatus,
          provider_id: 'opl_cloud',
          reason,
          discover_allowed: true,
          download_allowed: false,
        },
        installability: { installable: false, reason },
      };
    }
    return entry;
  });
  if (cloudEntitlements?.status === 'authorized') {
    for (const pkg of cloudEntitlements.packages.values()) {
      if (existingIds.has(pkg.package_id) || !pkg.selected_version) continue;
      changed = true;
      entries.push(buildUnlistedEntitledEntry(pkg));
    }
  }
  if (!changed) return agentPackages;
  return {
    ...agentPackages,
    directory: { ...agentPackages.directory, entries },
  };
}

function normalizedRepository(repository: string): string {
  return repository.replace(/\/$/, '').replace(/\.git$/, '');
}

export function isOfficialCatalogPackage(snapshot: SoftwareCatalogSnapshot, packageId: string, repository?: string): boolean {
  const owner = snapshot.repositories.get(packageId);
  return Boolean(owner && repository && normalizedRepository(repository) === owner);
}

/** All fast readers share the in-flight lookup. The renderer receives a change event once it settles. */
export class OfficialSoftwareCatalog {
  #snapshot: SoftwareCatalogSnapshot = { status: 'loading', entries: new Map(), repositories: new Map(), privateAccess: new Map() };
  #refreshAfter = 0;
  #pending?: Promise<void>;
  readonly #onChange: () => void;
  readonly #options: OfficialPackageCatalogOptions;

  constructor(onChange: () => void, options: OfficialPackageCatalogOptions = {}) {
    this.#onChange = onChange;
    this.#options = options;
    const cached = options.db && readCachedOfficialPackageCatalog(options.db);
    if (cached) this.#snapshot = this.#project(cached.entries, null, false);
  }

  read(): SoftwareCatalogSnapshot {
    if (Date.now() >= this.#refreshAfter) {
      this.#refreshAfter = Infinity;
      queueMicrotask(() => { void this.refresh(); });
    }
    return this.#snapshot;
  }

  async refresh(): Promise<SoftwareCatalogSnapshot> {
    this.#refreshAfter = Infinity;
    this.#pending ??= this.#refresh().finally(() => { this.#pending = undefined; });
    await this.#pending;
    return this.#snapshot;
  }

  #project(catalog: ReadonlyMap<string, OfficialPackageCatalogEntry>, runtimeRoot: string | null, online: boolean): SoftwareCatalogSnapshot {
    const entries = new Map<string, CatalogRow>();
    const repositories = new Map<string, string>();
    const privateAccess = new Map<string, PrivatePackageAccessInfo>();
    for (const entry of catalog.values()) {
      const row = projectEntry(entry, runtimeRoot, online);
      if (row) entries.set(row.package_id, row);
      const owner = entry.manifest?.source_repo;
      if (typeof owner === 'string' && owner) repositories.set(entry.package_id, normalizedRepository(owner));
      if (entry.visibility === 'authorized_only') {
        const sourceId = officialPackagePrivateSourceId(entry);
        if (sourceId) {
          try {
            const source = officialPackageInstallSource(entry, runtimeRoot, { allowAuthorizedOnly: true });
            if (source.version) privateAccess.set(entry.package_id, { sourceId, selectedVersion: source.version });
          } catch { /* Unavailable private or offline source stays non-installable. */ }
        }
      }
    }
    return { status: online ? 'ready' : 'stale', entries, repositories, privateAccess };
  }

  async #refresh(): Promise<void> {
    try {
      const runtimeRoot = officialPackageRuntimeRoot(this.#options);
      const { entries, online } = await readOfficialCatalogSelection({ ...this.#options, runtimeRoot });
      this.#snapshot = this.#project(entries, runtimeRoot, online);
      this.#refreshAfter = Date.now() + (online ? 5 * 60_000 : 30_000);
    } catch {
      const previous = this.#snapshot;
      const status = ['ready', 'stale'].includes(previous.status) ? 'stale' : 'unavailable';
      this.#refreshAfter = Date.now() + 30_000;
      if (previous.status === status) return;
      this.#snapshot = { ...previous, status };
    }
    this.#onChange();
  }
}
