import {
  assert,
  fs,
  os,
  path,
  test,
} from '../helpers.ts';
import {
  buildAppOperatorDrilldown,
} from '../../../../src/modules/console/runtime-tray-app-operator-drilldown.ts';

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
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-codex-app-runtime-role-'));
  const previousStateDir = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = stateRoot;
  try {
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
  assert.equal(
    summaryRole.production_evidence_followthrough.surface_kind,
    'opl_app_drilldown_codex_app_production_evidence_followthrough',
  );
  assert.equal(summaryRole.production_evidence_followthrough.status, 'long_soak_gate_open');
  assert.equal(summaryRole.production_evidence_followthrough.open_gate_count, 1);
  assert.deepEqual(summaryRole.production_evidence_followthrough.open_gate_ids, [
    'temporal_hosted_long_soak_refs',
  ]);
  assert.equal(
    summaryRole.production_evidence_followthrough.payload_owner,
    'app_live_operator_or_opl_provider_owner',
  );
  assert.equal(
    summaryRole.production_evidence_followthrough.required_return_shapes.includes(
      'temporal_hosted_long_soak_ref',
    ),
    true,
  );
  assert.deepEqual(
    summaryRole.production_evidence_followthrough.observation_workorder_commands.start,
    [
      'runtime',
      'codex-app-runtime-evidence',
      'long-soak',
      'start',
      '--minimum-duration-minutes',
      '<n>',
      '--evidence-dir',
      '<path>',
    ],
  );
  assert.deepEqual(
    summaryRole.production_evidence_followthrough.observation_workorder_commands.event,
    [
      'runtime',
      'codex-app-runtime-evidence',
      'long-soak',
      'event',
      '--workorder-file',
      '<path>',
      '--event-kind',
      '<kind>',
      '--evidence-ref',
      '<ref>',
    ],
  );
  assert.deepEqual(
    summaryRole.production_evidence_followthrough.observation_workorder_commands.finish,
    [
      'runtime',
      'codex-app-runtime-evidence',
      'long-soak',
      'finish',
      '--workorder-file',
      '<path>',
    ],
  );
  assert.equal(
    'app_release_record_payload' in summaryRole.production_evidence_followthrough
      .observation_workorder_commands,
    false,
  );
  assert.equal(
    summaryRole.production_evidence_followthrough.authority_boundary.can_close_long_soak,
    false,
  );
  assert.equal(
    summaryRole.production_evidence_followthrough.authority_boundary.can_claim_production_ready,
    false,
  );
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
    fullDrilldown.codex_app_runtime_role.production_evidence_followthrough
      .empty_payload_template_is_success_evidence,
    false,
  );
  const runtimeEvidenceStep =
    summaryDrilldown.attention_first_payload.evidence_next_steps.items.find(
      (item: { step_kind: string }) => item.step_kind === 'codex_app_runtime_evidence_followthrough',
    );
  assert.equal(runtimeEvidenceStep.owner, 'one-person-lab');
  assert.equal(runtimeEvidenceStep.status, 'long_soak_gate_open');
  assert.equal(runtimeEvidenceStep.open_gate_count, 1);
  assert.equal(
    runtimeEvidenceStep.payload_workorder.surface_kind,
    'opl_codex_app_runtime_evidence_payload_workorder',
  );
  assert.equal(
    'app_release_verify_receipt' in runtimeEvidenceStep.payload_workorder
      .observation_workorder_commands,
    false,
  );
  assert.equal(
    runtimeEvidenceStep.payload_workorder.observation_workorder_commands.start[1],
    'codex-app-runtime-evidence',
  );
  assert.equal(runtimeEvidenceStep.can_close_long_soak, false);
  assert.equal(runtimeEvidenceStep.can_claim_production_ready, false);
  assert.equal(
    fullDrilldown.attention_first_payload.codex_app_runtime_role.runtime_policy,
    'opl_temporal_hosted_autonomous',
  );
  } finally {
    if (previousStateDir === undefined) {
      delete process.env.OPL_STATE_DIR;
    } else {
      process.env.OPL_STATE_DIR = previousStateDir;
    }
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
