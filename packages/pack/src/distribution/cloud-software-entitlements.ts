import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { isRecord, txImmediate, type SqliteDb } from '@opl/core';
import { PackError } from '../errors.ts';
import { KebabIdSchema } from '../manifest/schema.ts';
import type { PackageOperationProgress } from '../types.ts';
import { prunePackageDownloadCache } from '../carriers/codex-sync/temp-hygiene.ts';
import { MAX_PACKAGE_SOURCE_ARCHIVE_BYTES, packageSourceArchiveDigest } from './archive.ts';
import { packageDownloadCacheDir } from './download-plan.ts';
import { downloadPackageArchive, type DownloadTransport } from './download-worker.ts';

export const OPL_CLOUD_DEFAULT_ORIGIN = 'https://cloud.medopl.com';
export const OPL_CLOUD_SOFTWARE_SOURCE_ID = 'opl-cloud:default';
const SHA256_RE = /^sha256:[0-9a-f]{64}$/;
const MAX_ENTITLEMENTS_BYTES = 256 * 1024;
const MAX_DOWNLOAD_META_BYTES = 32 * 1024;
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

export interface CloudEntitledPackage {
  readonly package_id: string;
  readonly enabled: true;
  readonly selected_version?: string;
  readonly sha256?: string;
  readonly expires_at?: string;
  readonly display_name?: string;
  readonly description?: string;
  readonly software_type?: string;
}

export type CloudSoftwareEntitlementsStatus =
  | 'authorized'
  | 'expired'
  | 'forbidden'
  | 'signed_out'
  | 'unknown';

export interface CloudSoftwareEntitlementsResult {
  readonly status: CloudSoftwareEntitlementsStatus;
  readonly verification_reason: string;
  readonly checked_at: string;
  readonly entitlements: readonly CloudEntitledPackage[];
}

function validateServiceUrl(raw: string, env: NodeJS.ProcessEnv, allowNonEmptyPath: boolean): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new PackError('INVALID_INPUT', 'Invalid OPL Cloud endpoint URL.');
  }
  if (url.username || url.password) {
    throw new PackError('INVALID_INPUT', 'OPL Cloud URLs must not contain embedded credentials.');
  }
  if (!allowNonEmptyPath && (url.pathname !== '/' && url.pathname !== '' || url.search || url.hash)) {
    throw new PackError('INVALID_INPUT', 'OPL Cloud origin must not include a path, query, or fragment.');
  }
  const testLoopback = env.NODE_ENV === 'test' && LOOPBACK_HOSTS.has(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && testLoopback)) {
    throw new PackError('INVALID_INPUT', `OPL Cloud URL must use HTTPS (got '${url.protocol}').`);
  }
  return url;
}

export function resolveOplCloudOrigin(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.OPL_CLOUD_BASE_URL?.trim();
  if (!raw) return OPL_CLOUD_DEFAULT_ORIGIN;
  return validateServiceUrl(raw, env, false).origin;
}

function combinedSignal(timeoutMs: number, signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([timeout, signal]) : timeout;
}

async function readBoundedText(response: Response, maxBytes: number): Promise<string> {
  const contentLength = response.headers.get('content-length');
  if (contentLength && Number(contentLength) > maxBytes) {
    await response.body?.cancel().catch(() => {});
    throw new Error('response_too_large');
  }
  const reader = response.body?.getReader();
  if (!reader) {
    const buf = Buffer.from(await response.arrayBuffer());
    if (buf.byteLength > maxBytes) throw new Error('response_too_large');
    return buf.toString('utf8');
  }
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      if (next.value) {
        bytes += next.value.byteLength;
        if (bytes > maxBytes) {
          await reader.cancel().catch(() => {});
          throw new Error('response_too_large');
        }
        chunks.push(next.value);
      }
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
  } finally {
    reader.releaseLock();
  }
}

function normalizeEntitledPackage(item: unknown, nowMs: number): CloudEntitledPackage | null {
  if (!isRecord(item)) return null;
  const packageId = typeof item.package_id === 'string'
    ? item.package_id
    : typeof item.packageId === 'string'
      ? item.packageId
      : null;
  if (!packageId || !KebabIdSchema.safeParse(packageId).success) return null;
  if (item.enabled === false) return null;
  const expiresAt = typeof item.expires_at === 'string'
    ? item.expires_at
    : typeof item.expiresAt === 'string'
      ? item.expiresAt
      : undefined;
  if (expiresAt !== undefined) {
    const ts = Date.parse(expiresAt);
    if (!Number.isFinite(ts) || ts <= nowMs) return null;
  }
  const selectedVersion = typeof item.selected_version === 'string'
    ? item.selected_version
    : typeof item.selectedVersion === 'string'
      ? item.selectedVersion
      : typeof item.version === 'string'
        ? item.version
        : undefined;
  const sha256 = typeof item.sha256 === 'string'
    ? item.sha256
    : typeof item.digest === 'string'
      ? item.digest
      : undefined;
  const displayName = typeof item.display_name === 'string'
    ? item.display_name
    : typeof item.displayName === 'string'
      ? item.displayName
      : undefined;
  const description = typeof item.description === 'string' ? item.description : undefined;
  const softwareType = typeof item.software_type === 'string'
    ? item.software_type
    : typeof item.softwareType === 'string'
      ? item.softwareType
      : undefined;
  return {
    package_id: packageId,
    enabled: true,
    ...(selectedVersion ? { selected_version: selectedVersion } : {}),
    ...(sha256 && SHA256_RE.test(sha256) ? { sha256 } : {}),
    ...(expiresAt ? { expires_at: expiresAt } : {}),
    ...(displayName ? { display_name: displayName } : {}),
    ...(description ? { description } : {}),
    ...(softwareType ? { software_type: softwareType } : {}),
  };
}

export async function fetchCloudSoftwareEntitlements(input: {
  readonly accessToken: string;
  readonly cloudOrigin?: string;
  readonly fetchImpl?: typeof fetch;
  readonly signal?: AbortSignal;
  readonly nowIso?: () => string;
}): Promise<CloudSoftwareEntitlementsResult> {
  const checkedAt = (input.nowIso ?? (() => new Date().toISOString()))();
  const origin = input.cloudOrigin
    ? validateServiceUrl(input.cloudOrigin, process.env, false).origin
    : resolveOplCloudOrigin();
  const fetchImpl = input.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(`${origin}/api/v2/software/entitlements`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${input.accessToken}`, Accept: 'application/json' },
      redirect: 'error',
      signal: combinedSignal(15_000, input.signal),
    });
  } catch (error) {
    input.signal?.throwIfAborted();
    void error;
    return {
      status: 'unknown',
      verification_reason: 'cloud_entitlements_unavailable',
      checked_at: checkedAt,
      entitlements: [],
    };
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    if (response.status === 401) {
      return { status: 'expired', verification_reason: 'gateway_session_expired', checked_at: checkedAt, entitlements: [] };
    }
    if (response.status === 403) {
      return { status: 'forbidden', verification_reason: 'cloud_entitlement_forbidden', checked_at: checkedAt, entitlements: [] };
    }
    return { status: 'unknown', verification_reason: 'cloud_entitlements_unavailable', checked_at: checkedAt, entitlements: [] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readBoundedText(response, MAX_ENTITLEMENTS_BYTES));
  } catch {
    return { status: 'unknown', verification_reason: 'cloud_entitlements_unavailable', checked_at: checkedAt, entitlements: [] };
  }
  if (!isRecord(parsed)) {
    return { status: 'unknown', verification_reason: 'cloud_entitlements_unavailable', checked_at: checkedAt, entitlements: [] };
  }
  const rawList = Array.isArray(parsed.entitlements)
    ? parsed.entitlements
    : Array.isArray(parsed.items)
      ? parsed.items
      : Array.isArray(parsed.packages)
        ? parsed.packages
        : null;
  if (!rawList) {
    return { status: 'unknown', verification_reason: 'cloud_entitlements_unavailable', checked_at: checkedAt, entitlements: [] };
  }
  const nowMs = Date.parse(checkedAt) || Date.now();
  const seen = new Set<string>();
  const entitlements: CloudEntitledPackage[] = [];
  for (const raw of rawList) {
    const normalized = normalizeEntitledPackage(raw, nowMs);
    if (normalized && !seen.has(normalized.package_id)) {
      seen.add(normalized.package_id);
      entitlements.push(normalized);
    }
  }
  return {
    status: 'authorized',
    verification_reason: 'cloud_gateway_entitlements_verified',
    checked_at: checkedAt,
    entitlements,
  };
}

function ensureSafeCacheRoot(cacheRoot: string): string {
  fs.mkdirSync(cacheRoot, { recursive: true, mode: 0o700 });
  if (fs.lstatSync(cacheRoot).isSymbolicLink()) {
    throw new PackError('PACK_SYMLINK_ESCAPE', 'Download cache root cannot be a symlink.');
  }
  return fs.realpathSync(cacheRoot);
}

async function streamResponseToVerifiedCache(
  response: Response,
  options: {
    readonly cacheRoot: string;
    readonly expectedDigest?: string;
    readonly signal?: AbortSignal;
    readonly onProgress?: (progress: PackageOperationProgress) => void;
  },
): Promise<string> {
  const contentLength = response.headers.get('content-length');
  const expectedSize = contentLength && /^\d+$/.test(contentLength) ? Number(contentLength) : undefined;
  if (expectedSize !== undefined && expectedSize > MAX_PACKAGE_SOURCE_ARCHIVE_BYTES) {
    await response.body?.cancel().catch(() => {});
    throw new PackError('PACK_LOCK_MISMATCH', 'Package archive exceeds maximum bounded size.');
  }
  const realRoot = ensureSafeCacheRoot(options.cacheRoot);
  const tmpPath = path.join(realRoot, `cloud-${crypto.randomUUID()}.tar.gz.part`);
  const fd = fs.openSync(tmpPath, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL, 0o600);
  let bytesDone = 0;
  try {
    const reader = response.body?.getReader();
    if (!reader) {
      const buf = Buffer.from(await response.arrayBuffer());
      if (buf.byteLength > MAX_PACKAGE_SOURCE_ARCHIVE_BYTES || buf.byteLength === 0) {
        throw new PackError('PACK_LOCK_MISMATCH', 'Package archive response is empty or exceeds maximum bounded size.');
      }
      fs.writeFileSync(fd, buf);
      bytesDone = buf.byteLength;
    } else {
      try {
        for (;;) {
          if (options.signal?.aborted) {
            await reader.cancel().catch(() => {});
            throw new PackError('PACK_DOWNLOAD_CANCELLED', 'Package download was cancelled.');
          }
          const chunk = await reader.read();
          if (chunk.done) break;
          if (!chunk.value || chunk.value.byteLength === 0) continue;
          bytesDone += chunk.value.byteLength;
          if (bytesDone > MAX_PACKAGE_SOURCE_ARCHIVE_BYTES) {
            await reader.cancel().catch(() => {});
            throw new PackError('PACK_LOCK_MISMATCH', 'Package archive stream exceeded maximum bounded size.');
          }
          let written = 0;
          while (written < chunk.value.byteLength) {
            written += fs.writeSync(fd, chunk.value, written, chunk.value.byteLength - written);
          }
          options.onProgress?.({
            stage: 'downloading',
            bytes_done: bytesDone,
            ...(expectedSize !== undefined ? { bytes_total: expectedSize } : {}),
            speed_bps: 0,
            eta_sec: null,
          });
        }
      } finally {
        reader.releaseLock();
      }
    }
  } catch (error) {
    fs.closeSync(fd);
    fs.rmSync(tmpPath, { force: true });
    throw error;
  }
  fs.closeSync(fd);

  options.onProgress?.({
    stage: 'verifying',
    bytes_done: bytesDone,
    bytes_total: bytesDone,
    speed_bps: 0,
    eta_sec: 0,
  });

  let actual: string;
  try {
    if (bytesDone <= 0) {
      throw new PackError('PACK_ARCHIVE_INVALID', 'Downloaded Cloud package archive is empty.');
    }
    actual = packageSourceArchiveDigest(tmpPath);
    if (options.expectedDigest && actual !== options.expectedDigest) {
      throw new PackError(
        'PACK_LOCK_MISMATCH',
        `Cloud package digest mismatch: expected ${options.expectedDigest}, got ${actual}.`,
        { expected_digest: options.expectedDigest, actual_digest: actual },
      );
    }
    const cacheDir = packageDownloadCacheDir(realRoot, actual);
    fs.mkdirSync(cacheDir, { recursive: true, mode: 0o700 });
    if (fs.lstatSync(cacheDir).isSymbolicLink()) {
      throw new PackError('PACK_SYMLINK_ESCAPE', 'Download cache directory cannot be a symlink.');
    }
    const completePath = path.join(fs.realpathSync(cacheDir), 'archive.tar.gz');
    fs.chmodSync(tmpPath, 0o600);
    fs.renameSync(tmpPath, completePath);
    try {
      prunePackageDownloadCache(realRoot, { preserveDigests: [actual] });
    } catch {
      // Best-effort cache pruning must not fail a verified download.
    }
    return completePath;
  } catch (error) {
    fs.rmSync(tmpPath, { force: true });
    throw error;
  }
}

export async function downloadCloudEntitledPackageArchive(input: {
  readonly packageId: string;
  readonly accessToken: string;
  readonly cacheRoot: string;
  readonly expectedDigest?: string;
  readonly cloudOrigin?: string;
  readonly fetchImpl?: typeof fetch;
  readonly transport?: DownloadTransport;
  readonly opId?: string;
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: PackageOperationProgress) => void;
}): Promise<string> {
  if (!KebabIdSchema.safeParse(input.packageId).success) {
    throw new PackError('INVALID_INPUT', 'Invalid Package identity.');
  }
  if (input.expectedDigest !== undefined && !SHA256_RE.test(input.expectedDigest)) {
    throw new PackError('INVALID_INPUT', 'Invalid expected Package digest.');
  }
  const origin = input.cloudOrigin
    ? validateServiceUrl(input.cloudOrigin, process.env, false).origin
    : resolveOplCloudOrigin();
  const fetchImpl = input.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(`${origin}/api/v2/software/packages/${encodeURIComponent(input.packageId)}/download`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/gzip, application/octet-stream, application/json',
      },
      body: '{}',
      redirect: 'error',
      signal: combinedSignal(60_000, input.signal),
    });
  } catch (error) {
    input.signal?.throwIfAborted();
    throw new PackError('PACK_DOWNLOAD_FAILED', `Failed to reach OPL Cloud for '${input.packageId}'.`, {
      reason: 'cloud_entitlements_unavailable',
      source_id: OPL_CLOUD_SOFTWARE_SOURCE_ID,
    }, { cause: error });
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    if (response.status === 401) {
      throw new PackError('PACK_DOWNLOAD_FAILED', 'Sign in to your OPL account again to download this Package.', {
        reason: 'reauth_required',
        source_id: OPL_CLOUD_SOFTWARE_SOURCE_ID,
      });
    }
    if (response.status === 403) {
      throw new PackError('PACK_DOWNLOAD_FAILED', `Your OPL account is not entitled to download '${input.packageId}'.`, {
        reason: 'package_not_entitled',
        source_id: OPL_CLOUD_SOFTWARE_SOURCE_ID,
      });
    }
    if (response.status === 404) {
      throw new PackError('PACK_NOT_FOUND', `Cloud package archive unavailable for '${input.packageId}'.`);
    }
    throw new PackError('PACK_DOWNLOAD_FAILED', `Cloud package download returned HTTP ${response.status}.`, {
      status: response.status,
      source_id: OPL_CLOUD_SOFTWARE_SOURCE_ID,
    });
  }

  const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
  if (contentType.includes('application/json')) {
    const meta = JSON.parse(await readBoundedText(response, MAX_DOWNLOAD_META_BYTES)) as unknown;
    if (!isRecord(meta)) {
      throw new PackError('PACK_DOWNLOAD_FAILED', 'Cloud download response payload is invalid.');
    }
    const rawUrl = typeof meta.download_url === 'string'
      ? meta.download_url
      : typeof meta.downloadUrl === 'string'
        ? meta.downloadUrl
        : null;
    const rawDigest = typeof meta.sha256 === 'string'
      ? meta.sha256
      : typeof meta.digest === 'string'
        ? meta.digest
        : null;
    if (!rawUrl || !rawDigest || !SHA256_RE.test(rawDigest)) {
      throw new PackError('PACK_DOWNLOAD_FAILED', 'Cloud presigned download metadata is missing URL or SHA-256 digest.');
    }
    if (input.expectedDigest && rawDigest !== input.expectedDigest) {
      throw new PackError(
        'PACK_LOCK_MISMATCH',
        `Cloud download digest mismatch: expected ${input.expectedDigest}, got ${rawDigest}.`,
      );
    }
    const downloadUrl = validateServiceUrl(rawUrl, process.env, true);
    const size = Number.isSafeInteger(meta.size) && Number(meta.size) > 0 ? Number(meta.size) : undefined;
    if (size !== undefined && (downloadUrl.protocol === 'https:' || downloadUrl.hostname !== '[::1]')) {
      return downloadPackageArchive({
        url: downloadUrl.href,
        digest: rawDigest,
        size,
        packageId: input.packageId,
        cacheRoot: input.cacheRoot,
        allowInsecureHttp: downloadUrl.protocol === 'http:',
        transport: input.transport,
        signal: input.signal,
        onProgress: input.onProgress,
        ...(input.opId ? { operationId: input.opId } : {}),
      });
    }
    const fileRes = await fetchImpl(downloadUrl.href, {
      method: 'GET',
      redirect: 'error',
      signal: combinedSignal(60_000, input.signal),
    });
    if (!fileRes.ok) {
      await fileRes.body?.cancel().catch(() => {});
      throw new PackError('PACK_DOWNLOAD_FAILED', `Presigned package download returned HTTP ${fileRes.status}.`);
    }
    return streamResponseToVerifiedCache(fileRes, {
      cacheRoot: input.cacheRoot,
      expectedDigest: rawDigest,
      signal: input.signal,
      onProgress: input.onProgress,
    });
  }

  const headerDigest = response.headers.get('x-opl-artifact-sha256')?.trim();
  if (headerDigest !== undefined && headerDigest !== '') {
    if (!SHA256_RE.test(headerDigest)) {
      await response.body?.cancel().catch(() => {});
      throw new PackError('PACK_LOCK_MISMATCH', 'Cloud returned malformed artifact SHA-256 header.');
    }
    if (input.expectedDigest && headerDigest !== input.expectedDigest) {
      await response.body?.cancel().catch(() => {});
      throw new PackError('PACK_LOCK_MISMATCH', `Cloud artifact header digest mismatch: expected ${input.expectedDigest}, got ${headerDigest}.`);
    }
  }
  return streamResponseToVerifiedCache(response, {
    cacheRoot: input.cacheRoot,
    expectedDigest: input.expectedDigest ?? headerDigest ?? undefined,
    signal: input.signal,
    onProgress: input.onProgress,
  });
}

export function initializeCloudEntitlementCache(db: SqliteDb): void {
  db.exec(`CREATE TABLE IF NOT EXISTS opl_cloud_package_entitlements_cache (
    cache_key TEXT PRIMARY KEY,
    account_user_id TEXT,
    status TEXT NOT NULL,
    verification_reason TEXT,
    checked_at TEXT NOT NULL,
    entitlements_json TEXT NOT NULL
  )`);
}

export function readCachedCloudSoftwareEntitlements(
  db: SqliteDb,
  expectedAccountUserId: string | null,
): CloudSoftwareEntitlementsResult | null {
  if (!expectedAccountUserId) return null;
  if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'opl_cloud_package_entitlements_cache'").get()) {
    return null;
  }
  const row = db.prepare(
    'SELECT account_user_id, status, verification_reason, checked_at, entitlements_json FROM opl_cloud_package_entitlements_cache WHERE cache_key = ?',
  ).get(OPL_CLOUD_SOFTWARE_SOURCE_ID) as {
    account_user_id: string | null;
    status: string;
    verification_reason: string | null;
    checked_at: string;
    entitlements_json: string;
  } | undefined;
  if (!row || row.account_user_id !== expectedAccountUserId) return null;
  if (!['authorized', 'expired', 'forbidden', 'signed_out', 'unknown'].includes(row.status)) return null;
  try {
    const raw = JSON.parse(row.entitlements_json);
    if (!Array.isArray(raw)) return null;
    const nowMs = Date.now();
    const entitlements = raw
      .map(item => normalizeEntitledPackage(item, nowMs))
      .filter((item): item is CloudEntitledPackage => item !== null);
    return {
      status: row.status as CloudSoftwareEntitlementsStatus,
      verification_reason: row.verification_reason ?? 'cloud_entitlements_cached',
      checked_at: row.checked_at,
      entitlements,
    };
  } catch {
    return null;
  }
}

export function writeCachedCloudSoftwareEntitlements(
  db: SqliteDb,
  accountUserId: string | null,
  result: CloudSoftwareEntitlementsResult,
): void {
  initializeCloudEntitlementCache(db);
  txImmediate(db, () => {
    db.prepare(`
      INSERT INTO opl_cloud_package_entitlements_cache
        (cache_key, account_user_id, status, verification_reason, checked_at, entitlements_json)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(cache_key) DO UPDATE SET
        account_user_id = excluded.account_user_id,
        status = excluded.status,
        verification_reason = excluded.verification_reason,
        checked_at = excluded.checked_at,
        entitlements_json = excluded.entitlements_json
    `).run(
      OPL_CLOUD_SOFTWARE_SOURCE_ID,
      accountUserId,
      result.status,
      result.verification_reason,
      result.checked_at,
      JSON.stringify(result.entitlements),
    );
  });
}

export function clearCachedCloudSoftwareEntitlements(db: SqliteDb): void {
  if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'opl_cloud_package_entitlements_cache'").get()) {
    return;
  }
  txImmediate(db, () => {
    db.prepare('DELETE FROM opl_cloud_package_entitlements_cache WHERE cache_key = ?').run(OPL_CLOUD_SOFTWARE_SOURCE_ID);
  });
}
