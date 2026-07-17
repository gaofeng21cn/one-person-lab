import {
  STANDARD_PROGRESS_DELTA_POLICY,
  STANDARD_TYPED_BLOCKER_LINEAGE_POLICY,
} from '../../../../src/modules/pack/standard-domain-agent-scaffold-constants.ts';

type JsonRecord = Record<string, unknown>;

function standardProgressFirstPolicies() {
  return {
    progress_delta_policy: STANDARD_PROGRESS_DELTA_POLICY,
    typed_blocker_lineage_policy: STANDARD_TYPED_BLOCKER_LINEAGE_POLICY,
  };
}

export function masScoutCohortLoopStageContractRefs() {
  return {
    cohort_query_refs: [{ ref_kind: 'json_pointer', ref: '/cohort_query/scout', role: 'cohort_query' }],
    trigger_refs: [{ ref_kind: 'queue_ref', ref: 'queue:mas/scout', role: 'launch_trigger' }],
    metric_refs: [{ ref_kind: 'metric_ref', ref: 'metric:mas/scout/freshness', role: 'cohort_metric' }],
  };
}

export function createMasScoutStage(overrides: JsonRecord = {}) {
  const baseStageContract = {
    requires: ['sources_ready'],
    ensures: ['plan_ready'],
    boundary_assumptions: ['domain_truth_remains_domain_owned'],
    properties: [],
    ...standardProgressFirstPolicies(),
    runtime_assumptions: [],
    monitor_refs: [],
    source_scope_refs: [{ ref_kind: 'json_pointer', ref: '/source_scope/scout', role: 'launch_source_scope' }],
    artifact_scope_refs: [],
    workspace_scope_refs: [],
  };
  const baseTrustBoundary = {
    lane: 'domain_agent',
    static_check_eligible: true,
    effect_boundary: false,
    records_runtime_events: false,
  };
  const has = (key: string) => Object.prototype.hasOwnProperty.call(overrides, key);

  return {
    stage_id: 'scout',
    stage_kind: 'planning',
    title: 'Scout',
    summary: 'Plan from explicit source refs.',
    goal: 'Prepare an admitted planning stage under MAS authority.',
    owner: 'med-autoscience',
    domain_stage_refs: ['scout'],
    inputs: [],
    knowledge_refs: [],
    skills: [],
    prompt_refs: [],
    allowed_action_refs: [],
    outputs: [],
    evaluation: [],
    handoff: null,
    source_refs: [],
    freshness: null,
    action_parity: null,
    ...overrides,
    stage_contract: has('stage_contract')
      ? { ...baseStageContract, ...(overrides.stage_contract as JsonRecord) }
      : baseStageContract,
    trust_boundary: has('trust_boundary')
      ? { ...baseTrustBoundary, ...(overrides.trust_boundary as JsonRecord) }
      : baseTrustBoundary,
    authority_boundary: has('authority_boundary')
      ? overrides.authority_boundary
      : { opl_role: 'projection_consumer_only', can_write_domain_truth: false },
  };
}

export function createMedAutoScienceStageManifest(baseManifest: JsonRecord, stages: unknown[]) {
  return {
    ...baseManifest,
    family_stage_control_plane: {
      surface_kind: 'family_stage_control_plane',
      version: 'family-stage-control-plane.v1',
      plane_id: 'med_autoscience_stage_control_plane',
      target_domain_id: 'med-autoscience',
      owner: 'med-autoscience',
      authority_boundary: { opl_role: 'projection_consumer_only' },
      stages,
      notes: [],
    },
  };
}
