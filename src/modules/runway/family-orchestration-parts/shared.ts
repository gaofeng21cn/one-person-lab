import { createHash } from 'node:crypto';

import { isRecord } from '../../../kernel/contract-validation.ts';
import { stringValue as optionalString, type JsonRecord } from '../../../kernel/json-record.ts';

export { isRecord, optionalString, type JsonRecord };

export interface NormalizedFamilyReference {
  ref_kind: string;
  ref: string;
  role?: string;
  label?: string;
}

export function requireString(value: unknown, field: string) {
  const text = optionalString(value);
  if (!text) {
    throw new Error(`family orchestration 缺少字符串字段: ${field}`);
  }
  return text;
}

export function normalizeRef(value: unknown, field: string): NormalizedFamilyReference | null {
  if (!isRecord(value)) {
    return null;
  }
  const refKind = optionalString(value.ref_kind);
  const ref = optionalString(value.ref);
  if (!refKind || !ref) {
    throw new Error(`family orchestration reference 缺少字段: ${field}`);
  }
  return {
    ref_kind: refKind,
    ref,
    ...(optionalString(value.role) ? { role: optionalString(value.role)! } : {}),
    ...(optionalString(value.label) ? { label: optionalString(value.label)! } : {}),
  };
}

export function normalizeRefs(values: unknown, field: string) {
  if (!Array.isArray(values)) {
    return [] as NormalizedFamilyReference[];
  }
  return values
    .map((value, index) => normalizeRef(value, `${field}[${index}]`))
    .filter((value): value is NormalizedFamilyReference => Boolean(value));
}

export function requireBoolean(value: unknown, field: string) {
  if (typeof value !== 'boolean') {
    throw new Error(`family orchestration 缺少布尔字段: ${field}`);
  }
  return value;
}

export function requirePositiveInteger(value: unknown, field: string) {
  if (!Number.isInteger(value) || Number(value) <= 0) {
    throw new Error(`family orchestration 缺少正整数字段: ${field}`);
  }
  return Number(value);
}

export function readStringList(values: unknown, field: string) {
  if (!Array.isArray(values)) {
    throw new Error(`family orchestration 缺少数组字段: ${field}`);
  }
  return values.map((value, index) => requireString(value, `${field}[${index}]`));
}

export function optionalStringList(values: unknown, field: string) {
  if (values === null || values === undefined) {
    return [] as string[];
  }
  return readStringList(values, field);
}

export function stableId(prefix: string, ...parts: unknown[]) {
  const source = parts.map((part) => String(part ?? '').trim()).join('|');
  const digest = createHash('sha1').update(source).digest('hex').slice(0, 12);
  return `${prefix}-${digest}`;
}
