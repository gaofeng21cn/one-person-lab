import { assert, fs, os, path, runCli, runCliFailure, test } from '../../helpers.ts';

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

test('agent-lab cost-estimate consumes a domain-owned workload profile without a built-in preset', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-lab-cost-profile-'));
  const profilePath = path.join(root, 'agent_lab_cost_profile.json');
  const profile = {
    surface_kind: 'opl_agent_lab_cost_estimate_profile',
    version: 'opl-agent-lab-cost-estimate-profile.v1',
    profile_id: 'rca-ppt-40',
    owner: 'redcube_ai',
    domain_id: 'redcube-ai',
    task_family: 'presentation_foundry_visual_delivery',
    estimate_ref: 'cost-estimate:agent-lab/redcube-ai/ppt-40/gpt-5.5-xhigh',
    artifact_profile: {
      artifact_kind: 'presentation_deck',
      slide_count: 40,
    },
    stages: [
      {
        stage_id: 'outline',
        stage_ref: 'cost-estimate-ref:agent-lab/rca-ppt-40/outline',
        stage_kind: 'storyline_and_slide_architecture',
        owner: 'redcube-ai',
        model_ref: 'openai:gpt-5.5',
        reasoning_effort: 'xhigh',
        slide_count: 40,
        text_tokens: { input_tokens: 260_000, cached_input_tokens: 90_000, output_tokens: 75_000 },
        assumption_refs: ['assumption:rca-ppt-40/one-major-storyline-pass'],
        calibration_refs: ['calibration-ref:agent-lab/rca-storyline-token-ledger-needed'],
      },
      {
        stage_id: 'image_generation',
        stage_ref: 'cost-estimate-ref:agent-lab/rca-ppt-40/image-generation',
        stage_kind: 'image_generation_and_edits',
        owner: 'redcube-ai',
        model_ref: 'openai:gpt-image-2',
        operation_count: 40,
        image_tokens: {
          text_input_tokens: 80_000,
          text_cached_input_tokens: 20_000,
          image_input_tokens: 120_000,
          image_cached_input_tokens: 20_000,
          image_output_tokens: 320_000,
        },
        assumption_refs: ['assumption:rca-ppt-40/one-image-operation-per-slide-average'],
        calibration_refs: ['calibration-ref:agent-lab/rca-gpt-image-2-usage-ledger-needed'],
      },
    ],
    pricing_boundary: {
      pricing_snapshot_owned_by_profile: false,
      pricing_calculation_owned_by_profile: false,
      generic_estimator_owner: 'one-person-lab',
      profile_supplies_workload_assumptions_only: true,
    },
    calibration_policy: {
      status: 'estimate_profile_requires_provider_usage_receipts',
      required_runtime_receipt_refs: ['usage-receipt-ref:provider/openai/responses-token-usage'],
      variance_policy: 'compare_profile_estimate_to_provider_usage_without_rewriting_domain_truth',
    },
    authority_boundary: {
      refs_only: true,
      can_authorize_budget_spend: false,
      can_claim_actual_invoice_cost: false,
      can_claim_visual_ready: false,
      can_claim_exportable: false,
      can_write_domain_truth: false,
      can_write_artifact_body: false,
      can_write_owner_receipt: false,
    },
  };

  try {
    fs.writeFileSync(profilePath, `${JSON.stringify(profile, null, 2)}\n`);
    const output = runCli(['agent-lab', 'cost-estimate', '--profile', profilePath, '--json']);
    const estimate = output.agent_lab_cost_estimate.cost_estimate;

    assert.equal(output.version, 'g2');
    assert.equal(estimate.surface_kind, 'opl_agent_lab_cost_estimate');
    assert.equal(estimate.profile_id, 'rca-ppt-40');
    assert.equal(estimate.profile_owner, 'redcube_ai');
    assert.equal(estimate.profile_ref, profilePath);
    assert.deepEqual(estimate.model_refs, ['openai:gpt-5.5', 'openai:gpt-image-2']);
    assert.deepEqual(estimate.per_stage_estimates.map((entry: any) => entry.stage_id), [
      'outline',
      'image_generation',
    ]);
    assert.equal(estimate.total_estimate.estimated_total_tokens > 0, true);
    assert.equal(estimate.total_estimate.estimated_cost_usd > 0, true);
    assert.equal(estimate.total_estimate.declared_unit_count, 40);
    assert.equal(Object.hasOwn(estimate, 'stages'), false);
    assert.equal(Object.hasOwn(estimate, 'totals'), false);
    assert.equal(estimate.authority_boundary.can_write_domain_truth, false);
    assert.equal(estimate.authority_boundary.can_authorize_budget_spend, false);

    const invalidProfiles = [
      ['version', { ...profile, version: 'v2' }],
      ['pricing_boundary.generic_estimator_owner', {
        ...profile,
        pricing_boundary: { ...profile.pricing_boundary, generic_estimator_owner: 'redcube-ai' },
      }],
      ['calibration_policy', { ...profile, calibration_policy: undefined }],
      ['authority_boundary', { ...profile, authority_boundary: undefined }],
      ['stages[0].owner', {
        ...profile,
        stages: [{ ...profile.stages[0], owner: 'different-owner' }, profile.stages[1]],
      }],
    ] as const;
    for (const [field, invalidProfile] of invalidProfiles) {
      fs.writeFileSync(profilePath, `${JSON.stringify(invalidProfile, null, 2)}\n`);
      const failure = runCliFailure(['agent-lab', 'cost-estimate', '--profile', profilePath]);
      assert.equal(failure.payload.error.code, 'contract_shape_invalid', field);
      assert.equal(failure.payload.error.details.field, field);
    }

    const missing = runCliFailure([
      'agent-lab',
      'cost-estimate',
      '--profile',
      path.join(root, 'missing.json'),
    ]);
    assert.equal(missing.payload.error.code, 'contract_file_missing');
    fs.writeFileSync(profilePath, '{invalid-json');
    const invalidJson = runCliFailure(['agent-lab', 'cost-estimate', '--profile', profilePath]);
    assert.equal(invalidJson.payload.error.code, 'contract_json_invalid');

    assert.throws(
      () => runCli(['agent-lab', 'cost-estimate', '--preset', 'rca-ppt-40', '--json']),
      /Unknown option|profile/,
    );
    assert.throws(
      () => runCli(['agent-lab', 'cost-estimate', '--json']),
      /requires --profile/,
    );

    const complete = runCli(['agent-lab', 'complete', '--json']).agent_lab_complete;
    assert.equal(complete.readiness.ready_to_emit_token_cost_estimates, false);
    assert.equal(complete.readiness.token_cost_estimate_profile_required, true);
    assert.equal(Object.hasOwn(complete, 'token_cost_estimates'), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
