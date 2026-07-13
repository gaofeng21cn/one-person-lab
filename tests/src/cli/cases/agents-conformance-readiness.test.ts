import { assert, runCliReadOnly, test } from '../helpers.ts';
import { buildReadyAgentRepo } from './agents-conformance-fixtures.ts';

test('agents readiness is an attention summary, not a domain-ready verdict', async () => {
  const repoDir = buildReadyAgentRepo();
  const readiness = (await runCliReadOnly([
    'agents',
    'readiness',
    '--agent',
    `sample=${repoDir}`,
  ])).agent_readiness;

  assert.equal(readiness.surface_kind, 'opl_agent_readiness_summary');
  assert.equal(readiness.status, 'passed_with_production_evidence_tail');
  assert.equal(readiness.attention_first_payload.summary.blocker_count, 0);
  assert.equal(readiness.attention_first_payload.summary.production_evidence_tail_count, 2);
  assert.deepEqual(readiness.excluded_ready_verdicts, [
    'domain_ready_verdict',
    'quality_verdict',
    'artifact_authority_verdict',
    'production_ready_verdict',
  ]);
  assert.equal(Object.hasOwn(readiness, 'domain_ready_verdict'), false);
  assert.equal(Object.hasOwn(readiness, 'production_ready_verdict'), false);
  assert.equal(readiness.summary.structural_conformance_status, 'passed');
  assert.equal(readiness.production_evidence_tail_ledger.summary.tail_item_count, 2);
  assert.equal(readiness.production_evidence_tail_ledger.authority_boundary.can_claim_domain_ready, false);
  assert.equal(readiness.authority_boundary.readiness_can_claim_domain_ready, false);
  assert.equal(readiness.authority_boundary.readiness_can_claim_artifact_authority, false);
  assert.equal(readiness.authority_boundary.readiness_can_claim_production_ready, false);
});
