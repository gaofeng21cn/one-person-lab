import { Client, Connection } from '@temporalio/client';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { resolveTemporalNamespace } from './family-runtime-temporal.ts';
import { resolveTemporalAddressForPaths } from './family-runtime-temporal-service.ts';
import {
  processIsAlive,
  readTemporalWorkerState,
} from './family-runtime-temporal-provider-parts/worker-state.ts';
import type { familyRuntimePaths } from './family-runtime-store.ts';

export type TemporalWorkerPaths = Pick<ReturnType<typeof familyRuntimePaths>, 'root'>;

export type TemporalClientOptions = {
  paths?: TemporalWorkerPaths;
  addressOverride?: string | null;
  namespaceOverride?: string | null;
  connectTimeoutMs?: number;
  rpcTimeoutMs?: number;
};

const DEFAULT_TEMPORAL_CLIENT_CONNECT_TIMEOUT_MS = 3_000;
const DEFAULT_TEMPORAL_CLIENT_RPC_TIMEOUT_MS = 3_000;

function resolveTemporalClientConnectTimeoutMs() {
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

export function resolveTemporalClientNamespace(options: {
  paths?: TemporalWorkerPaths;
  addressOverride?: string | null;
  namespaceOverride?: string | null;
  env?: NodeJS.ProcessEnv;
} = {}) {
  const env = options.env ?? process.env;
  const explicitNamespace = options.namespaceOverride?.trim()
    || env.OPL_TEMPORAL_NAMESPACE?.trim();
  if (explicitNamespace) {
    return explicitNamespace;
  }
  const workerState = options.paths ? readTemporalWorkerState(options.paths) : null;
  const resolvedAddress = options.addressOverride
    ?? (options.paths ? resolveTemporalAddressForPaths(options.paths, env).address : null);
  if (
    workerState?.namespace
    && workerState.status !== 'exited'
    && processIsAlive(workerState.pid)
    && (!resolvedAddress || workerState.address === resolvedAddress)
  ) {
    return workerState.namespace;
  }
  return options.env ? 'default' : resolveTemporalNamespace();
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
    return await fn(new Client({
      connection,
      namespace: resolveTemporalClientNamespace(options),
    }), connection);
  } finally {
    await connection.close();
  }
}

type DurableTemporalClient = {
  client: Client;
  connection: Connection;
};

const durableTemporalClients = new Map<string, Promise<DurableTemporalClient>>();

function durableTemporalClientIdentity(options: TemporalClientOptions) {
  const address = options.addressOverride
    ?? (options.paths ? resolveTemporalAddressForPaths(options.paths).address : null)
    ?? requireTemporalAddress();
  const namespace = resolveTemporalClientNamespace(options);
  const connectTimeout = options.connectTimeoutMs ?? resolveTemporalClientConnectTimeoutMs();
  return {
    address,
    namespace,
    connectTimeout,
    key: JSON.stringify([address, namespace, connectTimeout]),
  };
}

export async function withDurableTemporalClient<T>(
  fn: (client: Client, connection: Connection) => Promise<T>,
  options: TemporalClientOptions = {},
) {
  const identity = durableTemporalClientIdentity(options);
  let pending = durableTemporalClients.get(identity.key);
  if (!pending) {
    pending = Connection.connect({
      address: identity.address,
      connectTimeout: identity.connectTimeout,
    }).then((connection) => ({
      connection,
      client: new Client({ connection, namespace: identity.namespace }),
    }));
    durableTemporalClients.set(identity.key, pending);
    pending.catch(() => {
      if (durableTemporalClients.get(identity.key) === pending) {
        durableTemporalClients.delete(identity.key);
      }
    });
  }
  const durable = await pending;
  return fn(durable.client, durable.connection);
}

export async function closeDurableTemporalClients() {
  const pending = [...durableTemporalClients.values()];
  durableTemporalClients.clear();
  await Promise.all(pending.map(async (entry) => {
    try {
      await (await entry).connection.close();
    } catch {
      // Failed connection attempts own no live channel to close.
    }
  }));
}
