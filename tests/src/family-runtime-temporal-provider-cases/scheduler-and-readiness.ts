import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTemporalSchedulerHealthProjection,
  buildTemporalSchedulerTickWorkflowArgs,
} from '../../../src/modules/runway/family-runtime-temporal-provider-parts/scheduler-cadence.ts';

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
