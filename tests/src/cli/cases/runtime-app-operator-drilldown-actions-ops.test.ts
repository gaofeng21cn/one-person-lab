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
