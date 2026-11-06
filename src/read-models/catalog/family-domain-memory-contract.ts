import { normalizeDurableKnowledgeCatalog, readDurableKnowledgeCatalog, type DurableKnowledgeCatalogReadback } from '../../authority/packages/index.ts';
import { canonicalJsonText } from '../../kernel/canonical-json.ts';
import { FrameworkContractError } from '../../kernel/contract-validation.ts';

export type FamilyDomainMemoryRef = DurableKnowledgeCatalogReadback;

export function normalizeFamilyDomainMemoryRef(value: unknown, repoDir?: string): FamilyDomainMemoryRef | null {
  const inline = value === undefined || value === null ? null : normalizeDurableKnowledgeCatalog(value);
  const source = repoDir ? readDurableKnowledgeCatalog(repoDir) : null;
  if (source?.status !== 'declared') return inline;
  if (inline && canonicalJsonText(inline) !== canonicalJsonText(source)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Manifest knowledge projection differs from its canonical repository catalog.');
  }
  return source;
}
