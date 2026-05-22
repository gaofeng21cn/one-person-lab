import { assert } from '../helpers.ts';

export function assertFrameworkReadinessBlockerAttribution(readiness: any) {
  const stageHardBlockerCount = (Object.values(readiness.stages.readiness_by_domain) as Array<{
    hard_blocker_count?: unknown;
  }>).reduce(
    (total, summary) =>
      total + (typeof summary.hard_blocker_count === 'number' ? summary.hard_blocker_count : 0),
    0,
  );
  const agentConformanceBlockedCount =
    readiness.agent_conformance_tail.structural_conformance_status === 'blocked'
      ? readiness.agent_conformance_tail.conformance_blocked_count
      : 0;
  const expectedBlockerRoutes = [
    readiness.pack_compiler.summary.blocked_domain_count > 0
      ? '/framework_readiness/pack_compiler'
      : null,
    readiness.stages.diagnostic_failures.length > 0
      ? '/framework_readiness/diagnostic_failures'
      : null,
    stageHardBlockerCount > 0
      ? '/framework_readiness/stages'
      : null,
    agentConformanceBlockedCount > 0
      ? '/framework_readiness/agent_conformance_tail'
      : null,
  ].filter((routeRef): routeRef is string => Boolean(routeRef));
  assert.deepEqual(
    readiness.attention_first_payload.blockers.map(
      (blocker: { route_ref: string }) => blocker.route_ref,
    ),
    expectedBlockerRoutes,
  );
  assert.equal(
    hasBlocker(
      readiness,
      'agent_structural_conformance_blocker_present',
      agentConformanceBlockedCount,
      '/framework_readiness/agent_conformance_tail',
    ),
    agentConformanceBlockedCount > 0,
  );
  assert.equal(
    hasBlocker(
      readiness,
      'stage_readiness_hard_blocker_present',
      stageHardBlockerCount,
      '/framework_readiness/stages',
    ),
    stageHardBlockerCount > 0,
  );
}

function hasBlocker(
  readiness: any,
  blockerId: string,
  count: number,
  routeRef: string,
) {
  return readiness.attention_first_payload.blockers.some(
    (blocker: { blocker_id?: string; count?: number; route_ref?: string }) =>
      blocker.blocker_id === blockerId
      && blocker.count === count
      && blocker.route_ref === routeRef,
  );
}
