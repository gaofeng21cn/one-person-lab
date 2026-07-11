import { assert, runCli, test } from '../helpers.ts';
import {
  buildReadyAgentRepo,
  configureReadyMetaMorphology,
  configureReadyRcaMorphology,
  retargetReadyRepo,
} from './agents-conformance-fixtures.ts';

test('agents conformance projects RCA visual golden path and explicit helper lanes', () => {
  const repoDir = buildReadyAgentRepo();
  retargetReadyRepo(repoDir, 'redcube-ai', 'RedCube AI');
  configureReadyRcaMorphology(repoDir);

  const report = runCli([
    'agents',
    'conformance',
    '--agent',
    `rca=${repoDir}`,
  ]).standard_domain_agent_conformance;
  const goldenPath = report.reports[0].golden_path_default_surface_budget_checks;
  const alignment = goldenPath.mvp_cognitive_kernel_alignment;

  assert.equal(report.status, 'passed');
  assert.equal(goldenPath.default_route_count, 1);
  assert.deepEqual(goldenPath.default_route_stage_ids, ['source_intake']);
  assert.deepEqual(goldenPath.explicit_non_default_lane_stage_ids, [
    'render_preview_lane',
    'screenshot_review_lane',
    'native_pptx_export_lane',
  ]);
  assert.equal(alignment.status, 'passed');
  assert.equal(alignment.profile_source, 'contracts/standard_agent_conformance_profile.json');
  assert.equal(alignment.profile_id, 'redcube-ai.standard-agent-conformance.v1');
  assert.deepEqual(alignment.required_stage_ids, [
    'source_intake',
    'communication_strategy',
    'visual_direction',
    'artifact_creation',
    'review_and_revision',
    'package_and_handoff',
    'render_preview_lane',
    'screenshot_review_lane',
    'native_pptx_export_lane',
  ]);
  assert.deepEqual(alignment.allowed_stage_ids, alignment.required_stage_ids);
  assert.equal(alignment.default_stage_id, 'source_intake');
  assert.deepEqual(alignment.forbidden_owner_claims, []);
  assert.deepEqual(alignment.blockers, []);
});

test('agents conformance keeps OMA at work-order proposal materializer boundary', () => {
  const repoDir = buildReadyAgentRepo();
  retargetReadyRepo(repoDir, 'opl-meta-agent', 'OPL Meta Agent');
  configureReadyMetaMorphology(repoDir);

  const report = runCli([
    'agents',
    'conformance',
    '--agent',
    `opl-meta-agent=${repoDir}`,
  ]).standard_domain_agent_conformance;
  const goldenPath = report.reports[0].golden_path_default_surface_budget_checks;
  const alignment = goldenPath.mvp_cognitive_kernel_alignment;

  assert.equal(report.status, 'passed');
  assert.equal(goldenPath.default_route_count, 1);
  assert.deepEqual(goldenPath.default_route_stage_ids, ['intent-intake']);
  assert.deepEqual(goldenPath.explicit_non_default_lane_stage_ids, []);
  assert.equal(alignment.status, 'passed');
  assert.equal(alignment.profile_source, 'contracts/standard_agent_conformance_profile.json');
  assert.equal(alignment.profile_id, 'opl-meta-agent.standard-agent-conformance.v1');
  assert.deepEqual(alignment.required_stage_ids, [
    'intent-intake',
    'stage-decomposition',
    'target-agent-takeover',
  ]);
  assert.deepEqual(alignment.allowed_stage_ids, alignment.required_stage_ids);
  assert.equal(alignment.default_stage_id, 'intent-intake');
  assert.deepEqual(alignment.forbidden_owner_claims, []);
  assert.deepEqual(alignment.blockers, []);
});
