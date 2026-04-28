import {
  buildContractsContext,
  buildProductEntryHandoffBundle,
  buildResolveRequestInput,
} from './product-entry-parts/builders.ts';
import type { ProductEntryCliInput } from './product-entry-parts/types.ts';
import { explainDomainBoundary, resolveRequestSurface } from './resolver.ts';
import type { GatewayContracts } from './types.ts';

export function buildProductEntryHandoffEnvelope(
  input: ProductEntryCliInput,
  contracts: GatewayContracts,
) {
  const resolveInput = buildResolveRequestInput(input);
  const routing = resolveRequestSurface(resolveInput, contracts);
  const boundary = explainDomainBoundary(resolveInput, contracts);

  return {
    version: 'g2',
    contracts_context: buildContractsContext(contracts),
    ...buildProductEntryHandoffBundle(
      contracts,
      'ask',
      input,
      routing,
      boundary,
    ),
  };
}
