import { KernelError, toErrorMessage } from '@opl/core';
import { ChannelError, ConnectError } from '@opl/connect';
import { LedgerError } from '@opl/ledger';
import { PackError } from '@opl/pack';
import { RunwayError } from '@opl/runway';
import { WorkspaceError } from '@opl/workspace';

export class DaemonRpcError extends Error {
  readonly rpcCode: number;
  readonly errorCode: string;
  readonly data: Record<string, unknown>;

  constructor(
    rpcCode: number,
    errorCode: string,
    message: string,
    data: Record<string, unknown> = {},
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'DaemonRpcError';
    this.rpcCode = rpcCode;
    this.errorCode = errorCode;
    this.data = data;
  }
}

export interface JsonRpcErrorPayload {
  readonly code: number;
  readonly message: string;
  readonly data?: Record<string, unknown>;
}

export function toJsonRpcError(error: unknown): JsonRpcErrorPayload {
  if (error instanceof DaemonRpcError) {
    return {
      code: error.rpcCode,
      message: error.message.includes(error.errorCode)
        ? error.message
        : `${error.errorCode}: ${error.message}`,
      data: { code: error.errorCode, ...error.data },
    };
  }

  if (error instanceof ConnectError) {
    return {
      code: error.rpcCode,
      message: `${error.code}: ${error.message}`,
      data: {
        code: error.code,
        reason_code: error.reason_code,
        disposition: error.disposition,
        ...error.details,
      },
    };
  }

  if (error instanceof PackError) {
    return {
      code: error.rpcCode,
      message: `${error.code}: ${error.message}`,
      data: {
        code: error.code,
        ...error.details,
      },
    };
  }

  if (error instanceof LedgerError) {
    const rpcCode =
      error.code === 'INVALID_LEDGER_INPUT' || error.code === 'REFS_ONLY_VIOLATION'
        ? -32602
        : error.code === 'TASK_NOT_FOUND'
            || error.code === 'STAGE_RUN_NOT_FOUND'
            || error.code === 'ATTEMPT_NOT_FOUND'
          ? -32004
          : -32000;
    return {
      code: rpcCode,
      message: `${error.code}: ${error.message}`,
      data: {
        code: error.code,
        ...error.details,
      },
    };
  }

  if (error instanceof KernelError) {
    const rpcCode =
      error.code === 'UNAUTHORIZED_CLIENT'
        ? -32003
        : error.code === 'REVISION_CONFLICT'
          ? -32009
          : error.code === 'INVALID_INPUT'
            ? -32602
            : error.code === 'LOCK_CONTENTION'
              ? -32000
              : -32000;
    return {
      code: rpcCode,
      message: `${error.code}: ${error.message}`,
      data: {
        code: error.code,
        ...error.details,
      },
    };
  }

  if (error instanceof WorkspaceError) {
    return {
      code: error.rpcCode,
      message: `${error.code}: ${error.message}`,
      data: {
        code: error.code,
        ...error.details,
      },
    };
  }

  if (error instanceof RunwayError) {
    return {
      code: error.rpcCode,
      message: `${error.code}: ${error.message}`,
      data: {
        code: error.code,
        ...error.details,
      },
    };
  }

  if (error instanceof ChannelError) {
    const rpcCode =
      error.code === 'CHANNEL_INVALID_INPUT'
        ? -32602
        : error.code === 'CHANNEL_PROVIDER_UNAVAILABLE'
            || error.code === 'CHANNEL_ACCESS_UNDECLARED'
            || error.code === 'COMPANION_BLOB_UNAVAILABLE'
          ? -32004
          : error.code === 'CHANNEL_CONFIRMATION_REQUIRED'
              || error.code === 'CHANNEL_IDENTITY_MISMATCH'
              || error.code === 'CHANNEL_AUTH_ERROR'
              || error.code === 'CHANNEL_DIGEST_MISMATCH'
            ? -32003
            : -32000;
    return {
      code: rpcCode,
      message: `${error.code}: ${error.message}`,
      data: {
        code: error.code,
        ...(error.reason ? { reason: error.reason } : {}),
      },
    };
  }

  const msg = toErrorMessage(error);
  return {
    code: -32000,
    message: msg,
    data: { code: 'INTERNAL_ERROR' },
  };
}

export function mapErrorToCliExitCode(error: unknown): number {
  const rpc = toJsonRpcError(error);
  const codeStr = typeof rpc.data?.code === 'string' ? rpc.data.code : '';
  if (codeStr === 'TASK_PAUSED_BY_HUMAN' || codeStr === 'HUMAN_GATE_REQUIRED') {
    return 4;
  }

  if (
    rpc.code === -32001
    || rpc.code === -32003
    || /UNAUTHORIZED|TRUSTED_HOST_REQUIRED|HANDSHAKE_REQUIRED|BIND_TOKEN|GRANT_|CONSUMER_DIGEST|CONNECTION_DISABLED|CAPABILITY_/i.test(
      `${codeStr} ${rpc.message}`,
    )
  ) {
    return 3;
  }

  if (
    rpc.code === -32602
    || rpc.code === -32601
    || codeStr === 'INVALID_MANIFEST'
    || codeStr === 'INVALID_INPUT'
    || codeStr === 'INVALID_PATH'
    || codeStr === 'FILE_TOO_LARGE'
    || codeStr === 'INVALID_LEDGER_INPUT'
    || codeStr === 'INVALID_TASK_STATE'
    || codeStr === 'INVALID_STAGE_STATE'
    || codeStr === 'PACK_MISSING_PATH'
    || codeStr === 'PACK_SYMLINK_ESCAPE'
    || codeStr === 'PACK_ARCHIVE_INVALID'
    || codeStr === 'PACK_MIGRATION_FAILED'
    || codeStr === 'METHOD_NOT_FOUND'
  ) {
    return 2;
  }

  return 1;
}
