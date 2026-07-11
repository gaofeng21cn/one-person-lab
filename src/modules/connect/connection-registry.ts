import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import {
  assertCredentialHandleOnlyPayload,
  checkCredentialHandle,
  normalizeCredentialHandle,
} from './connection-registry-parts/credential-handle.ts';
import {
  readConnectionRegistryStore,
  writeConnectionRegistryStore,
} from './connection-registry-parts/store.ts';
import {
  OPL_CONNECTION_STATUSES,
  type CreateOplConnectionInput,
  type OplConnection,
  type OplConnectionCheck,
  type OplConnectionRegistryStore,
  type UpdateOplConnectionInput,
} from './connection-registry-parts/types.ts';

function usageError(message: string, reasonCode: string, details: Record<string, unknown> = {}) {
  return new FrameworkContractError('cli_usage_error', message, {
    reason_code: reasonCode,
    ...details,
  });
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
      allowed_credential_handles: ['env:NAME', 'codex:selected_provider'],
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
    endpoint: typeof input.endpoint === 'string' && input.endpoint.trim() ? input.endpoint.trim() : null,
    credential_handle: normalizeCredentialHandle(input.credential_handle),
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
  assertCredentialHandleOnlyPayload(input);
  const store = readConnectionRegistryStore();
  const connection = connectionById(store, requiredString(connectionId, 'connection_id'));
  if (input.name !== undefined) connection.name = requiredString(input.name, 'name');
  if (input.connection_type !== undefined) {
    connection.connection_type = requiredString(input.connection_type, 'connection_type');
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
  connection.status = disabled ? 'disabled' : 'untested';
  connection.status_code = disabled ? 'connection_disabled' : null;
  connection.updated_at = new Date().toISOString();
  connection.last_tested_at = null;
  return persist(store, connection);
}

export function deleteOplConnection(connectionId: string) {
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

export type {
  CreateOplConnectionInput,
  OplConnection,
  OplConnectionStatus,
  UpdateOplConnectionInput,
} from './connection-registry-parts/types.ts';
