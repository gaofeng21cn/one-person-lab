import { isRecord, FrameworkContractError } from '../../../kernel/contract-validation.ts';
import { stringValue, type JsonRecord } from '../../../kernel/json-record.ts';

export { isRecord, type JsonRecord };

export function readStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => stringValue(entry))
    .filter((entry): entry is string => Boolean(entry));
}

// Ref lists that a Codex Attempt authors are not always plain strings: the Stage contract
// publishes some locators to Attempts as exact refs (`{kind, ref, size_bytes, sha256}`), and a
// faithful citation arrives as that object. This is the one normalization for those lists:
// accept the locator string or the exact-ref object, return `string[]`, and fail closed on
// anything else instead of silently dropping it. Framework-authored lists keep using
// `readStringList`, whose lenient filtering is intentional for its own inputs.
export function readAgentRefList(value: unknown, field: string) {
  if (value === undefined || value === null) {
    return [] as string[];
  }
  if (!Array.isArray(value)) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} must contain refs.`, { field });
  }
  const refs = value.map((entry) => {
    if (typeof entry === 'string' && entry.trim()) {
      return entry.trim();
    }
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      const ref = (entry as Record<string, unknown>).ref;
      if (typeof ref === 'string' && ref.trim()) {
        return ref.trim();
      }
    }
    throw new FrameworkContractError('contract_shape_invalid', `${field} must contain non-empty string refs.`, {
      field,
    });
  });
  return [...new Set(refs)];
}

export function readRecordList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isRecord);
}

export function normalizeTimeoutMs(value: unknown, fallback: number) {
  const numeric = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number.parseInt(value, 10)
      : Number.NaN;
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}
