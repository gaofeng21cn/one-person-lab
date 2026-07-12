import {
  STANDARD_AGENT_REGISTRY,
  STANDARD_AGENT_SERIES_MEMBERSHIP,
} from '../../kernel/standard-agent-registry.ts';

function normalizeAgentPackageAliasKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

const CANONICAL_AGENT_PACKAGE_IDS = new Map<string, string>(
  STANDARD_AGENT_REGISTRY
    .filter((entry) => entry.series_membership === STANDARD_AGENT_SERIES_MEMBERSHIP)
    .flatMap((entry) => [
      entry.agent_id,
      entry.domain_id,
      entry.domain_alias,
      entry.work_alias,
      entry.project,
      entry.plugin_name,
      entry.canonical_plugin_name,
      ...entry.aliases,
    ].map((alias) => [normalizeAgentPackageAliasKey(alias), entry.project] as const)),
);

export function canonicalAgentPackageId(value: unknown) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }
  const trimmed = value.trim().toLowerCase();
  return CANONICAL_AGENT_PACKAGE_IDS.get(normalizeAgentPackageAliasKey(trimmed)) ?? trimmed;
}
