import type {
  FamilyActionCatalog,
  FamilyActionStageRoute,
} from '../../kernel/family-action-catalog-contract.ts';
import type {
  FamilyStageControlPlane,
  FamilyStageDescriptor,
} from './family-stage-control-plane-contract.ts';

function validateRouteGraph(
  actionId: string,
  route: FamilyActionStageRoute,
  stagesById: Map<string, FamilyStageDescriptor>,
) {
  const issues: string[] = [];
  const routeStageRefs = new Set([...route.required_stage_refs, ...route.optional_stage_refs]);
  const unknownStageRefs = [...routeStageRefs].filter((entry) => !stagesById.has(entry));
  if (unknownStageRefs.length > 0) {
    issues.push(`${actionId}: stage_route references unknown stages: ${unknownStageRefs.join(', ')}`);
    return issues;
  }

  for (const stageRef of routeStageRefs) {
    if (!stagesById.get(stageRef)!.allowed_action_refs.includes(actionId)) {
      issues.push(`${actionId}: routed stage does not allow the action: ${stageRef}`);
    }
  }
  for (const stage of stagesById.values()) {
    if (stage.allowed_action_refs.includes(actionId) && !routeStageRefs.has(stage.stage_id)) {
      issues.push(`${actionId}: allowed stage is omitted from stage_route: ${stage.stage_id}`);
    }
  }

  return issues;
}

export function buildFamilyActionStageRouteParity(
  catalog: FamilyActionCatalog,
  plane: FamilyStageControlPlane,
  options: { require_declared_routes?: boolean } = {},
) {
  const issues: string[] = [];
  const stagesById = new Map(plane.stages.map((stage) => [stage.stage_id, stage]));
  for (const action of catalog.actions) {
    if (action.stage_route_exempt === 'domain_handler_target_only') {
      const executableStages = plane.stages
        .filter((stage) => stage.allowed_action_refs.includes(action.action_id))
        .map((stage) => stage.stage_id);
      if (executableStages.length > 0) {
        issues.push(
          `${action.action_id}: target-only action must not be allowed by a stage: ${executableStages.join(', ')}`,
        );
      }
      continue;
    }
    if (!action.stage_route) {
      if (options.require_declared_routes === true && action.effect === 'mutating') {
        issues.push(`${action.action_id}: missing required stage_route`);
      }
      continue;
    }
    issues.push(...validateRouteGraph(action.action_id, action.stage_route, stagesById));
  }
  return {
    surface_kind: 'family_action_stage_route_parity',
    version: 'family-action-stage-route-parity.v1',
    status: issues.length === 0 ? 'aligned' : 'drift_detected',
    route_policy: 'ai_selected_progress_route',
    declared_route_count: catalog.actions.filter((action) => Boolean(action.stage_route)).length,
    required_route_action_count: catalog.actions.filter((action) => (
      action.effect === 'mutating'
      && action.stage_route_exempt !== 'domain_handler_target_only'
    )).length,
    action_count: catalog.actions.length,
    issues,
  };
}
