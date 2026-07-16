import { DatabaseSync } from 'node:sqlite';

import { assert, fs, os, path, test } from '../helpers.ts';
import {
  createFamilyRuntimeQueueTables,
  familyRuntimePaths,
} from '../../../../src/modules/runway/family-runtime-store.ts';
import {
  createStageAttempt,
} from '../../../../src/modules/runway/family-runtime-stage-attempts.ts';
import {
  maybeRepairTemporalWorkerForProviderSlo,
} from '../../../../src/modules/runway/family-runtime-provider-slo-executor.ts';
import {
  temporalWorkerStatus,
} from './family-runtime-provider-slo-fixtures.ts';

function explicitDeveloperSupervisorStaleWorker() {
  return temporalWorkerStatus('worker_source_stale', {
    mutationGuardStatus: 'allowed_explicit_developer_supervisor',
    mutationGuardAllowed: true,
  });
}

function supervisorState(paths: { root: string }, installed = true) {
  return {
    surface_kind: 'opl_family_runtime_provider_worker_supervisor_state' as const,
    provider_kind: 'temporal' as const,
    supervisor_label: 'ai.opl.family-runtime.provider-worker',
    status: installed ? 'installed' : 'not_installed',
    plist_path: '/tmp/ai.opl.family-runtime.provider-worker.plist',
    plist_exists: installed,
    launchctl_loaded: installed,
    launchctl: null,
    keep_alive: true,
    run_at_load: true,
    throttle_interval_seconds: 15,
    resident_worker_process: true,
    supervises_family_runtime_root: installed,
    family_runtime_root: paths.root,
    root_match_source: installed ? 'plist' : null,
  };
}

function initializeQueueDbForCurrentStateDir() {
  const paths = familyRuntimePaths();
  fs.mkdirSync(path.dirname(paths.queue_db), { recursive: true });
  const db = new DatabaseSync(paths.queue_db);
  createFamilyRuntimeQueueTables(db);
  return db;
}

function createActiveStageAttempt(db: DatabaseSync) {
  const created = createStageAttempt(db, {
    domainId: 'redcube', stageId: 'artifact_creation', providerKind: 'temporal',
    workspaceLocator: { workspace_root: '/tmp/redcube-runtime' },
    sourceFingerprint: 'source:fresh', executorKind: 'codex_cli', newAttempt: true,
  });
  db.prepare('UPDATE stage_attempts SET status = ? WHERE stage_attempt_id = ?')
    .run('running', created.attempt.stage_attempt_id);
  return created.attempt;
}

function temporalWorkerStartedLifecycle() {
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

test('family-runtime provider-slo auto-starts OPL managed Temporal worker before proof', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-provider-slo-worker-autostart-'));
  const previousStateDir = process.env.OPL_STATE_DIR;
  try {
    process.env.OPL_STATE_DIR = stateRoot;
    let startCount = 0;
    const receipt = await maybeRepairTemporalWorkerForProviderSlo(familyRuntimePaths(), {
      inspectTemporalWorkerLifecycle: async () =>
        startCount === 0 ? temporalWorkerStatus('worker_not_ready') : temporalWorkerStatus('ready'),
      startTemporalWorkerLifecycle: async () => {
        startCount += 1;
        return temporalWorkerStartedLifecycle();
      },
    });

    assert.equal(startCount, 1);
    assert.equal(receipt.repair_status, 'executed');
    assert.equal(receipt.repair_action_id, 'start_temporal_worker');
    assert.equal(receipt.after?.lifecycle_status, 'ready');
  } finally {
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime provider-slo restarts stale OPL managed Temporal worker before queue admission', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-provider-slo-worker-restart-'));
  const previousStateDir = process.env.OPL_STATE_DIR;
  let db: DatabaseSync | null = null;
  try {
    process.env.OPL_STATE_DIR = stateRoot;
    db = initializeQueueDbForCurrentStateDir();
    let stopCount = 0;
    let startCount = 0;
    const receipt = await maybeRepairTemporalWorkerForProviderSlo(familyRuntimePaths(), {
      inspectTemporalWorkerLifecycle: async () =>
        startCount === 0 ? explicitDeveloperSupervisorStaleWorker() : temporalWorkerStatus('ready'),
      stopTemporalWorkerLifecycle: async () => {
        stopCount += 1;
        return {
          surface_kind: 'temporal_worker_lifecycle_stop',
          provider_kind: 'temporal',
          stop_status: 'stopped',
          stopped_pid: 12344,
          stop_actions: [],
          orphan_stopped_pids: [],
          orphan_stop_incomplete_pids: [],
          orphan_stop_actions: [],
          before: temporalWorkerStatus('worker_source_stale'),
          status: temporalWorkerStatus('worker_not_ready'),
        };
      },
      startTemporalWorkerLifecycle: async () => {
        startCount += 1;
        return temporalWorkerStartedLifecycle();
      },
      inspectProviderWorkerSupervisor: async (paths) => supervisorState(paths, false),
    });

    assert.equal(stopCount, 1);
    assert.equal(startCount, 1);
    assert.equal(receipt.repair_status, 'executed');
    assert.equal(receipt.restart_guard?.guard_status, 'ready');
    assert.equal(receipt.restart_strategy, 'manual_stop_then_start');
  } finally {
    db?.close();
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime provider-slo blocks stale worker restart while active stage attempt exists', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-provider-slo-worker-active-attempt-'));
  const previousStateDir = process.env.OPL_STATE_DIR;
  let db: DatabaseSync | null = null;
  try {
    process.env.OPL_STATE_DIR = stateRoot;
    db = initializeQueueDbForCurrentStateDir();
    const attempt = createActiveStageAttempt(db);
    let mutations = 0;
    const receipt = await maybeRepairTemporalWorkerForProviderSlo(familyRuntimePaths(), {
      inspectTemporalWorkerLifecycle: async () => explicitDeveloperSupervisorStaleWorker(),
      stopTemporalWorkerLifecycle: async () => { mutations += 1; throw new Error('stop should not run'); },
      startTemporalWorkerLifecycle: async () => { mutations += 1; throw new Error('start should not run'); },
    });

    assert.equal(mutations, 0);
    assert.equal(receipt.repair_status, 'blocked');
    assert.deepEqual(receipt.blocker_ids, ['active_stage_attempts_present']);
    assert.equal(receipt.restart_guard?.active_stage_attempts[0]?.stage_attempt_id, attempt.stage_attempt_id);
  } finally {
    db?.close();
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

for (const [name, blockerId, mutationGuardStatus, serverReachable, ledgerReadable] of [
  ['without explicit developer supervisor', 'developer_supervisor_required', 'allowed_managed_runtime', true, true],
  ['when Temporal service is unreachable', 'temporal_service_unreachable', 'allowed_explicit_developer_supervisor', false, true],
  ['when stage attempt ledger is unreadable', 'stage_attempt_ledger_unavailable', 'allowed_explicit_developer_supervisor', true, false],
] as const) {
  test(`family-runtime provider-slo fails closed ${name}`, async () => {
    const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-provider-slo-guard-'));
    const previousStateDir = process.env.OPL_STATE_DIR;
    let db: DatabaseSync | null = null;
    try {
      process.env.OPL_STATE_DIR = stateRoot;
      const paths = familyRuntimePaths();
      if (ledgerReadable) db = initializeQueueDbForCurrentStateDir();
      else fs.mkdirSync(paths.queue_db, { recursive: true });
      let mutations = 0;
      const receipt = await maybeRepairTemporalWorkerForProviderSlo(paths, {
        inspectTemporalWorkerLifecycle: async () => temporalWorkerStatus('worker_source_stale',
          { mutationGuardStatus, mutationGuardAllowed: true, serverReachable }),
        stopTemporalWorkerLifecycle: async () => { mutations += 1; throw new Error('stop should not run'); },
        startTemporalWorkerLifecycle: async () => { mutations += 1; throw new Error('start should not run'); },
      });

      assert.equal(mutations, 0, blockerId);
      assert.equal(receipt.repair_status, 'blocked', blockerId); assert.deepEqual(receipt.blocker_ids, [blockerId], blockerId);
      assert.equal(receipt.restart_guard?.stage_attempt_ledger_readable, ledgerReadable);
      assert.equal(receipt.stop, null); assert.equal(receipt.start, null);
    } finally {
      db?.close();
      if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
      else process.env.OPL_STATE_DIR = previousStateDir;
      fs.rmSync(stateRoot, { recursive: true, force: true });
    }
  });
}
