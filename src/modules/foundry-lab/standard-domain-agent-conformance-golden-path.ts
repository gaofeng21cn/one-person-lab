import { STANDARD_FOUNDRY_AGENT_GOLDEN_PATH_POLICY } from './standard-domain-agent-scaffold-constants.ts';
import {
  buildStandardAgentRepoContractReadout,
  STANDARD_AGENT_STAGE_MANIFEST_REF,
  type StandardAgentRepoContractReadout,
} from '../pack/index.ts';
import {
  isRecord,
  optionalString,
  recordList,
  type JsonRecord,
} from './standard-domain-agent-conformance-utils.ts';
import { readStandardAgentConformanceProfile } from './standard-agent-conformance-profile.ts';

function explicitLaneKindForStage(stage: JsonRecord) {
  const selectedExecutor = isRecord(stage.selected_executor) ? stage.selected_executor : {};
  return [
    optionalString(stage.stage_kind),
    optionalString(stage.lane_kind),
    optionalString(selectedExecutor.lane_kind),
  ].find((kind) => kind
    && STANDARD_FOUNDRY_AGENT_GOLDEN_PATH_POLICY.explicit_lane_kinds.includes(
      kind as typeof STANDARD_FOUNDRY_AGENT_GOLDEN_PATH_POLICY.explicit_lane_kinds[number],
    )) ?? null;
}

function textFrom(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(textFrom).join(' ');
  if (isRecord(value)) return Object.values(value).map(textFrom).join(' ');
  return '';
}

function inferredVariantLaneKind(stage: JsonRecord) {
  const selectedExecutor = isRecord(stage.selected_executor) ? stage.selected_executor : {};
  const explicit = [
    optionalString(stage.stage_kind),
    optionalString(stage.lane_kind),
    optionalString(selectedExecutor.lane_kind),
    optionalString(stage.route_classification),
  ].map((value) => value?.toLowerCase().replace(/-/g, '_') ?? null)
    .find((value) => value && ['long_soak', 'proof', 'diagnostic', 'cleanup', 'variant'].includes(value));
  if (explicit) return explicit;
  const searchable = [stage.stage_id, stage.title, stage.summary]
    .map(optionalString)
    .filter((value): value is string => Boolean(value))
    .join(' ')
    .toLowerCase()
    .replace(/-/g, '_');
  return ['long_soak', 'proof', 'diagnostic', 'cleanup', 'variant']
    .find((kind) => new RegExp(`(^|[^a-z0-9])${kind}([^a-z0-9]|$)`).test(searchable)) ?? null;
}

function explicitRouteDefaultClaimForStage(stage: JsonRecord) {
  const selectedExecutor = isRecord(stage.selected_executor) ? stage.selected_executor : {};
  return stage.route_default === true
    || stage.default_route === true
    || selectedExecutor.route_default === true
    || ['ordinary_default', 'default_route', 'ordinary_default_route']
      .includes(optionalString(stage.route_classification) ?? '')
    || optionalString(stage.path_role) === 'ordinary_default';
}

function buildDomainDeclaredAlignment(
  repoDir: string,
  routeStages: Array<{
    stage_id: string;
    default_route: boolean;
    raw_stage: JsonRecord;
  }>,
) {
  const profileReadout = readStandardAgentConformanceProfile(repoDir);
  const policy = profileReadout.profile?.golden_path ?? null;
  const stageIds = routeStages.map((stage) => stage.stage_id);
  const forbiddenOwnerClaims = policy
    ? routeStages.flatMap((stage) => {
        const text = textFrom(stage.raw_stage).toLowerCase();
        return policy.forbidden_owner_tokens
          .filter((token) => text.includes(token.toLowerCase()))
          .map((token) => `golden_path_forbidden_owner_claim:${stage.stage_id}:${token}`);
      })
    : [];
  const blockers = [
    ...profileReadout.blockers,
    ...(policy?.required_stage_ids ?? [])
      .filter((stageId) => !stageIds.includes(stageId))
      .map((stageId) => `golden_path_required_stage_missing:${stageId}`),
    ...stageIds
      .filter((stageId) => policy && !policy.allowed_stage_ids.includes(stageId))
      .map((stageId) => `golden_path_unexpected_stage:${stageId}`),
    policy && routeStages.some((stage) => stage.default_route && stage.stage_id === policy.default_stage_id)
      ? null
      : policy ? `golden_path_default_stage_mismatch:${policy.default_stage_id}` : null,
    ...forbiddenOwnerClaims,
  ].filter((entry): entry is string => Boolean(entry));
  return {
    surface_kind: 'opl_domain_declared_golden_path_alignment',
    status: blockers.length === 0 ? 'passed' : 'blocked',
    profile_source: profileReadout.source_ref,
    profile_id: profileReadout.profile?.profile_id ?? null,
    required_stage_ids: policy?.required_stage_ids ?? [],
    allowed_stage_ids: policy?.allowed_stage_ids ?? [],
    default_stage_id: policy?.default_stage_id ?? null,
    forbidden_owner_claims: forbiddenOwnerClaims,
    blockers,
  };
}

export function buildGoldenPathDefaultSurfaceBudgetChecks(
  repoDir: string,
  providedReadout?: StandardAgentRepoContractReadout,
) {
  const repoContractReadout = providedReadout ?? buildStandardAgentRepoContractReadout(repoDir);
  const stageControlPlane = repoContractReadout.stage_control_plane;
  const routeStages = recordList(stageControlPlane?.stages).map((stage, index) => {
    const selectedExecutor = isRecord(stage.selected_executor) ? stage.selected_executor : {};
    const explicitLaneKind = explicitLaneKindForStage(stage);
    return {
      stage_id: optionalString(stage.stage_id) ?? `stage_${index}`,
      stage_kind: optionalString(stage.stage_kind),
      selected_executor_kind: optionalString(selectedExecutor.executor_kind),
      executor_binding_ref: optionalString(selectedExecutor.executor_binding_ref),
      executor_default_binding: selectedExecutor.default_executor === true,
      default_route: selectedExecutor.default_executor === true && !explicitLaneKind,
      route_default_claim: explicitRouteDefaultClaimForStage(stage),
      explicit_lane_kind: explicitLaneKind,
      inferred_variant_lane_kind: inferredVariantLaneKind(stage),
      route_classification: explicitLaneKind ? 'explicit_non_default_lane' : 'ordinary_candidate',
      raw_stage: stage,
    };
  });
  const defaultRouteStageIds = routeStages.filter((stage) => stage.default_route).map((stage) => stage.stage_id);
  const explicitNonDefaultLaneStageIds = routeStages
    .filter((stage) => stage.explicit_lane_kind && !stage.default_route)
    .map((stage) => stage.stage_id);
  const domainAlignment = buildDomainDeclaredAlignment(repoDir, routeStages);
  const blockers = [
    repoContractReadout.status === 'resolved'
      ? null
      : `golden_path_stage_manifest_${repoContractReadout.status}`,
    ...repoContractReadout.blockers,
    stageControlPlane ? null : 'golden_path_stage_control_plane_not_declared',
    defaultRouteStageIds.length === STANDARD_FOUNDRY_AGENT_GOLDEN_PATH_POLICY.ordinary_default_route_budget
      ? null
      : `golden_path_single_default_violation:default_route_count=${defaultRouteStageIds.length}`,
    ...routeStages
      .filter((stage) => stage.explicit_lane_kind && stage.route_default_claim)
      .map((stage) => `golden_path_explicit_lane_declares_default:${stage.stage_id}:${stage.explicit_lane_kind}`),
    ...routeStages
      .filter((stage) => stage.inferred_variant_lane_kind && !stage.explicit_lane_kind)
      .map((stage) => `golden_path_variant_lane_not_explicit:${stage.stage_id}:${stage.inferred_variant_lane_kind}`),
    ...domainAlignment.blockers,
  ].filter((entry): entry is string => Boolean(entry));
  return {
    status: blockers.length === 0 ? 'passed' : 'blocked',
    policy_id: STANDARD_FOUNDRY_AGENT_GOLDEN_PATH_POLICY.policy_id,
    default_surface_budget_id: STANDARD_FOUNDRY_AGENT_GOLDEN_PATH_POLICY.default_surface_budget_id,
    policy_source: STANDARD_AGENT_STAGE_MANIFEST_REF,
    ordinary_default_route_budget: STANDARD_FOUNDRY_AGENT_GOLDEN_PATH_POLICY.ordinary_default_route_budget,
    default_route_count: defaultRouteStageIds.length,
    default_route_stage_ids: defaultRouteStageIds,
    explicit_non_default_lane_stage_ids: explicitNonDefaultLaneStageIds,
    route_stages: routeStages.map(({ raw_stage, ...stage }) => stage),
    golden_path_profile: domainAlignment,
    mvp_cognitive_kernel_alignment: domainAlignment,
    blockers,
    authority_boundary: STANDARD_FOUNDRY_AGENT_GOLDEN_PATH_POLICY.authority_boundary,
  };
}
