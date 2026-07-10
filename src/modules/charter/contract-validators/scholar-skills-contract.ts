import type {
  ScholarSkillAuthorityBoundary,
  ScholarSkillCapabilityModuleDescriptor,
  ScholarSkillDataGovernanceAssessmentPolicy,
  ScholarSkillExpandedAuthorityField,
  ScholarSkillModuleId,
  ScholarSkillsSourceProjectionContract,
  ScholarSkillsOwnershipBoundary,
  ScholarSkillsCapabilityModulesContract,
} from '../../../kernel/types.ts';
import {
  FrameworkContractError,
  expectString,
  expectStringArray,
  isRecord,
} from '../../../kernel/contract-validation.ts';
import { SCHOLAR_SKILL_MODULE_IDS } from '../../../kernel/scholar-skill-module-ids.ts';
export { SCHOLAR_SKILL_MODULE_IDS } from '../../../kernel/scholar-skill-module-ids.ts';

const SCHOLAR_SKILL_AUTHORITY_FIELDS = [
  'can_claim_domain_ready',
  'can_claim_quality_verdict',
  'can_claim_artifact_authority',
  'can_claim_production_ready',
  'can_claim_runtime_ready',
  'can_claim_publication_readiness',
  'can_claim_owner_acceptance',
  'can_claim_current_package_authority',
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
  'can_claim_publication_readiness',
  'can_claim_owner_acceptance',
  'can_claim_current_package_authority',
] as const;

const EXPANDED_AUTHORITY_FALSE_FIELDS = [
  'can_claim_publication_readiness',
  'can_claim_owner_acceptance',
  'can_claim_current_package_authority',
] as const satisfies readonly ScholarSkillExpandedAuthorityField[];

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

function expectBoolean(value: unknown, field: string, filePath: string) {
  if (typeof value !== 'boolean') {
    throw new FrameworkContractError('contract_shape_invalid', `${field} must be a boolean.`, {
      file: filePath,
      field,
    });
  }
  return value;
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

function expectOptionalString(value: unknown, field: string, filePath: string) {
  if (value === undefined) {
    return undefined;
  }
  return expectString(value, field, filePath);
}

function expectOptionalNonEmptyStringArray(value: unknown, field: string, filePath: string) {
  if (value === undefined) {
    return undefined;
  }
  return expectNonEmptyStringArray(value, field, filePath);
}

function expectStringRecord(value: unknown, field: string, filePath: string) {
  if (!isRecord(value)) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} must be an object.`, {
      file: filePath,
      field,
    });
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      expectString(entry, `${field}.${key}`, filePath),
    ]),
  );
}

function validateDataGovernanceAssessmentPolicy(
  filePath: string,
  value: unknown,
): ScholarSkillDataGovernanceAssessmentPolicy | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw new FrameworkContractError('contract_shape_invalid', 'data_governance_assessment_policy must be an object.', {
      file: filePath,
      field: 'data_governance_assessment_policy',
    });
  }
  const policy = {
    policy_id: expectString(value.policy_id, 'data_governance_assessment_policy.policy_id', filePath),
    active_module_id: expectString(
      value.active_module_id,
      'data_governance_assessment_policy.active_module_id',
      filePath,
    ) as 'mas-scholar-skills.data',
    real_specialist_skill_id: expectString(
      value.real_specialist_skill_id,
      'data_governance_assessment_policy.real_specialist_skill_id',
      filePath,
    ) as 'medical-data-governance',
    legacy_module_ids: expectNonEmptyStringArray(
      value.legacy_module_ids,
      'data_governance_assessment_policy.legacy_module_ids',
      filePath,
    ),
    legacy_id_policy: expectString(
      value.legacy_id_policy,
      'data_governance_assessment_policy.legacy_id_policy',
      filePath,
    ),
    required_handoff_refs: expectNonEmptyStringArray(
      value.required_handoff_refs,
      'data_governance_assessment_policy.required_handoff_refs',
      filePath,
    ),
    assessment_ref_families: expectNonEmptyStringArray(
      value.assessment_ref_families,
      'data_governance_assessment_policy.assessment_ref_families',
      filePath,
    ),
    operation_receipt_categories: expectNonEmptyStringArray(
      value.operation_receipt_categories,
      'data_governance_assessment_policy.operation_receipt_categories',
      filePath,
    ),
    required_checks: expectNonEmptyStringArray(
      value.required_checks,
      'data_governance_assessment_policy.required_checks',
      filePath,
    ),
    no_authority_policy: expectString(
      value.no_authority_policy,
      'data_governance_assessment_policy.no_authority_policy',
      filePath,
    ),
    can_write_domain_truth: expectFalse(
      value.can_write_domain_truth,
      'data_governance_assessment_policy.can_write_domain_truth',
      filePath,
    ),
    can_mutate_clinical_data_body: expectFalse(
      value.can_mutate_clinical_data_body,
      'data_governance_assessment_policy.can_mutate_clinical_data_body',
      filePath,
    ),
    can_sign_owner_receipt: expectFalse(
      value.can_sign_owner_receipt,
      'data_governance_assessment_policy.can_sign_owner_receipt',
      filePath,
    ),
    can_create_typed_blocker: expectFalse(
      value.can_create_typed_blocker,
      'data_governance_assessment_policy.can_create_typed_blocker',
      filePath,
    ),
    can_claim_source_readiness: expectFalse(
      value.can_claim_source_readiness,
      'data_governance_assessment_policy.can_claim_source_readiness',
      filePath,
    ),
    can_claim_publication_readiness: expectFalse(
      value.can_claim_publication_readiness,
      'data_governance_assessment_policy.can_claim_publication_readiness',
      filePath,
    ),
  };
  if (policy.active_module_id !== 'mas-scholar-skills.data') {
    throw new FrameworkContractError('contract_shape_invalid', 'Data governance assessment policy active module id is invalid.', {
      file: filePath,
      field: 'data_governance_assessment_policy.active_module_id',
    });
  }
  if (policy.real_specialist_skill_id !== 'medical-data-governance') {
    throw new FrameworkContractError('contract_shape_invalid', 'Data governance assessment policy specialist skill id is invalid.', {
      file: filePath,
      field: 'data_governance_assessment_policy.real_specialist_skill_id',
    });
  }
  return policy;
}

function validateOwnershipBoundary(filePath: string, value: unknown): ScholarSkillsOwnershipBoundary {
  if (!isRecord(value)) {
    throw new FrameworkContractError('contract_shape_invalid', 'ownership_boundary must be an object.', {
      file: filePath,
      field: 'ownership_boundary',
    });
  }
  return {
    opl_owned_surfaces: expectNonEmptyStringArray(value.opl_owned_surfaces, 'ownership_boundary.opl_owned_surfaces', filePath),
    package_descriptor_owner: expectString(
      value.package_descriptor_owner,
      'ownership_boundary.package_descriptor_owner',
      filePath,
    ),
    skill_sync_owner: expectString(value.skill_sync_owner, 'ownership_boundary.skill_sync_owner', filePath),
    runtime_environment_bridge_owner: expectString(
      value.runtime_environment_bridge_owner,
      'ownership_boundary.runtime_environment_bridge_owner',
      filePath,
    ),
    professional_skill_truth_owner: expectString(
      value.professional_skill_truth_owner,
      'ownership_boundary.professional_skill_truth_owner',
      filePath,
    ),
    citation_judgment_owner: expectString(
      value.citation_judgment_owner,
      'ownership_boundary.citation_judgment_owner',
      filePath,
    ),
    domain_truth_owner: expectString(value.domain_truth_owner, 'ownership_boundary.domain_truth_owner', filePath),
    no_authority_policy: expectString(value.no_authority_policy, 'ownership_boundary.no_authority_policy', filePath),
    pack_or_bridge_receipt_counts_as_domain_truth: expectFalse(
      value.pack_or_bridge_receipt_counts_as_domain_truth,
      'ownership_boundary.pack_or_bridge_receipt_counts_as_domain_truth',
      filePath,
    ),
    pack_or_bridge_receipt_counts_as_citation_truth: expectFalse(
      value.pack_or_bridge_receipt_counts_as_citation_truth,
      'ownership_boundary.pack_or_bridge_receipt_counts_as_citation_truth',
      filePath,
    ),
  };
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
    can_claim_publication_readiness: expectFalse(
      value.can_claim_publication_readiness,
      'runtime_environment_bridge.bridge_envelope_policy.can_claim_publication_readiness',
      filePath,
    ),
    can_claim_owner_acceptance: expectFalse(
      value.can_claim_owner_acceptance,
      'runtime_environment_bridge.bridge_envelope_policy.can_claim_owner_acceptance',
      filePath,
    ),
    can_claim_current_package_authority: expectFalse(
      value.can_claim_current_package_authority,
      'runtime_environment_bridge.bridge_envelope_policy.can_claim_current_package_authority',
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

function validateSourceProjectionContract(
  filePath: string,
  value: unknown,
): ScholarSkillsSourceProjectionContract {
  if (!isRecord(value)) {
    throw new FrameworkContractError('contract_shape_invalid', 'source_projection_contract must be an object.', {
      file: filePath,
      field: 'source_projection_contract',
    });
  }
  if (value.contract_id !== 'opl_scholarskills_source_projection') {
    throw new FrameworkContractError('contract_shape_invalid', 'source_projection_contract.contract_id is invalid.', {
      file: filePath,
      field: 'source_projection_contract.contract_id',
    });
  }
  if (!isRecord(value.canonical_source)) {
    throw new FrameworkContractError('contract_shape_invalid', 'source_projection_contract.canonical_source must be an object.', {
      file: filePath,
      field: 'source_projection_contract.canonical_source',
    });
  }
  const canonicalSource = value.canonical_source;
  const ownerRepo = expectString(
    canonicalSource.owner_repo,
    'source_projection_contract.canonical_source.owner_repo',
    filePath,
  );
  const contractPath = expectString(
    canonicalSource.contract_path,
    'source_projection_contract.canonical_source.contract_path',
    filePath,
  );
  const fingerprintAlgorithm = expectString(
    canonicalSource.fingerprint_algorithm,
    'source_projection_contract.canonical_source.fingerprint_algorithm',
    filePath,
  );
  const fingerprint = expectString(
    canonicalSource.fingerprint,
    'source_projection_contract.canonical_source.fingerprint',
    filePath,
  );
  if (ownerRepo !== 'mas-scholar-skills' || contractPath !== 'contracts/scholar-skills-capability-modules.json') {
    throw new FrameworkContractError('contract_shape_invalid', 'source_projection_contract canonical owner is invalid.', {
      file: filePath,
      field: 'source_projection_contract.canonical_source',
    });
  }
  if (fingerprintAlgorithm !== 'sha256' || !/^[a-f0-9]{64}$/.test(fingerprint)) {
    throw new FrameworkContractError('contract_shape_invalid', 'source_projection_contract fingerprint must be sha256 hex.', {
      file: filePath,
      field: 'source_projection_contract.canonical_source.fingerprint',
    });
  }

  if (!isRecord(value.projected_fields)) {
    throw new FrameworkContractError('contract_shape_invalid', 'source_projection_contract.projected_fields must be an object.', {
      file: filePath,
      field: 'source_projection_contract.projected_fields',
    });
  }
  const expandedFalseAuthorityFields = expectNonEmptyStringArray(
    value.projected_fields.expanded_false_authority_fields,
    'source_projection_contract.projected_fields.expanded_false_authority_fields',
    filePath,
  );
  if (
    expandedFalseAuthorityFields.length !== EXPANDED_AUTHORITY_FALSE_FIELDS.length
    || EXPANDED_AUTHORITY_FALSE_FIELDS.some((field) => !expandedFalseAuthorityFields.includes(field))
  ) {
    throw new FrameworkContractError('contract_shape_invalid', 'Expanded ScholarSkills authority fields are invalid.', {
      file: filePath,
      field: 'source_projection_contract.projected_fields.expanded_false_authority_fields',
    });
  }

  if (!Array.isArray(value.intentional_transformations) || value.intentional_transformations.length !== 1) {
    throw new FrameworkContractError('contract_shape_invalid', 'source_projection_contract must declare one intentional transformation.', {
      file: filePath,
      field: 'source_projection_contract.intentional_transformations',
    });
  }
  value.intentional_transformations.forEach((entry, index) => {
    if (!isRecord(entry)) {
      throw new FrameworkContractError('contract_shape_invalid', 'Each intentional transformation must be an object.', {
        file: filePath,
        field: 'source_projection_contract.intentional_transformations',
        index,
      });
    }
    if (entry.source_vocabulary !== '--paper-root' || entry.projected_vocabulary !== '--artifact-root') {
      throw new FrameworkContractError('contract_shape_invalid', 'ScholarSkills root vocabulary transform is invalid.', {
        file: filePath,
        field: 'source_projection_contract.intentional_transformations',
        index,
      });
    }
    expectString(entry.transform_id, 'intentional_transformations.transform_id', filePath);
    expectNonEmptyStringArray(entry.applies_to, 'intentional_transformations.applies_to', filePath);
    expectString(entry.reason, 'intentional_transformations.reason', filePath);
  });

  if (!isRecord(value.owner_only_metadata_refs)) {
    throw new FrameworkContractError('contract_shape_invalid', 'source_projection_contract.owner_only_metadata_refs must be an object.', {
      file: filePath,
      field: 'source_projection_contract.owner_only_metadata_refs',
    });
  }
  const ownerOnlyMetadataRefs = value.owner_only_metadata_refs;
  expectStringRecord(
    ownerOnlyMetadataRefs.learned_pattern_policy_refs,
    'source_projection_contract.owner_only_metadata_refs.learned_pattern_policy_refs',
    filePath,
  );
  expectStringRecord(
    ownerOnlyMetadataRefs.display_quality_floor_policy_refs,
    'source_projection_contract.owner_only_metadata_refs.display_quality_floor_policy_refs',
    filePath,
  );

  if (!isRecord(value.currentness_boundary)) {
    throw new FrameworkContractError('contract_shape_invalid', 'source_projection_contract.currentness_boundary must be an object.', {
      file: filePath,
      field: 'source_projection_contract.currentness_boundary',
    });
  }
  const currentness = value.currentness_boundary;

  if (!isRecord(value.projection_fingerprint_policy)) {
    throw new FrameworkContractError('contract_shape_invalid', 'source_projection_contract.projection_fingerprint_policy must be an object.', {
      file: filePath,
      field: 'source_projection_contract.projection_fingerprint_policy',
    });
  }
  const projectionFingerprintPolicy = value.projection_fingerprint_policy;
  const coveredFields = expectNonEmptyStringArray(
    projectionFingerprintPolicy.covered_fields,
    'source_projection_contract.projection_fingerprint_policy.covered_fields',
    filePath,
  );
  if (coveredFields.some((field) => field.includes('learned_pattern_policy') || field.includes('display_quality_floor_policy'))) {
    throw new FrameworkContractError('contract_shape_invalid', 'Projection fingerprint cannot cover owner-only narrative fields.', {
      file: filePath,
      field: 'source_projection_contract.projection_fingerprint_policy.covered_fields',
    });
  }
  const projectionAlgorithm = expectString(
    projectionFingerprintPolicy.algorithm,
    'source_projection_contract.projection_fingerprint_policy.algorithm',
    filePath,
  );
  const projectionCanonicalization = expectString(
    projectionFingerprintPolicy.canonicalization,
    'source_projection_contract.projection_fingerprint_policy.canonicalization',
    filePath,
  );
  const projectionReadbackField = expectString(
    projectionFingerprintPolicy.readback_field,
    'source_projection_contract.projection_fingerprint_policy.readback_field',
    filePath,
  );
  if (
    projectionAlgorithm !== 'sha256'
    || projectionCanonicalization !== 'stable_json'
    || projectionReadbackField !== 'projection_fingerprint'
  ) {
    throw new FrameworkContractError('contract_shape_invalid', 'Projection fingerprint policy is invalid.', {
      file: filePath,
      field: 'source_projection_contract.projection_fingerprint_policy',
    });
  }

  expectString(value.schema_version, 'source_projection_contract.schema_version', filePath);
  expectString(canonicalSource.ref, 'source_projection_contract.canonical_source.ref', filePath);
  expectString(canonicalSource.commit, 'source_projection_contract.canonical_source.commit', filePath);
  expectNonEmptyStringArray(
    value.projected_fields.identity_fields,
    'source_projection_contract.projected_fields.identity_fields',
    filePath,
  );
  expectNonEmptyStringArray(
    value.projected_fields.executable_fields,
    'source_projection_contract.projected_fields.executable_fields',
    filePath,
  );
  expectString(
    ownerOnlyMetadataRefs.canonical_contract_ref,
    'source_projection_contract.owner_only_metadata_refs.canonical_contract_ref',
    filePath,
  );
  expectString(
    ownerOnlyMetadataRefs.projection_policy,
    'source_projection_contract.owner_only_metadata_refs.projection_policy',
    filePath,
  );
  expectNonEmptyStringArray(
    ownerOnlyMetadataRefs.omitted_fields,
    'source_projection_contract.owner_only_metadata_refs.omitted_fields',
    filePath,
  );
  expectString(
    ownerOnlyMetadataRefs.omission_reason,
    'source_projection_contract.owner_only_metadata_refs.omission_reason',
    filePath,
  );
  expectString(
    currentness.snapshot_kind,
    'source_projection_contract.currentness_boundary.snapshot_kind',
    filePath,
  );
  for (const field of [
    'canonical_ref_may_advance',
    'projection_current_only_for_recorded_commit_and_fingerprint',
    'refresh_requires_new_owner_commit_and_fingerprint',
  ] as const) {
    expectBooleanLiteralTrue(currentness[field], `source_projection_contract.currentness_boundary.${field}`, filePath);
  }
  for (const field of ['projection_claims_live_owner_currentness', 'sibling_repo_required_in_ci'] as const) {
    expectFalse(currentness[field], `source_projection_contract.currentness_boundary.${field}`, filePath);
  }

  return value as unknown as ScholarSkillsSourceProjectionContract;
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
      legacy_entry_ids: expectOptionalNonEmptyStringArray(
        entry.legacy_entry_ids,
        'invocation_entries.legacy_entry_ids',
        filePath,
      ),
      entry_kind: expectString(entry.entry_kind, 'invocation_entries.entry_kind', filePath),
      command: expectString(entry.command, 'invocation_entries.command', filePath),
      mutation: expectFalse(entry.mutation, 'invocation_entries.mutation', filePath),
      descriptor_only: expectBoolean(entry.descriptor_only, 'invocation_entries.descriptor_only', filePath),
      provider_priority: expectOptionalNonEmptyStringArray(
        entry.provider_priority,
        'invocation_entries.provider_priority',
        filePath,
      ),
      authority_boundary: expectOptionalString(
        entry.authority_boundary,
        'invocation_entries.authority_boundary',
        filePath,
      ),
      legacy_authority_boundary_alias: expectOptionalString(
        entry.legacy_authority_boundary_alias,
        'invocation_entries.legacy_authority_boundary_alias',
        filePath,
      ),
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
  for (const ownerOnlyField of ['learned_pattern_policy', 'display_quality_floor_policy']) {
    if (Object.hasOwn(entry, ownerOnlyField)) {
      throw new FrameworkContractError('contract_shape_invalid', `${ownerOnlyField} must remain owner-only metadata.`, {
        file: filePath,
        index,
        module_id: moduleId,
        field: ownerOnlyField,
      });
    }
  }
  if (entry.brand_family !== 'MAS Scholar Skills') {
    throw new FrameworkContractError('contract_shape_invalid', 'ScholarSkills module brand_family must be MAS Scholar Skills.', {
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
    brand_family: 'MAS Scholar Skills',
    display_name: expectString(entry.display_name, 'display_name', filePath),
    specialist_skill_id: expectOptionalString(entry.specialist_skill_id, 'specialist_skill_id', filePath),
    legacy_module_ids: expectNonEmptyStringArray(entry.legacy_module_ids, 'legacy_module_ids', filePath),
    legacy_module_id_policy: expectOptionalString(entry.legacy_module_id_policy, 'legacy_module_id_policy', filePath),
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
    data_governance_assessment_policy: validateDataGovernanceAssessmentPolicy(
      filePath,
      entry.data_governance_assessment_policy,
    ),
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
  if (value.brand_family !== 'MAS Scholar Skills') {
    throw new FrameworkContractError('contract_shape_invalid', 'ScholarSkills contract brand_family must be MAS Scholar Skills.', {
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
    brand_family: 'MAS Scholar Skills',
    purpose: expectString(value.purpose, 'purpose', filePath),
    machine_boundary: expectString(value.machine_boundary, 'machine_boundary', filePath),
    source_projection_contract: validateSourceProjectionContract(filePath, value.source_projection_contract),
    ownership_boundary: validateOwnershipBoundary(filePath, value.ownership_boundary),
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
      scholar_skill_materialize_commands: expectOptionalNonEmptyStringArray(
        bridge.scholar_skill_materialize_commands,
        'runtime_environment_bridge.scholar_skill_materialize_commands',
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
      can_claim_publication_readiness: expectFalse(
        bridge.can_claim_publication_readiness,
        'runtime_environment_bridge.can_claim_publication_readiness',
        filePath,
      ),
      can_claim_owner_acceptance: expectFalse(
        bridge.can_claim_owner_acceptance,
        'runtime_environment_bridge.can_claim_owner_acceptance',
        filePath,
      ),
      can_claim_current_package_authority: expectFalse(
        bridge.can_claim_current_package_authority,
        'runtime_environment_bridge.can_claim_current_package_authority',
        filePath,
      ),
    },
    authority_boundary: validateScholarSkillAuthorityBoundary(filePath, value.authority_boundary),
    modules,
  };
}
