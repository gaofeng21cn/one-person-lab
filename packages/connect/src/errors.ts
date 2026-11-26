import { isRecord } from '@opl/core';

export type InvocationDisposition =
  | 'completed'
  | 'not_dispatched'
  | 'provider_reported'
  | 'unknown_after_dispatch';

export type ConnectErrorDisposition = Exclude<InvocationDisposition, 'completed'>;

export type ConnectErrorCode =
  | 'INVALID_INPUT'
  | 'TRUSTED_HOST_REQUIRED'
  | 'UNAUTHORIZED_BIND_TOKEN'
  | 'BIND_TOKEN_EXPIRED'
  | 'BIND_TOKEN_SESSION_MISMATCH'
  | 'BIND_TOKEN_PACKAGE_MISMATCH'
  | 'INVALID_CREDENTIAL_HANDLE'
  | 'SECRET_PAYLOAD_FORBIDDEN'
  | 'VAULT_ERROR'
  | 'KEYCHAIN_INTERACTION_REQUIRED'
  | 'CONNECTION_NOT_FOUND'
  | 'CONNECTION_DUPLICATE'
  | 'CONNECTION_DISABLED'
  | 'CONNECTION_DELETED'
  | 'CONNECTION_REVISION_CHANGED'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_CAPABILITY_MISSING'
  | 'CAPABILITY_MISMATCH'
  | 'CAPABILITY_RISK_ESCALATION'
  | 'CONSUMER_UNAVAILABLE'
  | 'CONSUMER_DIGEST_MISMATCH'
  | 'REQUEST_NOT_FOUND'
  | 'REQUEST_NOT_PENDING'
  | 'GRANT_NOT_FOUND'
  | 'GRANT_NOT_ACTIVE'
  | 'GRANT_EXPIRED'
  | 'AUTHORIZATION_CHANGED_AFTER_DISPATCH'
  | 'PROVIDER_INVOCATION_FAILED'
  | 'PORT_DISPOSED'
  | 'REVISION_CONFLICT';

const RPC_CODE_BY_ERROR: Readonly<Record<ConnectErrorCode, number>> = {
  INVALID_INPUT: -32602,
  TRUSTED_HOST_REQUIRED: -32003,
  UNAUTHORIZED_BIND_TOKEN: -32001,
  BIND_TOKEN_EXPIRED: -32001,
  BIND_TOKEN_SESSION_MISMATCH: -32001,
  BIND_TOKEN_PACKAGE_MISMATCH: -32001,
  INVALID_CREDENTIAL_HANDLE: -32602,
  SECRET_PAYLOAD_FORBIDDEN: -32602,
  VAULT_ERROR: -32000,
  KEYCHAIN_INTERACTION_REQUIRED: -32000,
  CONNECTION_NOT_FOUND: -32004,
  CONNECTION_DUPLICATE: -32602,
  CONNECTION_DISABLED: -32003,
  CONNECTION_DELETED: -32004,
  CONNECTION_REVISION_CHANGED: -32009,
  PROVIDER_UNAVAILABLE: -32004,
  PROVIDER_CAPABILITY_MISSING: -32602,
  CAPABILITY_MISMATCH: -32003,
  CAPABILITY_RISK_ESCALATION: -32003,
  CONSUMER_UNAVAILABLE: -32003,
  CONSUMER_DIGEST_MISMATCH: -32003,
  REQUEST_NOT_FOUND: -32004,
  REQUEST_NOT_PENDING: -32009,
  GRANT_NOT_FOUND: -32004,
  GRANT_NOT_ACTIVE: -32003,
  GRANT_EXPIRED: -32003,
  AUTHORIZATION_CHANGED_AFTER_DISPATCH: -32009,
  PROVIDER_INVOCATION_FAILED: -32000,
  PORT_DISPOSED: -32003,
  REVISION_CONFLICT: -32009,
};

const HANDLE_OR_SECRET_PATTERNS: ReadonlyArray<RegExp> = [
  /vault:[a-z0-9_-]+:[A-Za-z0-9._-]+/gi,
  /provider:[a-z0-9._-]+:[A-Za-z0-9._~!*'()-]+/gi,
  /sk-(?:live_|test_|proj_)?[A-Za-z0-9_-]{12,}/gi,
  /ghp_[A-Za-z0-9_]{12,}/gi,
  /github_pat_[A-Za-z0-9_]{12,}/gi,
  /Bearer\s+[A-Za-z0-9._+/=-]{12,}/gi,
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----/g,
];

const FORBIDDEN_DETAIL_SEGMENT_RE =
  /(?:^|_)(?:secrets?|secret_?key|api_?key|apikey|password|passwd|access_?token|refresh_?token|session_?token|private_?key|client_?secret|bearer_?token|authorization|credentials|consumer_?bind_?token|bind_?token|master_?key|encryption_?key|credential_?value|credential_?material)(?:$|_|\d)/i;

const FORBIDDEN_DETAIL_BARE_RE =
  /(?:^|_)(?:token|credential)(?:$|_(?:v\d+|value|secret)|\d)/i;

function isForbiddenDetailKey(key: string): boolean {
  const normalizedKey = key
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/-/g, '_');
  if (normalizedKey.toLowerCase() === 'credential_handle') return true;
  return (
    FORBIDDEN_DETAIL_SEGMENT_RE.test(normalizedKey)
    || FORBIDDEN_DETAIL_BARE_RE.test(normalizedKey)
  );
}

export function redactSensitiveText(text: string): string {
  let out = text;
  for (const pattern of HANDLE_OR_SECRET_PATTERNS) {
    out = out.replace(pattern, '[REDACTED]');
  }
  return out;
}

function sanitizeDetails(details: Record<string, unknown>, depth = 0): Record<string, unknown> {
  if (depth > 4) return {};
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    if (isForbiddenDetailKey(key)) {
      continue;
    }
    if (typeof value === 'string') {
      clean[key] = redactSensitiveText(value);
    } else if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
      clean[key] = value;
    } else if (Array.isArray(value)) {
      clean[key] = value.map((item) =>
        typeof item === 'string'
          ? redactSensitiveText(item)
          : isRecord(item)
            ? sanitizeDetails(item, depth + 1)
            : item,
      );
    } else if (isRecord(value)) {
      clean[key] = sanitizeDetails(value, depth + 1);
    }
  }
  return clean;
}

export class ConnectError extends Error {
  readonly code: ConnectErrorCode;
  readonly rpcCode: number;
  readonly reason_code: string;
  readonly disposition: ConnectErrorDisposition;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(
    code: ConnectErrorCode,
    message: string,
    options: {
      reason_code?: string;
      disposition?: ConnectErrorDisposition;
      details?: Record<string, unknown>;
      cause?: unknown;
    } = {},
  ) {
    super(redactSensitiveText(message), options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'ConnectError';
    this.code = code;
    this.rpcCode = RPC_CODE_BY_ERROR[code];
    this.reason_code = options.reason_code ?? code.toLowerCase();
    this.disposition = options.disposition ?? 'not_dispatched';
    this.details = Object.freeze(sanitizeDetails(options.details ?? {}));
  }

  toJSON(): {
    name: string;
    code: ConnectErrorCode;
    rpcCode: number;
    reason_code: string;
    disposition: ConnectErrorDisposition;
    message: string;
    details: Readonly<Record<string, unknown>>;
  } {
    return {
      name: this.name,
      code: this.code,
      rpcCode: this.rpcCode,
      reason_code: this.reason_code,
      disposition: this.disposition,
      message: this.message,
      details: this.details,
    };
  }
}

export class ConnectProviderError extends Error {
  readonly providerCode: string;
  readonly disposition: ConnectErrorDisposition;

  constructor(
    providerCode: string,
    disposition: ConnectErrorDisposition = 'provider_reported',
    safeSummary = 'Connection provider operation failed.',
  ) {
    super(redactSensitiveText(safeSummary));
    this.name = 'ConnectProviderError';
    this.providerCode = /^[a-zA-Z0-9._-]{1,96}$/.test(providerCode) ? providerCode : 'provider_error';
    this.disposition = disposition;
  }
}
