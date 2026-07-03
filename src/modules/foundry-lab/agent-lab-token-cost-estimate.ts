import { AGENT_LAB_AUTHORITY_BOUNDARY } from './agent-lab-authority.ts';
import { stableId } from '../runway/index.ts';

type JsonRecord = Record<string, unknown>;

export type AgentLabCostEstimatePreset = 'rca-ppt-40';

type TextTokenEstimate = {
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
};

type ImageTokenEstimate = {
  text_input_tokens: number;
  text_cached_input_tokens: number;
  image_input_tokens: number;
  image_cached_input_tokens: number;
  image_output_tokens: number;
};

type AgentLabCostEstimateStageInput = {
  stage_id: string;
  stage_ref: string;
  stage_kind: string;
  owner: 'opl' | 'redcube-ai';
  model_ref: string;
  reasoning_effort?: 'xhigh' | string;
  slide_count?: number;
  operation_count?: number;
  text_tokens?: TextTokenEstimate;
  image_tokens?: ImageTokenEstimate;
  assumption_refs: string[];
  calibration_refs: string[];
};

const USD_PER_MILLION = 1_000_000;

const OPENAI_PRICING_SNAPSHOT = {
  pricing_ref: 'pricing-snapshot-ref:openai-api-pricing/2026-05-20',
  pricing_snapshot_ref: 'pricing-snapshot-ref:openai-api-pricing/2026-05-20',
  status: 'snapshot_ref_only',
  source_url: 'https://openai.com/api/pricing/',
  captured_at: '2026-05-20',
  currency: 'USD',
  unit: 'per_1m_tokens',
  models: {
    'gpt-5.5': {
      input_usd_per_1m_tokens: 5,
      cached_input_usd_per_1m_tokens: 0.5,
      output_usd_per_1m_tokens: 30,
      long_context_input_threshold_tokens: 270_000,
      long_context_input_multiplier: 2,
      long_context_output_multiplier: 1.5,
      source_ref: 'openai-api-pricing:gpt-5.5:2026-05-20',
    },
    'gpt-image-2': {
      text_input_usd_per_1m_tokens: 5,
      text_cached_input_usd_per_1m_tokens: 1.25,
      image_input_usd_per_1m_tokens: 8,
      image_cached_input_usd_per_1m_tokens: 2,
      image_output_usd_per_1m_tokens: 30,
      source_ref: 'openai-api-pricing:gpt-image-2:2026-05-20',
    },
  },
  pricing_boundary:
    'official_price_snapshot_for_estimation_only_actual_invoice_must_come_from_provider_usage_dashboard',
};

const RCA_PPT_40_STAGES: AgentLabCostEstimateStageInput[] = [
  {
    stage_id: 'intake',
    stage_ref: 'cost-estimate-ref:agent-lab/rca-ppt-40/intake',
    stage_kind: 'source_intake_and_brief_normalization',
    owner: 'redcube-ai',
    model_ref: 'openai:gpt-5.5',
    reasoning_effort: 'xhigh',
    slide_count: 40,
    text_tokens: {
      input_tokens: 180_000,
      cached_input_tokens: 40_000,
      output_tokens: 35_000,
    },
    assumption_refs: [
      'assumption:rca-ppt-40/source-pack-under-80-pages-or-equivalent',
      'assumption:rca-ppt-40/no-large-video-transcription',
    ],
    calibration_refs: [
      'calibration-ref:agent-lab/rca-source-intake-history-needed',
    ],
  },
  {
    stage_id: 'outline',
    stage_ref: 'cost-estimate-ref:agent-lab/rca-ppt-40/outline',
    stage_kind: 'storyline_and_slide_architecture',
    owner: 'redcube-ai',
    model_ref: 'openai:gpt-5.5',
    reasoning_effort: 'xhigh',
    slide_count: 40,
    text_tokens: {
      input_tokens: 260_000,
      cached_input_tokens: 90_000,
      output_tokens: 75_000,
    },
    assumption_refs: [
      'assumption:rca-ppt-40/one-major-storyline-pass',
      'assumption:rca-ppt-40/limited-human-direction-churn',
    ],
    calibration_refs: [
      'calibration-ref:agent-lab/rca-storyline-token-ledger-needed',
    ],
  },
  {
    stage_id: 'slide_generation',
    stage_ref: 'cost-estimate-ref:agent-lab/rca-ppt-40/slide-generation',
    stage_kind: 'slide_copy_and_speaker_notes',
    owner: 'redcube-ai',
    model_ref: 'openai:gpt-5.5',
    reasoning_effort: 'xhigh',
    slide_count: 40,
    text_tokens: {
      input_tokens: 580_000,
      cached_input_tokens: 200_000,
      output_tokens: 175_000,
    },
    assumption_refs: [
      'assumption:rca-ppt-40/forty-slide-native-ppt-deck',
      'assumption:rca-ppt-40/speaker-notes-or-copy-dense-slide-drafting',
    ],
    calibration_refs: [
      'calibration-ref:agent-lab/rca-copy-generation-token-ledger-needed',
      'calibration-ref:agent-lab/rca-visual-direction-token-ledger-needed',
    ],
  },
  {
    stage_id: 'image_generation',
    stage_ref: 'cost-estimate-ref:agent-lab/rca-ppt-40/image-generation',
    stage_kind: 'image_generation_and_edits',
    owner: 'redcube-ai',
    model_ref: 'openai:gpt-image-2',
    slide_count: 40,
    operation_count: 40,
    image_tokens: {
      text_input_tokens: 80_000,
      text_cached_input_tokens: 20_000,
      image_input_tokens: 120_000,
      image_cached_input_tokens: 20_000,
      image_output_tokens: 320_000,
    },
    assumption_refs: [
      'assumption:rca-ppt-40/one-image-operation-per-slide-average',
      'assumption:rca-ppt-40/no-bulk-high-variation-image-search-loop',
      'assumption:rca-ppt-40/image-token-count-depends-on-size-quality-and-edits',
    ],
    calibration_refs: [
      'calibration-ref:agent-lab/rca-gpt-image-2-usage-ledger-needed',
    ],
  },
  {
    stage_id: 'render_review',
    stage_ref: 'cost-estimate-ref:agent-lab/rca-ppt-40/render-review',
    stage_kind: 'deck_render_review_iteration',
    owner: 'redcube-ai',
    model_ref: 'openai:gpt-5.5',
    reasoning_effort: 'xhigh',
    slide_count: 40,
    text_tokens: {
      input_tokens: 300_000,
      cached_input_tokens: 100_000,
      output_tokens: 80_000,
    },
    assumption_refs: [
      'assumption:rca-ppt-40/two-render-review-passes',
      'assumption:rca-ppt-40/screenshots-tokenized-as-model-input',
    ],
    calibration_refs: [
      'calibration-ref:agent-lab/rca-render-review-token-ledger-needed',
    ],
  },
  {
    stage_id: 'revision',
    stage_ref: 'cost-estimate-ref:agent-lab/rca-ppt-40/revision',
    stage_kind: 'final_packaging_and_handoff',
    owner: 'redcube-ai',
    model_ref: 'openai:gpt-5.5',
    reasoning_effort: 'xhigh',
    slide_count: 40,
    text_tokens: {
      input_tokens: 120_000,
      cached_input_tokens: 50_000,
      output_tokens: 35_000,
    },
    assumption_refs: [
      'assumption:rca-ppt-40/native-ppt-and-export-package',
      'assumption:rca-ppt-40/one-final-review-closeout',
    ],
    calibration_refs: [
      'calibration-ref:agent-lab/rca-handoff-token-ledger-needed',
    ],
  },
];

function roundCurrency(value: number) {
  return Math.round(value * 1000) / 1000;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function textCost(tokens: TextTokenEstimate) {
  const prices = OPENAI_PRICING_SNAPSHOT.models['gpt-5.5'];
  const longContextMultiplier = tokens.input_tokens > prices.long_context_input_threshold_tokens
    ? {
      input: prices.long_context_input_multiplier,
      output: prices.long_context_output_multiplier,
    }
    : {
      input: 1,
      output: 1,
    };
  return {
    input_usd: tokens.input_tokens * prices.input_usd_per_1m_tokens * longContextMultiplier.input / USD_PER_MILLION,
    cached_input_usd:
      tokens.cached_input_tokens * prices.cached_input_usd_per_1m_tokens * longContextMultiplier.input / USD_PER_MILLION,
    output_usd: tokens.output_tokens * prices.output_usd_per_1m_tokens * longContextMultiplier.output / USD_PER_MILLION,
  };
}

function imageCost(tokens: ImageTokenEstimate) {
  const prices = OPENAI_PRICING_SNAPSHOT.models['gpt-image-2'];
  return {
    text_input_usd: tokens.text_input_tokens * prices.text_input_usd_per_1m_tokens / USD_PER_MILLION,
    text_cached_input_usd:
      tokens.text_cached_input_tokens * prices.text_cached_input_usd_per_1m_tokens / USD_PER_MILLION,
    image_input_usd: tokens.image_input_tokens * prices.image_input_usd_per_1m_tokens / USD_PER_MILLION,
    image_cached_input_usd:
      tokens.image_cached_input_tokens * prices.image_cached_input_usd_per_1m_tokens / USD_PER_MILLION,
    image_output_usd: tokens.image_output_tokens * prices.image_output_usd_per_1m_tokens / USD_PER_MILLION,
  };
}

function stageEstimate(stage: AgentLabCostEstimateStageInput) {
  const textBreakdown = stage.text_tokens ? textCost(stage.text_tokens) : null;
  const imageBreakdown = stage.image_tokens ? imageCost(stage.image_tokens) : null;
  const estimatedCostUsd = roundCurrency(sum([
    ...Object.values(textBreakdown ?? {}),
    ...Object.values(imageBreakdown ?? {}),
  ]));
  const estimatedInputTokens = sum([
    stage.text_tokens?.input_tokens ?? 0,
    stage.text_tokens?.cached_input_tokens ?? 0,
    stage.image_tokens?.text_input_tokens ?? 0,
    stage.image_tokens?.text_cached_input_tokens ?? 0,
    stage.image_tokens?.image_input_tokens ?? 0,
    stage.image_tokens?.image_cached_input_tokens ?? 0,
  ]);
  const estimatedOutputTokens = sum([
    stage.text_tokens?.output_tokens ?? 0,
    stage.image_tokens?.image_output_tokens ?? 0,
  ]);
  return {
    ...stage,
    estimate_ref: stage.stage_ref,
    refs_only: true,
    token_estimate: {
      estimated_input_tokens: estimatedInputTokens,
      estimated_output_tokens: estimatedOutputTokens,
      estimated_total_tokens: estimatedInputTokens + estimatedOutputTokens,
    },
    cost_estimate: {
      estimated_cost_usd: estimatedCostUsd,
      currency: OPENAI_PRICING_SNAPSHOT.currency,
      pricing_snapshot_ref: OPENAI_PRICING_SNAPSHOT.pricing_snapshot_ref,
    },
    estimated_cost_usd: estimatedCostUsd,
    cost_breakdown_usd: {
      ...(textBreakdown ?? {}),
      ...(imageBreakdown ?? {}),
    },
  };
}

function tokenTotals(stages: ReturnType<typeof stageEstimate>[]) {
  return stages.reduce((totals, stage) => ({
    gpt_5_5_input_tokens: totals.gpt_5_5_input_tokens + (stage.text_tokens?.input_tokens ?? 0),
    gpt_5_5_cached_input_tokens:
      totals.gpt_5_5_cached_input_tokens + (stage.text_tokens?.cached_input_tokens ?? 0),
    gpt_5_5_output_tokens: totals.gpt_5_5_output_tokens + (stage.text_tokens?.output_tokens ?? 0),
    gpt_image_2_text_input_tokens:
      totals.gpt_image_2_text_input_tokens + (stage.image_tokens?.text_input_tokens ?? 0),
    gpt_image_2_text_cached_input_tokens:
      totals.gpt_image_2_text_cached_input_tokens + (stage.image_tokens?.text_cached_input_tokens ?? 0),
    gpt_image_2_image_input_tokens:
      totals.gpt_image_2_image_input_tokens + (stage.image_tokens?.image_input_tokens ?? 0),
    gpt_image_2_image_cached_input_tokens:
      totals.gpt_image_2_image_cached_input_tokens + (stage.image_tokens?.image_cached_input_tokens ?? 0),
    gpt_image_2_image_output_tokens:
      totals.gpt_image_2_image_output_tokens + (stage.image_tokens?.image_output_tokens ?? 0),
  }), {
    gpt_5_5_input_tokens: 0,
    gpt_5_5_cached_input_tokens: 0,
    gpt_5_5_output_tokens: 0,
    gpt_image_2_text_input_tokens: 0,
    gpt_image_2_text_cached_input_tokens: 0,
    gpt_image_2_image_input_tokens: 0,
    gpt_image_2_image_cached_input_tokens: 0,
    gpt_image_2_image_output_tokens: 0,
  });
}

function buildPresetInput(preset: AgentLabCostEstimatePreset) {
  if (preset !== 'rca-ppt-40') {
    throw new Error(`Unsupported Agent Lab cost estimate preset: ${preset}.`);
  }
  return {
    preset,
    estimate_ref: 'cost-estimate:agent-lab/redcube-ai/ppt-40/gpt-5.5-xhigh',
    task_family: 'presentation_foundry_visual_delivery',
    domain_id: 'redcube-ai',
    artifact_profile: {
      artifact_kind: 'presentation_deck',
      slide_count: 40,
      route_artifact_kind: 'ppt_deck',
      expected_route_ref: 'domain-agent-entry:redcube-ai',
      text_model_ref: 'openai:gpt-5.5',
      reasoning_effort: 'xhigh',
      image_model_ref: 'openai:gpt-image-2',
    },
    stages: RCA_PPT_40_STAGES,
  };
}

export function buildAgentLabCostEstimateReadModel(
  input: { preset?: AgentLabCostEstimatePreset; source_refs?: string[]; observed_usage_refs?: string[] } = {},
) {
  const presetInput = buildPresetInput(input.preset ?? 'rca-ppt-40');
  const stages = presetInput.stages.map(stageEstimate);
  const totalEstimatedCostUsd = roundCurrency(sum(stages.map((stage) => stage.estimated_cost_usd)));
  const totals = tokenTotals(stages);
  const totalTokens = sum(Object.values(totals));
  const uncertaintyMultiplier = {
    low: 0.65,
    base: 1,
    high: 1.7,
  };
  const sourceRefs = [
    'contract:opl-framework/agent-lab-contract',
    'human_doc:docs/runtime/opl-agent-lab-control-plane',
    OPENAI_PRICING_SNAPSHOT.pricing_snapshot_ref,
    ...(input.source_refs ?? []),
  ];

  return {
    surface_kind: 'opl_agent_lab_cost_estimate',
    contract_surface_kind: 'opl_agent_lab_token_cost_estimate',
    version: 'opl-agent-lab.v1.cost-estimate',
    estimate_id: stableId('oaltce', [
      presetInput.estimate_ref,
      presetInput.artifact_profile,
      stages,
      OPENAI_PRICING_SNAPSHOT,
      input.observed_usage_refs ?? [],
    ]),
    estimate_ref: presetInput.estimate_ref,
    preset_id: presetInput.preset,
    status: 'estimate_ready_calibration_required',
    refs_only: true,
    preset: presetInput.preset,
    domain_id: presetInput.domain_id,
    task_family: presetInput.task_family,
    artifact_profile: presetInput.artifact_profile,
    models: {
      text_model: 'gpt-5.5',
      reasoning_effort: 'xhigh',
      image_model: 'gpt-image-2',
    },
    pricing_snapshot: OPENAI_PRICING_SNAPSHOT,
    per_stage_estimates: stages,
    stages,
    total_estimate: {
      estimate_ref: 'cost-estimate-ref:agent-lab/rca-ppt-40/total',
      estimated_input_tokens: sum([
        totals.gpt_5_5_input_tokens,
        totals.gpt_5_5_cached_input_tokens,
        totals.gpt_image_2_text_input_tokens,
        totals.gpt_image_2_text_cached_input_tokens,
        totals.gpt_image_2_image_input_tokens,
        totals.gpt_image_2_image_cached_input_tokens,
      ]),
      estimated_output_tokens: sum([
        totals.gpt_5_5_output_tokens,
        totals.gpt_image_2_image_output_tokens,
      ]),
      estimated_total_tokens: totalTokens,
      estimated_cost_usd: totalEstimatedCostUsd,
      currency: OPENAI_PRICING_SNAPSHOT.currency,
    },
    uncertainty: {
      status: 'estimate_only',
      confidence_band: 'wide_until_provider_usage_receipts_available',
      factors: [
        'model_pricing_may_change',
        'actual_context_reuse_may_differ',
        'image_generation_size_quality_and_edit_count_may_differ',
        'RCA_revision_depth_may_differ',
      ],
    },
    totals: {
      ...totals,
      total_estimated_tokens: totalTokens,
      total_estimated_cost_usd: totalEstimatedCostUsd,
      estimated_cost_per_slide_usd:
        roundCurrency(totalEstimatedCostUsd / presetInput.artifact_profile.slide_count),
      uncertainty_range_usd: {
        low: roundCurrency(totalEstimatedCostUsd * uncertaintyMultiplier.low),
        base: totalEstimatedCostUsd,
        high: roundCurrency(totalEstimatedCostUsd * uncertaintyMultiplier.high),
      },
    },
    pricing_adjustments: {
      long_context_surcharge_policy_ref: 'pricing-policy-ref:openai/gpt-5.5/long-context-threshold-2026-05-20',
      threshold_tokens: OPENAI_PRICING_SNAPSHOT.models['gpt-5.5'].long_context_input_threshold_tokens,
      applied_stage_refs: stages
        .filter((stage) =>
          (stage.text_tokens?.input_tokens ?? 0)
          > OPENAI_PRICING_SNAPSHOT.models['gpt-5.5'].long_context_input_threshold_tokens)
        .map((stage) => stage.stage_ref),
      split_prompt_note:
        'If RCA splits a stage into requests below the threshold, actual GPT-5.5 cost can be closer to the lower range.',
    },
    calibration: {
      observed_usage_refs: input.observed_usage_refs ?? [],
      calibration_status: (input.observed_usage_refs?.length ?? 0) > 0
        ? 'observed_usage_refs_available'
        : 'estimated_from_stage_profile_without_provider_usage_receipt',
      required_runtime_receipt_refs: [
        'usage-receipt-ref:provider/openai/responses-token-usage',
        'usage-receipt-ref:provider/openai/image-token-usage',
        'artifact-ref:rca/ppt-deck-slide-count',
      ],
      variance_policy:
        'compare_estimate_to_provider_usage_after_run_without_rewriting_domain_quality_or_artifact_verdict',
    },
    source_refs: sourceRefs,
    forbidden_payloads: [
      'provider_invoice_body',
      'domain_truth',
      'visual_quality_verdict',
      'artifact_body',
      'owner_receipt_body',
      'memory_body',
    ],
    authority_boundary: {
      ...AGENT_LAB_AUTHORITY_BOUNDARY,
      cost_estimate_role: 'planning_projection_only_actual_usage_must_come_from_provider_receipts' as const,
      can_authorize_budget_spend: false,
      can_claim_actual_invoice_cost: false,
    },
  } satisfies JsonRecord;
}

export const buildAgentLabCostEstimate = buildAgentLabCostEstimateReadModel;
