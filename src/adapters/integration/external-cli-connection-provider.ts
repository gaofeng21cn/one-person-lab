import { spawnSync } from 'node:child_process';

import { isRecord } from '../../kernel/contract-validation.ts';
import {
  createOplConnection,
  listOplConnections,
  updateOplConnection,
  type OplConnection,
} from './connection-registry.ts';
import {
  OplConnectionProviderError,
  type OplConnectionProviderErrorDisposition,
} from './connection-authorization.ts';

export type ExternalCliConnectOperation = 'list' | 'inspect' | 'invoke';

export type ExternalCliConnectRequest<TOp extends string = ExternalCliConnectOperation> = Record<string, unknown> & {
  schema_version: string;
  operation: TOp;
};

export type ExternalCliConnectCommandResult = {
  status: number | null;
  stdout: string;
  error_code?: string | null;
};

export type ExternalCliConnectCommandRunner<TReq extends ExternalCliConnectRequest = ExternalCliConnectRequest> = (
  input: {
    binary: string;
    request: TReq;
  },
) => ExternalCliConnectCommandResult;

export type ExternalCliConnectCallOptions<TReq extends ExternalCliConnectRequest = ExternalCliConnectRequest> = {
  binary: string;
  runner: ExternalCliConnectCommandRunner<TReq>;
  request: TReq;
  spawnFailedCode: string;
  processFailedCode: string;
  responseUnavailableCode: string;
  responseInvalidCode: string;
  defaultProviderErrorCode: string;
  allowProviderReportedDisposition?: boolean;
  isAllowedProviderCode?: (code: string) => boolean;
  checkStatusBeforeParse?: boolean;
};

/**
 * Execute an external CLI connection provider command via stdin/stdout JSON.
 * Never logs or persists raw stdout outside structured envelope parsing.
 */
export function runExternalCliConnectCommand<TReq extends ExternalCliConnectRequest>(input: {
  binary: string;
  request: TReq;
  args?: readonly string[];
  timeoutMs?: number;
  maxBuffer?: number;
}): ExternalCliConnectCommandResult {
  const result = spawnSync(input.binary, [...(input.args ?? ['connect'])], {
    encoding: 'utf8',
    env: process.env,
    input: JSON.stringify(input.request),
    maxBuffer: input.maxBuffer ?? 1024 * 1024,
    timeout: input.timeoutMs ?? 35_000,
  });
  return {
    status: result.status,
    stdout: typeof result.stdout === 'string' ? result.stdout : '',
    error_code: result.error && 'code' in result.error && typeof result.error.code === 'string'
      ? result.error.code
      : null,
  };
}

/**
 * Invoke an external CLI connection provider over the shared JSON envelope ABI,
 * mapping process, parse, and provider failures to typed dispositions.
 */
export function callExternalCliConnect<TReq extends ExternalCliConnectRequest>(
  options: ExternalCliConnectCallOptions<TReq>,
): Record<string, unknown> {
  let processResult: ExternalCliConnectCommandResult;
  try {
    processResult = options.runner({ binary: options.binary, request: options.request });
  } catch {
    throw new OplConnectionProviderError(options.spawnFailedCode, 'not_dispatched');
  }

  const unknownDisposition: OplConnectionProviderErrorDisposition =
    options.request.operation === 'invoke' ? 'unknown_after_dispatch' : 'not_dispatched';

  if (processResult.error_code) {
    const disposition: OplConnectionProviderErrorDisposition =
      ['ENOENT', 'EACCES', 'EPERM'].includes(processResult.error_code)
        ? 'not_dispatched'
        : unknownDisposition;
    throw new OplConnectionProviderError(options.processFailedCode, disposition);
  }

  if (options.checkStatusBeforeParse && processResult.status !== 0) {
    throw new OplConnectionProviderError(options.processFailedCode, unknownDisposition);
  }

  let value: unknown;
  try {
    value = JSON.parse(processResult.stdout);
  } catch {
    throw new OplConnectionProviderError(options.responseUnavailableCode, unknownDisposition);
  }

  if (!isRecord(value)) {
    throw new OplConnectionProviderError(options.responseInvalidCode, unknownDisposition);
  }

  if (value.ok !== true) {
    const disposition: OplConnectionProviderErrorDisposition =
      value.disposition === 'not_dispatched'
        || (options.allowProviderReportedDisposition && value.disposition === 'provider_reported')
        ? value.disposition
        : unknownDisposition;
    const rawCode = isRecord(value.error) ? value.error.code : undefined;
    const code = typeof rawCode === 'string'
      && (options.isAllowedProviderCode ? options.isAllowedProviderCode(rawCode) : rawCode.length > 0)
      ? rawCode
      : options.defaultProviderErrorCode;
    throw new OplConnectionProviderError(code, disposition);
  }

  if (
    (!options.checkStatusBeforeParse && processResult.status !== 0)
    || value.disposition !== 'completed'
    || !isRecord(value.result)
  ) {
    throw new OplConnectionProviderError(options.responseInvalidCode, unknownDisposition);
  }

  return value.result;
}

/**
 * Encode an opaque connection binding handle under `<prefix><urlEncodedJson>`.
 */
export function encodeExternalCliCredentialHandle(
  handlePrefix: string,
  binding: Readonly<Record<string, unknown>>,
): string {
  return `${handlePrefix}${encodeURIComponent(JSON.stringify(binding))}`;
}

/**
 * Decode an opaque connection credential handle back into a plain record.
 */
export function decodeExternalCliCredentialHandle(
  handle: string,
  handlePrefix: string,
  invalidHandleCode: string,
): Record<string, unknown> {
  if (!handle.startsWith(handlePrefix)) {
    throw new OplConnectionProviderError(invalidHandleCode, 'not_dispatched');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeURIComponent(handle.slice(handlePrefix.length)));
  } catch {
    throw new OplConnectionProviderError(invalidHandleCode, 'not_dispatched');
  }
  if (!isRecord(parsed)) {
    throw new OplConnectionProviderError(invalidHandleCode, 'not_dispatched');
  }
  return parsed;
}

/**
 * Persist or update an external CLI connection entry after verifying ownership
 * of any existing connection with the same deterministic ID.
 */
export function upsertExternalCliConnection(input: {
  connectionId: string;
  providerId: string;
  handlePrefix: string;
  name: string;
  accountLabel: string | null;
  endpoint: string | null;
  credentialHandle: string;
}): OplConnection {
  const existing = listOplConnections().connections.find(
    (entry) => entry.connection_id === input.connectionId,
  );
  if (
    existing
    && (existing.connection_type !== input.providerId || !existing.credential_handle.startsWith(input.handlePrefix))
  ) {
    throw new OplConnectionProviderError('connection_id_conflict', 'not_dispatched');
  }
  const values = {
    name: input.name,
    connection_type: input.providerId,
    account_label: input.accountLabel,
    endpoint: input.endpoint,
    credential_handle: input.credentialHandle,
    disabled: false,
  };
  const result = existing
    ? updateOplConnection(input.connectionId, values)
    : createOplConnection({ connection_id: input.connectionId, ...values });
  return result.connection_registry.connection!;
}
