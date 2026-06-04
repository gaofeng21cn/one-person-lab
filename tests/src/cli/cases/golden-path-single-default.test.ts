import { assert, fs, path, runCli, test } from '../helpers.ts';
import {
  buildReadyAgentRepo,
  writeJson,
} from './agents-conformance-fixtures.ts';

test('agents conformance blocks multiple ordinary default routes for a Foundry Agent', () => {
  const repoDir = buildReadyAgentRepo();
  const stageControlPlanePath = path.join(repoDir, 'contracts', 'stage_control_plane.json');
  const stageControlPlane = JSON.parse(fs.readFileSync(stageControlPlanePath, 'utf8'));
  const proofStage = {
    ...stageControlPlane.stages[0],
    stage_id: 'provider_proof_lane',
    stage_kind: 'proof',
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

  assert.equal(report.status, 'blocked');
  assert.equal(repo.status, 'blocked');
  assert.equal(repo.golden_path_default_surface_budget_checks.status, 'blocked');
  assert.equal(repo.golden_path_default_surface_budget_checks.default_route_count, 2);
  assert.deepEqual(repo.golden_path_default_surface_budget_checks.default_route_stage_ids, [
    'domain_intake',
    'provider_proof_lane',
  ]);
  assert.equal(
    repo.blockers.includes('golden_path_single_default_violation:default_route_count=2'),
    true,
  );
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
