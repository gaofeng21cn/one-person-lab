import { DatabaseSync } from 'node:sqlite';

import { assert, fs, os, path, runCli, test } from './helpers.ts';
import {
  createQueueTables,
  withIsolatedFamilyRuntimeEnv,
} from './mas-default-executor-current-source-helpers.ts';

import { runSchedulerTick } from '../../../../../src/modules/runway/family-runtime-scheduler.ts';
import type { inspectFamilyRuntimeProvidersWithLifecycle } from '../../../../../src/modules/runway/family-runtime-providers.ts';
import type { runTemporalProviderSloTick } from '../../../../../src/modules/runway/family-runtime-provider-slo-executor.ts';
import {
  createFamilyRuntimeQueueTables,
  familyRuntimePaths,
} from '../../../../../src/modules/runway/family-runtime-store.ts';

type ProviderInspection = Awaited<ReturnType<typeof inspectFamilyRuntimeProvidersWithLifecycle>>;
type ProviderSloTick = Awaited<ReturnType<typeof runTemporalProviderSloTick>>;

function temporalProviderLifecycle(workerStatus: 'worker_not_ready' | 'ready'): ProviderInspection {
  const workerReady = workerStatus === 'ready';
  return {
    selected_provider: 'temporal',
    allowed_providers: ['temporal', 'local_sqlite'],
    default_resolution: {
      env: 'OPL_FAMILY_RUNTIME_PROVIDER',
      fallback: 'temporal',
      production_required_provider: 'temporal',
      local_sqlite_role: 'dev_ci_offline_diagnostic_baseline',
      fail_closed_when_temporal_not_ready: true,
    },
    providers: {
      temporal: {
        provider_kind: 'temporal',
        status: workerReady ? 'ready' : 'provider_code_landed_unconfigured',
        ready: workerReady,
        degraded_reason: workerReady ? null : 'temporal_worker_not_ready',
        capabilities: [],
        details: {
          worker_ready: workerReady,
          worker_readiness: {
            lifecycle_status: workerStatus,
            readiness_status: workerStatus,
            worker_ready: workerReady,
            blockers: workerReady ? [] : ['temporal_worker_not_ready'],
            repair_action: {
              action_id: workerReady ? 'none' : 'start_temporal_worker',
              next_command: workerReady
                ? 'opl family-runtime residency proof --provider temporal --production'
                : 'opl family-runtime worker start --provider temporal',
            },
            temporal_service_lifecycle: {
              service_status: 'running',
              server_reachable: true,
            },
          },
        },
      },
    },
    provider_catalog: {},
  } as ProviderInspection;
}

function providerSloTick(): ProviderSloTick {
  return {
    surface_id: 'opl_family_runtime_provider_slo_tick',
    provider_kind: 'temporal',
    execution_status: 'skipped',
    skipped: true,
    force: false,
    provider_worker_repair_receipt: {
      surface_kind: 'opl_temporal_provider_worker_repair_receipt',
      provider_kind: 'temporal',
      trigger: 'provider_slo_tick',
      repair_status: 'executed',
      repair_action_id: 'start_temporal_worker',
      command: 'opl family-runtime worker start --provider temporal',
      before: {},
      after: {},
      stop: null,
      start: null,
      error: null,
      can_execute_domain_repair: false,
      authority_boundary: {
        can_authorize_domain_ready: false,
        can_authorize_quality_verdict: false,
        can_authorize_artifact_export: false,
        can_write_domain_truth: false,
        can_execute_domain_repair: false,
      },
    },
    before: {},
    after: {},
    provider_slo_execution_receipt: {
      receipt_status: 'skipped',
      skip_reason: 'cadence_current',
    },
    event_id: 'evt_provider_slo_test',
    authority_boundary: {
      can_authorize_domain_ready: false,
      can_authorize_quality_verdict: false,
      can_authorize_artifact_export: false,
      can_write_domain_truth: false,
    },
  } as ProviderSloTick;
}

test('family-runtime scheduler tick auto-starts worker_not_ready before queue admission', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await withIsolatedFamilyRuntimeEnv(async () => {
      createQueueTables(db);
      let queueTickCalls = 0;
      let inspectionCount = 0;

      const tick = await runSchedulerTick(
        db,
        familyRuntimePaths(),
        { providerKind: 'temporal', limit: 1 },
        () => {
          queueTickCalls += 1;
          return {
            selected_count: 1,
            dispatches: [{ task_id: 'task-1', dispatch_status: 'admitted' }],
          };
        },
        {
          inspectProvidersWithLifecycle: async () => {
            inspectionCount += 1;
            return temporalProviderLifecycle(inspectionCount === 1 ? 'worker_not_ready' : 'ready');
          },
          runProviderSloTick: async () => providerSloTick(),
        },
      );

      assert.equal(tick.status, undefined);
      assert.equal(tick.provider_slo.provider_worker_repair_receipt.repair_status, 'executed');
      assert.equal(tick.provider_slo.provider_worker_repair_receipt.repair_action_id, 'start_temporal_worker');
      assert.equal(tick.provider_readiness_after_slo.ready, true);
      assert.equal(tick.provider_readiness_after_slo.worker_lifecycle_status, 'ready');
      assert.equal(tick.provider_runtime_after_slo.providers.temporal?.ready, true);
      assert.equal(tick.queue_tick.selected_count, 1);
      assert.equal(tick.queue_tick.dispatches.length, 1);
      assert.equal(queueTickCalls, 1);
      assert.equal(inspectionCount, 2);
    });
  } finally {
    db.close();
  }
});

test('family-runtime scheduler tick blocks queue admission while provider remains unready', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-provider-unready-preflight-'));
  const previousStateDir = process.env.OPL_STATE_DIR;
  let queueTickCalls = 0;
  try {
    process.env.OPL_STATE_DIR = stateRoot;
    const paths = familyRuntimePaths();
    fs.mkdirSync(paths.root, { recursive: true });
    const db = new DatabaseSync(paths.queue_db);
    createFamilyRuntimeQueueTables(db);

    const tick = await runSchedulerTick(
      db,
      paths,
      { providerKind: 'temporal', limit: 1 },
      (_source, _limit, _hydrate, _taskScope, _domainProfiles, queueTickOptions) => {
        queueTickCalls += 1;
        assert.equal(queueTickOptions?.dispatchEnabled, false);
        assert.equal(queueTickOptions?.blockedReason, 'temporal_worker_not_ready');
        return {
          selected_count: 1,
          dispatches: [{ task_id: 'task-1', dispatch_status: 'admitted' }],
        };
      },
      {
        inspectProvidersWithLifecycle: async () => temporalProviderLifecycle('worker_not_ready'),
        runProviderSloTick: async () => providerSloTick(),
      },
    );

    assert.equal(tick.status, 'blocked_provider_not_ready');
    assert.ok(tick.provider_liveness_blocker);
    assert.equal(tick.provider_liveness_blocker.blocker_id, 'temporal_worker_not_ready');
    assert.equal(tick.provider_liveness_blocker.next_repair_command, 'opl family-runtime worker start --provider temporal');
    assert.equal(tick.queue_tick.status, 'blocked_provider_not_ready');
    assert.equal(tick.queue_tick.dispatch_blocked_reason, 'temporal_worker_not_ready');
    assert.equal(tick.queue_tick.selected_count, 0);
    assert.equal(tick.queue_tick.dispatches.length, 0);
    assert.equal(queueTickCalls, 1);
    db.close();
  } finally {
    if (previousStateDir === undefined) {
      delete process.env.OPL_STATE_DIR;
    } else {
      process.env.OPL_STATE_DIR = previousStateDir;
    }
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime scheduler tick fails fast on provider preflight before domain dispatch', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-tick-provider-preflight-'));
  const dispatchPath = path.join(stateRoot, 'dispatch');
  const dispatchMarker = path.join(stateRoot, 'dispatch-ran');
  const exportPath = path.join(stateRoot, 'export.mjs');
  try {
    fs.mkdirSync(stateRoot, { recursive: true });
    fs.writeFileSync(
      dispatchPath,
      `#!/usr/bin/env bash
set -euo pipefail
touch ${JSON.stringify(dispatchMarker)}
echo '{"accepted":true,"surface_kind":"should_not_run"}'
`,
      { mode: 0o755 },
    );
    fs.writeFileSync(
      exportPath,
      `process.stdout.write(${JSON.stringify(`${JSON.stringify({
        pending_family_tasks: [
          {
            domain_id: 'medautoscience',
            task_kind: 'domain_route/reconcile-apply',
            dedupe_key: 'mas:dm002:provider-preflight',
            payload: {
              study_id: 'DM002',
              provider_hosted_stage_attempt: true,
              workspace_root: '/tmp/mas',
            },
          },
        ],
      })}\n`)});\n`,
      { mode: 0o755 },
    );
    const env = {
      OPL_STATE_DIR: stateRoot,
      OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH: dispatchPath,
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_EXPORT: `${process.execPath} ${exportPath}`,
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
      OPL_TEMPORAL_WORKER_ENABLED: '',
      OPL_TEMPORAL_WORKER_STATUS: '',
    };

    const tick = runCli(['family-runtime', 'tick', '--source', 'test', '--hydrate'], env).family_runtime_tick;

    assert.equal(tick.provider_preflight.status, 'blocked_provider_not_ready');
    assert.equal(tick.provider_blocker.blocker_id, 'temporal_runtime_not_configured');
    assert.equal(tick.provider_blocker.next_repair_command, 'opl family-runtime service start --provider temporal');
    assert.equal(tick.provider_readiness_after_slo.ready, false);
    assert.equal(tick.hydration.enqueued_count, 1);
    assert.equal(tick.selected_count, 0);
    assert.equal(tick.dispatches.length, 0);
    assert.equal(fs.existsSync(dispatchMarker), false);
    const queue = runCli(['family-runtime', 'queue', 'list'], env).family_runtime_queue;
    assert.equal(queue.queue.total, 1);
    assert.equal(queue.tasks[0].status, 'queued');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime tick without hydrate still fails fast on provider preflight before domain dispatch', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-tick-provider-preflight-no-hydrate-'));
  const dispatchPath = path.join(stateRoot, 'dispatch');
  const dispatchMarker = path.join(stateRoot, 'dispatch-ran');
  try {
    fs.mkdirSync(stateRoot, { recursive: true });
    fs.writeFileSync(
      dispatchPath,
      `#!/usr/bin/env bash
set -euo pipefail
touch ${JSON.stringify(dispatchMarker)}
echo '{"accepted":true,"surface_kind":"should_not_run"}'
`,
      { mode: 0o755 },
    );
    const env = {
      OPL_STATE_DIR: stateRoot,
      OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH: dispatchPath,
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
      OPL_TEMPORAL_WORKER_ENABLED: '',
      OPL_TEMPORAL_WORKER_STATUS: '',
    };
    runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'domain_route/reconcile-apply',
      '--payload',
      '{"study_id":"DM002","provider_hosted_stage_attempt":true,"workspace_root":"/tmp/mas"}',
      '--dedupe-key',
      'mas:dm002:provider-preflight-no-hydrate',
    ], env);

    const tick = runCli(['family-runtime', 'tick', '--source', 'test'], env).family_runtime_tick;

    assert.equal(tick.status, 'blocked_provider_not_ready');
    assert.equal(tick.provider_blocker.blocker_id, 'temporal_runtime_not_configured');
    assert.equal(tick.provider_blocker.next_repair_command, 'opl family-runtime service start --provider temporal');
    assert.equal(tick.provider_readiness_after_slo.ready, false);
    assert.equal(tick.hydration.enqueued_count, 0);
    assert.equal(tick.selected_count, 0);
    assert.equal(tick.dispatches.length, 0);
    assert.equal(fs.existsSync(dispatchMarker), false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime tick defaults to Temporal provider preflight when provider env is unset', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-default-temporal-tick-'));
  const dispatchPath = path.join(stateRoot, 'dispatch');
  const dispatchMarker = path.join(stateRoot, 'dispatch-ran');
  try {
    fs.mkdirSync(stateRoot, { recursive: true });
    fs.writeFileSync(
      dispatchPath,
      `#!/usr/bin/env bash
set -euo pipefail
touch ${JSON.stringify(dispatchMarker)}
echo '{"accepted":true,"surface_kind":"should_not_run"}'
`,
      { mode: 0o755 },
    );
    const env = {
      OPL_STATE_DIR: stateRoot,
      OPL_FAMILY_RUNTIME_PROVIDER: '',
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH: dispatchPath,
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
      OPL_TEMPORAL_WORKER_ENABLED: '',
      OPL_TEMPORAL_WORKER_STATUS: '',
    };
    runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'domain_route/reconcile-apply',
      '--payload',
      '{"study_id":"DM002","provider_hosted_stage_attempt":true,"workspace_root":"/tmp/mas"}',
      '--dedupe-key',
      'mas:dm002:default-temporal-preflight',
    ], env);

    const tick = runCli(['family-runtime', 'tick', '--source', 'test-default-temporal'], env).family_runtime_tick;

    assert.equal(tick.provider_preflight.provider_kind, 'temporal');
    assert.equal(tick.provider_preflight.status, 'blocked_provider_not_ready');
    assert.equal(tick.provider_blocker.blocker_id, 'temporal_runtime_not_configured');
    assert.equal(tick.hydration.enqueued_count, 0);
    assert.equal(tick.selected_count, 0);
    assert.equal(tick.dispatches.length, 0);
    assert.equal(fs.existsSync(dispatchMarker), false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
