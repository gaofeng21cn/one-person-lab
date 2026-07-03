import { fileSourceRef, sourceRef, uniqueByRef } from '../../kernel/source-ref.ts';
import { isRecord } from '../../kernel/contract-validation.ts';
import { readJsonFileOrNull } from '../../kernel/json-file.ts';
import {
  recordList,
  stringList as jsonStringList,
  stringValue,
} from '../../kernel/json-record.ts';
import { type JsonRecord } from './runtime-tray-snapshot-types.ts';

export { fileSourceRef, sourceRef, uniqueByRef };
export { stringValue as optionalString } from '../../kernel/json-record.ts';

export function optionalBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : null;
}

export function firstString(...values: unknown[]) {
  for (const value of values) {
    const normalized = stringValue(value);
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

export function readJsonRecord(filePath: string): JsonRecord | null {
  const value = readJsonFileOrNull(filePath);
  return isRecord(value) ? value : null;
}

export function nestedRecord(record: JsonRecord | null | undefined, key: string): JsonRecord | null {
  const value = record?.[key];
  return isRecord(value) ? value : null;
}

export function stringListFromRecords(value: unknown, key: string, limit = 5) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => isRecord(entry)
      ? stringValue(entry[key])
      : stringValue(entry))
    .filter((entry): entry is string => Boolean(entry))
    .slice(0, limit);
}

export function stringList(value: unknown, limit = 8) {
  return jsonStringList(value).slice(0, limit);
}

export function jsonRecordList(value: unknown) {
  return recordList(value);
}

export function firstStringFromList(values: string[]) {
  return values.find((value) => value.trim().length > 0) ?? null;
}

export function normalizeStatusCode(status: string) {
  return status.trim().toLowerCase();
}

export function uniqueStrings(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) {
      return false;
    }
    seen.add(normalized);
    return true;
  });
}

export function shellArgument(value: string) {
  return value.includes(' ') || value.includes("'") ? `'${value.replace(/'/g, `'\\''`)}'` : value;
}
