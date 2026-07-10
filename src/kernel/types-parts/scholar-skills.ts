export type ScholarSkillModuleId =
  | 'mas-scholar-skills.display'
  | 'mas-scholar-skills.tables'
  | 'mas-scholar-skills.stats'
  | 'mas-scholar-skills.lit'
  | 'mas-scholar-skills.write'
  | 'mas-scholar-skills.review'
  | 'mas-scholar-skills.submit'
  | 'mas-scholar-skills.data';

export type ScholarSkillExpandedAuthorityField =
  | 'can_claim_publication_readiness'
  | 'can_claim_owner_acceptance'
  | 'can_claim_current_package_authority';

export interface ScholarSkillsSourceProjectionContract {
  contract_id: 'opl_scholarskills_source_projection';
  schema_version: string;
  canonical_source: {
    owner_repo: 'mas-scholar-skills';
    ref: string;
    commit: string;
    contract_path: 'contracts/scholar-skills-capability-modules.json';
    fingerprint_algorithm: 'sha256';
    fingerprint: string;
  };
  projected_fields: {
    identity_fields: string[];
    executable_fields: string[];
    expanded_false_authority_fields: ScholarSkillExpandedAuthorityField[];
  };
  intentional_transformations: Array<{
    transform_id: string;
    source_vocabulary: '--paper-root';
    projected_vocabulary: '--artifact-root';
    applies_to: string[];
    reason: string;
  }>;
  owner_only_metadata_refs: {
    canonical_contract_ref: string;
    projection_policy: string;
    omitted_fields: string[];
    learned_pattern_policy_refs: Partial<Record<ScholarSkillModuleId, string>>;
    display_quality_floor_policy_refs: Partial<Record<ScholarSkillModuleId, string>>;
    omission_reason: string;
  };
  currentness_boundary: {
    snapshot_kind: string;
    canonical_ref_may_advance: true;
    projection_current_only_for_recorded_commit_and_fingerprint: true;
    projection_claims_live_owner_currentness: false;
    sibling_repo_required_in_ci: false;
    refresh_requires_new_owner_commit_and_fingerprint: true;
  };
  projection_fingerprint_policy: {
    algorithm: 'sha256';
    canonicalization: 'stable_json';
    readback_field: 'projection_fingerprint';
    covered_fields: string[];
  };
}

export interface ScholarSkillAuthorityBoundary {
  can_claim_domain_ready: false;
  can_claim_quality_verdict: false;
  can_claim_artifact_authority: false;
  can_claim_production_ready: false;
  can_claim_runtime_ready: false;
  can_claim_publication_readiness: false;
  can_claim_owner_acceptance: false;
  can_claim_current_package_authority: false;
  can_schedule_runtime: false;
  can_write_domain_truth: false;
  can_write_runtime_state: false;
  can_write_memory_body: false;
  can_mutate_artifact_body: false;
  can_sign_owner_receipt: false;
  can_create_typed_blocker: false;
  can_replace_domain_owner: false;
  can_replace_ai_executor_planning: false;
}

export interface ScholarSkillInvocationEntry {
  entry_id: string;
  legacy_entry_ids?: string[];
  entry_kind: string;
  command: string;
  mutation: false;
  descriptor_only: boolean;
  provider_priority?: string[];
  authority_boundary?: string;
  legacy_authority_boundary_alias?: string;
}

export interface ScholarSkillArtifactRef {
  ref_id: string;
  ref_kind: string;
  role: string;
  body_policy: string;
}

export interface ScholarSkillQualityEvidence {
  evidence_kind: string;
  required_ref_shapes: string[];
  can_claim_quality_verdict: false;
}

export interface ScholarSkillDataGovernanceAssessmentPolicy {
  policy_id: string;
  active_module_id: 'mas-scholar-skills.data';
  real_specialist_skill_id: 'medical-data-governance';
  legacy_module_ids: string[];
  legacy_id_policy: string;
  required_handoff_refs: string[];
  assessment_ref_families: string[];
  operation_receipt_categories: string[];
  required_checks: string[];
  no_authority_policy: string;
  can_write_domain_truth: false;
  can_mutate_clinical_data_body: false;
  can_sign_owner_receipt: false;
  can_create_typed_blocker: false;
  can_claim_source_readiness: false;
  can_claim_publication_readiness: false;
}

export interface ScholarSkillRuntimeBridgeEnvelopePolicy {
  refs_only: true;
  prepared: false;
  can_claim_cache_hit: false;
  can_write_runtime_state: false;
  can_claim_runtime_ready: false;
  can_mutate_artifact_body: false;
  can_sign_owner_receipt: false;
  can_create_typed_blocker: false;
  can_claim_publication_readiness: false;
  can_claim_owner_acceptance: false;
  can_claim_current_package_authority: false;
}

export interface ScholarSkillsOwnershipBoundary {
  opl_owned_surfaces: string[];
  package_descriptor_owner: string;
  skill_sync_owner: string;
  runtime_environment_bridge_owner: string;
  professional_skill_truth_owner: string;
  citation_judgment_owner: string;
  domain_truth_owner: string;
  no_authority_policy: string;
  pack_or_bridge_receipt_counts_as_domain_truth: false;
  pack_or_bridge_receipt_counts_as_citation_truth: false;
}

export interface ScholarSkillCapabilityModuleDescriptor {
  module_id: ScholarSkillModuleId;
  brand_family: 'MAS Scholar Skills';
  display_name: string;
  specialist_skill_id?: string;
  legacy_module_ids: string[];
  legacy_module_id_policy?: string;
  stage_fit: string[];
  input_schema_refs: string[];
  output_schema_refs: string[];
  dependency_profile_refs: string[];
  run_context_refs: string[];
  invocation_entries: ScholarSkillInvocationEntry[];
  artifact_refs: ScholarSkillArtifactRef[];
  receipt_policy: {
    accepted_receipt_refs: string[];
    can_sign_owner_receipt: false;
    receipt_body_policy: string;
  };
  quality_evidence: ScholarSkillQualityEvidence;
  authority_boundary: ScholarSkillAuthorityBoundary;
  allowed_writes: string[];
  forbidden_writes: string[];
  data_governance_assessment_policy?: ScholarSkillDataGovernanceAssessmentPolicy;
}

export interface ScholarSkillsCapabilityModulesContract {
  contract_id: 'opl_scholarskills_capability_modules';
  schema_version: string;
  owner: string;
  state: string;
  brand_family: 'MAS Scholar Skills';
  purpose: string;
  machine_boundary: string;
  source_projection_contract: ScholarSkillsSourceProjectionContract;
  ownership_boundary: ScholarSkillsOwnershipBoundary;
  runtime_environment_bridge: {
    mode: 'refs_only';
    owner: 'OPL Framework';
    dependency_profile_owner_commands: string[];
    run_context_owner_commands: string[];
    scholar_skill_prepare_commands?: string[];
    scholar_skill_run_context_commands?: string[];
    scholar_skill_invocation_commands?: string[];
    scholar_skill_receipt_commands?: string[];
    scholar_skill_materialize_commands?: string[];
    scholar_skill_runtime_prepare_commands?: string[];
    scholar_skill_runtime_run_context_commands?: string[];
    bridge_envelope_policy?: ScholarSkillRuntimeBridgeEnvelopePolicy;
    can_write_runtime_state: false;
    can_claim_runtime_ready: false;
    can_claim_domain_ready: false;
    can_claim_publication_readiness: false;
    can_claim_owner_acceptance: false;
    can_claim_current_package_authority: false;
  };
  authority_boundary: ScholarSkillAuthorityBoundary;
  modules: ScholarSkillCapabilityModuleDescriptor[];
}
