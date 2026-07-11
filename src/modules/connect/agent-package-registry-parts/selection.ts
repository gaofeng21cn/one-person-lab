import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import { stringValue } from '../../../kernel/json-record.ts';
import { canonicalAgentPackageId } from '../agent-package-identity.ts';
import { normalizeRegistry } from './manifest-normalizers.ts';
import { fetchJsonSource } from './shared.ts';
import type {
  AgentPackageManifest,
  AgentPackageManifestValidateInput,
  AgentPackageRegistryEntry,
} from './types.ts';

export async function resolveManifestSelection(input: AgentPackageManifestValidateInput) {
  const explicitManifestUrl = stringValue(input.manifestUrl);
  const packageId = canonicalAgentPackageId(input.packageId);
  const registryUrl = stringValue(input.registryUrl);
  if (explicitManifestUrl) {
    return {
      registryUrl,
      packageId,
      manifestUrl: explicitManifestUrl,
      trustTier: stringValue(input.trustTier),
      registryEntry: null as AgentPackageRegistryEntry | null,
    };
  }
  if (!registryUrl || !packageId) {
    throw new FrameworkContractError('cli_usage_error', 'Agent package manifest selection requires --manifest-url or both --registry-url and --package-id.', {
      required: ['--manifest-url or --registry-url + --package-id'],
    });
  }
  const registry = await fetchAndValidateRegistry(registryUrl);
  const registryEntry = registry.cache.entries.find((entry) => entry.package_id === packageId);
  if (!registryEntry) {
    throw new FrameworkContractError('contract_shape_invalid', 'Requested agent package is not present in the registry.', {
      registry_url: registryUrl,
      package_id: packageId,
      available_package_ids: registry.cache.entries.map((entry) => entry.package_id),
    });
  }
  return {
    registryUrl,
    packageId,
    manifestUrl: registryEntry.manifest_url,
    trustTier: registryEntry.trust_tier,
    registryEntry,
  };
}

export async function fetchAndValidateRegistry(registryUrl: string) {
  const fetched = await fetchJsonSource(registryUrl);
  const cache = normalizeRegistry(fetched.payload, registryUrl, fetched.source_sha256);
  return { fetched, cache };
}

export function assertTrustTierAssigned(
  trustTier: string | null,
  manifestUrl: string,
): asserts trustTier is string {
  if (!trustTier) {
    throw new FrameworkContractError('cli_usage_error', 'Agent package install requires explicit --trust-tier unless selected from a registry entry.', {
      manifest_url: manifestUrl,
      required: ['--trust-tier'],
      policy: 'manual_third_party_requires_trust_tier_assignment',
    });
  }
}

export function assertManifestMatchesRegistrySelection(
  manifest: AgentPackageManifest,
  selection: {
    packageId: string | null;
    registryEntry: AgentPackageRegistryEntry | null;
    registryUrl: string | null;
    manifestUrl: string;
  },
) {
  if (!selection.registryEntry) {
    return;
  }
  if (selection.packageId && manifest.package_id !== selection.packageId) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package registry entry and manifest package_id must match.', {
      registry_url: selection.registryUrl,
      manifest_url: selection.manifestUrl,
      registry_package_id: selection.packageId,
      manifest_package_id: manifest.package_id,
      failure_code: 'registry_manifest_package_id_mismatch',
    });
  }
  if (manifest.version !== selection.registryEntry.latest_version) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package registry entry and manifest version must match.', {
      registry_url: selection.registryUrl,
      manifest_url: selection.manifestUrl,
      package_id: manifest.package_id,
      registry_latest_version: selection.registryEntry.latest_version,
      manifest_version: manifest.version,
      failure_code: 'registry_manifest_version_mismatch',
    });
  }
  const ordinaryUserSource = selection.registryEntry.ordinary_user_source;
  if (ordinaryUserSource && !manifest.distribution_payload) {
    throw new FrameworkContractError('contract_shape_invalid', 'Published registry entries require a distribution payload.', {
      registry_url: selection.registryUrl,
      manifest_url: selection.manifestUrl,
      package_id: manifest.package_id,
      failure_code: 'registry_manifest_distribution_payload_required',
    });
  }
  if (ordinaryUserSource && manifest.distribution_payload) {
    if (manifest.distribution_payload.rolling_tag !== 'latest' || manifest.distribution_payload.install_truth !== 'resolved_digest_lock') {
      throw new FrameworkContractError('contract_shape_invalid', 'Agent package manifest distribution payload must keep latest as a rolling pointer and digest lock as install truth.', {
        registry_url: selection.registryUrl,
        manifest_url: selection.manifestUrl,
        package_id: manifest.package_id,
        failure_code: 'registry_manifest_distribution_policy_mismatch',
      });
    }
    if (!ordinaryUserSource.immutable_version_ref.endsWith(`:${manifest.distribution_payload.immutable_tag}`)) {
      throw new FrameworkContractError('contract_shape_invalid', 'Agent package registry immutable version ref must match manifest immutable tag.', {
        registry_url: selection.registryUrl,
        manifest_url: selection.manifestUrl,
        package_id: manifest.package_id,
        registry_immutable_version_ref: ordinaryUserSource.immutable_version_ref,
        manifest_immutable_tag: manifest.distribution_payload.immutable_tag,
        failure_code: 'registry_manifest_immutable_tag_mismatch',
      });
    }
  }
}
