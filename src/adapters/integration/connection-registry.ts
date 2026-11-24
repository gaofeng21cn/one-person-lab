import crypto, { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { isProcessAlive, waitBrieflySync, writeExclusiveFileSync } from '../../kernel/file-lock.ts';
import { readJsonPayloadFile, writeJsonPayloadFile } from '../../kernel/json-file.ts';
import { readLocalCodexAccessState } from '../../kernel/local-codex-defaults.ts';
import { ensureOplStateDir, resolveOplStatePaths } from '../../kernel/runtime-state-paths.ts';

export const OPL_CONNECTION_STATUSES = [
  'untested',
  'ready',
  'attention_needed',
  'disabled',
] as const;

export type OplConnectionStatus = typeof OPL_CONNECTION_STATUSES[number];

export type OplConnection = {
  connection_id: string;
  name: string;
  connection_type: string;
  account_label: string | null;
  endpoint: string | null;
  credential_handle: string;
  /** Opaque generation: rotating a binding can never reactivate an earlier grant. */
  security_revision: string;
  status: OplConnectionStatus;
  status_code: string | null;
  created_at: string;
  updated_at: string;
  last_tested_at: string | null;
};

export type OplConnectionRegistryStore = {
  surface_kind: 'opl_connection_registry_store.v1';
  version: 'g1';
  default_connection_id: string | null;
  connections: OplConnection[];
  updated_at: string;
};

export type CreateOplConnectionInput = {
  connection_id: string;
  name: string;
  connection_type: string;
  account_label?: string | null;
  endpoint?: string | null;
  credential_handle: string;
  disabled?: boolean;
};

export type UpdateOplConnectionInput = Partial<
  Omit<CreateOplConnectionInput, 'connection_id'>
>;

export type OplConnectionCheck = {
  check_id: 'credential_handle' | 'endpoint';
  status: 'passed' | 'failed';
  code: string;
};

const MAX_LOCK_WAIT_MS = 10_000;
const ENV_HANDLE = /^env:([A-Z_][A-Z0-9_]*)$/;
const OPL_GATEWAY_ACCOUNT_HANDLE = 'credential-store:opl-gateway-account';
const PROVIDER_HANDLE = /^provider:([a-z0-9][a-z0-9._-]*):([A-Za-z0-9._~!*'()-]|%[A-Fa-f0-9]{2})+$/;
const FORBIDDEN_FIELDS = /(?:^|_)(?:api_key|token|secret|password)$/i;

export function withConnectionStateLock<T>(action: () => T): T {
  const lockPath = `${resolveOplStatePaths().connection_registry_file}.authorization.lock`;
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  const nonce = crypto.randomUUID();
  const owner = Buffer.from(`${process.pid}\n${nonce}\n`);
  const candidate = `${lockPath}.${nonce}.candidate`;
  writeExclusiveFileSync(candidate, owner, 0o600);

  const startedAt = Date.now();
  let acquired = false;
  try {
    while (!acquired) {
      try {
        fs.linkSync(candidate, lockPath);
        acquired = true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        const before = fs.lstatSync(lockPath);
        let current = '';
        try { current = fs.readFileSync(lockPath, 'utf8'); } catch { /* Fail closed below. */ }
        const ownerPid = /^([1-9][0-9]*)\n[0-9a-f-]+\n$/i.exec(current)?.[1];
        const ownerGone = Boolean(ownerPid) && !isProcessAlive(Number(ownerPid));
        if (ownerGone) {
          const after = fs.lstatSync(lockPath);
          const currentBytes = fs.readFileSync(lockPath, 'utf8');
          if (before.ino === after.ino && before.dev === after.dev && current === currentBytes) {
            fs.rmSync(lockPath, { force: true });
          }
          continue;
        }
        if (Date.now() - startedAt >= MAX_LOCK_WAIT_MS) {
          throw new FrameworkContractError('contract_shape_invalid', 'Connection state is busy.', {
            reason_code: 'connection_state_busy',
          });
        }
        waitBrieflySync(25);
      }
    }
    return action();
  } finally {
    if (acquired) {
      const current = fs.readFileSync(lockPath);
      if (!current.equals(owner)) {
        throw new FrameworkContractError('contract_shape_invalid', 'Connection state lock ownership changed.', {
          reason_code: 'connection_state_lock_owner_changed',
        });
      }
      fs.rmSync(lockPath, { force: true });
    }
    fs.rmSync(candidate, { force: true });
  }
}

function normalizedFieldName(field: string) {
  return field.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/-/g, '_').toLowerCase();
}

function usageError(message: string, reasonCode: string, details: Record<string, unknown> = {}) {
  return new FrameworkContractError('cli_usage_error', message, {
    reason_code: reasonCode,
    ...details,
  });
}

export function assertCredentialHandleOnlyPayload(value: unknown, path = 'payload'): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertCredentialHandleOnlyPayload(entry, `${path}[${index}]`));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_FIELDS.test(normalizedFieldName(key))) {
      throw usageError('Connection actions accept credential handles only.', 'credential_payload_forbidden', {
        field: `${path}.${key}`,
      });
    }
    assertCredentialHandleOnlyPayload(nested, `${path}.${key}`);
  }
}

export function normalizeCredentialHandle(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) {
    throw usageError('credential_handle is required.', 'credential_handle_required');
  }
  const handle = value.trim();
  if (handle === 'codex:selected_provider' || handle === OPL_GATEWAY_ACCOUNT_HANDLE
    || ENV_HANDLE.test(handle) || PROVIDER_HANDLE.test(handle)) {
    return handle;
  }
  throw usageError(
    'credential_handle must use env:NAME, codex:selected_provider, an owner store, or a provider-owned opaque reference.',
    'credential_handle_invalid',
    { allowed_schemes: ['env:NAME', 'codex:selected_provider', OPL_GATEWAY_ACCOUNT_HANDLE, 'provider:PROVIDER_ID:OPAQUE_REF'] },
  );
}

export function checkCredentialHandle(handle: string) {
  if (PROVIDER_HANDLE.test(handle)) {
    return { status: 'passed' as const, code: 'provider_owned_credential_reference' };
  }
  if (handle === OPL_GATEWAY_ACCOUNT_HANDLE) {
    return { status: 'passed' as const, code: 'opl_gateway_account_store_present' };
  }
  const envMatch = ENV_HANDLE.exec(handle);
  if (envMatch) {
    return process.env[envMatch[1]]
      ? { status: 'passed' as const, code: 'credential_env_present' }
      : { status: 'failed' as const, code: 'credential_env_missing' };
  }
  const access = readLocalCodexAccessState();
  return access.model_access_ready
    ? { status: 'passed' as const, code: 'codex_selected_provider_ready' }
    : { status: 'failed' as const, code: 'codex_selected_provider_unavailable' };
}

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
    account_label: typeof value.account_label === 'string' && value.account_label.trim()
      ? value.account_label.trim()
      : null,
    endpoint: typeof value.endpoint === 'string' ? value.endpoint : null,
    credential_handle: normalizeCredentialHandle(value.credential_handle),
    security_revision: typeof value.security_revision === 'string' && value.security_revision
      ? value.security_revision
      : `legacy-${createHash('sha256').update(JSON.stringify([
        value.connection_id, value.created_at ?? null, value.connection_type,
        value.endpoint ?? null, value.credential_handle, value.status === 'disabled',
      ])).digest('hex')}`,
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

function requiredString(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw usageError(`${field} is required.`, 'connection_field_required', { field });
  }
  return value.trim();
}

function connectionById(store: OplConnectionRegistryStore, connectionId: string) {
  const connection = store.connections.find((entry) => entry.connection_id === connectionId);
  if (!connection) {
    throw usageError('Connection not found.', 'connection_not_found', { connection_id: connectionId });
  }
  return connection;
}

function registryProjection(store: OplConnectionRegistryStore, connection?: OplConnection) {
  return {
    connection_registry: {
      surface_kind: 'opl_connection_registry.v1',
      owner: 'one-person-lab',
      credential_policy: 'handle_only',
      allowed_credential_handles: [
        'env:NAME', 'codex:selected_provider', 'credential-store:opl-gateway-account',
        'provider:PROVIDER_ID:OPAQUE_REF',
      ],
      allowed_statuses: [...OPL_CONNECTION_STATUSES],
      default_connection_id: store.default_connection_id,
      connections: store.connections,
      ...(connection ? { connection } : {}),
      updated_at: store.updated_at,
    },
  };
}

function persist(store: OplConnectionRegistryStore, connection?: OplConnection) {
  store.updated_at = new Date().toISOString();
  writeConnectionRegistryStore(store);
  return registryProjection(store, connection);
}

export function listOplConnections() {
  return registryProjection(readConnectionRegistryStore()).connection_registry;
}

export function createOplConnection(input: CreateOplConnectionInput) {
  return withConnectionStateLock(() => createOplConnectionLocked(input));
}

function createOplConnectionLocked(input: CreateOplConnectionInput) {
  assertCredentialHandleOnlyPayload(input);
  const store = readConnectionRegistryStore();
  const connectionId = requiredString(input.connection_id, 'connection_id');
  if (store.connections.some((entry) => entry.connection_id === connectionId)) {
    throw usageError('Connection already exists.', 'connection_already_exists', {
      connection_id: connectionId,
    });
  }
  const now = new Date().toISOString();
  const connection: OplConnection = {
    connection_id: connectionId,
    name: requiredString(input.name, 'name'),
    connection_type: requiredString(input.connection_type, 'connection_type'),
    account_label: typeof input.account_label === 'string' && input.account_label.trim()
      ? input.account_label.trim()
      : null,
    endpoint: typeof input.endpoint === 'string' && input.endpoint.trim() ? input.endpoint.trim() : null,
    credential_handle: normalizeCredentialHandle(input.credential_handle),
    security_revision: randomUUID(),
    status: input.disabled ? 'disabled' : 'untested',
    status_code: input.disabled ? 'connection_disabled' : null,
    created_at: now,
    updated_at: now,
    last_tested_at: null,
  };
  store.connections.push(connection);
  return persist(store, connection);
}

export function updateOplConnection(connectionId: string, input: UpdateOplConnectionInput) {
  return withConnectionStateLock(() => updateOplConnectionLocked(connectionId, input));
}

function updateOplConnectionLocked(connectionId: string, input: UpdateOplConnectionInput) {
  assertCredentialHandleOnlyPayload(input);
  const store = readConnectionRegistryStore();
  const connection = connectionById(store, requiredString(connectionId, 'connection_id'));
  const previousBinding = JSON.stringify([
    connection.connection_type, connection.endpoint, connection.credential_handle,
    connection.status === 'disabled',
  ]);
  if (input.name !== undefined) connection.name = requiredString(input.name, 'name');
  if (input.connection_type !== undefined) {
    connection.connection_type = requiredString(input.connection_type, 'connection_type');
  }
  if (input.account_label !== undefined) {
    connection.account_label = typeof input.account_label === 'string' && input.account_label.trim()
      ? input.account_label.trim()
      : null;
  }
  if (input.endpoint !== undefined) {
    connection.endpoint = typeof input.endpoint === 'string' && input.endpoint.trim()
      ? input.endpoint.trim()
      : null;
  }
  if (input.credential_handle !== undefined) {
    connection.credential_handle = normalizeCredentialHandle(input.credential_handle);
  }
  const disabled = input.disabled ?? connection.status === 'disabled';
  if (previousBinding !== JSON.stringify([
    connection.connection_type, connection.endpoint, connection.credential_handle, disabled,
  ])) connection.security_revision = randomUUID();
  connection.status = disabled ? 'disabled' : 'untested';
  connection.status_code = disabled ? 'connection_disabled' : null;
  connection.updated_at = new Date().toISOString();
  connection.last_tested_at = null;
  return persist(store, connection);
}

export function deleteOplConnection(connectionId: string) {
  return withConnectionStateLock(() => deleteOplConnectionLocked(connectionId));
}

function deleteOplConnectionLocked(connectionId: string) {
  const store = readConnectionRegistryStore();
  const normalizedId = requiredString(connectionId, 'connection_id');
  connectionById(store, normalizedId);
  if (store.default_connection_id === normalizedId) {
    throw usageError('The default connection cannot be deleted.', 'default_connection_delete_forbidden', {
      connection_id: normalizedId,
    });
  }
  store.connections = store.connections.filter((entry) => entry.connection_id !== normalizedId);
  return persist(store);
}

export function setDefaultOplConnection(connectionId: string) {
  return withConnectionStateLock(() => setDefaultOplConnectionLocked(connectionId));
}

function setDefaultOplConnectionLocked(connectionId: string) {
  const store = readConnectionRegistryStore();
  const connection = connectionById(store, requiredString(connectionId, 'connection_id'));
  if (connection.status === 'disabled') {
    throw usageError('A disabled connection cannot be the default.', 'disabled_connection_default_forbidden', {
      connection_id: connection.connection_id,
    });
  }
  store.default_connection_id = connection.connection_id;
  return persist(store, connection);
}

function endpointCheck(endpoint: string | null): OplConnectionCheck {
  if (!endpoint) return { check_id: 'endpoint', status: 'passed', code: 'endpoint_not_required' };
  try {
    const parsed = new URL(endpoint);
    return ['http:', 'https:'].includes(parsed.protocol)
      ? { check_id: 'endpoint', status: 'passed', code: 'endpoint_valid' }
      : { check_id: 'endpoint', status: 'failed', code: 'endpoint_scheme_unsupported' };
  } catch {
    return { check_id: 'endpoint', status: 'failed', code: 'endpoint_invalid' };
  }
}

export async function testOplConnection(connectionId: string) {
  return withConnectionStateLock(() => testOplConnectionLocked(connectionId));
}

async function testOplConnectionLocked(connectionId: string) {
  const store = readConnectionRegistryStore();
  const connection = connectionById(store, requiredString(connectionId, 'connection_id'));
  const checkedAt = new Date().toISOString();
  const credential = checkCredentialHandle(connection.credential_handle);
  const checks: OplConnectionCheck[] = [
    { check_id: 'credential_handle', ...credential },
    endpointCheck(connection.endpoint),
  ];
  const status = connection.status === 'disabled'
    ? 'disabled' as const
    : checks.every((check) => check.status === 'passed')
      ? 'ready' as const
      : 'attention_needed' as const;
  connection.status = status;
  connection.status_code = status === 'ready'
    ? 'configuration_checks_passed'
    : status === 'disabled'
      ? 'connection_disabled'
      : checks.find((check) => check.status === 'failed')?.code ?? 'configuration_check_failed';
  connection.last_tested_at = checkedAt;
  connection.updated_at = checkedAt;
  persist(store, connection);
  return {
    connection_test: {
      surface_kind: 'opl_connection_test_result.v1',
      connection_id: connection.connection_id,
      status,
      checked_at: checkedAt,
      checks,
      runtime_readiness_claimed: false,
    },
  };
}
