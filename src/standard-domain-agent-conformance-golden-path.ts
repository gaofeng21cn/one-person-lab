import { STANDARD_FOUNDRY_AGENT_GOLDEN_PATH_POLICY } from './standard-domain-agent-scaffold-constants.ts';
import {
  isRecord,
  optionalString,
  readJsonFile,
  recordList,
  type JsonRecord,
} from './standard-domain-agent-conformance-utils.ts';

const RCA_VISUAL_GOLDEN_PATH_STAGES = [
  'source_intake',
  'communication_strategy',
  'visual_direction',
  'artifact_creation',
  'review_and_revision',
  'package_and_handoff',
] as const;

const RCA_ROUTE_VARIANT_HINTS = [
  'render',
  'screenshot',
  'native_pptx',
  'native-pptx',
  'pptx',
  'export',
] as const;

const OMA_ALLOWED_BOUNDARY_STAGES = [
  'intent-intake',
  'web-experience-research',
  'stage-decomposition',
  'agent-skeleton-build',
  'eval-suite-build',
  'baseline-run',
  'target-agent-takeover',
  'optimizer-iteration',
  'baseline-delivery',
  'trajectory-learning-intake',
  'online-learning',
] as const;

const OMA_FORBIDDEN_OWNER_TOKENS = [
  'framework_owner',
  'opl_framework_owner',
  'runtime_owner',
  'generic_runtime_owner',
  'receipt_signer',
  'owner_receipt_signer',
  'target_receipt_signer',
] as const;

function explicitLaneKindForStage(stage: JsonRecord) {
  const selectedExecutor = isRecord(stage.selected_executor) ? stage.selected_executor : {};
  return [
    optionalString(stage.stage_kind),
    optionalString(stage.lane_kind),
    optionalString(selectedExecutor.lane_kind),
  ].find((kind) =>
    kind && STANDARD_FOUNDRY_AGENT_GOLDEN_PATH_POLICY.explicit_lane_kinds.includes(
      kind as typeof STANDARD_FOUNDRY_AGENT_GOLDEN_PATH_POLICY.explicit_lane_kinds[number],
    )
  ) ?? null;
}

function textFrom(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(textFrom).join(' ');
  }
  if (isRecord(value)) {
    return Object.values(value).map(textFrom).join(' ');
  }
  return '';
}

function stageText(stage: JsonRecord) {
  return textFrom(stage).toLowerCase();
}

function normalizeLaneKind(value: string | null) {
  if (!value) {
    return null;
  }
  const normalized = value.toLowerCase().replace(/-/g, '_');
  if (normalized === 'long_soak') {
    return 'long_soak';
  }
  if (
    normalized === 'proof'
    || normalized === 'diagnostic'
    || normalized === 'cleanup'
    || normalized === 'variant'
    || normalized === 'variants'
  ) {
    return normalized === 'variants' ? 'variant' : normalized;
  }
  return null;
}

function inferredVariantLaneKind(stage: JsonRecord) {
  const selectedExecutor = isRecord(stage.selected_executor) ? stage.selected_executor : {};
  const explicitFields = [
    optionalString(stage.stage_kind),
    optionalString(stage.lane_kind),
    optionalString(selectedExecutor.lane_kind),
    optionalString(stage.route_classification),
  ];
  const explicitKind = explicitFields
    .map(normalizeLaneKind)
    .find((kind) => kind);
  if (explicitKind) {
    return explicitKind;
  }
  const searchable = [
    optionalString(stage.stage_id),
    optionalString(stage.title),
    optionalString(stage.summary),
  ].filter((entry): entry is string => Boolean(entry)).join(' ').toLowerCase();
  const tokenized = searchable.replace(/-/g, '_');
  if (/(^|[^a-z0-9])long_soak([^a-z0-9]|$)/.test(tokenized)) {
    return 'long_soak';
  }
  for (const kind of ['proof', 'diagnostic', 'cleanup', 'variant'] as const) {
    if (new RegExp(`(^|[^a-z0-9])${kind}([^a-z0-9]|$)`).test(tokenized)) {
      return kind;
    }
  }
  return null;
}

function explicitRouteDefaultClaimForStage(stage: JsonRecord) {
  const selectedExecutor = isRecord(stage.selected_executor) ? stage.selected_executor : {};
  const routeClassification = optionalString(stage.route_classification);
  const pathRole = optionalString(stage.path_role);
  const explicitRouteDefault = [
    optionalString(stage.route_default),
    optionalString(stage.default_route),
    optionalString(selectedExecutor.route_default),
  ];
  return (
    stage.route_default === true
    || stage.default_route === true
    || selectedExecutor.route_default === true
    || routeClassification === 'ordinary_default'
    || routeClassification === 'default_route'
    || routeClassification === 'ordinary_default_route'
    || pathRole === 'ordinary_default'
    || explicitRouteDefault.some((entry) => entry === 'ordinary_default' || entry === 'default_route')
  );
}

function rcaAlignment(routeStages: Array<{
  stage_id: string;
  stage_kind: string | null;
  default_route: boolean;
  explicit_lane_kind: string | null;
  route_classification: string;
}>) {
  const stageIds = routeStages.map((stage) => stage.stage_id);
  const blockers = [
    ...RCA_VISUAL_GOLDEN_PATH_STAGES
      .filter((stageId) => !stageIds.includes(stageId))
      .map((stageId) => `rca_visual_golden_path_stage_missing:${stageId}`),
    routeStages.some((stage) => stage.default_route && stage.stage_id === 'source_intake')
      ? null
      : 'rca_visual_golden_path_default_must_start_at_source_intake',
  ].filter((entry): entry is string => Boolean(entry));
  return {
    agent_alignment: 'rca_visual_golden_path',
    ordinary_golden_path_stage_ids: RCA_VISUAL_GOLDEN_PATH_STAGES.filter((stageId) =>
      stageIds.includes(stageId)
    ),
    visual_golden_path_default_stage_id: routeStages.find((stage) => stage.default_route)?.stage_id ?? null,
    route_variant_lane_policy: 'render_screenshot_native_pptx_and_export_helpers_are_affordances_or_explicit_lanes',
    explicit_route_variant_stage_ids: routeStages
      .filter((stage) => stage.explicit_lane_kind)
      .map((stage) => stage.stage_id),
    blockers,
  };
}

function omaAlignment(routeStages: Array<{
  stage_id: string;
  default_route: boolean;
  explicit_lane_kind: string | null;
  raw_stage: JsonRecord;
}>) {
  const stageIds = routeStages.map((stage) => stage.stage_id);
  const unexpectedStages = stageIds.filter((stageId) =>
    !OMA_ALLOWED_BOUNDARY_STAGES.includes(stageId as typeof OMA_ALLOWED_BOUNDARY_STAGES[number])
  );
  const forbiddenOwnerClaims = routeStages.flatMap((stage) => {
    const text = stageText(stage.raw_stage);
    return OMA_FORBIDDEN_OWNER_TOKENS
      .filter((token) => text.includes(token))
      .map((token) => `oma_forbidden_framework_or_receipt_owner_claim:${stage.stage_id}:${token}`);
  });
  const blockers = [
    stageIds.includes('intent-intake') ? null : 'oma_boundary_stage_missing:intent-intake',
    stageIds.includes('stage-decomposition') ? null : 'oma_boundary_stage_missing:stage-decomposition',
    routeStages.some((stage) => stage.default_route && stage.stage_id === 'intent-intake')
      ? null
      : 'oma_boundary_default_must_start_at_intent_intake',
    ...unexpectedStages.map((stageId) => `oma_boundary_unexpected_stage:${stageId}`),
    ...forbiddenOwnerClaims,
  ].filter((entry): entry is string => Boolean(entry));
  return {
    agent_alignment: 'oma_work_order_proposal_materializer_boundary',
    allowed_boundary_stage_ids: OMA_ALLOWED_BOUNDARY_STAGES.filter((stageId) =>
      stageIds.includes(stageId)
    ),
    default_stage_id: routeStages.find((stage) => stage.default_route)?.stage_id ?? null,
    target_owner_receipt_policy: 'target_owner_receipts_or_typed_blockers_only_no_oma_receipt_signing',
    materializer_policy: 'work_order_proposal_and_candidate_materializer_only_not_second_opl_framework',
    forbidden_owner_claims: forbiddenOwnerClaims,
    blockers,
  };
}

function buildMvpCognitiveKernelAlignment(domainId: string | null, routeStages: Array<{
  stage_id: string;
  stage_kind: string | null;
  default_route: boolean;
  explicit_lane_kind: string | null;
  route_classification: string;
  raw_stage: JsonRecord;
}>) {
  const rawText = routeStages.map((stage) => stageText(stage.raw_stage)).join(' ');
  const routeVariantAffordanceHints = RCA_ROUTE_VARIANT_HINTS.filter((hint) => rawText.includes(hint));
  const domainAlignment = domainId === 'redcube-ai' || domainId === 'redcube_ai'
    ? rcaAlignment(routeStages)
    : domainId === 'opl-meta-agent'
      ? omaAlignment(routeStages)
      : {
        agent_alignment: 'standard_foundry_agent',
        blockers: [],
      };
  const alignmentBlockers = Array.isArray(domainAlignment.blockers)
    ? domainAlignment.blockers
    : [];
  return {
    surface_kind: 'opl_foundry_agent_mvp_cognitive_kernel_alignment',
    owner: 'one-person-lab',
    status: alignmentBlockers.length === 0 ? 'passed' : 'blocked',
    cognitive_kernel_policy: {
      stage_internal_strategy_owner: 'selected_executor',
      tool_affordances_are_catalog_not_workflow_script: true,
      route_variants_do_not_become_default_golden_path: true,
      app_read_model_root: 'current_owner_delta',
    },
    route_variant_affordance_hints: routeVariantAffordanceHints,
    ...domainAlignment,
  };
}

function buildGoldenPathProfileChecks(repoDir: string, defaultRouteStageIds: string[]) {
  const profileFile = readJsonFile(repoDir, 'contracts/golden_path_profile.json');
  if (profileFile.status === 'missing') {
    return {
      status: 'not_declared',
      profile_source: 'contracts/golden_path_profile.json',
      ordinary_stage_refs: [],
      explicit_variant_count: 0,
      blockers: [],
    };
  }
  const profile = isRecord(profileFile.payload) ? profileFile.payload : null;
  const ordinaryPath = isRecord(profile?.ordinary_path) ? profile.ordinary_path : {};
  const defaultSurfacePolicy = isRecord(profile?.default_surface_policy)
    ? profile.default_surface_policy
    : {};
  const authority = isRecord(profile?.authority_boundary) ? profile.authority_boundary : {};
  const ordinaryStageRefs = Array.isArray(ordinaryPath.stage_refs)
    ? ordinaryPath.stage_refs.filter((entry): entry is string => typeof entry === 'string')
    : [];
  const explicitVariants = Array.isArray(profile?.explicit_variants)
    ? profile.explicit_variants.filter(isRecord)
    : [];
  const variantDefaultBlockers = explicitVariants.flatMap((variant, index) => {
    const variantId = optionalString(variant.variant_id) ?? optionalString(variant.path_id) ?? `variant_${index}`;
    return variant.default === true || variant.default_route === true || variant.path_role === 'ordinary_default'
      ? [`golden_path_profile_variant_declares_default:${variantId}`]
      : [];
  });
  const blockers = [
    profileFile.status === 'resolved' ? null : `golden_path_profile_${profileFile.status}`,
    profile ? null : 'golden_path_profile_not_declared',
    optionalString(profile?.surface_kind) === 'opl_golden_path_profile'
      ? null
      : 'golden_path_profile_surface_kind_invalid',
    optionalString(profile?.schema_version) === 'golden-path-profile.v1'
      ? null
      : 'golden_path_profile_schema_version_invalid',
    optionalString(ordinaryPath.path_role) === 'ordinary_default'
      ? null
      : 'golden_path_profile_ordinary_path_role_invalid',
    ordinaryStageRefs.length > 0 ? null : 'golden_path_profile_ordinary_path_stage_refs_missing',
    ordinaryStageRefs.join(',') === defaultRouteStageIds.join(',')
      ? null
      : `golden_path_profile_ordinary_path_mismatch:profile=${ordinaryStageRefs.join(',') || 'none'}:stage_control_plane=${defaultRouteStageIds.join(',') || 'none'}`,
    defaultSurfacePolicy.ordinary_route_count === 1
      ? null
      : 'golden_path_profile_ordinary_route_count_must_be_one',
    defaultSurfacePolicy.variants_hidden_by_default === true
      ? null
      : 'golden_path_profile_variants_hidden_by_default_missing',
    defaultSurfacePolicy.raw_evidence_hidden_by_default === true
      ? null
      : 'golden_path_profile_raw_evidence_hidden_by_default_missing',
    authority.ordinary_path_count_must_be_one === true
      ? null
      : 'golden_path_profile_single_default_authority_missing',
    authority.variant_can_be_default_without_explicit_selection === false
      ? null
      : 'golden_path_profile_variant_default_authority_must_be_false',
    authority.opl_can_write_domain_truth === false
      ? null
      : 'golden_path_profile_opl_can_write_domain_truth_must_be_false',
    authority.opl_can_authorize_domain_ready === false
      ? null
      : 'golden_path_profile_opl_can_authorize_domain_ready_must_be_false',
    authority.opl_can_authorize_quality_verdict === false
      ? null
      : 'golden_path_profile_opl_can_authorize_quality_verdict_must_be_false',
    authority.opl_can_mutate_artifact_body === false
      ? null
      : 'golden_path_profile_opl_can_mutate_artifact_body_must_be_false',
    ...variantDefaultBlockers,
  ].filter((entry): entry is string => Boolean(entry));
  return {
    status: blockers.length === 0 ? 'passed' : 'blocked',
    profile_source: 'contracts/golden_path_profile.json',
    profile_id: optionalString(profile?.profile_id),
    ordinary_path_id: optionalString(ordinaryPath.path_id),
    ordinary_stage_refs: ordinaryStageRefs,
    explicit_variant_count: explicitVariants.length,
    blockers,
    authority_boundary: {
      ordinary_path_count_must_be_one: authority.ordinary_path_count_must_be_one ?? null,
      variant_can_be_default_without_explicit_selection:
        authority.variant_can_be_default_without_explicit_selection ?? null,
      opl_can_write_domain_truth: authority.opl_can_write_domain_truth ?? null,
      opl_can_authorize_domain_ready: authority.opl_can_authorize_domain_ready ?? null,
      opl_can_authorize_quality_verdict: authority.opl_can_authorize_quality_verdict ?? null,
      opl_can_mutate_artifact_body: authority.opl_can_mutate_artifact_body ?? null,
    },
  };
}

export function buildGoldenPathDefaultSurfaceBudgetChecks(repoDir: string) {
  const stageControlPlaneFile = readJsonFile(
    repoDir,
    STANDARD_FOUNDRY_AGENT_GOLDEN_PATH_POLICY.stage_control_plane_ref,
  );
  const stageControlPlane = isRecord(stageControlPlaneFile.payload)
    ? stageControlPlaneFile.payload
    : null;
  const stages = recordList(stageControlPlane?.stages);
  const routeStages = stages.map((stage, index) => {
    const selectedExecutor = isRecord(stage.selected_executor) ? stage.selected_executor : {};
    const stageId = optionalString(stage.stage_id) ?? `stage_${index}`;
    const explicitLaneKind = explicitLaneKindForStage(stage);
    const inferredLaneKind = inferredVariantLaneKind(stage);
    const routeDefaultClaim = explicitRouteDefaultClaimForStage(stage);
    const defaultRoute = selectedExecutor.default_executor === true && !explicitLaneKind;
    return {
      stage_id: stageId,
      stage_kind: optionalString(stage.stage_kind),
      selected_executor_kind: optionalString(selectedExecutor.executor_kind),
      executor_binding_ref: optionalString(selectedExecutor.executor_binding_ref),
      executor_default_binding: selectedExecutor.default_executor === true,
      default_route: defaultRoute,
      route_default_claim: routeDefaultClaim,
      explicit_lane_kind: explicitLaneKind,
      inferred_variant_lane_kind: inferredLaneKind,
      route_classification: explicitLaneKind ? 'explicit_non_default_lane' : 'ordinary_candidate',
      raw_stage: stage,
    };
  });
  const defaultRouteStageIds = routeStages
    .filter((stage) => stage.default_route)
    .map((stage) => stage.stage_id);
  const explicitNonDefaultLaneStageIds = routeStages
    .filter((stage) => stage.explicit_lane_kind && !stage.default_route)
    .map((stage) => stage.stage_id);
  const explicitDefaultLaneBlockers = routeStages
    .filter((stage) => stage.explicit_lane_kind && stage.route_default_claim)
    .map((stage) =>
      `golden_path_explicit_lane_declares_default:${stage.stage_id}:${stage.explicit_lane_kind}`
    );
  const implicitVariantLaneBlockers = routeStages
    .filter((stage) => stage.inferred_variant_lane_kind && !stage.explicit_lane_kind)
    .map((stage) =>
      `golden_path_variant_lane_not_explicit:${stage.stage_id}:${stage.inferred_variant_lane_kind}`
    );
  const blockers = [
    stageControlPlaneFile.status === 'resolved'
      ? null
      : `golden_path_stage_control_plane_${stageControlPlaneFile.status}`,
    stageControlPlane ? null : 'golden_path_stage_control_plane_not_declared',
    defaultRouteStageIds.length === STANDARD_FOUNDRY_AGENT_GOLDEN_PATH_POLICY.ordinary_default_route_budget
      ? null
      : `golden_path_single_default_violation:default_route_count=${defaultRouteStageIds.length}`,
    ...explicitDefaultLaneBlockers,
    ...implicitVariantLaneBlockers,
  ].filter((entry): entry is string => Boolean(entry));
  const domainId = optionalString(stageControlPlane?.target_domain_id);
  const mvpCognitiveKernelAlignment = buildMvpCognitiveKernelAlignment(domainId, routeStages);
  const goldenPathProfile = buildGoldenPathProfileChecks(repoDir, defaultRouteStageIds);
  const allBlockers = [
    ...blockers,
    ...mvpCognitiveKernelAlignment.blockers,
    ...goldenPathProfile.blockers,
  ];

  return {
    status: allBlockers.length === 0 ? 'passed' : 'blocked',
    policy_id: STANDARD_FOUNDRY_AGENT_GOLDEN_PATH_POLICY.policy_id,
    default_surface_budget_id: STANDARD_FOUNDRY_AGENT_GOLDEN_PATH_POLICY.default_surface_budget_id,
    policy_source: STANDARD_FOUNDRY_AGENT_GOLDEN_PATH_POLICY.stage_control_plane_ref,
    ordinary_default_route_budget: STANDARD_FOUNDRY_AGENT_GOLDEN_PATH_POLICY.ordinary_default_route_budget,
    default_route_count: defaultRouteStageIds.length,
    default_route_stage_ids: defaultRouteStageIds,
    explicit_non_default_lane_stage_ids: explicitNonDefaultLaneStageIds,
    route_stages: routeStages.map(({ raw_stage, ...stage }) => stage),
    golden_path_profile: goldenPathProfile,
    mvp_cognitive_kernel_alignment: mvpCognitiveKernelAlignment,
    blockers: allBlockers,
    authority_boundary: STANDARD_FOUNDRY_AGENT_GOLDEN_PATH_POLICY.authority_boundary,
  };
}
