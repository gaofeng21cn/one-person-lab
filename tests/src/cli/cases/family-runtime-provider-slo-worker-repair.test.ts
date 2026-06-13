import { DatabaseSync } from 'node:sqlite';

import { assert, fs, os, path, test } from '../helpers.ts';
import {
  createFamilyRuntimeQueueTables,
} from '../../../../src/family-runtime-store.ts';
import {
  createStageAttempt,
} from '../../../../src/family-runtime-stage-attempts.ts';
import {
  maybeRepairTemporalWorkerForProviderSlo,
} from '../../../../src/family-runtime-provider-slo-executor.ts';
import {
  repairTemporalWorkerForProviderRepair,
} from '../../../../src/family-runtime-provider-worker-repair.ts';
import {
  familyRuntimePaths,
} from '../../../../src/family-runtime-store.ts';
import {
  temporalWorkerStatus,
} from './family-runtime-provider-slo-fixtures.ts';

function explicitDeveloperSupervisorStaleWorker() {
  return temporalWorkerStatus('worker_source_stale', {
    mutationGuardStatus: 'allowed_explicit_developer_supervisor',
    mutationGuardAllowed: true,
  });
}

function initializeQueueDbForCurrentStateDir() {
  const paths = familyRuntimePaths();
  fs.mkdirSync(path.dirname(paths.queue_db), { recursive: true });
  const db = new DatabaseSync(paths.queue_db);
  createFamilyRuntimeQueueTables(db);
  return db;
}

function createActiveStageAttempt(
  db: DatabaseSync,
  status: 'queued' | 'running' | 'checkpointed' | 'human_gate' = 'running',
) {
  const created = createStageAttempt(db, {
    domainId: 'medautoscience',
    stageId: 'domain_owner/default-executor-dispatch',
    providerKind: 'temporal',
    workspaceLocator: {
      workspace_root: '/tmp/mas',
      study_id: 'dm003',
    },
    sourceFingerprint: 'source:fresh',
    executorKind: 'codex_cli',
    taskId: 'task-dm003',
    newAttempt: true,
  });
  db.prepare('UPDATE stage_attempts SET status = ? WHERE stage_attempt_id = ?').run(
    status,
    created.attempt.stage_attempt_id,
  );
  return created.attempt;
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
        return {
          surface_kind: 'temporal_worker_lifecycle_start',
          provider_kind: 'temporal',
          start_status: 'started',
          status: temporalWorkerStatus('ready'),
        };
      },
    });

    assert.equal(startCount, 1);
    assert.equal(receipt.repair_status, 'executed');
    assert.equal(receipt.repair_action_id, 'start_temporal_worker');
    assert.equal(receipt.before.lifecycle_status, 'worker_not_ready');
    assert.ok(receipt.after);
    assert.equal(receipt.after.lifecycle_status, 'ready');
    assert.equal(receipt.authority_boundary.can_write_domain_truth, false);
  } finally {
    if (previousStateDir === undefined) {
      delete process.env.OPL_STATE_DIR;
    } else {
      process.env.OPL_STATE_DIR = previousStateDir;
    }
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime provider repair restarts stale OPL managed Temporal worker', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-provider-repair-worker-restart-'));
  const previousStateDir = process.env.OPL_STATE_DIR;
  let db: DatabaseSync | null = null;
  try {
    process.env.OPL_STATE_DIR = stateRoot;
    db = initializeQueueDbForCurrentStateDir();
    let stopCount = 0;
    let startCount = 0;
    const receipt = await repairTemporalWorkerForProviderRepair(familyRuntimePaths(), {
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
        return {
          surface_kind: 'temporal_worker_lifecycle_start',
          provider_kind: 'temporal',
          start_status: 'started',
          status: temporalWorkerStatus('ready'),
        };
      },
    });

    assert.equal(stopCount, 1);
    assert.equal(startCount, 1);
    assert.equal(receipt.trigger, 'provider_repair');
    assert.equal(receipt.repair_status, 'executed');
    assert.equal(receipt.repair_action_id, 'restart_temporal_worker');
    assert.equal(receipt.command, 'opl family-runtime worker stop --provider temporal && opl family-runtime worker start --provider temporal');
    assert.equal(receipt.before.lifecycle_status, 'worker_source_stale');
    assert.ok(receipt.after);
    assert.equal(receipt.after.lifecycle_status, 'ready');
    assert.equal(receipt.stop?.stop_status, 'stopped');
    assert.equal(receipt.start?.start_status, 'started');
    assert.equal(receipt.restart_guard?.guard_status, 'ready');
    assert.deepEqual(receipt.blocker_ids, []);
    assert.equal(receipt.authority_boundary.can_write_domain_truth, false);
  } finally {
    db?.close();
    if (previousStateDir === undefined) {
      delete process.env.OPL_STATE_DIR;
    } else {
      process.env.OPL_STATE_DIR = previousStateDir;
    }
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
        return {
          surface_kind: 'temporal_worker_lifecycle_start',
          provider_kind: 'temporal',
          start_status: 'started',
          status: temporalWorkerStatus('ready'),
        };
      },
    });

    assert.equal(stopCount, 1);
    assert.equal(startCount, 1);
    assert.equal(receipt.trigger, 'provider_slo_tick');
    assert.equal(receipt.repair_status, 'executed');
    assert.equal(receipt.repair_action_id, 'restart_temporal_worker');
    assert.equal(receipt.before.lifecycle_status, 'worker_source_stale');
    assert.ok(receipt.after);
    assert.equal(receipt.after.lifecycle_status, 'ready');
    assert.equal(receipt.restart_guard?.guard_status, 'ready');
    assert.deepEqual(receipt.blocker_ids, []);
    assert.equal(receipt.authority_boundary.can_write_domain_truth, false);
  } finally {
    db?.close();
    if (previousStateDir === undefined) {
      delete process.env.OPL_STATE_DIR;
    } else {
      process.env.OPL_STATE_DIR = previousStateDir;
    }
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime provider-slo blocks stale worker repair when lifecycle mutation guard fails', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-provider-slo-worker-guard-block-'));
  const previousStateDir = process.env.OPL_STATE_DIR;
  let db: DatabaseSync | null = null;
  try {
    process.env.OPL_STATE_DIR = stateRoot;
    db = initializeQueueDbForCurrentStateDir();
    let stopCount = 0;
    let startCount = 0;
    const receipt = await maybeRepairTemporalWorkerForProviderSlo(familyRuntimePaths(), {
      inspectTemporalWorkerLifecycle: async () => explicitDeveloperSupervisorStaleWorker(),
      stopTemporalWorkerLifecycle: async () => {
        stopCount += 1;
        throw new Error('temporal_worker_mutation_guard_blocked');
      },
      startTemporalWorkerLifecycle: async () => {
        startCount += 1;
        return {
          surface_kind: 'temporal_worker_lifecycle_start',
          provider_kind: 'temporal',
          start_status: 'started',
          status: temporalWorkerStatus('ready'),
        };
      },
    });

    assert.equal(stopCount, 1);
    assert.equal(startCount, 0);
    assert.equal(receipt.trigger, 'provider_slo_tick');
    assert.equal(receipt.repair_status, 'blocked');
    assert.equal(receipt.repair_action_id, 'restart_temporal_worker');
    assert.equal(receipt.before.lifecycle_status, 'worker_source_stale');
    assert.equal(receipt.after, null);
    assert.equal(receipt.restart_guard?.guard_status, 'ready');
    assert.equal(receipt.error?.message, 'temporal_worker_mutation_guard_blocked');
    assert.equal(receipt.authority_boundary.can_write_domain_truth, false);
  } finally {
    db?.close();
    if (previousStateDir === undefined) {
      delete process.env.OPL_STATE_DIR;
    } else {
      process.env.OPL_STATE_DIR = previousStateDir;
    }
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime provider-slo blocks stale worker restart without explicit developer supervisor', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-provider-slo-worker-supervisor-required-'));
  const previousStateDir = process.env.OPL_STATE_DIR;
  let db: DatabaseSync | null = null;
  try {
    process.env.OPL_STATE_DIR = stateRoot;
    db = initializeQueueDbForCurrentStateDir();
    let stopCount = 0;
    let startCount = 0;
    const receipt = await maybeRepairTemporalWorkerForProviderSlo(familyRuntimePaths(), {
      inspectTemporalWorkerLifecycle: async () => temporalWorkerStatus('worker_source_stale', {
        mutationGuardStatus: 'allowed_managed_runtime',
        mutationGuardAllowed: true,
      }),
      stopTemporalWorkerLifecycle: async () => {
        stopCount += 1;
        throw new Error('stop should not run');
      },
      startTemporalWorkerLifecycle: async () => {
        startCount += 1;
        throw new Error('start should not run');
      },
    });

    assert.equal(stopCount, 0);
    assert.equal(startCount, 0);
    assert.equal(receipt.trigger, 'provider_slo_tick');
    assert.equal(receipt.repair_status, 'blocked');
    assert.equal(receipt.repair_action_id, 'restart_temporal_worker');
    assert.equal(receipt.restart_guard?.guard_status, 'blocked');
    assert.deepEqual(receipt.blocker_ids, ['developer_supervisor_required']);
    assert.equal(receipt.restart_guard?.active_stage_attempt_count, 0);
    assert.equal(receipt.after?.lifecycle_status, 'worker_source_stale');
    assert.equal(receipt.authority_boundary.can_write_domain_truth, false);
  } finally {
    db?.close();
    if (previousStateDir === undefined) {
      delete process.env.OPL_STATE_DIR;
    } else {
      process.env.OPL_STATE_DIR = previousStateDir;
    }
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
    const attempt = createActiveStageAttempt(db, 'running');
    let stopCount = 0;
    let startCount = 0;
    const receipt = await maybeRepairTemporalWorkerForProviderSlo(familyRuntimePaths(), {
      inspectTemporalWorkerLifecycle: async () => explicitDeveloperSupervisorStaleWorker(),
      stopTemporalWorkerLifecycle: async () => {
        stopCount += 1;
        throw new Error('stop should not run');
      },
      startTemporalWorkerLifecycle: async () => {
        startCount += 1;
        throw new Error('start should not run');
      },
    });

    assert.equal(stopCount, 0);
    assert.equal(startCount, 0);
    assert.equal(receipt.repair_status, 'blocked');
    assert.deepEqual(receipt.blocker_ids, ['active_stage_attempts_present']);
    assert.equal(receipt.restart_guard?.active_stage_attempt_count, 1);
    assert.equal(receipt.restart_guard?.active_stage_attempts[0]?.stage_attempt_id, attempt.stage_attempt_id);
    assert.equal(receipt.after?.lifecycle_status, 'worker_source_stale');
    assert.equal(receipt.authority_boundary.can_write_domain_truth, false);
  } finally {
    db?.close();
    if (previousStateDir === undefined) {
      delete process.env.OPL_STATE_DIR;
    } else {
      process.env.OPL_STATE_DIR = previousStateDir;
    }
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime provider-slo restart guard summarizes active attempt blockers by status', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-provider-slo-worker-active-summary-'));
  const previousStateDir = process.env.OPL_STATE_DIR;
  let db: DatabaseSync | null = null;
  try {
    process.env.OPL_STATE_DIR = stateRoot;
    db = initializeQueueDbForCurrentStateDir();
    createActiveStageAttempt(db, 'queued');
    createActiveStageAttempt(db, 'running');
    createActiveStageAttempt(db, 'checkpointed');
    createActiveStageAttempt(db, 'human_gate');

    const receipt = await maybeRepairTemporalWorkerForProviderSlo(familyRuntimePaths(), {
      inspectTemporalWorkerLifecycle: async () => explicitDeveloperSupervisorStaleWorker(),
      stopTemporalWorkerLifecycle: async () => {
        throw new Error('stop should not run');
      },
      startTemporalWorkerLifecycle: async () => {
        throw new Error('start should not run');
      },
    });

    assert.equal(receipt.repair_status, 'blocked');
    assert.deepEqual(receipt.blocker_ids, ['active_stage_attempts_present']);
    assert.equal(receipt.restart_guard?.active_stage_attempt_count, 4);
    assert.deepEqual(receipt.restart_guard?.active_stage_attempts_by_status, {
      checkpointed: 1,
      human_gate: 1,
      queued: 1,
      running: 1,
    });
    assert.deepEqual(receipt.restart_guard?.active_stage_attempt_statuses, [
      'checkpointed',
      'human_gate',
      'queued',
      'running',
    ]);
    assert.equal(receipt.restart_guard?.active_stage_attempt_sample_limit, 20);
    assert.equal(receipt.authority_boundary.can_write_domain_truth, false);
  } finally {
    db?.close();
    if (previousStateDir === undefined) {
      delete process.env.OPL_STATE_DIR;
    } else {
      process.env.OPL_STATE_DIR = previousStateDir;
    }
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime provider-slo blocks stale worker restart when Temporal service is unreachable', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-provider-slo-worker-service-unreachable-'));
  const previousStateDir = process.env.OPL_STATE_DIR;
  let db: DatabaseSync | null = null;
  try {
    process.env.OPL_STATE_DIR = stateRoot;
    db = initializeQueueDbForCurrentStateDir();
    let stopCount = 0;
    let startCount = 0;
    const receipt = await maybeRepairTemporalWorkerForProviderSlo(familyRuntimePaths(), {
      inspectTemporalWorkerLifecycle: async () => temporalWorkerStatus('worker_source_stale', {
        mutationGuardStatus: 'allowed_explicit_developer_supervisor',
        mutationGuardAllowed: true,
        serverReachable: false,
      }),
      stopTemporalWorkerLifecycle: async () => {
        stopCount += 1;
        throw new Error('stop should not run');
      },
      startTemporalWorkerLifecycle: async () => {
        startCount += 1;
        throw new Error('start should not run');
      },
    });

    assert.equal(stopCount, 0);
    assert.equal(startCount, 0);
    assert.equal(receipt.repair_status, 'blocked');
    assert.deepEqual(receipt.blocker_ids, ['temporal_service_unreachable']);
    assert.equal(receipt.restart_guard?.temporal_service_reachable, false);
    assert.equal(receipt.after?.lifecycle_status, 'worker_source_stale');
    assert.equal(receipt.authority_boundary.can_write_domain_truth, false);
  } finally {
    db?.close();
    if (previousStateDir === undefined) {
      delete process.env.OPL_STATE_DIR;
    } else {
      process.env.OPL_STATE_DIR = previousStateDir;
    }
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime provider-slo blocks stale worker restart when stage attempt ledger is unavailable', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-provider-slo-worker-ledger-unavailable-'));
  const previousStateDir = process.env.OPL_STATE_DIR;
  try {
    process.env.OPL_STATE_DIR = stateRoot;
    const paths = familyRuntimePaths();
    fs.mkdirSync(path.dirname(paths.queue_db), { recursive: true });
    fs.mkdirSync(paths.queue_db, { recursive: true });
    let stopCount = 0;
    let startCount = 0;
    const receipt = await maybeRepairTemporalWorkerForProviderSlo(paths, {
      inspectTemporalWorkerLifecycle: async () => explicitDeveloperSupervisorStaleWorker(),
      stopTemporalWorkerLifecycle: async () => {
        stopCount += 1;
        throw new Error('stop should not run');
      },
      startTemporalWorkerLifecycle: async () => {
        startCount += 1;
        throw new Error('start should not run');
      },
    });

    assert.equal(stopCount, 0);
    assert.equal(startCount, 0);
    assert.equal(receipt.trigger, 'provider_slo_tick');
    assert.equal(receipt.repair_status, 'blocked');
    assert.equal(receipt.repair_action_id, 'restart_temporal_worker');
    assert.equal(receipt.restart_guard?.surface_kind, 'temporal_worker_source_stale_restart_guard');
    assert.equal(receipt.restart_guard?.guard_status, 'blocked');
    assert.deepEqual(receipt.blocker_ids, ['stage_attempt_ledger_unavailable']);
    assert.equal(receipt.restart_guard?.stage_attempt_ledger_readable, false);
    assert.match(
      receipt.restart_guard?.stage_attempt_ledger_error ?? '',
      /directory|unable to open database file/i,
    );
    assert.equal(receipt.restart_guard?.active_stage_attempt_count, 0);
    assert.deepEqual(receipt.restart_guard?.active_stage_attempts, []);
    assert.equal(receipt.after?.lifecycle_status, 'worker_source_stale');
    assert.equal(receipt.authority_boundary.can_write_domain_truth, false);
  } finally {
    if (previousStateDir === undefined) {
      delete process.env.OPL_STATE_DIR;
    } else {
      process.env.OPL_STATE_DIR = previousStateDir;
    }
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime provider repair surfaces missing Temporal worker runtime dependencies as OPL blocker', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-provider-repair-worker-dependency-'));
  const previousStateDir = process.env.OPL_STATE_DIR;
  try {
    process.env.OPL_STATE_DIR = stateRoot;
    let startCount = 0;
    const receipt = await repairTemporalWorkerForProviderRepair(familyRuntimePaths(), {
      inspectTemporalWorkerLifecycle: async () => temporalWorkerStatus('worker_dependency_unavailable'),
      startTemporalWorkerLifecycle: async () => {
        startCount += 1;
        return {
          surface_kind: 'temporal_worker_lifecycle_start',
          provider_kind: 'temporal',
          start_status: 'started',
          status: temporalWorkerStatus('ready'),
        };
      },
    });

    assert.equal(startCount, 0);
    assert.equal(receipt.trigger, 'provider_repair');
    assert.equal(receipt.repair_status, 'skipped');
    assert.equal(receipt.repair_action_id, 'repair_temporal_worker_runtime_dependencies');
    assert.equal(receipt.before.lifecycle_status, 'worker_dependency_unavailable');
    assert.deepEqual(receipt.before.blockers, ['temporal_worker_dependency_unavailable']);
    assert.equal(receipt.authority_boundary.can_write_domain_truth, false);
  } finally {
    if (previousStateDir === undefined) {
      delete process.env.OPL_STATE_DIR;
    } else {
      process.env.OPL_STATE_DIR = previousStateDir;
    }
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
