import { OfficialSoftwareCatalog } from './package-catalog.ts';
import { buildRunwayWorkbench } from './task-projection.ts';
import { ensureTaskVisibilitySchema } from './task-visibility.ts';
import { createDomainTaskInventoryReader, type DomainTaskInventory } from './domain-task-inventory.ts';
import { projectPackageDirectory, packageActions } from './package-projection.ts';
import { readAppPackagePreferences } from './app-package-preferences.ts';
import { projectUiContributions } from './ui-projection.ts';
import { readWorkspaceRoot, workspaceRootAction } from './workspace-root.ts';
import { connectionActions } from '../rpc/connection-actions.ts';
import { projectConnectionAuthorization } from './connection-authorization.ts';
import type { SqliteDb } from '@opl/core';
import { readLocalCodexAccessState, readOplGatewayAccount, withGatewayStateDirectory, type ConnectService } from '@opl/connect';
import type { InstalledPackageRecord, PackService } from '@opl/pack';
import { gatewayAccountActions } from '../rpc/gateway-actions.ts';

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
    model: access.model,
    reasoning_effort: access.reasoning_effort,
    config_path: access.config_path,
  };
}

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
  readonly knowledge_sources: readonly Record<string, unknown>[];
  readonly connections: ReturnType<ConnectService['list']>;
  readonly grants?: ReturnType<ConnectService['listProjection']>['grants'];
  readonly invocations?: ReturnType<ConnectService['listProjection']>['invocations'];
  readonly tasks: readonly Record<string, unknown>[];
  readonly schedules: readonly Record<string, unknown>[];
  readonly recent_operations?: ReturnType<PackService['operationStatus']>;
  readonly app_state: {
    readonly operator: { readonly workbench: ReturnType<typeof buildRunwayWorkbench> };
    readonly agent_packages: ReturnType<typeof projectPackageDirectory>;
    readonly ui_contributions: ReturnType<typeof projectUiContributions>;
    readonly actions: readonly Record<string, unknown>[];
    readonly packages: readonly ProjectedPackageSummary[];
    readonly installed_packages: readonly ProjectedPackageSummary[];
    readonly workspaces: readonly Record<string, unknown>[];
    readonly connections: ReturnType<ConnectService['list']>;
    readonly tasks: readonly Record<string, unknown>[];
    readonly schedules: readonly Record<string, unknown>[];
    readonly paths?: { readonly workspace_root: ReturnType<typeof readWorkspaceRoot>; readonly workspace_root_path: string | null };
    readonly settings_control_center?: {
      readonly app_settings_read_model: {
        readonly connections: { readonly authorization: ReturnType<typeof projectConnectionAuthorization> };
        readonly workspace_services?: { readonly workspace_root: ReturnType<typeof readWorkspaceRoot> };
        readonly opl_gateway_account?: ReturnType<typeof readOplGatewayAccount>;
        readonly codex_model_policy?: ReturnType<typeof readCodexModelPolicy>;
      };
    };
  };
}

export class AppStateCache {
  readonly #db: SqliteDb;
  readonly #packService: PackService;
  readonly #connectService: ConnectService;
  readonly #version: string;
  readonly #catalog: OfficialSoftwareCatalog;
  readonly #inventoryReader = createDomainTaskInventoryReader();
  #lastInventory: DomainTaskInventory | undefined;
  #revision = 1;
  #fastSnapshot: AppStateSnapshot | null = null;
  #fullSnapshot: AppStateSnapshot | null = null;

  constructor(options: {
    readonly db: SqliteDb;
    readonly packService: PackService;
    readonly connectService: ConnectService;
    readonly version: string;
    readonly onCatalogChanged?: () => void;
  }) {
    this.#db = options.db;
    ensureTaskVisibilitySchema(this.#db);
    this.#packService = options.packService;
    this.#connectService = options.connectService;
    this.#version = options.version;
    this.#catalog = new OfficialSoftwareCatalog(() => {
      this.invalidate();
      options.onCatalogChanged?.();
    });
  }

  get revision(): number {
    return this.#revision;
  }

  invalidate(): void {
    this.#revision += 1;
    this.#fastSnapshot = null;
    this.#fullSnapshot = null;
  }

  getState(profile: 'fast' | 'full' = 'fast', gatewayStateDir?: string): AppStateSnapshot {
    const snapshot = this.#getSharedState(profile);
    if (!gatewayStateDir) return snapshot;
    const workspaceRoot = readWorkspaceRoot(gatewayStateDir);

    // Only the trusted App/CLI reads private account settings. Keep them out
    // of shared snapshots and observe account changes made by another process.
    let account: ReturnType<typeof readOplGatewayAccount> | undefined;
    try {
      account = withGatewayStateDirectory(gatewayStateDir, readOplGatewayAccount);
    } catch {
      // The dedicated Gateway status RPC reports an unreadable private store.
    }
    return {
      ...snapshot,
      app_state: {
        ...snapshot.app_state,
        paths: { ...snapshot.app_state.paths, workspace_root: workspaceRoot, workspace_root_path: workspaceRoot.selected_path },
        actions: [...(snapshot.app_state.actions ?? []), ...(account ? gatewayAccountActions : []), ...connectionActions, ...(workspaceRoot.source === 'env' ? [] : [workspaceRootAction])],
        settings_control_center: {
          ...snapshot.app_state.settings_control_center,
          app_settings_read_model: {
            ...snapshot.app_state.settings_control_center?.app_settings_read_model,
            connections: { authorization: projectConnectionAuthorization(this.#connectService.listProjection()) },
            workspace_services: { workspace_root: workspaceRoot },
            codex_model_policy: readCodexModelPolicy(),
            ...(account && { opl_gateway_account: account }),
          },
        },
      },
    };
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

    const knowledgeSources = this.#db
      .prepare(
        'SELECT source_id, scope, adapter_kind, root_path, accepted_revision, status, updated_at FROM knowledge_sources ORDER BY updated_at DESC, rowid DESC',
      )
      .all() as Record<string, unknown>[];

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
        operator: { workbench: buildRunwayWorkbench(this.#db, packages, generatedAt, inventory) },
        agent_packages: projectPackageDirectory(installed, preferences, catalog),
        ui_contributions: projectUiContributions(appPackages),
        actions: [...packageActions, {
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
