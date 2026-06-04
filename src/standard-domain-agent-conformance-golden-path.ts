import { STANDARD_FOUNDRY_AGENT_GOLDEN_PATH_POLICY } from './standard-domain-agent-scaffold-constants.ts';
import {
  isRecord,
  optionalString,
  readJsonFile,
  recordList,
  type JsonRecord,
} from './standard-domain-agent-conformance-utils.ts';

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
    return {
      stage_id: stageId,
      stage_kind: optionalString(stage.stage_kind),
      selected_executor_kind: optionalString(selectedExecutor.executor_kind),
      executor_binding_ref: optionalString(selectedExecutor.executor_binding_ref),
      default_route: selectedExecutor.default_executor === true,
      explicit_lane_kind: explicitLaneKind,
      route_classification: explicitLaneKind ? 'explicit_non_default_lane' : 'ordinary_candidate',
    };
  });
  const defaultRouteStageIds = routeStages
    .filter((stage) => stage.default_route)
    .map((stage) => stage.stage_id);
  const explicitNonDefaultLaneStageIds = routeStages
    .filter((stage) => stage.explicit_lane_kind && !stage.default_route)
    .map((stage) => stage.stage_id);
  const explicitDefaultLaneBlockers = routeStages
    .filter((stage) => stage.explicit_lane_kind && stage.default_route)
    .map((stage) =>
      `golden_path_explicit_lane_declares_default:${stage.stage_id}:${stage.explicit_lane_kind}`
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
  ].filter((entry): entry is string => Boolean(entry));

  return {
    status: blockers.length === 0 ? 'passed' : 'blocked',
    policy_id: STANDARD_FOUNDRY_AGENT_GOLDEN_PATH_POLICY.policy_id,
    default_surface_budget_id: STANDARD_FOUNDRY_AGENT_GOLDEN_PATH_POLICY.default_surface_budget_id,
    policy_source: STANDARD_FOUNDRY_AGENT_GOLDEN_PATH_POLICY.stage_control_plane_ref,
    ordinary_default_route_budget: STANDARD_FOUNDRY_AGENT_GOLDEN_PATH_POLICY.ordinary_default_route_budget,
    default_route_count: defaultRouteStageIds.length,
    default_route_stage_ids: defaultRouteStageIds,
    explicit_non_default_lane_stage_ids: explicitNonDefaultLaneStageIds,
    route_stages: routeStages,
    blockers,
    authority_boundary: STANDARD_FOUNDRY_AGENT_GOLDEN_PATH_POLICY.authority_boundary,
  };
}
