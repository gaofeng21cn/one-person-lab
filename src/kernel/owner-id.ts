import { resolveStandardAgentByOwnerAlias } from './standard-agent-registry.ts';

const FRAMEWORK_OWNER_ALIASES = new Set(['opl', 'onepersonlab']);

export function canonicalOwnerId(value: string) {
  const normalized = value.trim();
  const ownerEntry = resolveStandardAgentByOwnerAlias(normalized);
  if (ownerEntry) {
    return ownerEntry.owner_id;
  }
  const compact = normalized.toLowerCase().replace(/[^a-z0-9]/g, '');
  return FRAMEWORK_OWNER_ALIASES.has(compact) ? 'one-person-lab' : normalized;
}
