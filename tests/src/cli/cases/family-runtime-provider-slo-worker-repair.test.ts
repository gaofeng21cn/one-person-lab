import { assert, fs, os, path, test } from '../helpers.ts';
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
  try {
    process.env.OPL_STATE_DIR = stateRoot;
    let stopCount = 0;
    let startCount = 0;
    const receipt = await repairTemporalWorkerForProviderRepair(familyRuntimePaths(), {
      inspectTemporalWorkerLifecycle: async () =>
        startCount === 0 ? temporalWorkerStatus('worker_source_stale') : temporalWorkerStatus('ready'),
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

test('family-runtime provider-slo restarts stale OPL managed Temporal worker before queue admission', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-provider-slo-worker-restart-'));
  const previousStateDir = process.env.OPL_STATE_DIR;
  try {
    process.env.OPL_STATE_DIR = stateRoot;
    let stopCount = 0;
    let startCount = 0;
    const receipt = await maybeRepairTemporalWorkerForProviderSlo(familyRuntimePaths(), {
      inspectTemporalWorkerLifecycle: async () =>
        startCount === 0 ? temporalWorkerStatus('worker_source_stale') : temporalWorkerStatus('ready'),
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

test('family-runtime provider-slo blocks stale worker repair when lifecycle mutation guard fails', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-provider-slo-worker-guard-block-'));
  const previousStateDir = process.env.OPL_STATE_DIR;
  try {
    process.env.OPL_STATE_DIR = stateRoot;
    let stopCount = 0;
    let startCount = 0;
    const receipt = await maybeRepairTemporalWorkerForProviderSlo(familyRuntimePaths(), {
      inspectTemporalWorkerLifecycle: async () => temporalWorkerStatus('worker_source_stale'),
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
    assert.equal(receipt.error?.message, 'temporal_worker_mutation_guard_blocked');
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
