import { AGENT_LAB_AUTHORITY_BOUNDARY } from './agent-lab-authority.ts';
import { stableId } from '../runway/family-runtime-ids.ts';

type JsonRecord = Record<string, unknown>;

export type AgentLabEfficiencyNonRegressionRefs = {
  duration_refs?: string[];
  cost_refs?: string[];
  cache_hit_refs?: string[];
  reuse_scope_refs?: string[];
  quality_floor_refs?: string[];
  no_forbidden_write_refs?: string[];
  owner_route_refs?: string[];
};

export type AgentLabEfficiencyNonRegressionInput = {
  suiteResults?: JsonRecord[];
  handoffRefs?: JsonRecord[];
  explicitRefs?: AgentLabEfficiencyNonRegressionRefs;
};

const REQUIRED_GROUPS = [
  'duration_refs',
  'cost_refs',
  'cache_hit_refs',
  'reuse_scope_refs',
  'quality_floor_refs',
  'no_forbidden_write_refs',
  'owner_route_refs',
] as const;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function unique(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? unique(value.filter((entry): entry is string => typeof entry === 'string')) : [];
}

function textField(record: JsonRecord | null | undefined, key: string) {
  const value = record?.[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function nestedRecord(record: JsonRecord | null | undefined, key: string): JsonRecord {
  const value = record?.[key];
  return isRecord(value) ? value : {};
}

function firstString(...values: unknown[]) {
  return values.find((value): value is string =>
    typeof value === 'string' && value.trim().length > 0)?.trim() ?? null;
}

function addRef(target: string[], value: unknown) {
  if (typeof value === 'string' && value.trim().length > 0) {
    target.push(value.trim());
  }
}

function addRefs(target: string[], value: unknown) {
  target.push(...stringList(value));
}

function collectEfficiencyHandoffRefs(
  handoff: JsonRecord | undefined,
): Required<AgentLabEfficiencyNonRegressionRefs> {
  const groups: Required<AgentLabEfficiencyNonRegressionRefs> = {
    duration_refs: [],
    cost_refs: [],
    cache_hit_refs: [],
    reuse_scope_refs: [],
    quality_floor_refs: [],
    no_forbidden_write_refs: [],
    owner_route_refs: [],
  };

  if (!handoff) {
    return groups;
  }

  const signals = nestedRecord(handoff, 'efficiency_signal_refs');
  const qualityFloor = nestedRecord(handoff, 'quality_floor_refs');
  const authorityBoundary = nestedRecord(handoff, 'authority_boundary');
  const suiteInput = nestedRecord(handoff, 'agent_lab_suite_input');
  addRefs(groups.duration_refs, signals.duration_refs);
  addRefs(groups.cost_refs, signals.cost_refs);
  addRefs(groups.cache_hit_refs, signals.cache_refs);
  addRefs(groups.reuse_scope_refs, signals.reuse_refs);
  addRefs(groups.quality_floor_refs, qualityFloor.review_export_gate_refs);
  addRefs(groups.quality_floor_refs, qualityFloor.screenshot_review_gate_refs);
  addRefs(groups.quality_floor_refs, qualityFloor.visual_memory_authority_refs);
  addRefs(groups.quality_floor_refs, qualityFloor.owner_receipt_refs);
  addRefs(groups.quality_floor_refs, qualityFloor.export_authority_refs);

  if (authorityBoundary.no_forbidden_write === true) {
    groups.no_forbidden_write_refs.push(`no-forbidden-write:${handoff.owner ?? 'domain'}/efficiency-handoff`);
  }
  addRefs(groups.no_forbidden_write_refs, authorityBoundary.no_forbidden_write_refs);
  addRef(groups.owner_route_refs, firstString(
    handoff.owner_route_ref,
    handoff.owner,
    suiteInput.domain_id,
  ));

  return {
    duration_refs: unique(groups.duration_refs),
    cost_refs: unique(groups.cost_refs),
    cache_hit_refs: unique(groups.cache_hit_refs),
    reuse_scope_refs: unique(groups.reuse_scope_refs),
    quality_floor_refs: unique(groups.quality_floor_refs),
    no_forbidden_write_refs: unique(groups.no_forbidden_write_refs),
    owner_route_refs: unique(groups.owner_route_refs),
  };
}

function collectEfficiencyHandoffProjections(record: JsonRecord): JsonRecord[] {
  return Object.entries(record)
    .filter(([key, value]) => (
      key === 'efficiency_handoff_projection' || key.endsWith('_efficiency_handoff_projection')
    ) && isRecord(value))
    .map(([, value]) => value as JsonRecord);
}

function collectSuiteEfficiencyRefs(suiteResults: JsonRecord[] = []): Required<AgentLabEfficiencyNonRegressionRefs> {
  const groups: Required<AgentLabEfficiencyNonRegressionRefs> = {
    duration_refs: [],
    cost_refs: [],
    cache_hit_refs: [],
    reuse_scope_refs: [],
    quality_floor_refs: [],
    no_forbidden_write_refs: [],
    owner_route_refs: [],
  };

  for (const suiteResult of suiteResults) {
    const handoffRefs = collectEfficiencyHandoffProjections(suiteResult).map(collectEfficiencyHandoffRefs);
    const refs = isRecord(suiteResult.refs) ? suiteResult.refs : {};
    groups.duration_refs.push(...stringList(refs.duration_refs));
    groups.duration_refs.push(...handoffRefs.flatMap((handoff) => handoff.duration_refs));
    groups.cost_refs.push(...stringList(refs.cost_refs));
    groups.cost_refs.push(...handoffRefs.flatMap((handoff) => handoff.cost_refs));
    groups.cache_hit_refs.push(...stringList(refs.cache_hit_refs));
    groups.cache_hit_refs.push(...handoffRefs.flatMap((handoff) => handoff.cache_hit_refs));
    groups.reuse_scope_refs.push(...stringList(refs.reuse_scope_refs));
    groups.reuse_scope_refs.push(...handoffRefs.flatMap((handoff) => handoff.reuse_scope_refs));
    groups.quality_floor_refs.push(...stringList(refs.quality_floor_refs));
    groups.quality_floor_refs.push(...handoffRefs.flatMap((handoff) => handoff.quality_floor_refs));
    groups.no_forbidden_write_refs.push(...stringList(refs.no_forbidden_write_refs));
    groups.no_forbidden_write_refs.push(...handoffRefs.flatMap((handoff) => handoff.no_forbidden_write_refs));
    groups.owner_route_refs.push(...stringList(refs.owner_route_refs));
    groups.owner_route_refs.push(...handoffRefs.flatMap((handoff) => handoff.owner_route_refs));

    const runs = Array.isArray(suiteResult.runs) ? suiteResult.runs.filter(isRecord) : [];
    for (const run of runs) {
      const trajectory = isRecord(run.trajectory) ? run.trajectory : {};
      const scorecard = isRecord(run.scorecard) ? run.scorecard : {};
      const promotionGate = isRecord(run.promotion_gate) ? run.promotion_gate : {};
      const improvementCandidate = isRecord(run.improvement_candidate) ? run.improvement_candidate : {};

      addRef(groups.duration_refs, trajectory.duration_ref);
      groups.duration_refs.push(...stringList(trajectory.duration_refs));
      addRef(groups.cost_refs, trajectory.cost_ref);
      groups.cost_refs.push(...stringList(trajectory.cost_refs));
      addRef(groups.cache_hit_refs, trajectory.cache_hit_ref);
      groups.cache_hit_refs.push(...stringList(trajectory.cache_hit_refs));
      addRef(groups.reuse_scope_refs, trajectory.reuse_scope_ref);
      groups.reuse_scope_refs.push(...stringList(trajectory.reuse_scope_refs));
      addRef(groups.quality_floor_refs, scorecard.quality_floor_ref);
      groups.quality_floor_refs.push(...stringList(scorecard.quality_floor_refs));
      groups.no_forbidden_write_refs.push(...stringList(promotionGate.no_forbidden_write_proof_refs));
      groups.no_forbidden_write_refs.push(...stringList(promotionGate.no_forbidden_write_refs));
      addRef(groups.owner_route_refs, improvementCandidate.owner_route_ref);
      groups.owner_route_refs.push(...stringList(improvementCandidate.owner_route_refs));
      groups.owner_route_refs.push(...stringList(promotionGate.owner_or_human_gate_refs));
    }
  }

  return {
    duration_refs: unique(groups.duration_refs),
    cost_refs: unique(groups.cost_refs),
    cache_hit_refs: unique(groups.cache_hit_refs),
    reuse_scope_refs: unique(groups.reuse_scope_refs),
    quality_floor_refs: unique(groups.quality_floor_refs),
    no_forbidden_write_refs: unique(groups.no_forbidden_write_refs),
    owner_route_refs: unique(groups.owner_route_refs),
  };
}

function collectEfficiencyHandoffs(handoffRefs: JsonRecord[] = []): Required<AgentLabEfficiencyNonRegressionRefs> {
  const groups: Required<AgentLabEfficiencyNonRegressionRefs> = {
    duration_refs: [],
    cost_refs: [],
    cache_hit_refs: [],
    reuse_scope_refs: [],
    quality_floor_refs: [],
    no_forbidden_write_refs: [],
    owner_route_refs: [],
  };

  for (const handoff of handoffRefs) {
    const refs = collectEfficiencyHandoffRefs(handoff);
    groups.duration_refs.push(...refs.duration_refs);
    groups.cost_refs.push(...refs.cost_refs);
    groups.cache_hit_refs.push(...refs.cache_hit_refs);
    groups.reuse_scope_refs.push(...refs.reuse_scope_refs);
    groups.quality_floor_refs.push(...refs.quality_floor_refs);
    groups.no_forbidden_write_refs.push(...refs.no_forbidden_write_refs);
    groups.owner_route_refs.push(...refs.owner_route_refs);
  }

  return {
    duration_refs: unique(groups.duration_refs),
    cost_refs: unique(groups.cost_refs),
    cache_hit_refs: unique(groups.cache_hit_refs),
    reuse_scope_refs: unique(groups.reuse_scope_refs),
    quality_floor_refs: unique(groups.quality_floor_refs),
    no_forbidden_write_refs: unique(groups.no_forbidden_write_refs),
    owner_route_refs: unique(groups.owner_route_refs),
  };
}

export function buildAgentLabEfficiencyNonRegressionReadModel(
  input: AgentLabEfficiencyNonRegressionInput = {},
) {
  const suiteGroups = collectSuiteEfficiencyRefs(input.suiteResults);
  const handoffGroups = collectEfficiencyHandoffs(input.handoffRefs);
  const explicitRefs = input.explicitRefs ?? {};
  const evidenceGroups = {
    duration_refs: unique([
      ...suiteGroups.duration_refs,
      ...handoffGroups.duration_refs,
      ...stringList(explicitRefs.duration_refs),
    ]),
    cost_refs: unique([...suiteGroups.cost_refs, ...handoffGroups.cost_refs, ...stringList(explicitRefs.cost_refs)]),
    cache_hit_refs: unique([
      ...suiteGroups.cache_hit_refs,
      ...handoffGroups.cache_hit_refs,
      ...stringList(explicitRefs.cache_hit_refs),
    ]),
    reuse_scope_refs: unique([
      ...suiteGroups.reuse_scope_refs,
      ...handoffGroups.reuse_scope_refs,
      ...stringList(explicitRefs.reuse_scope_refs),
    ]),
    quality_floor_refs: unique([
      ...suiteGroups.quality_floor_refs,
      ...handoffGroups.quality_floor_refs,
      ...stringList(explicitRefs.quality_floor_refs),
    ]),
    no_forbidden_write_refs: unique([
      ...suiteGroups.no_forbidden_write_refs,
      ...handoffGroups.no_forbidden_write_refs,
      ...stringList(explicitRefs.no_forbidden_write_refs),
    ]),
    owner_route_refs: unique([
      ...suiteGroups.owner_route_refs,
      ...handoffGroups.owner_route_refs,
      ...stringList(explicitRefs.owner_route_refs),
    ]),
  };
  const missingGroups = REQUIRED_GROUPS.filter((group) => evidenceGroups[group].length === 0);
  const typedBlockers = missingGroups.map((group) => ({
    blocker_ref: `typed-blocker-ref:agent-lab/efficiency-nonregression-${group.replace(/_/g, '-')}-missing`,
    missing_group: group,
  }));
  const status = typedBlockers.length === 0 ? 'ready' : 'blocked';
  const suiteResultRefs = unique((input.suiteResults ?? []).map((result) =>
    textField(result, 'result_id') ?? textField(result, 'suite_id') ?? ''));

  return {
    surface_kind: 'opl_agent_lab_efficiency_nonregression_read_model',
    version: 'opl-agent-lab.v1.efficiency-nonregression',
    read_model_id: stableId('oaleff', [suiteResultRefs, evidenceGroups]),
    status,
    readiness_status: status,
    ready: status === 'ready',
    refs_only: true,
    suite_result_refs: suiteResultRefs,
    evidence_groups: evidenceGroups,
    typed_blockers: typedBlockers,
    summary: {
      source_suite_result_count: suiteResultRefs.length,
      evidence_group_count: REQUIRED_GROUPS.length,
      duration_ref_count: evidenceGroups.duration_refs.length,
      cost_ref_count: evidenceGroups.cost_refs.length,
      cache_hit_ref_count: evidenceGroups.cache_hit_refs.length,
      reuse_scope_ref_count: evidenceGroups.reuse_scope_refs.length,
      quality_floor_ref_count: evidenceGroups.quality_floor_refs.length,
      no_forbidden_write_ref_count: evidenceGroups.no_forbidden_write_refs.length,
      owner_route_ref_count: evidenceGroups.owner_route_refs.length,
      typed_blocker_count: typedBlockers.length,
    },
    authority_boundary: {
      ...AGENT_LAB_AUTHORITY_BOUNDARY,
      can_write_artifact_body: false,
      can_promote_default_agent: false,
    },
  };
}
