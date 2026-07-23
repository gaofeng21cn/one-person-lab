import crypto from 'node:crypto';

import { FrameworkContractError, isRecord } from '../../../kernel/contract-validation.ts';
import { parseJsonText } from '../../../kernel/json-file.ts';
import { recordList, stringValue } from '../../../kernel/json-record.ts';
import { versionSatisfiesRequirement } from './dependency-closure.ts';
import { fetchJsonSource } from './shared.ts';
import { readOplPackageChannelManifestWithMetadata } from '../system-installation/module-package-channel.ts';
import { publicAgentPackageSelector } from '../agent-package-identity.ts';
import type {
  AgentPackageCapabilityDependency,
  AgentPackageLock,
  AgentPackageManagedVersionCatalogSource,
} from './types.ts';

export type ManagedCatalogVersion = {
  package_version: string;
  capability_abi: string | null;
  manifest_url: string;
  manifest_sha256: string;
  manifest_json: string | null;
  payload_manifest_json: string | null;
  payload_manifest_sha256: string | null;
  content_digest: string | null;
  payload_digest: string | null;
  source_artifact_ref: string | null;
  artifact_digest: string | null;
  artifact_status: string | null;
  package_content_digest: string | null;
  owner_source_commit: string | null;
  dependency_package_ids: string[];
  selection_status: 'selected_for_release_set' | 'retained_history';
};

type ManagedCatalogEntry = {
  package_id: string;
  package_role: 'standard_agent' | 'framework_capability_package' | 'workflow_profile';
  selected_version: string | null;
  versions: ManagedCatalogVersion[];
};

export type ManagedPackageCatalog = Map<string, ManagedCatalogEntry>;

function sha256(value: string) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function normalizedSha256(value: unknown) {
  const digest = stringValue(value);
  if (!digest) return null;
  return digest.startsWith('sha256:') ? digest : `sha256:${digest}`;
}

function versionParts(value: string) {
  const match = value.match(/^(\d+)\.(\d+)\.(\d+)(.*)$/);
  return match
    ? [Number(match[1]), Number(match[2]), Number(match[3]), match[4]] as const
    : [0, 0, 0, value] as const;
}

function comparePackageVersions(left: string, right: string) {
  const a = versionParts(left);
  const b = versionParts(right);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return Number(a[index]) - Number(b[index]);
  }
  return String(a[3]).localeCompare(String(b[3]), 'en', { numeric: true });
}

function normalizeCatalogVersion(value: unknown, entry: Record<string, unknown>): ManagedCatalogVersion | null {
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
  if (manifestJson && sha256(manifestJson) !== manifestSha256) {
    throw new FrameworkContractError('contract_shape_invalid', 'Managed package catalog inline manifest digest is invalid.', {
      package_id: stringValue(entry.package_id),
      package_version: packageVersion,
      expected_manifest_sha256: manifestSha256,
      actual_manifest_sha256: sha256(manifestJson),
      failure_code: 'agent_package_catalog_manifest_digest_mismatch',
    });
  }
  if (payloadManifestJson && (!payloadManifestSha256 || sha256(payloadManifestJson) !== payloadManifestSha256)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Managed package catalog inline payload manifest digest is invalid.', {
      package_id: stringValue(entry.package_id),
      package_version: packageVersion,
      expected_payload_manifest_sha256: payloadManifestSha256,
      actual_payload_manifest_sha256: sha256(payloadManifestJson),
      failure_code: 'agent_package_catalog_payload_manifest_digest_mismatch',
    });
  }
  return {
    package_version: packageVersion,
    capability_abi: stringValue(value.capability_abi),
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
  };
}

export function normalizeManagedPackageCatalog(payload: unknown): ManagedPackageCatalog {
  if (!isRecord(payload)
    || (payload.surface_kind !== undefined && payload.surface_kind !== 'opl_package_catalog.v1')
    || !isRecord(payload.packages)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Managed package catalog must declare packages.package_catalog.', {
      failure_code: 'agent_package_catalog_invalid',
    });
  }
  const packageCatalog = isRecord(payload.packages.package_catalog)
    ? payload.packages.package_catalog
    : payload.packages;
  const result = new Map<string, ManagedCatalogEntry>();
  for (const [packageId, rawEntry] of Object.entries(packageCatalog)) {
    if (!isRecord(rawEntry) || !Array.isArray(rawEntry.versions)) continue;
    const versions = recordList(rawEntry.versions)
      .map((entry) => normalizeCatalogVersion(entry, { ...rawEntry, package_id: packageId }))
      .filter((entry): entry is ManagedCatalogVersion => Boolean(entry))
      .sort((left, right) => comparePackageVersions(right.package_version, left.package_version));
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
  if (!isRecord(payload) || !isRecord(payload.packages)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Managed package catalog must declare packages.package_catalog.', {
      failure_code: 'agent_package_catalog_invalid',
    });
  }
  const packageCatalog = isRecord(payload.packages.package_catalog)
    ? payload.packages.package_catalog
    : payload.packages;
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

export function selectManagedCatalogPackageVersion(catalog: ManagedPackageCatalog, packageId: string) {
  const entry = catalog.get(packageId);
  if (!entry) {
    throw new FrameworkContractError('contract_shape_invalid', 'Managed package catalog does not contain the requested root package.', {
      package_id: packageId,
      failure_code: 'agent_package_catalog_root_missing',
      update_action: `opl packages update ${publicAgentPackageSelector(packageId)}`,
    });
  }
  const selectedVersions = entry.versions.filter((candidate) => candidate.selection_status === 'selected_for_release_set');
  const selected = selectedVersions.find((candidate) => candidate.package_version === entry.selected_version)
    ?? selectedVersions[0]
    ?? null;
  if (!selected) {
    throw new FrameworkContractError('contract_shape_invalid', 'Managed package catalog has no selected Release Set root package version.', {
      package_id: packageId,
      failure_code: 'agent_package_catalog_stable_version_missing',
      update_action: `opl packages update ${publicAgentPackageSelector(packageId)}`,
    });
  }
  return selected;
}

export function selectRootCatalogVersion(catalog: ManagedPackageCatalog, lock: AgentPackageLock) {
  return selectManagedCatalogPackageVersion(catalog, lock.package_id);
}

export function selectCapabilityCatalogVersion(
  catalog: ManagedPackageCatalog,
  dependency: AgentPackageCapabilityDependency,
) {
  const entry = catalog.get(dependency.package_id);
  const selected = entry?.versions.find((candidate) =>
    candidate.capability_abi === dependency.capability_abi
    && versionSatisfiesRequirement(candidate.package_version, dependency.version_requirement));
  if (!selected) {
    throw new FrameworkContractError('contract_shape_invalid', 'Managed package catalog has no retained provider compatible with the root package.', {
      package_id: dependency.package_id,
      version_requirement: dependency.version_requirement,
      capability_abi: dependency.capability_abi,
      available_versions: entry?.versions.map((candidate) => ({
        package_version: candidate.package_version,
        capability_abi: candidate.capability_abi,
      })) ?? [],
      failure_code: 'agent_package_capability_no_compatible_version',
      update_action: 'opl packages update mas',
    });
  }
  return selected;
}

export function catalogManifestPayload(version: ManagedCatalogVersion) {
  if (version.manifest_json) return parseJsonText(version.manifest_json);
  return null;
}
