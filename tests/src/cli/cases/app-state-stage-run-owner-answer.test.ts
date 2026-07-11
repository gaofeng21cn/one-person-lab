import { assert, fs, os, path, runCli, test } from '../helpers.ts';
import {
  appStateStageRunAuthorizationReceipt,
  appStateStageRunCloseoutAuthorizationReceipt,
  bindMasWorkspaceForAppState,
  writeCurrentOwnerDeltaProjectionCacheFixture,
  writeMasPublicationHandoffOwnerAnswerProjectionFixture,
  writeStageRunAuthorizationLedgerFixture,
} from './app-state-cases/fixtures.ts';

function createMasRepoWithOwnerAnswerProfile(familyRoot: string) {
  const repoRoot = path.join(familyRoot, 'med-autoscience');
  const contractsRoot = path.join(repoRoot, 'contracts');
  fs.mkdirSync(contractsRoot, { recursive: true });
  fs.writeFileSync(
    path.join(contractsRoot, 'domain_descriptor.json'),
    `${JSON.stringify({
      standard_contract_refs: {
        domain_owner_answer_projection_profile:
          'contracts/domain_owner_answer_projection_profile.json',
      },
    }, null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(contractsRoot, 'domain_owner_answer_projection_profile.json'),
    `${JSON.stringify({
      surface_kind: 'opl_domain_owner_answer_projection_profile',
      version: 'domain-owner-answer-projection-profile.v1',
      profile_id: 'medautoscience.publication_handoff.owner_answer_projection.v1',
      profile_role: 'registry',
      domain_id: 'medautoscience',
      binding_project_id: 'medautoscience',
      source_owner: 'med-autoscience',
      workspace_root_profile_ref: {
        profile_dir_name: 'profiles',
        domain_dir_name: 'medautoscience',
        ops_dir_name: 'ops',
      },
      studies_dir_name: 'studies',
      projection_relative_path: [
        'artifacts',
        'stage_outputs',
        '08-publication_package_handoff',
        'projection',
        'current_owner_delta.json',
      ],
      authority_boundary: {
        refs_only: true,
        can_write_domain_truth: false,
        can_create_owner_receipt: false,
        can_create_typed_blocker: false,
        can_claim_domain_ready: false,
        can_claim_production_ready: false,
      },
    }, null, 2)}\n`,
  );
  return repoRoot;
}

test('app state fast folds MAS publication handoff owner answer projection into StageRun cockpit', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-mas-owner-answer-home-'));
  const familyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-mas-owner-answer-family-'));
  const masRepoRoot = createMasRepoWithOwnerAnswerProfile(familyRoot);
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-mas-owner-answer-workspace-'));
  const stateDir = path.join(homeRoot, 'opl-state');
  const profilePath = path.join(workspaceRoot, 'ops', 'medautoscience', 'profiles', 'dm.workspace.toml');
  const receipt = appStateStageRunAuthorizationReceipt();

  try {
    bindMasWorkspaceForAppState({ stateDir, workspaceRoot: masRepoRoot, profilePath });
    fs.mkdirSync(path.dirname(profilePath), { recursive: true });
    fs.writeFileSync(profilePath, 'workspace_name = "dm-cvd-mortality-risk"\n', 'utf8');
    writeCurrentOwnerDeltaProjectionCacheFixture(stateDir, {
      sourceSurface: 'framework_readiness',
      sourceCommand: 'opl framework readiness --family-defaults --json',
    });
    writeStageRunAuthorizationLedgerFixture({ stateDir, receipt });
    writeMasPublicationHandoffOwnerAnswerProjectionFixture({
      workspaceRoot,
      studyId: '003-dpcc-primary-care-phenotype-treatment-gap',
      receipt,
    });

    const output = runCli(['app', 'state', '--profile', 'fast'], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
      OPL_MODULES_ROOT: path.join(stateDir, 'modules'),
      OPL_FAMILY_WORKSPACE_ROOT: familyRoot,
      OPL_DEVELOPER_MODE_GH_BINARY: path.join(homeRoot, 'missing-gh'),
      PATH: '/usr/bin:/bin',
    }) as {
      app_state: {
        operator: {
          stage_run_cockpit: Record<string, any>;
          stage_run_cockpit_summary: Record<string, any>;
          operator_next_action: Record<string, any> | null;
          operator_next_action_source: string | null;
          operator_next_missing_input_refs: string[];
          stage_run_next_missing_input_refs: string[];
          stage_run_next_required_owner_action: Record<string, any> | null;
        };
      };
    };

    const cockpit = output.app_state.operator.stage_run_cockpit;
    assert.equal(cockpit.execution_authorization.status, 'authorized');
    assert.equal(cockpit.execution_authorization.execution_authorized, true);
    assert.deepEqual(cockpit.execution_authorization.launch_blockers, []);
    assert.deepEqual(cockpit.execution_authorization.closeout_binding_blockers, []);
    assert.equal(cockpit.execution_authorization.closeout_binding.owner_answer_kind, 'typed_blocker');
    assert.equal(cockpit.stage_run_current_owner_delta.missing_role_or_answer_summary.owner_receipt_or_typed_blocker_missing, false);
    assert.equal(
      cockpit.stage_run_current_owner_delta.owner_answer_binding_projection.study_id,
      '003-dpcc-primary-care-phenotype-treatment-gap',
    );
    assert.equal(
      cockpit.stage_run_current_owner_delta.owner_answer_binding_projection.reason,
      'medical_paper_readiness_not_ready',
    );
    assert.equal(
      cockpit.stage_run_current_owner_delta.owner_answer_binding_projection.profile_id,
      'medautoscience.publication_handoff.owner_answer_projection.v1',
    );
    assert.equal(
      cockpit.stage_run_current_owner_delta.owner_answer_binding_projection.profile_role,
      'registry',
    );
    assert.equal(
      cockpit.stage_run_current_owner_delta.owner_answer_binding_projection.closeout_binding_source,
      'owner_answer_projection_profile_registry',
    );
    assert.equal(cockpit.stage_run_current_owner_delta.owner_answer_binding_projection.authority_boundary.can_claim_domain_ready, false);
    assert.equal(cockpit.authority_boundary.can_write_domain_truth, false);
    assert.equal(cockpit.authority_boundary.can_create_typed_blocker, false);
    assert.equal(output.app_state.operator.stage_run_cockpit_summary.execution_authorized, true);
    assert.equal(output.app_state.operator.stage_run_cockpit_summary.domain_typed_blocker_created, false);
    assert.deepEqual(output.app_state.operator.stage_run_next_missing_input_refs, []);
    assert.deepEqual(output.app_state.operator.operator_next_missing_input_refs, []);
    assert.equal(output.app_state.operator.stage_run_next_required_owner_action, null);
    assert.equal(output.app_state.operator.operator_next_action, null);
    assert.equal(
      output.app_state.operator.operator_next_action_source,
      'stage_run_execution_authorization_closed',
    );
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(familyRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('app state fast prefers legal StageRun closeout owner answer over stale current owner attempt receipt', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-stale-owner-attempt-home-'));
  const familyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-stale-owner-attempt-family-'));
  const masRepoRoot = createMasRepoWithOwnerAnswerProfile(familyRoot);
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-stale-owner-attempt-workspace-'));
  const stateDir = path.join(homeRoot, 'opl-state');
  const profilePath = path.join(workspaceRoot, 'ops', 'medautoscience', 'profiles', 'dm.workspace.toml');
  const staleLaunchReceipt = appStateStageRunAuthorizationReceipt({
    stage_attempt_id: 'sat_stale_launch',
    provider_attempt_ref: 'temporal://attempt/sat_stale_launch',
    attempt_lease_ref: 'opl://stage-attempts/sat_stale_launch/leases/lease_stale_launch/active',
    execution_authorization_decision_ref:
      'opl://stage-attempts/sat_stale_launch/execution-authorizations/lease_stale_launch/wf_stale_launch',
  });
  const closeoutReceipt = appStateStageRunCloseoutAuthorizationReceipt();

  try {
    bindMasWorkspaceForAppState({ stateDir, workspaceRoot: masRepoRoot, profilePath });
    fs.mkdirSync(path.dirname(profilePath), { recursive: true });
    fs.writeFileSync(profilePath, 'workspace_name = "dm-cvd-mortality-risk"\n', 'utf8');
    writeCurrentOwnerDeltaProjectionCacheFixture(stateDir, {
      sourceSurface: 'framework_readiness',
      sourceCommand: 'opl framework readiness --family-defaults --json',
      nextSafeAction: {
        action_id: 'stale-current-owner-delta-attempt',
        action_kind: 'domain_owner_receipt_quality_gate_or_typed_blocker_required',
        next_safe_action_ref: 'opl://stage_attempts/sat_stale_launch/current',
        domain_id: 'medautoscience',
        stage_id: 'domain_owner/default-executor-dispatch',
        route_requires_domain_or_app_payload: true,
      },
    });
    writeStageRunAuthorizationLedgerFixture({
      stateDir,
      receipt: staleLaunchReceipt,
      receipts: [staleLaunchReceipt, closeoutReceipt],
    });

    const output = runCli(['app', 'state', '--profile', 'fast'], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
      OPL_MODULES_ROOT: path.join(stateDir, 'modules'),
      OPL_FAMILY_WORKSPACE_ROOT: familyRoot,
      OPL_DEVELOPER_MODE_GH_BINARY: path.join(homeRoot, 'missing-gh'),
      PATH: '/usr/bin:/bin',
    }) as {
      app_state: {
        operator: {
          stage_run_next_missing_input_refs: string[];
          operator_next_missing_input_refs: string[];
          operator_next_action: Record<string, any> | null;
          operator_next_action_source: string | null;
          current_owner_delta_next_action: Record<string, any> | null;
          current_owner_delta: Record<string, any>;
          stage_run_next_required_owner_action: Record<string, any> | null;
          stage_run_cockpit: Record<string, any>;
          stage_run_cockpit_summary: Record<string, any>;
        };
      };
    };

    assert.equal(
      output.app_state.operator.stage_run_cockpit.stage_run_current_owner_delta.current_owner_delta_stage_attempt_id,
      'sat_stale_launch',
    );
    assert.equal(
      output.app_state.operator.stage_run_cockpit.execution_authorization_ledger_receipt.stage_attempt_id,
      'sat_dm003_closeout',
    );
    assert.equal(output.app_state.operator.stage_run_cockpit.execution_authorization.status, 'authorized');
    assert.equal(output.app_state.operator.stage_run_cockpit.execution_authorization.execution_authorized, true);
    assert.deepEqual(
      output.app_state.operator.stage_run_cockpit.execution_authorization.closeout_binding_blockers,
      [],
    );
    assert.deepEqual(output.app_state.operator.stage_run_next_missing_input_refs, []);
    assert.deepEqual(output.app_state.operator.operator_next_missing_input_refs, []);
    const closeoutOwnerAnswerRef =
      output.app_state.operator.stage_run_cockpit.execution_authorization.closeout_binding
        .owner_answer_ref;
    assert.equal(
      output.app_state.operator.current_owner_delta.latest_owner_answer_ref,
      closeoutOwnerAnswerRef,
    );
    assert.equal(output.app_state.operator.current_owner_delta.latest_owner_answer_kind, 'typed_blocker');
    assert.equal(output.app_state.operator.current_owner_delta.hard_gate.state, 'domain_owner_answer_recorded');
    assert.equal(output.app_state.operator.current_owner_delta.hard_gate.human_or_domain_owner_required, false);
    assert.equal(output.app_state.operator.current_owner_delta.hard_gate.domain_ready_authorized, false);
    assert.equal(output.app_state.operator.current_owner_delta_next_action, null);
    assert.equal(output.app_state.operator.operator_next_action, null);
    assert.equal(
      output.app_state.operator.operator_next_action_source,
      'stage_run_execution_authorization_closed',
    );
    assert.equal(output.app_state.operator.stage_run_next_required_owner_action, null);
    assert.equal(output.app_state.operator.stage_run_cockpit_summary.execution_authorized, true);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(familyRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});
