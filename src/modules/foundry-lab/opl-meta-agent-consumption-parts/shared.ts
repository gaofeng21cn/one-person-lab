import type { JsonRecord } from '../../console/index.ts';
import {
  refsOnlyAuthorityBoundary,
  uniqueStringList,
} from '../opl-meta-agent-consumption-boundary.ts';

export type { JsonRecord };
export { refsOnlyAuthorityBoundary, uniqueStringList };

export const OMA_DOMAIN_ID = 'opl-meta-agent';
export const OMA_PROJECT = 'opl-meta-agent';
export const OMA_WORKSPACE_ENV = 'OPL_META_AGENT_REPO_DIR';

export function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function record(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

export function recordList(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

export function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.map(optionalString).filter((entry): entry is string => Boolean(entry))
    : [];
}

export function refsArray(value: unknown) {
  return Array.isArray(value) ? stringList(value) : stringList([value]);
}
