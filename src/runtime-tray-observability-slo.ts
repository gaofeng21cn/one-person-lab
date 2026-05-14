import type { JsonRecord } from './runtime-tray-snapshot-types.ts';

type ObservabilitySloAttempt = {
  stage_attempt_id: string;
  domain_id: string;
  stage_id: string;
  route_impact: JsonRecord;
  current_provider_readiness: JsonRecord | null;
};

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function routeSloRefs(routeImpact: JsonRecord) {
  return uniqueStrings([
    ...stringList(routeImpact.slo_refs),
    optionalString(routeImpact.slo_ref),
    optionalString(routeImpact.observability_ref),
    optionalString(routeImpact.freshness_ref),
  ].filter((entry): entry is string => Boolean(entry)));
}

function routeRepairCommands(routeImpact: JsonRecord, stageAttemptId: string) {
  return uniqueStrings([
    ...stringList(routeImpact.repair_commands),
    optionalString(routeImpact.repair_command),
  ].filter((entry): entry is string => Boolean(entry))).map((command, index) => ({
    command_id: `repair-command:${stageAttemptId}:${index}`,
    command,
    execution_owner: 'operator_or_domain_owner',
    opl_executes_command: false,
  }));
}

export function buildAttemptObservabilitySlo(attempt: ObservabilitySloAttempt) {
  const sloRefs = routeSloRefs(attempt.route_impact);
  const breachedSloIds = uniqueStrings(stringList(attempt.route_impact.breached_slo_ids));
  const repairCommands = routeRepairCommands(attempt.route_impact, attempt.stage_attempt_id);
  const providerStatus = optionalString(attempt.current_provider_readiness?.status);
  const providerReady = typeof attempt.current_provider_readiness?.provider_ready === 'boolean'
    ? attempt.current_provider_readiness.provider_ready
    : null;
  const hasEvidence = sloRefs.length > 0 || breachedSloIds.length > 0 || repairCommands.length > 0 || providerStatus !== null;
  return {
    surface_kind: 'opl_observability_slo_projection',
    projection_scope: 'stage_attempt',
    transport_role: 'generic_observability_slo_repair_command_projection',
    availability: hasEvidence ? 'observability_refs_observed' : 'no_observability_refs',
    stage_attempt_id: attempt.stage_attempt_id,
    domain_id: attempt.domain_id,
    stage_id: attempt.stage_id,
    provider_readiness: attempt.current_provider_readiness,
    provider_ready: providerReady,
    provider_status: providerStatus,
    slo_refs: sloRefs,
    breached_slo_ids: breachedSloIds,
    repair_commands: repairCommands,
    summary: {
      slo_ref_count: sloRefs.length,
      breached_slo_count: breachedSloIds.length,
      repair_command_count: repairCommands.length,
      provider_status: providerStatus,
      projection_policy: 'observe_and_route_only_no_repair_execution',
    },
    authority_boundary: {
      opl: 'observability_transport_and_repair_command_projection_only',
      domain: 'runtime_health_and_quality_repair_owner',
      can_execute_repair_command: false,
      can_authorize_slo_verdict: false,
      can_write_domain_truth: false,
    },
  };
}

export function buildWorkbenchObservabilitySlo(attempts: ObservabilitySloAttempt[]) {
  const perAttempt = attempts.map(buildAttemptObservabilitySlo);
  const sloRefs = uniqueStrings(perAttempt.flatMap((projection) => projection.slo_refs));
  const breachedSloIds = uniqueStrings(perAttempt.flatMap((projection) => projection.breached_slo_ids));
  const repairCommands = perAttempt.flatMap((projection) => projection.repair_commands);
  return {
    surface_kind: 'opl_observability_slo_projection',
    projection_scope: 'stage_attempt_workbench',
    transport_role: 'generic_observability_slo_repair_command_projection',
    availability: perAttempt.some((projection) => projection.availability === 'observability_refs_observed')
      ? 'observability_refs_observed'
      : 'no_observability_refs',
    attempts: perAttempt,
    slo_refs: sloRefs,
    breached_slo_ids: breachedSloIds,
    repair_commands: repairCommands,
    summary: {
      attempt_count: attempts.length,
      attempt_with_slo_ref_count: perAttempt.filter((projection) => projection.summary.slo_ref_count > 0).length,
      attempt_with_repair_command_count: perAttempt.filter((projection) =>
        projection.summary.repair_command_count > 0
      ).length,
      slo_ref_count: sloRefs.length,
      breached_slo_count: breachedSloIds.length,
      repair_command_count: repairCommands.length,
      projection_policy: 'observe_and_route_only_no_repair_execution',
    },
    authority_boundary: {
      opl: 'observability_transport_and_repair_command_projection_only',
      domain: 'runtime_health_and_quality_repair_owner',
      can_execute_repair_command: false,
      can_authorize_slo_verdict: false,
      can_write_domain_truth: false,
    },
  };
}
