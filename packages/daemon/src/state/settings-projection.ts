import fs from 'node:fs';
import path from 'node:path';
import { codexRuntimeRoot, codexStartupReady, managedCodexBinary, observedCodexVersion, resolveCodexBinary } from '@opl/runway';
import type { PackService } from '@opl/pack';
import type { ConnectService } from '@opl/connect';
import type { WorkspaceService } from '@opl/workspace';

export function projectCodexRuntime() {
  const runtimeRoot = codexRuntimeRoot(process.env);
  const managed = managedCodexBinary(process.env);
  let selected: ReturnType<typeof resolveCodexBinary> = null;
  try { selected = resolveCodexBinary(); } catch { /* Invalid configured executable. */ }
  const ready = selected !== null && codexStartupReady();
  const selectedVersion = selected && observedCodexVersion(selected.path);
  return {
    installed_version: observedCodexVersion(managed) ?? selectedVersion,
    selected_version: selectedVersion,
    parsed_version: selectedVersion,
    startup_ready: ready,
    executable_status: selected ? 'executable' : 'unavailable',
    runtime_root: runtimeRoot,
    runtime_binary_path: selected?.path ?? null,
    managed_binary_path: managed,
  };
}

function inventory(root: string) {
  let files = 0;
  let size = 0;
  let complete = true;
  const pending = [root];
  let visited = 0;
  while (pending.length) {
    const target = pending.pop()!;
    try {
      const stat = fs.lstatSync(target);
      if (stat.isFile()) {
        files += 1;
        size += stat.size;
      } else if (stat.isDirectory()) {
        const dir = fs.opendirSync(target);
        try {
          for (let entry = dir.readSync(); entry; entry = dir.readSync()) {
            if (++visited > 4096) {
              complete = false;
              pending.length = 0;
              break;
            }
            if (entry.isDirectory() || entry.isFile()) pending.push(path.join(target, entry.name));
          }
        } finally {
          dir.closeSync();
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') complete = false;
    }
  }
  return { path: root, size_bytes: size, file_count: files, complete };
}

export function readStorageLifecycle(pack: PackService) {
  return {
    surface_kind: 'opl_storage_lifecycle_projection.v1',
    read_only: true,
    package_cache: inventory(pack.cacheRoot),
    package_store: inventory(pack.packagesRoot),
  };
}

export function projectApplicationManagement(
  sources: ReturnType<WorkspaceService['listSources']>,
  connections: ReturnType<ConnectService['list']>,
  model: { model_access_ready: boolean; provider_name: string | null },
) {
  return {
    surface_kind: 'opl_application_management_projection.v1',
    shared_resources: [
      ...sources.map(source => ({
        resource_id: source.source_id, resource_kind: 'knowledge_source', label: source.source_id,
        status: source.status === 'active' ? 'ready' : 'attention',
        source_refs: ['knowledge_source:' + source.source_id], source_id: source.source_id,
        consumer_package_ids: [], owner_settings_route: 'settings.resources', relation_kind: 'configured',
        action_ids: ['knowledge_source_check', 'knowledge_source_configure', 'knowledge_source_disconnect'],
      })),
      ...connections.map(connection => ({
        resource_id: connection.connection_id, resource_kind: 'connection', label: connection.display_name,
        status: connection.status === 'active' ? 'ready' : 'attention',
        source_refs: ['connection:' + connection.connection_id], connection_id: connection.connection_id,
        consumer_package_ids: [], owner_settings_route: 'settings.connections', relation_kind: 'configured',
        action_ids: ['connection_test', 'connection_update', 'connection_delete'],
      })),
      {
        resource_id: 'codex-model-access', resource_kind: 'model', label: model.provider_name ?? 'Codex model access',
        status: model.model_access_ready ? 'ready' : 'attention', source_refs: ['app_state.core.codex'],
        consumer_package_ids: [], owner_settings_route: 'settings.model_access', relation_kind: 'configured',
      },
    ],
  };
}
