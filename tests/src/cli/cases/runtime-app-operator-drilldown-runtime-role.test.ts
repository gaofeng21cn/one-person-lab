import {
  assert,
  test,
} from '../helpers.ts';
import {
  buildAppOperatorDrilldown,
} from '../../../../src/runtime-tray-app-operator-drilldown.ts';

function emptyDrilldown(detailLevel?: 'summary' | 'full') {
  return buildAppOperatorDrilldown({
    stageAttemptWorkbench: { attempts: [] },
    providerContinuousProof: {},
    domainProjectionIngestion: {},
    domainManifestProjects: [],
    detailLevel,
  }) as any;
}

test('runtime App drilldown exposes Codex App runtime role without long-running task authority', () => {
  const summaryDrilldown = emptyDrilldown();
  assert.equal(summaryDrilldown.codex_app_runtime_role, undefined);
  assert.equal(
    summaryDrilldown.summary.codex_app_runtime_role_status,
    'opl_temporal_hosted_autonomous',
  );
  assert.equal(summaryDrilldown.summary.codex_app_runtime_role_count, 4);
  assert.equal(summaryDrilldown.summary.codex_app_drives_long_running_tasks, false);
  assert.equal(
    summaryDrilldown.summary.codex_app_long_running_task_driver_owner,
    'one-person-lab',
  );
  assert.equal(
    summaryDrilldown.summary.codex_app_long_running_task_driver_substrate,
    'temporal',
  );
  assert.equal(summaryDrilldown.summary.codex_app_production_long_soak_claimed, false);
  assert.equal(
    summaryDrilldown.summary.codex_app_production_evidence_gate_remains_open,
    true,
  );

  const summaryRole = summaryDrilldown.attention_first_payload.codex_app_runtime_role;
  assert.equal(summaryRole.surface_kind, 'opl_app_drilldown_codex_app_runtime_role');
  assert.equal(summaryRole.runtime_policy, 'opl_temporal_hosted_autonomous');
  assert.equal(
    summaryRole.projection_policy,
    'app_start_observe_intervene_display_only_provider_runs_long_tasks',
  );
  assert.deepEqual(summaryRole.codex_app_roles, ['start', 'observe', 'intervene', 'display']);
  assert.equal(summaryRole.default_stage_executor, 'codex_cli');
  assert.equal(summaryRole.codex_app_drives_long_running_tasks, false);
  assert.equal(summaryRole.long_running_task_driver_owner, 'one-person-lab');
  assert.equal(summaryRole.long_running_task_driver_substrate, 'temporal');
  assert.equal(summaryRole.domain_agent_internal_daemon_allowed, false);
  assert.equal(summaryRole.domain_agent_internal_scheduler_allowed, false);
  assert.equal(summaryRole.domain_agent_internal_attempt_loop_allowed, false);
  assert.equal(summaryRole.production_long_soak_claimed, false);
  assert.equal(summaryRole.production_evidence_gate_remains_open, true);
  assert.equal(summaryRole.authority_boundary.can_write_domain_truth, false);
  assert.equal(summaryRole.authority_boundary.can_claim_production_ready, false);
  assert.equal(summaryRole.authority_boundary.can_claim_domain_ready, false);
  assert.equal(summaryRole.authority_boundary.can_close_long_soak, false);
  assert.equal(summaryRole.authority_boundary.can_create_owner_receipt, false);
  assert.equal(summaryRole.authority_boundary.can_drive_long_running_task_loop, false);

  const fullDrilldown = emptyDrilldown('full');
  assert.equal(
    fullDrilldown.codex_app_runtime_role.surface_kind,
    'opl_app_drilldown_codex_app_runtime_role',
  );
  assert.equal(
    fullDrilldown.attention_first_payload.codex_app_runtime_role.runtime_policy,
    'opl_temporal_hosted_autonomous',
  );
});
