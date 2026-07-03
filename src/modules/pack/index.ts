export const OPL_PACK_SOURCE_MODULE = {
  moduleId: 'pack',
  brandName: 'OPL Pack',
  contractRef: 'contracts/opl-framework/source-module-map.json#modules.pack',
  physicalRoot: 'src/modules/pack',
} as const;

// Public cross-module surface generated from existing module consumers.
export {
  buildDomainPackCompilerList,
  buildGeneratedAgentInterfaces,
  buildRepoGeneratedInterfaceBundle,
} from './domain-pack-compiler.ts';
export { buildGeneratedInterfaceBundle, selectGeneratedInterfaceBundleFormat } from './domain-pack-compiler/generated-interface-read-model.ts';
export { validatePackBundleContract } from './pack-bundle-contract.ts';
export { validatePackOsContract } from './pack-os-contract.ts';
export { validateScholarSkillsCapabilityModules } from './scholar-skills-contract.ts';
