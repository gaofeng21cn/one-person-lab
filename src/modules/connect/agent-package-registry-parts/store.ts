import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { FrameworkContractError, isRecord } from '../../../kernel/contract-validation.ts';
import {
  readJsonFileOrNull,
  readJsonReceiptLedger,
  upsertJsonReceipts,
  writeJsonPayloadFile,
  writeJsonReceiptLedger,
} from '../../../kernel/json-file.ts';
import { recordList, stringValue } from '../../../kernel/json-record.ts';
import { ensureOplStateDir, resolveOplStatePaths } from '../../../kernel/runtime-state-paths.ts';
import { canonicalAgentPackageId } from '../agent-package-identity.ts';
import { normalizeRegistryEntry } from './manifest-normalizers.ts';
import { nowIso } from './shared.ts';
import type {
  AgentPackageLifecycleLedger,
  AgentPackageLifecycleReceipt,
  AgentPackageLock,
  AgentPackageLockIndex,
  AgentPackageRegistryCache,
} from './types.ts';

type PackageLifecycleTransactionOptions = {
  timeoutMs?: number;
  retryMs?: number;
};

const PACKAGE_LIFECYCLE_LOCK_TIMEOUT_MS = 5_000;
const packageLifecycleTransactionContext = new AsyncLocalStorage<boolean>();

function packageLifecycleLockPath() {
  return path.join(ensureOplStateDir().state_dir, 'agent-package-lifecycle.sqlite');
}

function packageLifecycleLockTimeoutError(lockPath: string) {
  return new FrameworkContractError('runtime_state_lock_timeout', 'Timed out waiting for another agent package lifecycle transaction.', {
    lock_path: lockPath,
    owner_pid_alive: null,
    failure_code: 'agent_package_lifecycle_lock_timeout',
  });
}

function normalizedLockTiming(options: PackageLifecycleTransactionOptions) {
  return {
    timeoutMs: Number.isFinite(options.timeoutMs) && Number(options.timeoutMs) >= 0
      ? Number(options.timeoutMs)
      : PACKAGE_LIFECYCLE_LOCK_TIMEOUT_MS,
  };
}

function acquirePackageLifecycleLock(options: PackageLifecycleTransactionOptions) {
  const lockPath = packageLifecycleLockPath();
  const timing = normalizedLockTiming(options);
  const db = new DatabaseSync(lockPath);
  try {
    db.exec(`PRAGMA busy_timeout = ${Math.floor(timing.timeoutMs)};`);
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('CREATE TABLE IF NOT EXISTS lifecycle_mutex (singleton INTEGER PRIMARY KEY CHECK (singleton = 1));');
    db.exec('BEGIN IMMEDIATE;');
    return { db, path: lockPath };
  } catch (error) {
    db.close();
    const message = error instanceof Error ? error.message : String(error);
    if (/busy|locked/i.test(message)) throw packageLifecycleLockTimeoutError(lockPath);
    throw error;
  }
}

function releasePackageLifecycleLock(
  acquired: ReturnType<typeof acquirePackageLifecycleLock>,
  commit: boolean,
) {
  try {
    acquired.db.exec(commit ? 'COMMIT;' : 'ROLLBACK;');
  } finally {
    acquired.db.close();
  }
}

export async function withAgentPackageLifecycleTransaction<T>(
  dryRun: boolean,
  operation: () => Promise<T>,
  options: PackageLifecycleTransactionOptions = {},
): Promise<T> {
  if (dryRun || packageLifecycleTransactionContext.getStore()) {
    return await operation();
  }
  const acquired = acquirePackageLifecycleLock(options);
  try {
    const result = await packageLifecycleTransactionContext.run(true, operation);
    releasePackageLifecycleLock(acquired, true);
    return result;
  } catch (error) {
    releasePackageLifecycleLock(acquired, false);
    throw error;
  }
}

export function withAgentPackageLifecycleTransactionSync<T>(
  dryRun: boolean,
  operation: () => T,
  options: PackageLifecycleTransactionOptions = {},
): T {
  if (dryRun || packageLifecycleTransactionContext.getStore()) return operation();
  const acquired = acquirePackageLifecycleLock(options);
  try {
    const result = packageLifecycleTransactionContext.run(true, operation);
    releasePackageLifecycleLock(acquired, true);
    return result;
  } catch (error) {
    releasePackageLifecycleLock(acquired, false);
    throw error;
  }
}

function emptyLockIndex(): AgentPackageLockIndex {
  return {
    surface_kind: 'opl_agent_package_lock_index',
    version: 'opl-agent-package-lock-index.v1',
    packages: [],
    last_known_good_transactions: [],
  };
}

function emptyLifecycleLedger(): AgentPackageLifecycleLedger {
  return {
    surface_kind: 'opl_agent_package_lifecycle_ledger',
    version: 'opl-agent-package-lifecycle-ledger.v1',
    receipts: [],
  };
}

export function readLockIndex(): AgentPackageLockIndex {
  const parsed = readJsonFileOrNull(resolveOplStatePaths().agent_package_lock_file);
  if (!isRecord(parsed) || !Array.isArray(parsed.packages)) {
    return emptyLockIndex();
  }
  return {
    ...emptyLockIndex(),
    packages: recordList(parsed.packages).flatMap((entry) => {
      const declaredPackageId = stringValue(entry.package_id)?.toLowerCase() ?? null;
      const packageId = canonicalAgentPackageId(declaredPackageId);
      const lockRef = stringValue(entry.lock_ref);
      const declaredAgentId = stringValue(entry.agent_id)?.toLowerCase() ?? null;
      const agentId = declaredAgentId === null ? null : canonicalAgentPackageId(declaredAgentId);
      const agentIdentityValid = declaredAgentId === null || agentId === declaredAgentId;
      return packageId === declaredPackageId && agentIdentityValid && packageId && lockRef
        ? [{ ...entry, package_id: packageId, agent_id: agentId } as AgentPackageLock]
        : [];
    }),
    last_known_good_transactions: recordList(parsed.last_known_good_transactions ?? [])
      .filter((entry) => typeof entry.root_package_id === 'string'
        && typeof entry.transaction_id === 'string'
        && typeof entry.closure_digest === 'string'
        && Array.isArray(entry.package_locks)) as AgentPackageLockIndex['last_known_good_transactions'],
  };
}

export function readLifecycleLedger(): AgentPackageLifecycleLedger {
  return readJsonReceiptLedger(
    resolveOplStatePaths().agent_package_lifecycle_ledger_file,
    emptyLifecycleLedger,
    normalizeLifecycleReceipt,
  );
}

export function readRegistryCache() {
  const parsed = readJsonFileOrNull(resolveOplStatePaths().agent_package_registry_cache_file);
  if (!isRecord(parsed) || !Array.isArray(parsed.entries)) {
    return null;
  }
  const entries = recordList(parsed.entries).flatMap((entry, index) => {
    try {
      return [normalizeRegistryEntry(entry, index)];
    } catch (error) {
      // This cache is a non-authoritative read model; stale invalid rows cannot hide the built-in directory.
      if (error instanceof FrameworkContractError) return [];
      throw error;
    }
  });
  return {
    surface_kind: 'opl_agent_package_registry_cache' as const,
    version: 'opl-agent-package-registry-cache.v1' as const,
    refreshed_at: stringValue(parsed.refreshed_at) ?? nowIso(),
    registry_url: stringValue(parsed.registry_url) ?? '',
    registry_sha256: stringValue(parsed.registry_sha256) ?? '',
    entry_count: entries.length,
    entries,
  };
}

export function writeRegistryCache(cache: AgentPackageRegistryCache) {
  const paths = ensureOplStateDir();
  writeJsonPayloadFile(paths.agent_package_registry_cache_file, cache);
}

export function writeLockIndex(index: AgentPackageLockIndex) {
  const paths = ensureOplStateDir();
  writeJsonPayloadFile(paths.agent_package_lock_file, index);
}

function writeLifecycleLedger(ledger: AgentPackageLifecycleLedger) {
  const paths = ensureOplStateDir();
  writeJsonReceiptLedger(paths.agent_package_lifecycle_ledger_file, ledger);
}

export function appendReceipt(receipt: AgentPackageLifecycleReceipt) {
  const ledger = readLifecycleLedger();
  upsertJsonReceipts(ledger.receipts, [receipt], (entry, next) =>
    entry.receipt_ref === next.receipt_ref
  );
  writeLifecycleLedger(ledger);
}

export function writePackageTransaction(
  index: AgentPackageLockIndex,
  receipts: AgentPackageLifecycleReceipt[],
) {
  const paths = ensureOplStateDir();
  const previousLock = fs.existsSync(paths.agent_package_lock_file)
    ? fs.readFileSync(paths.agent_package_lock_file)
    : null;
  const previousLedger = fs.existsSync(paths.agent_package_lifecycle_ledger_file)
    ? fs.readFileSync(paths.agent_package_lifecycle_ledger_file)
    : null;
  const ledger = readLifecycleLedger();
  upsertJsonReceipts(ledger.receipts, receipts, (entry, next) =>
    entry.receipt_ref === next.receipt_ref
  );
  try {
    writeJsonPayloadFile(paths.agent_package_lock_file, index);
    writeJsonReceiptLedger(paths.agent_package_lifecycle_ledger_file, ledger);
  } catch (error) {
    if (previousLock) fs.writeFileSync(paths.agent_package_lock_file, previousLock);
    else fs.rmSync(paths.agent_package_lock_file, { force: true });
    if (previousLedger) fs.writeFileSync(paths.agent_package_lifecycle_ledger_file, previousLedger);
    else fs.rmSync(paths.agent_package_lifecycle_ledger_file, { force: true });
    throw error;
  }
}

function normalizeLifecycleReceipt(value: unknown): AgentPackageLifecycleReceipt | null {
  if (!isRecord(value)) {
    return null;
  }
  const receiptRef = stringValue(value.receipt_ref);
  const declaredPackageId = stringValue(value.package_id)?.toLowerCase() ?? null;
  const packageId = canonicalAgentPackageId(declaredPackageId);
  if (declaredPackageId && packageId !== declaredPackageId) return null;
  const physicalSurface = isRecord(value.physical_surface)
    ? value.physical_surface
    : value.physical_surface;
  const physicalPackageId = isRecord(physicalSurface)
    ? stringValue(physicalSurface.package_id)?.toLowerCase() ?? null
    : null;
  if (physicalPackageId && canonicalAgentPackageId(physicalPackageId) !== physicalPackageId) return null;
  return receiptRef
    ? {
        ...value,
        package_id: packageId,
        ...(physicalSurface ? { physical_surface: physicalSurface } : {}),
      } as AgentPackageLifecycleReceipt
    : null;
}
