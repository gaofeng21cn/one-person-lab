import crypto from 'node:crypto';

import {
  canonicalJsonText,
  isRecord,
  newId,
  timingSafeEqualHex,
  type ClientContext,
  type SqliteDb,
} from '@opl/core';

import { requireTrustedHost } from '../audit.ts';
import { ConnectError } from '../errors.ts';
import type {
  ConsumerBindTokenClaims,
  InstalledPackageSnapshot,
  IssueBindTokenInput,
  IssuedConsumerBindToken,
  RuntimeDigestVerifier,
} from '../types.ts';

const TOKEN_PREFIX = 'oplcbt1';
const DEFAULT_TTL_MS = 15 * 60_000;
const MAX_TTL_MS = 24 * 60 * 60_000;

export interface ConsumerBindTokenAuthorityOptions {
  readonly db: SqliteDb;
  readonly signingSecret?: Uint8Array | string;
  readonly verifyRuntimeDigest?: RuntimeDigestVerifier;
  readonly nowMs?: () => number;
}

export interface RawInstalledPackageRow {
  readonly package_id: string;
  readonly version: string;
  readonly intent: 'agent' | 'app' | 'extension' | 'channel';
  readonly install_path: string;
  readonly content_digest: string;
  readonly manifest_json: string;
  readonly enabled: number;
}

export async function loadVerifiedInstalledPackage(
  db: SqliteDb,
  packageId: string,
  verifyRuntimeDigest?: RuntimeDigestVerifier,
): Promise<InstalledPackageSnapshot> {
  if (typeof packageId !== 'string' || !packageId.trim()) {
    throw new ConnectError('CONSUMER_UNAVAILABLE', 'Consumer package_id must be a non-empty string.');
  }
  const row = db
    .prepare(
      'SELECT package_id, version, intent, install_path, content_digest, manifest_json, enabled FROM installed_packages WHERE package_id = ?',
    )
    .get(packageId) as unknown as RawInstalledPackageRow | undefined;

  if (!row) {
    throw new ConnectError('CONSUMER_UNAVAILABLE', `Consumer package '${packageId}' is not installed.`);
  }
  if (row.enabled !== 1) {
    throw new ConnectError('CONSUMER_UNAVAILABLE', `Consumer package '${packageId}' is disabled.`);
  }
  if (typeof row.content_digest !== 'string' || !row.content_digest.trim()) {
    throw new ConnectError(
      'CONSUMER_DIGEST_MISMATCH',
      `Consumer package '${packageId}' has no content_digest.`,
    );
  }

  const snapshot: InstalledPackageSnapshot = Object.freeze({
    package_id: row.package_id,
    version: row.version,
    intent: row.intent,
    install_path: row.install_path,
    content_digest: row.content_digest,
    manifest_json: row.manifest_json,
    enabled: row.enabled === 1,
  });

  if (verifyRuntimeDigest) {
    let ok = false;
    try {
      ok = await verifyRuntimeDigest(snapshot);
    } catch {
      ok = false;
    }
    if (!ok) {
      throw new ConnectError(
        'CONSUMER_DIGEST_MISMATCH',
        `Consumer package '${packageId}' failed runtime digest verification.`,
      );
    }
  }

  return snapshot;
}

function parseSigningKey(secret?: Uint8Array | string): Buffer {
  if (secret === undefined) {
    return crypto.randomBytes(32);
  }
  if (secret instanceof Uint8Array) {
    if (secret.byteLength < 32) {
      throw new ConnectError('INVALID_INPUT', 'Bind token signingSecret must be at least 32 bytes.');
    }
    return Buffer.from(secret);
  }
  if (typeof secret === 'string' && Buffer.byteLength(secret, 'utf8') >= 32) {
    return crypto.createHash('sha256').update(secret, 'utf8').digest();
  }
  throw new ConnectError('INVALID_INPUT', 'Bind token signingSecret must be at least 32 bytes.');
}

export class ConsumerBindTokenAuthority {
  readonly #db: SqliteDb;
  readonly #signingKey: Buffer;
  readonly #verifyRuntimeDigest?: RuntimeDigestVerifier;
  readonly #nowMs: () => number;

  constructor(options: ConsumerBindTokenAuthorityOptions) {
    this.#db = options.db;
    this.#signingKey = parseSigningKey(options.signingSecret);
    this.#verifyRuntimeDigest = options.verifyRuntimeDigest;
    this.#nowMs = options.nowMs ?? (() => Date.now());
  }

  async issueConsumerBindToken(
    clientContext: ClientContext,
    input: IssueBindTokenInput,
  ): Promise<IssuedConsumerBindToken> {
    requireTrustedHost(clientContext, 'connect.issueConsumerBindToken');

    if (typeof input?.session_id !== 'string' || !input.session_id.trim()) {
      throw new ConnectError('INVALID_INPUT', 'session_id is required to issue a consumerBindToken.');
    }
    const sessionId = input.session_id.trim();
    const pkg = await loadVerifiedInstalledPackage(
      this.#db,
      input.consumer_package_id,
      this.#verifyRuntimeDigest,
    );

    const ttlMs = input.ttl_ms ?? DEFAULT_TTL_MS;
    if (!Number.isFinite(ttlMs) || ttlMs <= 0 || ttlMs > MAX_TTL_MS) {
      throw new ConnectError('INVALID_INPUT', `ttl_ms must be between 1 and ${MAX_TTL_MS}.`);
    }

    const now = this.#nowMs();
    const claims: ConsumerBindTokenClaims = Object.freeze({
      v: 1,
      jti: newId('cbt'),
      session_id: sessionId,
      consumer_package_id: pkg.package_id,
      consumer_content_digest: pkg.content_digest,
      issued_at: new Date(now).toISOString(),
      expires_at: new Date(now + ttlMs).toISOString(),
    });

    const payloadB64 = Buffer.from(canonicalJsonText(claims), 'utf8').toString('base64url');
    const signingInput = `${TOKEN_PREFIX}.${payloadB64}`;
    const sigHex = this.signHex(signingInput);

    return Object.freeze({
      token: `${signingInput}.${sigHex}`,
      claims,
    });
  }

  async verifyConsumerBindToken(
    token: string,
    expected: { readonly session_id?: string; readonly consumer_package_id?: string } = {},
  ): Promise<ConsumerBindTokenClaims> {
    if (typeof token !== 'string' || !token.trim()) {
      throw new ConnectError('UNAUTHORIZED_BIND_TOKEN', 'Missing consumerBindToken.');
    }
    const parts = token.split('.');
    if (parts.length !== 3 || parts[0] !== TOKEN_PREFIX || !parts[1] || !parts[2]) {
      throw new ConnectError('UNAUTHORIZED_BIND_TOKEN', 'Malformed consumerBindToken.');
    }
    const signingInput = `${parts[0]}.${parts[1]}`;
    const providedSigHex = parts[2];
    const expectedSigHex = this.signHex(signingInput);

    if (!timingSafeEqualHex(providedSigHex, expectedSigHex)) {
      throw new ConnectError('UNAUTHORIZED_BIND_TOKEN', 'Invalid consumerBindToken signature.');
    }

    let parsed: unknown;
    try {
      const jsonText = Buffer.from(parts[1], 'base64url').toString('utf8');
      parsed = JSON.parse(jsonText) as unknown;
    } catch {
      throw new ConnectError('UNAUTHORIZED_BIND_TOKEN', 'Invalid consumerBindToken payload encoding.');
    }

    if (
      !isRecord(parsed)
      || parsed.v !== 1
      || typeof parsed.jti !== 'string'
      || typeof parsed.session_id !== 'string'
      || !parsed.session_id.trim()
      || typeof parsed.consumer_package_id !== 'string'
      || !parsed.consumer_package_id.trim()
      || typeof parsed.consumer_content_digest !== 'string'
      || !parsed.consumer_content_digest.trim()
      || typeof parsed.issued_at !== 'string'
      || typeof parsed.expires_at !== 'string'
    ) {
      throw new ConnectError('UNAUTHORIZED_BIND_TOKEN', 'Malformed consumerBindToken claims.');
    }

    const expiresMs = Date.parse(parsed.expires_at);
    if (!Number.isFinite(expiresMs) || expiresMs <= this.#nowMs()) {
      throw new ConnectError('BIND_TOKEN_EXPIRED', 'consumerBindToken has expired.');
    }

    if (
      typeof expected?.session_id !== 'string'
      || !expected.session_id.trim()
      || parsed.session_id !== expected.session_id
    ) {
      throw new ConnectError(
        'BIND_TOKEN_SESSION_MISMATCH',
        'consumerBindToken session_id is missing or does not match caller session.',
      );
    }

    if (
      expected.consumer_package_id !== undefined
      && parsed.consumer_package_id !== expected.consumer_package_id
    ) {
      throw new ConnectError(
        'BIND_TOKEN_PACKAGE_MISMATCH',
        'consumerBindToken consumer_package_id does not match target package.',
      );
    }

    const pkg = await loadVerifiedInstalledPackage(
      this.#db,
      parsed.consumer_package_id,
      this.#verifyRuntimeDigest,
    );
    if (pkg.content_digest !== parsed.consumer_content_digest) {
      throw new ConnectError(
        'CONSUMER_DIGEST_MISMATCH',
        `Consumer package '${pkg.package_id}' content_digest changed after consumerBindToken issuance.`,
      );
    }

    return Object.freeze({
      v: 1,
      jti: parsed.jti,
      session_id: parsed.session_id,
      consumer_package_id: parsed.consumer_package_id,
      consumer_content_digest: parsed.consumer_content_digest,
      issued_at: parsed.issued_at,
      expires_at: parsed.expires_at,
    });
  }

  private signHex(signingInput: string): string {
    return crypto.createHmac('sha256', this.#signingKey).update(signingInput, 'utf8').digest('hex');
  }
}
