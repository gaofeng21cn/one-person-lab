import { Client, Connection } from '@temporalio/client';

import { FrameworkContractError } from './contracts.ts';
import { resolveTemporalNamespace } from './family-runtime-temporal.ts';
import { resolveTemporalAddressForPaths } from './family-runtime-temporal-service.ts';
import type { familyRuntimePaths } from './family-runtime-store.ts';

export type TemporalWorkerPaths = Pick<ReturnType<typeof familyRuntimePaths>, 'root'>;

export type TemporalClientOptions = {
  paths?: TemporalWorkerPaths;
  addressOverride?: string | null;
};

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
  const connection = await Connection.connect({ address: resolvedAddress || requireTemporalAddress() });
  try {
    return await fn(new Client({ connection, namespace: resolveTemporalNamespace() }), connection);
  } finally {
    await connection.close();
  }
}
