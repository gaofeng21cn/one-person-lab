export const OPL_ATLAS_SOURCE_MODULE = {
  moduleId: 'atlas',
  brandName: 'OPL Atlas',
  contractRef: 'contracts/opl-framework/source-module-map.json#modules.atlas',
  physicalRoot: 'src/modules/atlas',
} as const;

// Public cross-module surface generated from existing module consumers.
export { buildDomainManifestCatalog } from './domain-manifest/catalog-builder.ts';
export type { DomainManifestCatalog } from './domain-manifest/catalog-builder.ts';
export { normalizeManifest } from './domain-manifest/normalizers.ts';
export { buildStandardAgentDomainManifestCatalog } from './domain-manifest/standard-agent-catalog.ts';
export { resolveBindingManifest } from './domain-manifest/resolver.ts';
export {
  loadManagedStandardAgentContractCatalog,
  STANDARD_AGENT_ACTION_CATALOG_REF,
  STANDARD_AGENT_STAGE_CATALOG_REF,
} from './domain-manifest/managed-standard-agent-contracts.ts';
export type { ManifestCommandTimeoutPolicy } from './domain-manifest/resolver.ts';
export { isRecord } from './domain-manifest/shared-utils.ts';
export type { DomainManifestCatalogEntry, NormalizedDomainManifest, NormalizedSurfaceRef } from './domain-manifest/types.ts';
export { buildDomainEntryParity, buildRecommendedEntrySurfaces } from './family-domain-catalog.ts';
export { buildEvidenceGroundedDecisionAgentProfileAtlasCatalog } from './evidence-grounded-profile-catalog.ts';
export { validateFamilyDomainEntryContract, validateSharedHandoff, validateSharedHandoffBuilder, validateUserInteractionContract } from './family-entry-contracts.ts';
export type { FamilySharedHandoffSurface, SharedHandoffBuilderSurface } from './family-entry-contracts.ts';
export { explainDomainBoundary, selectDomainAgentEntry } from './resolver.ts';
export {
  normalizeStandardDomainAgentId,
  resolveStandardAgent,
  STANDARD_AGENT_REGISTRY,
  STANDARD_AGENT_REGISTRY_REF,
} from '../../kernel/standard-agent-registry.ts';
export {
  DEFAULT_FAMILY_REPOS,
  DEFAULT_STANDARD_DOMAIN_AGENT_REPOS,
  defaultFamilyRepoInputs,
  defaultStandardDomainAgentRepoInputs,
} from './standard-domain-agent-family-repos.ts';
