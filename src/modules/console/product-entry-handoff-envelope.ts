import {
  buildContractsContext,
  buildProductEntryHandoffBundle,
  buildDomainAgentSelectionInput,
} from './product-entry-parts/builders.ts';
import type { ProductEntryCliInput } from './product-entry-parts/types.ts';
import { explainDomainBoundary, selectDomainAgentEntry } from '../atlas/resolver.ts';
import type { FrameworkContracts } from '../../kernel/types.ts';

export function buildProductEntryHandoffEnvelope(
  input: ProductEntryCliInput,
  contracts: FrameworkContracts,
) {
  const selectionInput = buildDomainAgentSelectionInput(input);
  const stageSelection = selectDomainAgentEntry(selectionInput, contracts);
  const boundary = explainDomainBoundary(selectionInput, contracts);

  return {
    version: 'g2',
    contracts_context: buildContractsContext(contracts),
    ...buildProductEntryHandoffBundle(
      contracts,
      'ask',
      input,
      stageSelection,
      boundary,
    ),
  };
}
