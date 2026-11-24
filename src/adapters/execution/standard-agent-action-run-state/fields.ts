import { canonicalJsonText } from '../../../kernel/canonical-json.ts';
import { FrameworkContractError, isRecord } from '../../../kernel/contract-validation.ts';

const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export const DIGEST_PATTERN = /^[a-f0-9]{64}$/;

export function fail(message: string, details: Record<string, unknown> = {}): never {
  throw new FrameworkContractError('contract_shape_invalid', message, details);
}

export function validateRunId(runId: string) {
  if (!RUN_ID_PATTERN.test(runId)) {
    fail('Standard Agent action run_id must be a single safe path segment.', { run_id: runId });
  }
}

export function exactKeys(value: Record<string, unknown>, allowed: readonly string[], label: string) {
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length > 0) fail(`${label} contains unexpected fields.`, { unexpected_fields: unexpected });
}

export function text(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) fail(`${field} must be a non-empty string.`, { field });
  return value.trim();
}

export function canonicalStringList(value: unknown, field: string) {
  if (!Array.isArray(value)) fail(`${field} must be an array.`, { field });
  const entries = value.map((entry) => text(entry, field));
  const canonical = [...new Set(entries)].sort();
  if (canonical.length === 0 || canonicalJsonText(entries) !== canonicalJsonText(canonical)) {
    fail(`${field} must be a non-empty sorted set.`, { field });
  }
  return canonical;
}

export function sha256Digest(value: unknown, field: string) {
  const digest = text(value, field);
  if (!/^sha256:[a-f0-9]{64}$/.test(digest)) fail(`${field} must be a sha256 digest.`, { field });
  return digest;
}

export function schemaValidationRecord(value: unknown, field: string) {
  if (!isRecord(value)) fail(`${field} must be an object.`);
  exactKeys(value, ['schema_ref', 'schema_path', 'schema_id', 'status'], field);
  if (value.status !== 'valid') fail(`${field}.status must be valid.`);
  return {
    schema_ref: text(value.schema_ref, `${field}.schema_ref`),
    schema_path: text(value.schema_path, `${field}.schema_path`),
    schema_id: text(value.schema_id, `${field}.schema_id`),
    status: 'valid' as const,
  };
}
