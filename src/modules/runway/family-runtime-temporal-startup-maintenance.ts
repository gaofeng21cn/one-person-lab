import type { DatabaseSync } from 'node:sqlite';

import {
  openQueueDb,
  type familyRuntimePaths,
} from './family-runtime-store.ts';
import {
  runProviderWorkerSupervisorCommand,
} from './family-runtime-provider-worker-supervisor.ts';
import {
  repairTemporalWorkerLifecycleForProvider,
} from './family-runtime-provider-worker-repair.ts';
import {
  runTemporalSchedulerCadenceCommand,
} from './family-runtime-scheduler.ts';
import {
  inspectTemporalWorkerLifecycleFast,
} from './family-runtime-temporal-provider-parts/worker-lifecycle-fast.ts';
import {
  resolveTemporalAddressProvenance,
} from './family-runtime-temporal.ts';
import {
  inspectTemporalServiceLifecycle,
} from './family-runtime-temporal-service.ts';
import {
  runTemporalServiceSupervisorCommand,
} from './family-runtime-temporal-service-supervisor.ts';

type RuntimePaths = ReturnType<typeof familyRuntimePaths>;
type RuntimeHandle = { db: DatabaseSync; paths: RuntimePaths };
type ServiceLifecycle = Awaited<ReturnType<typeof inspectTemporalServiceLifecycle>>;
type WorkerLifecycle = Awaited<ReturnType<typeof inspectTemporalWorkerLifecycleFast>>;
type WorkerSupervisorOperation = Awaited<ReturnType<typeof runProviderWorkerSupervisorCommand>>;
type WorkerRepairOperation = Awaited<ReturnType<typeof repairTemporalWorkerLifecycleForProvider>>;
type SchedulerOperation = Awaited<ReturnType<typeof runTemporalSchedulerCadenceCommand>>;

type TemporalStartupStepStatus = 'ready' | 'blocked' | 'not_applicable' | 'skipped_dependency_not_ready';

export type TemporalStartupMaintenanceRuntime = {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  now?: () => string;
  openRuntime?: () => RuntimeHandle;
  inspectService?: (paths: RuntimePaths) => Promise<ServiceLifecycle>;
  runServiceSupervisor?: typeof runTemporalServiceSupervisorCommand;
  runWorkerSupervisor?: typeof runProviderWorkerSupervisorCommand;
  repairWorker?: typeof repairTemporalWorkerLifecycleForProvider;
  inspectWorker?: (paths: RuntimePaths) => Promise<WorkerLifecycle>;
  runScheduler?: typeof runTemporalSchedulerCadenceCommand;
  sleep?: (milliseconds: number) => Promise<void>;
  workerReadinessAttempts?: number;
  workerReadinessPollMs?: number;
};

function normalizeError(error: unknown) {
  if (error && typeof error === 'object' && 'toJSON' in error && typeof error.toJSON === 'function') {
    return error.toJSON() as Record<string, unknown>;
  }
  return {
    code: 'temporal_startup_maintenance_failed',
    message: error instanceof Error ? error.message : String(error),
  };
}

function readRecord(value: unknown, key: string): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || !(key in value)) return null;
  const nested = (value as Record<string, unknown>)[key];
  return nested && typeof nested === 'object' ? nested as Record<string, unknown> : null;
}

function readString(value: unknown, key: string) {
  if (!value || typeof value !== 'object' || !(key in value)) return null;
  const nested = (value as Record<string, unknown>)[key];
  return typeof nested === 'string' ? nested : null;
}

function readBoolean(value: unknown, key: string) {
  if (!value || typeof value !== 'object' || !(key in value)) return null;
  const nested = (value as Record<string, unknown>)[key];
  return typeof nested === 'boolean' ? nested : null;
}

function workerSupervisorReady(operation: WorkerSupervisorOperation) {
  const state = readRecord(operation, 'supervisor_state');
  return operation.status === 'installed'
    && readBoolean(state, 'launchctl_loaded') === true
    && readBoolean(state, 'supervises_family_runtime_root') === true;
}

function schedulerReady(operation: SchedulerOperation) {
  const action = readRecord(operation, 'action');
  const health = readRecord(action, 'health') ?? readRecord(operation, 'health');
  return readString(action, 'schedule_status') === 'active'
    && readString(health, 'health_status') === 'healthy';
}

function step(input: {
  status: TemporalStartupStepStatus;
  action: string;
  ready: boolean | null;
  reason: string | null;
  before?: unknown;
  operations?: unknown[];
  after?: unknown;
  error?: Record<string, unknown> | null;
}) {
  return {
    status: input.status,
    action: input.action,
    ready: input.ready,
    reason: input.reason,
    before: input.before ?? null,
    operations: input.operations ?? [],
    after: input.after ?? null,
    error: input.error ?? null,
  };
}

function skippedStep(reason: string) {
  return step({
    status: 'skipped_dependency_not_ready',
    action: 'none',
    ready: false,
    reason,
  });
}

function notApplicableReceipt(input: {
  platform: NodeJS.Platform;
  hostKind: string | null;
  providerKind: string;
  reason: string;
  observedAt: string;
}) {
  const service = step({
    status: 'not_applicable',
    action: 'none',
    ready: null,
    reason: input.reason,
  });
  return {
    surface_kind: 'opl_temporal_runtime_startup_reconcile.v1',
    provider_kind: input.providerKind,
    status: 'not_applicable' as const,
    applicable: false,
    required: false,
    ready: null,
    reason: input.reason,
    platform: input.platform,
    host_kind: input.hostKind,
    observed_at: input.observedAt,
    sequence: [
      'temporal_service_supervisor',
      'provider_worker_supervisor',
      'temporal_scheduler_cadence',
    ],
    failed_step: null,
    steps: {
      temporal_service_supervisor: service,
      provider_worker_supervisor: step({ ...service, reason: 'temporal_service_supervisor_not_applicable' }),
      temporal_scheduler_cadence: step({ ...service, reason: 'provider_worker_supervisor_not_applicable' }),
    },
    authority_boundary: {
      can_install_opl_provider_supervisor: false,
      can_install_domain_daemon: false,
      can_write_domain_truth: false,
      can_claim_domain_ready: false,
      can_claim_production_ready: false,
    },
  };
}

function serviceReady(lifecycle: ServiceLifecycle) {
  return lifecycle.service_status === 'running'
    && lifecycle.server_reachable === true
    && lifecycle.supervisor.required === true
    && lifecycle.supervisor.ready === true
    && lifecycle.supervisor.error === null;
}

async function waitForWorkerReadiness(
  paths: RuntimePaths,
  inspectWorker: (paths: RuntimePaths) => Promise<WorkerLifecycle>,
  runtime: TemporalStartupMaintenanceRuntime,
) {
  const attempts = Math.max(1, runtime.workerReadinessAttempts ?? 41);
  const pollMs = Math.max(0, runtime.workerReadinessPollMs ?? 250);
  const sleep = runtime.sleep ?? ((milliseconds: number) => new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  }));
  let state = await inspectWorker(paths);
  for (let attempt = 1; state.worker_ready !== true && attempt < attempts; attempt += 1) {
    await sleep(pollMs);
    state = await inspectWorker(paths);
  }
  return state;
}

function buildReceipt(input: {
  status: 'ready' | 'blocked';
  platform: NodeJS.Platform;
  hostKind: string;
  providerKind: string;
  observedAt: string;
  failedStep: string | null;
  steps: Record<string, ReturnType<typeof step>>;
}) {
  return {
    surface_kind: 'opl_temporal_runtime_startup_reconcile.v1',
    provider_kind: input.providerKind,
    status: input.status,
    applicable: true,
    required: true,
    ready: input.status === 'ready',
    reason: input.status === 'ready' ? null : `${input.failedStep ?? 'temporal_runtime'}_not_ready`,
    platform: input.platform,
    host_kind: input.hostKind,
    observed_at: input.observedAt,
    sequence: [
      'temporal_service_supervisor',
      'provider_worker_supervisor',
      'temporal_scheduler_cadence',
    ],
    failed_step: input.failedStep,
    steps: input.steps,
    authority_boundary: {
      can_install_opl_provider_supervisor: true,
      can_install_domain_daemon: false,
      can_write_domain_truth: false,
      can_claim_domain_ready: false,
      can_claim_production_ready: false,
    },
  };
}

export async function reconcileTemporalRuntimeStartupMaintenance(
  runtime: TemporalStartupMaintenanceRuntime = {},
) {
  const platform = runtime.platform ?? process.platform;
  const env = runtime.env ?? process.env;
  const hostKind = env.OPL_APP_HOST_KIND?.trim() || null;
  const providerKind = env.OPL_FAMILY_RUNTIME_PROVIDER?.trim() || 'temporal';
  const observedAt = runtime.now?.() ?? new Date().toISOString();
  const addressProvenance = resolveTemporalAddressProvenance(env);

  if (platform !== 'darwin') {
    return notApplicableReceipt({
      platform,
      hostKind,
      providerKind,
      reason: 'launchd_supervision_not_available_on_non_darwin',
      observedAt,
    });
  }
  if (hostKind !== 'desktop') {
    return notApplicableReceipt({
      platform,
      hostKind,
      providerKind,
      reason: hostKind ? 'non_desktop_host_does_not_own_launchd' : 'desktop_host_hint_missing',
      observedAt,
    });
  }
  if (providerKind !== 'temporal') {
    return notApplicableReceipt({
      platform,
      hostKind,
      providerKind,
      reason: 'selected_family_runtime_provider_is_not_temporal',
      observedAt,
    });
  }
  const hasConfiguredAddressOrSource = Boolean(
    addressProvenance.address
    || addressProvenance.source
    || env.OPL_TEMPORAL_SERVICE_START_COMMAND?.trim(),
  );
  if (hasConfiguredAddressOrSource && !addressProvenance.managed_packaged_local_default) {
    return notApplicableReceipt({
      platform,
      hostKind,
      providerKind,
      reason: 'external_or_custom_temporal_service_owned_outside_desktop_launchd',
      observedAt,
    });
  }

  const openRuntime = runtime.openRuntime ?? openQueueDb;
  const inspectService = runtime.inspectService
    ?? ((paths: RuntimePaths) => inspectTemporalServiceLifecycle(paths, { env, platform }));
  const runServiceSupervisor = runtime.runServiceSupervisor ?? runTemporalServiceSupervisorCommand;
  const runWorkerSupervisor = runtime.runWorkerSupervisor ?? runProviderWorkerSupervisorCommand;
  const repairWorker = runtime.repairWorker ?? repairTemporalWorkerLifecycleForProvider;
  const inspectWorker = runtime.inspectWorker ?? inspectTemporalWorkerLifecycleFast;
  const runScheduler = runtime.runScheduler ?? runTemporalSchedulerCadenceCommand;
  const handle = openRuntime();
  const steps: Record<string, ReturnType<typeof step>> = {};

  try {
    let serviceBefore: ServiceLifecycle;
    try {
      serviceBefore = await inspectService(handle.paths);
    } catch (error) {
      steps.temporal_service_supervisor = step({
        status: 'blocked',
        action: 'status',
        ready: false,
        reason: 'temporal_service_inspection_failed',
        error: normalizeError(error),
      });
      steps.provider_worker_supervisor = skippedStep('temporal_service_supervisor_not_ready');
      steps.temporal_scheduler_cadence = skippedStep('provider_worker_supervisor_not_ready');
      return buildReceipt({
        status: 'blocked', platform, hostKind, providerKind, observedAt,
        failedStep: 'temporal_service_supervisor', steps,
      });
    }

    if (serviceBefore.supervisor.applicable !== true || serviceBefore.supervisor.required !== true) {
      return notApplicableReceipt({
        platform,
        hostKind,
        providerKind,
        reason: 'temporal_service_supervisor_not_applicable',
        observedAt,
      });
    }

    let serviceAfter = serviceBefore;
    const serviceOperations: unknown[] = [];
    if (!serviceReady(serviceBefore)) {
      try {
        const operation = await runServiceSupervisor(handle.db, handle.paths, 'install', { env, platform });
        serviceOperations.push(operation);
        serviceAfter = await inspectService(handle.paths);
      } catch (error) {
        steps.temporal_service_supervisor = step({
          status: 'blocked',
          action: 'install',
          ready: false,
          reason: 'temporal_service_supervisor_install_failed',
          before: serviceBefore,
          operations: serviceOperations,
          after: serviceAfter,
          error: normalizeError(error),
        });
        steps.provider_worker_supervisor = skippedStep('temporal_service_supervisor_not_ready');
        steps.temporal_scheduler_cadence = skippedStep('provider_worker_supervisor_not_ready');
        return buildReceipt({
          status: 'blocked', platform, hostKind, providerKind, observedAt,
          failedStep: 'temporal_service_supervisor', steps,
        });
      }
    }
    const serviceIsReady = serviceReady(serviceAfter);
    steps.temporal_service_supervisor = step({
      status: serviceIsReady ? 'ready' : 'blocked',
      action: serviceOperations.length > 0 ? 'install' : 'none',
      ready: serviceIsReady,
      reason: serviceIsReady ? null : serviceAfter.supervisor.error ?? 'fresh_temporal_service_readback_not_ready',
      before: serviceBefore,
      operations: serviceOperations,
      after: serviceAfter,
    });
    if (!serviceIsReady) {
      steps.provider_worker_supervisor = skippedStep('temporal_service_supervisor_not_ready');
      steps.temporal_scheduler_cadence = skippedStep('provider_worker_supervisor_not_ready');
      return buildReceipt({
        status: 'blocked', platform, hostKind, providerKind, observedAt,
        failedStep: 'temporal_service_supervisor', steps,
      });
    }

    let workerBefore: WorkerSupervisorOperation;
    const workerOperations: Array<WorkerSupervisorOperation | WorkerRepairOperation> = [];
    let workerAction = 'status';
    try {
      workerBefore = await runWorkerSupervisor(handle.db, handle.paths, {
        action: 'status',
        providerKind: 'temporal',
      });
      let workerAfter = workerBefore;
      const loadedForDifferentRuntime = !workerSupervisorReady(workerBefore)
        && readBoolean(readRecord(workerBefore, 'supervisor_state'), 'launchctl_loaded') === true;
      if (!workerSupervisorReady(workerBefore) && !loadedForDifferentRuntime) {
        workerAction = 'install';
        workerOperations.push(await runWorkerSupervisor(handle.db, handle.paths, {
          action: 'install',
          providerKind: 'temporal',
        }));
        workerAfter = await runWorkerSupervisor(handle.db, handle.paths, {
          action: 'status',
          providerKind: 'temporal',
        });
      }
      let supervisorIsReady = workerSupervisorReady(workerAfter);
      let workerLifecycle = supervisorIsReady
        ? await waitForWorkerReadiness(handle.paths, inspectWorker, runtime)
        : await inspectWorker(handle.paths);
      if (supervisorIsReady && workerLifecycle.readiness_status === 'worker_source_stale') {
        workerAction = 'restart';
        workerOperations.push(await repairWorker(handle.paths, {
          trigger: 'startup_maintenance',
          allowRestart: true,
        }));
        workerAfter = await runWorkerSupervisor(handle.db, handle.paths, {
          action: 'status',
          providerKind: 'temporal',
        });
        supervisorIsReady = workerSupervisorReady(workerAfter);
        workerLifecycle = supervisorIsReady
          ? await waitForWorkerReadiness(handle.paths, inspectWorker, runtime)
          : await inspectWorker(handle.paths);
      }
      const runtimeIsReady = workerLifecycle.worker_ready === true;
      const workerIsReady = supervisorIsReady && runtimeIsReady;
      if (workerAction === 'status') workerAction = 'none';
      steps.provider_worker_supervisor = step({
        status: workerIsReady ? 'ready' : 'blocked',
        action: workerAction,
        ready: workerIsReady,
        reason: workerIsReady
          ? null
          : loadedForDifferentRuntime
            ? 'provider_worker_supervisor_loaded_for_different_runtime_root'
            : !supervisorIsReady
            ? 'fresh_provider_worker_supervisor_readback_not_ready'
            : workerLifecycle.readiness_status,
        before: workerBefore,
        operations: workerOperations,
        after: {
          supervisor: workerAfter,
          worker_lifecycle: workerLifecycle,
        },
      });
    } catch (error) {
      steps.provider_worker_supervisor = step({
        status: 'blocked',
        action: workerAction,
        ready: false,
        reason: 'provider_worker_supervisor_maintenance_failed',
        operations: workerOperations,
        error: normalizeError(error),
      });
    }
    if (steps.provider_worker_supervisor.ready !== true) {
      steps.temporal_scheduler_cadence = skippedStep('provider_worker_supervisor_not_ready');
      return buildReceipt({
        status: 'blocked', platform, hostKind, providerKind, observedAt,
        failedStep: 'provider_worker_supervisor', steps,
      });
    }

    let schedulerBefore: SchedulerOperation;
    const schedulerOperations: unknown[] = [];
    try {
      schedulerBefore = await runScheduler(handle.db, handle.paths, {
        mode: 'scheduler_status',
        providerKind: 'temporal',
      });
      let schedulerAfter = schedulerBefore;
      if (!schedulerReady(schedulerBefore) && schedulerBefore.status !== 'blocked_provider_not_ready') {
        schedulerOperations.push(await runScheduler(handle.db, handle.paths, {
          mode: 'scheduler_install',
          providerKind: 'temporal',
        }));
        schedulerAfter = await runScheduler(handle.db, handle.paths, {
          mode: 'scheduler_status',
          providerKind: 'temporal',
        });
      }
      const cadenceIsReady = schedulerReady(schedulerAfter);
      steps.temporal_scheduler_cadence = step({
        status: cadenceIsReady ? 'ready' : 'blocked',
        action: schedulerOperations.length > 0 ? 'install' : 'none',
        ready: cadenceIsReady,
        reason: cadenceIsReady
          ? null
          : schedulerAfter.status === 'blocked_provider_not_ready'
            ? 'temporal_provider_not_ready_for_scheduler'
            : 'fresh_temporal_scheduler_readback_not_ready',
        before: schedulerBefore,
        operations: schedulerOperations,
        after: schedulerAfter,
      });
    } catch (error) {
      steps.temporal_scheduler_cadence = step({
        status: 'blocked',
        action: schedulerOperations.length > 0 ? 'install' : 'status',
        ready: false,
        reason: 'temporal_scheduler_maintenance_failed',
        operations: schedulerOperations,
        error: normalizeError(error),
      });
    }

    return buildReceipt({
      status: steps.temporal_scheduler_cadence.ready === true ? 'ready' : 'blocked',
      platform,
      hostKind,
      providerKind,
      observedAt,
      failedStep: steps.temporal_scheduler_cadence.ready === true ? null : 'temporal_scheduler_cadence',
      steps,
    });
  } finally {
    handle.db.close();
  }
}
