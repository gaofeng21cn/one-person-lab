import type { ClientContext } from '@opl/core';
import { DaemonRpcError } from '../errors.ts';
import type { SocketConnectionState } from '../server/socket-server.ts';

export function requireClientContext(conn: SocketConnectionState): ClientContext {
  if (!conn.clientContext) {
    throw new DaemonRpcError(-32001, 'HANDSHAKE_REQUIRED', 'Handshake required.');
  }
  return conn.clientContext;
}

export function requireTrustedHost(conn: SocketConnectionState, action: string): ClientContext {
  const ctx = requireClientContext(conn);
  if (!ctx.trusted_host) {
    throw new DaemonRpcError(
      -32003,
      'TRUSTED_HOST_REQUIRED',
      `Action '${action}' requires a trusted host client (opl_app or opl_cli).`,
      { client_kind: ctx.client_kind, action },
    );
  }
  return ctx;
}

export function resolveSocketSessionId(
  conn: SocketConnectionState,
  explicitSessionId: string | undefined,
): string {
  const ctx = requireClientContext(conn);
  if (explicitSessionId && explicitSessionId !== ctx.session_id) {
    throw new DaemonRpcError(
      -32001,
      'BIND_TOKEN_SESSION_MISMATCH',
      'Caller session_id does not match authenticated socket session.',
    );
  }
  return ctx.session_id;
}
