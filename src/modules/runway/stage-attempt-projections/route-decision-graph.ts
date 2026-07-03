import type { JsonRecord } from '../../../kernel/types.ts';

type RouteGraphAttempt = {
  stage_attempt_id: string;
  domain_id: string;
  stage_id: string;
  next_owner: string | null;
  route_impact: JsonRecord;
  consumed_refs: string[];
  consumed_memory_refs: string[];
  writeback_receipt_refs: string[];
  closeout_refs: string[];
};

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function routeDecisionValue(routeImpact: JsonRecord) {
  return optionalString(routeImpact.decision)
    ?? optionalString(routeImpact.route)
    ?? optionalString(routeImpact.impact)
    ?? optionalString(routeImpact.status)
    ?? null;
}

function routeRationale(routeImpact: JsonRecord) {
  return optionalString(routeImpact.reason)
    ?? optionalString(routeImpact.rationale)
    ?? optionalString(routeImpact.blocked_reason)
    ?? null;
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function present<T>(value: T): value is NonNullable<T> {
  return value !== null && value !== undefined;
}

function domainRefs(attempt: RouteGraphAttempt) {
  return uniqueStrings([
    ...attempt.consumed_refs,
    ...attempt.consumed_memory_refs,
    ...attempt.writeback_receipt_refs,
    ...attempt.closeout_refs,
  ]);
}

function buildAttemptRouteNodes(attempt: RouteGraphAttempt) {
  const decision = routeDecisionValue(attempt.route_impact);
  const refs = domainRefs(attempt);
  return [
    {
      node_id: `attempt:${attempt.stage_attempt_id}`,
      node_kind: 'stage_attempt',
      label: attempt.stage_id,
      domain_id: attempt.domain_id,
      source_ref_count: refs.length,
    },
    decision
      ? {
          node_id: `decision:${attempt.stage_attempt_id}`,
          node_kind: 'domain_route_decision_ref',
          label: decision,
          domain_id: attempt.domain_id,
          rationale: routeRationale(attempt.route_impact),
          route_impact: attempt.route_impact,
        }
      : null,
    attempt.next_owner
      ? {
          node_id: `owner:${attempt.next_owner}`,
          node_kind: 'next_owner',
          label: attempt.next_owner,
          domain_id: attempt.domain_id,
        }
      : null,
    refs.length > 0
      ? {
          node_id: `refs:${attempt.stage_attempt_id}`,
          node_kind: 'domain_owned_refs',
          label: 'domain refs',
          refs,
          ref_count: refs.length,
        }
      : null,
  ].filter(present);
}

function buildAttemptRouteEdges(attempt: RouteGraphAttempt) {
  const decision = routeDecisionValue(attempt.route_impact);
  const refs = domainRefs(attempt);
  return [
    decision
      ? {
          edge_id: `edge:${attempt.stage_attempt_id}:attempt-to-decision`,
          edge_kind: 'attempt_has_domain_route_decision_ref',
          from: `attempt:${attempt.stage_attempt_id}`,
          to: `decision:${attempt.stage_attempt_id}`,
        }
      : null,
    decision && attempt.next_owner
      ? {
          edge_id: `edge:${attempt.stage_attempt_id}:decision-to-owner`,
          edge_kind: 'decision_routes_to_owner',
          from: `decision:${attempt.stage_attempt_id}`,
          to: `owner:${attempt.next_owner}`,
        }
      : null,
    refs.length > 0
      ? {
          edge_id: `edge:${attempt.stage_attempt_id}:attempt-to-refs`,
          edge_kind: 'attempt_projects_domain_owned_refs',
          from: `attempt:${attempt.stage_attempt_id}`,
          to: `refs:${attempt.stage_attempt_id}`,
        }
      : null,
  ].filter(present);
}

export function buildAttemptRouteDecisionGraph(attempt: RouteGraphAttempt) {
  const refs = domainRefs(attempt);
  const hasRouteEvidence = Object.keys(attempt.route_impact).length > 0 || refs.length > 0;
  const nodes = buildAttemptRouteNodes(attempt);
  const edges = buildAttemptRouteEdges(attempt);
  return {
    surface_kind: 'opl_route_decision_graph_projection',
    graph_scope: 'stage_attempt',
    renderer_role: 'generic_route_decision_graph_shell',
    availability: hasRouteEvidence ? 'available' : 'no_route_evidence',
    stage_attempt_id: attempt.stage_attempt_id,
    domain_id: attempt.domain_id,
    stage_id: attempt.stage_id,
    next_owner: attempt.next_owner,
    route_impact: attempt.route_impact,
    nodes,
    edges,
    summary: {
      node_count: nodes.length,
      edge_count: edges.length,
      route_decision_ref_observed: routeDecisionValue(attempt.route_impact) !== null,
      domain_ref_count: refs.length,
    },
    authority_boundary: {
      opl: 'graph_renderer_and_ref_projection_only',
      domain: 'route_decision_quality_and_truth_owner',
      can_infer_route_decision: false,
      can_authorize_quality_verdict: false,
      can_write_domain_truth: false,
    },
  };
}

export function buildWorkbenchRouteDecisionGraph(attempts: RouteGraphAttempt[]) {
  const perAttempt = attempts.map(buildAttemptRouteDecisionGraph);
  const available = perAttempt.filter((graph) => graph.availability === 'available');
  const nodes = available.flatMap((graph) => graph.nodes);
  const edges = available.flatMap((graph) => graph.edges);
  return {
    surface_kind: 'opl_route_decision_graph_projection',
    graph_scope: 'stage_attempt_workbench',
    renderer_role: 'generic_route_decision_graph_shell',
    availability: available.length > 0 ? 'available' : 'no_route_evidence',
    summary: {
      attempt_count: attempts.length,
      route_evidence_attempt_count: available.length,
      route_decision_ref_count: available.filter((graph) => graph.summary.route_decision_ref_observed).length,
      node_count: nodes.length,
      edge_count: edges.length,
    },
    nodes,
    edges,
    attempts: perAttempt,
    authority_boundary: {
      opl: 'graph_renderer_and_ref_projection_only',
      domain: 'route_decision_quality_and_truth_owner',
      can_infer_route_decision: false,
      can_authorize_quality_verdict: false,
      can_write_domain_truth: false,
    },
  };
}
