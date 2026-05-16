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
