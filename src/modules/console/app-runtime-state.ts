import type { JsonRecord } from '../../kernel/json-record.ts';
import {
  buildOplModules,
  canonicalAgentPackageId,
  createOplAgentPackageStatusReader,
  readStandardAgentDescriptorForDomain,
} from '../connect/public/app-state.ts';
import { listWorkspaceBindings } from '../workspace/public/app-state.ts';
import { buildAppRuntimeWorkItemProjection } from './app-runtime-work-item-projection.ts';
import type { InventoryDescriptorResolver } from './work-item-projection/inventory.ts';

const RUNTIME_READ_POLICY = 'local_inventory_and_execution_session_sqlite_plus_fresh_cached_runtime_observation_only';
export const APP_RUNTIME_STATE_PROFILE_V1_CAPABILITY_ID = 'opl_app.runtime_state_profile.v1';

function nowIso() {
  return new Date().toISOString();
}

export type BuildOplRuntimeAppStateInput = {
  generatedAt?: string;
  now?: () => number;
  buildModules?: typeof buildOplModules;
  createPackageStatusReader?: typeof createOplAgentPackageStatusReader;
  readDescriptor?: typeof readStandardAgentDescriptorForDomain;
  listBindings?: typeof listWorkspaceBindings;
  buildProjection?: typeof buildAppRuntimeWorkItemProjection;
};

type RuntimeModuleInspection = ReturnType<typeof buildOplModules>['modules']['modules'][number];

function buildRuntimeProjectionDependencies(
  input: BuildOplRuntimeAppStateInput,
  includeModuleInventory: boolean,
) {
  const packageProjectionItems: JsonRecord[] = [];
  const packageStatusById: Record<string, JsonRecord> = {};
  const selectedModules = new Map<string, RuntimeModuleInspection>();
  const descriptorByAgent = new Map<
    string,
    ReturnType<typeof readStandardAgentDescriptorForDomain>
  >();
  const buildModules = input.buildModules ?? buildOplModules;
  const createPackageStatusReader = input.createPackageStatusReader
    ?? createOplAgentPackageStatusReader;
  const readDescriptor = input.readDescriptor ?? readStandardAgentDescriptorForDomain;
  let readPackageStatus: ReturnType<typeof createOplAgentPackageStatusReader> | null = null;

  if (includeModuleInventory) {
    for (const module of buildModules({ profile: 'fast' }).modules.modules) {
      if (!module.default_install) continue;
      const packageId = canonicalAgentPackageId(module.module_id);
      if (!packageId) continue;
      selectedModules.set(packageId, module);
      packageProjectionItems.push({
        package_id: packageId,
        source_present: module.installed,
        source_origin: module.install_origin,
        source_path: module.checkout_path,
        managed_source_path: module.managed_checkout_path,
        source_health_status: module.health_status,
      });
      packageStatusById[packageId] = {
        status: module.installed ? 'available' : 'unavailable',
        codex_visible: module.installed,
        launch_allowed: null,
        source_path: module.checkout_path,
      };
    }
  }

  const resolveDescriptor: InventoryDescriptorResolver = (agentId) => {
    if (descriptorByAgent.has(agentId)) {
      return descriptorByAgent.get(agentId) ?? null;
    }
    readPackageStatus ??= createPackageStatusReader();
    const descriptor = readDescriptor(
      agentId,
      readPackageStatus,
      (moduleId) => {
        const packageId = canonicalAgentPackageId(moduleId);
        const selected = packageId ? selectedModules.get(packageId) : null;
        return selected
          ? {
              installed: selected.installed,
              install_origin: selected.install_origin,
              checkout_path: selected.checkout_path,
              health_status: selected.health_status,
            }
          : null;
      },
    );
    descriptorByAgent.set(agentId, descriptor);
    return descriptor;
  };

  return { packageProjectionItems, packageStatusById, resolveDescriptor };
}

export function buildOplRuntimeAppState(input: BuildOplRuntimeAppStateInput = {}) {
  const now = input.now ?? Date.now;
  const startedAt = now();
  const generatedAt = input.generatedAt ?? nowIso();
  const bindings = (input.listBindings ?? listWorkspaceBindings)();
  const dependencies = buildRuntimeProjectionDependencies(input, bindings.length > 0);
  const workItemProjectionV2 = (input.buildProjection ?? buildAppRuntimeWorkItemProjection)({
    profile: 'fast',
    generatedAt,
    bindings,
    ...dependencies,
  });

  return {
    version: 'g2',
    app_state: {
      schema_version: 'opl_app_state.v1',
      surface_kind: 'opl_app_state.v1',
      meta: {
        profile: 'runtime',
        capabilities: [APP_RUNTIME_STATE_PROFILE_V1_CAPABILITY_ID],
        projection_detail_profile: 'fast',
        generated_at: generatedAt,
        elapsed_ms: now() - startedAt,
        read_policy: RUNTIME_READ_POLICY,
        network_access_allowed: false,
        mutation_allowed: false,
        temporal_reconciliation_mode: 'background_updates_local_runtime_observation_gui_reads_cache_only',
      },
      operator: {
        workbench: {
          work_item_projection_v2: workItemProjectionV2,
        },
      },
    },
  };
}
