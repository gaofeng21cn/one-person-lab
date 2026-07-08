const CANONICAL_OWNER_ALIASES = new Map([
  ['mas', 'med-autoscience'],
  ['medautoscience', 'med-autoscience'],
  ['med-autoscience', 'med-autoscience'],
  ['med-auto-science', 'med-autoscience'],
  ['mag', 'med-autogrant'],
  ['medautogrant', 'med-autogrant'],
  ['med-autogrant', 'med-autogrant'],
  ['med-auto-grant', 'med-autogrant'],
  ['rca', 'redcube-ai'],
  ['redcube', 'redcube-ai'],
  ['redcubeai', 'redcube-ai'],
  ['redcube-ai', 'redcube-ai'],
  ['oma', 'opl-meta-agent'],
  ['oplmetaagent', 'opl-meta-agent'],
  ['opl-meta-agent', 'opl-meta-agent'],
  ['meta-agent', 'opl-meta-agent'],
  ['obf', 'opl-bookforge'],
  ['oplbookforge', 'opl-bookforge'],
  ['opl-bookforge', 'opl-bookforge'],
  ['bookforge', 'opl-bookforge'],
  ['book-forge', 'opl-bookforge'],
  ['opl', 'one-person-lab'],
  ['onepersonlab', 'one-person-lab'],
  ['one-person-lab', 'one-person-lab'],
]);

export function canonicalOwnerId(value: string) {
  const normalized = value.trim();
  const key = normalized.toLowerCase().replace(/[\s_]+/g, '-');
  const compact = key.replace(/-/g, '');
  return CANONICAL_OWNER_ALIASES.get(key)
    ?? CANONICAL_OWNER_ALIASES.get(compact)
    ?? normalized;
}
