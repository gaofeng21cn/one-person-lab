export const OPL_FOUNDRY_SOURCE_MODULE = {
  moduleId: 'foundry',
  brandName: 'OPL Foundry Kernel',
  contractRef: 'contracts/opl-framework/source-module-map.json#modules.foundry',
  physicalRoot: 'src/modules/foundry',
} as const;

export * from './control.ts';
export * from './designer-adapter.ts';
export * from './evaluation-runtime.ts';
export * from './in-memory-adapters.ts';
export * from './owner-gate.ts';
export * from './operation-result.ts';
export * from './protocol.ts';
export * from './risk-policy.ts';
export * from './state-machine.ts';
