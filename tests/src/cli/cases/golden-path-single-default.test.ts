import { assert, fs, parseJsonText, path, runCli, test } from '../helpers.ts';
import { compileStandardAgentStageManifest } from '../../../../src/modules/pack/index.ts';
import {
  buildReadyAgentRepo,
  writeJson,
} from './agents-conformance-fixtures.ts';

function addOptionalActionRouteStages(repoDir: string, stageIds: string[]) {
  const actionCatalogPath = path.join(repoDir, 'contracts', 'action_catalog.json');
  const actionCatalog = parseJsonText(fs.readFileSync(actionCatalogPath, 'utf8')) as any;
  actionCatalog.actions[0].stage_route.optional_stage_refs.push(...stageIds);
  writeJson(actionCatalogPath, actionCatalog);
}

test('agents conformance ignores legacy stage-plane default routes after manifest cutover', () => {
  const repoDir = buildReadyAgentRepo();
  const stageControlPlanePath = path.join(repoDir, 'contracts', 'stage_control_plane.json');
  const stageControlPlane = compileStandardAgentStageManifest(repoDir).stage_control_plane as any;
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

  assert.equal(report.status, 'passed');
  assert.equal(repo.status, 'passed');
  assert.equal(repo.golden_path_default_surface_budget_checks.status, 'passed');
  assert.equal(repo.golden_path_default_surface_budget_checks.default_route_count, 1);
  assert.deepEqual(repo.golden_path_default_surface_budget_checks.default_route_stage_ids, ['domain_intake']);
});

test('agents conformance treats explicit Codex follow-on lanes as non-default route variants', () => {
  const repoDir = buildReadyAgentRepo();
  const stageManifestPath = path.join(repoDir, 'agent/stages/manifest.json');
  const stageManifest = parseJsonText(fs.readFileSync(stageManifestPath, 'utf8')) as any;
  const followOnStage = {
    ...stageManifest.stages[0],
    stage_id: 'book_materialization_follow_on',
    lane_kind: 'variant',
    title: 'Book materialization follow-on',
  };
  stageManifest.stages.push(followOnStage);
  writeJson(stageManifestPath, stageManifest);
  addOptionalActionRouteStages(repoDir, ['book_materialization_follow_on']);
  const profilePath = path.join(repoDir, 'contracts', 'standard_agent_conformance_profile.json');
  const profile = parseJsonText(fs.readFileSync(profilePath, 'utf8')) as any;
  profile.golden_path.allowed_stage_ids.push('book_materialization_follow_on');
  writeJson(profilePath, profile);

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
    false,
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
  const stageManifestPath = path.join(repoDir, 'agent/stages/manifest.json');
  const stageManifest = parseJsonText(fs.readFileSync(stageManifestPath, 'utf8')) as any;
  stageManifest.stages.push(
    {
      ...stageManifest.stages[0],
      stage_id: 'provider_proof_observation',
      title: 'Provider proof observation',
    },
    {
      ...stageManifest.stages[0],
      stage_id: 'legacy_cleanup_sweep',
      title: 'Legacy cleanup sweep',
    },
    {
      ...stageManifest.stages[0],
      stage_id: 'runtime_long_soak_window',
      title: 'Runtime long soak window',
    },
  );
  writeJson(stageManifestPath, stageManifest);
  addOptionalActionRouteStages(repoDir, [
    'provider_proof_observation',
    'legacy_cleanup_sweep',
    'runtime_long_soak_window',
  ]);

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

test('agents conformance consumes the standard agent profile as the ordinary default route contract', () => {
  const repoDir = buildReadyAgentRepo();
  const profilePath = path.join(repoDir, 'contracts', 'standard_agent_conformance_profile.json');
  const profile = parseJsonText(fs.readFileSync(profilePath, 'utf8')) as any;
  profile.golden_path.default_stage_id = 'secondary_default_stage';
  writeJson(profilePath, profile);

  const report = runCli([
    'agents',
    'conformance',
    '--agent',
    `sample=${repoDir}`,
  ]).standard_domain_agent_conformance;
  const checks = report.reports[0].golden_path_default_surface_budget_checks;

  assert.equal(report.status, 'blocked');
  assert.equal(checks.mvp_cognitive_kernel_alignment.status, 'blocked');
  assert.equal(checks.mvp_cognitive_kernel_alignment.default_stage_id, 'secondary_default_stage');
  assert.equal(
    checks.blockers.includes('golden_path_default_stage_mismatch:secondary_default_stage'),
    true,
  );
});
