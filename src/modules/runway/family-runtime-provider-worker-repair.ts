import { listStageAttempts } from './family-runtime-stage-attempt-ledger.ts';
import { openFamilyRuntimeSqlite } from './family-runtime-sqlite.ts';
import {
  inspectProviderWorkerSupervisorState,
  supervisorOwnsFamilyRuntimeRoot,
  type ProviderWorkerSupervisorState,
} from './family-runtime-provider-worker-supervisor-state.ts';

type FamilyRuntimeSqliteDb = ReturnType<typeof openFamilyRuntimeSqlite>;

type TemporalProviderModule = typeof import('./family-runtime-temporal-provider.ts');
type TemporalWorkerLifecycle = Awaited<ReturnType<TemporalProviderModule['inspectTemporalWorkerLifecycle']>>;
type TemporalWorkerPaths = Parameters<TemporalProviderModule['inspectTemporalWorkerLifecycle']>[0];

type TemporalWorkerLifecycleStart = Awaited<ReturnType<TemporalProviderModule['startTemporalWorkerLifecycle']>>;
type TemporalWorkerLifecycleStop = Awaited<ReturnType<TemporalProviderModule['stopTemporalWorkerLifecycle']>>;

export type TemporalWorkerRepairTrigger = 'provider_repair' | 'provider_slo_tick' | 'startup_maintenance';

export type TemporalWorkerRepairDeps = {
  inspectTemporalWorkerLifecycle?: TemporalProviderModule['inspectTemporalWorkerLifecycle'];
  startTemporalWorkerLifecycle?: TemporalProviderModule['startTemporalWorkerLifecycle'];
  stopTemporalWorkerLifecycle?: TemporalProviderModule['stopTemporalWorkerLifecycle'];
  inspectProviderWorkerSupervisor?: (paths: TemporalWorkerPaths) =>
    ProviderWorkerSupervisorState | Promise<ProviderWorkerSupervisorState>;
  inspectWorkerRestartGuard?: (input: {
    paths: TemporalWorkerPaths;
    before: TemporalWorkerLifecycle;
  }) => WorkerRestartGuard | Promise<WorkerRestartGuard>;
};

type StageAttemptPayload = ReturnType<typeof listStageAttempts>[number];

export type WorkerRestartGuard = {
  surface_kind: 'temporal_worker_source_stale_restart_guard';
  guard_status: 'ready' | 'blocked';
  blocker_ids: string[];
  worker_mutation_guard: Record<string, unknown> | null;
  temporal_service_reachable: boolean | null;
  stage_attempt_ledger_readable: boolean;
  stage_attempt_ledger_error: string | null;
  active_stage_attempt_count: number;
  active_stage_attempt_statuses: string[];
  active_stage_attempts_by_status: Record<string, number>;
  active_stage_attempt_sample_limit: number;
  active_stage_attempts: Array<{
    stage_attempt_id: string;
    status: string;
    domain_id: string;
    stage_id: string;
    task_id: string | null;
  }>;
  diagnostic_stage_attempt_count: number;
  diagnostic_stage_attempt_statuses: string[];
  diagnostic_stage_attempts_by_status: Record<string, number>;
  diagnostic_stage_attempt_sample_limit: number;
  diagnostic_stage_attempts: Array<{
    stage_attempt_id: string;
    status: string;
    domain_id: string;
    stage_id: string;
    task_id: string | null;
  }>;
};

const WORKER_RESTART_BLOCKING_STAGE_ATTEMPT_STATUSES = new Set(['running']);
const WORKER_RESTART_DIAGNOSTIC_STAGE_ATTEMPT_STATUSES = new Set([
  'queued',
  'running',
  'checkpointed',
  'human_gate',
]);

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
    return 'opl family-runtime worker stop --provider temporal';
  }
  return null;
}

function workerStopCompletedForSupervisorRestart(stop: TemporalWorkerLifecycleStop | null) {
  return stop !== null
    && ['not_running', 'stopped', 'force_stopped'].includes(stop.stop_status)
    && stop.orphan_stop_incomplete_pids.length === 0;
}

function recordValue(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function buildWorkerRestartGuard(input: {
  before: TemporalWorkerLifecycle;
  attempts: StageAttemptPayload[];
  stageAttemptLedgerError?: unknown;
}) {
  const workerMutationGuard = recordValue(input.before.worker_mutation_guard);
  const temporalServiceLifecycle = recordValue(input.before.temporal_service_lifecycle);
  const temporalServiceReachable = typeof input.before.server_reachable === 'boolean'
    ? input.before.server_reachable
    : typeof temporalServiceLifecycle?.server_reachable === 'boolean'
      ? temporalServiceLifecycle.server_reachable
      : null;
  const diagnosticStageAttempts = input.attempts
    .filter((attempt) => WORKER_RESTART_DIAGNOSTIC_STAGE_ATTEMPT_STATUSES.has(String(attempt.status)))
    .map((attempt) => ({
      stage_attempt_id: attempt.stage_attempt_id,
      status: String(attempt.status),
      domain_id: String(attempt.domain_id),
      stage_id: String(attempt.stage_id),
      task_id: typeof attempt.task_id === 'string' ? attempt.task_id : null,
    }));
  const activeStageAttempts = diagnosticStageAttempts.filter((attempt) =>
    WORKER_RESTART_BLOCKING_STAGE_ATTEMPT_STATUSES.has(attempt.status)
  );
  const activeStageAttemptsByStatus = Object.fromEntries(
    [...new Set(activeStageAttempts.map((attempt) => attempt.status))].sort().map((status) => [
      status,
      activeStageAttempts.filter((attempt) => attempt.status === status).length,
    ]),
  );
  const diagnosticStageAttemptsByStatus = Object.fromEntries(
    [...new Set(diagnosticStageAttempts.map((attempt) => attempt.status))].sort().map((status) => [
      status,
      diagnosticStageAttempts.filter((attempt) => attempt.status === status).length,
    ]),
  );
  const blockerIds: string[] = [];
  if (workerMutationGuard?.mutation_guard_status !== 'allowed_explicit_developer_supervisor') {
    blockerIds.push('developer_supervisor_required');
  }
  if (temporalServiceReachable !== true) {
    blockerIds.push('temporal_service_unreachable');
  }
  if (input.stageAttemptLedgerError) {
    blockerIds.push('stage_attempt_ledger_unavailable');
  }
  if (activeStageAttempts.length > 0) {
    blockerIds.push('active_stage_attempts_present');
  }
  return {
    surface_kind: 'temporal_worker_source_stale_restart_guard',
    guard_status: blockerIds.length === 0 ? 'ready' : 'blocked',
    blocker_ids: blockerIds,
    worker_mutation_guard: workerMutationGuard,
    temporal_service_reachable: temporalServiceReachable,
    stage_attempt_ledger_readable: input.stageAttemptLedgerError === undefined,
    stage_attempt_ledger_error: input.stageAttemptLedgerError instanceof Error
      ? input.stageAttemptLedgerError.message
      : input.stageAttemptLedgerError
        ? String(input.stageAttemptLedgerError)
        : null,
    active_stage_attempt_count: activeStageAttempts.length,
    active_stage_attempt_statuses: Object.keys(activeStageAttemptsByStatus),
    active_stage_attempts_by_status: activeStageAttemptsByStatus,
    active_stage_attempt_sample_limit: 20,
    active_stage_attempts: activeStageAttempts.slice(0, 20),
    diagnostic_stage_attempt_count: diagnosticStageAttempts.length,
    diagnostic_stage_attempt_statuses: Object.keys(diagnosticStageAttemptsByStatus),
    diagnostic_stage_attempts_by_status: diagnosticStageAttemptsByStatus,
    diagnostic_stage_attempt_sample_limit: 20,
    diagnostic_stage_attempts: diagnosticStageAttempts.slice(0, 20),
  } satisfies WorkerRestartGuard;
}

function inspectWorkerRestartGuardFromState(paths: TemporalWorkerPaths, before: TemporalWorkerLifecycle) {
  const queueDb = 'queue_db' in paths && typeof paths.queue_db === 'string' ? paths.queue_db : null;
  if (!queueDb) {
    return buildWorkerRestartGuard({
      before,
      attempts: [],
      stageAttemptLedgerError: 'stage_attempt_index_db_path_unavailable',
    });
  }
  let db: FamilyRuntimeSqliteDb | null = null;
  try {
    db = openFamilyRuntimeSqlite(queueDb);
    return buildWorkerRestartGuard({ before, attempts: listStageAttempts(db) });
  } catch (error) {
    return buildWorkerRestartGuard({ before, attempts: [], stageAttemptLedgerError: error });
  } finally {
    db?.close();
  }
}

export function inspectTemporalWorkerRestartGuardForLifecycle(
  paths: TemporalWorkerPaths,
  before: TemporalWorkerLifecycle,
) {
  return inspectWorkerRestartGuardFromState(paths, before);
}

function workerLifecycleReceipt(input: {
  status: 'skipped' | 'blocked' | 'executed';
  trigger: TemporalWorkerRepairTrigger;
  before: TemporalWorkerLifecycle;
  after: TemporalWorkerLifecycle | null;
  repairActionId: string | null;
  stop?: TemporalWorkerLifecycleStop | null;
  start?: TemporalWorkerLifecycleStart | null;
  restartGuard?: WorkerRestartGuard | null;
  restartReason?: 'duplicate_worker' | 'worker_source_stale' | null;
  restartStrategy?: 'manual_stop_then_start' | 'supervisor_keepalive_stop_only' | null;
  restartReadinessPending?: boolean;
  supervisorState?: ProviderWorkerSupervisorState | null;
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
    restart_guard: input.restartGuard ?? null,
    restart_reason: input.restartReason ?? null,
    restart_strategy: input.restartStrategy ?? null,
    restart_readiness_pending: input.restartReadinessPending ?? false,
    supervisor_state: input.supervisorState ?? null,
    blocker_ids: input.restartGuard?.blocker_ids ?? [],
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
  const inspectProviderWorkerSupervisor = input.deps?.inspectProviderWorkerSupervisor
    ?? ((supervisorPaths: TemporalWorkerPaths) =>
      inspectProviderWorkerSupervisorState(supervisorPaths as Parameters<typeof inspectProviderWorkerSupervisorState>[0]));
  const inspectWorkerRestartGuard = input.deps?.inspectWorkerRestartGuard
    ?? ((guardInput: { paths: TemporalWorkerPaths; before: TemporalWorkerLifecycle }) =>
      inspectWorkerRestartGuardFromState(guardInput.paths, guardInput.before));
  const before = await inspectTemporalWorkerLifecycle(paths);
  const repairActionId = workerRepairActionId(before);
  const restartReason = before.lifecycle_status === 'duplicate_worker'
    ? 'duplicate_worker'
    : before.lifecycle_status === 'worker_source_stale'
      ? 'worker_source_stale'
      : null;
  const canStart = input.allowStart === true
    && before.lifecycle_status === 'worker_not_ready'
    && repairActionId === 'start_temporal_worker';
  const canRestart = input.allowRestart === true
    && (before.lifecycle_status === 'worker_source_stale' || before.lifecycle_status === 'duplicate_worker')
    && repairActionId === 'restart_temporal_worker';
  if (!canStart && !canRestart) {
    return workerLifecycleReceipt({
      status: 'skipped',
      trigger: input.trigger,
      before,
      after: before,
      repairActionId,
      restartReason,
    });
  }
  const restartGuard = canRestart
    ? await inspectWorkerRestartGuard({ paths, before })
    : null;
  if (restartGuard?.guard_status === 'blocked') {
    return workerLifecycleReceipt({
      status: 'blocked',
      trigger: input.trigger,
      before,
      after: before,
      repairActionId,
      restartGuard,
      restartReason,
    });
  }
  const supervisorState = canRestart
    ? await inspectProviderWorkerSupervisor(paths)
    : null;
  const restartStrategy = canRestart && supervisorOwnsFamilyRuntimeRoot(supervisorState)
    ? 'supervisor_keepalive_stop_only'
    : canRestart
      ? 'manual_stop_then_start'
      : null;
  try {
    const stop = canRestart ? await stopTemporalWorkerLifecycle(paths) : null;
    const start = restartStrategy === 'supervisor_keepalive_stop_only'
      ? null
      : await startTemporalWorkerLifecycle(paths);
    const after = start && 'status' in start && start.status
      ? start.status as TemporalWorkerLifecycle
      : await inspectTemporalWorkerLifecycle(paths);
    const restartReadinessPending = restartStrategy === 'supervisor_keepalive_stop_only'
      && workerStopCompletedForSupervisorRestart(stop)
      && after.lifecycle_status === 'worker_not_ready';
    return workerLifecycleReceipt({
      status: after.lifecycle_status === 'ready' || restartReadinessPending ? 'executed' : 'blocked',
      trigger: input.trigger,
      before,
      after,
      repairActionId,
      stop,
      start,
      restartGuard,
      restartReason,
      restartStrategy,
      restartReadinessPending,
      supervisorState,
    });
  } catch (error) {
    return workerLifecycleReceipt({
      status: 'blocked',
      trigger: input.trigger,
      before,
      after: null,
      repairActionId,
      restartGuard,
      restartReason,
      restartStrategy,
      supervisorState,
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
    allowRestart: true,
    deps,
  });
}
