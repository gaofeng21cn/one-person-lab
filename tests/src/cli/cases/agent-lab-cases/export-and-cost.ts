import { assert, fs, os, path, runCli, runCliFailure, test } from '../../helpers.ts';
import { STANDARD_AGENT_REGISTRY } from '../../../../../src/kernel/standard-agent-registry.ts';
import { defaultStandardDomainAgentRepoInputs } from '../../../../../src/modules/atlas/index.ts';

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

test('agent-lab cost-estimate consumes a generic workload profile without a built-in preset', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-lab-cost-profile-'));
  const profilePath = path.join(root, 'agent_lab_cost_profile.json');
  const profile = {
    surface_kind: 'opl_agent_lab_cost_estimate_profile',
    version: 'opl-agent-lab-cost-estimate-profile.v1',
    profile_id: 'example-visual-workload',
    owner: 'example-domain',
    domain_id: 'example-domain',
    task_family: 'generic_visual_delivery',
    estimate_ref: 'cost-estimate:agent-lab/example-domain/visual-workload/gpt-5.5',
    artifact_profile: {
      artifact_kind: 'visual_delivery',
      slide_count: 2,
    },
    stages: [
      {
        stage_id: 'planning',
        stage_ref: 'cost-estimate-ref:agent-lab/example-visual-workload/planning',
        stage_kind: 'generic_delivery_planning',
        owner: 'example-domain',
        model_ref: 'openai:gpt-5.5',
        reasoning_effort: 'high',
        slide_count: 2,
        text_tokens: { input_tokens: 26_000, cached_input_tokens: 9_000, output_tokens: 7_500 },
        assumption_refs: ['assumption:example-visual-workload/one-planning-pass'],
        calibration_refs: ['calibration-ref:agent-lab/example-planning-usage-needed'],
      },
      {
        stage_id: 'image_generation',
        stage_ref: 'cost-estimate-ref:agent-lab/example-visual-workload/image-generation',
        stage_kind: 'image_generation_and_edits',
        owner: 'example-domain',
        model_ref: 'openai:gpt-image-2',
        operation_count: 2,
        image_tokens: {
          text_input_tokens: 8_000,
          text_cached_input_tokens: 2_000,
          image_input_tokens: 12_000,
          image_cached_input_tokens: 2_000,
          image_output_tokens: 32_000,
        },
        assumption_refs: ['assumption:example-visual-workload/one-image-operation-per-unit'],
        calibration_refs: ['calibration-ref:agent-lab/example-image-usage-needed'],
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

  assert.equal(profile.profile_id, 'example-visual-workload');
  assert.equal(profile.domain_id, 'example-domain');

  try {
    fs.writeFileSync(profilePath, `${JSON.stringify(profile, null, 2)}\n`);
    const output = runCli(['agent-lab', 'cost-estimate', '--profile', profilePath, '--json']);
    const estimate = output.agent_lab_cost_estimate.cost_estimate;

    assert.equal(output.version, 'g2');
    assert.equal(estimate.surface_kind, 'opl_agent_lab_cost_estimate');
    assert.equal(estimate.profile_id, 'example-visual-workload');
    assert.equal(estimate.profile_owner, 'example-domain');
    assert.equal(estimate.profile_ref, profilePath);
    assert.deepEqual(estimate.model_refs, ['openai:gpt-5.5', 'openai:gpt-image-2']);
    assert.deepEqual(estimate.per_stage_estimates.map((entry: any) => entry.stage_id), [
      'planning',
      'image_generation',
    ]);
    assert.equal(estimate.total_estimate.estimated_total_tokens > 0, true);
    assert.equal(estimate.total_estimate.estimated_cost_usd > 0, true);
    assert.equal(estimate.total_estimate.declared_unit_count, 2);
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
      () => runCli(['agent-lab', 'cost-estimate', '--preset', 'example-visual-workload', '--json']),
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

function rcaCostProfilePath() {
  const rca = STANDARD_AGENT_REGISTRY.find((entry) => entry.agent_id === 'rca');
  assert.ok(rca, 'standard-agent registry must expose RCA');
  const discoveredRca = defaultStandardDomainAgentRepoInputs().find(
    (entry) => entry.requested_agent_id === rca.agent_id,
  );
  const rcaRepoRoot = process.env.OPL_RCA_REPO_ROOT?.trim()
    || discoveredRca?.repo_dir;
  assert.ok(
    rcaRepoRoot,
    'standard-agent registry must discover the RCA repository; set OPL_RCA_REPO_ROOT for a non-default family layout.',
  );
  const profilePath = path.join(rcaRepoRoot, 'contracts', 'agent_lab_cost_profile.json');
  assert.equal(
    fs.existsSync(profilePath),
    true,
    `RCA owner cost profile must exist at ${profilePath}; set OPL_RCA_REPO_ROOT for a non-default family layout.`,
  );
  return profilePath;
}

test('agent-lab cost-estimate consumes the real RCA owner profile through the standard registry', () => {
  const profilePath = rcaCostProfilePath();
  const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8')) as Record<string, unknown>;
  const output = runCli(['agent-lab', 'cost-estimate', '--profile', profilePath, '--json']);
  const estimate = output.agent_lab_cost_estimate.cost_estimate;

  assert.equal(profile.canonical_agent_id, 'rca');
  assert.equal(profile.profile_id, 'rca-ppt-40');
  assert.equal(estimate.profile_id, profile.profile_id);
  assert.equal(estimate.profile_owner, profile.owner);
  assert.equal(estimate.profile_ref, profilePath);
  assert.deepEqual(estimate.per_stage_estimates.map((entry: any) => entry.stage_id), [
    'intake',
    'outline',
    'slide_generation',
    'image_generation',
    'render_review',
    'revision',
  ]);
  assert.equal(estimate.total_estimate.declared_unit_count, 40);
  assert.equal(estimate.authority_boundary.can_authorize_budget_spend, false);
  assert.equal(estimate.authority_boundary.can_claim_actual_invoice_cost, false);
});
