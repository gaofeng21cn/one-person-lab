export type JsonRecord = Record<string, unknown>;

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

export function countValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function uniqueStringList(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((entry): entry is string => Boolean(entry)))];
}

export function commandRef(args: string[]) {
  if (args[0] === 'agents') {
    return `opl ${args.join(' ')}`;
  }
  return `opl family-runtime ${args.join(' ')}`;
}

export function firstRef(value: unknown) {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry === 'string' && entry.trim()) {
        return entry.trim();
      }
      if (isRecord(entry)) {
        const ref = stringValue(entry.ref) ?? stringValue(entry.source_ref);
        if (ref) {
          return ref;
        }
      }
    }
  }
  return null;
}
