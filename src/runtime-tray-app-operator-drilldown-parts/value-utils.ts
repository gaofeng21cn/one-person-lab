import type { DomainManifestCatalogEntry } from '../domain-manifest/types.ts';
import type { JsonRecord } from '../runtime-tray-snapshot-types.ts';

export function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function record(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

export function recordList(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

export function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.map(stringValue).filter((entry): entry is string => Boolean(entry))
    : [];
}

export function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function booleanValue(value: unknown) {
  return typeof value === 'boolean' ? value : null;
}

export function uniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

export function uniqueRefs<T extends { ref: string; role?: string | null }>(values: T[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = `${value.role ?? ''}:${value.ref}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function uniqueRefsByValue<T extends { ref: string }>(values: T[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (seen.has(value.ref)) {
      return false;
    }
    seen.add(value.ref);
    return true;
  });
}

export function cleanupCommandDomainId(project: DomainManifestCatalogEntry, fallbackDomainId: string) {
  return stringValue(project.project_id)
    ?? stringValue(project.project)
    ?? fallbackDomainId;
}

export function nestedRef(value: unknown) {
  return isRecord(value) && typeof value.ref === 'string' && value.ref.trim().length > 0
    ? value.ref.trim()
    : null;
}

function typedBlockerId(value: JsonRecord) {
  return stringValue(value.blocker_id)
    ?? stringValue(value.blocker_kind)
    ?? stringValue(value.reason)
    ?? JSON.stringify(value);
}

export function uniqueBlockers(values: JsonRecord[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = typedBlockerId(value);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function refsFromRecord(value: JsonRecord, keys: string[]) {
  return uniqueStrings(keys.flatMap((key) => {
    const entry = value[key];
    if (typeof entry === 'string') {
      return [entry];
    }
    return stringList(entry);
  }));
}
