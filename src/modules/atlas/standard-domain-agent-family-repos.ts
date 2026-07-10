import {
  discoverFamilyRepoInputs,
  hasDefaultFamilyConformanceSurface,
  hasStandardDomainAgentSurface,
} from '../../kernel/standard-domain-agent-family-repos.ts';
import {
  STANDARD_AGENT_REGISTRY,
  STANDARD_AGENT_SERIES_MEMBERSHIP,
} from '../charter/standard-agent-registry.ts';

export const DEFAULT_FAMILY_REPOS = STANDARD_AGENT_REGISTRY.map((entry) => ({
  requested_agent_id: entry.agent_id,
  directory: entry.project,
}));

export const DEFAULT_STANDARD_DOMAIN_AGENT_REPOS = STANDARD_AGENT_REGISTRY
  .filter((entry) => entry.series_membership === STANDARD_AGENT_SERIES_MEMBERSHIP)
  .map((entry) => ({
    requested_agent_id: entry.agent_id,
    directory: entry.project,
  }));

export function defaultFamilyRepoInputs() {
  return discoverFamilyRepoInputs(DEFAULT_FAMILY_REPOS, hasDefaultFamilyConformanceSurface);
}

export function defaultStandardDomainAgentRepoInputs() {
  return discoverFamilyRepoInputs(
    DEFAULT_STANDARD_DOMAIN_AGENT_REPOS,
    hasStandardDomainAgentSurface,
  );
}
