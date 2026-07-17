import {
  assert,
  buildManifestCommand,
  createFamilyContractsFixtureRoot,
  fs,
  installRuntimePackageFixture,
  loadFamilyManifestFixtures,
  os,
  path,
  removeFixtureTree,
  runCli,
  test,
} from '../../helpers.ts';
import {
  STANDARD_PROGRESS_DELTA_POLICY,
  STANDARD_TYPED_BLOCKER_LINEAGE_POLICY,
} from '../../../../../src/modules/pack/standard-domain-agent-scaffold-constants.ts';
import { createAdmittedStagePackFixture } from '../workspace-domain-test-helper.ts';

test('runtime action execute can execute OPL-owned attempt query routes', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-action-execute-query-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  installRuntimePackageFixture(stateRoot, 'mag');
  try {
    const attempt = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautogrant',
      '--stage',
      'draft',
      '--provider',
      'temporal',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mag"}',
      '--source-fingerprint',
      'sha256:action-execute-query',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    const attemptId = attempt.family_runtime_stage_attempt.attempt.stage_attempt_id;

    const execution = runCli([
      'runtime',
      'action',
      'execute',
      '--action',
      `action:${attemptId}:attempt-query`,
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).runtime_operator_action_execution;

    assert.equal(execution.execution.execution_kind, 'opl_cli_internal');
    assert.equal(execution.execution.execution_status, 'executed');
    assert.equal(
      execution.execution.result.family_runtime_stage_attempt_query.stage_attempt_query.attempt.stage_attempt_id,
      attemptId,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('runtime action execute can create OPL-owned stage production attempt requests', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-action-execute-stage-production-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  installRuntimePackageFixture(stateRoot, 'mas');
  const masManifest = structuredClone(loadFamilyManifestFixtures().medautoscience);
  masManifest.family_stage_control_plane = {
    surface_kind: 'family_stage_control_plane',
    version: 'family-stage-control-plane.v1',
    plane_id: 'med_autoscience_stage_control_plane',
    target_domain_id: 'med-autoscience',
    owner: 'med-autoscience',
    authority_boundary: { opl_role: 'projection_consumer_only' },
    stages: [
      {
        stage_id: 'review',
        stage_kind: 'review',
        title: 'Review',
        summary: 'Review from draft refs.',
        goal: 'Return review refs under MAS authority.',
        owner: 'med-autoscience',
        domain_stage_refs: ['review'],
        inputs: [],
        knowledge_refs: [],
        skills: [],
        prompt_refs: [],
        allowed_action_refs: [],
        outputs: [],
        evaluation: [],
        handoff: null,
        source_refs: [],
        freshness: null,
        action_parity: null,
        stage_contract: {
          requires: ['draft_ready'],
          ensures: ['review_ready'],
          progress_delta_policy: STANDARD_PROGRESS_DELTA_POLICY,
          typed_blocker_lineage_policy: STANDARD_TYPED_BLOCKER_LINEAGE_POLICY,
          boundary_assumptions: ['reviewer_judgment_is_domain_owned'],
          properties: [],
          runtime_event_refs: ['runtime_event:review.receipt_recorded'],
          runtime_assumptions: [],
          monitor_refs: [{ ref_kind: 'metric_ref', ref: 'metric:review/currentness', role: 'monitor' }],
          source_scope_refs: [{ ref_kind: 'source_ref', ref: 'source:review', role: 'source_scope' }],
          cohort_query_refs: [{ ref_kind: 'query_ref', ref: 'cohort:review/current', role: 'cohort_query' }],
          trigger_refs: [{ ref_kind: 'queue_ref', ref: 'queue:review/current', role: 'trigger' }],
          metric_refs: [{ ref_kind: 'metric_ref', ref: 'metric:review/currentness', role: 'metric' }],
          dashboard_metric_refs: [],
          artifact_scope_refs: [],
          workspace_scope_refs: [],
        },
        trust_boundary: {
          lane: 'domain_agent',
          static_check_eligible: false,
          effect_boundary: true,
          records_runtime_events: true,
          runtime_event_refs: [],
          owner_receipt_required: true,
        },
        authority_boundary: {
          opl_role: 'projection_consumer_only',
          expected_receipt_refs: ['mas:review-receipt'],
          can_authorize_quality_verdict: false,
        },
      },
    ],
    notes: [],
  };
  const stagePack = createAdmittedStagePackFixture(
    masManifest,
    'med-autoscience',
    'med-autoscience',
    { stageCount: 1 },
  );
  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      stagePack.repoDir,
      '--manifest-command',
      buildManifestCommand(stagePack.manifest),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });

    const dryRun = runCli([
      'runtime',
      'action',
      'execute',
      '--action',
      'stage-production-attempt:medautoscience:review',
      '--dry-run',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).runtime_operator_action_execution;

    assert.equal(dryRun.execution.execution_kind, 'opl_cli_stage_attempt_create');
    assert.equal(dryRun.execution.execution_status, 'dry_run');
    assert.equal(dryRun.route.route_status, 'request_route_available');
    assert.equal(dryRun.route.request_scope, 'opl_owned_stage_attempt_request_only');
    assert.equal(dryRun.route.creates_domain_action, false);
    assert.equal(dryRun.route.creates_owner_receipt, false);
    assert.deepEqual(dryRun.route.owner_receipt_refs, []);
    assert.equal(dryRun.route.closes_expected_receipt_refs, false);
    assert.equal(dryRun.route.closes_monitor_freshness, false);
    assert.equal(dryRun.execution.result, null);
    assert.equal(
      dryRun.execution.executed_runtime_command.includes('opl family-runtime attempt create --domain medautoscience --stage review'),
      true,
    );

    const execution = runCli([
      'runtime',
      'action',
      'execute',
      '--action',
      'stage-production-attempt:medautoscience:review',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).runtime_operator_action_execution;

    assert.equal(execution.execution.execution_kind, 'opl_cli_stage_attempt_create');
    assert.equal(execution.execution.execution_status, 'executed');
    assert.equal(execution.route.route_status, 'request_route_available');
    assert.equal(execution.route.request_scope, 'opl_owned_stage_attempt_request_only');
    assert.equal(execution.route.creates_domain_action, false);
    assert.equal(execution.route.creates_owner_receipt, false);
    assert.deepEqual(execution.route.owner_receipt_refs, []);
    assert.equal(execution.route.closes_expected_receipt_refs, false);
    assert.equal(execution.route.closes_monitor_freshness, false);
    assert.equal(execution.authority_boundary.can_write_domain_truth, false);
    assert.equal(execution.route.route_status, 'request_route_available');
    assert.equal(execution.route.request_scope, 'opl_owned_stage_attempt_request_only');
    assert.equal(execution.route.creates_domain_action, false);
    assert.equal(execution.route.creates_owner_receipt, false);
    assert.deepEqual(execution.route.owner_receipt_refs, []);
    assert.equal(execution.route.closes_expected_receipt_refs, false);
    assert.equal(execution.route.closes_monitor_freshness, false);
    assert.equal(
      execution.execution.result.family_runtime_stage_attempt.attempt.domain_id,
      'medautoscience',
    );
    assert.equal(
      execution.execution.result.family_runtime_stage_attempt.attempt.stage_id,
      'review',
    );
    assert.equal(
      execution.execution.result.family_runtime_stage_attempt.attempt.provider_kind,
      'temporal',
    );
    assert.equal(
      execution.execution.result.family_runtime_stage_attempt.attempt.executor_kind,
      'codex_cli',
    );
    assert.equal(
      execution.execution.result.family_runtime_stage_attempt.launch_invocation.executor_binding_ref,
      'opl://executors/codex-cli/default',
    );

    const startDryRun = runCli([
      'runtime',
      'action',
      'execute',
      '--action',
      'stage-production-attempt-start:medautoscience:review',
      '--dry-run',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).runtime_operator_action_execution;

    assert.equal(startDryRun.execution.execution_kind, 'opl_cli_stage_attempt_create_and_start');
    assert.equal(startDryRun.execution.execution_status, 'dry_run');
    assert.equal(startDryRun.execution.executed_runtime_command.includes('opl family-runtime attempt start'), true);
    assert.equal(startDryRun.authority_boundary.can_write_domain_truth, false);
  } finally {
    removeFixtureTree(stateRoot);
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(stagePack.repoDir, { recursive: true, force: true });
  }
});
