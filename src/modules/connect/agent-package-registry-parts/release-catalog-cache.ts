import { isRecord } from '../../../kernel/contract-validation.ts';
import { readJsonFileOrNull, writeJsonPayloadFile } from '../../../kernel/json-file.ts';
import { stringValue } from '../../../kernel/json-record.ts';
import { ensureOplStateDir, resolveOplStatePaths } from '../../../kernel/runtime-state-paths.ts';
import { resolveFirstPartyPackageCatalog } from '../agent-package-first-party.ts';
import {
  fetchManagedPackageCatalog,
  managedPackageCatalogDigest,
  normalizeManagedPackageCatalog,
} from './capability-reconciliation.ts';
import type { FirstPartyDirectoryCatalogSnapshot } from './directory.ts';

const LIVE_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const SHA256_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;

type ReleaseCatalogCacheV2 = {
  surface_kind: 'opl_agent_package_release_catalog_cache.v2';
  catalog_ref: string;
  release_set_descriptor_digest: string | null;
  channel_manifest_layer_digest: string;
  package_catalog_digest: string;
  checked_at: string;
  catalog_payload: unknown;
};

type NormalizedReleaseCatalogCache = {
  source_version: 'v1' | 'v2';
  catalog_ref: string;
  release_set_descriptor_digest: string | null;
  channel_manifest_layer_digest: string;
  package_catalog_digest: string;
  checked_at: string;
  catalog_payload: unknown;
};

type ReleaseCatalogCacheV1 = {
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

function normalizeCache(value: unknown): NormalizedReleaseCatalogCache | null {
  if (!isRecord(value)) return null;
  const catalogRef = stringValue(value.catalog_ref);
  const checkedAt = stringValue(value.checked_at);
  if (!catalogRef || !checkedAt || value.catalog_payload === undefined) return null;
  try {
    const packageCatalogDigest = managedPackageCatalogDigest(value.catalog_payload);
    if (value.surface_kind === 'opl_agent_package_release_catalog_cache.v2') {
      if (!('release_set_descriptor_digest' in value)) return null;
      const descriptorDigest = value.release_set_descriptor_digest === null
        ? null
        : stringValue(value.release_set_descriptor_digest);
      const layerDigest = stringValue(value.channel_manifest_layer_digest);
      const declaredPackageCatalogDigest = stringValue(value.package_catalog_digest);
      if (
        (descriptorDigest !== null && !SHA256_DIGEST_PATTERN.test(descriptorDigest))
        || !layerDigest
        || !SHA256_DIGEST_PATTERN.test(layerDigest)
        || !declaredPackageCatalogDigest
        || !SHA256_DIGEST_PATTERN.test(declaredPackageCatalogDigest)
        || declaredPackageCatalogDigest !== packageCatalogDigest
      ) {
        return null;
      }
      return {
        source_version: 'v2',
        catalog_ref: catalogRef,
        release_set_descriptor_digest: descriptorDigest,
        channel_manifest_layer_digest: layerDigest,
        package_catalog_digest: packageCatalogDigest,
        checked_at: checkedAt,
        catalog_payload: value.catalog_payload,
      };
    }
    if (value.surface_kind === 'opl_agent_package_release_catalog_cache.v1') {
      const legacy = value as ReleaseCatalogCacheV1;
      const legacyLayerDigest = stringValue(legacy.catalog_digest);
      if (!legacyLayerDigest) return null;
      return {
        source_version: 'v1',
        catalog_ref: catalogRef,
        release_set_descriptor_digest: null,
        channel_manifest_layer_digest: legacyLayerDigest,
        package_catalog_digest: packageCatalogDigest,
        checked_at: checkedAt,
        catalog_payload: value.catalog_payload,
      };
    }
  } catch {
    return null;
  }
  return null;
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
      release_set_descriptor_digest: cache.release_set_descriptor_digest,
      channel_manifest_layer_digest: cache.channel_manifest_layer_digest,
      package_catalog_digest: cache.package_catalog_digest,
      catalog_digest: cache.channel_manifest_layer_digest,
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
  const cache: ReleaseCatalogCacheV2 = {
    surface_kind: 'opl_agent_package_release_catalog_cache.v2',
    catalog_ref: fetched.channel_ref,
    release_set_descriptor_digest: fetched.release_set_descriptor_digest,
    channel_manifest_layer_digest: fetched.channel_manifest_layer_digest,
    package_catalog_digest: fetched.package_catalog_digest,
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
    release_set_descriptor_digest: fetched.release_set_descriptor_digest,
    channel_manifest_layer_digest: fetched.channel_manifest_layer_digest,
    package_catalog_digest: fetched.package_catalog_digest,
    catalog_digest: fetched.channel_manifest_layer_digest,
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
