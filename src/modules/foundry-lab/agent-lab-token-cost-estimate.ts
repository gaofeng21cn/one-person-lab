import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { stableId } from '../../kernel/stable-id.ts';
import { AGENT_LAB_AUTHORITY_BOUNDARY } from './agent-lab-authority.ts';

type JsonRecord = Record<string, unknown>;

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

export type AgentLabCostEstimateStageInput = {
  stage_id: string;
  stage_ref: string;
  stage_kind: string;
  owner: string;
  model_ref: string;
  reasoning_effort?: string;
  slide_count?: number;
  operation_count?: number;
  text_tokens?: TextTokenEstimate;
  image_tokens?: ImageTokenEstimate;
  assumption_refs: string[];
  calibration_refs: string[];
};

export type AgentLabCostEstimateProfile = {
  surface_kind: 'opl_agent_lab_cost_estimate_profile';
  version: 'opl-agent-lab-cost-estimate-profile.v1';
  profile_id: string;
  owner: string;
  domain_id: string;
  task_family: string;
  estimate_ref: string;
  artifact_profile: JsonRecord;
  stages: AgentLabCostEstimateStageInput[];
  calibration_policy: {
    status: 'estimate_profile_requires_provider_usage_receipts';
    required_runtime_receipt_refs: string[];
    variance_policy: string;
  };
  pricing_boundary: {
    pricing_snapshot_owned_by_profile: false;
    pricing_calculation_owned_by_profile: false;
    generic_estimator_owner: 'one-person-lab';
    profile_supplies_workload_assumptions_only: true;
  };
  authority_boundary: {
    refs_only: true;
    can_authorize_budget_spend: false;
    can_claim_actual_invoice_cost: false;
    can_claim_visual_ready: false;
    can_claim_exportable: false;
    can_write_domain_truth: false;
    can_write_artifact_body: false;
    can_write_owner_receipt: false;
  };
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

function invalidProfile(field: string, value?: unknown): never {
  throw new FrameworkContractError(
    'contract_shape_invalid',
    `Agent Lab cost estimate profile has an invalid ${field}.`,
    { field, value },
  );
}

function validateTokenRecord(value: unknown, fields: string[], field: string) {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    invalidProfile(field, value);
  }
  for (const tokenField of fields) {
    const tokenValue = value[tokenField];
    if (typeof tokenValue !== 'number' || !Number.isFinite(tokenValue) || tokenValue < 0) {
      invalidProfile(`${field}.${tokenField}`, tokenValue);
    }
  }
  return value;
}

function validateStringList(value: unknown, field: string, allowEmpty = true) {
  if (
    !Array.isArray(value)
    || (!allowEmpty && value.length === 0)
    || value.some((entry) => typeof entry !== 'string' || entry.length === 0)
  ) {
    invalidProfile(field, value);
  }
  return value as string[];
}

function normalizedOwner(value: string) {
  return value.replaceAll('_', '-').toLowerCase();
}

function validateStage(value: unknown, index: number, profileOwner: string): AgentLabCostEstimateStageInput {
  if (!isRecord(value)) {
    invalidProfile(`stages[${index}]`, value);
  }
  for (const field of ['stage_id', 'stage_ref', 'stage_kind', 'owner', 'model_ref']) {
    if (typeof value[field] !== 'string' || value[field].length === 0) {
      invalidProfile(`stages[${index}].${field}`, value[field]);
    }
  }
  for (const field of ['assumption_refs', 'calibration_refs']) {
    validateStringList(value[field], `stages[${index}].${field}`);
  }
  if (normalizedOwner(value.owner as string) !== normalizedOwner(profileOwner)) {
    invalidProfile(`stages[${index}].owner`, value.owner);
  }
  for (const field of ['slide_count', 'operation_count']) {
    const count = value[field];
    if (count !== undefined && (typeof count !== 'number' || !Number.isFinite(count) || count < 0)) {
      invalidProfile(`stages[${index}].${field}`, count);
    }
  }
  validateTokenRecord(
    value.text_tokens,
    ['input_tokens', 'cached_input_tokens', 'output_tokens'],
    `stages[${index}].text_tokens`,
  );
  validateTokenRecord(
    value.image_tokens,
    [
      'text_input_tokens',
      'text_cached_input_tokens',
      'image_input_tokens',
      'image_cached_input_tokens',
      'image_output_tokens',
    ],
    `stages[${index}].image_tokens`,
  );
  if (!value.text_tokens && !value.image_tokens) {
    invalidProfile(`stages[${index}].token_assumptions`);
  }
  return value as unknown as AgentLabCostEstimateStageInput;
}

export function validateAgentLabCostEstimateProfile(value: unknown): AgentLabCostEstimateProfile {
  if (!isRecord(value)) {
    invalidProfile('profile', value);
  }
  if (value.surface_kind !== 'opl_agent_lab_cost_estimate_profile') {
    invalidProfile('surface_kind', value.surface_kind);
  }
  if (value.version !== 'opl-agent-lab-cost-estimate-profile.v1') {
    invalidProfile('version', value.version);
  }
  const pricingBoundary = value.pricing_boundary;
  if (
    !isRecord(pricingBoundary)
    || pricingBoundary.pricing_snapshot_owned_by_profile !== false
    || pricingBoundary.pricing_calculation_owned_by_profile !== false
    || pricingBoundary['generic_estimator_owner'] !== 'one-person-lab'
    || pricingBoundary.profile_supplies_workload_assumptions_only !== true
  ) {
    invalidProfile(
      isRecord(pricingBoundary) && pricingBoundary.generic_estimator_owner !== 'one-person-lab'
        ? 'pricing_boundary.generic_estimator_owner'
        : 'pricing_boundary',
      pricingBoundary,
    );
  }
  const stages = value.stages;
  if (!Array.isArray(stages) || stages.length === 0) {
    invalidProfile('stages', stages);
  }
  for (const field of ['profile_id', 'owner', 'domain_id', 'task_family', 'estimate_ref']) {
    if (typeof value[field] !== 'string' || value[field].length === 0) {
      invalidProfile(field, value[field]);
    }
  }
  if (!isRecord(value.artifact_profile)) {
    invalidProfile('artifact_profile', value.artifact_profile);
  }
  const calibrationPolicy = value.calibration_policy;
  if (
    !isRecord(calibrationPolicy)
    || calibrationPolicy.status !== 'estimate_profile_requires_provider_usage_receipts'
    || typeof calibrationPolicy.variance_policy !== 'string'
    || calibrationPolicy.variance_policy.length === 0
  ) {
    invalidProfile('calibration_policy', calibrationPolicy);
  }
  validateStringList(
    calibrationPolicy.required_runtime_receipt_refs,
    'calibration_policy.required_runtime_receipt_refs',
    false,
  );
  const authorityBoundary = value.authority_boundary;
  if (
    !isRecord(authorityBoundary)
    || authorityBoundary.refs_only !== true
    || authorityBoundary.can_authorize_budget_spend !== false
    || authorityBoundary.can_claim_actual_invoice_cost !== false
    || authorityBoundary.can_claim_visual_ready !== false
    || authorityBoundary.can_claim_exportable !== false
    || authorityBoundary.can_write_domain_truth !== false
    || authorityBoundary.can_write_artifact_body !== false
    || authorityBoundary.can_write_owner_receipt !== false
  ) {
    invalidProfile('authority_boundary', authorityBoundary);
  }
  return {
    ...value,
    stages: stages.map((stage, index) => validateStage(stage, index, value.owner as string)),
  } as unknown as AgentLabCostEstimateProfile;
}

function roundCurrency(value: number) {
  return Math.round(value * 1000) / 1000;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function modelId(modelRef: string) {
  return modelRef.startsWith('openai:') ? modelRef.slice('openai:'.length) : modelRef;
}

function textCost(stage: AgentLabCostEstimateStageInput) {
  if (!stage.text_tokens) {
    return null;
  }
  const id = modelId(stage.model_ref);
  if (id !== 'gpt-5.5') {
    invalidProfile('text_tokens.model_ref', stage.model_ref);
  }
  const prices = OPENAI_PRICING_SNAPSHOT.models[id];
  const multiplier = stage.text_tokens.input_tokens > prices.long_context_input_threshold_tokens
    ? { input: prices.long_context_input_multiplier, output: prices.long_context_output_multiplier }
    : { input: 1, output: 1 };
  return {
    input_usd: stage.text_tokens.input_tokens * prices.input_usd_per_1m_tokens * multiplier.input / USD_PER_MILLION,
    cached_input_usd:
      stage.text_tokens.cached_input_tokens * prices.cached_input_usd_per_1m_tokens * multiplier.input / USD_PER_MILLION,
    output_usd: stage.text_tokens.output_tokens * prices.output_usd_per_1m_tokens * multiplier.output / USD_PER_MILLION,
  };
}

function imageCost(stage: AgentLabCostEstimateStageInput) {
  if (!stage.image_tokens) {
    return null;
  }
  const id = modelId(stage.model_ref);
  if (id !== 'gpt-image-2') {
    invalidProfile('image_tokens.model_ref', stage.model_ref);
  }
  const prices = OPENAI_PRICING_SNAPSHOT.models[id];
  return {
    text_input_usd: stage.image_tokens.text_input_tokens * prices.text_input_usd_per_1m_tokens / USD_PER_MILLION,
    text_cached_input_usd:
      stage.image_tokens.text_cached_input_tokens * prices.text_cached_input_usd_per_1m_tokens / USD_PER_MILLION,
    image_input_usd: stage.image_tokens.image_input_tokens * prices.image_input_usd_per_1m_tokens / USD_PER_MILLION,
    image_cached_input_usd:
      stage.image_tokens.image_cached_input_tokens * prices.image_cached_input_usd_per_1m_tokens / USD_PER_MILLION,
    image_output_usd: stage.image_tokens.image_output_tokens * prices.image_output_usd_per_1m_tokens / USD_PER_MILLION,
  };
}

function stageEstimate(stage: AgentLabCostEstimateStageInput) {
  const textBreakdown = textCost(stage);
  const imageBreakdown = imageCost(stage);
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
  const estimatedCostUsd = roundCurrency(sum([
    ...Object.values(textBreakdown ?? {}),
    ...Object.values(imageBreakdown ?? {}),
  ]));
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
    cost_breakdown_usd: {
      ...(textBreakdown ?? {}),
      ...(imageBreakdown ?? {}),
    },
  };
}

export function buildAgentLabCostEstimate(input: {
  profile: unknown;
  profile_ref?: string;
  source_refs?: string[];
  observed_usage_refs?: string[];
}) {
  const profile = validateAgentLabCostEstimateProfile(input.profile);
  const stages = profile.stages.map(stageEstimate);
  const estimatedInputTokens = sum(stages.map((stage) => stage.token_estimate.estimated_input_tokens));
  const estimatedOutputTokens = sum(stages.map((stage) => stage.token_estimate.estimated_output_tokens));
  const estimatedCostUsd = roundCurrency(sum(
    stages.map((stage) => stage.cost_estimate.estimated_cost_usd),
  ));
  const unitCount = typeof profile.artifact_profile.slide_count === 'number'
    ? profile.artifact_profile.slide_count
    : null;
  const sourceRefs = [
    'contract:opl-framework/agent-lab-contract',
    OPENAI_PRICING_SNAPSHOT.pricing_snapshot_ref,
    ...(input.profile_ref ? [input.profile_ref] : []),
    ...(input.source_refs ?? []),
  ];

  return {
    surface_kind: 'opl_agent_lab_cost_estimate',
    contract_surface_kind: 'opl_agent_lab_token_cost_estimate',
    version: 'opl-agent-lab.v1.cost-estimate',
    estimate_id: stableId('oaltce', [
      profile,
      stages,
      OPENAI_PRICING_SNAPSHOT,
      input.observed_usage_refs ?? [],
    ]),
    estimate_ref: profile.estimate_ref,
    profile_id: profile.profile_id,
    profile_owner: profile.owner,
    profile_ref: input.profile_ref ?? null,
    status: 'estimate_resolved_calibration_required',
    refs_only: true,
    domain_id: profile.domain_id,
    task_family: profile.task_family,
    artifact_profile: profile.artifact_profile,
    model_refs: [...new Set(profile.stages.map((stage) => stage.model_ref))],
    pricing_snapshot: OPENAI_PRICING_SNAPSHOT,
    per_stage_estimates: stages,
    total_estimate: {
      estimate_ref: `${profile.estimate_ref}/total`,
      estimated_input_tokens: estimatedInputTokens,
      estimated_output_tokens: estimatedOutputTokens,
      estimated_total_tokens: estimatedInputTokens + estimatedOutputTokens,
      estimated_cost_usd: estimatedCostUsd,
      currency: OPENAI_PRICING_SNAPSHOT.currency,
      declared_unit_count: unitCount,
      estimated_cost_per_declared_unit_usd:
        unitCount && unitCount > 0 ? roundCurrency(estimatedCostUsd / unitCount) : null,
      uncertainty_range_usd: {
        low: roundCurrency(estimatedCostUsd * 0.65),
        base: estimatedCostUsd,
        high: roundCurrency(estimatedCostUsd * 1.7),
      },
    },
    uncertainty: {
      status: 'estimate_only',
      confidence_band: 'wide_until_provider_usage_receipts_available',
      factors: [
        'model_pricing_may_change',
        'actual_context_reuse_may_differ',
        'image_generation_size_quality_and_edit_count_may_differ',
        'domain_revision_depth_may_differ',
      ],
    },
    calibration: {
      calibration_status: input.observed_usage_refs?.length
        ? 'observed_usage_refs_attached_review_required'
        : 'provider_usage_receipts_required',
      observed_usage_refs: input.observed_usage_refs ?? [],
      required_runtime_receipt_refs: profile.calibration_policy.required_runtime_receipt_refs,
      variance_policy: profile.calibration_policy.variance_policy,
      actual_cost_authority: 'provider_usage_receipt_or_billing_dashboard_only',
    },
    source_refs: [...new Set(sourceRefs)],
    forbidden_inputs: [
      'provider_billing_ledger_body',
      'invoice_body',
      'payment_account_body',
      'domain_artifact_body',
      'domain_quality_verdict',
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
