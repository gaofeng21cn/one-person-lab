import { randomUUID } from 'node:crypto';
import { txImmediate, type SqliteDb } from '@opl/core';
import { PackError } from '../errors.ts';
import { officialPackagePrivateSourceId, readOfficialPackageCatalog } from './official-package-catalog.ts';
import { isPrivatePackageSourceHandle, probePrivatePackageSourceIdentity } from './private-package-source-provider.ts';
import { defaultPrivateSourceId, privateSourceOwner } from './private-package-source-store.ts';

const sourceStatuses = ['authorized', 'expired', 'forbidden', 'revoked', 'signed_out', 'unknown'] as const;
type SourceStatus = typeof sourceStatuses[number];
type SourceRow = {
  source_id: string; provider_id: string; credential_handle: string | null; enabled: number; status: SourceStatus;
  account_login: string | null; checked_at: string | null; error_message: string | null; updated_at: string; revision: string;
};

function safeEntry(sourceId: string, row?: SourceRow) {
  const owner = privateSourceOwner(sourceId);
  const enabled = row ? row.enabled !== 0 : true;
  const present = Boolean(row && isPrivatePackageSourceHandle(row.credential_handle) && row.provider_id === 'github_packages');
  const status = enabled && present ? sourceStatuses.find(value => value === row?.status) ?? 'unknown' : 'signed_out';
  return {
    source_id: sourceId, provider_id: 'github_packages', source_kind: 'registry',
    display_name: `${owner} / GitHub`, source_ref: `https://github.com/${owner}`,
    visibility: 'authorized_only', catalog_origin: sourceId === defaultPrivateSourceId ? 'opl' : 'external',
    enabled, status, credential_handle_present: present,
    verified_at: row?.checked_at ?? null, verification_reason: row?.error_message ?? null,
    account_login: row?.account_login ?? null, checked_at: row?.checked_at ?? null,
    error_message: row?.error_message ?? null, updated_at: row?.updated_at ?? null,
    revision: row?.revision ?? 'default',
  } as const;
}

function readRow(db: SqliteDb, sourceId: string): SourceRow | undefined {
  return db.prepare('SELECT source_id, provider_id, credential_handle, enabled, status, account_login, checked_at, error_message, updated_at, revision FROM package_sources WHERE source_id = ?')
    .get(sourceId) as SourceRow | undefined;
}

function writeRow(db: SqliteDb, row: Omit<SourceRow, 'revision'>): SourceRow {
  const next = { ...row, revision: randomUUID() };
  db.prepare(`
    INSERT INTO package_sources
      (source_id, provider_id, credential_handle, enabled, status, account_login, checked_at, error_message, updated_at, revision)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source_id) DO UPDATE SET provider_id=excluded.provider_id, credential_handle=excluded.credential_handle,
      enabled=excluded.enabled, status=excluded.status, account_login=excluded.account_login, checked_at=excluded.checked_at,
      error_message=excluded.error_message, updated_at=excluded.updated_at, revision=excluded.revision
  `).run(next.source_id, next.provider_id, next.credential_handle, next.enabled, next.status,
    next.account_login, next.checked_at, next.error_message, next.updated_at, next.revision);
  return next;
}

export function listPrivatePackageSources(db: SqliteDb) {
  const rows = db.prepare('SELECT source_id, provider_id, credential_handle, enabled, status, account_login, checked_at, error_message, updated_at, revision FROM package_sources').all() as SourceRow[];
  const byId = new Map(rows.map(row => [row.source_id, row]));
  const ids = new Set([defaultPrivateSourceId, ...rows.filter(row => row.source_id.startsWith('github-packages:')).map(row => row.source_id)]);
  return [...ids].map(id => safeEntry(id, byId.get(id)));
}

export function configurePrivatePackageSource(db: SqliteDb, input: {
  sourceId: string; credentialHandle: string; enabled?: boolean;
}) {
  const { sourceId, credentialHandle } = input;
  privateSourceOwner(sourceId);
  if (!isPrivatePackageSourceHandle(credentialHandle) || (input.enabled !== undefined && typeof input.enabled !== 'boolean')) {
    throw new PackError('INVALID_INPUT', 'Choose a supported GitHub Packages credential reference and boolean enabled setting.');
  }
  const enabled = input.enabled ?? true;
  const row = writeRow(db, {
    source_id: sourceId, provider_id: 'github_packages', credential_handle: credentialHandle, enabled: Number(enabled),
    status: enabled ? 'unknown' : 'signed_out', account_login: null, checked_at: null,
    error_message: 'configured_requires_check', updated_at: new Date().toISOString(),
  });
  return safeEntry(sourceId, row);
}

export function disconnectPrivatePackageSource(db: SqliteDb, sourceId: string) {
  privateSourceOwner(sourceId);
  const row = writeRow(db, {
    source_id: sourceId, provider_id: 'github_packages', credential_handle: null, enabled: 1,
    status: 'signed_out', account_login: null, checked_at: null,
    error_message: 'credential_reference_removed', updated_at: new Date().toISOString(),
  });
  return safeEntry(sourceId, row);
}

export async function checkPrivatePackageSource(db: SqliteDb, sourceId: string) {
  const owner = privateSourceOwner(sourceId);
  const row = readRow(db, sourceId);
  if (!row?.enabled || !isPrivatePackageSourceHandle(row.credential_handle)) return safeEntry(sourceId, row);
  const result = await probePrivatePackageSourceIdentity(row.credential_handle, owner, async signal => {
    const catalog = await readOfficialPackageCatalog({
      runtimeRoot: null,
      fetchImpl: (url, init) => fetch(url, { ...init, signal }),
    });
    return [...catalog.values()]
      .filter(entry => officialPackagePrivateSourceId(entry) === sourceId)
      .map(entry => entry.package_id);
  });
  return txImmediate(db, () => {
    const current = readRow(db, sourceId);
    if (!current || current.revision !== row.revision) {
      throw new PackError('PACK_OPERATION_BUSY', 'The source configuration changed during access verification.');
    }
    const now = new Date().toISOString();
    const updated = writeRow(db, {
      ...current, status: result.status, account_login: result.account_login ?? null,
      checked_at: now, error_message: result.verification_reason, updated_at: now,
    });
    return safeEntry(sourceId, updated);
  });
}
