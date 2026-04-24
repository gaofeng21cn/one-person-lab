type JsonRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function requireString(value: unknown, field: string) {
  const text = optionalString(value);
  if (!text) {
    throw new Error(`Missing required string field: ${field}`);
  }
  return text;
}

export function readStringList(value: unknown, _field?: string) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => optionalString(entry))
    .filter((entry): entry is string => Boolean(entry));
}

export function requireRecord(value: unknown, field: string) {
  if (!isRecord(value)) {
    throw new Error(`Missing required object field: ${field}`);
  }
  return value;
}

export function normalizeRecordMap(value: unknown, field: string) {
  const record = requireRecord(value, field);
  const normalized: Record<string, JsonRecord> = {};

  for (const [key, entry] of Object.entries(record)) {
    if (!isRecord(entry)) {
      throw new Error(`Field ${field}.${key} must be an object.`);
    }
    normalized[key] = entry;
  }

  return normalized;
}

export function normalizeRecordList(value: unknown, field: string) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`Field ${field}[${index}] must be an object.`);
    }
    return entry;
  });
}

export function requireSurfaceKind(value: unknown, field: string, expected: string) {
  const surfaceKind = requireString(value, `${field}.surface_kind`);
  if (surfaceKind !== expected) {
    throw new Error(`${field}.surface_kind must be ${expected}.`);
  }
  return surfaceKind;
}
