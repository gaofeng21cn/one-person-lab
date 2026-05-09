import * as fs from 'fs';
import { type JsonRecord, type RuntimeTraySourceRef } from './runtime-tray-snapshot-types.ts';

export function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function optionalBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : null;
}

export function firstString(...values: unknown[]) {
  for (const value of values) {
    const normalized = optionalString(value);
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

export function readJsonRecord(filePath: string): JsonRecord | null {
  try {
    const value = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
    return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null;
  } catch {
    return null;
  }
}

export function nestedRecord(record: JsonRecord | null | undefined, key: string): JsonRecord | null {
  const value = record?.[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null;
}

export function stringListFromRecords(value: unknown, key: string, limit = 5) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => entry && typeof entry === 'object' && !Array.isArray(entry)
      ? optionalString((entry as JsonRecord)[key])
      : optionalString(entry))
    .filter((entry): entry is string => Boolean(entry))
    .slice(0, limit);
}

export function stringList(value: unknown, limit = 8) {
  return Array.isArray(value)
    ? value.map((entry) => optionalString(entry)).filter((entry): entry is string => Boolean(entry)).slice(0, limit)
    : [];
}

export function jsonRecordList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is JsonRecord => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))
    : [];
}

export function firstStringFromList(values: string[]) {
  return values.find((value) => value.trim().length > 0) ?? null;
}

export function normalizeStatusCode(status: string) {
  return status.trim().toLowerCase();
}

export function uniqueByRef(refs: RuntimeTraySourceRef[]) {
  const seen = new Set<string>();
  return refs.filter((ref) => {
    const key = `${ref.ref_kind}:${ref.ref}:${ref.role}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
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

export function sourceRef(ref: string, role: string, label?: string): RuntimeTraySourceRef {
  return {
    ref_kind: 'json_pointer',
    ref,
    role,
    label,
  };
}

export function fileSourceRef(ref: string, role: string, label?: string): RuntimeTraySourceRef {
  return {
    ref_kind: 'file',
    ref,
    role,
    label,
  };
}

export function shellArgument(value: string) {
  return value.includes(' ') || value.includes("'") ? `'${value.replace(/'/g, `'\\''`)}'` : value;
}
