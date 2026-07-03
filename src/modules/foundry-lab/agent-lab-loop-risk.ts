import { AGENT_LAB_AUTHORITY_BOUNDARY } from './agent-lab-authority.ts';
import { stableId } from '../../kernel/stable-id.ts';

type JsonRecord = Record<string, unknown>;

export type AgentLabLoopRiskLevel = 'low' | 'medium' | 'high' | 'fatal';

export type AgentLabLoopRiskNode = {
  node_ref: string;
  node_kind?: 'stage' | 'route' | 'decision' | 'quality_gate' | string;
  label?: string;
};

export type AgentLabLoopRiskEdge = {
  edge_ref?: string;
  from_ref: string;
  to_ref: string;
  route_ref?: string;
  edge_kind?: 'default_next_action' | 'route_back' | 'retry' | 'carry_forward' | string;
};

export type AgentLabSameIdentityRetryBudget = {
  budget_ref?: string;
  budget_kind?: 'same_identity_retry_budget' | 'bounded_same_identity_retry_budget' | string;
  max_same_identity_retries?: number;
  max_attempts?: number;
  scope?: 'same_identity' | string;
  exhausted_exit_ref?: string;
  budget_exhausted_exit_ref?: string;
};

export type AgentLabBudgetExhaustedExit = {
  exit_ref: string;
  exit_kind: 'stop_loss' | 'budget_exhausted_typed_blocker' | 'typed_blocker' | 'carry_forward_advance' | string;
  typed_blocker_ref?: string;
  blocks_ordinary_progress?: boolean;
};

export type AgentLabCarryForwardAdvanceExit = {
  exit_ref: string;
  next_action_ref: string;
  allowed_after_budget_exhausted?: boolean;
  preserves_progress_evidence?: boolean;
};

export type AgentLabAdvisoryLoopPolicy = {
  advisory_ref?: string;
  advisory_only?: boolean;
  blocks_default_next_action?: boolean;
  blocked_default_next_action_ref?: string;
};

type LoopRiskPolicySource = {
  progress_evidence_refs?: string[];
  same_identity_retry_budget?: AgentLabSameIdentityRetryBudget;
  budget_exhausted_exit?: AgentLabBudgetExhaustedExit;
  carry_forward_advance_exit?: AgentLabCarryForwardAdvanceExit;
  advisory?: AgentLabAdvisoryLoopPolicy;
  default_next_action_ref?: string;
};

export type AgentLabLoopRiskRoute = LoopRiskPolicySource & {
  route_ref: string;
  from_ref?: string;
  to_ref?: string;
  edge_ref?: string;
};

export type AgentLabQualityLoopPolicy = LoopRiskPolicySource & {
  loop_ref: string;
  loop_kind?: 'quality_loop' | 'stage_route_loop' | 'visual_qa_loop' | string;
  node_refs?: string[];
  stage_refs?: string[];
  route_refs?: string[];
  edge_refs?: string[];
};

export type AgentLabTaskManifestLoopRiskPolicy = LoopRiskPolicySource & {
  task_id: string;
  node_refs?: string[];
  stage_refs?: string[];
  route_refs?: string[];
  edge_refs?: string[];
};

export type AgentLabProgressFirstPolicyInput = LoopRiskPolicySource & {
  policy_ref?: string;
  advisory_blocks_default_next_action?: boolean;
};

export type AgentLabProgressFirstLoopRiskInput = {
  report_ref?: string;
  source_refs?: string[];
  nodes?: AgentLabLoopRiskNode[];
  routes?: AgentLabLoopRiskRoute[];
  edges?: AgentLabLoopRiskEdge[];
  qualityLoops?: AgentLabQualityLoopPolicy[];
  task_manifest_policy?: AgentLabTaskManifestLoopRiskPolicy;
  progress_first_policy?: AgentLabProgressFirstPolicyInput;
  authority_boundary?: JsonRecord;
};

export type AgentLabLoopRiskRepair = {
  repair_ref: string;
  repair_kind:
    | 'same_identity_retry_budget_missing'
    | 'budget_exhausted_exit_missing'
    | 'carry_forward_advance_exit_missing'
    | 'progress_evidence_required'
    | 'advisory_must_not_block_ordinary_progress';
  cycle_ref: string;
  owner: 'opl_agent_lab_route_policy';
};

export type AgentLabLoopRiskCycleReport = {
  cycle_ref: string;
  cycle_kind: 'graph_cycle' | 'declared_quality_loop';
  cycle_nodes: string[];
  cycle_routes: string[];
  cycle_edges: string[];
  loop_policy_refs: string[];
  risk_level: AgentLabLoopRiskLevel;
  risk_reasons: string[];
  has_same_identity_retry_budget: boolean;
  has_progress_evidence: boolean;
  has_budget_exhausted_exit: boolean;
  has_carry_forward_advance_exit: boolean;
  advisory_blocks_default_next_action: boolean;
  progress_evidence_refs: string[];
  required_repairs: AgentLabLoopRiskRepair[];
};

export type AgentLabProgressFirstLoopRiskReport = {
  surface_kind: 'opl_agent_lab_progress_first_loop_risk_report';
  version: 'opl-agent-lab.v1.progress-first-loop-risk';
  report_id: string;
  source_refs: string[];
  refs_only: true;
  risk_level: AgentLabLoopRiskLevel;
  cycle_reports: AgentLabLoopRiskCycleReport[];
  required_repairs: AgentLabLoopRiskRepair[];
  progress_first_policy: {
    policy_kind: 'progress_first_loop_risk_evaluator_refs_only';
    fatal_hard_loop_policy: 'cycle_without_budget_or_exit_is_fatal';
    retry_budget_policy: 'same_identity_retries_must_be_bounded';
    budget_exhausted_policy: 'budget_exhausted_must_have_explicit_exit';
    stop_loss_policy: 'stop_loss_without_carry_forward_is_not_ordinary_progress';
    carry_forward_policy: 'budget_exhausted_loops_need_carry_forward_advance_exit';
    advisory_policy: 'advisory_cannot_block_default_next_action';
    advisory_can_block_default_next_action: false;
    refs_only: true;
  };
  authority_boundary: JsonRecord;
};

type NormalizedEdge = Required<Pick<AgentLabLoopRiskEdge, 'edge_ref' | 'from_ref' | 'to_ref'>> & {
  route_ref: string | null;
};

type CycleDescriptor = {
  cycle_kind: 'graph_cycle' | 'declared_quality_loop';
  node_refs: string[];
  route_refs: string[];
  edge_refs: string[];
  policy_refs: string[];
  sources: LoopRiskPolicySource[];
};

const RISK_RANK: Record<AgentLabLoopRiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
  fatal: 3,
};

function unique(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function optionalRefs(values: string[] | undefined) {
  return unique(Array.isArray(values) ? values : []);
}

function maxRisk(levels: AgentLabLoopRiskLevel[]) {
  return levels.reduce<AgentLabLoopRiskLevel>((highest, level) =>
    RISK_RANK[level] > RISK_RANK[highest] ? level : highest, 'low');
}

function normalizeEdges(input: AgentLabProgressFirstLoopRiskInput): NormalizedEdge[] {
  const explicitEdges = (input.edges ?? []).map((edge, index) => ({
    edge_ref: edge.edge_ref ?? stableId('oalplre', [edge.from_ref, edge.to_ref, edge.route_ref ?? null, index]),
    from_ref: edge.from_ref,
    to_ref: edge.to_ref,
    route_ref: edge.route_ref ?? null,
  }));
  const routeEdges = (input.routes ?? [])
    .filter((route): route is AgentLabLoopRiskRoute & { from_ref: string; to_ref: string } =>
      typeof route.from_ref === 'string' && typeof route.to_ref === 'string')
    .map((route) => ({
      edge_ref: route.edge_ref ?? stableId('oalplre', [route.route_ref, route.from_ref, route.to_ref]),
      from_ref: route.from_ref,
      to_ref: route.to_ref,
      route_ref: route.route_ref,
    }));
  return [...explicitEdges, ...routeEdges];
}

function graphNodeRefs(input: AgentLabProgressFirstLoopRiskInput, edges: NormalizedEdge[]) {
  return unique([
    ...(input.nodes ?? []).map((node) => node.node_ref),
    ...edges.flatMap((edge) => [edge.from_ref, edge.to_ref]),
  ]).sort();
}

function canonicalCycleKey(nodeRefs: string[], routeRefs: string[]) {
  if (nodeRefs.length === 0) {
    return `routes:${routeRefs.slice().sort().join('|')}`;
  }
  const rotations = nodeRefs.map((_, index) => [
    ...nodeRefs.slice(index),
    ...nodeRefs.slice(0, index),
  ].join('>'));
  return `${rotations.sort()[0]}::${routeRefs.slice().sort().join('|')}`;
}

function findGraphCycles(input: AgentLabProgressFirstLoopRiskInput): Array<Omit<CycleDescriptor, 'sources' | 'policy_refs'>> {
  const edges = normalizeEdges(input);
  const nodeRefs = graphNodeRefs(input, edges);
  const adjacency = new Map<string, NormalizedEdge[]>();
  for (const edge of edges) {
    adjacency.set(edge.from_ref, [...(adjacency.get(edge.from_ref) ?? []), edge]);
  }

  const cycles = new Map<string, Omit<CycleDescriptor, 'sources' | 'policy_refs'>>();
  for (const start of nodeRefs) {
    visitCycle(start, start, [], [], new Set());
  }
  return [...cycles.values()];

  function visitCycle(
    start: string,
    current: string,
    pathNodes: string[],
    pathEdges: NormalizedEdge[],
    seen: Set<string>,
  ) {
    if (pathNodes.length > nodeRefs.length) {
      return;
    }
    const nextPathNodes = [...pathNodes, current];
    const nextSeen = new Set(seen);
    nextSeen.add(current);
    for (const edge of adjacency.get(current) ?? []) {
      const closing = edge.to_ref === start;
      if (closing) {
        const cycleNodes = nextPathNodes;
        const cycleEdges = [...pathEdges, edge];
        const routeRefs = unique(cycleEdges.map((entry) => entry.route_ref ?? ''));
        const key = canonicalCycleKey(cycleNodes, routeRefs);
        cycles.set(key, {
          cycle_kind: 'graph_cycle',
          node_refs: cycleNodes,
          route_refs: routeRefs,
          edge_refs: unique(cycleEdges.map((entry) => entry.edge_ref)),
        });
        continue;
      }
      if (!nextSeen.has(edge.to_ref)) {
        visitCycle(start, edge.to_ref, nextPathNodes, [...pathEdges, edge], nextSeen);
      }
    }
  }
}

function declaredQualityLoops(input: AgentLabProgressFirstLoopRiskInput): AgentLabQualityLoopPolicy[] {
  const loops = [...(input.qualityLoops ?? [])];
  if (input.task_manifest_policy) {
    const policy = input.task_manifest_policy;
    loops.push({
      loop_ref: `task-manifest-loop:${policy.task_id}`,
      loop_kind: 'stage_route_loop',
      node_refs: policy.node_refs,
      stage_refs: policy.stage_refs,
      route_refs: policy.route_refs,
      edge_refs: policy.edge_refs,
      progress_evidence_refs: policy.progress_evidence_refs,
      same_identity_retry_budget: policy.same_identity_retry_budget,
      budget_exhausted_exit: policy.budget_exhausted_exit,
      carry_forward_advance_exit: policy.carry_forward_advance_exit,
      advisory: policy.advisory,
      default_next_action_ref: policy.default_next_action_ref,
    });
  }
  return loops;
}

function loopNodeRefs(loop: AgentLabQualityLoopPolicy) {
  return unique([
    ...optionalRefs(loop.node_refs),
    ...optionalRefs(loop.stage_refs),
  ]);
}

function intersects(left: string[], right: string[]) {
  const rightSet = new Set(right);
  return left.some((value) => rightSet.has(value));
}

function matchingLoops(cycle: Omit<CycleDescriptor, 'sources' | 'policy_refs'>, loops: AgentLabQualityLoopPolicy[]) {
  return loops.filter((loop) =>
    intersects(cycle.route_refs, optionalRefs(loop.route_refs))
    || intersects(cycle.edge_refs, optionalRefs(loop.edge_refs))
    || intersects(cycle.node_refs, loopNodeRefs(loop)));
}

function routeSources(routeRefs: string[], routes: AgentLabLoopRiskRoute[]) {
  const routeSet = new Set(routeRefs);
  return routes.filter((route) => routeSet.has(route.route_ref));
}

function buildCycleDescriptors(input: AgentLabProgressFirstLoopRiskInput): CycleDescriptor[] {
  const loops = declaredQualityLoops(input);
  const usedLoopRefs = new Set<string>();
  const routes = input.routes ?? [];
  const globalPolicy = input.progress_first_policy ? [input.progress_first_policy] : [];
  const graphCycles = findGraphCycles(input).map((cycle) => {
    const loopsForCycle = matchingLoops(cycle, loops);
    loopsForCycle.forEach((loop) => usedLoopRefs.add(loop.loop_ref));
    return {
      ...cycle,
      policy_refs: loopsForCycle.map((loop) => loop.loop_ref),
      sources: [
        ...routeSources(cycle.route_refs, routes),
        ...loopsForCycle,
        ...globalPolicy,
      ],
    };
  });

  const declaredCycles = loops
    .filter((loop) => !usedLoopRefs.has(loop.loop_ref))
    .map((loop) => ({
      cycle_kind: 'declared_quality_loop' as const,
      node_refs: loopNodeRefs(loop),
      route_refs: optionalRefs(loop.route_refs),
      edge_refs: optionalRefs(loop.edge_refs),
      policy_refs: [loop.loop_ref],
      sources: [
        ...routeSources(optionalRefs(loop.route_refs), routes),
        loop,
        ...globalPolicy,
      ],
    }));

  return [...graphCycles, ...declaredCycles];
}

function boundedRetryBudget(budget: AgentLabSameIdentityRetryBudget | undefined) {
  const max = budget?.max_same_identity_retries ?? budget?.max_attempts;
  return typeof max === 'number' && Number.isFinite(max) && max > 0;
}

function budgetHasExhaustedExit(budget: AgentLabSameIdentityRetryBudget | undefined) {
  return Boolean(budget?.exhausted_exit_ref || budget?.budget_exhausted_exit_ref);
}

function carryForwardExit(exit: AgentLabCarryForwardAdvanceExit | undefined) {
  return Boolean(exit?.exit_ref && exit.next_action_ref && exit.allowed_after_budget_exhausted !== false);
}

function budgetExitCarriesForward(exit: AgentLabBudgetExhaustedExit | undefined) {
  return exit?.exit_kind === 'carry_forward_advance' && exit.blocks_ordinary_progress !== true;
}

function advisoryBlocksDefaultNextAction(
  sources: LoopRiskPolicySource[],
  inputPolicy: AgentLabProgressFirstPolicyInput | undefined,
) {
  return inputPolicy?.advisory_blocks_default_next_action === true
    || sources.some((source) =>
      source.advisory?.blocks_default_next_action === true
      && source.advisory.advisory_only !== false);
}

function repair(cycleRef: string, repairKind: AgentLabLoopRiskRepair['repair_kind']): AgentLabLoopRiskRepair {
  return {
    repair_ref: stableId('oalplrr', [cycleRef, repairKind]),
    repair_kind: repairKind,
    cycle_ref: cycleRef,
    owner: 'opl_agent_lab_route_policy',
  };
}

function buildCycleReport(
  cycle: CycleDescriptor,
  inputPolicy: AgentLabProgressFirstPolicyInput | undefined,
): AgentLabLoopRiskCycleReport {
  const retryBudgets = cycle.sources.map((source) => source.same_identity_retry_budget).filter(Boolean);
  const budgetExits = cycle.sources.map((source) => source.budget_exhausted_exit).filter(Boolean);
  const carryForwardExits = cycle.sources.map((source) => source.carry_forward_advance_exit).filter(Boolean);
  const progressEvidenceRefs = unique(cycle.sources.flatMap((source) => optionalRefs(source.progress_evidence_refs)));
  const hasSameIdentityRetryBudget = retryBudgets.some(boundedRetryBudget);
  const hasBudgetExhaustedExit = budgetExits.length > 0 || retryBudgets.some(budgetHasExhaustedExit);
  const hasCarryForwardAdvanceExit = carryForwardExits.some(carryForwardExit) || budgetExits.some(budgetExitCarriesForward);
  const advisoryBlocks = advisoryBlocksDefaultNextAction(cycle.sources, inputPolicy);

  const riskReasons: string[] = [];
  const repairs: AgentLabLoopRiskRepair[] = [];

  if (!hasSameIdentityRetryBudget && !hasBudgetExhaustedExit && !hasCarryForwardAdvanceExit) {
    riskReasons.push('hard_loop_without_same_identity_budget_or_exit');
    repairs.push(
      repair('', 'same_identity_retry_budget_missing'),
      repair('', 'budget_exhausted_exit_missing'),
      repair('', 'carry_forward_advance_exit_missing'),
    );
  } else {
    if (!hasSameIdentityRetryBudget) {
      riskReasons.push('same_identity_retry_budget_missing');
      repairs.push(repair('', 'same_identity_retry_budget_missing'));
    }
    if (!hasBudgetExhaustedExit) {
      riskReasons.push('budget_exhausted_exit_missing');
      repairs.push(repair('', 'budget_exhausted_exit_missing'));
    }
    if (!hasCarryForwardAdvanceExit) {
      riskReasons.push('carry_forward_advance_exit_missing');
      repairs.push(repair('', 'carry_forward_advance_exit_missing'));
    }
  }
  if (progressEvidenceRefs.length === 0) {
    riskReasons.push('progress_evidence_required');
    repairs.push(repair('', 'progress_evidence_required'));
  }
  if (advisoryBlocks) {
    riskReasons.push('advisory_blocks_default_next_action');
    repairs.push(repair('', 'advisory_must_not_block_ordinary_progress'));
  }

  const riskLevel = !hasSameIdentityRetryBudget && !hasBudgetExhaustedExit && !hasCarryForwardAdvanceExit
    ? 'fatal'
    : advisoryBlocks || !hasSameIdentityRetryBudget || !hasBudgetExhaustedExit || !hasCarryForwardAdvanceExit
      ? 'high'
      : progressEvidenceRefs.length === 0
        ? 'medium'
        : 'low';
  const cycleRef = stableId('oalplrc', [
    cycle.cycle_kind,
    cycle.node_refs,
    cycle.route_refs,
    cycle.edge_refs,
    cycle.policy_refs,
    riskReasons,
  ]);

  return {
    cycle_ref: cycleRef,
    cycle_kind: cycle.cycle_kind,
    cycle_nodes: cycle.node_refs,
    cycle_routes: cycle.route_refs,
    cycle_edges: cycle.edge_refs,
    loop_policy_refs: cycle.policy_refs,
    risk_level: riskLevel,
    risk_reasons: unique(riskReasons),
    has_same_identity_retry_budget: hasSameIdentityRetryBudget,
    has_progress_evidence: progressEvidenceRefs.length > 0,
    has_budget_exhausted_exit: hasBudgetExhaustedExit,
    has_carry_forward_advance_exit: hasCarryForwardAdvanceExit,
    advisory_blocks_default_next_action: advisoryBlocks,
    progress_evidence_refs: progressEvidenceRefs,
    required_repairs: uniqueRepairs(repairs.map((entry) => ({
      ...entry,
      cycle_ref: cycleRef,
      repair_ref: stableId('oalplrr', [cycleRef, entry.repair_kind]),
    }))),
  };
}

function uniqueRepairs(repairs: AgentLabLoopRiskRepair[]) {
  const byKindAndCycle = new Map<string, AgentLabLoopRiskRepair>();
  for (const entry of repairs) {
    byKindAndCycle.set(`${entry.cycle_ref}:${entry.repair_kind}`, entry);
  }
  return [...byKindAndCycle.values()];
}

function progressFirstPolicy() {
  return {
    policy_kind: 'progress_first_loop_risk_evaluator_refs_only' as const,
    fatal_hard_loop_policy: 'cycle_without_budget_or_exit_is_fatal' as const,
    retry_budget_policy: 'same_identity_retries_must_be_bounded' as const,
    budget_exhausted_policy: 'budget_exhausted_must_have_explicit_exit' as const,
    stop_loss_policy: 'stop_loss_without_carry_forward_is_not_ordinary_progress' as const,
    carry_forward_policy: 'budget_exhausted_loops_need_carry_forward_advance_exit' as const,
    advisory_policy: 'advisory_cannot_block_default_next_action' as const,
    advisory_can_block_default_next_action: false as const,
    refs_only: true as const,
  };
}

function authorityBoundary(): JsonRecord {
  return {
    ...AGENT_LAB_AUTHORITY_BOUNDARY,
    evaluator_role: 'refs_only_loop_risk_evaluator',
    refs_only: true,
    can_claim_domain_truth: false,
    can_claim_quality_verdict: false,
    can_claim_promotion_ready: false,
    can_block_default_next_action: false,
    can_write_domain_truth: false,
    can_authorize_quality_verdict: false,
    can_mutate_domain_artifact: false,
    can_write_owner_receipt: false,
  };
}

export function buildAgentLabProgressFirstLoopRiskReport(
  input: AgentLabProgressFirstLoopRiskInput,
): AgentLabProgressFirstLoopRiskReport {
  const cycleReports = buildCycleDescriptors(input).map((cycle) => buildCycleReport(cycle, input.progress_first_policy));
  const requiredRepairs = uniqueRepairs(cycleReports.flatMap((cycle) => cycle.required_repairs));
  return {
    surface_kind: 'opl_agent_lab_progress_first_loop_risk_report',
    version: 'opl-agent-lab.v1.progress-first-loop-risk',
    report_id: stableId('oalplr', [input.report_ref ?? null, input.source_refs ?? [], cycleReports]),
    source_refs: optionalRefs(input.source_refs),
    refs_only: true,
    risk_level: maxRisk(cycleReports.map((cycle) => cycle.risk_level)),
    cycle_reports: cycleReports,
    required_repairs: requiredRepairs,
    progress_first_policy: progressFirstPolicy(),
    authority_boundary: authorityBoundary(),
  };
}
