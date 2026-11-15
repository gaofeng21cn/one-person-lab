export type {
  StandardAgentDescriptorInterface,
  StandardAgentDomainDetailViewDeclaration,
  StandardAgentInterface,
  StandardAgentInventoryProjection,
  StandardAgentLocatorField,
  StandardAgentSourceMaterialConsumerResolution,
  StandardAgentSourceMaterialConsumerRoute,
  StandardAgentStageCatalogDeclaration,
  StandardAgentTaskProvider,
} from './standard-agent-interface-types.ts';

export { STANDARD_AGENT_INTERFACE_VERSION, STANDARD_AGENT_DESCRIPTOR_RELATIVE_PATH } from './standard-agent-interface-parts/constants.ts';
export { parseStandardAgentInventoryProjection } from './standard-agent-interface-parts/inventory-and-stages.ts';
export { parseStandardAgentInterface } from './standard-agent-interface-parts/declaration.ts';
export { resolveStandardAgentSourceMaterialConsumerRoute } from './standard-agent-interface-parts/source-material.ts';
export { readStandardAgentDescriptorInterface, readStandardAgentInterface, assertStandardAgentDescriptorIdentity } from './standard-agent-interface-parts/descriptor.ts';
