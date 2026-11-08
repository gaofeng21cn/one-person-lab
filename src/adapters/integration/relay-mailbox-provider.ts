import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import {
  createOplConnection,
  listOplConnections,
  updateOplConnection,
} from './connection-registry.ts';
import type { OplConnection } from './connection-registry-parts/types.ts';
import {
  OplConnectionProviderError,
  type OplConnectionProvider,
  type OplConnectionProviderErrorDisposition,
} from './connection-authorization.ts';

const RELAY_PROVIDER_ID = 'opl-relay';
const RELAY_HANDLE_PREFIX = 'provider:opl-relay:';
const RELAY_SCHEMA_VERSION = 'opl-relay-connect.v1';
const ALLOWED_CAPABILITIES = ['mailbox.search', 'mailbox.read', 'draft.create'] as const;
const CAPABILITY_TITLES: Record<string, string> = {
  'mailbox.search': 'Search mailbox',
  'mailbox.read': 'Read message',
  'draft.create': 'Create review draft',
};
const CAPABILITY_INPUT_FIELDS: Record<string, ReadonlySet<string>> = {
  'mailbox.search': new Set(['query', 'scope', 'folder', 'limit']),
  'mailbox.read': new Set(['storage_ref']),
  'draft.create': new Set(['storage_ref', 'body', 'request_id']),
};
const RELAY_ERROR_CODES = new Set([
  'INVALID_ARGUMENTS',
  'INVALID_CREDENTIAL_HANDLE',
  'INVALID_REQUEST',
  'MAILBOX_NOT_FOUND',
  'PROVIDER_ERROR',
  'PROVIDER_UNAVAILABLE',
  'STALE_CREDENTIAL_HANDLE',
  'CAPABILITY_UNAVAILABLE',
]);

type RelayEnvelopeDisposition = 'completed' | OplConnectionProviderErrorDisposition;

type RelayEnvelope = {
  ok: boolean;
  disposition: RelayEnvelopeDisposition;
  result?: Record<string, unknown>;
  error?: { code?: unknown };
};

type RelayBinding = { mailbox_ref: string; revision: string };

export type RelayConnectRequest = Record<string, unknown> & {
  schema_version: typeof RELAY_SCHEMA_VERSION;
  operation: 'list' | 'inspect' | 'invoke';
};

export type RelayConnectCommandResult = {
  status: number | null;
  stdout: string;
  error_code?: string | null;
};

export type RelayConnectCommandRunner = (input: {
  binary: string;
  request: RelayConnectRequest;
}) => RelayConnectCommandResult;

function usageError(reasonCode: string): never {
  throw new FrameworkContractError('cli_usage_error', 'Relay mailbox connection is invalid.', {
    reason_code: reasonCode,
  });
}

function runRelayConnectCommand(input: {
  binary: string;
  request: RelayConnectRequest;
}): RelayConnectCommandResult {
  const result = spawnSync(input.binary, ['--json', 'connect'], {
    encoding: 'utf8',
    env: process.env,
    input: JSON.stringify(input.request),
    maxBuffer: 1024 * 1024,
    timeout: 15_000,
  });
  return {
    status: result.status,
    stdout: typeof result.stdout === 'string' ? result.stdout : '',
    error_code: result.error && 'code' in result.error && typeof result.error.code === 'string'
      ? result.error.code
      : null,
  };
}

function safeProviderCode(value: unknown) {
  return typeof value === 'string' && RELAY_ERROR_CODES.has(value)
    ? value
    : 'relay_provider_error';
}

function relayFailure(
  code: string,
  disposition: OplConnectionProviderErrorDisposition,
): never {
  throw new OplConnectionProviderError(code, disposition);
}

function callRelay(
  runner: RelayConnectCommandRunner,
  binary: string,
  request: RelayConnectRequest,
): Record<string, unknown> {
  let processResult: RelayConnectCommandResult;
  try {
    processResult = runner({ binary, request });
  } catch {
    relayFailure('relay_spawn_failed', 'not_dispatched');
  }
  if (processResult.error_code) {
    const disposition = ['ENOENT', 'EACCES', 'EPERM'].includes(processResult.error_code)
      ? 'not_dispatched'
      : 'unknown_after_dispatch';
    relayFailure('relay_process_failed', disposition);
  }
  if (processResult.status !== 0) {
    relayFailure(
      'relay_process_failed',
      request.operation === 'invoke' ? 'unknown_after_dispatch' : 'not_dispatched',
    );
  }

  let value: unknown;
  try {
    value = JSON.parse(processResult.stdout);
  } catch {
    relayFailure(
      'relay_response_unavailable',
      request.operation === 'invoke' ? 'unknown_after_dispatch' : 'not_dispatched',
    );
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    relayFailure(
      'relay_response_invalid',
      request.operation === 'invoke' ? 'unknown_after_dispatch' : 'not_dispatched',
    );
  }
  const envelope = value as RelayEnvelope;
  if (envelope.ok !== true) {
    const disposition = envelope.disposition === 'not_dispatched'
      ? 'not_dispatched'
      : 'unknown_after_dispatch';
    relayFailure(
      safeProviderCode(envelope.error?.code),
      disposition,
    );
  }
  if (envelope.disposition !== 'completed' || !envelope.result
    || typeof envelope.result !== 'object' || Array.isArray(envelope.result)) {
    relayFailure(
      'relay_response_invalid',
      request.operation === 'invoke' ? 'unknown_after_dispatch' : 'not_dispatched',
    );
  }
  return envelope.result;
}

function bindingFromConnection(connection: Readonly<OplConnection>): RelayBinding {
  const handle = connection.credential_handle;
  if (!handle.startsWith(RELAY_HANDLE_PREFIX)) relayFailure('relay_connection_handle_invalid', 'not_dispatched');
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeURIComponent(handle.slice(RELAY_HANDLE_PREFIX.length)));
  } catch {
    relayFailure('relay_connection_handle_invalid', 'not_dispatched');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    relayFailure('relay_connection_handle_invalid', 'not_dispatched');
  }
  const record = parsed as Record<string, unknown>;
  if (typeof record.mailbox_ref !== 'string'
    || !/^relay-mailbox:\/\/[a-f0-9]{64}$/.test(record.mailbox_ref)
    || typeof record.revision !== 'string'
    || !/^[a-f0-9]{64}$/.test(record.revision)) {
    relayFailure('relay_connection_handle_invalid', 'not_dispatched');
  }
  return { mailbox_ref: record.mailbox_ref, revision: record.revision };
}

function makeCredentialHandle(binding: RelayBinding) {
  return `${RELAY_HANDLE_PREFIX}${encodeURIComponent(JSON.stringify(binding))}`;
}

function publicImportedConnection(connection: OplConnection) {
  return {
    connection: {
      connection_id: connection.connection_id,
      display_name: connection.name,
      connection_type: connection.connection_type,
      account_label: connection.account_label,
      security_revision: connection.security_revision,
      status: connection.status,
    },
  };
}

function relayRequest(operation: RelayConnectRequest['operation'], fields: Record<string, unknown> = {}): RelayConnectRequest {
  return { schema_version: RELAY_SCHEMA_VERSION, operation, ...fields };
}

function inspectMailbox(
  runner: RelayConnectCommandRunner,
  binary: string,
  mailboxRef: string,
) {
  const result = callRelay(runner, binary, relayRequest('inspect', { mailbox_ref: mailboxRef }));
  const mailbox = result.mailbox;
  const capabilities = result.capabilities;
  if (!mailbox || typeof mailbox !== 'object' || Array.isArray(mailbox)
    || !Array.isArray(capabilities)) {
    relayFailure('relay_inspect_response_invalid', 'not_dispatched');
  }
  const value = mailbox as Record<string, unknown>;
  if (value.mailbox_ref !== mailboxRef
    || typeof value.email !== 'string' || !value.email.trim()
    || value.email.length > 254 || /[\u0000-\u001f\u007f]/.test(value.email)
    || typeof value.revision !== 'string' || !/^[a-f0-9]{64}$/.test(value.revision)) {
    relayFailure('relay_inspect_response_invalid', 'not_dispatched');
  }
  const availableCapabilities = new Set(capabilities.filter(
    (capability): capability is string => typeof capability === 'string',
  ));
  return {
    email: value.email.trim(),
    revision: value.revision,
    capabilities: availableCapabilities,
  };
}

function validateCapabilityInput(capabilityId: string, value: Record<string, unknown>) {
  const allowed = CAPABILITY_INPUT_FIELDS[capabilityId];
  if (!allowed || Object.keys(value).some((field) => !allowed.has(field))) {
    relayFailure('relay_capability_input_invalid', 'not_dispatched');
  }
  return value;
}

export function createOplRelayMailboxConnectionProvider(options: {
  binary?: string;
  runner?: RelayConnectCommandRunner;
} = {}): OplConnectionProvider {
  const binary = options.binary ?? 'opl-relay';
  const runner = options.runner ?? runRelayConnectCommand;

  return Object.freeze({
    provider_id: RELAY_PROVIDER_ID,
    async listCapabilities(connection) {
      const binding = bindingFromConnection(connection);
      const inspected = inspectMailbox(runner, binary, binding.mailbox_ref);
      if (inspected.revision !== binding.revision) {
        relayFailure('STALE_CREDENTIAL_HANDLE', 'not_dispatched');
      }
      return ALLOWED_CAPABILITIES
        .filter((capabilityId) => inspected.capabilities.has(capabilityId))
        .map((capabilityId) => ({
          capability_id: capabilityId,
          title: CAPABILITY_TITLES[capabilityId],
          risk: capabilityId === 'draft.create' ? 'local_write' as const : 'read' as const,
        }));
    },
    async invoke(input) {
      const binding = bindingFromConnection(input.connection);
      const safeInput = validateCapabilityInput(input.capability_id, input.input);
      if (!ALLOWED_CAPABILITIES.includes(input.capability_id as typeof ALLOWED_CAPABILITIES[number])) {
        relayFailure('CAPABILITY_UNAVAILABLE', 'not_dispatched');
      }
      const result = callRelay(runner, binary, relayRequest('invoke', {
        credential_handle: { opaque: binding.mailbox_ref, revision: binding.revision },
        capability: input.capability_id,
        input: safeInput,
      }));
      return result;
    },
  });
}

export function importOplRelayMailboxConnection(
  mailboxRef: string,
  options: {
    binary?: string;
    runner?: RelayConnectCommandRunner;
  } = {},
) {
  if (typeof mailboxRef !== 'string' || !/^relay-mailbox:\/\/[a-f0-9]{64}$/.test(mailboxRef)) {
    usageError('relay_mailbox_ref_invalid');
  }
  const binary = options.binary ?? 'opl-relay';
  const runner = options.runner ?? runRelayConnectCommand;
  const listed = callRelay(runner, binary, relayRequest('list'));
  const mailboxes = listed.mailboxes;
  if (!Array.isArray(mailboxes)) relayFailure('relay_list_response_invalid', 'not_dispatched');
  const entry = mailboxes.find((value) => value && typeof value === 'object'
    && !Array.isArray(value) && (value as Record<string, unknown>).mailbox_ref === mailboxRef);
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    relayFailure('MAILBOX_NOT_FOUND', 'not_dispatched');
  }
  const safeEntry = entry as Record<string, unknown>;
  const inspected = inspectMailbox(runner, binary, mailboxRef);
  if (safeEntry.revision !== inspected.revision || safeEntry.email !== inspected.email) {
    relayFailure('STALE_CREDENTIAL_HANDLE', 'not_dispatched');
  }

  const connectionId = `relay-mailbox-${createHash('sha256').update(mailboxRef).digest('hex')}`;
  const credentialHandle = makeCredentialHandle({ mailbox_ref: mailboxRef, revision: inspected.revision });
  const existing = listOplConnections().connections.find((connection) => connection.connection_id === connectionId);
  if (existing && (existing.connection_type !== RELAY_PROVIDER_ID
    || !existing.credential_handle.startsWith(RELAY_HANDLE_PREFIX))) {
    relayFailure('connection_id_conflict', 'not_dispatched');
  }
  if (existing) {
    const result = updateOplConnection(connectionId, {
      name: inspected.email,
      connection_type: RELAY_PROVIDER_ID,
      account_label: inspected.email,
      endpoint: null,
      credential_handle: credentialHandle,
      disabled: false,
    });
    return publicImportedConnection(result.connection_registry.connection!);
  }
  const result = createOplConnection({
    connection_id: connectionId,
    name: inspected.email,
    connection_type: RELAY_PROVIDER_ID,
    account_label: inspected.email,
    endpoint: null,
    credential_handle: credentialHandle,
  });
  return publicImportedConnection(result.connection_registry.connection!);
}
