import {
  listProjectedOplPackageIds,
  STANDARD_AGENT_REGISTRY,
  STANDARD_AGENT_SERIES_MEMBERSHIP,
} from '../../kernel/standard-agent-registry.ts';

function normalizeAgentPackageAliasKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

export const CANONICAL_OPL_PACKAGE_IDS: readonly string[] = new Proxy([] as string[], {
  get(_target, property) {
    return Reflect.get(listProjectedOplPackageIds(), property);
  },
});

export function canonicalAgentPackageId(value: unknown) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }
  const trimmed = value.trim().toLowerCase();
  const key = normalizeAgentPackageAliasKey(trimmed);
  const projectedId = listProjectedOplPackageIds().find((id) => normalizeAgentPackageAliasKey(id) === key);
  if (projectedId) return projectedId;
  const agent = STANDARD_AGENT_REGISTRY.find((entry) =>
    entry.series_membership === STANDARD_AGENT_SERIES_MEMBERSHIP
    && [entry.agent_id, entry.domain_id, entry.target_domain_id, entry.project,
      entry.plugin_name, entry.canonical_plugin_name, ...entry.aliases]
      .some((alias) => normalizeAgentPackageAliasKey(alias) === key));
  return agent?.agent_id ?? trimmed;
}

export function publicAgentPackageSelector(packageId: string) {
  return STANDARD_AGENT_REGISTRY.find((entry) =>
    entry.series_membership === STANDARD_AGENT_SERIES_MEMBERSHIP
    && entry.agent_id === packageId)?.agent_id ?? packageId;
}
