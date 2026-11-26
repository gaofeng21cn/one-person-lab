import path from 'node:path';

import { isRecord } from '@opl/core';

import { LedgerError } from './types.ts';

export const MAX_LEDGER_PAYLOAD_BYTES = 16_384;
export const MAX_LEDGER_STRING_LENGTH = 2_048;
export const MAX_LEDGER_REF_LENGTH = 1_024;
export const MAX_LEDGER_NESTING_DEPTH = 6;

const FORBIDDEN_BODY_KEYS: ReadonlySet<string> = new Set([
  'body',
  'artifact_body',
  'artifact_content',
  'artifact_delta_body',
  'content',
  'document_body',
  'domain_body',
  'file_content',
  'image_body',
  'inline_blob',
  'manuscript_body',
  'memory_body',
  'package_body',
  'payload_body',
  'raw_body',
  'raw_content',
  'result_body',
  'source_body',
  'study_truth',
  'table_body',
  'text_body',
  'base64',
  'data_uri',
]);

const FORBIDDEN_SECRET_KEYS: ReadonlySet<string> = new Set([
  'password',
  'passwd',
  'secret',
  'secret_key',
  'api_key',
  'apikey',
  'access_token',
  'refresh_token',
  'session_token',
  'private_key',
  'client_secret',
  'bearer_token',
  'authorization',
  'credentials',
]);

const FORBIDDEN_VALUE_PATTERNS: ReadonlyArray<{ reason: string; regex: RegExp }> = [
  {
    reason: 'inline_data_uri_base64',
    regex: /data:[^;\s]+(?:;[^;\s]+)*;base64,/i,
  },
  {
    reason: 'private_key_pem',
    regex: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----/,
  },
  {
    reason: 'secret_token_literal',
    regex: /\b(sk-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9_]{20,}|Bearer\s+[A-Za-z0-9._+/=-]{20,})(?=\s|$|['",;}\])])/ ,
  },
];

function failRefsOnly(reason: string, jsonPath: string, message: string): never {
  throw new LedgerError('REFS_ONLY_VIOLATION', message, {
    path: jsonPath,
    reason,
  });
}

export function assertSafeRefPath(rawPath: string, jsonPath = '$.path'): void {
  if (rawPath.includes('\0')) {
    failRefsOnly('null_byte_in_path', jsonPath, 'Artifact or ref path must not contain null bytes.');
  }
  if (/[\x00-\x1f\x7f]/.test(rawPath)) {
    failRefsOnly('control_chars_in_path', jsonPath, 'Artifact or ref path must not contain control characters.');
  }
  const trimmed = rawPath.trim();
  if (/^[A-Za-z]:/.test(trimmed) || trimmed.startsWith('/') || trimmed.startsWith('\\') || path.isAbsolute(trimmed) || path.win32.isAbsolute(trimmed)) {
    failRefsOnly(
      'absolute_path_forbidden',
      jsonPath,
      `Ref path '${rawPath}' must not be an absolute path or drive-letter path.`,
    );
  }
  const normalized = trimmed.replace(/\\/g, '/');
  const segments = normalized.split('/');
  if (segments.some((seg) => seg === '..')) {
    failRefsOnly(
      'path_traversal_forbidden',
      jsonPath,
      `Ref path '${rawPath}' must not contain '..' traversal segments.`,
    );
  }
}

function isRefKey(key: string): boolean {
  const lower = key.toLowerCase();
  return lower === 'path' || lower.endsWith('_ref') || lower.endsWith('_refs');
}

function scanValue(value: unknown, jsonPath: string, depth: number, keyHint?: string): void {
  if (depth > MAX_LEDGER_NESTING_DEPTH) {
    failRefsOnly(
      'max_depth_exceeded',
      jsonPath,
      `Ledger payload exceeds max nesting depth of ${MAX_LEDGER_NESTING_DEPTH}.`,
    );
  }

  if (value === null || typeof value === 'boolean' || typeof value === 'number') {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      failRefsOnly('non_finite_number', jsonPath, 'Ledger payload numbers must be finite.');
    }
    return;
  }

  if (typeof value === 'string') {
    const maxLen = keyHint && isRefKey(keyHint)
      ? MAX_LEDGER_REF_LENGTH
      : MAX_LEDGER_STRING_LENGTH;
    if (value.length > maxLen) {
      failRefsOnly(
        'string_length_exceeded',
        jsonPath,
        `String at ${jsonPath} exceeds max length of ${maxLen} characters.`,
      );
    }
    for (const rule of FORBIDDEN_VALUE_PATTERNS) {
      if (rule.regex.test(value)) {
        failRefsOnly(
          rule.reason,
          jsonPath,
          `Forbidden inline secret or encoded blob detected at ${jsonPath} (${rule.reason}).`,
        );
      }
    }
    if (keyHint && isRefKey(keyHint)) {
      assertSafeRefPath(value, jsonPath);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      scanValue(value[i], `${jsonPath}[${i}]`, depth + 1, keyHint);
    }
    return;
  }

  if (isRecord(value)) {
    for (const [key, entry] of Object.entries(value)) {
      const childPath = `${jsonPath}.${key}`;
      const lower = key.toLowerCase();
      if (FORBIDDEN_BODY_KEYS.has(lower)) {
        failRefsOnly(
          'forbidden_body_field',
          childPath,
          `Ledger payloads are refs-only; body field '${key}' is forbidden.`,
        );
      }
      if (lower === 'body_included' && entry !== false) {
        failRefsOnly(
          'body_included_forbidden',
          childPath,
          'body_included must be false when present in a ledger payload.',
        );
      }
      if (FORBIDDEN_SECRET_KEYS.has(lower)) {
        failRefsOnly(
          'forbidden_secret_field',
          childPath,
          `Ledger payloads must not contain secret or credential field '${key}'.`,
        );
      }
      if (entry === undefined) continue;
      scanValue(entry, childPath, depth + 1, key);
    }
    return;
  }

  failRefsOnly('unsupported_value_type', jsonPath, `Unsupported value type '${typeof value}' in payload.`);
}

export function assertRefsOnlyPayload(payload: unknown): string {
  if (!isRecord(payload)) {
    failRefsOnly('payload_not_object', '$', 'Ledger payload must be a plain JSON object.');
  }
  scanValue(payload, '$', 0);
  const serialized = JSON.stringify(payload);
  const byteLength = Buffer.byteLength(serialized, 'utf8');
  if (byteLength > MAX_LEDGER_PAYLOAD_BYTES) {
    failRefsOnly(
      'payload_size_exceeded',
      '$',
      `Serialized payload (${byteLength} bytes) exceeds ${MAX_LEDGER_PAYLOAD_BYTES} byte limit.`,
    );
  }
  return serialized;
}
