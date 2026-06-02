import { Client, Connection } from '@temporalio/client';

import { FrameworkContractError } from './contracts.ts';
import { resolveTemporalNamespace } from './family-runtime-temporal.ts';
import { resolveTemporalAddressForPaths } from './family-runtime-temporal-service.ts';
import type { familyRuntimePaths } from './family-runtime-store.ts';

export type TemporalWorkerPaths = Pick<ReturnType<typeof familyRuntimePaths>, 'root'>;

export type TemporalClientOptions = {
  paths?: TemporalWorkerPaths;
  addressOverride?: string | null;
  connectTimeoutMs?: number;
  rpcTimeoutMs?: number;
};

export const DEFAULT_TEMPORAL_CLIENT_CONNECT_TIMEOUT_MS = 3_000;
export const DEFAULT_TEMPORAL_CLIENT_RPC_TIMEOUT_MS = 3_000;

export function resolveTemporalClientConnectTimeoutMs() {
  const raw = process.env.OPL_TEMPORAL_CLIENT_CONNECT_TIMEOUT_MS?.trim();
  if (!raw) {
    return DEFAULT_TEMPORAL_CLIENT_CONNECT_TIMEOUT_MS;
  }
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_TEMPORAL_CLIENT_CONNECT_TIMEOUT_MS;
}

export function resolveTemporalClientRpcTimeoutMs() {
  const raw = process.env.OPL_TEMPORAL_CLIENT_RPC_TIMEOUT_MS?.trim();
  if (!raw) {
    return DEFAULT_TEMPORAL_CLIENT_RPC_TIMEOUT_MS;
  }
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_TEMPORAL_CLIENT_RPC_TIMEOUT_MS;
}

export async function withTemporalRpcDeadline<T>(
  client: Client,
  fn: () => Promise<T>,
  options: TemporalClientOptions = {},
) {
  const timeoutMs = options.rpcTimeoutMs ?? resolveTemporalClientRpcTimeoutMs();
  return await client.withDeadline(Date.now() + timeoutMs, fn);
}

export function requireTemporalAddress() {
  const address = process.env.OPL_TEMPORAL_ADDRESS?.trim() || process.env.TEMPORAL_ADDRESS?.trim() || null;
  if (!address) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Temporal provider start/query/signal requires OPL_TEMPORAL_ADDRESS or TEMPORAL_ADDRESS.',
      {
        required_env: ['OPL_TEMPORAL_ADDRESS'],
        provider_kind: 'temporal',
      },
    );
  }
  return address;
}

export async function withTemporalClient<T>(
  fn: (client: Client, connection: Connection) => Promise<T>,
  options: TemporalClientOptions = {},
) {
  const resolvedAddress = options.addressOverride
    ?? (options.paths ? resolveTemporalAddressForPaths(options.paths).address : null);
  const connection = await Connection.connect({
    address: resolvedAddress || requireTemporalAddress(),
    connectTimeout: options.connectTimeoutMs ?? resolveTemporalClientConnectTimeoutMs(),
  });
  try {
    return await fn(new Client({ connection, namespace: resolveTemporalNamespace() }), connection);
  } finally {
    await connection.close();
  }
}
