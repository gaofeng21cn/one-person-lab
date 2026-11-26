import crypto from 'node:crypto';

import { KernelError } from './errors.ts';

export interface OpaqueRef {
  readonly kind: string;
  readonly ref: string;
  readonly digest?: string;
}

function failCanonical(
  message: string,
  jsonPath: string,
  details: Record<string, unknown> = {},
): never {
  throw new KernelError('INVALID_INPUT', message, { path: jsonPath, ...details });
}

function assertUnicodeScalarString(value: string, jsonPath: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!Number.isInteger(next) || next < 0xdc00 || next > 0xdfff) {
        failCanonical('Canonical JSON does not allow lone Unicode surrogates.', jsonPath, {
          string_offset: index,
        });
      }
      index += 1;
      continue;
    }
    if (unit >= 0xdc00 && unit <= 0xdfff) {
      failCanonical('Canonical JSON does not allow lone Unicode surrogates.', jsonPath, {
        string_offset: index,
      });
    }
  }
}

function canonicalValueText(value: unknown, jsonPath: string): string {
  if (value === null || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'string') {
    assertUnicodeScalarString(value, jsonPath);
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      failCanonical('Canonical JSON does not allow non-finite numbers.', jsonPath);
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (Object.getOwnPropertySymbols(value).length > 0) {
      failCanonical('Canonical JSON does not allow symbol keys.', jsonPath);
    }
    const entries: string[] = [];
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) {
        failCanonical('Canonical JSON does not allow sparse arrays.', `${jsonPath}/${index}`);
      }
      entries.push(canonicalValueText(value[index], `${jsonPath}/${index}`));
    }
    if (Object.keys(value).length !== value.length) {
      failCanonical('Canonical JSON arrays cannot carry named properties.', jsonPath);
    }
    return `[${entries.join(',')}]`;
  }
  if (typeof value === 'object' && value !== null) {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      failCanonical('Canonical JSON only accepts plain JSON objects.', jsonPath);
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
      failCanonical('Canonical JSON does not allow symbol keys.', jsonPath);
    }
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record);
    if (Object.getOwnPropertyNames(record).length !== keys.length) {
      failCanonical('Canonical JSON objects cannot carry non-enumerable properties.', jsonPath);
    }
    for (const key of keys) {
      assertUnicodeScalarString(key, `${jsonPath}/<key>`);
    }
    return `{${keys
      .sort()
      .map((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(record, key);
        if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
          failCanonical('Canonical JSON objects cannot carry accessor properties.', `${jsonPath}/${key}`);
        }
        const entry = record[key];
        if (
          entry === undefined
          || typeof entry === 'bigint'
          || typeof entry === 'function'
          || typeof entry === 'symbol'
        ) {
          failCanonical('Canonical JSON contains an unsupported value.', `${jsonPath}/${key}`, {
            value_type: typeof entry,
          });
        }
        return `${JSON.stringify(key)}:${canonicalValueText(entry, `${jsonPath}/${key}`)}`;
      })
      .join(',')}}`;
  }
  return failCanonical('Canonical JSON contains an unsupported value.', jsonPath, {
    value_type: typeof value,
  });
}

export function canonicalJsonText(value: unknown): string {
  return canonicalValueText(value, '$');
}

export function canonicalJsonBytes(value: unknown): Buffer {
  return Buffer.from(canonicalJsonText(value), 'utf8');
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(prefix: string): string {
  const clean = prefix.trim();
  if (!clean) {
    throw new KernelError('INVALID_INPUT', 'ID prefix must be a non-empty string.');
  }
  return `${clean}_${crypto.randomBytes(12).toString('hex')}`;
}

export function newRandomToken(bytes = 32): string {
  if (!Number.isInteger(bytes) || bytes < 16 || bytes > 256) {
    throw new KernelError('INVALID_INPUT', 'Token byte length must be an integer between 16 and 256.', {
      bytes,
    });
  }
  return crypto.randomBytes(bytes).toString('hex');
}

export function sha256Hex(data: string | Uint8Array): string {
  const digest = crypto.createHash('sha256').update(data).digest('hex');
  return `sha256:${digest}`;
}

export function stableId(prefix: string, parts: readonly unknown[]): string {
  const clean = prefix.trim();
  if (!clean) {
    throw new KernelError('INVALID_INPUT', 'ID prefix must be a non-empty string.');
  }
  const digest = crypto.createHash('sha256').update(canonicalJsonText(parts)).digest('hex');
  return `${clean}_${digest.slice(0, 24)}`;
}

export function createOpaqueRef(kind: string, ref: string, digest?: string): OpaqueRef {
  if (!kind.trim() || !ref.trim()) {
    throw new KernelError('INVALID_INPUT', 'OpaqueRef kind and ref must be non-empty strings.');
  }
  return digest !== undefined
    ? { kind: kind.trim(), ref: ref.trim(), digest }
    : { kind: kind.trim(), ref: ref.trim() };
}
