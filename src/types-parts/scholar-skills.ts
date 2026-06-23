export type ScholarSkillModuleId =
  | 'opl.scholarskills.display'
  | 'opl.scholarskills.tables'
  | 'opl.scholarskills.stats'
  | 'opl.scholarskills.omics'
  | 'opl.scholarskills.lit'
  | 'opl.scholarskills.write'
  | 'opl.scholarskills.review'
  | 'opl.scholarskills.submit'
  | 'opl.scholarskills.data'
  | 'opl.scholarskills.intake';

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
  brand_family: 'OPL ScholarSkills';
  display_name: string;
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
}

export interface ScholarSkillsCapabilityModulesContract {
  contract_id: 'opl_scholarskills_capability_modules';
  schema_version: string;
  owner: string;
  state: string;
  brand_family: 'OPL ScholarSkills';
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
