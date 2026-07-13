import fs from 'node:fs';
import path from 'node:path';

import { resolveProjectRoot } from './system-installation/shared.ts';
import { resolveCodexVersion } from './system-installation/engine-helpers.ts';
import { readOplFlowManagedDependencyIds } from './agent-package-registry.ts';
import {
  reconcileManagedCompanionTools,
  resolveMineruOpenApiTool,
  resolveOfficeCliTool,
  type OplCompanionToolSyncItem,
} from './install-companions-parts/tools.ts';

function packageVersion(packageName: string) {
  const packagePath = path.join(resolveProjectRoot(), 'node_modules', packageName, 'package.json');
  if (!fs.existsSync(packagePath)) return null;
  try {
    const payload = JSON.parse(fs.readFileSync(packagePath, 'utf8')) as { version?: unknown };
    return typeof payload.version === 'string' ? payload.version : null;
  } catch {
    return null;
  }
}

function toolDependency(tool: OplCompanionToolSyncItem | null, dependencyId: string) {
  return {
    dependency_id: dependencyId,
    dependency_kind: 'cli',
    installed: Boolean(tool?.binary_path),
    version: tool?.version ?? null,
    content_sha256: tool?.content_sha256 ?? null,
    ownership: tool?.ownership ?? 'missing',
    update_policy: tool?.ownership === 'opl_managed'
      ? 'silent_managed_reconcile'
      : tool?.ownership === 'app_bundled'
        ? 'updated_with_app_runtime_generation'
        : 'detect_only_no_overwrite',
    activation_policy: tool?.ownership === 'app_bundled'
      ? 'app_restart_generation_switch'
      : 'next_process_discovery',
    binary_path: tool?.binary_path ?? null,
    status: tool?.status ?? 'missing',
    note: tool?.note ?? null,
  };
}

export function inspectBaseManagedDependencies(home: string) {
  const codex = resolveCodexVersion({ skipLatestLookup: true });
  const codexRecord = codex as unknown as Record<string, unknown>;
  const codexPath = typeof codexRecord.binary_path === 'string' ? codexRecord.binary_path : null;
  const runtimeUpdater = codexRecord.runtime_substrate_updater && typeof codexRecord.runtime_substrate_updater === 'object'
    ? codexRecord.runtime_substrate_updater as Record<string, unknown>
    : null;
  const currentManagedPath = typeof runtimeUpdater?.current_binary_path === 'string'
    ? path.resolve(runtimeUpdater.current_binary_path)
    : null;
  const codexManaged = Boolean(codexPath && currentManagedPath && path.resolve(codexPath) === currentManagedPath);
  const temporalVersions = {
    client: packageVersion('@temporalio/client'),
    worker: packageVersion('@temporalio/worker'),
    workflow: packageVersion('@temporalio/workflow'),
  };
  const flowDependencyIds = readOplFlowManagedDependencyIds();
  const dependencies = [
    {
      dependency_id: 'codex-cli',
      dependency_kind: 'runtime_executor',
      installed: Boolean(codexPath),
      version: typeof codexRecord.version === 'string' ? codexRecord.version : null,
      ownership: codexManaged ? 'opl_managed' : codexPath ? 'global_path' : 'missing',
      update_policy: codexManaged ? 'silent_stage_verify' : 'detect_only_no_overwrite',
      activation_policy: codexManaged ? 'app_restart_generation_switch' : 'external_owner',
      binary_path: codexPath,
      status: codexRecord.version_status ?? 'unknown',
    },
    {
      dependency_id: 'temporal-runtime',
      dependency_kind: 'runtime_substrate',
      installed: Object.values(temporalVersions).some(Boolean),
      version: temporalVersions,
      ownership: 'opl_managed_runtime_generation',
      update_policy: 'updated_with_opl_base_framework_generation',
      activation_policy: 'app_launch_reconcile_generation_switch',
      binary_path: null,
      status: Object.values(temporalVersions).every(Boolean) ? 'ready' : 'attention_needed',
    },
    toolDependency(resolveOfficeCliTool(home), 'officecli'),
    toolDependency(resolveMineruOpenApiTool(home), 'mineru-open-api'),
  ];
  return {
    surface_kind: 'opl_base_managed_dependency_catalog.v1',
    lifecycle_owner: 'opl_base',
    flow_dependency_ids: flowDependencyIds,
    dependencies,
    summary: {
      total_count: dependencies.length,
      opl_managed_count: dependencies.filter((entry) => String(entry.ownership).startsWith('opl_managed')).length,
      detect_only_count: dependencies.filter((entry) => entry.update_policy === 'detect_only_no_overwrite').length,
    },
  };
}

export function reconcileBaseManagedDependencies(home: string) {
  const dependencyIds = new Set(readOplFlowManagedDependencyIds());
  const selectedTools = (['officecli', 'mineru-open-api'] as const).filter((id) => dependencyIds.has(id));
  const toolResults = selectedTools.length > 0
    ? reconcileManagedCompanionTools(home, [...selectedTools])
    : [];
  return {
    surface_kind: 'opl_base_managed_dependency_reconcile.v1',
    status: toolResults.some((entry) => entry.status === 'failed') ? 'attention_needed' : 'completed',
    selected_from_installed_package_dependency_closure: [...selectedTools],
    tool_results: toolResults,
    catalog: inspectBaseManagedDependencies(home),
  };
}
