import { FrameworkContractError } from '../../../kernel/contract-validation.ts';

const DEFAULT_RELEASE_MANIFEST_OWNER = 'gaofeng21cn';
const RELEASE_MANIFEST_REPOSITORY = 'one-person-lab-manifest';

function optionalString(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function normalizeOplReleaseChannelTag(value: string | null | undefined) {
  const tag = optionalString(value) ?? 'latest-stable';
  if (tag === 'stable' || tag === 'latest-stable') return 'latest-stable';
  if (tag === 'preview' || tag === 'candidate') return 'candidate';
  if (tag === 'latest') {
    throw new FrameworkContractError('contract_shape_invalid', 'The bare latest OPL release channel is retired.', {
      release_channel: tag,
      stable_channel: 'latest-stable',
      preview_channel: 'candidate',
      failure_code: 'opl_release_channel_latest_retired',
    });
  }
  return tag;
}

function normalizeManifestRefTag(rawRef: string) {
  const digestSeparator = rawRef.lastIndexOf('@');
  if (digestSeparator > rawRef.lastIndexOf('/')) return rawRef;
  const tagSeparator = rawRef.lastIndexOf(':');
  if (tagSeparator <= rawRef.lastIndexOf('/')) {
    return `${rawRef}:latest-stable`;
  }
  const tag = normalizeOplReleaseChannelTag(rawRef.slice(tagSeparator + 1));
  return `${rawRef.slice(0, tagSeparator)}:${tag}`;
}

export function resolveOplReleaseManifestRef(declaredRef?: string) {
  const explicitRef = optionalString(process.env.OPL_PACKAGE_CHANNEL_MANIFEST_REF);
  if (explicitRef) return normalizeManifestRefTag(explicitRef);
  if (optionalString(declaredRef)) return normalizeManifestRefTag(declaredRef!.trim());
  const owner = optionalString(process.env.OPL_PACKAGES_OWNER) ?? DEFAULT_RELEASE_MANIFEST_OWNER;
  const configuredTag = optionalString(process.env.OPL_PACKAGE_CHANNEL_TAG)
    ?? optionalString(process.env.OPL_PACKAGE_CHANNEL_VERSION);
  return `ghcr.io/${owner}/${RELEASE_MANIFEST_REPOSITORY}:${normalizeOplReleaseChannelTag(configuredTag)}`;
}
