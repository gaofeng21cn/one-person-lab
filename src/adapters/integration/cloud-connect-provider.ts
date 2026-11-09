import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { createOplConnection, listOplConnections, updateOplConnection } from './connection-registry.ts';
import type { OplConnection } from './connection-registry-parts/types.ts';
import {
  OplConnectionProviderError,
  type OplConnectionProvider,
  type OplConnectionProviderErrorDisposition,
} from './connection-authorization.ts';

const PROVIDER_ID = 'opl-cloud';
const HANDLE_PREFIX = 'provider:opl-cloud:';
const REF = /^cloud:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const REVISION = /^rev:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CAPABILITIES: Record<string, string> = {
  cloud_list_compute_plans: 'Read Cloud compute plans',
  cloud_list_storage_plans: 'Read Cloud storage plans',
  cloud_list_workspaces: 'Read Cloud Workspaces',
  cloud_get_quote: 'Read an exact Cloud quote',
  cloud_get_workspace: 'Read an exact Cloud Workspace',
  cloud_get_workspace_operation: 'Read the original Cloud Workspace operation',
};

export type CloudConnectRequest = Record<string, unknown> & {
  schema_version: 'opl-cloud-connect.v1';
  operation: 'list' | 'inspect' | 'invoke';
};
export type CloudConnectCommandRunner = (input: { binary: string; request: CloudConnectRequest }) => {
  status: number | null;
  stdout: string;
  error_code?: string | null;
};
type Options = { binary?: string; runner?: CloudConnectCommandRunner };
type Binding = { opaque: string; revision: string };
type CloudMetadata = {
  cloud_ref: string;
  revision: string;
  credential_id: string;
  label: string;
  tenant_id: string | null;
  audience: 'opl-cloud-mcp';
  expires_at: string;
  endpoint: string;
  status: 'ready' | 'attention_needed';
  status_code: 'READY' | 'CREDENTIAL_EXPIRED';
  capabilities: string[];
};

function fail(code: string, disposition: OplConnectionProviderErrorDisposition = 'not_dispatched'): never {
  throw new OplConnectionProviderError(code, disposition);
}

function runCommand({ binary, request }: Parameters<CloudConnectCommandRunner>[0]) {
  const result = spawnSync(binary, ['connect'], {
    input: JSON.stringify(request), encoding: 'utf8', env: process.env,
    maxBuffer: 1024 * 1024, timeout: 35_000,
  });
  return {
    status: result.status,
    stdout: typeof result.stdout === 'string' ? result.stdout : '',
    error_code: result.error && 'code' in result.error ? String(result.error.code) : null,
  };
}

function call(options: Options, operation: CloudConnectRequest['operation'], fields: Record<string, unknown> = {}) {
  let response: ReturnType<CloudConnectCommandRunner>;
  try {
    response = (options.runner ?? runCommand)({
      binary: options.binary ?? process.env.OPL_CLOUD_CONNECT_BINARY ?? 'opl-cloud-connect',
      request: { schema_version: 'opl-cloud-connect.v1', operation, ...fields },
    });
  } catch {
    fail('cloud_helper_spawn_failed');
  }
  const unknown = operation === 'invoke' ? 'unknown_after_dispatch' : 'not_dispatched';
  if (response.error_code) {
    fail('cloud_helper_process_failed', ['ENOENT', 'EACCES', 'EPERM'].includes(response.error_code) ? 'not_dispatched' : unknown);
  }
  let value: unknown;
  try { value = JSON.parse(response.stdout); } catch { fail('cloud_helper_response_invalid', unknown); }
  if (!isRecord(value)) fail('cloud_helper_response_invalid', unknown);
  if (value.ok !== true) {
    const disposition = value.disposition === 'not_dispatched' || value.disposition === 'provider_reported'
      ? value.disposition : unknown;
    // Never propagate a helper's diagnostic text, URLs or credential material.
    const code = isRecord(value.error) && typeof value.error.code === 'string'
      && /^[A-Z][A-Z0-9_]{0,63}$/.test(value.error.code) ? value.error.code : 'cloud_provider_error';
    fail(code, disposition);
  }
  if (response.status !== 0 || value.disposition !== 'completed' || !isRecord(value.result)) {
    fail('cloud_helper_response_invalid', unknown);
  }
  return value.result;
}

function binding(connection: Readonly<OplConnection>): Binding {
  if (connection.connection_type !== PROVIDER_ID || !connection.credential_handle.startsWith(HANDLE_PREFIX)) {
    fail('cloud_connection_handle_invalid');
  }
  let parsed: unknown;
  try { parsed = JSON.parse(decodeURIComponent(connection.credential_handle.slice(HANDLE_PREFIX.length))); }
  catch { fail('cloud_connection_handle_invalid'); }
  if (!isRecord(parsed) || typeof parsed.opaque !== 'string' || !REF.test(parsed.opaque)
    || typeof parsed.revision !== 'string' || !REVISION.test(parsed.revision)
    || Object.keys(parsed).some((key) => key !== 'opaque' && key !== 'revision')) {
    fail('cloud_connection_handle_invalid');
  }
  return { opaque: parsed.opaque, revision: parsed.revision };
}

function metadata(value: unknown): CloudMetadata {
  if (!isRecord(value) || typeof value.cloud_ref !== 'string' || !REF.test(value.cloud_ref)
    || typeof value.revision !== 'string' || !REVISION.test(value.revision)
    || typeof value.credential_id !== 'string' || !value.credential_id || value.credential_id.length > 256
    || typeof value.label !== 'string' || !value.label.trim() || Array.from(value.label).length > 128 || /[\u0000-\u001f\u007f]/.test(value.label)
    || (value.tenant_id !== null && (typeof value.tenant_id !== 'string' || value.tenant_id.length > 256))
    || value.audience !== 'opl-cloud-mcp' || typeof value.expires_at !== 'string' || !Number.isFinite(Date.parse(value.expires_at))
    || typeof value.endpoint !== 'string' || !Array.isArray(value.capabilities)
    || value.capabilities.some((id) => typeof id !== 'string' || !Object.hasOwn(CAPABILITIES, id))
    || (value.status !== 'ready' && value.status !== 'attention_needed')
    || (value.status_code !== 'READY' && value.status_code !== 'CREDENTIAL_EXPIRED')) {
    fail('cloud_helper_metadata_invalid');
  }
  let url: URL;
  try { url = new URL(value.endpoint); } catch { fail('cloud_helper_metadata_invalid'); }
  if (url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')
    || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname)))) {
    fail('cloud_helper_metadata_invalid');
  }
  // Project named metadata fields only; helper credentials never enter Connect.
  return {
    cloud_ref: value.cloud_ref, revision: value.revision, credential_id: value.credential_id,
    label: value.label, tenant_id: value.tenant_id as string | null, audience: 'opl-cloud-mcp',
    expires_at: value.expires_at, endpoint: value.endpoint, status: value.status,
    status_code: value.status_code, capabilities: value.capabilities as string[],
  };
}

function inspect(options: Options, credential: Binding) {
  const result = metadata(call(options, 'inspect', { credential_handle: credential }).connection);
  if (result.cloud_ref !== credential.opaque || result.revision !== credential.revision) fail('cloud_connection_revision_changed');
  return result;
}

function validateInput(capability: string, input: Record<string, unknown>) {
  if (!Object.hasOwn(CAPABILITIES, capability)) fail('cloud_capability_unavailable');
  const fields = capability.startsWith('cloud_list_') ? ['cursor', 'limit'] : ['id', 'expectedRevision'];
  if (Object.keys(input).some((key) => !fields.includes(key))) fail('cloud_input_invalid');
  if (capability.startsWith('cloud_list_')) {
    if ((input.cursor !== undefined && (typeof input.cursor !== 'string' || input.cursor.length > 4096))
      || (input.limit !== undefined && (!Number.isInteger(input.limit) || Number(input.limit) < 1 || Number(input.limit) > 100))) fail('cloud_input_invalid');
  } else if (typeof input.id !== 'string' || !input.id.trim() || input.id.length > 256
    || (input.expectedRevision !== undefined && (typeof input.expectedRevision !== 'string' || input.expectedRevision.length > 256))) {
    fail('cloud_input_invalid');
  }
  return input;
}

export function createOplCloudConnectionProvider(options: Options = {}): OplConnectionProvider {
  return Object.freeze({
    provider_id: PROVIDER_ID,
    listCapabilities(connection) {
      const current = inspect(options, binding(connection));
      if (current.status !== 'ready' || Date.parse(current.expires_at) <= Date.now()) return [];
      return current.capabilities.map((id) => ({ capability_id: id, title: CAPABILITIES[id]!, risk: 'read' as const }));
    },
    async invoke(input) {
      return call(options, 'invoke', {
        credential_handle: binding(input.connection), capability: input.capability_id,
        input: validateInput(input.capability_id, input.input),
      });
    },
  });
}

export function listOplCloudProviderConnections(options: Options = {}) {
  const connections = call(options, 'list').connections;
  if (!Array.isArray(connections)) fail('cloud_helper_metadata_invalid');
  return { connections: connections.map(metadata) };
}

export function importOplCloudConnection(cloudRef: string, options: Options = {}) {
  if (!REF.test(cloudRef)) {
    throw new FrameworkContractError('cli_usage_error', 'Cloud connection reference is invalid.', { reason_code: 'cloud_ref_invalid' });
  }
  const listed = listOplCloudProviderConnections(options).connections.find((entry) => entry.cloud_ref === cloudRef);
  if (!listed) fail('cloud_connection_unavailable');
  const credential = { opaque: cloudRef, revision: listed.revision };
  const current = inspect(options, credential);
  if (current.status !== 'ready' || Date.parse(current.expires_at) <= Date.now()) fail('cloud_credential_expired');
  const connectionId = `cloud-${createHash('sha256').update(cloudRef).digest('hex')}`;
  const existing = listOplConnections().connections.find((entry) => entry.connection_id === connectionId);
  if (existing && (existing.connection_type !== PROVIDER_ID || !existing.credential_handle.startsWith(HANDLE_PREFIX))) fail('connection_id_conflict');
  const values = {
    name: current.label, connection_type: PROVIDER_ID,
    account_label: current.tenant_id ?? 'Personal Cloud', endpoint: current.endpoint,
    credential_handle: `${HANDLE_PREFIX}${encodeURIComponent(JSON.stringify(credential))}`, disabled: false,
  };
  const result = existing ? updateOplConnection(connectionId, values) : createOplConnection({ connection_id: connectionId, ...values });
  const connection = result.connection_registry.connection!;
  return { connection: {
    connection_id: connection.connection_id, name: connection.name, connection_type: connection.connection_type,
    account_label: connection.account_label, security_revision: connection.security_revision, status: connection.status,
    expires_at: current.expires_at,
  } };
}
