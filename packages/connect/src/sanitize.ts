import { isRecord } from '@opl/core';
import { z } from 'zod';

import { ConnectError } from './errors.ts';
import type { CapabilityDescriptor, CapabilityInput, CapabilityRisk } from './types.ts';

export const MAX_CONNECT_JSON_BYTES = 64 * 1024;
export const MAX_CONNECT_DEPTH = 12;
export const MAX_CAPABILITIES_PER_CONNECTION = 32;

export const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;

const VAULT_HANDLE_RE = /^vault:(?:memory|encfile|keychain|[a-z0-9_-]{1,32}):[A-Za-z0-9._-]{8,128}$/;
const PROVIDER_HANDLE_RE = /^provider:[a-z0-9][a-z0-9._-]{0,63}:[A-Za-z0-9._~!*'()-]{4,256}$/;

const FORBIDDEN_SECRET_SEGMENT_RE =
  /(?:^|_)(?:api_?key|apikey|secrets?|secret_?key|password|passwd|access_?token|refresh_?token|session_?token|private_?key|client_?secret|bearer_?token|authorization|credentials|consumer_?bind_?token|bind_?token|master_?key|encryption_?key|credential_?value|credential_?material)(?:$|_|\d)/i;

const FORBIDDEN_BARE_CREDENTIAL_OR_TOKEN_RE =
  /(?:^|_)(?:token|credential)(?:$|_(?:v\d+|value|secret)|\d)/i;

function normalizeKeyForSecretCheck(key: string): string {
  return key
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/-/g, '_');
}

export function isForbiddenSecretKey(key: string): boolean {
  const normalizedKey = normalizeKeyForSecretCheck(key);
  if (normalizedKey.toLowerCase() === 'credential_handle') return true;
  return (
    FORBIDDEN_SECRET_SEGMENT_RE.test(normalizedKey)
    || FORBIDDEN_BARE_CREDENTIAL_OR_TOKEN_RE.test(normalizedKey)
  );
}

function isForbiddenRawCredentialKey(key: string): boolean {
  const normalizedKey = normalizeKeyForSecretCheck(key);
  if (normalizedKey.toLowerCase() === 'credential_handle') return false;
  return (
    FORBIDDEN_SECRET_SEGMENT_RE.test(normalizedKey)
    || FORBIDDEN_BARE_CREDENTIAL_OR_TOKEN_RE.test(normalizedKey)
  );
}

const FORBIDDEN_SECRET_VALUE_PATTERNS: ReadonlyArray<{ reason: string; regex: RegExp }> = [
  {
    reason: 'inline_data_uri_base64',
    regex: /data:[^;\s]*;base64,/i,
  },
  {
    reason: 'private_key_pem',
    regex: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----/,
  },
  {
    reason: 'secret_token_literal',
    regex: /\b(?:sk-(?:live_|test_|proj_)?[A-Za-z0-9_-]{12,}|ghp_[A-Za-z0-9_]{12,}|github_pat_[A-Za-z0-9_]{12,}|Bearer\s+[A-Za-z0-9._+/=-]{12,})/i,
  },
];

const capabilityRiskSchema = z.enum(['read', 'local_write', 'external_write']);

export function safeLabel(value: unknown, fallback: string, maxLength = 160): string {
  if (typeof value !== 'string') return fallback;
  const normalized = value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
  return normalized || fallback;
}

export function resolveCapabilityTitle(title: unknown, fallbackId: string): string {
  if (typeof title === 'string') {
    const clean = safeLabel(title, '', 160);
    if (!clean) {
      throw new ConnectError('INVALID_INPUT', `Capability '${fallbackId}' title must be non-empty.`);
    }
    return clean;
  }
  if (isRecord(title)) {
    const candidate = title['en-US'] ?? title['zh-CN'] ?? Object.values(title).find((v) => typeof v === 'string');
    if (typeof candidate === 'string') {
      const clean = safeLabel(candidate, '', 160);
      if (clean) return clean;
    }
  }
  throw new ConnectError('INVALID_INPUT', `Capability '${fallbackId}' requires a valid title.`);
}

export function normalizeCapabilities(
  rawCapabilities: readonly CapabilityInput[],
): CapabilityDescriptor[] {
  if (!Array.isArray(rawCapabilities)) {
    throw new ConnectError('INVALID_INPUT', 'Capabilities must be an array.');
  }
  if (rawCapabilities.length > MAX_CAPABILITIES_PER_CONNECTION) {
    throw new ConnectError(
      'INVALID_INPUT',
      `Capabilities count exceeds limit (${MAX_CAPABILITIES_PER_CONNECTION}).`,
    );
  }
  const seen = new Set<string>();
  const normalized: CapabilityDescriptor[] = [];
  for (const item of rawCapabilities) {
    if (!isRecord(item) || typeof item.capability_id !== 'string' || !ID_PATTERN.test(item.capability_id)) {
      throw new ConnectError('INVALID_INPUT', 'Capability descriptor requires a valid capability_id.');
    }
    if (seen.has(item.capability_id)) {
      throw new ConnectError('INVALID_INPUT', `Duplicate capability_id '${item.capability_id}'.`);
    }
    seen.add(item.capability_id);
    const riskParsed = capabilityRiskSchema.safeParse(item.risk);
    if (!riskParsed.success) {
      throw new ConnectError(
        'INVALID_INPUT',
        `Capability '${item.capability_id}' has invalid risk '${String(item.risk)}'.`,
      );
    }
    const cleanTitle = resolveCapabilityTitle(item.title, item.capability_id);
    assertNoSecretValue(cleanTitle, `Capability '${item.capability_id}' title`);
    normalized.push({
      capability_id: item.capability_id,
      title: cleanTitle,
      risk: riskParsed.data as CapabilityRisk,
    });
  }
  return normalized;
}

export function isVaultOwnedHandle(handle: string): boolean {
  return VAULT_HANDLE_RE.test(handle);
}

export function isProviderOwnedHandle(handle: string): boolean {
  return PROVIDER_HANDLE_RE.test(handle);
}

export function normalizeCredentialHandle(rawHandle: unknown): string {
  if (typeof rawHandle !== 'string') {
    throw new ConnectError('INVALID_CREDENTIAL_HANDLE', 'Credential handle must be a string.');
  }
  const trimmed = rawHandle.trim();
  if (!trimmed || trimmed !== rawHandle || /[\x00-\x1f\x7f]/.test(trimmed)) {
    throw new ConnectError('INVALID_CREDENTIAL_HANDLE', 'Credential handle contains invalid whitespace or control chars.');
  }
  if (isVaultOwnedHandle(trimmed) || isProviderOwnedHandle(trimmed)) {
    return trimmed;
  }
  throw new ConnectError(
    'INVALID_CREDENTIAL_HANDLE',
    'Credential handle must be an opaque vault:* or provider:* reference; raw secrets, env:*, and legacy handles are forbidden.',
  );
}

export function assertCredentialHandleOnlyPayload(payload: unknown): void {
  if (!isRecord(payload)) {
    throw new ConnectError('INVALID_INPUT', 'Credential payload must be a plain JSON object.');
  }
  const scan = (node: unknown, depth: number, jsonPath: string): void => {
    if (depth > MAX_CONNECT_DEPTH) {
      throw new ConnectError('INVALID_INPUT', `Payload exceeds max nesting depth at ${jsonPath}.`);
    }
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i += 1) {
        scan(node[i], depth + 1, `${jsonPath}[${i}]`);
      }
      return;
    }
    if (!isRecord(node)) return;
    for (const [key, value] of Object.entries(node)) {
      const normalizedKey = normalizeKeyForSecretCheck(key);
      if (isForbiddenRawCredentialKey(key)) {
        throw new ConnectError(
          'SECRET_PAYLOAD_FORBIDDEN',
          `Raw secret field '${key}' is forbidden in connection payload.`,
          { details: { path: `${jsonPath}.${key}`, reason: 'forbidden_secret_field' } },
        );
      }
      if (normalizedKey.toLowerCase() === 'credential_handle') {
        normalizeCredentialHandle(value);
      } else {
        scan(value, depth + 1, `${jsonPath}.${key}`);
      }
    }
  };
  scan(payload, 0, '$');
}

export function assertNoSecretPayload(
  value: unknown,
  label = 'Connect payload',
): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new ConnectError('INVALID_INPUT', `${label} must be a plain JSON object.`);
  }
  const visit = (entry: unknown, depth: number, jsonPath: string): void => {
    if (depth > MAX_CONNECT_DEPTH) {
      throw new ConnectError('INVALID_INPUT', `${label} exceeds max depth at ${jsonPath}.`);
    }
    if (entry === null || typeof entry === 'boolean' || entry === undefined) return;
    if (typeof entry === 'number') {
      if (!Number.isFinite(entry)) {
        throw new ConnectError('INVALID_INPUT', `${label} contains non-finite number at ${jsonPath}.`);
      }
      return;
    }
    if (typeof entry === 'string') {
      assertNoSecretValue(entry, label, jsonPath);
      return;
    }
    if (Array.isArray(entry)) {
      for (let i = 0; i < entry.length; i += 1) {
        visit(entry[i], depth + 1, `${jsonPath}[${i}]`);
      }
      return;
    }
    if (isRecord(entry)) {
      const proto = Object.getPrototypeOf(entry);
      if (proto !== Object.prototype && proto !== null) {
        throw new ConnectError('INVALID_INPUT', `${label} must contain only plain JSON objects.`);
      }
      for (const [key, nested] of Object.entries(entry)) {
        if (isForbiddenSecretKey(key)) {
          throw new ConnectError(
            'SECRET_PAYLOAD_FORBIDDEN',
            `${label} must not contain secret or credential field '${key}'.`,
            { details: { path: `${jsonPath}.${key}`, reason: 'forbidden_secret_field' } },
          );
        }
        visit(nested, depth + 1, `${jsonPath}.${key}`);
      }
      return;
    }
    throw new ConnectError('INVALID_INPUT', `${label} contains unsupported value type at ${jsonPath}.`);
  };

  visit(value, 0, '$');

  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new ConnectError('INVALID_INPUT', `${label} must be JSON serializable.`);
  }
  if (!serialized || Buffer.byteLength(serialized, 'utf8') > MAX_CONNECT_JSON_BYTES) {
    throw new ConnectError(
      'INVALID_INPUT',
      `${label} exceeds ${MAX_CONNECT_JSON_BYTES} byte limit.`,
    );
  }
  const parsed = JSON.parse(serialized) as unknown;
  if (!isRecord(parsed)) {
    throw new ConnectError('INVALID_INPUT', `${label} must be a plain JSON object.`);
  }
  return parsed;
}

export function assertNoSecretValue(value: string, label = 'Connect value', jsonPath = '$'): void {
  for (const rule of FORBIDDEN_SECRET_VALUE_PATTERNS) {
    if (rule.regex.test(value)) {
      throw new ConnectError(
        'SECRET_PAYLOAD_FORBIDDEN',
        `${label} contains forbidden secret value pattern (${rule.reason}) at ${jsonPath}.`,
        { details: { path: jsonPath, reason: rule.reason } },
      );
    }
  }
}

export function validateHttpEndpoint(endpoint: unknown): string | null {
  if (endpoint === undefined || endpoint === null) return null;
  if (typeof endpoint !== 'string') {
    throw new ConnectError('INVALID_INPUT', 'Connection endpoint must be a string or null.');
  }
  const trimmed = endpoint.trim();
  if (!trimmed) return null;
  assertNoSecretValue(trimmed, 'Connection endpoint', '$.endpoint');
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new ConnectError('INVALID_INPUT', 'Connection endpoint must be a valid HTTP/HTTPS URL.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ConnectError('INVALID_INPUT', 'Connection endpoint must use http: or https: protocol.');
  }
  if (parsed.username || parsed.password) {
    throw new ConnectError(
      'SECRET_PAYLOAD_FORBIDDEN',
      'Connection endpoint must not embed credentials.',
    );
  }
  for (const [qKey, qValue] of parsed.searchParams.entries()) {
    if (isForbiddenSecretKey(qKey)) {
      throw new ConnectError(
        'SECRET_PAYLOAD_FORBIDDEN',
        `Connection endpoint must not embed secret query parameter '${qKey}'.`,
        { details: { path: `$.endpoint?${qKey}`, reason: 'forbidden_secret_field' } },
      );
    }
    assertNoSecretValue(qValue, 'Connection endpoint query', `$.endpoint?${qKey}`);
  }
  if (parsed.hash) {
    const hashBody = parsed.hash.slice(1);
    assertNoSecretValue(hashBody, 'Connection endpoint fragment', '$.endpoint#');
    let decodedHash = hashBody;
    try {
      decodedHash = decodeURIComponent(hashBody);
    } catch {
      decodedHash = hashBody.replace(/%[0-9A-Fa-f]{2}/g, (match) => {
        try {
          return decodeURIComponent(match);
        } catch {
          return match;
        }
      });
    }
    if (decodedHash !== hashBody) {
      assertNoSecretValue(decodedHash, 'Connection endpoint fragment', '$.endpoint#');
    }

    const inspectHashParams = (rawParams: string): void => {
      if (!rawParams.includes('=')) return;
      const hashParams = new URLSearchParams(rawParams);
      for (const [hKey, hValue] of hashParams.entries()) {
        if (isForbiddenSecretKey(hKey)) {
          throw new ConnectError(
            'SECRET_PAYLOAD_FORBIDDEN',
            `Connection endpoint must not embed secret fragment parameter '${hKey}'.`,
            { details: { path: `$.endpoint#${hKey}`, reason: 'forbidden_secret_field' } },
          );
        }
        assertNoSecretValue(hKey, 'Connection endpoint fragment', `$.endpoint#${hKey}`);
        assertNoSecretValue(hValue, 'Connection endpoint fragment', `$.endpoint#${hKey}`);
      }
    };

    inspectHashParams(hashBody);
    const queryIdx = hashBody.indexOf('?');
    if (queryIdx !== -1) {
      inspectHashParams(hashBody.slice(queryIdx + 1));
    }
  }
  return parsed.toString();
}
