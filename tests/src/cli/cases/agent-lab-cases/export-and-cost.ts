import { assert, runCli, test } from '../../helpers.ts';

test('agent-lab export emits refs-only connector envelopes for optional targets', () => {
  const inspect = runCli(['agent-lab', 'export', '--target', 'inspect-ai', '--json']);
  const openinference = runCli(['agent-lab', 'export', '--target', 'openinference', '--json']);
  const langfuse = runCli(['agent-lab', 'export', '--target', 'langfuse', '--json']);
  const phoenix = runCli(['agent-lab', 'export', '--target', 'phoenix', '--json']);
  const json = runCli(['agent-lab', 'export', '--target', 'json', '--json']);

  assert.equal(inspect.agent_lab_export.surface_kind, 'opl_agent_lab_export_envelope');
  assert.equal(inspect.agent_lab_export.target, 'inspect-ai');
  assert.equal(inspect.agent_lab_export.upload_external_service, false);
  assert.equal(inspect.agent_lab_export.reads_domain_body, false);
  assert.equal(inspect.agent_lab_export.connector_payload.tasks.length, 6);
  assert.equal(openinference.agent_lab_export.connector_payload.traces.length, 6);
  assert.ok(openinference.agent_lab_export.connector_payload.traces.some((trace: any) =>
    trace.trace_ref === 'trace-ref:codex/mag-grant-section-smoke'));
  assert.equal(langfuse.agent_lab_export.connector_payload.datasets.length, 2);
  assert.equal(phoenix.agent_lab_export.connector_payload.experiments.length, 2);
  assert.equal(json.agent_lab_export.connector_payload.suite_results.length, 2);
});

test('agent-lab cost-estimate emits a refs-only RCA 40-slide token and cost estimate', () => {
  const output = runCli(['agent-lab', 'cost-estimate', '--preset', 'rca-ppt-40', '--json']);

  assert.equal(output.version, 'g2');
  assert.equal(output.agent_lab_cost_estimate.surface_id, 'opl_agent_lab_cost_estimate');
  assert.equal(output.agent_lab_cost_estimate.cost_estimate.surface_kind, 'opl_agent_lab_cost_estimate');
  assert.equal(output.agent_lab_cost_estimate.cost_estimate.version, 'opl-agent-lab.v1.cost-estimate');
  assert.equal(output.agent_lab_cost_estimate.cost_estimate.refs_only, true);
  assert.equal(output.agent_lab_cost_estimate.cost_estimate.preset_id, 'rca-ppt-40');
  assert.equal(output.agent_lab_cost_estimate.cost_estimate.domain_id, 'redcube-ai');
  assert.equal(output.agent_lab_cost_estimate.cost_estimate.artifact_profile.artifact_kind, 'presentation_deck');
  assert.equal(output.agent_lab_cost_estimate.cost_estimate.artifact_profile.slide_count, 40);
  assert.equal(output.agent_lab_cost_estimate.cost_estimate.models.text_model, 'gpt-5.5');
  assert.equal(output.agent_lab_cost_estimate.cost_estimate.models.reasoning_effort, 'xhigh');
  assert.equal(output.agent_lab_cost_estimate.cost_estimate.models.image_model, 'gpt-image-2');
  assert.equal(output.agent_lab_cost_estimate.cost_estimate.pricing_snapshot.status, 'snapshot_ref_only');
  assert.match(output.agent_lab_cost_estimate.cost_estimate.pricing_snapshot.pricing_ref, /^pricing-snapshot-ref:/);
  assert.equal(output.agent_lab_cost_estimate.cost_estimate.uncertainty.status, 'estimate_only');
  assert.ok(output.agent_lab_cost_estimate.cost_estimate.uncertainty.factors.includes('model_pricing_may_change'));

  assert.deepEqual(output.agent_lab_cost_estimate.cost_estimate.per_stage_estimates.map((entry: any) => entry.stage_id), [
    'intake',
    'outline',
    'slide_generation',
    'image_generation',
    'render_review',
    'revision',
  ]);
  for (const stage of output.agent_lab_cost_estimate.cost_estimate.per_stage_estimates) {
    assert.equal(stage.refs_only, true);
    assert.equal(stage.token_estimate.estimated_input_tokens > 0, true);
    assert.equal(stage.token_estimate.estimated_output_tokens > 0, true);
    assert.equal(stage.token_estimate.estimated_total_tokens > 0, true);
    assert.equal(stage.cost_estimate.estimated_cost_usd >= 0, true);
    assert.match(stage.estimate_ref, /^cost-estimate-ref:agent-lab\/rca-ppt-40\//);
  }

  assert.equal(output.agent_lab_cost_estimate.cost_estimate.total_estimate.estimated_input_tokens > 0, true);
  assert.equal(output.agent_lab_cost_estimate.cost_estimate.total_estimate.estimated_output_tokens > 0, true);
  assert.equal(output.agent_lab_cost_estimate.cost_estimate.total_estimate.estimated_total_tokens > 0, true);
  assert.equal(output.agent_lab_cost_estimate.cost_estimate.total_estimate.estimated_cost_usd > 0, true);
  assert.equal(output.agent_lab_cost_estimate.authority_boundary.can_write_domain_truth, false);
  assert.equal(output.agent_lab_cost_estimate.authority_boundary.can_mutate_domain_artifact, false);
  assert.equal(output.agent_lab_cost_estimate.authority_boundary.can_authorize_quality_verdict, false);
  assert.equal(output.agent_lab_cost_estimate.authority_boundary.can_authorize_export_verdict, false);
  assert.equal(output.agent_lab_cost_estimate.authority_boundary.can_write_owner_receipt, false);
  assert.equal(output.agent_lab_cost_estimate.authority_boundary.can_write_memory_body, false);
});
