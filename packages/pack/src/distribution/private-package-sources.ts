import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { resolveStatePaths, withAdvisoryLockSync } from '@opl/core';
import { PackError } from '../errors.ts';
import { isPrivatePackageSourceHandle, probePrivatePackageSourceIdentity } from './private-package-source-provider.ts';
import {
  defaultPrivateSourceId, privatePackageSourceStoreFile, privateSourceOwner, readPrivateSourceStore,
  selectedHandle, selectedPrivateSource,
} from './private-package-source-store.ts';

const sourceStatuses = ['authorized', 'expired', 'forbidden', 'revoked', 'signed_out', 'unknown'] as const;
type SourceStatus = typeof sourceStatuses[number];

interface SourceLocation {
  stateDir?: string;
}
interface SourceTarget extends SourceLocation {
  sourceId: string;
}

function storeFile(stateDir?: string): string {
  const paths = resolveStatePaths({ stateDir });
  const defaultState = !stateDir && !process.env.OPL_STATE_DIR?.trim() && !process.env.OPL_DATA_DIR?.trim();
  return privatePackageSourceStoreFile(paths, defaultState);
}

function safeEntry(sourceId: string, row?: Record<string, unknown>) {
  const owner = privateSourceOwner(sourceId);
  const enabled = !row || row.enabled === true;
  const present = isPrivatePackageSourceHandle(row?.credential_handle)
    && (row?.provider_id === undefined || row.provider_id === 'github_packages');
  const status: SourceStatus = enabled && present
    ? sourceStatuses.find(candidate => candidate === row?.status) ?? 'unknown' : 'signed_out';
  return {
    source_id: sourceId, provider_id: 'github_packages', source_kind: 'registry',
    display_name: `${owner} / GitHub`, source_ref: `https://github.com/${owner}`,
    visibility: 'authorized_only', catalog_origin: sourceId === defaultPrivateSourceId ? 'opl' : 'external',
    enabled, status, credential_handle_present: present,
    verified_at: typeof row?.verified_at === 'string' ? row.verified_at : null,
    verification_reason: typeof row?.verification_reason === 'string' ? row.verification_reason : null,
    revision: typeof row?.revision === 'string' ? row.revision : 'default',
  } as const;
}

export function listPrivatePackageSources({ stateDir }: SourceLocation = {}) {
  const store = readPrivateSourceStore(storeFile(stateDir));
  const ids = new Set([defaultPrivateSourceId]);
  for (const row of store.sources) {
    if (typeof row.source_id === 'string' && row.source_id.startsWith('github-packages:')) ids.add(row.source_id);
  }
  return [...ids].map(id => safeEntry(id, selectedPrivateSource(store, id)));
}

function updateSource(target: SourceTarget, change: (row: Record<string, unknown> | undefined) => Record<string, unknown>) {
  privateSourceOwner(target.sourceId);
  const file = storeFile(target.stateDir);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  return withAdvisoryLockSync(`${file}.lock`, () => {
    const store = readPrivateSourceStore(file);
    const row = selectedPrivateSource(store, target.sourceId);
    const next = { ...row, ...change(row), source_id: target.sourceId, provider_id: 'github_packages', revision: randomUUID() };
    const index = row ? store.sources.indexOf(row) : -1;
    if (index < 0) store.sources.push(next);
    else store.sources[index] = next;
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temporary, JSON.stringify(store, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
      fs.renameSync(temporary, file);
    } finally {
      fs.rmSync(temporary, { force: true });
    }
    return safeEntry(target.sourceId, next);
  }, { timeoutMs: 1000, preserveLiveHolder: true });
}

export function configurePrivatePackageSource(input: SourceTarget & { credentialHandle: string; enabled?: boolean }) {
  if (!isPrivatePackageSourceHandle(input.credentialHandle) || (input.enabled !== undefined && typeof input.enabled !== 'boolean')) {
    throw new PackError('INVALID_INPUT', 'Choose a supported GitHub Packages credential reference and boolean enabled setting.');
  }
  const enabled = input.enabled ?? true;
  return updateSource(input, () => ({
    enabled, credential_handle: input.credentialHandle, status: enabled ? 'unknown' : 'signed_out',
    verified_at: null, verification_reason: 'configured_requires_check',
  }));
}

export function disconnectPrivatePackageSource(input: SourceTarget) {
  return updateSource(input, () => ({
    enabled: true, credential_handle: null, status: 'signed_out', verified_at: null,
    verification_reason: 'credential_reference_removed',
  }));
}

export async function checkPrivatePackageSource(input: SourceTarget) {
  const row = selectedPrivateSource(readPrivateSourceStore(storeFile(input.stateDir)), input.sourceId);
  const handle = selectedHandle(row);
  const entry = safeEntry(input.sourceId, row);
  if (!handle) return entry;
  const result = await probePrivatePackageSourceIdentity(handle);
  return updateSource(input, current => {
    if (current?.revision !== row?.revision || selectedHandle(current) !== handle) {
      throw new PackError('PACK_OPERATION_BUSY', 'The source configuration changed during access verification.');
    }
    return { ...result, verified_at: new Date().toISOString() };
  });
}
