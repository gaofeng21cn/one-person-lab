import { assert, createFamilyContractsFixtureRoot, fs, os, path, runCli, test } from '../helpers.ts';
import { applyAppOperatorDrilldownDetail } from '../../../../src/modules/console/runtime-tray-app-operator-drilldown-parts/detail-view.ts';

function selectionProjectionFixture<T extends Record<string, unknown>>(input: T) {
  return {
    package_export_lifecycle_refs: {
      app_release_cohort_id: 'app-release-cohort:99.99.99-test',
      release_package_refs: ['release_package_receipt_ref://app-release/99.99.99-test/package'],
      screenshot_refs: ['screenshot_evidence_ref://app-release/99.99.99-test/window'],
      reload_prompt_user_path_refs: ['reload_prompt_user_path_receipt_ref://app-release/99.99.99-test/reload'],
      provider_state_linkage_refs: ['provider_state_linkage_ref://app-release/99.99.99-test/provider'],
      long_operator_evidence_refs: ['long_operator_evidence_ref://app-release/99.99.99-test/operator'],
    },
    ...input,
  };
}

function providerRoute(action: string, actionKind: string, extra: Record<string, unknown> = {}) {
  return {
    action_id: `provider-scheduler:temporal:${action}`,
    action_kind: actionKind,
    owner: 'opl',
    route_target_kind: 'opl_cli',
    execution_surface: 'opl runtime action execute',
    submit_via: 'opl runtime action execute',
    can_submit_to_safe_action_shell: true,
    opl_cli_args: ['scheduler', action, '--provider', 'temporal'],
    ...extra,
  };
}

test('runtime action execute can run provider scheduler routes from App projection', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-action-execute-scheduler-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  try {
    const projection = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
    }).app_operator_drilldown;
    assert.equal(
      projection.app_execution_bridge.safe_action_routes.some(
        (ref: { action_id: string }) => ref.action_id === 'provider-scheduler:temporal:status',
      ),
      true,
    );

    const execution = runCli([
      'runtime',
      'action',
      'execute',
      '--action',
      'provider-scheduler:temporal:status',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
    }).runtime_operator_action_execution;

    assert.equal(execution.execution.execution_status, 'executed');
    assert.equal(execution.execution.executed_runtime_command, 'opl family-runtime scheduler status --provider temporal');
    assert.equal(execution.authority_boundary.can_write_domain_truth, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('runtime App projection chooses actionable provider routes and ignores guarded mutations', () => {
  const installProjection = applyAppOperatorDrilldownDetail(selectionProjectionFixture({
    operator_action_routing_refs: {
      refs: [
        providerRoute('trigger', 'provider_scheduler_trigger'),
        providerRoute('status', 'provider_scheduler_status'),
        providerRoute('install', 'provider_scheduler_install'),
      ],
    },
    app_execution_bridge: { safe_action_routes: [] },
    authority_boundary: { can_write_domain_truth: false, can_claim_production_ready: false },
  }), 'summary');
  assert.ok(installProjection.attention_first_payload.next_safe_action);
  assert.equal(installProjection.attention_first_payload.next_safe_action.action_id, 'provider-scheduler:temporal:install');

  const guardedProjection = applyAppOperatorDrilldownDetail(selectionProjectionFixture({
    operator_action_routing_refs: {
      refs: [
        providerRoute('trigger', 'provider_scheduler_trigger', {
          route_status: 'blocked_by_provider_worker_mutation_guard',
          provider_worker_mutation_guard: { allowed: false },
          can_submit_to_safe_action_shell: false,
        }),
        providerRoute('status', 'provider_scheduler_status', { default_actionable: true }),
      ],
    },
    app_execution_bridge: { safe_action_routes: [] },
    authority_boundary: { can_write_domain_truth: false, can_claim_production_ready: false },
  }), 'summary');
  assert.equal(guardedProjection.attention_first_payload.next_safe_action, null);
});

test('runtime App projection keeps owner payload work ahead of provider maintenance', () => {
  const domainDispatchRecordRoute = {
    action_id: 'domain_dispatch:medautoscience:attempt-2:record',
    action_kind: 'domain_dispatch_evidence_receipt_record',
    owner: 'opl',
    route_target_kind: 'opl_cli',
    execution_surface: 'opl runtime action execute',
    submit_via: 'opl runtime action execute',
    route_requires_domain_or_app_payload: true,
    can_submit_to_safe_action_shell: true,
    domain_id: 'medautoscience',
    stage_attempt_id: 'attempt-2',
    payload_owner: 'domain_repository_or_app_live_operator',
    payload_template: {
      domain_receipt_refs: [],
      typed_blocker_refs: [],
      owner_chain_refs: [],
      no_regression_refs: [],
      evidence_refs: [],
    },
    authority_boundary: { can_write_domain_truth: false, can_claim_production_ready: false },
  };
  const projection = applyAppOperatorDrilldownDetail(selectionProjectionFixture({
    operator_action_routing_refs: {
      refs: [
        providerRoute('install', 'provider_scheduler_install'),
        {
          action_id: 'provider-slo:temporal:production-proof',
          action_kind: 'provider_slo_cadence_execution',
          can_submit_to_safe_action_shell: true,
          provider_slo_dispatch_status: 'execution_due_or_repair_required',
        },
        domainDispatchRecordRoute,
      ],
    },
    app_execution_bridge: { safe_action_routes: [domainDispatchRecordRoute] },
    authority_boundary: { can_write_domain_truth: false, can_claim_production_ready: false },
  }), 'full');

  assert.ok(projection.attention_first_payload.next_safe_action);
  assert.equal(projection.attention_first_payload.next_safe_action.action_id, 'domain_dispatch:medautoscience:attempt-2:record');
  assert.equal(
    projection.attention_first_payload.owner_delta_first.next_required_delta,
    'domain_dispatch_owner_receipt_or_typed_blocker_payload_required',
  );
});

test('runtime App projection keeps legacy cleanup and diagnostic routes out of default attention', () => {
  for (const ref of [
    {
      action_id: 'legacy-cleanup:medautogrant:apply',
      action_kind: 'legacy_cleanup_apply',
      source_ref: 'opl://agents/medautogrant/legacy-cleanup-plan',
    },
    {
      action_id: 'action:sat_demo:attempt-query',
      action_kind: 'stage_attempt_query',
    },
  ]) {
    const projection = applyAppOperatorDrilldownDetail(selectionProjectionFixture({
      operator_action_routing_refs: { refs: [{ owner: 'opl', route_target_kind: 'opl_cli', ...ref }] },
      app_execution_bridge: { safe_action_routes: [] },
      lifecycle_ledger_refs: {
        refs: [{
          source_ref: 'opl://agents/medautogrant/legacy-cleanup-plan',
          domain_id: 'med-autogrant',
          receipt_ref: 'opl://family-runtime/lifecycle-apply/medautogrant/legacy-cleanup-1/ref',
        }],
      },
      authority_boundary: { can_write_domain_truth: false, can_claim_production_ready: false },
    }), 'summary');

    assert.equal(projection.attention_first_payload.next_safe_action, null);
    assert.equal(projection.attention_first_payload.additional_safe_action_count, 0);
  }
});
