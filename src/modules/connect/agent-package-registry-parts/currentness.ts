import type { ManagedCatalogVersion } from './capability-reconciliation.ts';
import type { AgentPackageLock, AgentPackageSourceKind } from './types.ts';

export type AgentPackageTargetCurrentness = {
  status: 'current' | 'update_available';
  reasons: string[];
  installed_version: string;
  target_version: string;
  installed_content_digest: string | null;
  target_content_digest: string | null;
  installed_artifact_digest: string | null;
  target_artifact_digest: string | null;
  installed_manifest_sha256: string | null;
  target_manifest_sha256: string;
};

function normalizeDigest(value: string | null | undefined) {
  if (!value) return null;
  return value.startsWith('sha256:') ? value : `sha256:${value}`;
}

export function agentPackageTargetCurrentness(input: {
  lock: AgentPackageLock;
  target: ManagedCatalogVersion;
  desiredSourceKind: AgentPackageSourceKind;
}): AgentPackageTargetCurrentness {
  const reasons: string[] = [];
  const installedManifest = normalizeDigest(input.lock.manifest_sha256);
  const targetManifest = normalizeDigest(input.target.manifest_sha256)!;
  const installedContent = normalizeDigest(input.lock.content_digest);
  const targetContent = normalizeDigest(input.target.content_digest);
  const installedArtifact = normalizeDigest(input.lock.artifact_digest);
  const targetArtifact = normalizeDigest(input.target.artifact_digest);
  if (input.lock.source_kind !== input.desiredSourceKind) reasons.push('source_policy_mismatch');
  if (input.lock.package_version !== input.target.package_version) reasons.push('package_version_changed');
  if (installedManifest !== targetManifest) reasons.push('manifest_digest_changed');
  if (targetContent && installedContent !== targetContent) reasons.push('content_digest_changed');
  if (targetArtifact && installedArtifact !== targetArtifact) reasons.push('artifact_digest_changed');
  return {
    status: reasons.length === 0 ? 'current' : 'update_available',
    reasons,
    installed_version: input.lock.package_version,
    target_version: input.target.package_version,
    installed_content_digest: installedContent,
    target_content_digest: targetContent,
    installed_artifact_digest: installedArtifact,
    target_artifact_digest: targetArtifact,
    installed_manifest_sha256: installedManifest,
    target_manifest_sha256: targetManifest,
  };
}
