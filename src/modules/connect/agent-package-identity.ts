const CANONICAL_AGENT_PACKAGE_IDS = new Map<string, string>([
  ['mas', 'med-autoscience'],
  ['medautoscience', 'med-autoscience'],
  ['mag', 'med-autogrant'],
  ['medautogrant', 'med-autogrant'],
  ['rca', 'redcube-ai'],
  ['redcubeai', 'redcube-ai'],
  ['redcube', 'redcube-ai'],
  ['oma', 'opl-meta-agent'],
  ['oplmetaagent', 'opl-meta-agent'],
  ['bookforge', 'opl-bookforge'],
  ['obf', 'opl-bookforge'],
  ['oplbookforge', 'opl-bookforge'],
]);

function normalizeAgentPackageAliasKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function canonicalAgentPackageId(value: unknown) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }
  const trimmed = value.trim().toLowerCase();
  return CANONICAL_AGENT_PACKAGE_IDS.get(normalizeAgentPackageAliasKey(trimmed)) ?? trimmed;
}
