import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildTemporalSchedulerHealthProjection,
  buildTemporalSchedulerTickWorkflowArgs,
  resolveTemporalWorkerReadinessStatus,
} from '../../../src/family-runtime-temporal-provider.ts';

test('Temporal scheduler health projection surfaces current stale action repair without domain authority', () => {
  const healthy = buildTemporalSchedulerHealthProjection({
    scheduleStatus: 'active',
    info: {
      num_actions_skipped_overlap: 0,
      running_actions: [],
    },
  });
  const stale = buildTemporalSchedulerHealthProjection({
    scheduleStatus: 'active',
    info: {
      num_actions_skipped_overlap: 59,
      running_actions: [{
        type: 'startWorkflow',
        workflow: {
          workflowId: 'opl-family-runtime-provider-scheduler-tick-2026-05-18T04:05:00Z',
          firstExecutionRunId: '019e3942-31ec-785c-978d-3d904d85423a',
        },
      }],
    },
  });

  assert.equal(healthy.health_status, 'healthy');
  assert.equal(healthy.repair_action.action_id, 'none');
  assert.equal(stale.health_status, 'attention_required');
  assert.equal(stale.running_action_count, 1);
  assert.equal(stale.num_actions_skipped_overlap, 59);
  assert.equal(stale.historical_overlap_skip_observed, true);
  assert.equal(stale.repair_action.action_id, 'inspect_or_repair_stale_scheduler_tick');
  assert.equal(stale.repair_action.terminate_stale_workflow_requires_operator, true);
  assert.equal(stale.authority_boundary.can_terminate_workflow_automatically, false);
  assert.equal(stale.authority_boundary.can_write_domain_truth, false);
});

test('Temporal scheduler health projection requires cadence install when missing', () => {
  const missing = buildTemporalSchedulerHealthProjection({
    scheduleStatus: 'not_installed',
    info: null,
  });

  assert.equal(missing.health_status, 'attention_required');
  assert.equal(missing.repair_action.action_id, 'install_scheduler_cadence');
  assert.equal(
    missing.repair_action.next_command,
    'opl family-runtime scheduler install --provider temporal',
  );
  assert.equal(missing.authority_boundary.can_write_domain_truth, false);
});

test('Temporal scheduler cadence snapshots MAS profile into tick workflow args', () => {
  const previousProfile = process.env.OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_PROFILE;
  try {
    delete process.env.OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_PROFILE;
    const explicit = buildTemporalSchedulerTickWorkflowArgs({
      limit: 7,
      hydrate: true,
      domainProfiles: {
        medautoscience: '/tmp/dm-cvd.local.toml',
      },
    });
    assert.deepEqual(explicit, {
      provider_kind: 'temporal',
      tick_source: 'temporal-schedule',
      force: false,
      limit: 7,
      hydrate: true,
      domain_profiles: {
        medautoscience: '/tmp/dm-cvd.local.toml',
      },
    });

    process.env.OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_PROFILE = '/tmp/env-dm-cvd.local.toml';
    const envBacked = buildTemporalSchedulerTickWorkflowArgs({ limit: 3 });
    assert.equal(envBacked.domain_profiles?.medautoscience, '/tmp/env-dm-cvd.local.toml');
  } finally {
    if (previousProfile === undefined) {
      delete process.env.OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_PROFILE;
    } else {
      process.env.OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_PROFILE = previousProfile;
    }
  }
});

test('Temporal scheduler cadence snapshots MAS profile from active workspace binding', () => {
  const previousProfile = process.env.OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_PROFILE;
  const previousStateDir = process.env.OPL_STATE_DIR;
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-scheduler-binding-profile-'));
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-scheduler-binding-workspace-'));
  const profilePath = path.join(stateRoot, 'dm-cvd.local.toml');
  try {
    delete process.env.OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_PROFILE;
    process.env.OPL_STATE_DIR = stateRoot;
    fs.mkdirSync(path.join(workspaceRoot, 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, 'scripts', 'run-python-clean.sh'), '#!/usr/bin/env bash\nexec python "$@"\n', { mode: 0o755 });
    fs.writeFileSync(profilePath, '[workspace]\nname = "dm-cvd"\n', 'utf8');
    fs.writeFileSync(path.join(stateRoot, 'workspace-registry.json'), `${JSON.stringify({
      version: 'g2',
      bindings: [
        {
          binding_id: 'binding-mas-dm-cvd',
          project_id: 'medautoscience',
          project: 'med-autoscience',
          workspace_path: workspaceRoot,
          label: 'DM-CVD workspace',
          status: 'active',
          direct_entry: {
            command: null,
            manifest_command: null,
            url: null,
            workspace_locator: {
              surface_kind: 'med_autoscience_workspace_profile',
              workspace_root: workspaceRoot,
              profile_ref: profilePath,
              input_path: null,
            },
          },
          created_at: '2026-06-09T00:00:00.000Z',
          updated_at: '2026-06-09T00:00:00.000Z',
          archived_at: null,
        },
      ],
    }, null, 2)}\n`);

    const workflowArgs = buildTemporalSchedulerTickWorkflowArgs({ limit: 5 });

    assert.equal(workflowArgs.domain_profiles?.medautoscience, profilePath);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
    if (previousProfile === undefined) {
      delete process.env.OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_PROFILE;
    } else {
      process.env.OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_PROFILE = previousProfile;
    }
    if (previousStateDir === undefined) {
      delete process.env.OPL_STATE_DIR;
    } else {
      process.env.OPL_STATE_DIR = previousStateDir;
    }
  }
});

test('Temporal scheduler cadence keeps CLI and env MAS profile precedence over active binding', () => {
  const previousProfile = process.env.OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_PROFILE;
  const previousStateDir = process.env.OPL_STATE_DIR;
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-scheduler-profile-precedence-'));
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-scheduler-profile-precedence-workspace-'));
  const bindingProfilePath = path.join(stateRoot, 'binding.local.toml');
  try {
    process.env.OPL_STATE_DIR = stateRoot;
    process.env.OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_PROFILE = '/tmp/env-dm-cvd.local.toml';
    fs.mkdirSync(path.join(workspaceRoot, 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, 'scripts', 'run-python-clean.sh'), '#!/usr/bin/env bash\nexec python "$@"\n', { mode: 0o755 });
    fs.writeFileSync(bindingProfilePath, '[workspace]\nname = "binding"\n', 'utf8');
    fs.writeFileSync(path.join(stateRoot, 'workspace-registry.json'), `${JSON.stringify({
      version: 'g2',
      bindings: [
        {
          binding_id: 'binding-mas-profile-precedence',
          project_id: 'medautoscience',
          project: 'med-autoscience',
          workspace_path: workspaceRoot,
          label: 'Binding profile should not win over env or CLI',
          status: 'active',
          direct_entry: {
            command: null,
            manifest_command: null,
            url: null,
            workspace_locator: {
              surface_kind: 'med_autoscience_workspace_profile',
              workspace_root: workspaceRoot,
              profile_ref: bindingProfilePath,
              input_path: null,
            },
          },
          created_at: '2026-06-09T00:00:00.000Z',
          updated_at: '2026-06-09T00:00:00.000Z',
          archived_at: null,
        },
      ],
    }, null, 2)}\n`);

    const envBacked = buildTemporalSchedulerTickWorkflowArgs({ limit: 3 });
    const cliBacked = buildTemporalSchedulerTickWorkflowArgs({
      limit: 3,
      domainProfiles: { medautoscience: '/tmp/cli-dm-cvd.local.toml' },
    });

    assert.equal(envBacked.domain_profiles?.medautoscience, '/tmp/env-dm-cvd.local.toml');
    assert.equal(cliBacked.domain_profiles?.medautoscience, '/tmp/cli-dm-cvd.local.toml');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
    if (previousProfile === undefined) {
      delete process.env.OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_PROFILE;
    } else {
      process.env.OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_PROFILE = previousProfile;
    }
    if (previousStateDir === undefined) {
      delete process.env.OPL_STATE_DIR;
    } else {
      process.env.OPL_STATE_DIR = previousStateDir;
    }
  }
});

test('Temporal scheduler health projection keeps historical overlap skips informational after recovery', () => {
  const recovered = buildTemporalSchedulerHealthProjection({
    scheduleStatus: 'active',
    info: {
      num_actions_skipped_overlap: 60,
      running_actions: [],
    },
  });

  assert.equal(recovered.health_status, 'healthy');
  assert.equal(recovered.running_action_count, 0);
  assert.equal(recovered.num_actions_skipped_overlap, 60);
  assert.equal(recovered.historical_overlap_skip_observed, true);
  assert.equal(recovered.repair_action.action_id, 'none');
  assert.equal(
    recovered.repair_action.reason,
    'scheduler_cadence_healthy_historical_overlap_skip_retained',
  );
});

test('Temporal worker lifecycle status distinguishes configured, server, and worker readiness gates', () => {
  assert.equal(resolveTemporalWorkerReadinessStatus({
    address: null,
    serverReachable: false,
    workerReady: false,
  }), 'not_configured');
  assert.equal(resolveTemporalWorkerReadinessStatus({
    address: '127.0.0.1:7233',
    serverReachable: false,
    workerReady: false,
  }), 'server_unreachable');
  assert.equal(resolveTemporalWorkerReadinessStatus({
    address: '127.0.0.1:7233',
    serverReachable: true,
    workerReady: false,
  }), 'worker_not_ready');
  assert.equal(resolveTemporalWorkerReadinessStatus({
    address: '127.0.0.1:7233',
    serverReachable: true,
    workerReady: true,
  }), 'ready');
});
