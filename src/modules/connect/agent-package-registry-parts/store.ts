import { FrameworkContractError, isRecord } from '../../../kernel/contract-validation.ts';
import { readJsonFileOrNull, writeJsonPayloadFile } from '../../../kernel/json-file.ts';
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

export function emptyLockIndex(): AgentPackageLockIndex {
  return {
    surface_kind: 'opl_agent_package_lock_index',
    version: 'opl-agent-package-lock-index.v1',
    packages: [],
  };
}

export function emptyLifecycleLedger(): AgentPackageLifecycleLedger {
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
      const packageId = canonicalAgentPackageId(entry.package_id);
      const lockRef = stringValue(entry.lock_ref);
      const agentId = canonicalAgentPackageId(entry.agent_id);
      return packageId && lockRef
        ? [{ ...entry, package_id: packageId, ...(agentId ? { agent_id: agentId } : {}) } as AgentPackageLock]
        : [];
    }),
  };
}

export function readLifecycleLedger(): AgentPackageLifecycleLedger {
  const parsed = readJsonFileOrNull(resolveOplStatePaths().agent_package_lifecycle_ledger_file);
  if (!isRecord(parsed) || !Array.isArray(parsed.receipts)) {
    return emptyLifecycleLedger();
  }
  return {
    ...emptyLifecycleLedger(),
    receipts: recordList(parsed.receipts).flatMap((entry) => {
      const receiptRef = stringValue(entry.receipt_ref);
      const packageId = canonicalAgentPackageId(entry.package_id);
      const physicalSurface = isRecord(entry.physical_surface)
        ? {
            ...entry.physical_surface,
            ...(canonicalAgentPackageId(entry.physical_surface.package_id)
              ? { package_id: canonicalAgentPackageId(entry.physical_surface.package_id)! }
              : {}),
          }
        : entry.physical_surface;
      return receiptRef
        ? [{
            ...entry,
            package_id: packageId,
            ...(physicalSurface ? { physical_surface: physicalSurface } : {}),
          } as AgentPackageLifecycleReceipt]
        : [];
    }),
  };
}

export function readRegistryCache() {
  const parsed = readJsonFileOrNull(resolveOplStatePaths().agent_package_registry_cache_file);
  if (!isRecord(parsed) || !Array.isArray(parsed.entries)) {
    return null;
  }
  const entries = recordList(parsed.entries).map(normalizeRegistryEntry);
  return {
    surface_kind: 'opl_agent_package_registry_cache' as const,
    version: stringValue(parsed.version) ?? 'opl-agent-package-registry-cache.v1',
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

export function writeLifecycleLedger(ledger: AgentPackageLifecycleLedger) {
  const paths = ensureOplStateDir();
  writeJsonPayloadFile(paths.agent_package_lifecycle_ledger_file, ledger);
}

export function appendReceipt(receipt: AgentPackageLifecycleReceipt) {
  const ledger = readLifecycleLedger();
  const existingIndex = ledger.receipts.findIndex((entry) => entry.receipt_ref === receipt.receipt_ref);
  if (existingIndex >= 0) {
    ledger.receipts[existingIndex] = receipt;
  } else {
    ledger.receipts.unshift(receipt);
  }
  writeLifecycleLedger(ledger);
}
