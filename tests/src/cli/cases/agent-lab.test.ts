import { assert, runCli, test } from '../helpers.ts';

test('agent-lab sample exposes a minimal framework read-model sample', () => {
  const output = runCli(['agent-lab', 'sample', '--json']);

  assert.equal(output.version, 'g2');
  assert.equal(output.agent_lab_sample.surface_id, 'opl_agent_lab_framework_sample');
  assert.equal(output.agent_lab_sample.sample_result.surface_kind, 'opl_agent_lab_suite_result');
  assert.equal(output.agent_lab_sample.sample_result.status, 'passed');
  assert.equal(output.agent_lab_sample.sample_result.summary.task_count, 3);
  assert.equal(output.agent_lab_sample.sample_result.summary.recovery_probe_count, 5);
  assert.deepEqual(output.agent_lab_sample.ref_summary.scorecard_refs, [
    'quality-scorecard:mas/paper-repair-smoke',
    'quality-scorecard:mag/grant-section-smoke',
    'quality-scorecard:rca/visual-deliverable-smoke',
  ]);
  assert.equal(output.agent_lab_sample.authority_boundary.can_authorize_quality_verdict, false);
  assert.equal(output.agent_lab_sample.authority_boundary.can_write_memory_body, false);
});

test('agent-lab longline exposes the central cross-domain longline suite and repo test reduction guidance', () => {
  const output = runCli(['agent-lab', 'longline', '--json']);

  assert.equal(output.version, 'g2');
  assert.equal(output.agent_lab_longline.surface_id, 'opl_agent_lab_longline_suite');
  assert.equal(output.agent_lab_longline.suite_result.status, 'passed');
  assert.equal(output.agent_lab_longline.suite_result.suite_kind, 'agent_lab_longline_suite');
  assert.equal(output.agent_lab_longline.suite_result.longline_summary.longline_task_count, 3);
  assert.equal(output.agent_lab_longline.suite_result.longline_summary.ready_to_reduce_domain_longline_tests, true);
  assert.deepEqual(output.agent_lab_longline.suite_result.longline_summary.domain_ids, [
    'med-autoscience',
    'med-autogrant',
    'redcube-ai',
  ]);
  assert.equal(output.agent_lab_longline.authority_boundary.can_authorize_quality_verdict, false);
  assert.equal(output.agent_lab_longline.authority_boundary.can_write_domain_truth, false);
});
