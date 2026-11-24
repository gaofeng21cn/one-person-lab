export const FOUNDRY_PROTOCOL_VERSION = 'opl-foundry-protocol.v1' as const;

export type FoundryMode = 'create' | 'takeover' | 'improve';

export type FoundryRiskTier = 'low' | 'medium' | 'high';

export type EvaluationStatus = 'pass' | 'fail' | 'blocked';

export interface KnowledgeRequirement {
  requirement_id: string;
  scope_kind: 'product' | 'owner' | 'topic' | 'project';
  content_kind: 'mechanism' | 'policy' | 'state' | 'decision';
  semantic_owner_ref: string;
  source_modes: Array<'product' | 'workspace' | 'external'>;
  requirement: 'required' | 'optional';
  freshness_policy: string;
  writeback_owner_ref: string;
  derived_dependency_policy: string;
  action_critical: boolean;
}

export interface BaselineAdoptionRequest {
  surface_kind: 'opl_foundry_baseline_adoption_request';
  version: 'opl-foundry-baseline-adoption-request.v1';
  owner_authorization_ref: string;
  evidence_refs: string[];
  qualification_obligation_refs: string[];
}

export interface DesignRequest {
  surface_kind: 'opl_foundry_design_request';
  version: typeof FOUNDRY_PROTOCOL_VERSION;
  request_id: string;
  mode: FoundryMode;
  target_agent_id: string;
  target_domain_id: string;
  target_version_ref: string | null;
  objective: string;
  acceptance_criteria: string[];
  non_goals: string[];
  source_refs: string[];
  constraints: {
    capability_refs: string[];
    permission_refs: string[];
    privacy_requirements: string[];
    cost_limits: Record<string, number>;
    latency_limits: Record<string, number>;
  };
  delivery_policy: {
    activation_mode: 'qualify_only' | 'activate';
    max_generations: number;
  };
  baseline_adoption?: BaselineAdoptionRequest;
}

export interface EvalSpec {
  eval_spec_id: string;
  public_cases: Array<{
    case_id: string;
    test_ref: string;
    weight: number;
    required: boolean;
  }>;
  protected_requirements: Array<{
    category: string;
    minimum_case_count: number;
  }>;
  gates: Array<{
    gate_id: string;
    metric: string;
    operator: 'gte' | 'lte' | 'eq';
    threshold: number;
    required: boolean;
  }>;
  baseline_comparison: {
    required: boolean;
    regression_tolerance: number;
  };
  independent_evaluator_required: true;
}

export interface AgentBlueprint {
  surface_kind: 'opl_foundry_agent_blueprint';
  version: typeof FOUNDRY_PROTOCOL_VERSION;
  blueprint_id: string;
  target_agent_id: string;
  target_domain_id: string;
  target_version_ref: string | null;
  design_request_digest: string;
  generation: number;
  stage_graph: {
    entry_stage_id: string;
    stages: Array<{
      stage_id: string;
      stage_kind: string;
      goal: string;
      input_artifact_types: string[];
      output_artifact_types: string[];
      prompt_ref: string;
      skill_refs: string[];
      knowledge_refs: string[];
      capability_refs: string[];
      next_stage_ids: string[];
    }>;
  };
  actions: Array<{
    action_id: string;
    summary: string;
    entry_stage_id: string;
    input_schema_ref: string;
    output_schema_ref: string;
  }>;
  artifact_contracts: Array<{
    artifact_type: string;
    schema_ref: string;
    authority_owner_ref: string;
  }>;
  content_refs: {
    prompt_refs: string[];
    skill_refs: string[];
    knowledge_refs: string[];
    helper_refs: string[];
    model_refs: string[];
    tool_refs: string[];
    schema_refs: string[];
  };
  capability_requirements: string[];
  authority_policy: {
    truth_owner_ref: string;
    artifact_owner_ref: string;
    quality_owner_ref: string;
    permission_refs: string[];
    generated_agent_can_modify_versions: false;
    generated_agent_can_modify_evaluation: false;
    generated_agent_can_modify_permissions: false;
    generated_agent_can_modify_activation: false;
  };
  memory_policy: {
    memory_classes: string[];
    retention_refs: string[];
    write_authority_refs: string[];
    knowledge_requirements: KnowledgeRequirement[];
  };
  assumptions: string[];
  design_evidence_refs: string[];
  eval_spec: EvalSpec;
  risk_hint: FoundryRiskTier;
}

export interface EvidenceBundle {
  surface_kind: 'opl_foundry_evidence_bundle';
  version: typeof FOUNDRY_PROTOCOL_VERSION;
  evidence_id: string;
  target_agent_id: string;
  target_domain_id: string;
  target_version_ref: string | null;
  blueprint_digest: string;
  candidate_digest: string;
  baseline_version_digest: string | null;
  frozen_test_plan_digest: string;
  public_results: Array<{
    case_id: string;
    status: EvaluationStatus;
    score: number;
    evidence_refs: string[];
  }>;
  baseline_public_results: Array<{
    case_id: string;
    status: EvaluationStatus;
    score: number;
    evidence_refs: string[];
  }> | null;
  baseline_protected_aggregates: Array<{
    category: string;
    total: number;
    passed: number;
    failed: number;
    score: number;
  }> | null;
  protected_aggregates: Array<{
    category: string;
    total: number;
    passed: number;
    failed: number;
    score: number;
  }>;
  independent_review: {
    evaluator_ref: string;
    evaluation_execution_ref: string;
    review_execution_ref: string;
    verdict: EvaluationStatus;
    findings: string[];
    evidence_refs: string[];
  };
  candidate_cost_observations: Record<string, number>;
  candidate_latency_observations: Record<string, number>;
  safety_observations: Array<{
    observation_id: string;
    event_type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    evidence_refs: string[];
  }>;
  safety_delta: Record<string, number>;
  cost_delta: Record<string, number>;
  latency_delta: Record<string, number>;
  failure_classification: Array<{
    failure_class: string;
    gate_id: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    evidence_refs: string[];
  }>;
  qualified: boolean;
  gate_score: number;
  provenance: {
    foundry_run_id: string;
    generation: number;
    producer_id: string;
    evaluated_at: string;
    source_refs: string[];
  };
}

export interface EvolutionProposal {
  surface_kind: 'opl_foundry_evolution_proposal';
  version: typeof FOUNDRY_PROTOCOL_VERSION;
  proposal_id: string;
  target_agent_id: string;
  target_domain_id: string;
  target_version_ref: string | null;
  blueprint_digest: string;
  evidence_digest: string;
  root_causes: Array<{
    failure_class: string;
    explanation: string;
    evidence_refs: string[];
  }>;
  next_blueprint: AgentBlueprint;
  semantic_diff: Array<{
    operation: 'add' | 'replace' | 'remove';
    semantic_path: string;
    rationale: string;
  }>;
  expected_benefits: string[];
  new_tests: Array<{
    case_id: string;
    test_ref: string;
    rationale: string;
  }>;
  trade_offs: string[];
  risk_hints: FoundryRiskTier[];
}
