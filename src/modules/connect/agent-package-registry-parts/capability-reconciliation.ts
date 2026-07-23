import crypto from 'node:crypto';

import { FrameworkContractError, isRecord } from '../../../kernel/contract-validation.ts';
import { parseJsonText } from '../../../kernel/json-file.ts';
import { recordList, stringValue } from '../../../kernel/json-record.ts';
import { fetchJsonSource } from './shared.ts';
import { readOplPackageChannelManifestWithMetadata } from '../system-installation/module-package-channel.ts';
import { publicAgentPackageSelector } from '../agent-package-identity.ts';
import {
  comparePackageRepositoryVersions,
  packageRepositorySourceFormat,
  repositoryPackageCatalog,
  repositoryVersionMetadata,
  resolvePackageRepositoryVersion,
  type PackageRepositoryCatalog,
  type PackageRepositoryEntry,
  type PackageRepositoryResolutionReceipt,
  type PackageRepositoryVersionCandidate,
} from './package-repository-index.ts';
import type {
  AgentPackageCapabilityDependency,
  AgentPackageLock,
  AgentPackageManagedVersionCatalogSource,
} from './types.ts';

export type ManagedCatalogVersion = PackageRepositoryVersionCandidate;
type ManagedCatalogEntry = PackageRepositoryEntry;
export type ManagedPackageCatalog = PackageRepositoryCatalog;
export type ManagedPackageResolutionReceipt = PackageRepositoryResolutionReceipt;

function sha256(value: string) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function normalizedSha256(value: unknown) {
  const digest = stringValue(value);
  if (!digest) return null;
  return digest.startsWith('sha256:') ? digest : `sha256:${digest}`;
}

function normalizeCatalogVersion(
  value: unknown,
  sourceFormat: ReturnType<typeof packageRepositorySourceFormat>,
): ManagedCatalogVersion | null {
  if (!isRecord(value)) return null;
  const packageVersion = stringValue(value.package_version);
  const manifest = isRecord(value.package_manifest) ? value.package_manifest : {};
  const manifestUrl = stringValue(value.manifest_url) ?? stringValue(manifest.ref);
  const manifestSha256 = normalizedSha256(value.manifest_sha256 ?? manifest.sha256);
  if (!packageVersion || !manifestUrl || !manifestSha256) return null;
  const manifestJson = typeof value.manifest_json === 'string'
    ? value.manifest_json
    : typeof manifest.manifest_json === 'string'
      ? manifest.manifest_json
      : null;
  const payloadManifestJson = typeof value.payload_manifest_json === 'string'
    ? value.payload_manifest_json
    : null;
  const payloadManifestSha256 = normalizedSha256(value.payload_manifest_sha256);
  return {
    package_version: packageVersion,
    capability_abi: stringValue(
      isRecord(value.compatibility)
        ? value.compatibility.capability_abi ?? value.capability_abi
        : value.capability_abi,
    ),
    manifest_url: manifestUrl,
    manifest_sha256: manifestSha256,
    manifest_json: manifestJson,
    payload_manifest_json: payloadManifestJson,
    payload_manifest_sha256: payloadManifestSha256,
    content_digest: stringValue(value.content_digest),
    payload_digest: stringValue(value.payload_digest),
    source_artifact_ref: stringValue(value.source_artifact_ref),
    artifact_digest: normalizedSha256(value.artifact_digest),
    artifact_status: stringValue(value.artifact_status),
    package_content_digest: normalizedSha256(value.package_content_digest),
    owner_source_commit: stringValue(value.owner_source_commit),
    dependency_package_ids: Array.isArray(value.dependency_package_ids)
      ? value.dependency_package_ids.filter((item): item is string => typeof item === 'string' && item.length > 0)
      : [],
    selection_status: value.selection_status === 'retained_history'
      ? 'retained_history'
      : 'selected_for_release_set',
    ...repositoryVersionMetadata(value, sourceFormat),
  };
}

export function normalizeManagedPackageCatalog(payload: unknown): ManagedPackageCatalog {
  const packageCatalog = repositoryPackageCatalog(payload);
  if (!packageCatalog) {
    throw new FrameworkContractError('contract_shape_invalid', 'Managed Package source must declare a Release Set v1 catalog or Package repository index v1.', {
      failure_code: 'agent_package_catalog_invalid',
    });
  }
  const sourceFormat = packageRepositorySourceFormat(payload);
  const result = new Map<string, ManagedCatalogEntry>();
  for (const [packageId, rawEntry] of Object.entries(packageCatalog)) {
    if (!isRecord(rawEntry) || !Array.isArray(rawEntry.versions)) continue;
    const versions = recordList(rawEntry.versions)
      .map((entry) => normalizeCatalogVersion(entry, sourceFormat))
      .filter((entry): entry is ManagedCatalogVersion => Boolean(entry))
      .sort((left, right) => comparePackageRepositoryVersions(
        right.package_version,
        left.package_version,
      ));
    if (versions.length === 0) continue;
    result.set(packageId, {
      package_id: packageId,
      package_role: rawEntry.package_role === 'framework_capability_package'
        ? 'framework_capability_package'
        : rawEntry.package_role === 'workflow_profile'
          ? 'workflow_profile'
          : 'standard_agent',
      selected_version: stringValue(rawEntry.selected_version),
      versions,
    });
  }
  return result;
}

export function managedPackageCatalogDigest(payload: unknown) {
  const packageCatalog = repositoryPackageCatalog(payload);
  if (!isRecord(payload) || !packageCatalog) {
    throw new FrameworkContractError('contract_shape_invalid', 'Managed package catalog must declare packages.package_catalog.', {
      failure_code: 'agent_package_catalog_invalid',
    });
  }
  const actualDigest = sha256(JSON.stringify(packageCatalog));
  const declaredDigest = normalizedSha256(payload.package_catalog_digest);
  if (declaredDigest && declaredDigest !== actualDigest) {
    throw new FrameworkContractError('contract_shape_invalid', 'Managed package catalog digest is invalid.', {
      expected_package_catalog_digest: declaredDigest,
      actual_package_catalog_digest: actualDigest,
      failure_code: 'agent_package_catalog_digest_mismatch',
    });
  }
  return actualDigest;
}

export async function fetchManagedPackageCatalog(
  source: AgentPackageManagedVersionCatalogSource,
  input: { timeoutMs?: number } = {},
) {
  const fetched = source.transport === 'json_url'
    ? await fetchJsonSource(source.catalog_ref, input).then((result) => ({
        ...result,
        channel_ref: source.catalog_ref,
        release_set_descriptor_digest: null,
        channel_manifest_layer_digest: `sha256:${result.source_sha256.replace(/^sha256:/, '')}`,
        channel_digest: `sha256:${result.source_sha256.replace(/^sha256:/, '')}`,
        checked_at: new Date().toISOString(),
      }))
    : (() => {
        const channel = readOplPackageChannelManifestWithMetadata(source.catalog_ref, input);
        return {
          payload: channel.payload,
          source_sha256: channel.source_sha256,
          channel_ref: channel.channel_ref,
          release_set_descriptor_digest: channel.release_set_descriptor_digest,
          channel_manifest_layer_digest: channel.channel_manifest_layer_digest,
          channel_digest: channel.channel_manifest_layer_digest,
          checked_at: channel.checked_at,
        };
      })();
  const packageCatalogDigest = managedPackageCatalogDigest(fetched.payload);
  return {
    catalog: normalizeManagedPackageCatalog(fetched.payload),
    catalog_payload: fetched.payload,
    source_sha256: fetched.source_sha256,
    channel_ref: fetched.channel_ref,
    release_set_descriptor_digest: fetched.release_set_descriptor_digest,
    channel_manifest_layer_digest: fetched.channel_manifest_layer_digest,
    package_catalog_digest: packageCatalogDigest,
    // Existing package locks bind the channel-manifest layer, not the OCI descriptor.
    channel_digest: fetched.channel_digest,
    checked_at: fetched.checked_at,
  };
}

export function resolveManagedCatalogPackageVersion(
  catalog: ManagedPackageCatalog,
  packageId: string,
  input: { currentBaseAbi?: string | null } = {},
) {
  try {
    return resolvePackageRepositoryVersion(catalog, {
      packageId,
      resolutionKind: 'root_package',
      currentBaseAbi: input.currentBaseAbi,
    });
  } catch (error) {
    if (!(error instanceof FrameworkContractError) || catalog.has(packageId)) throw error;
    throw new FrameworkContractError('contract_shape_invalid', 'Managed package catalog does not contain the requested root package.', {
      package_id: packageId,
      failure_code: 'agent_package_catalog_root_missing',
      update_action: `opl packages update ${publicAgentPackageSelector(packageId)}`,
    });
  }
}

export function selectManagedCatalogPackageVersion(
  catalog: ManagedPackageCatalog,
  packageId: string,
  input: { currentBaseAbi?: string | null } = {},
) {
  return resolveManagedCatalogPackageVersion(catalog, packageId, input).selected;
}

export function selectRootCatalogVersion(catalog: ManagedPackageCatalog, lock: AgentPackageLock) {
  return selectManagedCatalogPackageVersion(catalog, lock.package_id);
}

export function selectCapabilityCatalogVersion(
  catalog: ManagedPackageCatalog,
  dependency: AgentPackageCapabilityDependency,
  input: { currentBaseAbi?: string | null } = {},
) {
  return resolveManagedCapabilityCatalogVersion(catalog, dependency, input).selected;
}

export function resolveManagedCapabilityCatalogVersion(
  catalog: ManagedPackageCatalog,
  dependency: AgentPackageCapabilityDependency,
  input: { currentBaseAbi?: string | null } = {},
) {
  return resolvePackageRepositoryVersion(catalog, {
    packageId: dependency.package_id,
    resolutionKind: 'capability_provider',
    currentBaseAbi: input.currentBaseAbi,
    versionRequirement: dependency.version_requirement,
    capabilityAbi: dependency.capability_abi,
  });
}

export function catalogManifestPayload(version: ManagedCatalogVersion) {
  if (version.manifest_json) {
    const actualManifestSha256 = sha256(version.manifest_json);
    if (actualManifestSha256 !== version.manifest_sha256) {
      throw new FrameworkContractError('contract_shape_invalid', 'Managed package catalog inline manifest digest is invalid.', {
        package_version: version.package_version,
        expected_manifest_sha256: version.manifest_sha256,
        actual_manifest_sha256: actualManifestSha256,
        failure_code: 'agent_package_catalog_manifest_digest_mismatch',
      });
    }
    return parseJsonText(version.manifest_json);
  }
  return null;
}

export function catalogPayloadManifestJson(version: ManagedCatalogVersion) {
  if (!version.payload_manifest_json) return null;
  const actualPayloadManifestSha256 = sha256(version.payload_manifest_json);
  if (!version.payload_manifest_sha256
    || actualPayloadManifestSha256 !== version.payload_manifest_sha256) {
    throw new FrameworkContractError('contract_shape_invalid', 'Managed package catalog inline payload manifest digest is invalid.', {
      package_version: version.package_version,
      expected_payload_manifest_sha256: version.payload_manifest_sha256,
      actual_payload_manifest_sha256: actualPayloadManifestSha256,
      failure_code: 'agent_package_catalog_payload_manifest_digest_mismatch',
    });
  }
  return version.payload_manifest_json;
}
