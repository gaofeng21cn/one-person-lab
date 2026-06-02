import {
  assert,
} from '../helpers.ts';
import type {
  runTemporalProviderSloTick,
} from '../../../../src/family-runtime-provider-slo-executor.ts';

type ProviderSloTick = Awaited<ReturnType<typeof runTemporalProviderSloTick>>;

export type TemporalWorkerLivenessBlocker = {
  liveness_blocker_first?: unknown;
  blocker_id: string;
  worker_lifecycle_status: string;
  temporal_service_status: string;
  next_repair_command: string;
  next_repair_action: {
    action_id: string;
  };
};

export function assertTemporalWorkerLivenessBlocker(
  blocker: unknown,
): asserts blocker is TemporalWorkerLivenessBlocker {
  assert.equal((blocker as { liveness_blocker_first?: unknown }).liveness_blocker_first, true);
}

export function assertBlockedSchedulerTick(tick: unknown): asserts tick is {
  provider_kind: 'temporal';
  provider_slo: ProviderSloTick;
  provider_liveness_blocker: TemporalWorkerLivenessBlocker;
  queue_tick: {
    status: 'blocked_provider_not_ready';
    dispatch_blocked_reason: string;
    selected_count: number;
    dispatches: unknown[];
  };
} {
  assert.equal((tick as { status?: unknown }).status, 'blocked_provider_not_ready');
}
