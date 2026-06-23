import type {
  ScholarSkillAuthorityBoundary,
  ScholarSkillCapabilityModuleDescriptor,
  ScholarSkillModuleId,
  ScholarSkillsCapabilityModulesContract,
} from './types.ts';
import {
  FrameworkContractError,
  expectString,
  expectStringArray,
  isRecord,
} from './contract-validation.ts';

export const SCHOLAR_SKILL_MODULE_IDS = [
  'opl.scholarskills.display',
  'opl.scholarskills.tables',
  'opl.scholarskills.stats',
  'opl.scholarskills.omics',
  'opl.scholarskills.lit',
  'opl.scholarskills.write',
  'opl.scholarskills.review',
  'opl.scholarskills.submit',
  'opl.scholarskills.data',
  'opl.scholarskills.intake',
] as const satisfies readonly ScholarSkillModuleId[];

const SCHOLAR_SKILL_AUTHORITY_FIELDS = [
  'can_claim_domain_ready',
  'can_claim_quality_verdict',
  'can_claim_artifact_authority',
  'can_claim_production_ready',
  'can_claim_runtime_ready',
  'can_schedule_runtime',
  'can_write_domain_truth',
  'can_write_runtime_state',
  'can_write_memory_body',
  'can_mutate_artifact_body',
  'can_sign_owner_receipt',
  'can_create_typed_blocker',
  'can_replace_domain_owner',
  'can_replace_ai_executor_planning',
] as const satisfies readonly (keyof ScholarSkillAuthorityBoundary)[];

const RUNTIME_BRIDGE_ENVELOPE_POLICY_FALSE_FIELDS = [
  'prepared',
  'can_claim_cache_hit',
  'can_write_runtime_state',
  'can_claim_runtime_ready',
  'can_mutate_artifact_body',
  'can_sign_owner_receipt',
  'can_create_typed_blocker',
] as const;

function expectFalse(value: unknown, field: string, filePath: string) {
  if (value !== false) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} must be false.`, {
      file: filePath,
      field,
    });
  }
  return false as const;
}

function expectBooleanLiteralTrue(value: unknown, field: string, filePath: string) {
  if (value !== true) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} must be true.`, {
      file: filePath,
      field,
    });
  }
  return true as const;
}

function expectNonEmptyStringArray(value: unknown, field: string, filePath: string) {
  const items = expectStringArray(value, field, filePath);
  if (items.length === 0) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} must contain at least one entry.`, {
      file: filePath,
      field,
    });
  }
  return items;
}

function expectOptionalNonEmptyStringArray(value: unknown, field: string, filePath: string) {
  if (value === undefined) {
    return undefined;
  }
  return expectNonEmptyStringArray(value, field, filePath);
}

function validateRuntimeBridgeEnvelopePolicy(filePath: string, value: unknown) {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw new FrameworkContractError('contract_shape_invalid', 'runtime_environment_bridge.bridge_envelope_policy must be an object.', {
      file: filePath,
      field: 'runtime_environment_bridge.bridge_envelope_policy',
    });
  }
  const policy = {
    refs_only: expectBooleanLiteralTrue(
      value.refs_only,
      'runtime_environment_bridge.bridge_envelope_policy.refs_only',
      filePath,
    ),
    prepared: expectFalse(
      value.prepared,
      'runtime_environment_bridge.bridge_envelope_policy.prepared',
      filePath,
    ),
    can_claim_cache_hit: expectFalse(
      value.can_claim_cache_hit,
      'runtime_environment_bridge.bridge_envelope_policy.can_claim_cache_hit',
      filePath,
    ),
    can_write_runtime_state: expectFalse(
      value.can_write_runtime_state,
      'runtime_environment_bridge.bridge_envelope_policy.can_write_runtime_state',
      filePath,
    ),
    can_claim_runtime_ready: expectFalse(
      value.can_claim_runtime_ready,
      'runtime_environment_bridge.bridge_envelope_policy.can_claim_runtime_ready',
      filePath,
    ),
    can_mutate_artifact_body: expectFalse(
      value.can_mutate_artifact_body,
      'runtime_environment_bridge.bridge_envelope_policy.can_mutate_artifact_body',
      filePath,
    ),
    can_sign_owner_receipt: expectFalse(
      value.can_sign_owner_receipt,
      'runtime_environment_bridge.bridge_envelope_policy.can_sign_owner_receipt',
      filePath,
    ),
    can_create_typed_blocker: expectFalse(
      value.can_create_typed_blocker,
      'runtime_environment_bridge.bridge_envelope_policy.can_create_typed_blocker',
      filePath,
    ),
  };
  for (const field of RUNTIME_BRIDGE_ENVELOPE_POLICY_FALSE_FIELDS) {
    if (policy[field] !== false) {
      throw new FrameworkContractError('contract_shape_invalid', `${field} must be false.`, {
        file: filePath,
        field: `runtime_environment_bridge.bridge_envelope_policy.${field}`,
      });
    }
  }
  return policy;
}

function expectScholarSkillModuleId(value: unknown, field: string, filePath: string): ScholarSkillModuleId {
  const moduleId = expectString(value, field, filePath);
  if (!(SCHOLAR_SKILL_MODULE_IDS as readonly string[]).includes(moduleId)) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} must be a known ScholarSkills module id.`, {
      file: filePath,
      field,
      actual: moduleId,
      allowed: [...SCHOLAR_SKILL_MODULE_IDS],
    });
  }
  return moduleId as ScholarSkillModuleId;
}

export function validateScholarSkillAuthorityBoundary(filePath: string, value: unknown): ScholarSkillAuthorityBoundary {
  if (!isRecord(value)) {
    throw new FrameworkContractError('contract_shape_invalid', 'authority_boundary must be an object.', {
      file: filePath,
      field: 'authority_boundary',
    });
  }

  const boundary = {} as ScholarSkillAuthorityBoundary;
  for (const field of SCHOLAR_SKILL_AUTHORITY_FIELDS) {
    boundary[field] = expectFalse(value[field], `authority_boundary.${field}`, filePath);
  }
  return boundary;
}

function validateInvocationEntries(filePath: string, value: unknown, moduleId: ScholarSkillModuleId) {
  if (!Array.isArray(value)) {
    throw new FrameworkContractError('contract_shape_invalid', 'invocation_entries must be an array.', {
      file: filePath,
      module_id: moduleId,
      field: 'invocation_entries',
    });
  }
  if (value.length === 0) {
    throw new FrameworkContractError('contract_shape_invalid', 'invocation_entries must contain at least one entry.', {
      file: filePath,
      module_id: moduleId,
      field: 'invocation_entries',
    });
  }
  return value.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new FrameworkContractError('contract_shape_invalid', 'Each invocation entry must be an object.', {
        file: filePath,
        module_id: moduleId,
        index,
      });
    }
    return {
      entry_id: expectString(entry.entry_id, 'invocation_entries.entry_id', filePath),
      entry_kind: expectString(entry.entry_kind, 'invocation_entries.entry_kind', filePath),
      command: expectString(entry.command, 'invocation_entries.command', filePath),
      mutation: expectFalse(entry.mutation, 'invocation_entries.mutation', filePath),
      descriptor_only: expectBooleanLiteralTrue(entry.descriptor_only, 'invocation_entries.descriptor_only', filePath),
    };
  });
}

function validateArtifactRefs(filePath: string, value: unknown, moduleId: ScholarSkillModuleId) {
  if (!Array.isArray(value)) {
    throw new FrameworkContractError('contract_shape_invalid', 'artifact_refs must be an array.', {
      file: filePath,
      module_id: moduleId,
      field: 'artifact_refs',
    });
  }
  return value.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new FrameworkContractError('contract_shape_invalid', 'Each artifact ref must be an object.', {
        file: filePath,
        module_id: moduleId,
        index,
      });
    }
    return {
      ref_id: expectString(entry.ref_id, 'artifact_refs.ref_id', filePath),
      ref_kind: expectString(entry.ref_kind, 'artifact_refs.ref_kind', filePath),
      role: expectString(entry.role, 'artifact_refs.role', filePath),
      body_policy: expectString(entry.body_policy, 'artifact_refs.body_policy', filePath),
    };
  });
}

function validateModule(filePath: string, entry: unknown, index: number): ScholarSkillCapabilityModuleDescriptor {
  if (!isRecord(entry)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Each ScholarSkills module entry must be an object.', {
      file: filePath,
      index,
    });
  }
  const moduleId = expectScholarSkillModuleId(entry.module_id, 'module_id', filePath);
  if (entry.brand_family !== 'OPL ScholarSkills') {
    throw new FrameworkContractError('contract_shape_invalid', 'ScholarSkills module brand_family must be OPL ScholarSkills.', {
      file: filePath,
      index,
      module_id: moduleId,
      field: 'brand_family',
    });
  }
  if (!isRecord(entry.receipt_policy) || !isRecord(entry.quality_evidence)) {
    throw new FrameworkContractError('contract_shape_invalid', 'ScholarSkills modules must declare receipt_policy and quality_evidence objects.', {
      file: filePath,
      index,
      module_id: moduleId,
    });
  }

  return {
    module_id: moduleId,
    brand_family: 'OPL ScholarSkills',
    display_name: expectString(entry.display_name, 'display_name', filePath),
    stage_fit: expectNonEmptyStringArray(entry.stage_fit, 'stage_fit', filePath),
    input_schema_refs: expectNonEmptyStringArray(entry.input_schema_refs, 'input_schema_refs', filePath),
    output_schema_refs: expectNonEmptyStringArray(entry.output_schema_refs, 'output_schema_refs', filePath),
    dependency_profile_refs: expectNonEmptyStringArray(entry.dependency_profile_refs, 'dependency_profile_refs', filePath),
    run_context_refs: expectNonEmptyStringArray(entry.run_context_refs, 'run_context_refs', filePath),
    invocation_entries: validateInvocationEntries(filePath, entry.invocation_entries, moduleId),
    artifact_refs: validateArtifactRefs(filePath, entry.artifact_refs, moduleId),
    receipt_policy: {
      accepted_receipt_refs: expectNonEmptyStringArray(
        entry.receipt_policy.accepted_receipt_refs,
        'receipt_policy.accepted_receipt_refs',
        filePath,
      ),
      can_sign_owner_receipt: expectFalse(
        entry.receipt_policy.can_sign_owner_receipt,
        'receipt_policy.can_sign_owner_receipt',
        filePath,
      ),
      receipt_body_policy: expectString(entry.receipt_policy.receipt_body_policy, 'receipt_policy.receipt_body_policy', filePath),
    },
    quality_evidence: {
      evidence_kind: expectString(entry.quality_evidence.evidence_kind, 'quality_evidence.evidence_kind', filePath),
      required_ref_shapes: expectNonEmptyStringArray(
        entry.quality_evidence.required_ref_shapes,
        'quality_evidence.required_ref_shapes',
        filePath,
      ),
      can_claim_quality_verdict: expectFalse(
        entry.quality_evidence.can_claim_quality_verdict,
        'quality_evidence.can_claim_quality_verdict',
        filePath,
      ),
    },
    authority_boundary: validateScholarSkillAuthorityBoundary(filePath, entry.authority_boundary),
    allowed_writes: expectStringArray(entry.allowed_writes, 'allowed_writes', filePath),
    forbidden_writes: expectNonEmptyStringArray(entry.forbidden_writes, 'forbidden_writes', filePath),
  };
}

export function validateScholarSkillsCapabilityModules(
  filePath: string,
  value: unknown,
): ScholarSkillsCapabilityModulesContract {
  if (!isRecord(value)) {
    throw new FrameworkContractError('contract_shape_invalid', 'scholar-skills-capability-modules.json must contain an object root.', {
      file: filePath,
    });
  }
  if (value.contract_id !== 'opl_scholarskills_capability_modules') {
    throw new FrameworkContractError('contract_shape_invalid', 'ScholarSkills contract_id is invalid.', {
      file: filePath,
      field: 'contract_id',
    });
  }
  if (value.brand_family !== 'OPL ScholarSkills') {
    throw new FrameworkContractError('contract_shape_invalid', 'ScholarSkills contract brand_family must be OPL ScholarSkills.', {
      file: filePath,
      field: 'brand_family',
    });
  }
  if (!isRecord(value.runtime_environment_bridge)) {
    throw new FrameworkContractError('contract_shape_invalid', 'runtime_environment_bridge must be an object.', {
      file: filePath,
      field: 'runtime_environment_bridge',
    });
  }
  const bridge = value.runtime_environment_bridge;
  if (bridge.mode !== 'refs_only' || bridge.owner !== 'OPL Framework') {
    throw new FrameworkContractError('contract_shape_invalid', 'runtime_environment_bridge must be OPL Framework refs_only.', {
      file: filePath,
      field: 'runtime_environment_bridge',
    });
  }
  const modulesRaw = value.modules;
  if (!Array.isArray(modulesRaw)) {
    throw new FrameworkContractError('contract_shape_invalid', 'modules must be an array.', {
      file: filePath,
      field: 'modules',
    });
  }

  const seen = new Set<string>();
  const modules = modulesRaw.map((entry, index) => {
    const module = validateModule(filePath, entry, index);
    if (seen.has(module.module_id)) {
      throw new FrameworkContractError('contract_shape_invalid', 'Each ScholarSkills module id must be unique.', {
        file: filePath,
        index,
        module_id: module.module_id,
      });
    }
    seen.add(module.module_id);
    return module;
  });
  const missingModuleIds = SCHOLAR_SKILL_MODULE_IDS.filter((moduleId) => !seen.has(moduleId));
  if (missingModuleIds.length > 0 || seen.size !== SCHOLAR_SKILL_MODULE_IDS.length) {
    throw new FrameworkContractError('contract_shape_invalid', 'ScholarSkills contract must contain exactly the configured capability modules.', {
      file: filePath,
      expected_module_ids: [...SCHOLAR_SKILL_MODULE_IDS],
      missing_module_ids: missingModuleIds,
      actual_module_ids: [...seen],
    });
  }

  return {
    contract_id: 'opl_scholarskills_capability_modules',
    schema_version: expectString(value.schema_version, 'schema_version', filePath),
    owner: expectString(value.owner, 'owner', filePath),
    state: expectString(value.state, 'state', filePath),
    brand_family: 'OPL ScholarSkills',
    purpose: expectString(value.purpose, 'purpose', filePath),
    machine_boundary: expectString(value.machine_boundary, 'machine_boundary', filePath),
    runtime_environment_bridge: {
      mode: 'refs_only',
      owner: 'OPL Framework',
      dependency_profile_owner_commands: expectNonEmptyStringArray(
        bridge.dependency_profile_owner_commands,
        'runtime_environment_bridge.dependency_profile_owner_commands',
        filePath,
      ),
      run_context_owner_commands: expectNonEmptyStringArray(
        bridge.run_context_owner_commands,
        'runtime_environment_bridge.run_context_owner_commands',
        filePath,
      ),
      scholar_skill_prepare_commands: expectOptionalNonEmptyStringArray(
        bridge.scholar_skill_prepare_commands,
        'runtime_environment_bridge.scholar_skill_prepare_commands',
        filePath,
      ),
      scholar_skill_run_context_commands: expectOptionalNonEmptyStringArray(
        bridge.scholar_skill_run_context_commands,
        'runtime_environment_bridge.scholar_skill_run_context_commands',
        filePath,
      ),
      scholar_skill_invocation_commands: expectOptionalNonEmptyStringArray(
        bridge.scholar_skill_invocation_commands,
        'runtime_environment_bridge.scholar_skill_invocation_commands',
        filePath,
      ),
      scholar_skill_receipt_commands: expectOptionalNonEmptyStringArray(
        bridge.scholar_skill_receipt_commands,
        'runtime_environment_bridge.scholar_skill_receipt_commands',
        filePath,
      ),
      scholar_skill_runtime_prepare_commands: expectOptionalNonEmptyStringArray(
        bridge.scholar_skill_runtime_prepare_commands,
        'runtime_environment_bridge.scholar_skill_runtime_prepare_commands',
        filePath,
      ),
      scholar_skill_runtime_run_context_commands: expectOptionalNonEmptyStringArray(
        bridge.scholar_skill_runtime_run_context_commands,
        'runtime_environment_bridge.scholar_skill_runtime_run_context_commands',
        filePath,
      ),
      bridge_envelope_policy: validateRuntimeBridgeEnvelopePolicy(
        filePath,
        bridge.bridge_envelope_policy,
      ),
      can_write_runtime_state: expectFalse(
        bridge.can_write_runtime_state,
        'runtime_environment_bridge.can_write_runtime_state',
        filePath,
      ),
      can_claim_runtime_ready: expectFalse(
        bridge.can_claim_runtime_ready,
        'runtime_environment_bridge.can_claim_runtime_ready',
        filePath,
      ),
      can_claim_domain_ready: expectFalse(
        bridge.can_claim_domain_ready,
        'runtime_environment_bridge.can_claim_domain_ready',
        filePath,
      ),
    },
    authority_boundary: validateScholarSkillAuthorityBoundary(filePath, value.authority_boundary),
    modules,
  };
}
