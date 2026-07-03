import type {
  ScholarSkillAuthorityBoundary,
  ScholarSkillCapabilityModuleDescriptor,
  ScholarSkillModuleId,
  ScholarSkillsCapabilityModulesContract,
} from '../../../../../src/kernel/types.ts';

const AUTHORITY_BOUNDARY: ScholarSkillAuthorityBoundary = {
  can_claim_domain_ready: false,
  can_claim_quality_verdict: false,
  can_claim_artifact_authority: false,
  can_claim_production_ready: false,
  can_claim_runtime_ready: false,
  can_schedule_runtime: false,
  can_write_domain_truth: false,
  can_write_runtime_state: false,
  can_write_memory_body: false,
  can_mutate_artifact_body: false,
  can_sign_owner_receipt: false,
  can_create_typed_blocker: false,
  can_replace_domain_owner: false,
  can_replace_ai_executor_planning: false,
};

const MODULE_IDS = [
  'opl.scholarskills.display',
  'opl.scholarskills.tables',
  'opl.scholarskills.stats',
  'opl.scholarskills.lit',
  'opl.scholarskills.write',
  'opl.scholarskills.review',
  'opl.scholarskills.submit',
  'opl.scholarskills.data',
] as const satisfies readonly ScholarSkillModuleId[];

function moduleFixture(moduleId: ScholarSkillModuleId): ScholarSkillCapabilityModuleDescriptor {
  const profile = moduleId.replace('opl.scholarskills.', '');
  return {
    module_id: moduleId,
    brand_family: 'MAS Scholar Skills',
    display_name: `Scholar ${profile}`,
    stage_fit: [`${profile}_fixture_stage`],
    input_schema_refs: [`fixture:${profile}:input`],
    output_schema_refs: [`fixture:${profile}:output`],
    dependency_profile_refs: [`runtime_env_dependency_profile:scholarskills_${profile}_fixture`],
    run_context_refs: [`opl runtime env run-context --domain scholarskills --profile ${profile} --json`],
    invocation_entries: [{
      entry_id: `scholar_${profile}_descriptor`,
      entry_kind: 'descriptor_readback',
      command: `opl scholar-skills inspect --module ${moduleId} --json`,
      mutation: false,
      descriptor_only: true,
    }],
    artifact_refs: [{
      ref_id: `scholarskills_${profile}_candidate_refs`,
      ref_kind: 'candidate_artifact_ref',
      role: 'fixture_candidate_output',
      body_policy: 'body_owned_by_domain_artifact_surface',
    }],
    receipt_policy: {
      accepted_receipt_refs: ['owner_receipt_ref', 'typed_blocker_ref'],
      can_sign_owner_receipt: false,
      receipt_body_policy: 'domain_owner_receipt_or_typed_blocker_required_for_authority',
    },
    quality_evidence: {
      evidence_kind: 'fixture_quality_refs',
      required_ref_shapes: ['fixture_ref'],
      can_claim_quality_verdict: false,
    },
    authority_boundary: { ...AUTHORITY_BOUNDARY },
    allowed_writes: [],
    forbidden_writes: ['domain truth', 'artifact bodies', 'runtime queues/outbox/state'],
  };
}

export const MINIMAL_SCHOLAR_SKILLS_CAPABILITY_MODULES_CONTRACT: ScholarSkillsCapabilityModulesContract = {
  contract_id: 'opl_scholarskills_capability_modules',
  schema_version: 'test',
  owner: 'One Person Lab',
  state: 'fixture',
  brand_family: 'MAS Scholar Skills',
  purpose: 'Fixture ScholarSkills capability module catalog.',
  machine_boundary: 'Fixture only; no authority or runtime readiness claim.',
  runtime_environment_bridge: {
    mode: 'refs_only',
    owner: 'OPL Framework',
    dependency_profile_owner_commands: [
      'opl runtime env prepare --domain scholarskills --profile <profile> --platform <platform> --requirement-profile <path> --paper-root <path> --json',
    ],
    run_context_owner_commands: [
      'opl runtime env run-context --domain scholarskills --profile <profile> --json',
    ],
    can_write_runtime_state: false,
    can_claim_runtime_ready: false,
    can_claim_domain_ready: false,
  },
  authority_boundary: { ...AUTHORITY_BOUNDARY },
  modules: MODULE_IDS.map(moduleFixture),
};
