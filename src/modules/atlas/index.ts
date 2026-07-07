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
export { resolveBindingManifest } from './domain-manifest/resolver.ts';
export type { ManifestCommandTimeoutPolicy } from './domain-manifest/resolver.ts';
export { isRecord } from './domain-manifest/shared-utils.ts';
export type { DomainManifestCatalogEntry, NormalizedDomainManifest, NormalizedSurfaceRef } from './domain-manifest/types.ts';
export { buildDomainEntryParity, buildRecommendedEntrySurfaces } from './family-domain-catalog.ts';
export { validateFamilyDomainEntryContract, validateSharedHandoff, validateSharedHandoffBuilder, validateUserInteractionContract } from './family-entry-contracts.ts';
export type { FamilySharedHandoffSurface, SharedHandoffBuilderSurface } from './family-entry-contracts.ts';
export { explainDomainBoundary, selectDomainAgentEntry } from './resolver.ts';
export { resolveStandardAgent, STANDARD_AGENT_REGISTRY, STANDARD_AGENT_REGISTRY_REF } from './standard-agent-registry.ts';
