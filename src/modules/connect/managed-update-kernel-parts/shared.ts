export function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function stringValue(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function booleanValue(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  return typeof value === 'boolean' ? value : null;
}
