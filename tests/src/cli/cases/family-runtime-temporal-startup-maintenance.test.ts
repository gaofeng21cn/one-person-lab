import { DatabaseSync } from 'node:sqlite';

import { assert, test } from '../helpers.ts';
import {
  reconcileTemporalRuntimeStartupMaintenance,
} from '../../../../src/modules/runway/family-runtime-temporal-startup-maintenance.ts';

function serviceLifecycle(input: {
  ready: boolean;
  applicable?: boolean;
  required?: boolean;
  error?: string | null;
} = { ready: false }) {
  const applicable = input.applicable ?? true;
  const required = input.required ?? applicable;
  return {
    service_status: input.ready ? 'running' : 'not_configured',
    server_reachable: input.ready,
    supervisor: {
      applicable,
      required,
      ready: required ? input.ready : null,
      error: required ? input.error ?? (input.ready ? null : 'temporal_service_supervisor_not_ready') : null,
    },
  } as never;
}

function workerSupervisorStatus(ready: boolean) {
  return {
    status: ready ? 'installed' : 'not_installed',
    supervisor_state: {
      launchctl_loaded: ready,
      supervises_family_runtime_root: ready,
    },
  } as never;
}

function workerLifecycle(ready: boolean, readinessStatus?: string) {
  return {
    worker_ready: ready,
    readiness_status: readinessStatus ?? (ready ? 'ready' : 'worker_not_ready'),
    managed_worker_source_current: ready
      ? true
      : readinessStatus === 'worker_source_stale'
        ? false
        : null,
  } as never;
}

function schedulerStatus(ready: boolean) {
  return {
    status: ready ? 'ok' : 'attention_required',
    action: {
      schedule_status: ready ? 'active' : 'not_installed',
      health: { health_status: ready ? 'healthy' : 'attention_required' },
    },
  } as never;
}

function fakeRuntimeHandle(onClose?: () => void) {
  const db = new DatabaseSync(':memory:');
  const close = db.close.bind(db);
  db.close = () => {
    onClose?.();
    close();
  };
  return {
    db,
    paths: {
      state_dir: '/tmp/opl-temporal-startup-test-state',
      root: '/tmp/opl-temporal-startup-test-state/family-runtime',
      queue_db: '/tmp/opl-temporal-startup-test-state/family-runtime/queue.sqlite',
      dispatch_dir: '/tmp/opl-temporal-startup-test-state/family-runtime/dispatch',
      proof_dir: '/tmp/opl-temporal-startup-test-state/family-runtime/proofs',
      latest_temporal_production_proof:
        '/tmp/opl-temporal-startup-test-state/family-runtime/proofs/latest-temporal-production-proof.json',
    },
  };
}

test('Temporal startup maintenance is mutation-free outside the Desktop Darwin managed host boundary', async () => {
  let openCount = 0;
  const openRuntime = () => {
    openCount += 1;
    throw new Error('runtime must not open for a not-applicable host');
  };
  const cases = [
    {
      platform: 'linux' as const,
      env: { OPL_APP_HOST_KIND: 'desktop', OPL_APP_PROCESS_INSTANCE_ID: 'desktop-1' },
      reason: 'launchd_supervision_not_available_on_non_darwin',
    },
    {
      platform: 'darwin' as const,
      env: { OPL_APP_PROCESS_INSTANCE_ID: 'web-1' },
      reason: 'desktop_host_hint_missing',
    },
    {
      platform: 'darwin' as const,
      env: {
        OPL_APP_HOST_KIND: 'desktop',
        OPL_APP_PROCESS_INSTANCE_ID: 'desktop-2',
        OPL_TEMPORAL_ADDRESS: 'temporal.example.test:7233',
      },
      reason: 'external_or_custom_temporal_service_owned_outside_desktop_launchd',
    },
    {
      platform: 'darwin' as const,
      env: {
        OPL_APP_HOST_KIND: 'desktop',
        OPL_APP_PROCESS_INSTANCE_ID: 'desktop-default-without-provenance',
        OPL_TEMPORAL_ADDRESS: '127.0.0.1:7233',
      },
      reason: 'external_or_custom_temporal_service_owned_outside_desktop_launchd',
    },
    {
      platform: 'darwin' as const,
      env: {
        OPL_APP_HOST_KIND: 'desktop',
        OPL_APP_PROCESS_INSTANCE_ID: 'desktop-remote-with-false-provenance',
        OPL_TEMPORAL_ADDRESS: 'temporal.example.test:7233',
        OPL_TEMPORAL_ADDRESS_SOURCE: 'packaged_local_default',
      },
      reason: 'external_or_custom_temporal_service_owned_outside_desktop_launchd',
    },
    {
      platform: 'darwin' as const,
      env: {
        OPL_APP_HOST_KIND: 'desktop',
        OPL_APP_PROCESS_INSTANCE_ID: 'desktop-3',
        OPL_TEMPORAL_SERVICE_START_COMMAND: '/opt/example/temporal-wrapper',
      },
      reason: 'external_or_custom_temporal_service_owned_outside_desktop_launchd',
    },
  ];

  for (const fixture of cases) {
    const result = await reconcileTemporalRuntimeStartupMaintenance({
      ...fixture,
      openRuntime,
      now: () => '2026-07-17T02:00:00.000Z',
    });
    assert.equal(result.status, 'not_applicable');
    assert.equal(result.applicable, false);
    assert.equal(result.ready, null);
    assert.equal(result.reason, fixture.reason);
    assert.equal(result.steps.temporal_service_supervisor.status, 'not_applicable');
  }
  assert.equal(openCount, 0);
});

test('Temporal startup maintenance installs Server then Worker then Scheduler with fresh readback', async () => {
  const order: string[] = [];
  let serviceInspectionCount = 0;
  let workerInstalled = false;
  let schedulerInstalled = false;
  let closed = false;
  const result = await reconcileTemporalRuntimeStartupMaintenance({
    platform: 'darwin',
    env: {
      OPL_APP_HOST_KIND: 'desktop',
      OPL_APP_PROCESS_INSTANCE_ID: 'desktop-happy',
      OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
      OPL_TEMPORAL_ADDRESS: '127.0.0.1:7233',
      OPL_TEMPORAL_ADDRESS_SOURCE: 'packaged_local_default',
    },
    now: () => '2026-07-17T02:01:00.000Z',
    openRuntime: () => fakeRuntimeHandle(() => { closed = true; }),
    inspectService: async () => {
      serviceInspectionCount += 1;
      order.push(`service_status_${serviceInspectionCount}`);
      return serviceLifecycle({ ready: serviceInspectionCount > 1 });
    },
    runServiceSupervisor: (async (_db: unknown, _paths: unknown, action: string) => {
      order.push(`service_${action}`);
      return { status: 'ready', ready: true } as never;
    }) as never,
    runWorkerSupervisor: (async (
      _db: unknown,
      _paths: unknown,
      input: { action: 'status' | 'install' | 'remove' | 'trigger' },
    ) => {
      order.push(`worker_${input.action}`);
      if (input.action === 'install') workerInstalled = true;
      return input.action === 'status'
        ? workerSupervisorStatus(workerInstalled)
        : { status: input.action === 'install' ? 'installed' : 'removed' } as never;
    }) as never,
    inspectWorker: async () => {
      order.push('worker_runtime_status');
      return workerLifecycle(workerInstalled);
    },
    runScheduler: (async (
      _db: unknown,
      _paths: unknown,
      input: { mode: 'scheduler_status' | 'scheduler_install' | 'scheduler_remove' | 'scheduler_trigger' },
    ) => {
      order.push(input.mode);
      if (input.mode === 'scheduler_install') schedulerInstalled = true;
      return input.mode === 'scheduler_status'
        ? schedulerStatus(schedulerInstalled)
        : { status: 'ok', action: { install_status: 'created' } } as never;
    }) as never,
    workerReadinessTimeoutMs: 0,
    sleep: async () => {},
  });

  assert.equal(result.status, 'ready');
  assert.equal(result.ready, true);
  assert.equal(result.failed_step, null);
  assert.equal(result.steps.temporal_service_supervisor.ready, true);
  assert.equal(result.steps.provider_worker_supervisor.ready, true);
  assert.equal(result.steps.temporal_scheduler_cadence.ready, true);
  assert.equal(closed, true);
  assert.deepEqual(order, [
    'service_status_1',
    'service_install',
    'service_status_2',
    'worker_status',
    'worker_install',
    'worker_status',
    'worker_runtime_status',
    'scheduler_status',
    'scheduler_install',
    'scheduler_status',
  ]);
});

test('Temporal startup maintenance repairs configuration drift through idempotent Server install', async () => {
  let inspectCount = 0;
  let installCount = 0;
  const result = await reconcileTemporalRuntimeStartupMaintenance({
    platform: 'darwin',
    env: { OPL_APP_HOST_KIND: 'desktop', OPL_APP_PROCESS_INSTANCE_ID: 'desktop-drift' },
    openRuntime: fakeRuntimeHandle,
    inspectService: async () => {
      inspectCount += 1;
      return serviceLifecycle({
        ready: inspectCount > 1,
        error: inspectCount > 1 ? null : 'temporal_service_supervisor_configuration_drift',
      });
    },
    runServiceSupervisor: (async () => {
      installCount += 1;
      return { status: 'ready', ready: true } as never;
    }) as never,
    runWorkerSupervisor: (async () => workerSupervisorStatus(true)) as never,
    inspectWorker: async () => workerLifecycle(true),
    runScheduler: (async () => schedulerStatus(true)) as never,
    workerReadinessTimeoutMs: 0,
  });

  assert.equal(result.status, 'ready');
  assert.equal(installCount, 1);
  assert.equal(result.steps.temporal_service_supervisor.action, 'install');
});

test('Temporal startup maintenance stops after a failed Server fresh readback', async () => {
  let workerCallCount = 0;
  let schedulerCallCount = 0;
  const result = await reconcileTemporalRuntimeStartupMaintenance({
    platform: 'darwin',
    env: { OPL_APP_HOST_KIND: 'desktop', OPL_APP_PROCESS_INSTANCE_ID: 'desktop-server-fail' },
    openRuntime: fakeRuntimeHandle,
    inspectService: async () => serviceLifecycle({ ready: false }),
    runServiceSupervisor: (async () => ({ status: 'installed_unready', ready: false })) as never,
    runWorkerSupervisor: (async () => {
      workerCallCount += 1;
      return workerSupervisorStatus(false);
    }) as never,
    inspectWorker: async () => workerLifecycle(false),
    runScheduler: (async () => {
      schedulerCallCount += 1;
      return schedulerStatus(false);
    }) as never,
  });

  assert.equal(result.status, 'blocked');
  assert.equal(result.failed_step, 'temporal_service_supervisor');
  assert.equal(result.steps.provider_worker_supervisor.status, 'skipped_dependency_not_ready');
  assert.equal(result.steps.temporal_scheduler_cadence.status, 'skipped_dependency_not_ready');
  assert.equal(workerCallCount, 0);
  assert.equal(schedulerCallCount, 0);
});

test('Temporal startup maintenance stops before Scheduler when Worker does not become ready', async () => {
  let schedulerCallCount = 0;
  let sleepCallCount = 0;
  const result = await reconcileTemporalRuntimeStartupMaintenance({
    platform: 'darwin',
    env: { OPL_APP_HOST_KIND: 'desktop', OPL_APP_PROCESS_INSTANCE_ID: 'desktop-worker-fail' },
    openRuntime: fakeRuntimeHandle,
    inspectService: async () => serviceLifecycle({ ready: true }),
    runServiceSupervisor: (async () => ({ status: 'already_ready', ready: true })) as never,
    runWorkerSupervisor: (async (
      _db: unknown,
      _paths: unknown,
      input: { action: 'status' | 'install' | 'remove' | 'trigger' },
    ) => input.action === 'status'
      ? workerSupervisorStatus(true)
      : { status: 'installed' } as never) as never,
    inspectWorker: async () => workerLifecycle(false),
    runScheduler: (async () => {
      schedulerCallCount += 1;
      return schedulerStatus(false);
    }) as never,
    sleep: async () => { sleepCallCount += 1; },
  });

  assert.equal(result.status, 'blocked');
  assert.equal(result.failed_step, 'provider_worker_supervisor');
  assert.equal(result.steps.temporal_scheduler_cadence.status, 'skipped_dependency_not_ready');
  assert.equal(schedulerCallCount, 0);
  assert.equal(sleepCallCount, 0);
});

test('Temporal startup maintenance safely restarts a stale Worker before installing Scheduler', async () => {
  const order: string[] = [];
  let workerRestarted = false;
  let workerReadbackAfterRestartCount = 0;
  let schedulerInstalled = false;
  let currentTimeMs = 0;
  const result = await reconcileTemporalRuntimeStartupMaintenance({
    platform: 'darwin',
    env: { OPL_APP_HOST_KIND: 'desktop', OPL_APP_PROCESS_INSTANCE_ID: 'desktop-worker-stale' },
    openRuntime: fakeRuntimeHandle,
    inspectService: async () => serviceLifecycle({ ready: true }),
    runServiceSupervisor: (async () => ({ status: 'already_ready', ready: true })) as never,
    runWorkerSupervisor: (async (
      _db: unknown,
      _paths: unknown,
      input: { action: 'status' | 'install' | 'remove' | 'trigger' },
    ) => {
      order.push(`worker_${input.action}`);
      return workerSupervisorStatus(true);
    }) as never,
    inspectWorker: async () => {
      order.push('worker_runtime_status');
      if (!workerRestarted) return workerLifecycle(false, 'worker_source_stale');
      workerReadbackAfterRestartCount += 1;
      return workerLifecycle(workerReadbackAfterRestartCount >= 3);
    },
    repairWorker: (async () => {
      order.push('worker_restart');
      workerRestarted = true;
      return { repair_status: 'executed' } as never;
    }) as never,
    runScheduler: (async (
      _db: unknown,
      _paths: unknown,
      input: { mode: 'scheduler_status' | 'scheduler_install' | 'scheduler_remove' | 'scheduler_trigger' },
    ) => {
      order.push(input.mode);
      if (input.mode === 'scheduler_install') schedulerInstalled = true;
      return input.mode === 'scheduler_status'
        ? schedulerStatus(schedulerInstalled)
        : { status: 'ok', action: { install_status: 'created' } } as never;
    }) as never,
    nowMs: () => currentTimeMs,
    workerReadinessTimeoutMs: 1_000,
    workerReadinessPollMs: 250,
    sleep: async (milliseconds) => {
      order.push(`worker_wait_${milliseconds}`);
      currentTimeMs += milliseconds;
    },
  });

  assert.equal(result.status, 'ready');
  assert.equal(result.steps.provider_worker_supervisor.action, 'restart');
  assert.equal(result.steps.provider_worker_supervisor.ready, true);
  assert.equal(result.steps.temporal_scheduler_cadence.ready, true);
  assert.deepEqual(order, [
    'worker_status',
    'worker_runtime_status',
    'worker_restart',
    'worker_status',
    'worker_runtime_status',
    'worker_wait_250',
    'worker_runtime_status',
    'worker_wait_250',
    'worker_runtime_status',
    'scheduler_status',
    'scheduler_install',
    'scheduler_status',
  ]);
});

test('Temporal startup maintenance blocks after the bounded restart readiness timeout', async () => {
  let currentTimeMs = 0;
  let workerRestarted = false;
  let workerReadbackCount = 0;
  let schedulerCallCount = 0;
  const sleeps: number[] = [];
  const result = await reconcileTemporalRuntimeStartupMaintenance({
    platform: 'darwin',
    env: { OPL_APP_HOST_KIND: 'desktop', OPL_APP_PROCESS_INSTANCE_ID: 'desktop-worker-restart-timeout' },
    openRuntime: fakeRuntimeHandle,
    inspectService: async () => serviceLifecycle({ ready: true }),
    runServiceSupervisor: (async () => ({ status: 'already_ready', ready: true })) as never,
    runWorkerSupervisor: (async () => workerSupervisorStatus(true)) as never,
    inspectWorker: async () => {
      workerReadbackCount += 1;
      return workerRestarted
        ? workerLifecycle(false, 'worker_not_ready')
        : workerLifecycle(false, 'worker_source_stale');
    },
    repairWorker: (async () => {
      workerRestarted = true;
      return { repair_status: 'executed' } as never;
    }) as never,
    runScheduler: (async () => {
      schedulerCallCount += 1;
      return schedulerStatus(false);
    }) as never,
    nowMs: () => currentTimeMs,
    workerReadinessTimeoutMs: 500,
    workerReadinessPollMs: 250,
    sleep: async (milliseconds) => {
      sleeps.push(milliseconds);
      currentTimeMs += milliseconds;
    },
  });

  assert.equal(result.status, 'blocked');
  assert.equal(result.failed_step, 'provider_worker_supervisor');
  assert.equal(result.steps.provider_worker_supervisor.action, 'restart');
  assert.equal(result.steps.provider_worker_supervisor.reason, 'worker_not_ready');
  assert.equal(result.steps.temporal_scheduler_cadence.status, 'skipped_dependency_not_ready');
  assert.equal(workerReadbackCount, 4);
  assert.deepEqual(sleeps, [250, 250]);
  assert.equal(schedulerCallCount, 0);
});

test('Temporal startup maintenance preserves restart action when fresh Worker readback fails', async () => {
  let workerStatusCount = 0;
  let schedulerCallCount = 0;
  const result = await reconcileTemporalRuntimeStartupMaintenance({
    platform: 'darwin',
    env: { OPL_APP_HOST_KIND: 'desktop', OPL_APP_PROCESS_INSTANCE_ID: 'desktop-worker-restart-readback-fail' },
    openRuntime: fakeRuntimeHandle,
    inspectService: async () => serviceLifecycle({ ready: true }),
    runServiceSupervisor: (async () => ({ status: 'already_ready', ready: true })) as never,
    runWorkerSupervisor: (async () => {
      workerStatusCount += 1;
      if (workerStatusCount > 1) throw new Error('fresh_worker_supervisor_readback_failed');
      return workerSupervisorStatus(true);
    }) as never,
    inspectWorker: async () => workerLifecycle(false, 'worker_source_stale'),
    repairWorker: (async () => ({ repair_status: 'executed' })) as never,
    runScheduler: (async () => {
      schedulerCallCount += 1;
      return schedulerStatus(false);
    }) as never,
    workerReadinessTimeoutMs: 0,
    sleep: async () => {},
  });

  assert.equal(result.status, 'blocked');
  assert.equal(result.failed_step, 'provider_worker_supervisor');
  assert.equal(result.steps.provider_worker_supervisor.action, 'restart');
  assert.equal(result.steps.provider_worker_supervisor.reason, 'provider_worker_supervisor_maintenance_failed');
  assert.equal(result.steps.provider_worker_supervisor.error?.message, 'fresh_worker_supervisor_readback_failed');
  assert.equal(result.steps.temporal_scheduler_cadence.status, 'skipped_dependency_not_ready');
  assert.equal(schedulerCallCount, 0);
});

test('Temporal startup maintenance does not replace a loaded Worker owned by another runtime root', async () => {
  const workerActions: string[] = [];
  let schedulerCallCount = 0;
  const result = await reconcileTemporalRuntimeStartupMaintenance({
    platform: 'darwin',
    env: { OPL_APP_HOST_KIND: 'desktop', OPL_APP_PROCESS_INSTANCE_ID: 'desktop-worker-root-drift' },
    openRuntime: fakeRuntimeHandle,
    inspectService: async () => serviceLifecycle({ ready: true }),
    runServiceSupervisor: (async () => ({ status: 'already_ready', ready: true })) as never,
    runWorkerSupervisor: (async (
      _db: unknown,
      _paths: unknown,
      input: { action: 'status' | 'install' | 'remove' | 'trigger' },
    ) => {
      workerActions.push(input.action);
      return {
        status: 'installed',
        supervisor_state: {
          launchctl_loaded: true,
          supervises_family_runtime_root: false,
        },
      } as never;
    }) as never,
    inspectWorker: async () => workerLifecycle(false),
    runScheduler: (async () => {
      schedulerCallCount += 1;
      return schedulerStatus(false);
    }) as never,
    workerReadinessTimeoutMs: 0,
  });

  assert.equal(result.status, 'blocked');
  assert.equal(result.failed_step, 'provider_worker_supervisor');
  assert.equal(
    result.steps.provider_worker_supervisor.reason,
    'provider_worker_supervisor_loaded_for_different_runtime_root',
  );
  assert.deepEqual(workerActions, ['status']);
  assert.equal(schedulerCallCount, 0);
});
