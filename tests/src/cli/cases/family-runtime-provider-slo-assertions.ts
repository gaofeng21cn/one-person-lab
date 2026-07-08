import {
  assert,
} from '../helpers.ts';
import type {
  runTemporalProviderSloTick,
} from '../../../../src/modules/runway/family-runtime-provider-slo-executor.ts';

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

export function assertBlockedProviderCadenceReadback(tick: unknown): asserts tick is {
  provider_kind: 'temporal';
  provider_slo: ProviderSloTick;
  provider_liveness_blocker: TemporalWorkerLivenessBlocker;
  retired_queue_tick: null;
  queue_projection_bridge: {
    bridge_status: 'blocked_provider_not_ready';
    blocked_reason: string | null;
    local_queue_runtime_retired: boolean;
    durable_lifecycle_truth: boolean;
    can_authorize_lifecycle_progress: boolean;
  };
} {
  assert.equal((tick as { status?: unknown }).status, 'blocked_provider_not_ready');
}
