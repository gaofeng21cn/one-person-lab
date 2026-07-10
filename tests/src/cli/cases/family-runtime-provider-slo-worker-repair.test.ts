import { DatabaseSync } from 'node:sqlite';

import { assert, fs, os, path, test } from '../helpers.ts';
import {
  createFamilyRuntimeQueueTables,
  familyRuntimePaths,
} from '../../../../src/modules/runway/family-runtime-store.ts';
import { createStageAttempt } from '../../../../src/modules/runway/family-runtime-stage-attempts.ts';
import {
  maybeRepairTemporalWorkerForProviderSlo,
} from '../../../../src/modules/runway/family-runtime-provider-slo-executor.ts';
import { temporalWorkerStatus } from './family-runtime-provider-slo-fixtures.ts';

function staleWorker() {
  return temporalWorkerStatus('worker_source_stale', {
    mutationGuardStatus: 'allowed_explicit_developer_supervisor',
    mutationGuardAllowed: true,
  });
}

function supervisorState(root: string) {
  return {
    surface_kind: 'opl_family_runtime_provider_worker_supervisor_state' as const,
    provider_kind: 'temporal' as const,
    supervisor_label: 'ai.opl.family-runtime.provider-worker',
    status: 'not_installed',
    plist_path: '/tmp/ai.opl.family-runtime.provider-worker.plist',
    plist_exists: false,
    launchctl_loaded: false,
    launchctl: null,
    keep_alive: true,
    run_at_load: true,
    resident_worker_process: true,
    supervises_family_runtime_root: false,
    family_runtime_root: root,
    root_match_source: null,
  } as const;
}

function startedWorker() {
  return {
    surface_kind: 'temporal_worker_lifecycle_start' as const,
    provider_kind: 'temporal' as const,
    start_status: 'started' as const,
    spawned_worker_environment: {
      OPL_TEMPORAL_ADDRESS: '127.0.0.1:7233',
      OPL_TEMPORAL_TASK_QUEUE: 'opl-stage-attempts',
      OPL_TEMPORAL_WORKER_STATUS: 'ready',
      OPL_CODEX_BIN: null,
      codex_binary_source: null,
    },
    status: temporalWorkerStatus('ready'),
  };
}

function stoppedWorker() {
  return {
    surface_kind: 'temporal_worker_lifecycle_stop' as const,
    provider_kind: 'temporal' as const,
    stop_status: 'stopped' as const,
    stopped_pid: 12344,
    stop_actions: [],
    orphan_stopped_pids: [],
    orphan_stop_incomplete_pids: [],
    orphan_stop_actions: [],
    before: temporalWorkerStatus('worker_source_stale'),
    status: temporalWorkerStatus('worker_not_ready'),
  };
}

function initializeQueueDb() {
  const paths = familyRuntimePaths();
  fs.mkdirSync(path.dirname(paths.queue_db), { recursive: true });
  const db = new DatabaseSync(paths.queue_db);
  createFamilyRuntimeQueueTables(db);
  return db;
}

test('provider-slo starts a missing Temporal worker before proof', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-provider-slo-worker-start-'));
  const previousStateDir = process.env.OPL_STATE_DIR;
  try {
    process.env.OPL_STATE_DIR = stateRoot;
    let startCount = 0;
    const receipt = await maybeRepairTemporalWorkerForProviderSlo(familyRuntimePaths(), {
      inspectTemporalWorkerLifecycle: async () =>
        startCount === 0 ? temporalWorkerStatus('worker_not_ready') : temporalWorkerStatus('ready'),
      startTemporalWorkerLifecycle: async () => {
        startCount += 1;
        return startedWorker();
      },
    });

    assert.equal(startCount, 1);
    assert.equal(receipt.repair_status, 'executed');
    assert.equal(receipt.repair_action_id, 'start_temporal_worker');
    assert.equal(receipt.after?.lifecycle_status, 'ready');
    assert.equal(receipt.authority_boundary.can_write_domain_truth, false);
  } finally {
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('provider-slo guarded repair restarts a stale Temporal worker', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-provider-slo-worker-restart-'));
  const previousStateDir = process.env.OPL_STATE_DIR;
  let db: DatabaseSync | null = null;
  try {
    process.env.OPL_STATE_DIR = stateRoot;
    db = initializeQueueDb();
    let stopCount = 0;
    let startCount = 0;
    const receipt = await maybeRepairTemporalWorkerForProviderSlo(familyRuntimePaths(), {
      inspectTemporalWorkerLifecycle: async () =>
        startCount === 0 ? staleWorker() : temporalWorkerStatus('ready'),
      stopTemporalWorkerLifecycle: async () => {
        stopCount += 1;
        return stoppedWorker();
      },
      startTemporalWorkerLifecycle: async () => {
        startCount += 1;
        return startedWorker();
      },
      inspectProviderWorkerSupervisor: async (paths) => supervisorState(paths.root),
    });

    assert.equal(stopCount, 1);
    assert.equal(startCount, 1);
    assert.equal(receipt.repair_status, 'executed');
    assert.equal(receipt.repair_action_id, 'restart_temporal_worker');
    assert.equal(receipt.restart_guard?.guard_status, 'ready');
    assert.equal(receipt.after?.lifecycle_status, 'ready');
  } finally {
    db?.close();
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('provider-slo repair refuses to restart while a stage attempt is running', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-provider-slo-worker-active-attempt-'));
  const previousStateDir = process.env.OPL_STATE_DIR;
  let db: DatabaseSync | null = null;
  try {
    process.env.OPL_STATE_DIR = stateRoot;
    db = initializeQueueDb();
    const attempt = createStageAttempt(db, {
      domainId: 'medautoscience',
      stageId: 'domain_owner/default-executor-dispatch',
      providerKind: 'temporal',
      workspaceLocator: { workspace_root: '/tmp/mas' },
      sourceFingerprint: 'source:fresh',
      executorKind: 'codex_cli',
      newAttempt: true,
    }).attempt;
    db.prepare("UPDATE stage_attempts SET status = 'running' WHERE stage_attempt_id = ?").run(
      attempt.stage_attempt_id,
    );
    let mutations = 0;

    const receipt = await maybeRepairTemporalWorkerForProviderSlo(familyRuntimePaths(), {
      inspectTemporalWorkerLifecycle: async () => staleWorker(),
      stopTemporalWorkerLifecycle: async () => {
        mutations += 1;
        return stoppedWorker();
      },
      startTemporalWorkerLifecycle: async () => {
        mutations += 1;
        return startedWorker();
      },
      inspectProviderWorkerSupervisor: async (paths) => supervisorState(paths.root),
    });

    assert.equal(mutations, 0);
    assert.equal(receipt.repair_status, 'blocked');
    assert.deepEqual(receipt.blocker_ids, ['active_stage_attempts_present']);
    assert.equal(receipt.restart_guard?.active_stage_attempt_count, 1);
  } finally {
    db?.close();
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
