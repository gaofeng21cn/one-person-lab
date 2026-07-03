export const OPL_CHARTER_SOURCE_MODULE = {
  moduleId: 'charter',
  brandName: 'OPL Charter',
  contractRef: 'contracts/opl-framework/source-module-map.json#modules.charter',
  physicalRoot: 'src/modules/charter',
} as const;

// Public cross-module surface generated from existing module consumers.
export { buildBrandModuleL5Status } from './brand-module-l5-evidence.ts';
export { listBrandModuleL5EvidenceReceipts } from './brand-module-l5-evidence-ledger.ts';
export { validateAgentWorkspaceNorm } from './contract-validators/agent-workspace-norm-contract.ts';
export { validateDomainsRegistry } from './contract-validators/domain-contracts.ts';
export { validatePackBundleContract } from './contract-validators/pack-bundle-contract.ts';
export { validatePackOsContract } from './contract-validators/pack-os-contract.ts';
export { SCHOLAR_SKILL_MODULE_IDS, validateScholarSkillsCapabilityModules } from './contract-validators/scholar-skills-contract.ts';
export { findDomainOrThrow, findWorkstreamOrThrow, FrameworkContractError, loadFrameworkContracts } from './contracts.ts';
export { buildSourceStructureOperatorReadback } from './source-structure-operator-readback.ts';
export { listStandardDomainAgentIds, resolveStandardAgent, resolveStandardAgentByCanonicalPluginName, STANDARD_AGENT_REGISTRY, STANDARD_AGENT_REGISTRY_REF, standardAgentDomainAliasEntries } from './standard-agent-registry.ts';
export type { StandardAgentRegistryEntry, StandardAgentSeriesMembership } from './standard-agent-registry.ts';
