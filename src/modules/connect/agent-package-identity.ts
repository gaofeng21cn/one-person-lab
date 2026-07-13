import {
  STANDARD_AGENT_REGISTRY,
  STANDARD_AGENT_SERIES_MEMBERSHIP,
} from '../../kernel/standard-agent-registry.ts';

function normalizeAgentPackageAliasKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

export const CANONICAL_OPL_PACKAGE_IDS = [
  'mas',
  'mag',
  'rca',
  'oma',
  'obf',
  'mas-scholar-skills',
  'opl-flow',
] as const;

const CANONICAL_PACKAGE_IDS = new Map<string, string>([
  ...STANDARD_AGENT_REGISTRY
    .filter((entry) => entry.series_membership === STANDARD_AGENT_SERIES_MEMBERSHIP)
    .flatMap((entry) => [
      entry.agent_id,
      entry.domain_id,
      entry.target_domain_id,
      entry.project,
      entry.plugin_name,
      entry.canonical_plugin_name,
      ...entry.aliases,
    ].map((alias) => [normalizeAgentPackageAliasKey(alias), entry.agent_id] as const)),
  ['oplflow', 'opl-flow'],
]);

export function canonicalAgentPackageId(value: unknown) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }
  const trimmed = value.trim().toLowerCase();
  return CANONICAL_PACKAGE_IDS.get(normalizeAgentPackageAliasKey(trimmed)) ?? trimmed;
}

export function publicAgentPackageSelector(packageId: string) {
  return STANDARD_AGENT_REGISTRY.find((entry) =>
    entry.series_membership === STANDARD_AGENT_SERIES_MEMBERSHIP
    && entry.agent_id === packageId)?.agent_id ?? packageId;
}
