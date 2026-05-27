type TemporalProviderModule = typeof import('./family-runtime-temporal-provider.ts');
type TemporalWorkerLifecycle = Awaited<ReturnType<TemporalProviderModule['inspectTemporalWorkerLifecycle']>>;
type TemporalWorkerPaths = Parameters<TemporalProviderModule['inspectTemporalWorkerLifecycle']>[0];

type TemporalWorkerLifecycleStart = Awaited<ReturnType<TemporalProviderModule['startTemporalWorkerLifecycle']>>;
type TemporalWorkerLifecycleStop = Awaited<ReturnType<TemporalProviderModule['stopTemporalWorkerLifecycle']>>;

export type TemporalWorkerRepairTrigger = 'provider_repair' | 'provider_slo_tick';

export type TemporalWorkerRepairDeps = {
  inspectTemporalWorkerLifecycle?: TemporalProviderModule['inspectTemporalWorkerLifecycle'];
  startTemporalWorkerLifecycle?: TemporalProviderModule['startTemporalWorkerLifecycle'];
  stopTemporalWorkerLifecycle?: TemporalProviderModule['stopTemporalWorkerLifecycle'];
};

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function workerRepairActionId(status: TemporalWorkerLifecycle) {
  const repairAction = status.repair_action;
  return repairAction && typeof repairAction === 'object' && !Array.isArray(repairAction)
    ? stringValue((repairAction as Record<string, unknown>).action_id)
    : null;
}

function commandForAction(actionId: string | null) {
  if (actionId === 'start_temporal_worker') {
    return 'opl family-runtime worker start --provider temporal';
  }
  if (actionId === 'restart_temporal_worker') {
    return 'opl family-runtime worker stop --provider temporal && opl family-runtime worker start --provider temporal';
  }
  return null;
}

function workerLifecycleReceipt(input: {
  status: 'skipped' | 'blocked' | 'executed';
  trigger: TemporalWorkerRepairTrigger;
  before: TemporalWorkerLifecycle;
  after: TemporalWorkerLifecycle | null;
  repairActionId: string | null;
  stop?: TemporalWorkerLifecycleStop | null;
  start?: TemporalWorkerLifecycleStart | null;
  error?: unknown;
}) {
  return {
    surface_kind: 'opl_temporal_provider_worker_repair_receipt',
    provider_kind: 'temporal',
    trigger: input.trigger,
    repair_status: input.status,
    repair_action_id: input.repairActionId,
    command: commandForAction(input.repairActionId),
    before: input.before,
    after: input.after,
    stop: input.stop ?? null,
    start: input.start ?? null,
    error: input.error
      ? {
          message: input.error instanceof Error ? input.error.message : String(input.error),
        }
      : null,
    can_execute_domain_repair: false,
    authority_boundary: {
      can_authorize_domain_ready: false,
      can_authorize_quality_verdict: false,
      can_authorize_artifact_export: false,
      can_write_domain_truth: false,
      can_execute_domain_repair: false,
    },
  };
}

async function temporalProviderModule() {
  return await import('./family-runtime-temporal-provider.ts');
}

export async function repairTemporalWorkerLifecycleForProvider(
  paths: TemporalWorkerPaths,
  input: {
    trigger: TemporalWorkerRepairTrigger;
    allowStart?: boolean;
    allowRestart?: boolean;
    deps?: TemporalWorkerRepairDeps;
  },
) {
  const provider = await temporalProviderModule();
  const inspectTemporalWorkerLifecycle = input.deps?.inspectTemporalWorkerLifecycle
    ?? provider.inspectTemporalWorkerLifecycle;
  const startTemporalWorkerLifecycle = input.deps?.startTemporalWorkerLifecycle
    ?? provider.startTemporalWorkerLifecycle;
  const stopTemporalWorkerLifecycle = input.deps?.stopTemporalWorkerLifecycle
    ?? provider.stopTemporalWorkerLifecycle;
  const before = await inspectTemporalWorkerLifecycle(paths);
  const repairActionId = workerRepairActionId(before);
  const canStart = input.allowStart === true
    && before.lifecycle_status === 'worker_not_ready'
    && repairActionId === 'start_temporal_worker';
  const canRestart = input.allowRestart === true
    && before.lifecycle_status === 'worker_source_stale'
    && repairActionId === 'restart_temporal_worker';
  if (!canStart && !canRestart) {
    return workerLifecycleReceipt({
      status: 'skipped',
      trigger: input.trigger,
      before,
      after: before,
      repairActionId,
    });
  }
  try {
    const stop = canRestart ? await stopTemporalWorkerLifecycle(paths) : null;
    const start = await startTemporalWorkerLifecycle(paths);
    const after = 'status' in start && start.status
      ? start.status as TemporalWorkerLifecycle
      : await inspectTemporalWorkerLifecycle(paths);
    return workerLifecycleReceipt({
      status: after.lifecycle_status === 'ready' ? 'executed' : 'blocked',
      trigger: input.trigger,
      before,
      after,
      repairActionId,
      stop,
      start,
    });
  } catch (error) {
    return workerLifecycleReceipt({
      status: 'blocked',
      trigger: input.trigger,
      before,
      after: null,
      repairActionId,
      error,
    });
  }
}

export async function repairTemporalWorkerForProviderRepair(
  paths: TemporalWorkerPaths,
  deps: TemporalWorkerRepairDeps = {},
) {
  return await repairTemporalWorkerLifecycleForProvider(paths, {
    trigger: 'provider_repair',
    allowStart: true,
    allowRestart: true,
    deps,
  });
}

export async function maybeRepairTemporalWorkerForProviderSlo(
  paths: TemporalWorkerPaths,
  deps: TemporalWorkerRepairDeps = {},
) {
  return await repairTemporalWorkerLifecycleForProvider(paths, {
    trigger: 'provider_slo_tick',
    allowStart: true,
    allowRestart: false,
    deps,
  });
}
