import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildTemporalSchedulerHealthProjection,
  buildTemporalSchedulerTickWorkflowArgs,
} from '../../../src/modules/runway/family-runtime-temporal-provider-parts/scheduler-cadence.ts';
import { loadFrameworkContracts } from '../../../src/modules/charter/index.ts';
import { bindWorkspace } from '../../../src/modules/workspace/workspace-registry.ts';

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

test('Temporal scheduler cadence resolves explicit, env, and registry domain profiles', () => {
  const previousProfile = process.env.OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_PROFILE;
  const previousGrantProfile = process.env.OPL_FAMILY_RUNTIME_MEDAUTOGRANT_PROFILE;
  const previousStateDir = process.env.OPL_STATE_DIR;
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-scheduler-profiles-'));
  const registryProfile = path.join(stateRoot, 'mas-workspace.toml');
  try {
    process.env.OPL_STATE_DIR = stateRoot;
    fs.mkdirSync(path.join(stateRoot, 'contracts'), { recursive: true });
    fs.writeFileSync(path.join(stateRoot, 'contracts', 'domain_descriptor.json'), `${JSON.stringify({
      domain_id: 'medautoscience',
      standard_agent_interface: {
        version: 'opl_standard_agent_interface.v1',
        workspace_binding: {
          locator_surface_kind: 'fixture_scheduler_workspace',
          default_profile_id: 'portfolio',
          workspace_kind: 'fixture_workspace',
          project_kind: 'fixture_project',
          project_collection_label: 'projects',
          default_workspace_id: 'fixture-workspace',
          default_project_id: 'fixture-project',
          required_locator_fields: ['profile_ref'],
          optional_locator_fields: [],
          entry_command_template: null,
          manifest_command_template: null,
        },
        runtime: {
          runtime_domain_id: 'medautoscience',
          dispatch_command: null,
          registration_ref: null,
        },
        progress: { deliverable_delta_aliases: [], platform_delta_aliases: [] },
        routing: {
          explicit_aliases: ['mas'],
          workstream_ids: ['fixture_scheduler'],
          intent_signals: ['fixture_scheduler'],
          ambiguity_policy: 'require_explicit_workstream',
        },
      },
    }, null, 2)}\n`);
    fs.writeFileSync(registryProfile, 'workspace_name = "scheduler-test"\n');
    delete process.env.OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_PROFILE;
    process.env.OPL_FAMILY_RUNTIME_MEDAUTOGRANT_PROFILE = '/tmp/env-mag-workspace.json';
    bindWorkspace(loadFrameworkContracts(), {
      projectId: 'medautoscience',
      workspacePath: stateRoot,
      profileRef: registryProfile,
      deriveDirectEntry: false,
    });
    const explicit = buildTemporalSchedulerTickWorkflowArgs({
      limit: 7,
      hydrate: true,
      domainProfiles: {
        redcube_ai: '/tmp/explicit-redcube-workspace.json',
      },
    });
    assert.deepEqual(explicit, {
      provider_kind: 'temporal',
      tick_source: 'temporal-schedule',
      force: false,
      limit: 7,
      hydrate: true,
      domain_profiles: {
        medautoscience: registryProfile,
        medautogrant: '/tmp/env-mag-workspace.json',
        redcube_ai: '/tmp/explicit-redcube-workspace.json',
      },
    });

    process.env.OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_PROFILE = '/tmp/env-dm-cvd.local.toml';
    const envBacked = buildTemporalSchedulerTickWorkflowArgs({ limit: 3 });
    const explicitOverEnv = buildTemporalSchedulerTickWorkflowArgs({
      domainProfiles: { medautoscience: '/tmp/cli-dm-cvd.local.toml' },
    });
    assert.equal(envBacked.domain_profiles?.medautoscience, '/tmp/env-dm-cvd.local.toml');
    assert.equal(explicitOverEnv.domain_profiles?.medautoscience, '/tmp/cli-dm-cvd.local.toml');
  } finally {
    if (previousProfile === undefined) {
      delete process.env.OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_PROFILE;
    } else {
      process.env.OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_PROFILE = previousProfile;
    }
    if (previousGrantProfile === undefined) {
      delete process.env.OPL_FAMILY_RUNTIME_MEDAUTOGRANT_PROFILE;
    } else {
      process.env.OPL_FAMILY_RUNTIME_MEDAUTOGRANT_PROFILE = previousGrantProfile;
    }
    if (previousStateDir === undefined) {
      delete process.env.OPL_STATE_DIR;
    } else {
      process.env.OPL_STATE_DIR = previousStateDir;
    }
    fs.rmSync(stateRoot, { recursive: true, force: true });
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
