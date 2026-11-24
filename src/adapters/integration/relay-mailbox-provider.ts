import { createHash } from 'node:crypto';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import type { OplConnection } from './connection-registry.ts';
import {
  OplConnectionProviderError,
  type OplConnectionProvider,
  type OplConnectionProviderErrorDisposition,
} from './connection-authorization.ts';
import {
  callExternalCliConnect,
  decodeExternalCliCredentialHandle,
  encodeExternalCliCredentialHandle,
  runExternalCliConnectCommand,
  upsertExternalCliConnection,
  type ExternalCliConnectCommandResult,
  type ExternalCliConnectCommandRunner,
  type ExternalCliConnectRequest,
} from './external-cli-connection-provider.ts';

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

type RelayBinding = { mailbox_ref: string; revision: string };

export type RelayConnectRequest = ExternalCliConnectRequest<'list' | 'inspect' | 'invoke'> & {
  schema_version: typeof RELAY_SCHEMA_VERSION;
};

export type RelayConnectCommandResult = ExternalCliConnectCommandResult;

export type RelayConnectCommandRunner = ExternalCliConnectCommandRunner<RelayConnectRequest>;

function usageError(reasonCode: string): never {
  throw new FrameworkContractError('cli_usage_error', 'Relay mailbox connection is invalid.', {
    reason_code: reasonCode,
  });
}

function runRelayConnectCommand(input: {
  binary: string;
  request: RelayConnectRequest;
}): RelayConnectCommandResult {
  return runExternalCliConnectCommand({
    binary: input.binary,
    request: input.request,
    args: ['--json', 'connect'],
    timeoutMs: input.request.operation === 'list' ? 1_500 : 15_000,
  });
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
  return callExternalCliConnect({
    binary,
    runner,
    request,
    spawnFailedCode: 'relay_spawn_failed',
    processFailedCode: 'relay_process_failed',
    responseUnavailableCode: 'relay_response_unavailable',
    responseInvalidCode: 'relay_response_invalid',
    defaultProviderErrorCode: 'relay_provider_error',
    allowProviderReportedDisposition: false,
    checkStatusBeforeParse: true,
    isAllowedProviderCode: (code) => RELAY_ERROR_CODES.has(code),
  });
}

function bindingFromConnection(connection: Readonly<OplConnection>): RelayBinding {
  const record = decodeExternalCliCredentialHandle(
    connection.credential_handle,
    RELAY_HANDLE_PREFIX,
    'relay_connection_handle_invalid',
  );
  if (typeof record.mailbox_ref !== 'string'
    || !/^relay-mailbox:\/\/[a-f0-9]{64}$/.test(record.mailbox_ref)
    || typeof record.revision !== 'string'
    || !/^[a-f0-9]{64}$/.test(record.revision)) {
    relayFailure('relay_connection_handle_invalid', 'not_dispatched');
  }
  return { mailbox_ref: record.mailbox_ref, revision: record.revision };
}

function makeCredentialHandle(binding: RelayBinding) {
  return encodeExternalCliCredentialHandle(RELAY_HANDLE_PREFIX, binding);
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

/** Read only Relay-owned local account metadata; never probes remote mail or reads credentials. */
export function listOplRelayMailboxConnections(options: {
  binary?: string;
  runner?: RelayConnectCommandRunner;
} = {}) {
  try {
    const result = callRelay(options.runner ?? runRelayConnectCommand, options.binary ?? 'opl-relay', relayRequest('list'));
    if (!Array.isArray(result.mailboxes) || result.mailboxes.length > 100) {
      relayFailure('relay_list_response_invalid', 'not_dispatched');
    }
    const connections = result.mailboxes.map((value) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) relayFailure('relay_list_response_invalid', 'not_dispatched');
      const entry = value as Record<string, unknown>;
      if (typeof entry.mailbox_ref !== 'string' || !/^relay-mailbox:\/\/[a-f0-9]{64}$/.test(entry.mailbox_ref)
        || typeof entry.email !== 'string' || !entry.email.trim() || entry.email.length > 240
        || /[\u0000-\u001f\u007f]/.test(entry.email)) relayFailure('relay_list_response_invalid', 'not_dispatched');
      return {
        mailbox_ref: entry.mailbox_ref,
        display_name: entry.email,
        account_label: entry.email,
        provider_type: RELAY_PROVIDER_ID,
      };
    });
    if (new Set(connections.map((entry) => entry.mailbox_ref)).size !== connections.length) {
      relayFailure('relay_list_response_invalid', 'not_dispatched');
    }
    return { available_connections: connections, available_connections_status: 'available' as const };
  } catch {
    return {
      available_connections: [],
      available_connections_status: 'unavailable' as const,
      available_connections_reason: 'relay_local_connections_unavailable',
    };
  }
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
  return publicImportedConnection(upsertExternalCliConnection({
    connectionId,
    providerId: RELAY_PROVIDER_ID,
    handlePrefix: RELAY_HANDLE_PREFIX,
    name: inspected.email,
    accountLabel: inspected.email,
    endpoint: null,
    credentialHandle,
  }));
}
