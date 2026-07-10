import assert from 'node:assert/strict';
import test from 'node:test';

import { buildSampleAgentLabSuite, runAgentLabSuite } from '../../src/modules/foundry-lab/agent-lab.ts';

test('Agent Lab projects nested mechanism inputs as body-free non-authority refs', () => {
  const suite = buildSampleAgentLabSuite();
  suite.tasks = [{
    ...suite.tasks[0],
    mechanism_evolution_inputs: {
      surface_kind: 'agent_lab_mechanism_evolution_inputs',
      research_memory_graph: {
        surface_kind: 'research_memory_graph_refs',
        graph_kind: 'body_free_research_memory_graph',
        body_included: false,
        paper_refs: ['paper-ref:example/current'],
      },
      assurance_contract: {
        surface_kind: 'assurance_contract_refs',
        contract_kind: 'body_free_assurance_contract',
        body_included: false,
        assurance_contract_refs: ['assurance-contract:example/current'],
        submission_gate_refs: ['submission-gate:example/owner'],
      },
    },
  }];

  const result = runAgentLabSuite(suite);
  const inputs = result.runs[0].mechanism_evolution_inputs;

  assert.ok(inputs);
  assert.equal(inputs.body_included, false);
  assert.equal(inputs.research_memory_graph?.body_included, false);
  assert.equal(inputs.assurance_contract?.body_included, false);
  assert.equal(inputs.assurance_contract?.can_authorize_submission_action, false);
  assert.ok(result.refs.mechanism_evolution_input_refs.includes('paper-ref:example/current'));
  assert.ok(result.refs.mechanism_evolution_input_refs.includes('submission-gate:example/owner'));
  assert.equal(inputs.authority_boundary.can_write_domain_truth, false);
  assert.equal(inputs.authority_boundary.can_write_memory_body, false);
});
