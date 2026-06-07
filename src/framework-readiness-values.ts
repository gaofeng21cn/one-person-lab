export type JsonRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function record(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

export function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function countValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (isRecord(value)) {
    return numberValue(value.value);
  }
  return 0;
}

export function recordList(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

export function booleanValue(value: unknown) {
  return typeof value === 'boolean' ? value : false;
}

export function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}
