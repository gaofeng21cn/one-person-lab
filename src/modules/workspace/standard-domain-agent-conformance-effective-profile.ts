import {
  OPL_HOSTED_FOUNDRY_SEMANTIC_PROVIDER_PROFILE_ID,
  unique,
} from '../pack/index.ts';

type Check = {
  status: string;
  blockers: string[];
};

type ProfiledScaffoldCheck = Check & {
  raw_status: string;
  raw_blockers: string[];
  execution_profile: {
    selected_profile_id: string | null;
  };
};

interface ProfileAwareChecksInput {
  scaffold_validation: ProfiledScaffoldCheck;
  pack_compiler_checks: Check;
  generated_surface_handoff_checks: Check;
  private_surface_checks: Check;
  legacy_runtime_residue_guard: Check;
  generated_interface_checks: Check;
  platform_surface_ownership_checks: Check;
  physical_morphology_checks: Check;
  source_behavior_checks: Check;
  source_closure_checks: Check;
  workspace_file_lifecycle_checks: Check;
  stage_artifact_kernel_adoption_checks: Check;
  stage_run_kernel_profile_checks: Check;
  stage_run_canary_evidence_checks: Check;
  stage_operating_principle_checks: Check;
  stage_quality_route_prompt_alignment_checks: Check;
  standard_agent_principle_checks: Check;
  state_index_kernel_adoption_checks: Check;
  golden_path_default_surface_budget_checks: Check;
  workspace_norm_checks: Check;
}

function checkReadout(
  check: Check,
  input: {
    applicability: string;
    evidence_owner: string;
    effective_blockers?: string[];
    effective_status?: string;
    raw_blocker_count?: number;
    raw_status?: string;
  },
) {
  const effectiveBlockers = input.effective_blockers ?? check.blockers;
  return {
    applicability: input.applicability,
    evidence_owner: input.evidence_owner,
    raw_status: input.raw_status ?? check.status,
    raw_blocker_count: input.raw_blocker_count ?? check.blockers.length,
    effective_status: input.effective_status
      ?? (effectiveBlockers.length === 0 ? 'passed' : 'blocked'),
    effective_blockers: effectiveBlockers,
  };
}

function profileOwnedCheck(
  check: Check,
  hosted: boolean,
  evidenceOwner = 'opl_foundry_kernel',
  hostedStatus = 'opl_hosted',
) {
  return checkReadout(check, {
    applicability: hosted ? 'opl_hosted_by_foundry_kernel' : 'required_from_agent_repo',
    evidence_owner: hosted ? evidenceOwner : 'agent_repo',
    effective_blockers: hosted ? [] : check.blockers,
    effective_status: hosted ? hostedStatus : undefined,
  });
}

export function buildProfileAwareConformanceChecks(input: ProfileAwareChecksInput) {
  const hosted = input.scaffold_validation.execution_profile.selected_profile_id
    === OPL_HOSTED_FOUNDRY_SEMANTIC_PROVIDER_PROFILE_ID;
  const effectiveChecks = {
    scaffold_validation: checkReadout(input.scaffold_validation, {
      applicability: 'profile_aware_repo_structure',
      evidence_owner: 'agent_repo_and_one-person-lab',
      raw_blocker_count: input.scaffold_validation.raw_blockers.length,
      raw_status: input.scaffold_validation.raw_status,
    }),
    pack_compiler_checks: profileOwnedCheck(
      input.pack_compiler_checks,
      hosted,
      'one-person-lab',
    ),
    generated_surface_handoff_checks: checkReadout(input.generated_surface_handoff_checks, {
      applicability: 'required_from_agent_repo', evidence_owner: 'agent_repo',
    }),
    private_surface_checks: checkReadout(input.private_surface_checks, {
      applicability: 'required_from_agent_repo', evidence_owner: 'agent_repo',
    }),
    legacy_runtime_residue_guard: checkReadout(input.legacy_runtime_residue_guard, {
      applicability: 'required_from_agent_repo', evidence_owner: 'agent_repo',
    }),
    generated_interface_checks: checkReadout(input.generated_interface_checks, {
      applicability: 'required_from_one-person-lab', evidence_owner: 'one-person-lab',
    }),
    platform_surface_ownership_checks: checkReadout(input.platform_surface_ownership_checks, {
      applicability: 'required_from_agent_repo', evidence_owner: 'agent_repo',
    }),
    physical_morphology_checks: profileOwnedCheck(
      input.physical_morphology_checks,
      hosted,
      'one-person-lab',
    ),
    source_behavior_checks: checkReadout(input.source_behavior_checks, {
      applicability: 'required_from_agent_repo', evidence_owner: 'agent_repo',
    }),
    source_closure_checks: checkReadout(input.source_closure_checks, {
      applicability: 'required_from_agent_repo',
      evidence_owner: 'agent_repo',
      effective_blockers: input.source_closure_checks.blockers
        .map((blocker) => `source_closure:${blocker}`),
    }),
    workspace_file_lifecycle_checks: profileOwnedCheck(
      input.workspace_file_lifecycle_checks,
      hosted,
      'one-person-lab',
    ),
    stage_artifact_kernel_adoption_checks: profileOwnedCheck(
      input.stage_artifact_kernel_adoption_checks,
      hosted,
      'one-person-lab',
    ),
    stage_run_kernel_profile_checks: profileOwnedCheck(
      input.stage_run_kernel_profile_checks,
      hosted,
    ),
    stage_run_canary_evidence_checks: hosted
      ? checkReadout(input.stage_run_canary_evidence_checks, {
          applicability: 'opl_hosted_live_evidence',
          evidence_owner: 'opl_foundry_kernel',
          effective_blockers: [],
          effective_status: 'opl_hosted_live_evidence_required',
        })
      : profileOwnedCheck(input.stage_run_canary_evidence_checks, false),
    stage_operating_principle_checks: profileOwnedCheck(
      input.stage_operating_principle_checks,
      hosted,
    ),
    stage_quality_route_prompt_alignment_checks: profileOwnedCheck(
      input.stage_quality_route_prompt_alignment_checks,
      hosted,
    ),
    standard_agent_principle_checks: profileOwnedCheck(
      input.standard_agent_principle_checks,
      hosted,
    ),
    state_index_kernel_adoption_checks: profileOwnedCheck(
      input.state_index_kernel_adoption_checks,
      hosted,
    ),
    golden_path_default_surface_budget_checks: profileOwnedCheck(
      input.golden_path_default_surface_budget_checks,
      hosted,
    ),
    workspace_norm_checks: checkReadout(input.workspace_norm_checks, {
      applicability: 'required_from_one-person-lab', evidence_owner: 'one-person-lab',
    }),
  };
  const blockers = unique(Object.values(effectiveChecks)
    .flatMap((check) => check.effective_blockers));
  const rawBlockers = unique([
    ...input.scaffold_validation.raw_blockers,
    ...input.pack_compiler_checks.blockers,
    ...input.generated_surface_handoff_checks.blockers,
    ...input.private_surface_checks.blockers,
    ...input.legacy_runtime_residue_guard.blockers,
    ...input.generated_interface_checks.blockers,
    ...input.platform_surface_ownership_checks.blockers,
    ...input.physical_morphology_checks.blockers,
    ...input.source_behavior_checks.blockers,
    ...input.source_closure_checks.blockers.map((blocker) => `source_closure:${blocker}`),
    ...input.workspace_file_lifecycle_checks.blockers,
    ...input.stage_artifact_kernel_adoption_checks.blockers,
    ...input.stage_run_kernel_profile_checks.blockers,
    ...input.stage_run_canary_evidence_checks.blockers,
    ...input.stage_operating_principle_checks.blockers,
    ...input.stage_quality_route_prompt_alignment_checks.blockers,
    ...input.standard_agent_principle_checks.blockers,
    ...input.state_index_kernel_adoption_checks.blockers,
    ...input.golden_path_default_surface_budget_checks.blockers,
    ...input.workspace_norm_checks.blockers,
  ]);
  return {
    hosted_foundry_provider: hosted,
    effective_checks: effectiveChecks,
    blockers,
    raw_blockers: rawBlockers,
  };
}
