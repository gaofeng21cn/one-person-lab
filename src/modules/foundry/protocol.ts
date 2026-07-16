import crypto from 'node:crypto';

import { canonicalJsonText } from '../../kernel/canonical-json.ts';
import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';

export const FOUNDRY_PROTOCOL_VERSION = 'opl-foundry-protocol.v1' as const;

export type FoundryMode = 'create' | 'takeover' | 'improve';
export type FoundryRiskTier = 'low' | 'medium' | 'high';
export type EvaluationStatus = 'pass' | 'fail' | 'blocked';

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

const FORBIDDEN_FIELD_NAMES = new Set([
  'repo_path',
  'repo_dir',
  'repo_root',
  'repository_path',
  'file_path',
  'worktree',
  'worktree_path',
  'branch',
  'branch_name',
  'cli',
  'command',
  'commands',
  'queue',
  'queue_id',
  'lease',
  'lease_id',
  'attempt',
  'attempt_id',
  'overwrite_policy',
  'promotion_ledger',
  'hidden_test_body',
  'hidden_test_bodies',
  'protected_test_body',
  'protected_test_bodies',
  'protected_case_body',
  'protected_case_bodies',
  'patch',
  'patches',
  'work_order',
  'work_orders',
]);

function fail(message: string, details: Record<string, unknown> = {}): never {
  throw new FrameworkContractError('contract_shape_invalid', message, details);
}

function requiredString(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) fail(`${field} must be a non-empty string.`, { field });
  return value.trim();
}

function requiredStringList(value: unknown, field: string) {
  if (!Array.isArray(value)) fail(`${field} must be an array.`, { field });
  return value.map((entry, index) => requiredString(entry, `${field}[${index}]`));
}

function requiredUniqueStringList(value: unknown, field: string, minimumItems = 0) {
  const entries = requiredStringList(value, field);
  if (entries.length < minimumItems) fail(`${field} must contain at least ${minimumItems} item(s).`, { field });
  if (new Set(entries).size !== entries.length) fail(`${field} must contain unique values.`, { field });
  return entries;
}

function assertExactKeys(value: Record<string, unknown>, field: string, keys: readonly string[]) {
  const allowed = new Set(keys);
  const missing = keys.filter((key) => !Object.hasOwn(value, key));
  const unexpected = Object.keys(value).filter((key) => !allowed.has(key));
  if (missing.length > 0 || unexpected.length > 0) {
    fail(`${field} must use the closed protocol shape.`, { field, missing, unexpected });
  }
}

function assertNumericMap(value: unknown, field: string) {
  if (!isRecord(value)) fail(`${field} must be an object.`, { field });
  for (const [key, entry] of Object.entries(value)) {
    if (!key.trim() || !Number.isFinite(entry)) fail(`${field}.${key} must be a finite number.`, { field, key });
  }
}

function assertNonNegativeNumericMap(value: unknown, field: string) {
  assertNumericMap(value, field);
  for (const [key, entry] of Object.entries(value as Record<string, number>)) {
    if (entry < 0) fail(`${field}.${key} must be a non-negative limit.`, { field, key });
  }
}

function assertDateTime(value: unknown, field: string) {
  const text = requiredString(value, field);
  if (Number.isNaN(Date.parse(text))) fail(`${field} must be an RFC 3339 date-time.`, { field });
}

function assertDigest(value: unknown, field: string) {
  const digest = requiredString(value, field);
  if (!/^sha256:[a-f0-9]{64}$/.test(digest)) fail(`${field} must be a SHA-256 content digest.`, { field });
  return digest;
}

function looksLikePhysicalPath(value: string) {
  return value.startsWith('/')
    || value.startsWith('./')
    || value.startsWith('../')
    || value.startsWith('file:')
    || /^[A-Za-z]:[\\/]/.test(value);
}

function scanForbidden(value: unknown, at: string, violations: string[]) {
  if (typeof value === 'string') {
    const normalized = value.trim();
    if (!at.endsWith('/semantic_path') && looksLikePhysicalPath(normalized)) {
      violations.push(`${at}:physical_path`);
    }
    if (normalized.toLowerCase().startsWith('attempt:')) violations.push(`${at}:forbidden_attempt_ref`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => scanForbidden(entry, `${at}/${index}`, violations));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, entry] of Object.entries(value)) {
    const normalizedKey = key
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .replace(/-/g, '_')
      .toLowerCase();
    if (FORBIDDEN_FIELD_NAMES.has(normalizedKey) || normalizedKey.split('_').includes('attempt')) {
      violations.push(`${at}/${key}:forbidden_field`);
    }
    scanForbidden(entry, `${at}/${key}`, violations);
  }
}

export function assertFoundryProtocolPurity(value: unknown, label: string) {
  const violations: string[] = [];
  scanForbidden(value, '$', violations);
  if (violations.length > 0) {
    fail(`${label} crosses the Foundry semantic protocol boundary.`, { violations });
  }
}

function assertIdentity(value: Record<string, unknown>, label: string) {
  requiredString(value.target_agent_id, `${label}.target_agent_id`);
  requiredString(value.target_domain_id, `${label}.target_domain_id`);
  if (value.target_version_ref !== null) assertDigest(value.target_version_ref, `${label}.target_version_ref`);
}

function assertBase(value: unknown, surfaceKind: string, label: string): Record<string, unknown> {
  if (!isRecord(value)) fail(`${label} must be an object.`);
  if (value.surface_kind !== surfaceKind) fail(`${label}.surface_kind must be ${surfaceKind}.`);
  if (value.version !== FOUNDRY_PROTOCOL_VERSION) fail(`${label}.version must be ${FOUNDRY_PROTOCOL_VERSION}.`);
  assertIdentity(value, label);
  assertFoundryProtocolPurity(value, label);
  return value;
}

export function validateDesignRequest(value: unknown): DesignRequest {
  const input = assertBase(value, 'opl_foundry_design_request', 'DesignRequest');
  assertExactKeys(input, 'DesignRequest', [
    'surface_kind',
    'version',
    'request_id',
    'mode',
    'target_agent_id',
    'target_domain_id',
    'target_version_ref',
    'objective',
    'acceptance_criteria',
    'non_goals',
    'source_refs',
    'constraints',
    'delivery_policy',
  ]);
  if (!['create', 'takeover', 'improve'].includes(String(input.mode))) fail('DesignRequest.mode is invalid.');
  if (input.mode === 'create' && input.target_version_ref !== null) {
    fail('Create DesignRequest must not bind a target version.');
  }
  if (input.mode !== 'create' && input.target_version_ref === null) {
    fail('Takeover and improve DesignRequest must bind an exact target version digest.');
  }
  requiredString(input.request_id, 'DesignRequest.request_id');
  requiredString(input.objective, 'DesignRequest.objective');
  requiredUniqueStringList(input.acceptance_criteria, 'DesignRequest.acceptance_criteria');
  requiredUniqueStringList(input.non_goals, 'DesignRequest.non_goals');
  requiredUniqueStringList(input.source_refs, 'DesignRequest.source_refs');
  if (!isRecord(input.constraints)) fail('DesignRequest.constraints must be an object.');
  assertExactKeys(input.constraints, 'DesignRequest.constraints', [
    'capability_refs',
    'permission_refs',
    'privacy_requirements',
    'cost_limits',
    'latency_limits',
  ]);
  requiredUniqueStringList(input.constraints.capability_refs, 'DesignRequest.constraints.capability_refs');
  requiredUniqueStringList(input.constraints.permission_refs, 'DesignRequest.constraints.permission_refs');
  requiredUniqueStringList(input.constraints.privacy_requirements, 'DesignRequest.constraints.privacy_requirements');
  assertNonNegativeNumericMap(input.constraints.cost_limits, 'DesignRequest.constraints.cost_limits');
  assertNonNegativeNumericMap(input.constraints.latency_limits, 'DesignRequest.constraints.latency_limits');
  if (!isRecord(input.delivery_policy)) fail('DesignRequest.delivery_policy must be an object.');
  assertExactKeys(input.delivery_policy, 'DesignRequest.delivery_policy', ['activation_mode', 'max_generations']);
  if (!['qualify_only', 'activate'].includes(String(input.delivery_policy.activation_mode))) {
    fail('DesignRequest.delivery_policy.activation_mode is invalid.');
  }
  const maxGenerations = input.delivery_policy.max_generations;
  if (!Number.isInteger(maxGenerations) || Number(maxGenerations) < 1 || Number(maxGenerations) > 5) {
    fail('DesignRequest.delivery_policy.max_generations must be an integer from 1 to 5.');
  }
  return input as unknown as DesignRequest;
}

function validateEvalSpec(value: unknown, label: string) {
  if (!isRecord(value)) fail(`${label} must be an object.`);
  assertExactKeys(value, label, [
    'eval_spec_id',
    'public_cases',
    'protected_requirements',
    'gates',
    'baseline_comparison',
    'independent_evaluator_required',
  ]);
  requiredString(value.eval_spec_id, `${label}.eval_spec_id`);
  if (!Array.isArray(value.public_cases) || !Array.isArray(value.protected_requirements) || !Array.isArray(value.gates)) {
    fail(`${label} must declare public_cases, protected_requirements, and gates arrays.`);
  }
  const publicCaseIds = value.public_cases.map((entry, index) => {
    if (!isRecord(entry)) fail(`${label}.public_cases[${index}] must be an object.`);
    assertExactKeys(entry, `${label}.public_cases[${index}]`, ['case_id', 'test_ref', 'weight', 'required']);
    const caseId = requiredString(entry.case_id, `${label}.public_cases[${index}].case_id`);
    requiredString(entry.test_ref, `${label}.public_cases[${index}].test_ref`);
    if (!Number.isFinite(entry.weight) || Number(entry.weight) < 0 || typeof entry.required !== 'boolean') {
      fail(`${label}.public_cases[${index}] has invalid weight or required fields.`);
    }
    return caseId;
  });
  if (new Set(publicCaseIds).size !== publicCaseIds.length) fail(`${label}.public_cases case ids must be unique.`);
  if (value.public_cases.reduce((sum, entry) => sum + Number((entry as Record<string, unknown>).weight), 0) <= 0) {
    fail(`${label}.public_cases must have positive total weight.`);
  }
  const protectedCategories = value.protected_requirements.map((entry, index) => {
    if (!isRecord(entry)) fail(`${label}.protected_requirements[${index}] must be an object.`);
    assertExactKeys(entry, `${label}.protected_requirements[${index}]`, ['category', 'minimum_case_count']);
    const category = requiredString(entry.category, `${label}.protected_requirements[${index}].category`);
    if (!Number.isSafeInteger(entry.minimum_case_count) || Number(entry.minimum_case_count) < 1) {
      fail(`${label}.protected_requirements[${index}].minimum_case_count must be a positive integer.`);
    }
    return category;
  });
  if (new Set(protectedCategories).size !== protectedCategories.length) {
    fail(`${label}.protected_requirements categories must be unique.`);
  }
  const gateIds = value.gates.map((entry, index) => {
    if (!isRecord(entry)) fail(`${label}.gates[${index}] must be an object.`);
    assertExactKeys(entry, `${label}.gates[${index}]`, ['gate_id', 'metric', 'operator', 'threshold', 'required']);
    const gateId = requiredString(entry.gate_id, `${label}.gates[${index}].gate_id`);
    requiredString(entry.metric, `${label}.gates[${index}].metric`);
    if (!['gte', 'lte', 'eq'].includes(String(entry.operator))) fail(`${label}.gates[${index}].operator is invalid.`);
    if (!Number.isFinite(entry.threshold) || typeof entry.required !== 'boolean') {
      fail(`${label}.gates[${index}] has invalid threshold or required fields.`);
    }
    return gateId;
  });
  if (gateIds.length === 0 || new Set(gateIds).size !== gateIds.length) {
    fail(`${label}.gates must contain unique gate ids.`);
  }
  if (!isRecord(value.baseline_comparison)
    || typeof value.baseline_comparison.required !== 'boolean'
    || !Number.isFinite(value.baseline_comparison.regression_tolerance)
    || Number(value.baseline_comparison.regression_tolerance) < 0) {
    fail(`${label}.baseline_comparison is invalid.`);
  }
  assertExactKeys(value.baseline_comparison, `${label}.baseline_comparison`, ['required', 'regression_tolerance']);
  if (value.independent_evaluator_required !== true) fail(`${label}.independent_evaluator_required must be true.`);
}

function validatePublicResults(value: unknown, label: string) {
  if (!Array.isArray(value)) fail(`${label} must be an array.`);
  for (const [index, entry] of value.entries()) {
    if (!isRecord(entry)) fail(`${label}[${index}] must be an object.`);
    assertExactKeys(entry, `${label}[${index}]`, ['case_id', 'status', 'score', 'evidence_refs']);
    requiredString(entry.case_id, `${label}[${index}].case_id`);
    if (!['pass', 'fail', 'blocked'].includes(String(entry.status))) fail(`${label}[${index}].status is invalid.`);
    if (!Number.isFinite(entry.score) || Number(entry.score) < 0 || Number(entry.score) > 1) {
      fail(`${label}[${index}].score must be a finite number from 0 to 1.`);
    }
    requiredUniqueStringList(entry.evidence_refs, `${label}[${index}].evidence_refs`, 1);
  }
}

function validateProtectedAggregates(value: unknown, label: string) {
  if (!Array.isArray(value)) fail(`${label} must be an array.`);
  for (const [index, entry] of value.entries()) {
    if (!isRecord(entry)) fail(`${label}[${index}] must be an object.`);
    assertExactKeys(entry, `${label}[${index}]`, ['category', 'total', 'passed', 'failed', 'score']);
    requiredString(entry.category, `${label}[${index}].category`);
    for (const field of ['total', 'passed', 'failed'] as const) {
      if (!Number.isSafeInteger(entry[field]) || Number(entry[field]) < 0) {
        fail(`${label}[${index}].${field} must be a non-negative integer.`);
      }
    }
    if (Number(entry.passed) + Number(entry.failed) !== Number(entry.total)) {
      fail(`${label}[${index}] counts must sum to total.`);
    }
    if (!Number.isFinite(entry.score) || Number(entry.score) < 0 || Number(entry.score) > 1) {
      fail(`${label}[${index}].score must be a finite number from 0 to 1.`);
    }
  }
  const categories = value.map((entry) => (entry as Record<string, unknown>).category);
  if (new Set(categories).size !== categories.length) fail(`${label} categories must be unique.`);
}

export function validateAgentBlueprint(value: unknown): AgentBlueprint {
  const input = assertBase(value, 'opl_foundry_agent_blueprint', 'AgentBlueprint');
  assertExactKeys(input, 'AgentBlueprint', [
    'surface_kind',
    'version',
    'blueprint_id',
    'target_agent_id',
    'target_domain_id',
    'target_version_ref',
    'design_request_digest',
    'generation',
    'stage_graph',
    'actions',
    'artifact_contracts',
    'content_refs',
    'capability_requirements',
    'authority_policy',
    'memory_policy',
    'assumptions',
    'design_evidence_refs',
    'eval_spec',
    'risk_hint',
  ]);
  requiredString(input.blueprint_id, 'AgentBlueprint.blueprint_id');
  assertDigest(input.design_request_digest, 'AgentBlueprint.design_request_digest');
  if (!Number.isInteger(input.generation) || Number(input.generation) < 0) fail('AgentBlueprint.generation is invalid.');
  if (!isRecord(input.stage_graph) || !Array.isArray(input.stage_graph.stages)) fail('AgentBlueprint.stage_graph is invalid.');
  const entry = requiredString(input.stage_graph.entry_stage_id, 'AgentBlueprint.stage_graph.entry_stage_id');
  assertExactKeys(input.stage_graph, 'AgentBlueprint.stage_graph', ['entry_stage_id', 'stages']);
  const stageIds = input.stage_graph.stages.map((stage, index) => {
    if (!isRecord(stage)) fail(`AgentBlueprint.stage_graph.stages[${index}] must be an object.`);
    const label = `AgentBlueprint.stage_graph.stages[${index}]`;
    assertExactKeys(stage, label, [
      'stage_id',
      'stage_kind',
      'goal',
      'input_artifact_types',
      'output_artifact_types',
      'prompt_ref',
      'skill_refs',
      'knowledge_refs',
      'capability_refs',
      'next_stage_ids',
    ]);
    const stageId = requiredString(stage.stage_id, `${label}.stage_id`);
    requiredString(stage.stage_kind, `${label}.stage_kind`);
    requiredString(stage.goal, `${label}.goal`);
    requiredUniqueStringList(stage.input_artifact_types, `${label}.input_artifact_types`);
    requiredUniqueStringList(stage.output_artifact_types, `${label}.output_artifact_types`);
    requiredString(stage.prompt_ref, `${label}.prompt_ref`);
    requiredUniqueStringList(stage.skill_refs, `${label}.skill_refs`);
    requiredUniqueStringList(stage.knowledge_refs, `${label}.knowledge_refs`);
    requiredUniqueStringList(stage.capability_refs, `${label}.capability_refs`);
    requiredUniqueStringList(stage.next_stage_ids, `${label}.next_stage_ids`);
    return stageId;
  });
  if (stageIds.length === 0 || !stageIds.includes(entry) || new Set(stageIds).size !== stageIds.length) {
    fail('AgentBlueprint.stage_graph must contain one unique entry stage.');
  }
  for (const [index, stage] of input.stage_graph.stages.entries()) {
    for (const nextStageId of (stage as Record<string, unknown>).next_stage_ids as string[]) {
      if (!stageIds.includes(nextStageId)) fail(`AgentBlueprint.stage_graph.stages[${index}] references an unknown next Stage.`);
    }
  }
  if (!Array.isArray(input.actions) || input.actions.length === 0) fail('AgentBlueprint.actions must not be empty.');
  const actionIds = input.actions.map((action, index) => {
    if (!isRecord(action)) fail(`AgentBlueprint.actions[${index}] must be an object.`);
    const label = `AgentBlueprint.actions[${index}]`;
    assertExactKeys(action, label, ['action_id', 'summary', 'entry_stage_id', 'input_schema_ref', 'output_schema_ref']);
    const actionId = requiredString(action.action_id, `${label}.action_id`);
    requiredString(action.summary, `${label}.summary`);
    const actionEntryStageId = requiredString(action.entry_stage_id, `${label}.entry_stage_id`);
    if (!stageIds.includes(actionEntryStageId)) fail(`${label}.entry_stage_id references an unknown Stage.`);
    requiredString(action.input_schema_ref, `${label}.input_schema_ref`);
    requiredString(action.output_schema_ref, `${label}.output_schema_ref`);
    return actionId;
  });
  if (new Set(actionIds).size !== actionIds.length) fail('AgentBlueprint action ids must be unique.');
  if (!Array.isArray(input.artifact_contracts)) fail('AgentBlueprint.artifact_contracts must be an array.');
  const artifactTypes = input.artifact_contracts.map((artifact, index) => {
    if (!isRecord(artifact)) fail(`AgentBlueprint.artifact_contracts[${index}] must be an object.`);
    const label = `AgentBlueprint.artifact_contracts[${index}]`;
    assertExactKeys(artifact, label, ['artifact_type', 'schema_ref', 'authority_owner_ref']);
    const artifactType = requiredString(artifact.artifact_type, `${label}.artifact_type`);
    requiredString(artifact.schema_ref, `${label}.schema_ref`);
    requiredString(artifact.authority_owner_ref, `${label}.authority_owner_ref`);
    return artifactType;
  });
  if (new Set(artifactTypes).size !== artifactTypes.length) fail('AgentBlueprint artifact types must be unique.');
  if (!isRecord(input.content_refs) || !isRecord(input.authority_policy) || !isRecord(input.memory_policy)) {
    fail('AgentBlueprint content, authority, and memory policies are required.');
  }
  assertExactKeys(input.content_refs, 'AgentBlueprint.content_refs', [
    'prompt_refs',
    'skill_refs',
    'knowledge_refs',
    'helper_refs',
    'model_refs',
    'tool_refs',
    'schema_refs',
  ]);
  const contentRefs = {
    prompt_refs: requiredUniqueStringList(input.content_refs.prompt_refs, 'AgentBlueprint.content_refs.prompt_refs'),
    skill_refs: requiredUniqueStringList(input.content_refs.skill_refs, 'AgentBlueprint.content_refs.skill_refs'),
    knowledge_refs: requiredUniqueStringList(input.content_refs.knowledge_refs, 'AgentBlueprint.content_refs.knowledge_refs'),
    helper_refs: requiredUniqueStringList(input.content_refs.helper_refs, 'AgentBlueprint.content_refs.helper_refs'),
    model_refs: requiredUniqueStringList(input.content_refs.model_refs, 'AgentBlueprint.content_refs.model_refs'),
    tool_refs: requiredUniqueStringList(input.content_refs.tool_refs, 'AgentBlueprint.content_refs.tool_refs'),
    schema_refs: requiredUniqueStringList(input.content_refs.schema_refs, 'AgentBlueprint.content_refs.schema_refs'),
  };
  for (const [index, schemaRef] of contentRefs.schema_refs.entries()) {
    if (!/^opl-content:\/\/sha256\/[a-f0-9]{64}$/.test(schemaRef)) {
      fail(`AgentBlueprint.content_refs.schema_refs[${index}] must be an exact opl-content ref.`);
    }
  }
  for (const [index, action] of input.actions.entries()) {
    const record = action as Record<string, unknown>;
    for (const field of ['input_schema_ref', 'output_schema_ref'] as const) {
      if (!contentRefs.schema_refs.includes(String(record[field]))) {
        fail(`AgentBlueprint.actions[${index}].${field} is not declared in content_refs.schema_refs.`);
      }
    }
  }
  for (const [index, artifact] of input.artifact_contracts.entries()) {
    const schemaRef = String((artifact as Record<string, unknown>).schema_ref);
    if (!contentRefs.schema_refs.includes(schemaRef)) {
      fail(`AgentBlueprint.artifact_contracts[${index}].schema_ref is not declared in content_refs.schema_refs.`);
    }
  }
  const capabilityRequirements = requiredUniqueStringList(
    input.capability_requirements,
    'AgentBlueprint.capability_requirements',
  );
  for (const [index, stage] of input.stage_graph.stages.entries()) {
    const record = stage as Record<string, unknown>;
    if (!contentRefs.prompt_refs.includes(String(record.prompt_ref))) {
      fail(`AgentBlueprint.stage_graph.stages[${index}].prompt_ref is not declared in content_refs.prompt_refs.`);
    }
    for (const [field, declared] of [
      ['skill_refs', contentRefs.skill_refs],
      ['knowledge_refs', contentRefs.knowledge_refs],
      ['capability_refs', capabilityRequirements],
    ] as const) {
      for (const ref of record[field] as string[]) {
        if (!declared.includes(ref)) fail(`AgentBlueprint.stage_graph.stages[${index}].${field} contains an undeclared ref.`);
      }
    }
  }
  assertExactKeys(input.authority_policy, 'AgentBlueprint.authority_policy', [
    'truth_owner_ref',
    'artifact_owner_ref',
    'quality_owner_ref',
    'permission_refs',
    'generated_agent_can_modify_versions',
    'generated_agent_can_modify_evaluation',
    'generated_agent_can_modify_permissions',
    'generated_agent_can_modify_activation',
  ]);
  requiredString(input.authority_policy.truth_owner_ref, 'AgentBlueprint.authority_policy.truth_owner_ref');
  requiredString(input.authority_policy.artifact_owner_ref, 'AgentBlueprint.authority_policy.artifact_owner_ref');
  requiredString(input.authority_policy.quality_owner_ref, 'AgentBlueprint.authority_policy.quality_owner_ref');
  requiredUniqueStringList(input.authority_policy.permission_refs, 'AgentBlueprint.authority_policy.permission_refs');
  for (const field of ['generated_agent_can_modify_versions', 'generated_agent_can_modify_evaluation', 'generated_agent_can_modify_permissions', 'generated_agent_can_modify_activation']) {
    if (input.authority_policy[field] !== false) fail(`AgentBlueprint.authority_policy.${field} must be false.`);
  }
  assertExactKeys(input.memory_policy, 'AgentBlueprint.memory_policy', [
    'memory_classes',
    'retention_refs',
    'write_authority_refs',
  ]);
  requiredUniqueStringList(input.memory_policy.memory_classes, 'AgentBlueprint.memory_policy.memory_classes');
  requiredUniqueStringList(input.memory_policy.retention_refs, 'AgentBlueprint.memory_policy.retention_refs');
  requiredUniqueStringList(input.memory_policy.write_authority_refs, 'AgentBlueprint.memory_policy.write_authority_refs');
  requiredUniqueStringList(input.assumptions, 'AgentBlueprint.assumptions');
  requiredUniqueStringList(input.design_evidence_refs, 'AgentBlueprint.design_evidence_refs');
  validateEvalSpec(input.eval_spec, 'AgentBlueprint.eval_spec');
  if (!['low', 'medium', 'high'].includes(String(input.risk_hint))) fail('AgentBlueprint.risk_hint is invalid.');
  return input as unknown as AgentBlueprint;
}

export function validateEvidenceBundle(value: unknown): EvidenceBundle {
  const input = assertBase(value, 'opl_foundry_evidence_bundle', 'EvidenceBundle');
  assertExactKeys(input, 'EvidenceBundle', [
    'surface_kind',
    'version',
    'evidence_id',
    'target_agent_id',
    'target_domain_id',
    'target_version_ref',
    'blueprint_digest',
    'candidate_digest',
    'baseline_version_digest',
    'frozen_test_plan_digest',
    'public_results',
    'baseline_public_results',
    'baseline_protected_aggregates',
    'protected_aggregates',
    'independent_review',
    'candidate_cost_observations',
    'candidate_latency_observations',
    'safety_observations',
    'safety_delta',
    'cost_delta',
    'latency_delta',
    'failure_classification',
    'qualified',
    'gate_score',
    'provenance',
  ]);
  requiredString(input.evidence_id, 'EvidenceBundle.evidence_id');
  assertDigest(input.blueprint_digest, 'EvidenceBundle.blueprint_digest');
  assertDigest(input.candidate_digest, 'EvidenceBundle.candidate_digest');
  if (input.baseline_version_digest !== null) assertDigest(input.baseline_version_digest, 'EvidenceBundle.baseline_version_digest');
  assertDigest(input.frozen_test_plan_digest, 'EvidenceBundle.frozen_test_plan_digest');
  validatePublicResults(input.public_results, 'EvidenceBundle.public_results');
  if ((input.public_results as unknown[]).length === 0) fail('EvidenceBundle.public_results must not be empty.');
  if (input.baseline_public_results !== null) {
    validatePublicResults(input.baseline_public_results, 'EvidenceBundle.baseline_public_results');
    if ((input.baseline_public_results as unknown[]).length === 0) {
      fail('EvidenceBundle.baseline_public_results must not be empty when present.');
    }
  }
  validateProtectedAggregates(input.protected_aggregates, 'EvidenceBundle.protected_aggregates');
  if (input.baseline_protected_aggregates !== null) {
    validateProtectedAggregates(
      input.baseline_protected_aggregates,
      'EvidenceBundle.baseline_protected_aggregates',
    );
  }
  const baselinePresent = input.baseline_version_digest !== null;
  if (
    baselinePresent !== (input.baseline_public_results !== null)
    || baselinePresent !== (input.baseline_protected_aggregates !== null)
  ) {
    fail(
      'EvidenceBundle baseline version, public results, and protected aggregates must be present or null together.',
    );
  }
  if (!isRecord(input.independent_review)) fail('EvidenceBundle.independent_review is required.');
  assertExactKeys(input.independent_review, 'EvidenceBundle.independent_review', [
    'evaluator_ref',
    'evaluation_execution_ref',
    'review_execution_ref',
    'verdict',
    'findings',
    'evidence_refs',
  ]);
  requiredString(input.independent_review.evaluator_ref, 'EvidenceBundle.independent_review.evaluator_ref');
  requiredString(input.independent_review.evaluation_execution_ref, 'EvidenceBundle.independent_review.evaluation_execution_ref');
  requiredString(input.independent_review.review_execution_ref, 'EvidenceBundle.independent_review.review_execution_ref');
  if (input.independent_review.evaluation_execution_ref === input.independent_review.review_execution_ref) {
    fail('EvidenceBundle evaluation and independent review must use different executions.');
  }
  if (!['pass', 'fail', 'blocked'].includes(String(input.independent_review.verdict))) {
    fail('EvidenceBundle.independent_review.verdict is invalid.');
  }
  requiredUniqueStringList(input.independent_review.findings, 'EvidenceBundle.independent_review.findings');
  requiredUniqueStringList(input.independent_review.evidence_refs, 'EvidenceBundle.independent_review.evidence_refs', 1);
  assertNonNegativeNumericMap(
    input.candidate_cost_observations,
    'EvidenceBundle.candidate_cost_observations',
  );
  assertNonNegativeNumericMap(
    input.candidate_latency_observations,
    'EvidenceBundle.candidate_latency_observations',
  );
  if (!Array.isArray(input.safety_observations)) {
    fail('EvidenceBundle.safety_observations must be an array.');
  }
  const safetyObservationIds = input.safety_observations.map((entry, index) => {
    if (!isRecord(entry)) fail(`EvidenceBundle.safety_observations[${index}] must be an object.`);
    const label = `EvidenceBundle.safety_observations[${index}]`;
    assertExactKeys(entry, label, ['observation_id', 'event_type', 'severity', 'evidence_refs']);
    const observationId = requiredString(entry.observation_id, `${label}.observation_id`);
    requiredString(entry.event_type, `${label}.event_type`);
    if (!['low', 'medium', 'high', 'critical'].includes(String(entry.severity))) {
      fail(`${label}.severity is invalid.`);
    }
    requiredUniqueStringList(entry.evidence_refs, `${label}.evidence_refs`, 1);
    return observationId;
  });
  if (new Set(safetyObservationIds).size !== safetyObservationIds.length) {
    fail('EvidenceBundle.safety_observations observation ids must be unique.');
  }
  assertNumericMap(input.safety_delta, 'EvidenceBundle.safety_delta');
  assertNumericMap(input.cost_delta, 'EvidenceBundle.cost_delta');
  assertNumericMap(input.latency_delta, 'EvidenceBundle.latency_delta');
  if (!Array.isArray(input.failure_classification)) fail('EvidenceBundle.failure_classification must be an array.');
  for (const [index, entry] of input.failure_classification.entries()) {
    if (!isRecord(entry)) fail(`EvidenceBundle.failure_classification[${index}] must be an object.`);
    const label = `EvidenceBundle.failure_classification[${index}]`;
    assertExactKeys(entry, label, ['failure_class', 'gate_id', 'severity', 'evidence_refs']);
    requiredString(entry.failure_class, `${label}.failure_class`);
    requiredString(entry.gate_id, `${label}.gate_id`);
    if (!['low', 'medium', 'high', 'critical'].includes(String(entry.severity))) {
      fail(`${label}.severity is invalid.`);
    }
    requiredUniqueStringList(entry.evidence_refs, `${label}.evidence_refs`);
  }
  if (typeof input.qualified !== 'boolean'
    || !Number.isFinite(input.gate_score)
    || Number(input.gate_score) < 0
    || Number(input.gate_score) > 1) {
    fail('EvidenceBundle qualification fields are invalid.');
  }
  if (!isRecord(input.provenance)
    || !Number.isSafeInteger(input.provenance.generation)
    || Number(input.provenance.generation) < 0) {
    fail('EvidenceBundle.provenance is required.');
  }
  assertExactKeys(input.provenance, 'EvidenceBundle.provenance', [
    'foundry_run_id',
    'generation',
    'producer_id',
    'evaluated_at',
    'source_refs',
  ]);
  requiredString(input.provenance.foundry_run_id, 'EvidenceBundle.provenance.foundry_run_id');
  requiredString(input.provenance.producer_id, 'EvidenceBundle.provenance.producer_id');
  assertDateTime(input.provenance.evaluated_at, 'EvidenceBundle.provenance.evaluated_at');
  requiredUniqueStringList(input.provenance.source_refs, 'EvidenceBundle.provenance.source_refs');
  return input as unknown as EvidenceBundle;
}

export function validateEvolutionProposal(value: unknown): EvolutionProposal {
  const input = assertBase(value, 'opl_foundry_evolution_proposal', 'EvolutionProposal');
  assertExactKeys(input, 'EvolutionProposal', [
    'surface_kind',
    'version',
    'proposal_id',
    'target_agent_id',
    'target_domain_id',
    'target_version_ref',
    'blueprint_digest',
    'evidence_digest',
    'root_causes',
    'next_blueprint',
    'semantic_diff',
    'expected_benefits',
    'new_tests',
    'trade_offs',
    'risk_hints',
  ]);
  requiredString(input.proposal_id, 'EvolutionProposal.proposal_id');
  assertDigest(input.blueprint_digest, 'EvolutionProposal.blueprint_digest');
  assertDigest(input.evidence_digest, 'EvolutionProposal.evidence_digest');
  if (!Array.isArray(input.root_causes) || input.root_causes.length === 0) fail('EvolutionProposal.root_causes must not be empty.');
  for (const [index, entry] of input.root_causes.entries()) {
    if (!isRecord(entry)) fail(`EvolutionProposal.root_causes[${index}] must be an object.`);
    const label = `EvolutionProposal.root_causes[${index}]`;
    assertExactKeys(entry, label, ['failure_class', 'explanation', 'evidence_refs']);
    requiredString(entry.failure_class, `${label}.failure_class`);
    requiredString(entry.explanation, `${label}.explanation`);
    requiredUniqueStringList(entry.evidence_refs, `${label}.evidence_refs`);
  }
  const next = validateAgentBlueprint(input.next_blueprint);
  if (!Array.isArray(input.semantic_diff)) fail('EvolutionProposal.semantic_diff must be an array.');
  for (const [index, entry] of input.semantic_diff.entries()) {
    if (!isRecord(entry) || !['add', 'replace', 'remove'].includes(String(entry.operation))) {
      fail(`EvolutionProposal.semantic_diff[${index}] is invalid.`);
    }
    assertExactKeys(entry, `EvolutionProposal.semantic_diff[${index}]`, ['operation', 'semantic_path', 'rationale']);
    const semanticPath = requiredString(entry.semantic_path, `EvolutionProposal.semantic_diff[${index}].semantic_path`);
    if (!semanticPath.startsWith('/')) fail('EvolutionProposal semantic paths must be JSON pointers.');
    requiredString(entry.rationale, `EvolutionProposal.semantic_diff[${index}].rationale`);
  }
  requiredUniqueStringList(input.expected_benefits, 'EvolutionProposal.expected_benefits');
  if (!Array.isArray(input.new_tests)) fail('EvolutionProposal.new_tests must be an array.');
  const newTestIds = input.new_tests.map((entry, index) => {
    if (!isRecord(entry)) fail(`EvolutionProposal.new_tests[${index}] must be an object.`);
    const label = `EvolutionProposal.new_tests[${index}]`;
    assertExactKeys(entry, label, ['case_id', 'test_ref', 'rationale']);
    const caseId = requiredString(entry.case_id, `${label}.case_id`);
    requiredString(entry.test_ref, `${label}.test_ref`);
    requiredString(entry.rationale, `${label}.rationale`);
    return caseId;
  });
  if (new Set(newTestIds).size !== newTestIds.length) fail('EvolutionProposal.new_tests case ids must be unique.');
  requiredUniqueStringList(input.trade_offs, 'EvolutionProposal.trade_offs');
  const riskHints = requiredUniqueStringList(input.risk_hints, 'EvolutionProposal.risk_hints');
  if (riskHints.some((entry) => !['low', 'medium', 'high'].includes(entry))) {
    fail('EvolutionProposal.risk_hints contains an invalid risk tier.');
  }
  return { ...(input as unknown as EvolutionProposal), next_blueprint: next };
}

export function foundryContentDigest(value: unknown) {
  assertFoundryProtocolPurity(value, 'Foundry protocol object');
  return `sha256:${crypto.createHash('sha256').update(canonicalJsonText(value), 'utf8').digest('hex')}`;
}

export function assertSameTarget(
  left: Pick<DesignRequest, 'target_agent_id' | 'target_domain_id' | 'target_version_ref'>,
  right: Pick<DesignRequest, 'target_agent_id' | 'target_domain_id' | 'target_version_ref'>,
  label: string,
) {
  if (
    left.target_agent_id !== right.target_agent_id
    || left.target_domain_id !== right.target_domain_id
    || left.target_version_ref !== right.target_version_ref
  ) {
    fail(`${label} target identity is stale or mismatched.`, { expected: left, actual: right });
  }
}
