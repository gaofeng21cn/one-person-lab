import type {
  FamilyActionCatalog,
  FamilyActionStageRoute,
} from '../../kernel/family-action-catalog-contract.ts';
import { isRecord } from '../../kernel/contract-validation.ts';
import { stringList } from '../../kernel/json-record.ts';
import type {
  FamilyStageControlPlane,
  FamilyStageDescriptor,
} from './family-stage-control-plane-contract.ts';

function nextStageRefs(stage: FamilyStageDescriptor) {
  return isRecord(stage.handoff) ? stringList(stage.handoff.next_stage_refs) : [];
}

function canReach(
  from: string,
  to: string,
  routeStageRefs: Set<string>,
  stagesById: Map<string, FamilyStageDescriptor>,
) {
  if (from === to) {
    return true;
  }
  const pending = [from];
  const seen = new Set(pending);
  while (pending.length > 0) {
    const current = pending.shift()!;
    const stage = stagesById.get(current);
    if (!stage) {
      continue;
    }
    for (const next of nextStageRefs(stage)) {
      if (!routeStageRefs.has(next) || seen.has(next)) {
        continue;
      }
      if (next === to) {
        return true;
      }
      seen.add(next);
      pending.push(next);
    }
  }
  return false;
}

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

  for (let index = 0; index < route.required_stage_refs.length - 1; index += 1) {
    const current = route.required_stage_refs[index]!;
    const next = route.required_stage_refs[index + 1]!;
    const allowedBeforeNext = new Set([
      ...route.required_stage_refs.slice(0, index + 2),
      ...route.optional_stage_refs,
    ]);
    if (!canReach(current, next, allowedBeforeNext, stagesById)) {
      issues.push(`${actionId}: required stage order is unreachable: ${current} -> ${next}`);
    }
  }

  const lastRequiredStage = route.required_stage_refs.at(-1)!;
  if (!route.terminal_stage_refs.some((terminal) =>
    canReach(lastRequiredStage, terminal, routeStageRefs, stagesById))) {
    issues.push(`${actionId}: required route cannot reach a declared terminal stage from ${lastRequiredStage}`);
  }
  for (const optionalStage of route.optional_stage_refs) {
    const reachableFromEntry = canReach(route.entry_stage_ref, optionalStage, routeStageRefs, stagesById);
    const reachesTerminal = route.terminal_stage_refs.some((terminal) =>
      canReach(optionalStage, terminal, routeStageRefs, stagesById));
    if (!reachableFromEntry || !reachesTerminal) {
      issues.push(`${actionId}: optional stage is not on a valid entry-to-terminal path: ${optionalStage}`);
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
    route_policy: 'ordered_stage_attempts_no_skip',
    declared_route_count: catalog.actions.filter((action) => Boolean(action.stage_route)).length,
    required_route_action_count: catalog.actions.filter((action) => (
      action.effect === 'mutating'
      && action.stage_route_exempt !== 'domain_handler_target_only'
    )).length,
    action_count: catalog.actions.length,
    issues,
  };
}
