import { FrameworkContractError, isRecord } from '../../../kernel/contract-validation.ts';
import {
  parseJsonText,
  readJsonFileOrNull,
} from '../../../kernel/json-file.ts';
import { stringValue } from '../../../kernel/json-record.ts';
import { resolveOplStatePaths } from '../../../kernel/runtime-state-paths.ts';
import { resolveFirstPartyPackageCatalog } from '../agent-package-first-party.ts';
import {
  managedPackageCatalogDigest,
  normalizeManagedPackageCatalog,
} from './capability-reconciliation.ts';
import type { FirstPartyDirectoryCatalogSnapshot } from './directory.ts';
import { normalizePackageManifest } from './manifest-normalizers.ts';
import { readOplPackageArtifactWithMetadata } from '../system-installation/module-package-channel.ts';

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
  if (!resolveFirstPartyPackageCatalog(packageId)) {
    throw new Error(`Unknown first-party OPL Package: ${packageId}`);
  }
  const packageCatalog: Record<string, unknown> = {};
  const visited = new Set<string>();
  let rootDescriptorDigest: string | null = null;
  let rootCheckedAt = new Date().toISOString();
  const visit = (selectedPackageId: string) => {
    if (visited.has(selectedPackageId)) return;
    visited.add(selectedPackageId);
    const selectedOwner = resolveFirstPartyPackageCatalog(selectedPackageId);
    if (!selectedOwner) {
      throw new FrameworkContractError('contract_shape_invalid', 'First-party Package required closure contains an unknown Package.', {
        root_package_id: packageId,
        package_id: selectedPackageId,
        failure_code: 'first_party_package_dependency_unknown',
      });
    }
    const selectedOwnerMatch = selectedOwner.catalogSource.catalog_ref.match(
      /^ghcr\.io\/([^/]+)\/one-person-lab-manifest(?::|@)/,
    );
    if (!selectedOwnerMatch) {
      throw new FrameworkContractError('contract_shape_invalid', 'First-party Package owner could not be derived from its compatibility catalog ref.', {
        root_package_id: packageId,
        package_id: selectedPackageId,
        catalog_ref: selectedOwner.catalogSource.catalog_ref,
        failure_code: 'first_party_package_owner_ref_invalid',
      });
    }
    const latestStableRef = `ghcr.io/${selectedOwnerMatch[1]}/one-person-lab-packages/${selectedPackageId}:latest-stable`;
    const artifact = readOplPackageArtifactWithMetadata(latestStableRef, {
      timeoutMs: input.timeoutMs,
    });
    const manifestPayload = parseJsonText(artifact.manifest_json);
    const payloadManifest = parseJsonText(artifact.payload_manifest_json);
    const manifest = normalizePackageManifest(
      manifestPayload,
      `opl+oci://${latestStableRef}#/package-manifest.json`,
    );
    if (manifest.package_id !== selectedPackageId
      || !isRecord(payloadManifest)
      || payloadManifest.package_id !== selectedPackageId
      || payloadManifest.package_version !== manifest.version) {
      throw new FrameworkContractError('contract_shape_invalid', 'First-party Package artifact identity is inconsistent.', {
        root_package_id: packageId,
        package_id: selectedPackageId,
        manifest_package_id: manifest.package_id,
        manifest_version: manifest.version,
        payload_package_id: isRecord(payloadManifest) ? payloadManifest.package_id : null,
        payload_package_version: isRecord(payloadManifest) ? payloadManifest.package_version : null,
        failure_code: 'first_party_package_artifact_identity_mismatch',
      });
    }
    const sourceArtifactRef = latestStableRef.replace(/:latest-stable$/, `:${manifest.version}`);
    const ownerSourceCommit = stringValue(payloadManifest.source_commit)
      ?? manifest.source_commit
      ?? manifest.carrier_source_commit;
    const dependencyPackageIds = manifest.capability_dependencies
      .filter((dependency) => dependency.required !== false)
      .map((dependency) => dependency.package_id);
    packageCatalog[selectedPackageId] = {
      package_id: selectedPackageId,
      package_role: manifest.package_role,
      selected_version: manifest.version,
      versions: [{
        package_version: manifest.version,
        selection_status: 'selected_for_release_set',
        manifest_url: `opl+oci://${sourceArtifactRef}#/package-manifest.json`,
        manifest_sha256: artifact.manifest_layer_digest,
        manifest_json: artifact.manifest_json,
        content_digest: manifest.content_digest ?? artifact.manifest_layer_digest,
        payload_digest: artifact.payload_layer_digest,
        payload_manifest_json: artifact.payload_manifest_json,
        payload_manifest_sha256: artifact.payload_layer_digest,
        source_artifact_ref: sourceArtifactRef,
        artifact_digest: artifact.descriptor_digest,
        artifact_status: 'published_immutable',
        package_content_digest: artifact.source_layer_digest,
        owner_source_commit: ownerSourceCommit,
        dependency_package_ids: dependencyPackageIds,
        capability_abi: manifest.capability_provider?.capability_abi ?? null,
      }],
    };
    if (selectedPackageId === packageId) {
      rootDescriptorDigest = artifact.descriptor_digest;
      rootCheckedAt = artifact.checked_at;
    }
    for (const dependencyPackageId of dependencyPackageIds) visit(dependencyPackageId);
  };
  visit(packageId);
  if (!rootDescriptorDigest) {
    throw new FrameworkContractError('contract_shape_invalid', 'First-party Package artifact refresh omitted its root descriptor.', {
      root_package_id: packageId,
      failure_code: 'first_party_package_root_descriptor_missing',
    });
  }
  const catalogPayload = {
    surface_kind: 'opl_package_catalog.v1',
    packages: { package_catalog: packageCatalog },
  };
  const packageCatalogDigest = managedPackageCatalogDigest(catalogPayload);
  const rootOwner = resolveFirstPartyPackageCatalog(packageId)!;
  const rootOwnerMatch = rootOwner.catalogSource.catalog_ref.match(
    /^ghcr\.io\/([^/]+)\/one-person-lab-manifest(?::|@)/,
  )!;
  const rootRef = `ghcr.io/${rootOwnerMatch[1]}/one-person-lab-packages/${packageId}:latest-stable`;
  return {
    catalog: normalizeManagedPackageCatalog(catalogPayload),
    freshness: 'live',
    catalog_ref: rootRef,
    release_set_descriptor_digest: rootDescriptorDigest,
    channel_manifest_layer_digest: rootDescriptorDigest,
    package_catalog_digest: packageCatalogDigest,
    catalog_digest: rootDescriptorDigest,
    checked_at: rootCheckedAt,
  };
}

export async function resolveFirstPartyPackageCatalogSnapshot(input: {
  refresh: boolean;
  packageId?: string;
  persist?: boolean;
  timeoutMs?: number;
}): Promise<FirstPartyDirectoryCatalogSnapshot | null> {
  if (input.refresh) {
    if (!input.packageId) return readFirstPartyPackageCatalogSnapshot();
    try {
      return await refreshFirstPartyPackageCatalogSnapshot(input.packageId, {
        persist: input.persist,
        timeoutMs: input.timeoutMs,
      });
    } catch {
      return null;
    }
  }
  return input.packageId ? null : readFirstPartyPackageCatalogSnapshot();
}
