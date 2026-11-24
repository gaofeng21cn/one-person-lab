import { FrameworkContractError, isRecord } from '../../../kernel/contract-validation.ts';

export function fail(message: string, details: Record<string, unknown> = {}): never {
  throw new FrameworkContractError('contract_shape_invalid', message, details);
}

export function requiredString(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) fail(`${field} must be a non-empty string.`, { field });
  return value.trim();
}

export function requiredStringList(value: unknown, field: string) {
  if (!Array.isArray(value)) fail(`${field} must be an array.`, { field });
  return value.map((entry, index) => requiredString(entry, `${field}[${index}]`));
}

export function requiredUniqueStringList(value: unknown, field: string, minimumItems = 0) {
  const entries = requiredStringList(value, field);
  if (entries.length < minimumItems) fail(`${field} must contain at least ${minimumItems} item(s).`, { field });
  if (new Set(entries).size !== entries.length) fail(`${field} must contain unique values.`, { field });
  return entries;
}

export function assertExactKeys(value: Record<string, unknown>, field: string, keys: readonly string[]) {
  const allowed = new Set(keys);
  const missing = keys.filter((key) => !Object.hasOwn(value, key));
  const unexpected = Object.keys(value).filter((key) => !allowed.has(key));
  if (missing.length > 0 || unexpected.length > 0) {
    fail(`${field} must use the closed protocol shape.`, { field, missing, unexpected });
  }
}

export function assertNumericMap(value: unknown, field: string) {
  if (!isRecord(value)) fail(`${field} must be an object.`, { field });
  for (const [key, entry] of Object.entries(value)) {
    if (!key.trim() || !Number.isFinite(entry)) fail(`${field}.${key} must be a finite number.`, { field, key });
  }
}

export function assertNonNegativeNumericMap(value: unknown, field: string) {
  assertNumericMap(value, field);
  for (const [key, entry] of Object.entries(value as Record<string, number>)) {
    if (entry < 0) fail(`${field}.${key} must be a non-negative limit.`, { field, key });
  }
}

export function assertDateTime(value: unknown, field: string) {
  const text = requiredString(value, field);
  if (Number.isNaN(Date.parse(text))) fail(`${field} must be an RFC 3339 date-time.`, { field });
}

export function assertDigest(value: unknown, field: string) {
  const digest = requiredString(value, field);
  if (!/^sha256:[a-f0-9]{64}$/.test(digest)) fail(`${field} must be a SHA-256 content digest.`, { field });
  return digest;
}

export function assertContentRef(value: unknown, field: string) {
  const ref = requiredString(value, field);
  if (!/^opl-content:\/\/sha256\/[a-f0-9]{64}$/.test(ref)) {
    fail(`${field} must be an exact opl-content SHA-256 ref.`, { field });
  }
  return ref;
}

export function requiredUniqueContentRefList(value: unknown, field: string, minimumItems = 1) {
  const refs = requiredUniqueStringList(value, field, minimumItems);
  refs.forEach((ref, index) => assertContentRef(ref, `${field}[${index}]`));
  return refs;
}
