import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { canonicalAgentPackageId } from './agent-package-identity.ts';
import { resolveOplReleaseManifestRef } from './system-installation/release-channel.ts';
import type { ManagedCatalogVersion } from './agent-package-registry-parts/capability-reconciliation.ts';
import type { AgentPackageManagedVersionCatalogSource } from './agent-package-registry-parts/types.ts';

const FIRST_PARTY_PACKAGE_IDS = new Set([
  'mas',
  'mag',
  'rca',
  'oma',
  'obf',
  'mas-scholar-skills',
  'opl-flow',
]);

export function resolveFirstPartyPackageCatalog(packageId: string | null | undefined) {
  const canonicalId = canonicalAgentPackageId(packageId);
  if (!canonicalId || !FIRST_PARTY_PACKAGE_IDS.has(canonicalId)) return null;
  return {
    canonicalId,
    trustTier: 'first_party' as const,
    sourceKind: 'first_party_managed_cohort' as const,
    catalogSource: {
      kind: 'managed_version_catalog',
      transport: 'opl_oci_channel',
      catalog_ref: resolveOplReleaseManifestRef(),
      selection_policy: 'highest_stable',
      digest_authority: 'manifest_and_content_digest',
    } satisfies AgentPackageManagedVersionCatalogSource,
  };
}

export function assertFirstPartyPackageCatalogVersion(packageId: string, version: ManagedCatalogVersion) {
  const expectedArtifactPattern = new RegExp(
    `^ghcr\\.io/[^/]+/one-person-lab-packages/${packageId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:${version.package_version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
  );
  const failures = [
    version.manifest_json ? null : 'manifest_json_missing',
    version.payload_manifest_json ? null : 'payload_manifest_json_missing',
    /^sha256:[0-9a-f]{64}$/.test(version.manifest_sha256) ? null : 'manifest_digest_invalid',
    /^sha256:[0-9a-f]{64}$/.test(version.content_digest ?? '') ? null : 'content_digest_invalid',
    /^sha256:[0-9a-f]{64}$/.test(version.artifact_digest ?? '') ? null : 'artifact_digest_invalid',
    /^sha256:[0-9a-f]{64}$/.test(version.package_content_digest ?? '') ? null : 'package_content_digest_invalid',
    /^[0-9a-f]{40}$/.test(version.owner_source_commit ?? '') ? null : 'owner_source_commit_invalid',
    version.artifact_status === 'published_immutable' ? null : 'artifact_not_published_immutable',
    expectedArtifactPattern.test(version.source_artifact_ref ?? '') ? null : 'canonical_artifact_ref_invalid',
    version.manifest_url === `opl+oci://${version.source_artifact_ref}#/package-manifest.json`
      ? null
      : 'manifest_artifact_ref_mismatch',
  ].filter((failure): failure is string => failure !== null);
  if (failures.length > 0) {
    throw new FrameworkContractError('contract_shape_invalid', 'First-party OPL Package catalog selection is not an immutable release member.', {
      package_id: packageId,
      package_version: version.package_version,
      source_artifact_ref: version.source_artifact_ref,
      failures,
      failure_code: 'first_party_package_catalog_selection_invalid',
    });
  }
}
