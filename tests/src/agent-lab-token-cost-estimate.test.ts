import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAgentLabCostEstimate } from '../../src/agent-lab.ts';

test('Agent Lab exposes a refs-only RCA 40-slide cost estimate without domain authority', () => {
  assert.equal(typeof buildAgentLabCostEstimate, 'function',
    'src/agent-lab.ts should export buildAgentLabCostEstimate for refs-only cost estimates');

  const estimate = buildAgentLabCostEstimate({ preset: 'rca-ppt-40' });

  assert.equal(estimate.surface_kind, 'opl_agent_lab_cost_estimate');
  assert.equal(estimate.version, 'opl-agent-lab.v1.cost-estimate');
  assert.equal(estimate.refs_only, true);
  assert.equal(estimate.preset_id, 'rca-ppt-40');
  assert.equal(estimate.domain_id, 'redcube-ai');
  assert.equal(estimate.artifact_profile.artifact_kind, 'presentation_deck');
  assert.equal(estimate.artifact_profile.slide_count, 40);
  assert.equal(estimate.models.text_model, 'gpt-5.5');
  assert.equal(estimate.models.reasoning_effort, 'xhigh');
  assert.equal(estimate.models.image_model, 'gpt-image-2');
  assert.equal(estimate.pricing_snapshot.status, 'snapshot_ref_only');
  assert.match(estimate.pricing_snapshot.pricing_ref, /^pricing-snapshot-ref:/);
  assert.equal(estimate.uncertainty.status, 'estimate_only');
  assert.ok(estimate.uncertainty.factors.includes('model_pricing_may_change'));

  assert.ok(Array.isArray(estimate.per_stage_estimates));
  assert.ok(estimate.per_stage_estimates.length >= 4);
  assert.deepEqual(estimate.per_stage_estimates.map((entry: any) => entry.stage_id), [
    'intake',
    'outline',
    'slide_generation',
    'image_generation',
    'render_review',
    'revision',
  ]);
  for (const stage of estimate.per_stage_estimates) {
    assert.equal(stage.refs_only, true);
    assert.equal(stage.token_estimate.estimated_input_tokens > 0, true);
    assert.equal(stage.token_estimate.estimated_output_tokens > 0, true);
    assert.equal(stage.token_estimate.estimated_total_tokens > 0, true);
    assert.equal(stage.cost_estimate.estimated_cost_usd >= 0, true);
    assert.match(stage.estimate_ref, /^cost-estimate-ref:agent-lab\/rca-ppt-40\//);
  }

  assert.equal(estimate.total_estimate.estimated_input_tokens > 0, true);
  assert.equal(estimate.total_estimate.estimated_output_tokens > 0, true);
  assert.equal(estimate.total_estimate.estimated_total_tokens > 0, true);
  assert.equal(estimate.total_estimate.estimated_cost_usd > 0, true);
  assert.match(estimate.total_estimate.estimate_ref, /^cost-estimate-ref:agent-lab\/rca-ppt-40\/total/);
  assert.equal(estimate.authority_boundary.can_write_domain_truth, false);
  assert.equal(estimate.authority_boundary.can_mutate_domain_artifact, false);
  assert.equal(estimate.authority_boundary.can_authorize_quality_verdict, false);
  assert.equal(estimate.authority_boundary.can_authorize_export_verdict, false);
  assert.equal(estimate.authority_boundary.can_write_owner_receipt, false);
  assert.equal(estimate.authority_boundary.can_write_memory_body, false);
  assert.equal('domain_verdict' in estimate, false);
  assert.equal('artifact_mutation' in estimate, false);
  assert.equal('quality_verdict' in estimate, false);
});
