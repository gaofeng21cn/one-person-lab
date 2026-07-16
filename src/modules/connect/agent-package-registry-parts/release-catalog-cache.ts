import { isRecord } from '../../../kernel/contract-validation.ts';
import { readJsonFileOrNull, writeJsonPayloadFile } from '../../../kernel/json-file.ts';
import { stringValue } from '../../../kernel/json-record.ts';
import { ensureOplStateDir, resolveOplStatePaths } from '../../../kernel/runtime-state-paths.ts';
import { resolveFirstPartyPackageCatalog } from '../agent-package-first-party.ts';
import {
  fetchManagedPackageCatalog,
  normalizeManagedPackageCatalog,
} from './capability-reconciliation.ts';
import type { FirstPartyDirectoryCatalogSnapshot } from './directory.ts';

const LIVE_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

type ReleaseCatalogCache = {
  surface_kind: 'opl_agent_package_release_catalog_cache.v1';
  catalog_ref: string;
  catalog_digest: string;
  checked_at: string;
  catalog_payload: unknown;
};

function cacheFreshness(checkedAt: string): FirstPartyDirectoryCatalogSnapshot['freshness'] {
  const checkedAtMs = Date.parse(checkedAt);
  return Number.isFinite(checkedAtMs) && Date.now() - checkedAtMs <= LIVE_CACHE_MAX_AGE_MS
    ? 'cached'
    : 'last_known_good';
}

function normalizeCache(value: unknown): ReleaseCatalogCache | null {
  if (!isRecord(value) || value.surface_kind !== 'opl_agent_package_release_catalog_cache.v1') return null;
  const catalogRef = stringValue(value.catalog_ref);
  const catalogDigest = stringValue(value.catalog_digest);
  const checkedAt = stringValue(value.checked_at);
  if (!catalogRef || !catalogDigest || !checkedAt || value.catalog_payload === undefined) return null;
  return {
    surface_kind: 'opl_agent_package_release_catalog_cache.v1',
    catalog_ref: catalogRef,
    catalog_digest: catalogDigest,
    checked_at: checkedAt,
    catalog_payload: value.catalog_payload,
  };
}

export function readFirstPartyPackageCatalogSnapshot(): FirstPartyDirectoryCatalogSnapshot | null {
  const cache = normalizeCache(readJsonFileOrNull(
    resolveOplStatePaths().agent_package_release_catalog_cache_file,
  ));
  if (!cache) return null;
  try {
    return {
      catalog: normalizeManagedPackageCatalog(cache.catalog_payload),
      freshness: cacheFreshness(cache.checked_at),
      catalog_ref: cache.catalog_ref,
      catalog_digest: cache.catalog_digest,
      checked_at: cache.checked_at,
    };
  } catch {
    return null;
  }
}

export async function refreshFirstPartyPackageCatalogSnapshot(
  packageId = 'mas',
  input: { persist?: boolean; timeoutMs?: number } = {},
): Promise<FirstPartyDirectoryCatalogSnapshot> {
  const owner = resolveFirstPartyPackageCatalog(packageId);
  if (!owner) throw new Error(`Unknown first-party OPL Package: ${packageId}`);
  const fetched = await fetchManagedPackageCatalog(owner.catalogSource, {
    timeoutMs: input.timeoutMs,
  });
  const cache: ReleaseCatalogCache = {
    surface_kind: 'opl_agent_package_release_catalog_cache.v1',
    catalog_ref: fetched.channel_ref,
    catalog_digest: fetched.channel_digest,
    checked_at: fetched.checked_at,
    catalog_payload: fetched.catalog_payload,
  };
  if (input.persist !== false) {
    const paths = ensureOplStateDir();
    writeJsonPayloadFile(paths.agent_package_release_catalog_cache_file, cache);
  }
  return {
    catalog: fetched.catalog,
    freshness: 'live',
    catalog_ref: fetched.channel_ref,
    catalog_digest: fetched.channel_digest,
    checked_at: fetched.checked_at,
  };
}

export async function resolveFirstPartyPackageCatalogSnapshot(input: {
  refresh: boolean;
  packageId?: string;
  persist?: boolean;
  timeoutMs?: number;
}): Promise<FirstPartyDirectoryCatalogSnapshot | null> {
  if (input.refresh) {
    try {
      return await refreshFirstPartyPackageCatalogSnapshot(input.packageId, {
        persist: input.persist,
        timeoutMs: input.timeoutMs,
      });
    } catch {
      return readFirstPartyPackageCatalogSnapshot();
    }
  }
  return readFirstPartyPackageCatalogSnapshot();
}
