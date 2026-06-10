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
  assert.equal(alignment.agent_alignment, 'rca_visual_golden_path');
  assert.deepEqual(alignment.ordinary_golden_path_stage_ids, [
    'source_intake',
    'communication_strategy',
    'visual_direction',
    'artifact_creation',
    'review_and_revision',
    'package_and_handoff',
  ]);
  assert.equal(
    alignment.route_variant_lane_policy,
    'render_screenshot_native_pptx_and_export_helpers_are_affordances_or_explicit_lanes',
  );
  assert.equal(alignment.cognitive_kernel_policy.stage_internal_strategy_owner, 'selected_executor');
  assert.equal(alignment.cognitive_kernel_policy.tool_affordances_are_catalog_not_workflow_script, true);
  assert.equal(alignment.cognitive_kernel_policy.route_variants_do_not_become_default_golden_path, true);
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
  assert.equal(alignment.agent_alignment, 'oma_work_order_proposal_materializer_boundary');
  assert.deepEqual(alignment.allowed_boundary_stage_ids, [
    'intent-intake',
    'stage-decomposition',
    'target-agent-takeover',
  ]);
  assert.equal(
    alignment.target_owner_receipt_policy,
    'target_owner_receipts_or_typed_blockers_only_no_oma_receipt_signing',
  );
  assert.equal(
    alignment.materializer_policy,
    'work_order_proposal_and_candidate_materializer_only_not_second_opl_framework',
  );
  assert.equal(alignment.cognitive_kernel_policy.app_read_model_root, 'current_owner_delta');
  assert.deepEqual(alignment.forbidden_owner_claims, []);
  assert.deepEqual(alignment.blockers, []);
});
