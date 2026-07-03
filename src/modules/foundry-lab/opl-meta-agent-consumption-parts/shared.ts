import { isRecord } from '../../../kernel/contract-validation.ts';
import { optionalString } from '../../../kernel/json-file.ts';
import {
  record,
  recordList,
  stringList,
  type JsonRecord,
} from '../../../kernel/json-record.ts';
import {
  refsOnlyAuthorityBoundary,
  uniqueStringList,
} from '../opl-meta-agent-consumption-boundary.ts';

export type { JsonRecord };
export {
  isRecord,
  optionalString,
  record,
  recordList,
  refsOnlyAuthorityBoundary,
  stringList,
  uniqueStringList,
};

export const OMA_DOMAIN_ID = 'opl-meta-agent';
export const OMA_PROJECT = 'opl-meta-agent';
export const OMA_WORKSPACE_ENV = 'OPL_META_AGENT_REPO_DIR';

export function refsArray(value: unknown) {
  return Array.isArray(value) ? stringList(value) : stringList([value]);
}
