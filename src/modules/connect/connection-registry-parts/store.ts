import fs from 'node:fs';

import { FrameworkContractError, isRecord } from '../../../kernel/contract-validation.ts';
import { readJsonPayloadFile, writeJsonPayloadFile } from '../../../kernel/json-file.ts';
import { ensureOplStateDir, resolveOplStatePaths } from '../../../kernel/runtime-state-paths.ts';
import { OPL_CONNECTION_STATUSES } from './types.ts';
import type { OplConnection, OplConnectionRegistryStore } from './types.ts';
import { normalizeCredentialHandle } from './credential-handle.ts';

function emptyStore(): OplConnectionRegistryStore {
  return {
    surface_kind: 'opl_connection_registry_store.v1',
    version: 'g1',
    default_connection_id: null,
    connections: [],
    updated_at: new Date().toISOString(),
  };
}

function normalizeConnection(value: unknown): OplConnection | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.connection_id !== 'string'
    || typeof value.name !== 'string'
    || typeof value.connection_type !== 'string'
    || typeof value.credential_handle !== 'string'
    || !OPL_CONNECTION_STATUSES.includes(value.status as OplConnection['status'])
  ) return null;
  return {
    connection_id: value.connection_id,
    name: value.name,
    connection_type: value.connection_type,
    endpoint: typeof value.endpoint === 'string' ? value.endpoint : null,
    credential_handle: normalizeCredentialHandle(value.credential_handle),
    status: value.status as OplConnection['status'],
    status_code: typeof value.status_code === 'string' ? value.status_code : null,
    created_at: typeof value.created_at === 'string' ? value.created_at : new Date().toISOString(),
    updated_at: typeof value.updated_at === 'string' ? value.updated_at : new Date().toISOString(),
    last_tested_at: typeof value.last_tested_at === 'string' ? value.last_tested_at : null,
  };
}

export function readConnectionRegistryStore(): OplConnectionRegistryStore {
  const paths = ensureOplStateDir(resolveOplStatePaths());
  if (!fs.existsSync(paths.connection_registry_file)) return emptyStore();
  try {
    const parsed = readJsonPayloadFile(paths.connection_registry_file);
    if (!isRecord(parsed) || !Array.isArray(parsed.connections)) throw new Error('invalid root');
    const connections = parsed.connections.map(normalizeConnection);
    if (connections.some((entry) => entry === null)) throw new Error('invalid connection');
    return {
      surface_kind: 'opl_connection_registry_store.v1',
      version: 'g1',
      default_connection_id: typeof parsed.default_connection_id === 'string'
        ? parsed.default_connection_id
        : null,
      connections: connections as OplConnection[],
      updated_at: typeof parsed.updated_at === 'string' ? parsed.updated_at : new Date().toISOString(),
    };
  } catch (error) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Existing OPL connection registry is invalid.',
      {
        file: paths.connection_registry_file,
        cause: error instanceof Error ? error.message : String(error),
      },
    );
  }
}

export function writeConnectionRegistryStore(store: OplConnectionRegistryStore) {
  const paths = ensureOplStateDir(resolveOplStatePaths());
  const tempFile = `${paths.connection_registry_file}.${process.pid}.tmp`;
  writeJsonPayloadFile(tempFile, store);
  fs.renameSync(tempFile, paths.connection_registry_file);
  return store;
}
