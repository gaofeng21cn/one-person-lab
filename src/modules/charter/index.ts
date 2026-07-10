export const OPL_CHARTER_SOURCE_MODULE = {
  moduleId: 'charter',
  brandName: 'OPL Charter',
  contractRef: 'contracts/opl-framework/source-module-map.json#modules.charter',
  physicalRoot: 'src/modules/charter',
} as const;

// Public cross-module surface generated from existing module consumers.
export { buildEvidenceGroundedCharterProfileBoundaryReadback } from './evidence-grounded-decision-agent-profile.ts';
export { buildBrandModuleL5Status } from './brand-module-l5-evidence.ts';
export { listBrandModuleL5EvidenceReceipts } from './brand-module-l5-evidence-ledger.ts';
export { findDomainOrThrow, findWorkstreamOrThrow, FrameworkContractError, loadFrameworkContracts, validateCliCommandRegistryEntry } from './contracts.ts';
export { buildSourceStructureOperatorReadback } from './source-structure-operator-readback.ts';
export { listStandardDomainAgentIds, normalizeStandardDomainAgentId, resolveStandardAgent, resolveStandardAgentByCanonicalPluginName, resolveStandardAgentByDomainId, STANDARD_AGENT_REGISTRY, STANDARD_AGENT_REGISTRY_REF, STANDARD_AGENT_SERIES_MEMBERSHIP, standardAgentDomainAliasEntries } from '../../kernel/standard-agent-registry.ts';
export type { StandardAgentRegistryEntry, StandardAgentSeriesMembership, StandardAgentWorkspaceProfile } from '../../kernel/standard-agent-registry.ts';
