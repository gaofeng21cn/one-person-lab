import { FrameworkContractError } from '../../../kernel/contract-validation.ts';

export function fail(message: string, details: Record<string, unknown> = {}): never {
  throw new FrameworkContractError('contract_shape_invalid', message, details);
}

export function requiredRef(value: unknown, field: string) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) fail(`${field} must be a non-empty authority ref.`);
  return normalized;
}

export function expectedRevision(value: unknown, field = 'expected_revision') {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    fail(`${field} must be a non-negative safe integer.`, { actual: value });
  }
  return Number(value);
}

export function requiredDigest(value: unknown, field: string) {
  const digest = requiredRef(value, field);
  if (!/^sha256:[a-f0-9]{64}$/.test(digest)) fail(`${field} must be a SHA-256 digest.`);
  return digest;
}
