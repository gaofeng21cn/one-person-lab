import { assert, runCli, test } from '../helpers.ts';

test('agent-lab sample exposes a minimal framework read-model sample', () => {
  const output = runCli(['agent-lab', 'sample', '--json']);

  assert.equal(output.version, 'g2');
  assert.equal(output.agent_lab_sample.surface_id, 'opl_agent_lab_framework_sample');
  assert.equal(output.agent_lab_sample.sample_run_result.status, 'sample_ready');
  assert.equal(output.agent_lab_sample.sample_run_result.executor_kind, 'codex_cli');
  assert.equal(output.agent_lab_sample.sample_run_result.stage_runtime, 'provider_backed_stage_runtime');
  assert.deepEqual(output.agent_lab_sample.manifest_refs, [
    {
      ref_kind: 'framework_surface',
      surface_id: 'agent_lab_framework_surface',
      authority: 'opl_framework',
    },
    {
      ref_kind: 'domain_manifest_projection',
      surface_id: 'family_product_entry_manifest_v2',
      authority: 'domain_agent',
    },
  ]);
  assert.deepEqual(output.agent_lab_sample.authority_boundary, {
    framework_authority: 'OPL owns activation, stage runtime routing, read-model projection, and receipt boundaries.',
    domain_authority: 'MAS, MAG, and RCA own domain truth, artifact authority, and quality verdicts.',
    sample_scope: 'read_model_only',
  });
});
