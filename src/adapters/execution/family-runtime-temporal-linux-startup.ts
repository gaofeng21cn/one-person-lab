import { openQueueDb } from './family-runtime-store.ts';
import { inspectDetachedTemporalServiceState, inspectTemporalServiceLifecycle, startTemporalServiceLifecycle } from './family-runtime-temporal-service.ts';
import { inspectTemporalWorkerLifecycleFast } from './family-runtime-temporal-provider-parts/worker-lifecycle-fast.ts';
import { repairTemporalWorkerLifecycleForProvider } from './family-runtime-provider-worker-repair.ts';
import { runTemporalSchedulerCadenceCommand } from './family-runtime-scheduler.ts';
import type { TemporalStartupMaintenanceRuntime, TemporalStartupMaintenanceStep } from './family-runtime-temporal-startup-maintenance.ts';

export async function reconcileLinuxDesktopTemporal(runtime: TemporalStartupMaintenanceRuntime) {
  const handle = (runtime.openRuntime ?? openQueueDb)();
  const inspectService = runtime.inspectService ?? inspectTemporalServiceLifecycle;
  const inspectWorker = runtime.inspectWorker ?? inspectTemporalWorkerLifecycleFast;
  const scheduler = runtime.runScheduler ?? runTemporalSchedulerCadenceCommand;
  const steps: Record<string, TemporalStartupMaintenanceStep> = {};
  const step = (ready: boolean, after: unknown): TemporalStartupMaintenanceStep => ({
    status: ready ? 'ready' : 'blocked', action: 'reconcile', ready,
    reason: ready ? null : 'runtime_not_ready', before: null, operations: [], after: after ?? null, error: null,
  });
  let failedStep: string | null = null;
  const receipt = (status: string, reason: string | null = null) => ({
    surface_kind: 'opl_temporal_runtime_startup_reconcile.v1', provider_kind: 'temporal',
    platform: 'linux', host_kind: 'desktop', platform_adapter: 'managed_local_process',
    applicable: status !== 'not_applicable', required: status !== 'not_applicable',
    ready: status === 'not_applicable' ? null : status === 'ready',
    status, reason, observed_at: runtime.now?.() ?? new Date().toISOString(),
    sequence: ['temporal_managed_service', 'temporal_managed_worker', 'temporal_scheduler_cadence'],
    failed_step: failedStep, steps,
    authority_boundary: { can_install_opl_provider_supervisor: false, can_install_domain_daemon: false,
      can_write_domain_truth: false, can_claim_domain_ready: false, can_claim_production_ready: false },
  });
  try {
    const state = (runtime.inspectManagedService ?? inspectDetachedTemporalServiceState)(handle.paths).state;
    if (state?.service_kind !== 'temporal_cli' || !/^(127\.0\.0\.1|localhost):\d+$/.test(state.address)) {
      return receipt('not_applicable', 'managed_local_temporal_service_not_configured');
    }
    failedStep = 'temporal_managed_service';
    const before = await inspectService(handle.paths);
    if (before.service_status !== 'running' || !before.server_reachable) {
      await (runtime.startService ?? startTemporalServiceLifecycle)(handle.paths);
    }
    const service = await inspectService(handle.paths);
    steps[failedStep] = step(service.service_status === 'running' && service.server_reachable, service);
    if (service.service_status !== 'running' || !service.server_reachable) return receipt('blocked', 'managed_service_not_ready');
    failedStep = 'temporal_managed_worker';
    let worker = await inspectWorker(handle.paths);
    if (!worker.worker_ready || !worker.managed_worker_source_current) {
      await (runtime.repairWorker ?? repairTemporalWorkerLifecycleForProvider)(handle.paths, {
        trigger: 'startup_maintenance', allowStart: true, allowRestart: true,
      });
      worker = await inspectWorker(handle.paths);
    }
    steps[failedStep] = step(worker.worker_ready === true && worker.managed_worker_source_current === true, worker);
    if (!worker.worker_ready || !worker.managed_worker_source_current) return receipt('blocked', 'managed_worker_not_ready');
    failedStep = 'temporal_scheduler_cadence';
    let cadence = await scheduler(handle.db, handle.paths, { mode: 'scheduler_status', providerKind: 'temporal' });
    const ready = (value: typeof cadence) => {
      const data = value as { action?: { schedule_status?: string; health?: { health_status?: string } }; health?: { health_status?: string } };
      return data.action?.schedule_status === 'active' && (data.action.health ?? data.health)?.health_status === 'healthy';
    };
    if (!ready(cadence)) {
      await scheduler(handle.db, handle.paths, { mode: 'scheduler_install', providerKind: 'temporal' });
      cadence = await scheduler(handle.db, handle.paths, { mode: 'scheduler_status', providerKind: 'temporal' });
    }
    steps[failedStep] = step(ready(cadence), cadence);
    if (!ready(cadence)) return receipt('blocked', 'scheduler_not_ready');
    failedStep = null;
    return receipt('ready');
  } catch (error) {
    return { ...receipt('blocked', `${failedStep ?? 'temporal_runtime'}_not_ready`),
      error: { message: error instanceof Error ? error.message : String(error) } };
  } finally { handle.db.close(); }
}
