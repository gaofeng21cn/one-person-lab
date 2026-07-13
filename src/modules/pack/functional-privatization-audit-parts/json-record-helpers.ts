import { isRecord } from '../../../kernel/contract-validation.ts';

export type JsonRecord = Record<string, unknown>;

export function recordList(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

export function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

export function nestedRecord(root: JsonRecord, path: string[]) {
  let current: unknown = root;
  for (const key of path) {
    if (!isRecord(current)) {
      return null;
    }
    current = current[key];
  }
  return isRecord(current) ? current : null;
}
