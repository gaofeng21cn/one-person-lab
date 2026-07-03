export const OPL_CHARTER_SOURCE_MODULE = {
  moduleId: 'charter',
  brandName: 'OPL Charter',
  contractRef: 'contracts/opl-framework/source-module-map.json#modules.charter',
  physicalRoot: 'src/modules/charter',
} as const;


// Public cross-module surface generated from existing module consumers.
export { buildBrandModuleL5Status } from './brand-module-l5-evidence.ts';
export { listBrandModuleL5EvidenceReceipts } from './brand-module-l5-evidence-ledger.ts';
export { FrameworkContractError, findDomainOrThrow, findWorkstreamOrThrow, loadFrameworkContracts } from './contracts.ts';
export { buildSourceStructureOperatorReadback } from './source-structure-operator-readback.ts';
