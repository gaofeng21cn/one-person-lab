import type { JsonRecord } from './runtime-tray-snapshot-types.ts';

type ActionRoutingAttempt = {
  stage_attempt_id: string;
  domain_id: string;
  stage_id: string;
  next_owner: string | null;
  route_impact: JsonRecord;
  human_gate_refs: string[];
  resume_ledger: JsonRecord[];
  transition_bridge_evidence?: JsonRecord | null;
};

type OperatorActionRoute = {
  action_id: string;
  action_kind: string;
  action_owner: 'opl' | 'provider' | 'domain' | 'user';
  route_target_kind: 'opl_cli' | 'app_surface' | 'provider_signal' | 'domain_sidecar' | 'direct_skill';
  command_or_surface_ref: string;
  stage_attempt_id: string;
  domain_id: string;
  stage_id: string;
  execution_policy: 'route_only_no_execution' | 'opl_safe_action_shell';
  execution_surface?: string;
};

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function executableRouteFields() {
  return {
    execution_policy: 'opl_safe_action_shell' as const,
    execution_surface: 'opl runtime action execute',
  };
}

function stageAttemptSurfaceRef(attempt: ActionRoutingAttempt, projectionName: string) {
  return `/stage_attempt_workbench/attempts/${attempt.stage_attempt_id}/${projectionName}`;
}

function appSurfaceRoute(
  attempt: ActionRoutingAttempt,
  actionKind: string,
  projectionName: string,
): OperatorActionRoute {
  return {
    action_id: `action:${attempt.stage_attempt_id}:${actionKind}`,
    action_kind: actionKind,
    action_owner: 'opl',
    route_target_kind: 'app_surface',
    command_or_surface_ref: stageAttemptSurfaceRef(attempt, projectionName),
    stage_attempt_id: attempt.stage_attempt_id,
    domain_id: attempt.domain_id,
    stage_id: attempt.stage_id,
    execution_policy: 'route_only_no_execution',
  };
}

function repairCommandRoutes(attempt: ActionRoutingAttempt): OperatorActionRoute[] {
  return uniqueStrings([
    ...stringList(attempt.route_impact.repair_commands),
    optionalString(attempt.route_impact.repair_command),
  ].filter((entry): entry is string => Boolean(entry))).map((command, index) => ({
    action_id: `action:${attempt.stage_attempt_id}:domain-repair-command:${index}`,
    action_kind: 'domain_sidecar_repair_command',
    action_owner: 'domain',
    route_target_kind: 'domain_sidecar',
    command_or_surface_ref: command,
    stage_attempt_id: attempt.stage_attempt_id,
    domain_id: attempt.domain_id,
    stage_id: attempt.stage_id,
    ...executableRouteFields(),
  }));
}

function directSkillRoutes(attempt: ActionRoutingAttempt): OperatorActionRoute[] {
  return uniqueStrings([
    ...stringList(attempt.route_impact.direct_skill_commands),
    ...stringList(attempt.route_impact.direct_skill_refs),
    optionalString(attempt.route_impact.direct_skill_command),
    optionalString(attempt.route_impact.direct_skill_ref),
  ].filter((entry): entry is string => Boolean(entry))).map((commandOrRef, index) => ({
    action_id: `action:${attempt.stage_attempt_id}:direct-skill:${index}`,
    action_kind: 'domain_direct_skill',
    action_owner: 'domain',
    route_target_kind: 'direct_skill',
    command_or_surface_ref: commandOrRef,
    stage_attempt_id: attempt.stage_attempt_id,
    domain_id: attempt.domain_id,
    stage_id: attempt.stage_id,
    ...executableRouteFields(),
  }));
}

function providerSignalRoutes(attempt: ActionRoutingAttempt): OperatorActionRoute[] {
  const humanGateRoutes = uniqueStrings(attempt.human_gate_refs).map((ref, index) => ({
    action_id: `action:${attempt.stage_attempt_id}:provider-human-gate:${index}`,
    action_kind: 'provider_signal:human_gate',
    action_owner: 'provider' as const,
    route_target_kind: 'provider_signal' as const,
    command_or_surface_ref: ref,
    stage_attempt_id: attempt.stage_attempt_id,
    domain_id: attempt.domain_id,
    stage_id: attempt.stage_id,
    ...executableRouteFields(),
  }));
  const resumeRoutes = attempt.resume_ledger
    .map((entry) => entry.payload)
    .filter((payload): payload is JsonRecord => Boolean(payload) && typeof payload === 'object' && !Array.isArray(payload))
    .map((payload) => optionalString(payload.resume_token))
    .filter((entry): entry is string => Boolean(entry))
    .map((ref, index) => ({
      action_id: `action:${attempt.stage_attempt_id}:provider-resume:${index}`,
      action_kind: 'provider_signal:resume',
      action_owner: 'provider' as const,
      route_target_kind: 'provider_signal' as const,
      command_or_surface_ref: ref,
      stage_attempt_id: attempt.stage_attempt_id,
      domain_id: attempt.domain_id,
      stage_id: attempt.stage_id,
      ...executableRouteFields(),
    }));
  return [...humanGateRoutes, ...resumeRoutes];
}

function domainOwnerRoute(attempt: ActionRoutingAttempt): OperatorActionRoute[] {
  if (!attempt.next_owner) {
    return [];
  }
  return [{
    action_id: `action:${attempt.stage_attempt_id}:domain-owner-handoff`,
    action_kind: 'domain_owner_handoff',
    action_owner: 'domain',
    route_target_kind: 'domain_sidecar',
    command_or_surface_ref: `domain_owner:${attempt.next_owner}`,
    stage_attempt_id: attempt.stage_attempt_id,
    domain_id: attempt.domain_id,
    stage_id: attempt.stage_id,
    ...executableRouteFields(),
  }];
}

function transitionBridgeEvidenceRoute(attempt: ActionRoutingAttempt): OperatorActionRoute[] {
  if (!isRecord(attempt.transition_bridge_evidence)
    || attempt.transition_bridge_evidence.availability !== 'transition_bridge_observed') {
    return [];
  }
  return [appSurfaceRoute(
    attempt,
    'projection_drilldown:transition_bridge_evidence',
    'transition_bridge_evidence',
  )];
}

function routeSummary(actions: OperatorActionRoute[], attemptCount: number) {
  const countByTarget = (target: OperatorActionRoute['route_target_kind']) =>
    actions.filter((action) => action.route_target_kind === target).length;
  return {
    attempt_count: attemptCount,
    action_count: actions.length,
    opl_cli_route_count: countByTarget('opl_cli'),
    app_surface_route_count: countByTarget('app_surface'),
    provider_signal_route_count: countByTarget('provider_signal'),
    domain_sidecar_route_count: countByTarget('domain_sidecar'),
    direct_skill_route_count: countByTarget('direct_skill'),
    execution_policy: actions.some((action) => action.execution_policy === 'opl_safe_action_shell')
      ? 'opl_safe_action_shell'
      : 'route_only_no_execution',
    executable_route_count: actions.filter((action) => action.execution_policy === 'opl_safe_action_shell').length,
  };
}

export function buildAttemptOperatorActionRouting(attempt: ActionRoutingAttempt) {
  const actions: OperatorActionRoute[] = [
    {
      action_id: `action:${attempt.stage_attempt_id}:attempt-query`,
      action_kind: 'stage_attempt_query',
      action_owner: 'opl',
      route_target_kind: 'opl_cli',
      command_or_surface_ref: `opl family-runtime attempt query ${attempt.stage_attempt_id}`,
      stage_attempt_id: attempt.stage_attempt_id,
      domain_id: attempt.domain_id,
      stage_id: attempt.stage_id,
      ...executableRouteFields(),
    },
    appSurfaceRoute(attempt, 'projection_drilldown:workspace_source_intake', 'workspace_source_intake'),
    appSurfaceRoute(attempt, 'projection_drilldown:memory_locator_index', 'memory_locator_index'),
    appSurfaceRoute(attempt, 'projection_drilldown:artifact_gallery', 'artifact_gallery'),
    appSurfaceRoute(attempt, 'projection_drilldown:package_export_lifecycle', 'package_export_lifecycle'),
    appSurfaceRoute(attempt, 'projection_drilldown:lifecycle_primitives', 'lifecycle_primitives'),
    appSurfaceRoute(attempt, 'projection_drilldown:route_decision_graph', 'route_decision_graph'),
    appSurfaceRoute(attempt, 'projection_drilldown:review_repair_queue', 'review_repair_queue'),
    appSurfaceRoute(attempt, 'projection_drilldown:quality_readiness', 'quality_readiness'),
    appSurfaceRoute(attempt, 'projection_drilldown:observability_slo', 'observability_slo'),
    appSurfaceRoute(attempt, 'projection_drilldown:controlled_apply_contract', 'controlled_apply_contract'),
    ...transitionBridgeEvidenceRoute(attempt),
    ...providerSignalRoutes(attempt),
    ...domainOwnerRoute(attempt),
    ...repairCommandRoutes(attempt),
    ...directSkillRoutes(attempt),
  ];

  return {
    surface_kind: 'opl_operator_action_routing_projection',
    routing_scope: 'stage_attempt',
    router_role: 'generic_operator_action_routing_shell',
    availability: actions.length > 0 ? 'action_routes_observed' : 'no_action_routes',
    stage_attempt_id: attempt.stage_attempt_id,
    domain_id: attempt.domain_id,
    stage_id: attempt.stage_id,
    next_owner: attempt.next_owner,
    actions,
    summary: routeSummary(actions, 1),
    authority_boundary: {
      opl: 'operator_action_routing_envelope_only',
      provider: 'provider_signal_receipt_owner',
      domain: 'domain_sidecar_direct_skill_and_truth_owner',
      can_execute_domain_action: false,
      can_enqueue_domain_action: true,
      can_execute_provider_signal: true,
      can_execute_direct_skill: false,
      can_write_domain_truth: false,
      provider_completion_is_domain_ready: false,
    },
  };
}

export function buildWorkbenchOperatorActionRouting(attempts: ActionRoutingAttempt[]) {
  const perAttempt = attempts.map(buildAttemptOperatorActionRouting);
  const actions = perAttempt.flatMap((projection) => projection.actions);
  return {
    surface_kind: 'opl_operator_action_routing_projection',
    routing_scope: 'stage_attempt_workbench',
    router_role: 'generic_operator_action_routing_shell',
    availability: actions.length > 0 ? 'action_routes_observed' : 'no_action_routes',
    attempts: perAttempt,
    actions,
    summary: routeSummary(actions, attempts.length),
    authority_boundary: {
      opl: 'operator_action_routing_envelope_only',
      provider: 'provider_signal_receipt_owner',
      domain: 'domain_sidecar_direct_skill_and_truth_owner',
      can_execute_domain_action: false,
      can_enqueue_domain_action: true,
      can_execute_provider_signal: true,
      can_execute_direct_skill: false,
      can_write_domain_truth: false,
      provider_completion_is_domain_ready: false,
    },
  };
}
