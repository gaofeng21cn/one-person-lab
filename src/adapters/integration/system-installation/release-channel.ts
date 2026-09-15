import { FrameworkContractError } from '../../../kernel/contract-validation.ts';

const DEFAULT_FRAMEWORK_OWNER = 'gaofeng21cn';
// Framework channel is an owner channel. It is deliberately independent from
// App and Package publication; no aggregate Release Set is read here.
const FRAMEWORK_REPOSITORY = 'one-person-lab-framework';

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

function normalizeArtifactRefTag(rawRef: string) {
  const digestSeparator = rawRef.lastIndexOf('@');
  if (digestSeparator > rawRef.lastIndexOf('/')) return rawRef;
  const tagSeparator = rawRef.lastIndexOf(':');
  if (tagSeparator <= rawRef.lastIndexOf('/')) {
    return `${rawRef}:latest-stable`;
  }
  const tag = normalizeOplReleaseChannelTag(rawRef.slice(tagSeparator + 1));
  return `${rawRef.slice(0, tagSeparator)}:${tag}`;
}

export function resolveFrameworkArtifactRef(declaredRef?: string) {
  const explicitRef = optionalString(process.env.OPL_FRAMEWORK_ARTIFACT_REF);
  if (explicitRef) return normalizeArtifactRefTag(explicitRef);
  if (optionalString(declaredRef)) return normalizeArtifactRefTag(declaredRef!.trim());
  const owner = optionalString(process.env.OPL_PACKAGES_OWNER) ?? DEFAULT_FRAMEWORK_OWNER;
  const configuredTag = optionalString(process.env.OPL_FRAMEWORK_CHANNEL_TAG)
    ?? optionalString(process.env.OPL_FRAMEWORK_CHANNEL_VERSION);
  return `ghcr.io/${owner}/${FRAMEWORK_REPOSITORY}:${normalizeOplReleaseChannelTag(configuredTag)}`;
}
