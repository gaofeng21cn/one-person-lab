export type StandardAgentSeriesMembership = 'standard_domain_agent' | 'framework_capability_package';

export type StandardAgentRegistryEntry = {
  agent_id: string;
  domain_id: string;
  target_domain_id: string;
  label: string;
  short_label: string;
  display_name: string;
  series_membership: StandardAgentSeriesMembership;
  project: string;
  module_id: string;
  plugin_name: string;
  canonical_plugin_name: string;
  aliases: string[];
};

export const STANDARD_AGENT_REGISTRY_REF = 'src/kernel/standard-agent-registry.ts';
export const STANDARD_AGENT_SERIES_MEMBERSHIP = 'standard_domain_agent' as const;
export const FRAMEWORK_CAPABILITY_PACKAGE_MEMBERSHIP = 'framework_capability_package' as const;

export const STANDARD_AGENT_REGISTRY = [
  {
    agent_id: 'mas',
    domain_id: 'medautoscience',
    target_domain_id: 'medautoscience',
    label: 'Med Auto Science',
    short_label: 'MAS',
    display_name: 'Med Auto Science',
    series_membership: STANDARD_AGENT_SERIES_MEMBERSHIP,
    project: 'med-autoscience',
    module_id: 'MEDAUTOSCIENCE',
    plugin_name: 'med-autoscience',
    canonical_plugin_name: 'mas',
    aliases: ['mas', 'medautoscience', 'med-autoscience', 'med_auto_science', 'study'],
  },
  {
    agent_id: 'mag',
    domain_id: 'medautogrant',
    target_domain_id: 'medautogrant',
    label: 'Med Auto Grant',
    short_label: 'MAG',
    display_name: 'Med Auto Grant',
    series_membership: STANDARD_AGENT_SERIES_MEMBERSHIP,
    project: 'med-autogrant',
    module_id: 'MEDAUTOGRANT',
    plugin_name: 'med-autogrant',
    canonical_plugin_name: 'mag',
    aliases: ['mag', 'medautogrant', 'med-autogrant', 'med_auto_grant', 'grant'],
  },
  {
    agent_id: 'rca',
    domain_id: 'redcube',
    target_domain_id: 'redcube_ai',
    label: 'RedCube AI',
    short_label: 'RCA',
    display_name: 'RedCube AI',
    series_membership: STANDARD_AGENT_SERIES_MEMBERSHIP,
    project: 'redcube-ai',
    module_id: 'REDCUBE',
    plugin_name: 'redcube-ai',
    canonical_plugin_name: 'rca',
    aliases: ['rca', 'redcube', 'redcube-ai', 'redcube_ai', 'redcubeai', 'deck'],
  },
  {
    agent_id: 'oma',
    domain_id: 'oplmetaagent',
    target_domain_id: 'opl-meta-agent',
    label: 'OPL Meta Agent',
    short_label: 'OMA',
    display_name: 'OPL Meta Agent',
    series_membership: STANDARD_AGENT_SERIES_MEMBERSHIP,
    project: 'opl-meta-agent',
    module_id: 'OPLMETAAGENT',
    plugin_name: 'opl-meta-agent',
    canonical_plugin_name: 'oma',
    aliases: [
      'oma',
      'oplmetaagent',
      'opl-meta-agent',
      'opl_meta_agent',
      'meta-agent',
      'meta_agent',
      'agent',
    ],
  },
  {
    agent_id: 'obf',
    domain_id: 'oplbookforge',
    target_domain_id: 'opl-bookforge',
    label: 'OPL Book Forge',
    short_label: 'OBF',
    display_name: 'OPL Book Forge',
    series_membership: STANDARD_AGENT_SERIES_MEMBERSHIP,
    project: 'opl-bookforge',
    module_id: 'OPLBOOKFORGE',
    plugin_name: 'opl-bookforge',
    canonical_plugin_name: 'obf',
    aliases: [
      'bookforge',
      'book-forge',
      'book_forge',
      'obf',
      'oplbookforge',
      'opl-bookforge',
      'opl_bookforge',
      'book',
    ],
  },
  {
    agent_id: 'mas-scholar-skills',
    domain_id: 'scholarskills',
    target_domain_id: 'scholarskills',
    label: 'MAS Scholar Skills',
    short_label: 'ScholarSkills',
    display_name: 'MAS Scholar Skills',
    series_membership: FRAMEWORK_CAPABILITY_PACKAGE_MEMBERSHIP,
    project: 'mas-scholar-skills',
    module_id: 'SCHOLARSKILLS',
    plugin_name: 'mas-scholar-skills',
    canonical_plugin_name: 'mas-scholar-skills',
    aliases: [
      'scholarskills',
      'scholar-skills',
      'scholar_skills',
      'mas-scholar-skills',
      'mas_scholar_skills',
      'capability',
      'capabilities',
    ],
  },
] as const satisfies readonly StandardAgentRegistryEntry[];

export type StandardAgentId = typeof STANDARD_AGENT_REGISTRY[number]['agent_id'];

function normalizeAgentKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function listStandardAgentIds() {
  return STANDARD_AGENT_REGISTRY.map((entry) => entry.agent_id);
}

export function listStandardDomainAgentIds() {
  return STANDARD_AGENT_REGISTRY
    .filter((entry) => entry.series_membership === STANDARD_AGENT_SERIES_MEMBERSHIP)
    .map((entry) => entry.agent_id);
}

export function standardDomainAgentFamilyProjection(format: 'compact' | 'full') {
  const agents = STANDARD_AGENT_REGISTRY
    .filter((entry) => entry.series_membership === STANDARD_AGENT_SERIES_MEMBERSHIP)
    .map((entry) => ({
      package_id: entry.agent_id,
      short_label: entry.short_label,
      display_name: entry.display_name,
      label: format === 'compact' ? entry.short_label : entry.display_name,
    }));
  return {
    surface_kind: 'opl_standard_agent_family_labels.v1' as const,
    format,
    labels: agents.map((entry) => entry.label),
    agents,
  };
}

function registryAliases(entry: StandardAgentRegistryEntry) {
  return [
    entry.agent_id,
    entry.domain_id,
    entry.target_domain_id,
    entry.project,
    entry.plugin_name,
    entry.canonical_plugin_name,
    ...entry.aliases,
  ];
}

export function resolveStandardAgent(value: string) {
  const normalized = normalizeAgentKey(value);
  return STANDARD_AGENT_REGISTRY.find((entry) =>
    registryAliases(entry).some((alias) => normalizeAgentKey(alias) === normalized)
  ) ?? null;
}

export function resolveStandardAgentByDomainId(domainId: string) {
  const normalized = normalizeAgentKey(domainId);
  return STANDARD_AGENT_REGISTRY.find((entry) =>
    [entry.domain_id, entry.target_domain_id].some((value) => normalizeAgentKey(value) === normalized)
  ) ?? null;
}

export function resolveStandardAgentByCanonicalPluginName(canonicalPluginName: string) {
  return STANDARD_AGENT_REGISTRY.find((entry) => entry.canonical_plugin_name === canonicalPluginName) ?? null;
}

export function normalizeStandardDomainAgentId(value: string) {
  const entry = resolveStandardAgent(value);
  return entry?.series_membership === STANDARD_AGENT_SERIES_MEMBERSHIP
    ? entry.target_domain_id
    : value.trim().toLowerCase();
}

export function standardAgentDomainAliasEntries() {
  return STANDARD_AGENT_REGISTRY.flatMap((entry) =>
    registryAliases(entry).map((alias) => ({ alias, domain_id: entry.domain_id }))
  );
}
