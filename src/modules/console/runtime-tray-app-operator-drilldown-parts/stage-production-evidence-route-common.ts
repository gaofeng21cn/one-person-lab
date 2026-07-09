import domainsContract from '../../../../contracts/opl-framework/domains.json' with { type: 'json' };

type DomainRegistryEntry = {
  domain_id?: unknown;
  project?: unknown;
  independent_domain_agent?: {
    agent_id?: unknown;
  };
  single_app_skill?: {
    skill_id?: unknown;
  };
};

function normalizedDomainAlias(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase().replaceAll('_', '-');
  return normalized.length > 0 ? normalized : null;
}

function compactDomainAlias(value: string) {
  return value.replaceAll('-', '');
}

function buildDomainAliasMap() {
  const aliases = new Map<string, string>();
  const domains = Array.isArray((domainsContract as { domains?: unknown }).domains)
    ? (domainsContract as { domains: DomainRegistryEntry[] }).domains
    : [];
  for (const domain of domains) {
    const domainId = normalizedDomainAlias(domain.domain_id);
    if (!domainId) {
      continue;
    }
    for (const alias of [
      domain.domain_id,
      domain.project,
      domain.independent_domain_agent?.agent_id,
      domain.single_app_skill?.skill_id,
    ]) {
      const normalized = normalizedDomainAlias(alias);
      if (normalized) {
        aliases.set(normalized, domainId);
        aliases.set(compactDomainAlias(normalized), domainId);
      }
    }
  }
  return aliases;
}

const DOMAIN_ALIASES = buildDomainAliasMap();

export function familyRuntimeCommandDomainId(domainId: string | null, projectId: string | null): string | null {
  for (const value of [domainId, projectId]) {
    const normalized = normalizedDomainAlias(value);
    if (!normalized) {
      continue;
    }
    const resolved = DOMAIN_ALIASES.get(normalized) ?? DOMAIN_ALIASES.get(compactDomainAlias(normalized));
    if (resolved) {
      return resolved;
    }
  }
  return null;
}

export function stageProductionEvidenceRequestId(domainId: string, stageId: string) {
  return `stage_production_evidence:${domainId}:${stageId}`;
}

export function stageProductionEvidenceRequestPackId(domainId: string) {
  return `${domainId}.stage_production_evidence`;
}
