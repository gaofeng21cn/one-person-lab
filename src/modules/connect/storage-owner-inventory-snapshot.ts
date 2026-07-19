import fs from 'node:fs';

import { isRecord } from '../../kernel/contract-validation.ts';
import { writeJsonPayloadFile } from '../../kernel/json-file.ts';
import { ensureOplStateDir, resolveOplStatePaths } from '../../kernel/runtime-state-paths.ts';
import { withAgentPackageLifecycleTransactionSync } from './agent-package-registry-parts/store.ts';

export const STORAGE_OWNER_INVENTORY_TTL_MS = 5 * 60 * 1000;
export const STORAGE_OWNER_INVENTORY_MAX_SNAPSHOT_BYTES = 262_144;

export type StorageHostActionAbi = {
  capability_id: 'carrier_host.storage.webui_data_volume.lifecycle';
  endpoint_status: 'host_action_required';
  endpoint_availability: 'host_owner_injected';
  plan_action_id: string | null;
  execute_action_id: string | null;
  restore_action_id: string | null;
};

export type StorageProjectedAction = {
  kind: 'navigate' | 'host_action_required';
  status: 'available' | 'host_action_required';
  action_id: string | null;
  route: string;
  dry_run_required: boolean;
  execution_owner?: 'carrier_host';
  host_action_abi?: StorageHostActionAbi;
};

export type StorageOwnerProjection = {
  status: 'available' | 'attention_required' | 'unavailable' | 'not_configured';
  observed_at: string | null;
  stale: boolean;
  bytes: number | null;
  reclaimable_bytes: number | null;
  owner_route: string;
  projected_action: StorageProjectedAction;
  reason_code?: string | null;
};

export type StorageOwnerInventorySnapshot = {
  surface_kind: 'opl_storage_owner_inventory_snapshot.v1';
  version: 1;
  updated_at: string | null;
  agent_package_store: StorageOwnerProjection;
  webui_data_volume: StorageOwnerProjection;
};

const STORAGE_REASON_CODES = new Set([
  'inventory_cache_missing_or_invalid',
  'inventory_cache_stale',
  'inventory_cache_write_failed',
  'inventory_source_invalid',
  'runtime_source_unmeasured',
  'path_not_absolute',
  'path_unsafe',
  'path_missing',
  'path_not_directory',
  'path_symlink',
  'permission_denied',
  'path_changed_during_scan',
  'deadline_exceeded',
  'entry_limit_exceeded',
  'scan_error',
  'webui_data_root_not_configured',
  'named_volume_not_directly_observable',
]);

function numericOrNull(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function stringOrNull(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function isoTimestampOrNull(value: unknown) {
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function reasonCodeOrNull(value: unknown) {
  return typeof value === 'string' && STORAGE_REASON_CODES.has(value) ? value : null;
}

export function agentPackageStorageNavigationAction(): StorageProjectedAction {
  return {
    kind: 'navigate',
    status: 'available',
    action_id: null,
    route: '/settings/agents',
    dry_run_required: false,
  };
}

export function webuiHostActionRequired(): StorageProjectedAction {
  return {
    kind: 'host_action_required',
    status: 'host_action_required',
    action_id: null,
    route: '/settings/storage#webui-data',
    dry_run_required: true,
    execution_owner: 'carrier_host',
    host_action_abi: {
      capability_id: 'carrier_host.storage.webui_data_volume.lifecycle',
      endpoint_status: 'host_action_required',
      endpoint_availability: 'host_owner_injected',
      plan_action_id: null,
      execute_action_id: null,
      restore_action_id: null,
    },
  };
}

function unavailableProjection(ownerRoute: string, action: StorageProjectedAction): StorageOwnerProjection {
  return {
    status: 'unavailable',
    observed_at: null,
    stale: true,
    bytes: null,
    reclaimable_bytes: null,
    owner_route: ownerRoute,
    projected_action: action,
    reason_code: 'inventory_cache_missing_or_invalid',
  };
}

function emptySnapshot(): StorageOwnerInventorySnapshot {
  return {
    surface_kind: 'opl_storage_owner_inventory_snapshot.v1',
    version: 1,
    updated_at: null,
    agent_package_store: unavailableProjection('/settings/agents', agentPackageStorageNavigationAction()),
    webui_data_volume: unavailableProjection('/settings/storage#webui-data', webuiHostActionRequired()),
  };
}

function normalizeProjection(
  value: unknown,
  fallback: StorageOwnerProjection,
  now: Date,
): StorageOwnerProjection {
  if (!isRecord(value)) return fallback;
  const declaredStatus = value.status;
  if (declaredStatus !== 'available' && declaredStatus !== 'attention_required'
    && declaredStatus !== 'unavailable' && declaredStatus !== 'not_configured') return fallback;
  const observedAt = isoTimestampOrNull(value.observed_at);
  const observedMs = observedAt ? Date.parse(observedAt) : Number.NaN;
  if (!Number.isFinite(observedMs) || observedMs > now.getTime()) return fallback;
  const stale = now.getTime() - observedMs > STORAGE_OWNER_INVENTORY_TTL_MS;
  const carriesCapacity = declaredStatus === 'available' || declaredStatus === 'attention_required';
  const bytes = carriesCapacity ? numericOrNull(value.bytes) : null;
  const status = declaredStatus === 'available' && bytes === null
    ? 'attention_required'
    : stale && carriesCapacity ? 'attention_required' : declaredStatus;
  return {
    status,
    observed_at: observedAt,
    stale,
    bytes,
    reclaimable_bytes: carriesCapacity ? numericOrNull(value.reclaimable_bytes) : null,
    owner_route: fallback.owner_route,
    projected_action: fallback.projected_action,
    reason_code: stale
      ? reasonCodeOrNull(value.reason_code) ?? 'inventory_cache_stale'
      : reasonCodeOrNull(value.reason_code),
  };
}

function normalizeAgentPackageProjection(value: unknown, now: Date) {
  return normalizeProjection(
    value,
    unavailableProjection('/settings/agents', agentPackageStorageNavigationAction()),
    now,
  );
}

function normalizeWebuiProjection(value: unknown, now: Date) {
  return normalizeProjection(
    value,
    unavailableProjection('/settings/storage#webui-data', webuiHostActionRequired()),
    now,
  );
}

function readBoundedStorageSnapshot(filePath: string) {
  let descriptor: number | null = null;
  try {
    const pathStat = fs.lstatSync(filePath);
    if (!pathStat.isFile() || pathStat.isSymbolicLink()
      || pathStat.size > STORAGE_OWNER_INVENTORY_MAX_SNAPSHOT_BYTES) return null;
    const noFollow = typeof fs.constants.O_NOFOLLOW === 'number' ? fs.constants.O_NOFOLLOW : 0;
    descriptor = fs.openSync(filePath, fs.constants.O_RDONLY | noFollow);
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile() || stat.size > STORAGE_OWNER_INVENTORY_MAX_SNAPSHOT_BYTES
      || (pathStat.dev !== 0 && stat.dev !== 0 && pathStat.dev !== stat.dev)
      || (pathStat.ino !== 0 && stat.ino !== 0 && pathStat.ino !== stat.ino)) return null;
    const buffer = Buffer.allocUnsafe(STORAGE_OWNER_INVENTORY_MAX_SNAPSHOT_BYTES + 1);
    let bytesRead = 0;
    while (bytesRead < buffer.length) {
      const count = fs.readSync(descriptor, buffer, bytesRead, buffer.length - bytesRead, null);
      if (count === 0) break;
      bytesRead += count;
    }
    if (bytesRead > STORAGE_OWNER_INVENTORY_MAX_SNAPSHOT_BYTES) return null;
    return JSON.parse(buffer.subarray(0, bytesRead).toString('utf8')) as unknown;
  } catch {
    return null;
  } finally {
    if (descriptor !== null) fs.closeSync(descriptor);
  }
}

export function readStorageOwnerInventorySnapshot(options: { now?: Date } = {}) {
  const now = options.now ?? new Date();
  const empty = emptySnapshot();
  const parsed = readBoundedStorageSnapshot(resolveOplStatePaths().storage_owner_inventory_snapshot_file);
  if (!isRecord(parsed)
    || parsed.surface_kind !== empty.surface_kind
    || parsed.version !== empty.version) return empty;
  return {
    ...empty,
    updated_at: isoTimestampOrNull(parsed.updated_at),
    agent_package_store: normalizeAgentPackageProjection(parsed.agent_package_store, now),
    webui_data_volume: normalizeWebuiProjection(parsed.webui_data_volume, now),
  } satisfies StorageOwnerInventorySnapshot;
}

export function writeStorageOwnerInventoryProjection(
  section: 'agent_package_store' | 'webui_data_volume',
  projection: StorageOwnerProjection,
) {
  return withAgentPackageLifecycleTransactionSync(false, () => {
    const paths = ensureOplStateDir();
    const now = new Date();
    const current = readStorageOwnerInventorySnapshot({ now });
    const sanitized = section === 'agent_package_store'
      ? normalizeAgentPackageProjection(projection, now)
      : normalizeWebuiProjection(projection, now);
    const next: StorageOwnerInventorySnapshot = {
      ...current,
      updated_at: now.toISOString(),
      [section]: sanitized,
    };
    writeJsonPayloadFile(paths.storage_owner_inventory_snapshot_file, next);
    return next;
  });
}

export function compactStorageOwnerProjection(
  value: unknown,
  section: 'agent_package_store' | 'webui_data_volume',
) {
  const now = new Date();
  const normalized = section === 'agent_package_store'
    ? normalizeAgentPackageProjection(value, now)
    : normalizeWebuiProjection(value, now);
  return {
    status: normalized.status,
    observed_at: normalized.observed_at,
    stale: normalized.stale,
    bytes: normalized.bytes,
    reclaimable_bytes: normalized.reclaimable_bytes,
    owner_route: normalized.owner_route,
    projected_action: normalized.projected_action,
    reason_code: normalized.reason_code ?? null,
  };
}

export function compactStorageOwnerInventorySnapshot(value: unknown) {
  const snapshot = isRecord(value) ? value : {};
  return {
    surface_kind: 'opl_settings_storage_owner_read_model.v1',
    snapshot_updated_at: stringOrNull(snapshot.snapshot_updated_at ?? snapshot.updated_at),
    agent_package_store: compactStorageOwnerProjection(snapshot.agent_package_store, 'agent_package_store'),
    webui_data_volume: compactStorageOwnerProjection(snapshot.webui_data_volume, 'webui_data_volume'),
  };
}
