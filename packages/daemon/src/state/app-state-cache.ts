import path from 'node:path';
import {
  gatewayStorePaths,
  readLocalCodexAccessState,
  readOplGatewayAccount,
  resolveCodexHome,
  withGatewayStateDirectory,
  type ConnectService,
} from '@opl/connect';
import type { SqliteDb } from '@opl/core';
import type { InstalledPackageRecord, PackService } from '@opl/pack';
import type { ScheduleRunner } from '@opl/runway';
import type { WorkspaceService } from '@opl/workspace';
import { knowledgeSourceActions, projectKnowledgeSources } from '../rpc/knowledge-source-actions.ts';
import { projectApplicationManagement, projectCodexRuntime, readStorageLifecycle } from './settings-projection.ts';
import { codexInstallAction } from '../rpc/codex-runtime.ts';
import { connectionActions } from '../rpc/connection-actions.ts';
import { gatewayAccountActions } from '../rpc/gateway-actions.ts';
import { readCachedCloudPackageOverlay, readCloudSoftwareSourceSnapshot } from '../rpc/cloud-software-source.ts';
import { projectSoftwareSources, softwareSourceActions } from '../rpc/software-source-actions.ts';
import { readAppPackagePreferences } from './app-package-preferences.ts';
import { createCodexPersonalizationReader, type CodexPersonalizationSnapshot } from './codex-personalization.ts';
import { projectConnectionAuthorization } from './connection-authorization.ts';
import { createDomainTaskInventoryReader, type DomainTaskInventory } from './domain-task-inventory.ts';
import { fileStatFingerprint } from './file-stat-cache.ts';
import { applyAuthorizedPrivatePackageOverlay, OfficialSoftwareCatalog } from './package-catalog.ts';
import { packageActions, projectPackageCurrentness, projectPackageDirectory } from './package-projection.ts';
import { buildRunwayWorkbench } from './task-projection.ts';
import { ensureTaskVisibilitySchema } from './task-visibility.ts';
import { projectUiContributions } from './ui-projection.ts';
import { readWorkspaceRoot, workspaceRootAction } from './workspace-root.ts';

export interface ProjectedPackageSummary {
  readonly package_id: string;
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly intent: InstalledPackageRecord['intent'];
  readonly origin: InstalledPackageRecord['origin'];
  readonly carrier: 'codex' | null;
  readonly install_mode: InstalledPackageRecord['install_mode'];
  readonly install_path: string;
  readonly content_digest: string;
  readonly enabled: boolean;
  readonly carrier_synced: boolean;
  readonly codex_synced: boolean;
  readonly identity: InstalledPackageRecord['manifest']['identity'];
  readonly ui: InstalledPackageRecord['manifest']['ui'];
  readonly provides: InstalledPackageRecord['manifest']['provides'];
  readonly installed_at: string;
  readonly updated_at: string;
}

export function toProjectedPackageSummary(pkg: InstalledPackageRecord): ProjectedPackageSummary {
  const pluginName = pkg.manifest.host_hints?.codex?.plugin_name;
  const displayName = pluginName || pkg.manifest.identity.name['en-US'] || pkg.package_id;
  const carrier: 'codex' | null =
    pkg.origin === 'external' || pkg.carrier_synced ? 'codex' : null;
  return {
    package_id: pkg.package_id,
    id: pkg.package_id,
    name: displayName,
    version: pkg.version,
    intent: pkg.intent,
    origin: pkg.origin,
    carrier,
    install_mode: pkg.install_mode,
    install_path: pkg.install_path,
    content_digest: pkg.content_digest,
    enabled: pkg.enabled,
    carrier_synced: pkg.carrier_synced,
    codex_synced: pkg.carrier_synced,
    identity: pkg.manifest.identity,
    ui: pkg.manifest.ui,
    provides: pkg.manifest.provides,
    installed_at: pkg.installed_at,
    updated_at: pkg.updated_at,
  };
}

function readCodexModelPolicy() {
  const access = readLocalCodexAccessState();
  return {
    api_key_present: access.api_key_present,
    model_access_source: access.model_access_source,
    model_access_ready: access.model_access_ready,
    access_status: access.model_access_ready ? 'ready' : 'manual_required',
    provider_name: access.provider_name,
    provider_base_url: safeProviderUrl(access.provider_base_url),
    model: access.model,
    reasoning_effort: access.reasoning_effort,
    config_path: access.config_path,
  };
}

function safeProviderUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.origin + (url.pathname === '/' ? '' : url.pathname);
  } catch { return null; }
}

type CodexModelPolicySnapshot = ReturnType<typeof readCodexModelPolicy>;
type WorkspaceRootSnapshot = ReturnType<typeof readWorkspaceRoot>;
type SoftwareSourcesSnapshot = ReturnType<typeof projectSoftwareSources>;
type GatewayAccountSnapshot = ReturnType<typeof readOplGatewayAccount>;
type ConnectionAuthSnapshot = ReturnType<typeof projectConnectionAuthorization>;

export interface TransportBindingsCompatibilityProjection {
  readonly surface_kind: 'opl_app_transport_bindings_projection.v1';
  readonly status: 'unavailable';
  readonly reason: 'studio_owned_channel_runtime';
  readonly bindings: readonly never[];
}

const STUDIO_OWNED_TRANSPORT_BINDINGS: TransportBindingsCompatibilityProjection = Object.freeze({
  surface_kind: 'opl_app_transport_bindings_projection.v1',
  status: 'unavailable',
  reason: 'studio_owned_channel_runtime',
  bindings: [],
});

export interface AppStateSnapshot {
  readonly profile: 'fast' | 'full';
  readonly revision: number;
  readonly generated_at: string;
  readonly daemon: {
    readonly pid: number;
    readonly version: string;
    readonly api_version: string;
  };
  readonly packages: readonly ProjectedPackageSummary[];
  readonly installed_packages: readonly ProjectedPackageSummary[];
  readonly workspaces: readonly Record<string, unknown>[];
  readonly knowledge_sources: ReturnType<WorkspaceService['listSources']>;
  readonly connections: ReturnType<ConnectService['list']>;
  readonly grants?: ReturnType<ConnectService['listProjection']>['grants'];
  readonly invocations?: ReturnType<ConnectService['listProjection']>['invocations'];
  readonly recent_operations?: ReturnType<PackService['operationStatus']>;
  readonly tasks: readonly Record<string, unknown>[];
  readonly schedules: readonly Record<string, unknown>[];
  readonly app_state: {
    readonly meta: { readonly generated_at: string; readonly profile: 'fast' | 'full' };
    readonly core?: { readonly codex: ReturnType<typeof projectCodexRuntime> };
    readonly managed_update?: { readonly components: readonly Record<string, unknown>[] };
    readonly application_management?: ReturnType<typeof projectApplicationManagement>;
    readonly transport_bindings?: TransportBindingsCompatibilityProjection;
    readonly services?: { readonly runway: ReturnType<ScheduleRunner['getHealth']> };
    readonly operator: { readonly workbench: ReturnType<typeof buildRunwayWorkbench> };
    readonly agent_packages: ReturnType<typeof projectPackageDirectory> & { readonly sources?: SoftwareSourcesSnapshot };
    readonly ui_contributions: ReturnType<typeof projectUiContributions>;
    readonly actions: readonly Record<string, unknown>[];
    readonly packages: readonly ProjectedPackageSummary[];
    readonly installed_packages: readonly ProjectedPackageSummary[];
    readonly workspaces: readonly Record<string, unknown>[];
    readonly connections: ReturnType<ConnectService['list']>;
    readonly tasks: readonly Record<string, unknown>[];
    readonly schedules: readonly Record<string, unknown>[];
    readonly codex_personalization?: CodexPersonalizationSnapshot;
    readonly paths?: { readonly workspace_root: WorkspaceRootSnapshot; readonly workspace_root_path: string | null };
    readonly settings_control_center?: {
      readonly status_summary: Record<string, unknown>;
      readonly app_settings_read_model: {
        readonly connections: { readonly authorization: ConnectionAuthSnapshot };
        readonly workspace_services?: { readonly workspace_root: WorkspaceRootSnapshot };
        readonly opl_gateway_account?: GatewayAccountSnapshot;
        readonly codex_model_policy?: CodexModelPolicySnapshot;
        readonly resource_sources: ReturnType<typeof projectKnowledgeSources>;
        readonly storage_lifecycle: ReturnType<typeof readStorageLifecycle>;
        readonly local_environment: Record<string, unknown>;
      };
    };
  };
}

function codexAccessFingerprint(codexHome: string): string {
  const configStat = fileStatFingerprint(path.join(codexHome, 'config.toml'), true);
  const authStat = fileStatFingerprint(path.join(codexHome, 'auth.json'), true);
  const envFlags = [
    Boolean(process.env.OPL_CODEX_API_KEY?.trim()),
    Boolean(process.env.CODEX_API_KEY?.trim()),
    Boolean(process.env.OPENAI_API_KEY?.trim()),
  ].join(':');
  return `${codexHome}\0${configStat}\0${authStat}\0${envFlags}`;
}

export class AppStateCache {
  readonly #db: SqliteDb;
  readonly #packService: PackService;
  readonly #connectService: ConnectService;
  readonly #version: string;
  readonly #workspaceService: WorkspaceService;
  readonly #scheduleRunner: ScheduleRunner;
  #storageInventory?: { readAt: number; projection: ReturnType<typeof readStorageLifecycle> };
  #codexRuntimeCache?: { readAt: number; projection: ReturnType<typeof projectCodexRuntime> };
  readonly #catalog: OfficialSoftwareCatalog;
  readonly #inventoryReader = createDomainTaskInventoryReader();
  readonly #personalizationReader = createCodexPersonalizationReader();
  #lastInventory: DomainTaskInventory | undefined;
  #revision = 1;
  #fastSnapshot: AppStateSnapshot | null = null;
  #fullSnapshot: AppStateSnapshot | null = null;
  #connectionAuthorization: ConnectionAuthSnapshot | null = null;
  #softwareSources: SoftwareSourcesSnapshot | null = null;
  #workspaceRootCache: { envKey: string; selectedStat: string; value: WorkspaceRootSnapshot } | null = null;
  #codexPolicyCache = new Map<string, { fingerprint: string; value: CodexModelPolicySnapshot }>();
  #gatewayAccountCache = new Map<string, {
    key: string;
    staleAfterMs: number | null;
    value: GatewayAccountSnapshot | undefined;
  }>();
  #trustedSnapshots = new Map<string, {
    revision: number;
    workspaceRoot: WorkspaceRootSnapshot;
    codexModelPolicy: CodexModelPolicySnapshot;
    account: GatewayAccountSnapshot | undefined;
    authorization: ConnectionAuthSnapshot;
    personalization: CodexPersonalizationSnapshot;
    snapshot: AppStateSnapshot;
    codex: ReturnType<typeof projectCodexRuntime>;
    runwayStatus: ReturnType<ScheduleRunner['getHealth']>['status'];
  }>();

  constructor(options: {
    readonly db: SqliteDb;
    readonly packService: PackService;
    readonly connectService: ConnectService;
    readonly version: string;
    readonly workspaceService: WorkspaceService;
    readonly scheduleRunner: ScheduleRunner;
    readonly onCatalogChanged?: () => void;
  }) {
    this.#db = options.db;
    ensureTaskVisibilitySchema(this.#db);
    this.#packService = options.packService;
    this.#connectService = options.connectService;
    this.#version = options.version;
    this.#workspaceService = options.workspaceService;
    this.#scheduleRunner = options.scheduleRunner;
    this.#catalog = new OfficialSoftwareCatalog(() => {
      this.invalidate();
      options.onCatalogChanged?.();
    }, { db: this.#db });
  }

  get revision(): number {
    return this.#revision;
  }

  invalidate(): void {
    this.#revision += 1;
    this.#fastSnapshot = null;
    this.#fullSnapshot = null;
    this.#connectionAuthorization = null;
    this.#softwareSources = null;
    this.#workspaceRootCache = null;
    this.#personalizationReader.invalidate();
    this.#codexRuntimeCache = undefined;
    this.#trustedSnapshots.clear();
  }

  async refreshCatalog() {
    return this.#catalog.refresh();
  }

  #readWorkspaceRootCached(): WorkspaceRootSnapshot {
    const envKey = `${process.env.OPL_WORKSPACE_ROOT?.trim() || ''}\0${process.env.HOME?.trim() || ''}`;
    const cached = this.#workspaceRootCache;
    if (cached && cached.envKey === envKey) {
      const selectedStat = cached.value.selected_path ? fileStatFingerprint(cached.value.selected_path, true) : 'null';
      if (selectedStat === cached.selectedStat) return cached.value;
    }
    const value = readWorkspaceRoot(this.#db);
    this.#workspaceRootCache = {
      envKey,
      selectedStat: value.selected_path ? fileStatFingerprint(value.selected_path, true) : 'null',
      value,
    };
    return value;
  }

  #getConnectionAuthorization(): ConnectionAuthSnapshot {
    return (this.#connectionAuthorization ??= projectConnectionAuthorization(this.#connectService.listProjection()));
  }

  #readCodexPolicyCached(codexHome: string, fingerprint: string): CodexModelPolicySnapshot {
    const cached = this.#codexPolicyCache.get(codexHome);
    if (cached && cached.fingerprint === fingerprint) return cached.value;
    const value = readCodexModelPolicy();
    this.#codexPolicyCache.set(codexHome, { fingerprint, value });
    return value;
  }

  #readGatewayAccountCached(gatewayStateDir: string, codexFingerprint: string): GatewayAccountSnapshot | undefined {
    const gatewayPaths = withGatewayStateDirectory(gatewayStateDir, gatewayStorePaths);
    const key = [
      gatewayPaths.gateway_account_dir,
      fileStatFingerprint(gatewayPaths.gateway_account_dir, false),
      fileStatFingerprint(gatewayPaths.gateway_account_file, false),
      fileStatFingerprint(gatewayPaths.gateway_installation_file, false),
      codexFingerprint,
    ].join('\0');
    const cached = this.#gatewayAccountCache.get(gatewayStateDir);
    if (cached && cached.key === key && (cached.staleAfterMs === null || Date.now() < cached.staleAfterMs)) {
      return cached.value;
    }
    // Only the trusted App/CLI reads private account settings. Keep them out
    // of shared snapshots and observe account changes made by another process.
    let value: GatewayAccountSnapshot | undefined;
    try {
      value = withGatewayStateDirectory(gatewayStateDir, readOplGatewayAccount);
    } catch {
      // The dedicated Gateway status RPC reports an unreadable private store.
    }
    const staleAfterMs = value && !value.freshness.stale && value.freshness.stale_after
      ? Date.parse(value.freshness.stale_after)
      : null;
    this.#gatewayAccountCache.set(gatewayStateDir, {
      key,
      staleAfterMs: Number.isFinite(staleAfterMs) ? staleAfterMs : null,
      value,
    });
    return value;
  }

  getState(profile: 'fast' | 'full' = 'fast', gatewayStateDir?: string): AppStateSnapshot {
    const snapshot = this.#getSharedState(profile);
    if (!gatewayStateDir) return snapshot;

    const codexHome = resolveCodexHome();
    const codexFingerprint = codexAccessFingerprint(codexHome);
    const workspaceRoot = this.#readWorkspaceRootCached();
    const cloudSource = readCloudSoftwareSourceSnapshot(this.#db, gatewayStateDir);
    const cloudOverlay = readCachedCloudPackageOverlay(this.#db, gatewayStateDir);
    const sources = (this.#softwareSources ??= projectSoftwareSources(this.#db, this.#catalog.read().status, cloudSource));
    const codexModelPolicy = this.#readCodexPolicyCached(codexHome, codexFingerprint);
    const account = this.#readGatewayAccountCached(gatewayStateDir, codexFingerprint);
    const authorization = this.#getConnectionAuthorization();
    const personalization = this.#personalizationReader.read(this.#packService);
    const now = Date.now();
    if (!this.#codexRuntimeCache || now - this.#codexRuntimeCache.readAt >= 1_000) {
      this.#codexRuntimeCache = { readAt: Date.now(), projection: projectCodexRuntime() };
    }
    const codex = this.#codexRuntimeCache.projection;
    const runway = this.#scheduleRunner.getHealth();

    const trustedKey = `${profile}\0${gatewayStateDir}\0${codexHome}`;
    const prev = this.#trustedSnapshots.get(trustedKey);
    if (
      prev
      && prev.revision === this.#revision
      && prev.workspaceRoot.selected_path === workspaceRoot.selected_path
      && prev.workspaceRoot.source === workspaceRoot.source
      && prev.workspaceRoot.exists === workspaceRoot.exists
      && prev.workspaceRoot.writable === workspaceRoot.writable
      && prev.codexModelPolicy === codexModelPolicy
      && prev.account === account
      && prev.authorization === authorization
      && prev.personalization === personalization
      && prev.codex === codex
      && prev.runwayStatus === runway.status
      && now - (this.#storageInventory?.readAt ?? 0) < 30_000
    ) {
      return prev.snapshot;
    }

    const authorizedSources = new Set(
      sources.entries
        .filter(source => source.enabled && source.credential_handle_present && source.status === 'authorized')
        .map(source => source.source_id),
    );
    const agentPackages = applyAuthorizedPrivatePackageOverlay(
      snapshot.app_state.agent_packages,
      this.#catalog.read(),
      authorizedSources,
      snapshot.packages,
      this.#packService.store,
      projectPackageCurrentness,
      cloudOverlay,
    );

    const knowledgeSources = snapshot.knowledge_sources;
    if (!this.#storageInventory || Date.now() - this.#storageInventory.readAt >= 30_000) {
      this.#storageInventory = { readAt: Date.now(), projection: readStorageLifecycle(this.#packService) };
    }
    const trustedSnapshot: AppStateSnapshot = {
      ...snapshot,
      app_state: {
        ...snapshot.app_state,
        core: { codex },
        managed_update: { components: [{
          component_id: 'opl_base', lifecycle_owner: 'opl_base', state: 'current',
          current: { installed_version: this.#version, runtime_version: this.#version,
            build_identity: '@opl/daemon@' + this.#version, install_identity: process.argv[1] ?? null },
          auto_apply: { eligible: false, app_background_safe: false, command_ref: null },
          available_actions: [],
        }] },
        application_management: projectApplicationManagement(knowledgeSources, snapshot.connections, codexModelPolicy),
        transport_bindings: STUDIO_OWNED_TRANSPORT_BINDINGS,
        services: { runway },
        agent_packages: { ...agentPackages, sources },
        paths: { ...snapshot.app_state.paths, workspace_root: workspaceRoot, workspace_root_path: workspaceRoot.selected_path },
        actions: [...(snapshot.app_state.actions ?? []), ...(account ? gatewayAccountActions : []), ...connectionActions, ...knowledgeSourceActions, ...softwareSourceActions, codexInstallAction, ...(workspaceRoot.source === 'env' ? [] : [workspaceRootAction])],
        codex_personalization: personalization,
        settings_control_center: {
          status_summary: {
            codex_version: codex.installed_version,
            model_access: codexModelPolicy.access_status,
            runway: runway.status,
          },
          app_settings_read_model: {
            ...snapshot.app_state.settings_control_center?.app_settings_read_model,
            connections: { authorization },
            workspace_services: { workspace_root: workspaceRoot },
            codex_model_policy: codexModelPolicy,
            resource_sources: projectKnowledgeSources(knowledgeSources),
            storage_lifecycle: this.#storageInventory.projection,
            local_environment: {
              state_dir: this.#packService.stateDir,
              logs_dir: path.join(this.#packService.stateDir, 'logs'),
              runtime_root: codex.runtime_root,
              packages_root: this.#packService.packagesRoot,
              package_cache_root: this.#packService.cacheRoot,
            },
            ...(account && { opl_gateway_account: account }),
          },
        },
      },
    };
    this.#trustedSnapshots.set(trustedKey, {
      revision: this.#revision,
      workspaceRoot,
      codexModelPolicy,
      account,
      authorization,
      personalization,
      snapshot: trustedSnapshot,
      codex,
      runwayStatus: runway.status,
    });
    return trustedSnapshot;
  }

  #getSharedState(profile: 'fast' | 'full'): AppStateSnapshot {
    const catalog = this.#catalog.read();
    const previous = this.#fastSnapshot ?? this.#fullSnapshot;
    if (previous) {
      const inventory = this.#inventoryReader.read(previous.packages, previous.workspaces);
      if (inventory !== this.#lastInventory) this.invalidate();
    }
    const cached = profile === 'fast' ? this.#fastSnapshot : this.#fullSnapshot;
    if (cached) return cached;

    const installed = this.#packService.list();
    const packages = installed.map(toProjectedPackageSummary);
    const preferences = readAppPackagePreferences(this.#db);
    const appPackages = installed.filter(pkg => preferences.enabled.get(pkg.package_id) !== false);
    const workspaces = this.#db
      .prepare(
        'SELECT workspace_id, name, root_path, domain_id, revision, metadata_json, created_at, updated_at FROM workspaces ORDER BY created_at ASC, rowid ASC',
      )
      .all() as Record<string, unknown>[];

    const knowledgeSources = this.#workspaceService.listSources();

    const tasks = this.#db
      .prepare(
        'SELECT task_id, workspace_id, agent_id, title, status, revision, created_at, updated_at FROM tasks ORDER BY created_at DESC, rowid DESC LIMIT 100',
      )
      .all() as Record<string, unknown>[];

    const schedules = this.#db
      .prepare(
        'SELECT schedule_id, workspace_id, agent_id, cron_expr, overlap_policy, enabled, next_run_at, last_run_at, last_task_id, updated_at FROM schedules ORDER BY updated_at DESC, rowid DESC',
      )
      .all() as Record<string, unknown>[];

    const connections = this.#connectService.list();
    const generatedAt = new Date().toISOString();

    const inventory = this.#inventoryReader.read(packages, workspaces);
    this.#lastInventory = inventory;
    const base: AppStateSnapshot = {
      profile,
      revision: this.#revision,
      generated_at: generatedAt,
      daemon: {
        pid: process.pid,
        version: this.#version,
        api_version: '2.0',
      },
      packages,
      installed_packages: packages,
      workspaces,
      knowledge_sources: knowledgeSources,
      connections,
      tasks,
      schedules,
      app_state: {
        meta: { generated_at: generatedAt, profile },
        operator: { workbench: buildRunwayWorkbench(this.#db, packages, generatedAt, inventory) },
        agent_packages: projectPackageDirectory(installed, preferences, catalog, this.#packService.store),
        ui_contributions: projectUiContributions(appPackages),
        actions: [...packageActions, {
          action_id: 'runway_human_gate_resolve', label: 'Resolve human gate',
          owner: 'opl-framework', route: 'opld app.action.execute', delegated_surface: 'runway.humanGate.resolve',
          dry_run_supported: false, confirmation_required: false,
          payload_fields: ['stage_run_id', 'expected_revision', 'decision', 'notes', 'waived_debt_ids'],
        }, {
          action_id: 'work_item_visibility_set', label: 'Change work item visibility',
          owner: 'opl-framework', route: 'opld app.action.execute', dry_run_supported: true,
          confirmation_required: true, payload_fields: ['agent_id', 'project_id', 'work_item_id', 'visibility_state', 'expected_generation'],
        }],
        packages,
        installed_packages: packages,
        workspaces,
        connections,
        tasks,
        schedules,
      },
    };

    if (profile === 'fast') {
      this.#fastSnapshot = base;
      return base;
    }

    const projection = this.#connectService.listProjection();
    const recentOps = this.#packService.operationStatus();
    const full: AppStateSnapshot = {
      ...base,
      grants: projection.grants,
      invocations: projection.invocations,
      recent_operations: recentOps,
    };
    this.#fullSnapshot = full;
    return full;
  }
}
