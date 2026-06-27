export function readOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function readStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => readOptionalString(entry))
    .filter((entry): entry is string => Boolean(entry));
}

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readRecordArray(value: unknown) {
  return Array.isArray(value) ? value.filter(isPlainRecord) : [];
}

export function refValues(refs: unknown) {
  return readRecordArray(refs).flatMap((ref) => {
    const raw = ref.ref;
    if (Array.isArray(raw)) {
      return readStringArray(raw);
    }
    return readOptionalString(raw) ? [readOptionalString(raw)!] : [];
  });
}
