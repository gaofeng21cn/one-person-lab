import type { StandardAgentDomainDetailViewDeclaration } from '../../kernel/standard-agent-interface.ts';
import type { DomainDetailViewLocator } from './work-item-projection/types.ts';

export function projectDomainDetailViewLocators(input: {
  itemId: string;
  workItemRoot: string | null;
  declarations: StandardAgentDomainDetailViewDeclaration[];
}): DomainDetailViewLocator[] {
  return input.declarations.map((declaration) => ({
    item_id: input.itemId,
    view_id: declaration.view_id,
    view_kind: declaration.view_kind,
    schema_version: declaration.schema_version,
    availability: input.workItemRoot ? 'unread' : 'missing',
  }));
}
