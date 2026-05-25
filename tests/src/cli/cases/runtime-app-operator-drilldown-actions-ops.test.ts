import {
  assert,
  buildManifestCommand,
  createFamilyContractsFixtureRoot,
  fs,
  loadFamilyManifestFixtures,
  os,
  path,
  repoRoot,
  runCli,
  test,
} from '../helpers.ts';
import {
  applyAppOperatorDrilldownDetail,
} from '../../../../src/runtime-tray-app-operator-drilldown-parts/detail-view.ts';

function record(value: unknown): Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

test('runtime action execute can run provider scheduler routes from App drilldown', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-action-execute-scheduler-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  try {
    const drilldown = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
    }).app_operator_drilldown;

    assert.equal(
      drilldown.operator_action_routing_refs.refs.some(
        (ref: { action_id: string; action_kind: string }) =>
          ref.action_id === 'provider-scheduler:temporal:status'
          && ref.action_kind === 'provider_scheduler_status',
      ),
      true,
    );
    assert.equal(
      drilldown.app_execution_bridge.safe_action_routes.some(
        (ref: { action_id: string; can_submit_to_safe_action_shell: boolean }) =>
          ref.action_id === 'provider-scheduler:temporal:status'
          && ref.can_submit_to_safe_action_shell,
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

    assert.equal(execution.execution.execution_kind, 'opl_cli_provider_scheduler');
    assert.equal(execution.execution.execution_status, 'executed');
    assert.equal(
      execution.execution.executed_runtime_command,
      'opl family-runtime scheduler status --provider temporal',
    );
    assert.equal(
      execution.execution.result.family_runtime_scheduler_cadence.status,
      'blocked_provider_not_ready',
    );
    assert.equal(execution.authority_boundary.can_write_domain_truth, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('runtime App drilldown selects provider scheduler install before manual trigger', () => {
  const route = (action: string, actionKind: string) => ({
    action_id: `provider-scheduler:temporal:${action}`,
    action_kind: actionKind,
    owner: 'opl',
    route_target_kind: 'opl_cli',
    execution_surface: 'opl runtime action execute',
    submit_via: 'opl runtime action execute',
    can_submit_to_safe_action_shell: true,
    opl_cli_args: ['scheduler', action, '--provider', 'temporal'],
  });
  const drilldown = applyAppOperatorDrilldownDetail({
    operator_action_routing_refs: {
      refs: [
        route('trigger', 'provider_scheduler_trigger'),
        route('tick', 'provider_scheduler_tick'),
        route('status', 'provider_scheduler_status'),
        route('install', 'provider_scheduler_install'),
      ],
    },
    app_execution_bridge: {
      safe_action_routes: [],
    },
    authority_boundary: {
      can_write_domain_truth: false,
      can_claim_production_ready: false,
    },
  }, 'summary');
  const nextSafeAction = drilldown.attention_first_payload.next_safe_action;
  assert.ok(nextSafeAction);

  assert.equal(
    nextSafeAction.action_id,
    'provider-scheduler:temporal:install',
  );
  assert.equal(
    nextSafeAction.action_kind,
    'provider_scheduler_install',
  );
  assert.deepEqual(nextSafeAction.submit_args, [
    'runtime',
    'action',
    'execute',
    '--action',
    'provider-scheduler:temporal:install',
  ]);
});

test('runtime App drilldown selects provider SLO proof action before scheduler install when proof repair is due', () => {
  const route = (action: string, actionKind: string) => ({
    action_id: `provider-scheduler:temporal:${action}`,
    action_kind: actionKind,
    owner: 'opl',
    route_target_kind: 'opl_cli',
    execution_surface: 'opl runtime action execute',
    submit_via: 'opl runtime action execute',
    can_submit_to_safe_action_shell: true,
    opl_cli_args: ['scheduler', action, '--provider', 'temporal'],
  });
  const drilldown = applyAppOperatorDrilldownDetail({
    operator_action_routing_refs: {
      refs: [
        route('install', 'provider_scheduler_install'),
        {
          ref: 'opl family-runtime residency proof --provider temporal --production',
          action_id: 'provider-slo:temporal:production-proof',
          action_kind: 'provider_slo_cadence_execution',
          owner: 'opl',
          route_target_kind: 'opl_cli',
          execution_policy: 'opl_safe_action_shell',
          execution_surface: 'opl runtime action execute',
          submit_via: 'opl runtime action execute',
          can_submit_to_safe_action_shell: true,
          provider_kind: 'temporal',
          provider_repair_action_id: 'restart_temporal_worker',
          provider_repair_command:
            'opl family-runtime worker stop --provider temporal && opl family-runtime worker start --provider temporal',
          provider_required_next_action: 'Restart stale Temporal worker before rerunning provider proof.',
          provider_slo_dispatch_status: 'execution_due_or_repair_required',
          opl_cli_args: ['residency', 'proof', '--provider', 'temporal', '--production'],
          authority_boundary: {
            can_write_domain_truth: false,
            can_claim_production_ready: false,
          },
        },
      ],
    },
    app_execution_bridge: {
      safe_action_routes: [],
    },
    authority_boundary: {
      can_write_domain_truth: false,
      can_claim_production_ready: false,
    },
  }, 'summary');
  const nextSafeAction = drilldown.attention_first_payload.next_safe_action;
  assert.ok(nextSafeAction);

  assert.equal(
    nextSafeAction.action_id,
    'provider-slo:temporal:production-proof',
  );
  assert.equal(
    nextSafeAction.action_kind,
    'provider_slo_cadence_execution',
  );
  assert.equal(nextSafeAction.provider_repair_action_id, 'restart_temporal_worker');
  assert.equal(
    nextSafeAction.provider_repair_command,
    'opl family-runtime worker stop --provider temporal && opl family-runtime worker start --provider temporal',
  );
  assert.equal(
    nextSafeAction.provider_required_next_action,
    'Restart stale Temporal worker before rerunning provider proof.',
  );
  assert.deepEqual(nextSafeAction.submit_args, [
    'runtime',
    'action',
    'execute',
    '--action',
    'provider-slo:temporal:production-proof',
  ]);
});

test('runtime App drilldown skips current provider SLO proof and surfaces domain dispatch payload work', () => {
  const providerSloCurrentRoute = {
    ref: 'opl family-runtime residency proof --provider temporal --production',
    action_id: 'provider-slo:temporal:production-proof',
    action_kind: 'provider_slo_cadence_execution',
    owner: 'opl',
    route_target_kind: 'opl_cli',
    execution_policy: 'opl_safe_action_shell',
    execution_surface: 'opl runtime action execute',
    submit_via: 'opl runtime action execute',
    can_submit_to_safe_action_shell: true,
    provider_kind: 'temporal',
    provider_slo_dispatch_status: 'cadence_current',
    opl_cli_args: ['residency', 'proof', '--provider', 'temporal', '--production'],
    authority_boundary: {
      can_write_domain_truth: false,
      can_claim_production_ready: false,
    },
  };
  const domainDispatchRecordRoute = {
    action_id: 'domain_dispatch:medautoscience:attempt-1:record',
    action_kind: 'domain_dispatch_evidence_receipt_record',
    owner: 'opl',
    route_target_kind: 'opl_cli',
    execution_surface: 'opl runtime action execute',
    submit_via: 'opl runtime action execute',
    route_requires_domain_or_app_payload: true,
    can_close_without_domain_or_app_payload: false,
    can_submit_to_safe_action_shell: true,
    payload_owner: 'domain_repository_or_app_live_operator',
    payload_template: {
      domain_receipt_refs: [],
      typed_blocker_refs: [],
      owner_chain_refs: [],
      no_regression_refs: [],
      evidence_refs: [],
    },
    required_operator_payload_refs: [
      'domain_receipt_refs',
      'typed_blocker_refs',
      'owner_chain_refs',
      'no_regression_refs',
      'evidence_refs',
    ],
    authority_boundary: {
      can_write_domain_truth: false,
      can_claim_production_ready: false,
    },
  };
  const drilldown = applyAppOperatorDrilldownDetail({
    operator_action_routing_refs: {
      refs: [
        providerSloCurrentRoute,
        domainDispatchRecordRoute,
      ],
    },
    app_execution_bridge: {
      safe_action_routes: [
        providerSloCurrentRoute,
        domainDispatchRecordRoute,
      ],
    },
    authority_boundary: {
      can_write_domain_truth: false,
      can_claim_production_ready: false,
    },
  }, 'summary');
  const nextSafeAction = drilldown.attention_first_payload.next_safe_action;
  assert.ok(nextSafeAction);

  assert.equal(
    nextSafeAction.action_id,
    'domain_dispatch:medautoscience:attempt-1:record',
  );
  assert.equal(
    nextSafeAction.action_kind,
    'domain_dispatch_evidence_receipt_record',
  );
  assert.deepEqual(nextSafeAction.submit_args, [
    'runtime',
    'action',
    'execute',
    '--action',
    'domain_dispatch:medautoscience:attempt-1:record',
    '--payload-file',
    '<payload.json>',
  ]);
  assert.equal(nextSafeAction.route_requires_domain_or_app_payload, true);
  assert.equal(nextSafeAction.can_execute_domain_action_directly, false);
  const payloadWorkorder = record(nextSafeAction.payload_workorder);
  const authorityBoundary = record(payloadWorkorder.authority_boundary);
  assert.equal(authorityBoundary.can_claim_production_ready, false);
});

test('runtime App drilldown selects provider worker repair before provider proof when worker source is stale', () => {
  const drilldown = applyAppOperatorDrilldownDetail({
    operator_action_routing_refs: {
      refs: [
        {
          ref: 'opl family-runtime residency proof --provider temporal --production',
          action_id: 'provider-slo:temporal:production-proof',
          action_kind: 'provider_slo_cadence_execution',
          owner: 'opl',
          route_target_kind: 'opl_cli',
          execution_policy: 'opl_safe_action_shell',
          execution_surface: 'opl runtime action execute',
          submit_via: 'opl runtime action execute',
          can_submit_to_safe_action_shell: true,
          provider_kind: 'temporal',
          provider_repair_action_id: 'restart_temporal_worker',
          provider_repair_command:
            'opl family-runtime worker stop --provider temporal && opl family-runtime worker start --provider temporal',
          provider_required_next_action: 'Restart stale Temporal worker before rerunning provider proof.',
          provider_slo_dispatch_status: 'execution_due_or_repair_required',
          opl_cli_args: ['residency', 'proof', '--provider', 'temporal', '--production'],
          authority_boundary: {
            can_write_domain_truth: false,
            can_claim_production_ready: false,
          },
        },
        {
          ref: 'opl family-runtime worker stop --provider temporal && opl family-runtime worker start --provider temporal',
          action_id: 'provider-worker:temporal:restart',
          action_kind: 'provider_worker_restart',
          owner: 'opl',
          route_target_kind: 'opl_cli',
          execution_policy: 'opl_safe_action_shell',
          execution_surface: 'opl runtime action execute',
          submit_via: 'opl runtime action execute',
          can_submit_to_safe_action_shell: true,
          provider_kind: 'temporal',
          provider_worker_lifecycle_status: 'worker_source_stale',
          provider_worker_repair_action_id: 'restart_temporal_worker',
          provider_worker_repair_command:
            'opl family-runtime worker stop --provider temporal && opl family-runtime worker start --provider temporal',
          provider_worker_required_next_action:
            'Restart stale Temporal worker before rerunning provider proof.',
          opl_cli_args: ['worker', 'repair', '--provider', 'temporal', '--action', 'restart'],
          authority_boundary: {
            can_write_domain_truth: false,
            can_claim_production_ready: false,
          },
        },
      ],
    },
    app_execution_bridge: {
      safe_action_routes: [],
    },
    authority_boundary: {
      can_write_domain_truth: false,
      can_claim_production_ready: false,
    },
  }, 'summary');
  const nextSafeAction = drilldown.attention_first_payload.next_safe_action;
  assert.ok(nextSafeAction);

  assert.equal(nextSafeAction.action_id, 'provider-worker:temporal:restart');
  assert.equal(nextSafeAction.action_kind, 'provider_worker_restart');
  assert.equal(nextSafeAction.provider_worker_repair_action_id, 'restart_temporal_worker');
  assert.equal(
    nextSafeAction.provider_worker_repair_command,
    'opl family-runtime worker stop --provider temporal && opl family-runtime worker start --provider temporal',
  );
  assert.deepEqual(nextSafeAction.submit_args, [
    'runtime',
    'action',
    'execute',
    '--action',
    'provider-worker:temporal:restart',
  ]);
});

test('runtime App drilldown does not select closed provider SLO routes as next action', () => {
  const route = (action: string, actionKind: string) => ({
    action_id: `provider-scheduler:temporal:${action}`,
    action_kind: actionKind,
    owner: 'opl',
    route_target_kind: 'opl_cli',
    execution_surface: 'opl runtime action execute',
    submit_via: 'opl runtime action execute',
    can_submit_to_safe_action_shell: true,
    opl_cli_args: ['scheduler', action, '--provider', 'temporal'],
  });
  const drilldown = applyAppOperatorDrilldownDetail({
    summary: {
      provider_slo_cadence_window_status: 'window_cadence_satisfied',
      provider_slo_capability_status: 'capability_slo_satisfied',
      provider_slo_cadence_window_observed_receipt_count: 3,
      provider_slo_cadence_window_missing_receipt_count: 0,
      provider_slo_cadence_window_blocked_repair_receipt_count: 0,
    },
    operator_action_routing_refs: {
      refs: [
        route('trigger', 'provider_scheduler_trigger'),
        route('tick', 'provider_scheduler_tick'),
        route('status', 'provider_scheduler_status'),
        route('install', 'provider_scheduler_install'),
      ],
    },
    app_execution_bridge: {
      safe_action_routes: [],
    },
    authority_boundary: {
      can_write_domain_truth: false,
      can_claim_production_ready: false,
    },
  }, 'summary');

  assert.equal(drilldown.attention_first_payload.next_safe_action, null);
  assert.equal(drilldown.attention_first_payload.additional_safe_action_count, 0);
});

test('runtime App drilldown keeps historical provider repair receipts from reopening current scheduler routes', () => {
  const route = (action: string, actionKind: string) => ({
    action_id: `provider-scheduler:temporal:${action}`,
    action_kind: actionKind,
    owner: 'opl',
    route_target_kind: 'opl_cli',
    execution_surface: 'opl runtime action execute',
    submit_via: 'opl runtime action execute',
    can_submit_to_safe_action_shell: true,
    opl_cli_args: ['scheduler', action, '--provider', 'temporal'],
  });
  const drilldown = applyAppOperatorDrilldownDetail({
    summary: {
      provider_slo_cadence_window_status: 'window_cadence_satisfied',
      provider_slo_capability_status: 'capability_slo_satisfied',
      provider_slo_cadence_window_observed_receipt_count: 1628,
      provider_slo_cadence_window_missing_receipt_count: 0,
      provider_slo_cadence_window_blocked_repair_receipt_count: 1,
    },
    operator_action_routing_refs: {
      refs: [
        route('install', 'provider_scheduler_install'),
      ],
    },
    app_execution_bridge: {
      safe_action_routes: [],
    },
    authority_boundary: {
      can_write_domain_truth: false,
      can_claim_production_ready: false,
    },
  }, 'summary');

  assert.equal(drilldown.attention_first_payload.next_safe_action, null);
  assert.equal(drilldown.attention_first_payload.additional_safe_action_count, 0);
});

test('runtime App drilldown does not select legacy cleanup routes already closed by lifecycle receipt aliases', () => {
  const drilldown = applyAppOperatorDrilldownDetail({
    operator_action_routing_refs: {
      refs: [
        {
          ref: 'opl agents legacy-cleanup apply --domain medautogrant --mode apply --source-ref opl://agents/med-autogrant/legacy-cleanup-plan',
          action_id: 'legacy-cleanup:medautogrant:apply',
          action_kind: 'legacy_cleanup_apply',
          owner: 'opl',
          route_target_kind: 'opl_cli',
          execution_policy: 'opl_safe_action_shell',
          execution_surface: 'opl runtime action execute',
          domain_id: 'medautogrant',
          target_domain_id: 'med-autogrant',
          source_ref: 'opl://agents/med-autogrant/legacy-cleanup-plan',
          action_count: 3,
        },
      ],
    },
    app_execution_bridge: {
      safe_action_routes: [],
    },
    lifecycle_ledger_refs: {
      refs: [
        {
          source_ref: 'opl://agents/medautogrant/legacy-cleanup-plan',
          domain_id: 'med-autogrant',
          receipt_ref: 'opl://family-runtime/lifecycle-apply/medautogrant/legacy-cleanup-1/ref',
        },
      ],
    },
    authority_boundary: {
      can_write_domain_truth: false,
      can_claim_production_ready: false,
    },
  }, 'summary');

  assert.equal(drilldown.attention_first_payload.next_safe_action, null);
  assert.equal(drilldown.attention_first_payload.additional_safe_action_count, 0);
});

test('runtime App drilldown does not select no-op legacy cleanup routes as next action', () => {
  const drilldown = applyAppOperatorDrilldownDetail({
    operator_action_routing_refs: {
      refs: [
        {
          ref: 'opl agents legacy-cleanup apply --domain redcube --mode apply --source-ref opl://agents/redcube_ai/legacy-cleanup-plan',
          action_id: 'legacy-cleanup:redcube:apply',
          action_kind: 'legacy_cleanup_apply',
          owner: 'opl',
          route_target_kind: 'opl_cli',
          execution_policy: 'opl_safe_action_shell',
          execution_surface: 'opl runtime action execute',
          domain_id: 'redcube',
          target_domain_id: 'redcube_ai',
          source_ref: 'opl://agents/redcube_ai/legacy-cleanup-plan',
          action_count: 0,
        },
      ],
    },
    app_execution_bridge: {
      safe_action_routes: [],
    },
    authority_boundary: {
      can_write_domain_truth: false,
      can_claim_production_ready: false,
    },
  }, 'summary');

  assert.equal(drilldown.attention_first_payload.next_safe_action, null);
  assert.equal(drilldown.attention_first_payload.additional_safe_action_count, 0);
});

test('runtime App drilldown keeps diagnostic query routes out of selected next action', () => {
  const drilldown = applyAppOperatorDrilldownDetail({
    operator_action_routing_refs: {
      refs: [
        {
          ref: 'opl family-runtime attempt query --attempt-id sat_demo',
          action_id: 'action:sat_demo:attempt-query',
          action_kind: 'stage_attempt_query',
          owner: 'opl',
          route_target_kind: 'opl_cli',
          execution_policy: 'opl_safe_action_shell',
          execution_surface: 'opl runtime action execute',
          domain_id: 'medautoscience',
          stage_id: 'domain_owner/default-executor-dispatch',
          stage_attempt_id: 'sat_demo',
        },
      ],
    },
    app_execution_bridge: {
      safe_action_routes: [],
    },
    authority_boundary: {
      can_write_domain_truth: false,
      can_claim_production_ready: false,
    },
  }, 'summary');

  assert.equal(drilldown.attention_first_payload.next_safe_action, null);
  assert.equal(drilldown.attention_first_payload.additional_safe_action_count, 0);
});

test('runtime App drilldown prefers safe-action bridge routes for duplicate action ids', () => {
  const domainDispatchRecordRoute = {
    action_id: 'domain_dispatch:medautoscience:attempt-1:record',
    action_kind: 'domain_dispatch_evidence_receipt_record',
    owner: 'opl',
    route_target_kind: 'opl_cli',
    execution_surface: 'opl runtime action execute',
    route_requires_domain_or_app_payload: true,
    can_close_without_domain_or_app_payload: false,
    can_submit_to_safe_action_shell: false,
    payload_owner: 'domain_repository_or_app_live_operator',
    payload_template: {
      domain_receipt_refs: [],
      typed_blocker_refs: [],
      owner_chain_refs: [],
      no_regression_refs: [],
      evidence_refs: [],
    },
    required_operator_payload_refs: [
      'domain_receipt_refs',
      'typed_blocker_refs',
      'owner_chain_refs',
      'no_regression_refs',
      'evidence_refs',
    ],
    payload_workorder: {
      authority_boundary: {
        can_generate_domain_owner_receipt: false,
        can_execute_domain_action: false,
        closes_domain_ready: false,
        closes_production_ready: false,
      },
    },
  };
  const drilldown = applyAppOperatorDrilldownDetail({
    operator_action_routing_refs: {
      refs: [
        {
          action_id: 'provider-scheduler:temporal:install',
          action_kind: 'provider_scheduler_install',
          owner: 'opl',
          route_target_kind: 'opl_cli',
          execution_surface: 'opl runtime action execute',
          submit_via: 'opl runtime action execute',
          can_submit_to_safe_action_shell: true,
        },
        domainDispatchRecordRoute,
      ],
    },
    app_execution_bridge: {
      safe_action_routes: [
        {
          ...domainDispatchRecordRoute,
          action_ref: 'opl://runtime-actions/domain-dispatch/attempt-1/record',
          submit_via: 'opl runtime action execute',
          dry_run_supported: true,
          can_submit_to_safe_action_shell: true,
        },
      ],
    },
    authority_boundary: {
      can_write_domain_truth: false,
      can_claim_production_ready: false,
    },
  }, 'summary');
  const nextSafeAction = drilldown.attention_first_payload.next_safe_action;
  assert.ok(nextSafeAction);

  assert.equal(
    nextSafeAction.action_id,
    'domain_dispatch:medautoscience:attempt-1:record',
  );
  assert.equal(
    nextSafeAction.action_kind,
    'domain_dispatch_evidence_receipt_record',
  );
  assert.equal(nextSafeAction.can_submit_to_safe_action_shell, true);
  assert.equal(nextSafeAction.route_requires_domain_or_app_payload, true);
  assert.equal(nextSafeAction.can_close_without_domain_or_app_payload, false);
  assert.deepEqual(nextSafeAction.submit_args, [
    'runtime',
    'action',
    'execute',
    '--action',
    'domain_dispatch:medautoscience:attempt-1:record',
    '--payload-file',
    '<payload.json>',
  ]);
  const payloadWorkorder = record(nextSafeAction.payload_workorder);
  const authorityBoundary = record(payloadWorkorder.authority_boundary);
  assert.equal(authorityBoundary.can_generate_domain_owner_receipt, false);
});

test('runtime action execute can apply and verify legacy cleanup plans from App drilldown', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-action-execute-legacy-cleanup-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const masManifest = structuredClone(loadFamilyManifestFixtures().medautoscience);
  masManifest.standard_domain_agent_skeleton = {
    surface_kind: 'standard_domain_agent_skeleton',
    version: 'standard-domain-agent-skeleton.v1',
    agent_id: 'mas',
    repo_source_boundary: {
      required_dirs: ['agent', 'contracts', 'runtime', 'docs'],
      forbidden_dirs: ['artifacts'],
    },
    artifact_boundary: {
      repo_contains_real_artifacts: false,
      artifact_roots_are_locators: true,
      workspace_artifact_locator_refs: ['workspace:/artifacts'],
      runtime_artifact_locator_refs: ['runtime:/receipts'],
    },
    artifact_locator_contract: {
      surface_kind: 'artifact_locator_contract',
      locator_model: 'workspace_runtime_artifact_root',
    },
    authority_boundary: {
      opl: 'framework_transport_and_projection_only',
      domain: 'truth_quality_artifact_owner',
    },
  };
  masManifest.physical_skeleton_follow_through = {
    surface_kind: 'mas_physical_skeleton_follow_through',
    status: 'minimum_repo_source_anchors_landed',
    source_refs: [
      'agent/README.md',
      'contracts/README.md',
      'runtime/README.md',
      'docs/status.md',
    ],
    direct_skill_parity_refs: ['proof:mas:direct-skill-parity'],
    opl_hosted_parity_refs: ['proof:mas:opl-hosted-parity'],
    replacement_parity_refs: ['proof:mas:replacement-parity'],
    provenance_refs: ['docs/history/runtime-substrate/mas-local-runtime-tombstone.md'],
    legacy_active_path_policy: 'physically_removed_or_history_tombstone_only',
    legacy_active_path_residue: [
      {
        path_family: 'default MAS local scheduler',
        state: 'tombstone_only',
        evidence_ref: 'docs/history/runtime-substrate/mas-local-scheduler-tombstone.md',
      },
    ],
  };
  masManifest.legacy_retirement_tombstone_proof = {
    status: 'no_active_default_caller_proven',
    active_default_callers: [],
    tombstone_refs: ['docs/history/runtime-substrate/mas-local-scheduler-tombstone.md'],
    source_refs: ['docs/decisions.md#temporal-runtime'],
  };

  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      repoRoot,
      '--manifest-command',
      buildManifestCommand(masManifest),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });

    const drilldown = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).app_operator_drilldown;
    assert.equal(
      drilldown.operator_action_routing_refs.refs.some(
        (ref: { action_id: string; action_kind: string }) =>
          ref.action_id === 'legacy-cleanup:medautoscience:apply'
          && ref.action_kind === 'legacy_cleanup_apply',
      ),
      true,
    );
    assert.equal(
      drilldown.app_execution_bridge.safe_action_routes.some(
        (ref: { action_id: string; can_submit_to_safe_action_shell: boolean }) =>
          ref.action_id === 'legacy-cleanup:medautoscience:apply'
          && ref.can_submit_to_safe_action_shell,
      ),
      true,
    );

    const applyExecution = runCli([
      'runtime',
      'action',
      'execute',
      '--action',
      'legacy-cleanup:medautoscience:apply',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).runtime_operator_action_execution;

    assert.equal(applyExecution.execution.execution_kind, 'opl_cli_legacy_cleanup_apply');
    assert.equal(applyExecution.execution.execution_status, 'executed');
    assert.equal(
      applyExecution.execution.executed_runtime_command,
      'opl agents legacy-cleanup apply --domain medautoscience --mode apply --source-ref opl://agents/med-autoscience/legacy-cleanup-plan',
    );
    assert.equal(
      applyExecution.execution.result.family_agent_legacy_cleanup_apply.lifecycle_apply.status,
      'applied',
    );
    assert.equal(
      applyExecution.execution.result.family_agent_legacy_cleanup_apply.authority_boundary.opl_can_move_or_delete_domain_repo_files,
      false,
    );

    const verifyExecution = runCli([
      'runtime',
      'action',
      'execute',
      '--action',
      'legacy-cleanup:medautoscience:verify',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).runtime_operator_action_execution;

    assert.equal(verifyExecution.execution.execution_kind, 'opl_cli_legacy_cleanup_apply');
    assert.equal(verifyExecution.execution.execution_status, 'executed');
    assert.equal(
      verifyExecution.execution.result.family_agent_legacy_cleanup_apply.lifecycle_apply.status,
      'verified',
    );
    assert.equal(verifyExecution.authority_boundary.can_write_domain_truth, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
