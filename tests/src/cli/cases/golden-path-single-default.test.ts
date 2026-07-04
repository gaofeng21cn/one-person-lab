import { assert, fs, parseJsonText, path, runCli, test } from '../helpers.ts';
import {
  buildReadyAgentRepo,
  writeJson,
} from './agents-conformance-fixtures.ts';

test('agents conformance blocks multiple ordinary default routes for a Foundry Agent', () => {
  const repoDir = buildReadyAgentRepo();
  const stageControlPlanePath = path.join(repoDir, 'contracts', 'stage_control_plane.json');
  const stageControlPlane = parseJsonText(fs.readFileSync(stageControlPlanePath, 'utf8')) as any;
  const secondaryDefaultStage = {
    ...stageControlPlane.stages[0],
    stage_id: 'secondary_default_stage',
    stage_kind: 'domain_specific',
    title: 'Secondary default stage',
    selected_executor: {
      ...stageControlPlane.stages[0].selected_executor,
      default_executor: true,
    },
  };
  stageControlPlane.stages.push(secondaryDefaultStage);
  writeJson(stageControlPlanePath, stageControlPlane);

  const report = runCli([
    'agents',
    'conformance',
    '--agent',
    `sample=${repoDir}`,
  ]).standard_domain_agent_conformance;
  const repo = report.reports[0];

  assert.equal(report.status, 'blocked');
  assert.equal(repo.status, 'blocked');
  assert.equal(repo.golden_path_default_surface_budget_checks.status, 'blocked');
  assert.equal(repo.golden_path_default_surface_budget_checks.default_route_count, 2);
  assert.deepEqual(repo.golden_path_default_surface_budget_checks.default_route_stage_ids, [
    'domain_intake',
    'secondary_default_stage',
  ]);
  assert.equal(
    repo.blockers.includes('golden_path_single_default_violation:default_route_count=2'),
    true,
  );
});

test('agents conformance treats explicit Codex follow-on lanes as non-default route variants', () => {
  const repoDir = buildReadyAgentRepo();
  const stageControlPlanePath = path.join(repoDir, 'contracts', 'stage_control_plane.json');
  const stageControlPlane = parseJsonText(fs.readFileSync(stageControlPlanePath, 'utf8')) as any;
  const followOnStage = {
    ...stageControlPlane.stages[0],
    stage_id: 'book_materialization_follow_on',
    lane_kind: 'variant',
    route_classification: 'explicit_follow_on_stage',
    title: 'Book materialization follow-on',
    selected_executor: {
      ...stageControlPlane.stages[0].selected_executor,
      default_executor: true,
      lane_kind: 'variant',
    },
  };
  stageControlPlane.stages.push(followOnStage);
  writeJson(stageControlPlanePath, stageControlPlane);

  const report = runCli([
    'agents',
    'conformance',
    '--agent',
    `sample=${repoDir}`,
  ]).standard_domain_agent_conformance;
  const repo = report.reports[0];
  const checks = repo.golden_path_default_surface_budget_checks;

  assert.equal(report.status, 'passed');
  assert.equal(checks.status, 'passed');
  assert.equal(checks.default_route_count, 1);
  assert.deepEqual(checks.default_route_stage_ids, ['domain_intake']);
  assert.deepEqual(checks.explicit_non_default_lane_stage_ids, ['book_materialization_follow_on']);
  assert.equal(
    checks.route_stages.find((stage: { stage_id: string }) =>
      stage.stage_id === 'book_materialization_follow_on'
    )?.executor_default_binding,
    true,
  );
});

test('agents conformance blocks explicit lanes that declare ordinary default route role', () => {
  const repoDir = buildReadyAgentRepo();
  const stageControlPlanePath = path.join(repoDir, 'contracts', 'stage_control_plane.json');
  const stageControlPlane = parseJsonText(fs.readFileSync(stageControlPlanePath, 'utf8')) as any;
  const proofStage = {
    ...stageControlPlane.stages[0],
    stage_id: 'provider_proof_lane',
    stage_kind: 'proof',
    route_classification: 'ordinary_default',
    title: 'Provider proof lane',
    selected_executor: {
      ...stageControlPlane.stages[0].selected_executor,
      default_executor: true,
      lane_kind: 'proof',
    },
  };
  stageControlPlane.stages.push(proofStage);
  writeJson(stageControlPlanePath, stageControlPlane);

  const report = runCli([
    'agents',
    'conformance',
    '--agent',
    `sample=${repoDir}`,
  ]).standard_domain_agent_conformance;
  const repo = report.reports[0];
  const checks = repo.golden_path_default_surface_budget_checks;

  assert.equal(report.status, 'blocked');
  assert.equal(checks.status, 'blocked');
  assert.equal(checks.default_route_count, 1);
  assert.deepEqual(checks.default_route_stage_ids, ['domain_intake']);
  assert.equal(
    repo.blockers.includes('golden_path_explicit_lane_declares_default:provider_proof_lane:proof'),
    true,
  );
});

test('agents conformance reports the single ordinary route budget for ready Foundry Agents', () => {
  const repoDir = buildReadyAgentRepo();
  const report = runCli([
    'agents',
    'conformance',
    '--agent',
    `sample=${repoDir}`,
  ]).standard_domain_agent_conformance;
  const repo = report.reports[0];

  assert.equal(report.status, 'passed');
  assert.equal(repo.golden_path_default_surface_budget_checks.status, 'passed');
  assert.equal(repo.golden_path_default_surface_budget_checks.policy_id, 'golden_path_single_default');
  assert.equal(repo.golden_path_default_surface_budget_checks.default_route_count, 1);
  assert.deepEqual(repo.golden_path_default_surface_budget_checks.default_route_stage_ids, ['domain_intake']);
  assert.deepEqual(repo.golden_path_default_surface_budget_checks.explicit_non_default_lane_stage_ids, []);
  assert.equal(
    repo.golden_path_default_surface_budget_checks.authority_boundary.guard_can_write_domain_truth,
    false,
  );
});

test('agents conformance requires proof diagnostic cleanup and long-soak route variants to be explicit', () => {
  const repoDir = buildReadyAgentRepo();
  const stageControlPlanePath = path.join(repoDir, 'contracts', 'stage_control_plane.json');
  const stageControlPlane = parseJsonText(fs.readFileSync(stageControlPlanePath, 'utf8')) as any;
  stageControlPlane.stages.push(
    {
      ...stageControlPlane.stages[0],
      stage_id: 'provider_proof_observation',
      title: 'Provider proof observation',
      selected_executor: {
        ...stageControlPlane.stages[0].selected_executor,
        default_executor: false,
      },
    },
    {
      ...stageControlPlane.stages[0],
      stage_id: 'legacy_cleanup_sweep',
      title: 'Legacy cleanup sweep',
      selected_executor: {
        ...stageControlPlane.stages[0].selected_executor,
        default_executor: false,
      },
    },
    {
      ...stageControlPlane.stages[0],
      stage_id: 'runtime_long_soak_window',
      title: 'Runtime long soak window',
      selected_executor: {
        ...stageControlPlane.stages[0].selected_executor,
        default_executor: false,
      },
    },
  );
  writeJson(stageControlPlanePath, stageControlPlane);

  const report = runCli([
    'agents',
    'conformance',
    '--agent',
    `sample=${repoDir}`,
  ]).standard_domain_agent_conformance;
  const repo = report.reports[0];
  const checks = repo.golden_path_default_surface_budget_checks;

  assert.equal(report.status, 'blocked');
  assert.equal(checks.status, 'blocked');
  assert.deepEqual(checks.default_route_stage_ids, ['domain_intake']);
  assert.equal(
    checks.blockers.includes('golden_path_variant_lane_not_explicit:provider_proof_observation:proof'),
    true,
  );
  assert.equal(
    checks.blockers.includes('golden_path_variant_lane_not_explicit:legacy_cleanup_sweep:cleanup'),
    true,
  );
  assert.equal(
    checks.blockers.includes('golden_path_variant_lane_not_explicit:runtime_long_soak_window:long_soak'),
    true,
  );
});

test('agents conformance consumes golden path profile as the ordinary default route contract', () => {
  const repoDir = buildReadyAgentRepo();
  writeJson(path.join(repoDir, 'contracts', 'golden_path_profile.json'), {
    surface_kind: 'opl_golden_path_profile',
    schema_version: 'golden-path-profile.v1',
    profile_id: 'sample-brief-agent.golden-path',
    domain: 'sample-brief-agent',
    ordinary_path: {
      path_id: 'sample_secondary_default',
      path_role: 'ordinary_default',
      stage_refs: ['secondary_default_stage'],
    },
    explicit_variants: [],
    default_surface_policy: {
      ordinary_route_count: 1,
      variants_hidden_by_default: true,
      raw_evidence_hidden_by_default: true,
    },
    authority_boundary: {
      ordinary_path_count_must_be_one: true,
      variant_can_be_default_without_explicit_selection: false,
      opl_can_write_domain_truth: false,
      opl_can_authorize_domain_ready: false,
      opl_can_authorize_quality_verdict: false,
      opl_can_mutate_artifact_body: false,
    },
  });

  const report = runCli([
    'agents',
    'conformance',
    '--agent',
    `sample=${repoDir}`,
  ]).standard_domain_agent_conformance;
  const checks = report.reports[0].golden_path_default_surface_budget_checks;

  assert.equal(report.status, 'blocked');
  assert.equal(checks.golden_path_profile.status, 'blocked');
  assert.deepEqual(checks.golden_path_profile.ordinary_stage_refs, ['secondary_default_stage']);
  assert.equal(
    checks.blockers.includes(
      'golden_path_profile_ordinary_path_mismatch:profile=secondary_default_stage:stage_control_plane=domain_intake',
    ),
    true,
  );
});
