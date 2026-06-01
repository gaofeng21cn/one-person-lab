import { DatabaseSync } from 'node:sqlite';

import { assert, fs, os, path, test } from './helpers.ts';
import {
  createQueueTables,
  defaultExecutorPayload,
  withIsolatedFamilyRuntimeEnv,
} from './mas-default-executor-current-source-helpers.ts';

import { enqueueTask } from '../../../../../src/family-runtime-enqueue.ts';
import { runSchedulerTick } from '../../../../../src/family-runtime-scheduler.ts';
import { familyRuntimePaths } from '../../../../../src/family-runtime-store.ts';

function readyProviderLifecycle() {
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
        status: 'ready',
        ready: true,
        degraded_reason: null,
        capabilities: [],
        details: {
          worker_readiness: {
            lifecycle_status: 'ready',
            readiness_status: 'ready',
            worker_ready: true,
            blockers: [],
            repair_action: { action_id: 'none' },
          },
        },
      },
    },
    provider_catalog: {},
  } as const;
}

function skippedProviderSloTick() {
  return {
    surface_id: 'opl_family_runtime_provider_slo_tick',
    provider_kind: 'temporal',
    execution_status: 'skipped',
    skipped: true,
    force: false,
    provider_worker_repair_receipt: {
      repair_status: 'skipped',
      repair_action_id: 'none',
    },
    provider_slo_execution_receipt: {
      receipt_status: 'skipped',
      skip_reason: 'cadence_current',
    },
  } as const;
}

test('family-runtime scheduler tick immediately picks up MAS default-executor pending tasks when provider is ready', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await withIsolatedFamilyRuntimeEnv(async () => {
      const exportFixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-ready-pickup-export-'));
      const exportPath = path.join(exportFixtureRoot, 'export');
      const payload = defaultExecutorPayload('source-ready-owner-action-pickup');
      try {
        createQueueTables(db);
        fs.writeFileSync(
          exportPath,
          `#!/usr/bin/env bash
set -euo pipefail
cat <<'JSON'
{
  "surface_kind": "mas_family_domain_handler_export",
  "pending_family_tasks": [
    {
      "domain_id": "medautoscience",
      "task_kind": "domain_owner/default-executor-dispatch",
      "priority": 80,
      "source": "mas-domain-handler-export",
      "dedupe_key": "mas:dm-cvd:002:default-executor:ready-owner-action-pickup",
      "payload": ${JSON.stringify(payload)}
    }
  ]
}
JSON
`,
          { mode: 0o755 },
        );
        process.env.OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_EXPORT = exportPath;

        let queueTickCalls = 0;
        const tick = await runSchedulerTick(
          db,
          familyRuntimePaths(),
          { providerKind: 'temporal', limit: 1, hydrate: true },
          async (source, limit, hydrate, taskScope) => {
            queueTickCalls += 1;
            const runtime = await import('../../../../../src/family-runtime-tick.ts');
            return runtime.runFamilyRuntimeQueueTick(db, familyRuntimePaths(), {
              source,
              limit,
              hydrate,
              taskScope,
            }, {
              enqueueTask,
              dispatchTask: async (_db, _paths, row) => ({
                status: 'selected_for_immediate_pickup',
                task_id: row.task_id,
                task_kind: row.task_kind,
              }),
            });
          },
          {
            inspectProvidersWithLifecycle: async () => readyProviderLifecycle(),
            runProviderSloTick: async () => skippedProviderSloTick(),
          } as never,
        );
        const queueTick = tick.queue_tick as {
          hydration: { enqueued_count: number };
          selected_count: number;
          dispatches: Array<{ status: string }>;
        };
        const pickupSlo = tick.progress_first_ready_owner_action_pickup_slo as {
          slo_id: string;
          slo_status: string;
          trigger: string;
          hydrated_pending_family_task_count: number;
          same_tick_selected_count: number;
          cadence_wait_required: boolean;
          authority_boundary: { can_write_domain_truth: boolean };
        };

        assert.equal(queueTickCalls, 1);
        assert.equal(tick.provider_readiness_after_slo.ready, true);
        assert.equal(queueTick.hydration.enqueued_count, 1);
        assert.equal(queueTick.selected_count, 1);
        assert.equal(queueTick.dispatches[0].status, 'selected_for_immediate_pickup');
        assert.equal(pickupSlo.slo_id, 'progress_first_ready_owner_action_pickup.v1');
        assert.equal(pickupSlo.slo_status, 'satisfied');
        assert.equal(pickupSlo.trigger, 'same_scheduler_tick_after_provider_ready');
        assert.equal(pickupSlo.hydrated_pending_family_task_count, 1);
        assert.equal(pickupSlo.same_tick_selected_count, 1);
        assert.equal(pickupSlo.cadence_wait_required, false);
        assert.equal(pickupSlo.authority_boundary.can_write_domain_truth, false);

        const queued = db.prepare('SELECT status FROM tasks').all() as Array<{ status: string }>;
        assert.deepEqual(queued.map((row) => row.status), ['queued']);
      } finally {
        delete process.env.OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_EXPORT;
        fs.rmSync(exportFixtureRoot, { recursive: true, force: true });
      }
    });
  } finally {
    db.close();
  }
});
