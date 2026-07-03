export type ScholarSkillModuleId =
  | 'mas-scholar-skills.display'
  | 'mas-scholar-skills.tables'
  | 'mas-scholar-skills.stats'
  | 'mas-scholar-skills.lit'
  | 'mas-scholar-skills.write'
  | 'mas-scholar-skills.review'
  | 'mas-scholar-skills.submit'
  | 'mas-scholar-skills.data';

export interface ScholarSkillAuthorityBoundary {
  can_claim_domain_ready: false;
  can_claim_quality_verdict: false;
  can_claim_artifact_authority: false;
  can_claim_production_ready: false;
  can_claim_runtime_ready: false;
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
  entry_kind: string;
  command: string;
  mutation: false;
  descriptor_only: true;
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
}

export interface ScholarSkillCapabilityModuleDescriptor {
  module_id: ScholarSkillModuleId;
  brand_family: 'MAS Scholar Skills';
  display_name: string;
  specialist_skill_id?: string;
  legacy_module_ids?: string[];
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
  };
  authority_boundary: ScholarSkillAuthorityBoundary;
  modules: ScholarSkillCapabilityModuleDescriptor[];
}
