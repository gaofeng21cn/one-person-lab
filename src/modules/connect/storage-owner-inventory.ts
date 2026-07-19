import fs from 'node:fs';
import path from 'node:path';

import { isRecord } from '../../kernel/contract-validation.ts';
import { resolveOplStatePaths } from '../../kernel/runtime-state-paths.ts';
import { assertSafePersistedPackagePath } from './agent-package-registry-parts/persisted-path-safety.ts';
import { resolveCodexHome } from './agent-package-registry-parts/shared.ts';
import { readLockIndex } from './agent-package-registry-parts/store.ts';
import type { AgentPackageLockIndex } from './agent-package-registry-parts/types.ts';
import {
  agentPackageStorageNavigationAction,
  webuiHostActionRequired,
  writeStorageOwnerInventoryProjection,
  type StorageOwnerProjection,
} from './storage-owner-inventory-snapshot.ts';

export const STORAGE_SCAN_DEFAULT_MAX_ENTRIES = 20_000;
export const STORAGE_SCAN_DEFAULT_DEADLINE_MS = 750;
export const STORAGE_OWNER_INVENTORY_MAX_OWNER_ROWS = 256;

export type StorageScanReason =
  | 'path_not_absolute'
  | 'path_unsafe'
  | 'path_missing'
  | 'path_not_directory'
  | 'path_symlink'
  | 'permission_denied'
  | 'path_changed_during_scan'
  | 'deadline_exceeded'
  | 'entry_limit_exceeded'
  | 'scan_error'
  | null;

export type StoragePathUsage = {
  complete: boolean;
  reason_code: StorageScanReason;
  bytes: number | null;
  entry_count: number;
  excluded_root_count: number;
};

type OwnedStorageRoots = {
  roots: string[];
  owner_count: number;
  reason_code: 'inventory_source_invalid' | 'runtime_source_unmeasured' | 'path_unsafe'
    | 'entry_limit_exceeded' | null;
};

function unknownUsage(reasonCode: Exclude<StorageScanReason, null>, entryCount = 0): StoragePathUsage {
  return {
    complete: false,
    reason_code: reasonCode,
    bytes: null,
    entry_count: entryCount,
    excluded_root_count: 0,
  };
}

function isSameOrInside(root: string, candidate: string) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === ''
    || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function scanFailureReason(error: unknown, rootWasVisible: boolean): Exclude<StorageScanReason, null> {
  const code = (error as NodeJS.ErrnoException)?.code;
  if (code === 'EACCES' || code === 'EPERM') return 'permission_denied';
  if (code === 'ENOENT') return rootWasVisible ? 'path_changed_during_scan' : 'path_missing';
  return 'scan_error';
}

export function scanStoragePath(
  candidate: string,
  options: {
    root?: string;
    excludedRoots?: string[];
    maxEntries?: number;
    deadlineMs?: number;
    now?: () => number;
  } = {},
): StoragePathUsage {
  if (!path.isAbsolute(candidate)) return unknownUsage('path_not_absolute');
  const resolved = path.resolve(candidate);
  const root = path.resolve(options.root ?? candidate);
  if (resolved === path.parse(resolved).root || !isSameOrInside(root, resolved)) {
    return unknownUsage('path_unsafe');
  }
  const excludedRoots = (options.excludedRoots ?? [])
    .filter((entry) => path.isAbsolute(entry))
    .map((entry) => path.resolve(entry));
  if (excludedRoots.some((excluded) => isSameOrInside(excluded, resolved))) {
    return unknownUsage('path_unsafe');
  }

  let rootStat: fs.Stats;
  try {
    rootStat = fs.lstatSync(resolved);
  } catch (error) {
    return unknownUsage(scanFailureReason(error, false));
  }
  if (rootStat.isSymbolicLink()) return unknownUsage('path_symlink');
  if (!rootStat.isDirectory()) return unknownUsage('path_not_directory');

  const maxEntries = Math.max(0, Math.trunc(options.maxEntries ?? STORAGE_SCAN_DEFAULT_MAX_ENTRIES));
  if (maxEntries === 0) return unknownUsage('entry_limit_exceeded');
  const now = options.now ?? Date.now;
  const deadline = now() + Math.max(0, options.deadlineMs ?? STORAGE_SCAN_DEFAULT_DEADLINE_MS);
  const stack = [resolved];
  let bytes = 0;
  let entryCount = 0;
  let excludedRootCount = 0;

  while (stack.length > 0) {
    if (now() >= deadline) return unknownUsage('deadline_exceeded', entryCount);
    if (entryCount >= maxEntries) return unknownUsage('entry_limit_exceeded', entryCount);
    const current = stack.pop()!;
    if (excludedRoots.some((excluded) => isSameOrInside(excluded, current))) {
      excludedRootCount += 1;
      continue;
    }
    try {
      const stat = fs.lstatSync(current);
      entryCount += 1;
      bytes += stat.size;
      if (stat.isSymbolicLink() || !stat.isDirectory()) continue;
      const directory = fs.opendirSync(current);
      try {
        while (true) {
          if (now() >= deadline) return unknownUsage('deadline_exceeded', entryCount);
          if (entryCount + stack.length >= maxEntries) {
            return unknownUsage('entry_limit_exceeded', entryCount);
          }
          const entry = directory.readSync();
          if (!entry) break;
          const child = path.join(current, entry.name);
          if (excludedRoots.some((excluded) => isSameOrInside(excluded, child))) {
            entryCount += 1;
            excludedRootCount += 1;
            continue;
          }
          stack.push(child);
        }
      } finally {
        directory.closeSync();
      }
    } catch (error) {
      return unknownUsage(scanFailureReason(error, true), entryCount);
    }
  }

  return {
    complete: true,
    reason_code: null,
    bytes,
    entry_count: entryCount,
    excluded_root_count: excludedRootCount,
  };
}

function safePhysicalRoot(
  candidate: string,
  pathKind: 'plugin_payload_cache' | 'codex_plugin_cache' | 'marketplace_root',
) {
  const stateDir = resolveOplStatePaths().state_dir;
  const allowedRoots = pathKind === 'plugin_payload_cache'
    ? [path.join(stateDir, 'agent-package-payloads')]
    : pathKind === 'codex_plugin_cache'
      ? [path.join(resolveCodexHome(), 'plugins', 'cache')]
      : [path.join(stateDir, 'codex-plugin-marketplaces')];
  return assertSafePersistedPackagePath({
    candidatePath: candidate,
    allowedRoots,
    pathKind: `storage_inventory.${pathKind}`,
  });
}

function safeManagedRuntimeRoot(candidate: string, pathKind: 'checkout' | 'preparation') {
  const stateDir = resolveOplStatePaths().state_dir;
  const allowedRoots = pathKind === 'preparation'
    ? [path.join(stateDir, 'agent-package-runtime-envs')]
    : [
        path.join(stateDir, 'agent-package-runtime-generations'),
        path.join(stateDir, 'agent-package-developer-runtime-snapshots'),
      ];
  return assertSafePersistedPackagePath({
    candidatePath: candidate,
    allowedRoots,
    pathKind: `storage_inventory.managed_runtime_source.${pathKind}`,
  });
}

function minimalMeasurementRoots(roots: string[]) {
  const ordered = [...new Set(roots.map((entry) => path.resolve(entry)))]
    .sort((left, right) => left.length - right.length || left.localeCompare(right));
  const kept: string[] = [];
  for (const candidate of ordered) {
    if (!kept.some((root) => isSameOrInside(root, candidate))) kept.push(candidate);
  }
  return kept;
}

function collectOwnedStorageRoots(index: AgentPackageLockIndex): OwnedStorageRoots {
  let reasonCode: OwnedStorageRoots['reason_code'] = null;
  const roots: string[] = [];
  const currentLocks: unknown[] = Array.isArray(index.packages) ? index.packages : [];
  if (!Array.isArray(index.packages)) reasonCode = 'inventory_source_invalid';
  const lkgLocks: unknown[] = [];
  if (index.last_known_good_transactions !== undefined
    && !Array.isArray(index.last_known_good_transactions)) reasonCode = 'inventory_source_invalid';
  for (const transaction of Array.isArray(index.last_known_good_transactions)
    ? index.last_known_good_transactions
    : []) {
    if (!isRecord(transaction) || !Array.isArray(transaction.package_locks)) {
      reasonCode = 'inventory_source_invalid';
      continue;
    }
    lkgLocks.push(...transaction.package_locks);
  }
  const locks = [...currentLocks, ...lkgLocks];
  if (locks.length > STORAGE_OWNER_INVENTORY_MAX_OWNER_ROWS) {
    return { roots: [], owner_count: locks.length, reason_code: 'entry_limit_exceeded' };
  }

  const addRoot = (candidate: unknown, resolver: (value: string) => string) => {
    if (candidate === null || candidate === undefined) return;
    if (typeof candidate !== 'string' || !path.isAbsolute(candidate)) {
      reasonCode = reasonCode ?? 'path_unsafe';
      return;
    }
    try {
      roots.push(resolver(candidate));
    } catch {
      reasonCode = reasonCode ?? 'path_unsafe';
    }
  };

  for (const lock of locks) {
    if (!isRecord(lock)) {
      reasonCode = 'inventory_source_invalid';
      continue;
    }
    const physical = lock.physical_surface;
    if (physical !== null && physical !== undefined && !isRecord(physical)) {
      reasonCode = 'inventory_source_invalid';
    } else if (isRecord(physical) && physical.status === 'materialized') {
      addRoot(physical.plugin_payload_cache_path,
        (value) => safePhysicalRoot(value, 'plugin_payload_cache'));
      addRoot(physical.codex_plugin_cache_path,
        (value) => safePhysicalRoot(value, 'codex_plugin_cache'));
      addRoot(physical.marketplace_root,
        (value) => safePhysicalRoot(value, 'marketplace_root'));
    }

    const runtime = lock.managed_runtime_source;
    if (runtime === null || runtime === undefined) continue;
    if (!isRecord(runtime)) {
      reasonCode = 'inventory_source_invalid';
      continue;
    }
    if (runtime.status === 'validated_no_write' || runtime.status === 'removed') continue;
    if (runtime.status !== 'current' && runtime.status !== 'retained_on_uninstall') {
      reasonCode = 'inventory_source_invalid';
      continue;
    }
    if (runtime.ownership !== 'package_created') {
      reasonCode = reasonCode ?? 'runtime_source_unmeasured';
      continue;
    }
    addRoot(runtime.checkout_path, (value) => safeManagedRuntimeRoot(value, 'checkout'));
    addRoot(runtime.preparation_root, (value) => safeManagedRuntimeRoot(value, 'preparation'));
  }

  return {
    roots: minimalMeasurementRoots(roots),
    owner_count: locks.length,
    reason_code: reasonCode,
  };
}

function measureRoots(input: {
  roots: string[];
  scan: typeof scanStoragePath;
  clock: () => number;
  maxEntries: number;
  deadlineMs: number;
}) {
  const usageByRoot = new Map<string, StoragePathUsage>();
  const deadline = input.clock() + input.deadlineMs;
  let remainingEntries = input.maxEntries;
  for (const root of input.roots) {
    const remainingMs = Math.max(0, deadline - input.clock());
    const usage = remainingEntries <= 0
      ? unknownUsage('entry_limit_exceeded')
      : remainingMs <= 0
        ? unknownUsage('deadline_exceeded')
        : input.scan(root, {
            root,
            maxEntries: remainingEntries,
            deadlineMs: remainingMs,
            now: input.clock,
          });
    usageByRoot.set(root, usage);
    remainingEntries = Math.max(0, remainingEntries - usage.entry_count);
  }
  return usageByRoot;
}

function firstUnknownReason(usages: Iterable<StoragePathUsage>) {
  for (const usage of usages) if (!usage.complete) return usage.reason_code;
  return null;
}

function persistStorageProjection(
  section: 'agent_package_store' | 'webui_data_volume',
  projection: StorageOwnerProjection,
  persist: boolean,
) {
  if (!persist) return projection;
  try {
    writeStorageOwnerInventoryProjection(section, projection);
    return projection;
  } catch {
    return {
      ...projection,
      status: 'attention_required' as const,
      reason_code: 'inventory_cache_write_failed',
    } satisfies StorageOwnerProjection;
  }
}

export function buildAgentPackageStoreStorageInventory(input: {
  lockIndex?: AgentPackageLockIndex;
  now?: Date;
  persist?: boolean;
  scan?: typeof scanStoragePath;
  clock?: () => number;
  maxEntries?: number;
  deadlineMs?: number;
} = {}) {
  const clock = input.clock ?? Date.now;
  const now = input.now ?? new Date();
  const owned = collectOwnedStorageRoots(input.lockIndex ?? readLockIndex());
  const usageByRoot = measureRoots({
    roots: owned.roots,
    scan: input.scan ?? scanStoragePath,
    clock,
    maxEntries: input.maxEntries ?? STORAGE_SCAN_DEFAULT_MAX_ENTRIES,
    deadlineMs: input.deadlineMs ?? STORAGE_SCAN_DEFAULT_DEADLINE_MS,
  });
  const reasonCode = owned.reason_code ?? firstUnknownReason(usageByRoot.values());
  const bytesKnown = reasonCode === null
    && [...usageByRoot.values()].every((usage) => usage.complete);
  const projection: StorageOwnerProjection = {
    status: bytesKnown ? 'available' : 'attention_required',
    observed_at: now.toISOString(),
    stale: false,
    bytes: bytesKnown
      ? owned.roots.reduce((total, root) => total + (usageByRoot.get(root)?.bytes ?? 0), 0)
      : null,
    reclaimable_bytes: bytesKnown && owned.owner_count === 0 ? 0 : null,
    owner_route: '/settings/agents',
    projected_action: agentPackageStorageNavigationAction(),
    reason_code: reasonCode,
  };
  return persistStorageProjection('agent_package_store', projection, input.persist !== false);
}

function configuredWebuiDataDir(explicit?: string | null) {
  const value = explicit?.trim()
    || process.env.OPL_DATA_DIR?.trim()
    || process.env.AIONUI_DATA_DIR?.trim()
    || null;
  if (!value) return { data_dir: null, reason_code: 'webui_data_root_not_configured' } as const;
  if (!path.isAbsolute(value)) {
    return { data_dir: null, reason_code: 'named_volume_not_directly_observable' } as const;
  }
  return { data_dir: path.resolve(value), reason_code: null } as const;
}

export function buildWebuiDataVolumeStorageInventory(input: {
  dataDir?: string | null;
  projectsDir?: string | null;
  now?: Date;
  persist?: boolean;
  scan?: typeof scanStoragePath;
  clock?: () => number;
  maxEntries?: number;
  deadlineMs?: number;
} = {}) {
  const clock = input.clock ?? Date.now;
  const now = input.now ?? new Date();
  const configured = configuredWebuiDataDir(input.dataDir);
  if (!configured.data_dir) {
    const projection: StorageOwnerProjection = {
      status: configured.reason_code === 'webui_data_root_not_configured' ? 'not_configured' : 'unavailable',
      observed_at: now.toISOString(),
      stale: false,
      bytes: null,
      reclaimable_bytes: null,
      owner_route: '/settings/storage#webui-data',
      projected_action: webuiHostActionRequired(),
      reason_code: configured.reason_code,
    };
    return persistStorageProjection('webui_data_volume', projection, input.persist !== false);
  }

  const excludedRoots = [path.join(configured.data_dir, 'projects')];
  const explicitProjectsDir = input.projectsDir?.trim() || process.env.OPL_PROJECTS_DIR?.trim() || null;
  if (explicitProjectsDir && path.isAbsolute(explicitProjectsDir)
    && isSameOrInside(configured.data_dir, explicitProjectsDir)) {
    excludedRoots.push(path.resolve(explicitProjectsDir));
  }
  const usage = (input.scan ?? scanStoragePath)(configured.data_dir, {
    root: configured.data_dir,
    excludedRoots: [...new Set(excludedRoots)],
    maxEntries: input.maxEntries ?? STORAGE_SCAN_DEFAULT_MAX_ENTRIES,
    deadlineMs: input.deadlineMs ?? STORAGE_SCAN_DEFAULT_DEADLINE_MS,
    now: clock,
  });
  const unavailableReasons = new Set<StorageScanReason>([
    'path_not_absolute',
    'path_unsafe',
    'path_missing',
    'path_not_directory',
    'path_symlink',
    'permission_denied',
  ]);
  const projection: StorageOwnerProjection = {
    status: usage.complete
      ? 'available'
      : unavailableReasons.has(usage.reason_code) ? 'unavailable' : 'attention_required',
    observed_at: now.toISOString(),
    stale: false,
    bytes: usage.bytes,
    reclaimable_bytes: null,
    owner_route: '/settings/storage#webui-data',
    projected_action: webuiHostActionRequired(),
    reason_code: usage.reason_code,
  };
  return persistStorageProjection('webui_data_volume', projection, input.persist !== false);
}
