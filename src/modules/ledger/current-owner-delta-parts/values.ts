import {
  countValue,
  record,
  stringList,
  stringValue,
  type JsonRecord,
} from '../../../kernel/json-record.ts';

export type { JsonRecord };
export { record, stringList, stringValue };

export const numberValue = countValue;

export function firstString(...values: unknown[]) {
  for (const value of values) {
    const text = stringValue(value);
    if (text) {
      return text;
    }
  }
  return null;
}

export function uniqueStringList(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

export function sanitizeIdPart(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'unknown';
}

export function omitPayloadTemplateDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(omitPayloadTemplateDeep);
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return value;
  }
  const valueRecord = record(value);
  return Object.fromEntries(
    Object.entries(valueRecord)
      .filter(([key]) => key !== 'payload_template')
      .map(([key, entry]) => [key, omitPayloadTemplateDeep(entry)]),
  );
}
