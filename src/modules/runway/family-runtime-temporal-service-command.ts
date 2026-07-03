import { DatabaseSync } from 'node:sqlite';

import { FrameworkContractError } from '../charter/index.ts';
import type { FamilyRuntimeCommandInput } from './family-runtime-command.ts';
import { resolveFamilyRuntimeProviderKind } from './family-runtime-providers.ts';
import {
  inspectTemporalServiceLifecycle,
  startTemporalServiceLifecycle,
  stopTemporalServiceLifecycle,
} from './family-runtime-temporal-service.ts';
import { insertEvent, type familyRuntimePaths } from './family-runtime-store.ts';

type TemporalServiceCommandInput = Extract<
  FamilyRuntimeCommandInput,
  { mode: 'service_start' | 'service_status' | 'service_stop' }
>;

type RuntimePaths = ReturnType<typeof familyRuntimePaths>;

function assertTemporalProvider(providerKind: string) {
  if (providerKind !== 'temporal') {
    throw new FrameworkContractError(
      'cli_usage_error',
      'family-runtime service lifecycle currently supports only --provider temporal.',
      {
        provider_kind: providerKind,
        allowed_provider_kinds: ['temporal'],
      },
    );
  }
}

export async function runTemporalServiceCommand(
  db: DatabaseSync,
  paths: RuntimePaths,
  parsed: TemporalServiceCommandInput,
) {
  const providerKind = resolveFamilyRuntimeProviderKind(parsed.providerKind);
  assertTemporalProvider(providerKind);

  if (parsed.mode === 'service_status') {
    return {
      version: 'g2',
      family_runtime_service: {
        surface_id: 'opl_family_runtime_service',
        action: 'status',
        ...(await inspectTemporalServiceLifecycle(paths)),
      },
    };
  }

  if (parsed.mode === 'service_start') {
    const result = await startTemporalServiceLifecycle(paths, { detach: parsed.detach });
    insertEvent(db, {
      eventType: 'temporal_service_start',
      source: 'opl-cli',
      payload: {
        service_status: result.status.service_status,
        start_status: result.start_status,
        pid: result.status.managed_service_pid,
      },
    });
    return {
      version: 'g2',
      family_runtime_service: {
        surface_id: 'opl_family_runtime_service',
        action: 'start',
        ...result,
      },
    };
  }

  const result = await stopTemporalServiceLifecycle(paths);
  insertEvent(db, {
    eventType: 'temporal_service_stop',
    source: 'opl-cli',
    payload: {
      stop_status: result.stop_status,
      stopped_pid: result.stopped_pid,
      service_status: result.status.service_status,
    },
  });
  return {
    version: 'g2',
    family_runtime_service: {
      surface_id: 'opl_family_runtime_service',
      action: 'stop',
      ...result,
    },
  };
}
