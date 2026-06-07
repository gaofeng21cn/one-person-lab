import { assert, fs, path, runCli, test } from '../helpers.ts';
import {
  buildReadyAgentRepo,
  writeJson,
} from './agents-conformance-fixtures.ts';

test('agents conformance blocks missing stage operating principle policy', () => {
  const repoDir = buildReadyAgentRepo();
  fs.rmSync(path.join(repoDir, 'contracts', 'stage_operating_principles.json'));

  const report = runCli([
    'agents',
    'conformance',
    '--agent',
    `sample=${repoDir}`,
  ]).standard_domain_agent_conformance;

  assert.equal(report.status, 'blocked');
  assert.equal(report.reports[0].stage_operating_principle_checks.status, 'blocked');
  assert.equal(
    report.reports[0].blockers.includes('stage_operating_principles_not_declared'),
    true,
  );
});

test('agents conformance blocks stage policies that slow ordinary owner-delta progress', () => {
  const repoDir = buildReadyAgentRepo();
  const policyPath = path.join(repoDir, 'contracts', 'stage_operating_principles.json');
  const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
  policy.management_boundary.required_boundary_controls = [
    'stage_goal',
    'input_refs',
    'current_owner',
  ];
  policy.speed_policy.strategy_refs_block_launch_by_default = true;
  policy.speed_policy.tool_catalog_can_prescribe_workflow_sequence = true;
  policy.speed_policy.preflight_or_quality_review_can_loop_without_deliverable_delta = true;
  policy.speed_policy.quality_gaps_block_ordinary_progress_by_default = true;
  policy.speed_policy.safe_action_before_diagnostic_reconcile = false;
  policy.speed_policy.next_delta_must_be_deliverable_receipt_blocker_or_handoff = false;
  policy.default_read_surface.root = 'raw_worklist';
  policy.demoted_default_surfaces = ['provider_trace'];
  policy.authority_boundary.policy_can_claim_domain_ready = true;
  writeJson(policyPath, policy);

  const report = runCli([
    'agents',
    'conformance',
    '--agent',
    `sample=${repoDir}`,
  ]).standard_domain_agent_conformance;

  const checks = report.reports[0].stage_operating_principle_checks;
  assert.equal(report.status, 'blocked');
  assert.equal(checks.status, 'blocked');
  assert.equal(
    checks.blockers.includes('stage_operating_principles_boundary_control_missing:accepted_answer_shape'),
    true,
  );
  assert.equal(
    checks.blockers.includes('stage_operating_principles_strategy_refs_must_not_block_launch_by_default'),
    true,
  );
  assert.equal(
    checks.blockers.includes('stage_operating_principles_quality_gaps_must_not_block_ordinary_progress_by_default'),
    true,
  );
  assert.equal(
    checks.blockers.includes('stage_operating_principles_tool_catalog_must_not_prescribe_workflow_sequence'),
    true,
  );
  assert.equal(
    checks.blockers.includes('stage_operating_principles_preflight_quality_loop_without_delta_forbidden'),
    true,
  );
  assert.equal(
    checks.blockers.includes('stage_operating_principles_safe_action_before_diagnostic_reconcile_missing'),
    true,
  );
  assert.equal(
    checks.blockers.includes('stage_operating_principles_next_delta_shape_guard_missing'),
    true,
  );
  assert.equal(
    checks.blockers.includes('stage_operating_principles_default_read_surface_must_be_current_owner_delta'),
    true,
  );
  assert.equal(
    checks.blockers.includes('stage_operating_principles_demoted_default_surface_missing:raw_worklist'),
    true,
  );
  assert.equal(
    checks.blockers.includes('stage_operating_principles_policy_can_claim_domain_ready_must_be_false'),
    true,
  );
});
