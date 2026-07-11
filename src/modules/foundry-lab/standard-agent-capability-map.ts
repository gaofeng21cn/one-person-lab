import { isRecord } from '../../kernel/contract-validation.ts';

type JsonRecord = Record<string, unknown>;

const PROFILE_REF_PREFIX = '#/capability_policy_profiles/';

export function normalizeStandardAgentCapabilityMapPolicies(capabilityMap: unknown): {
  capabilityMap: unknown;
  blockers: string[];
} {
  if (!isRecord(capabilityMap) || !Array.isArray(capabilityMap.capabilities)) {
    return { capabilityMap, blockers: [] };
  }

  const profiles = isRecord(capabilityMap.capability_policy_profiles)
    ? capabilityMap.capability_policy_profiles
    : {};
  const blockers: string[] = [];
  const capabilities = capabilityMap.capabilities.map((entry, index) => {
    if (!isRecord(entry) || typeof entry.capability_policy_profile_ref !== 'string') {
      return entry;
    }
    const capabilityId = typeof entry.capability_id === 'string' && entry.capability_id.trim()
      ? entry.capability_id.trim()
      : `capability_index_${index}`;
    const profileRef = entry.capability_policy_profile_ref;
    const profileId = profileRef.startsWith(PROFILE_REF_PREFIX)
      ? profileRef.slice(PROFILE_REF_PREFIX.length)
      : '';
    const profile = profiles[profileId];
    if (!profileId || profileId.includes('/') || !Object.hasOwn(profiles, profileId) || !isRecord(profile)) {
      blockers.push(`capability_map_policy_profile_unresolved:${capabilityId}:${profileRef}`);
      return entry;
    }
    return {
      ...profile,
      ...entry,
    } satisfies JsonRecord;
  });

  return {
    capabilityMap: {
      ...capabilityMap,
      capabilities,
    },
    blockers,
  };
}
