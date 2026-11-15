import { isRecord } from '../../../kernel/contract-validation.ts';
import { fail, requiredString, requiredUniqueStringList, assertExactKeys, assertDigest } from './validation-values.ts';
import { assertFoundryProtocolPurity, assertBase } from './semantic-boundary.ts';
import type { KnowledgeRequirement, AgentBlueprint } from './types.ts';

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

export function validateKnowledgeRequirements(value: unknown): KnowledgeRequirement[] {
  const field = 'AgentBlueprint.memory_policy.knowledge_requirements';
  assertFoundryProtocolPurity(value, field);
  if (!Array.isArray(value)) fail(`${field} must be an array.`, { field });
  const identities = new Set<string>();
  for (const [index, entry] of value.entries()) {
    const label = `${field}[${index}]`;
    if (!isRecord(entry)) fail(`${label} must be an object.`, { field: label });
    assertExactKeys(entry, label, [
      'requirement_id', 'scope_kind', 'content_kind', 'semantic_owner_ref', 'source_modes',
      'requirement', 'freshness_policy', 'writeback_owner_ref', 'derived_dependency_policy', 'action_critical',
    ]);
    const identity = requiredString(entry.requirement_id, `${label}.requirement_id`);
    if (identities.has(identity)) fail(`${field} requirement_id values must be unique.`, { requirement_id: identity });
    identities.add(identity);
    if (!['product', 'owner', 'topic', 'project'].includes(String(entry.scope_kind))) {
      fail(`${label}.scope_kind is invalid.`, { field: label });
    }
    if (!['mechanism', 'policy', 'state', 'decision'].includes(String(entry.content_kind))) {
      fail(`${label}.content_kind is invalid.`, { field: label });
    }
    if (!['required', 'optional'].includes(String(entry.requirement))) {
      fail(`${label}.requirement is invalid.`, { field: label });
    }
    const modes = requiredUniqueStringList(entry.source_modes, `${label}.source_modes`, 1);
    const validModes = entry.scope_kind === 'product'
      ? modes.length === 1 && modes[0] === 'product'
      : modes.every((mode) => mode === 'workspace' || mode === 'external');
    if (!validModes) fail(`${label}.source_modes must match its knowledge scope.`, { field: label });
    for (const key of ['semantic_owner_ref', 'freshness_policy', 'writeback_owner_ref', 'derived_dependency_policy']) {
      requiredString(entry[key], `${label}.${key}`);
    }
    if (typeof entry.action_critical !== 'boolean') fail(`${label}.action_critical must be boolean.`, { field: label });
  }
  return value as KnowledgeRequirement[];
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
    'knowledge_requirements',
  ]);
  requiredUniqueStringList(input.memory_policy.memory_classes, 'AgentBlueprint.memory_policy.memory_classes');
  requiredUniqueStringList(input.memory_policy.retention_refs, 'AgentBlueprint.memory_policy.retention_refs');
  requiredUniqueStringList(input.memory_policy.write_authority_refs, 'AgentBlueprint.memory_policy.write_authority_refs');
  validateKnowledgeRequirements(input.memory_policy.knowledge_requirements);
  requiredUniqueStringList(input.assumptions, 'AgentBlueprint.assumptions');
  requiredUniqueStringList(input.design_evidence_refs, 'AgentBlueprint.design_evidence_refs');
  validateEvalSpec(input.eval_spec, 'AgentBlueprint.eval_spec');
  if (!['low', 'medium', 'high'].includes(String(input.risk_hint))) fail('AgentBlueprint.risk_hint is invalid.');
  return input as unknown as AgentBlueprint;
}
