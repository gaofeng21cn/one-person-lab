import { buildSampleAgentLabSuite } from '../../../../src/modules/foundry-lab/agent-lab.ts';
import { assert, fs, os, path, runCli, test } from '../helpers.ts';

test('agent-lab evolve keeps a suite refs-only and pending independent review', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-lab-evolve-suite-'));
  const suitePath = path.join(tmpDir, 'suite.json');
  const sample = buildSampleAgentLabSuite();
  const suite = {
    ...sample,
    suite_id: 'agent-lab-evolve-minimal-suite',
    tasks: [sample.tasks[0]],
  };

  try {
    fs.writeFileSync(suitePath, `${JSON.stringify(suite, null, 2)}\n`);
    const result = runCli(['agent-lab', 'evolve', '--suite', suitePath, '--json'])
      .agent_lab_evolve;

    assert.equal(result.surface_kind, 'opl_agent_lab_evolution_result');
    assert.equal(result.status, 'blocked_from_auto_promotion');
    assert.equal(result.independent_ai_review_assessment.review_status, 'review_pending');
    assert.equal(result.automatic_mechanism_promotion_ready, false);
    assert.equal(result.next_mechanism_candidate.default_promotion, false);
    assert.deepEqual(
      {
        domain_truth: result.meta_edit_receipt.writes_domain_truth,
        memory_body: result.meta_edit_receipt.writes_memory_body,
        artifact: result.meta_edit_receipt.mutates_artifact,
      },
      { domain_truth: false, memory_body: false, artifact: false },
    );
    assert.equal(result.refs_only, true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
