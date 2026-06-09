import { assert, fs, path, runCli, test } from '../helpers.ts';
import {
  buildReadyAgentRepo,
  configureReadyMagMorphology,
  configureReadyMetaMorphology,
  configureReadyRcaMorphology,
  retargetReadyRepo,
  retargetReadyRepoToMag,
  writeJson,
  writeProductionAcceptance,
} from './agents-conformance-fixtures.ts';
import { assertStageOperatingPrincipleChecksPassed } from './agents-conformance-stage-operating-principles-assertions.ts';

test('agents conformance reports structural readiness separately from production evidence tail', () => {
  const repoDir = buildReadyAgentRepo();
  const platformSurfaces = runCli([
    'agents',
    'platform-surfaces',
    '--agent',
    `sample=${repoDir}`,
  ]).agent_platform_surface_ownership;

  assert.equal(platformSurfaces.surface_kind, 'opl_agent_platform_surface_ownership_report');
  assert.equal(platformSurfaces.owner, 'one-person-lab');
  assert.equal(platformSurfaces.status, 'passed');
  assert.equal(platformSurfaces.summary.total_repo_count, 1);
  assert.equal(platformSurfaces.summary.generic_subdomain_count, 7);
  assert.equal(platformSurfaces.summary.explicit_forbidden_owner_claim_count, 0);
  assert.deepEqual(platformSurfaces.reports[0].retained_domain_authority, [
    'domain_truth',
    'quality_or_export_or_publication_or_visual_verdict',
    'artifact_body_and_mutation_authority',
    'source_readiness_verdict',
    'memory_body_accept_reject',
    'owner_receipt_signing',
    'typed_blocker_materialization',
    'domain_specific_policy_rubric_or_quality_gate',
  ]);
  assert.equal(
    platformSurfaces.reports[0].generic_subdomains
      .some((surface: { subdomain_id: string; owner: string }) => (
        surface.subdomain_id === 'generated_domain_handler_dispatch_shell'
        && surface.owner === 'one-person-lab'
      )),
    true,
  );
  const actionMetadataSurface = platformSurfaces.reports[0].generic_subdomains
    .find((surface: { subdomain_id: string }) => (
      surface.subdomain_id === 'generated_action_metadata_command_registration_shell'
    ));
  assert.equal(Boolean(actionMetadataSurface), true);
  assert.equal(actionMetadataSurface.owner, 'one-person-lab');
  assert.equal(
    actionMetadataSurface.domain_allowed_role,
    'domain_action_ids_handler_refs_or_refs_only_metadata_source',
  );
  assert.equal(
    actionMetadataSurface.observed_source_refs.includes('contracts/action_catalog.json'),
    true,
  );
  assert.equal(platformSurfaces.authority_boundary.report_can_claim_domain_ready, false);

  const conformancePayload = runCli([
    'agents',
    'conformance',
    '--agent',
    `sample=${repoDir}`,
  ]);
  const report = conformancePayload.standard_domain_agent_conformance;

  assert.equal(report.surface_kind, 'opl_standard_domain_agent_conformance_report');
  assert.equal(report.owner, 'one-person-lab');
  assert.equal(report.status, 'passed');
  assert.equal(report.total_repo_count, 1);
  assert.equal(report.passed_count, 1);
  assert.equal(report.blocked_count, 0);
  assert.equal(report.structural_conformance_status, 'passed');
  assert.equal(report.structural_contract_status, 'passed');
  assert.equal(report.ordinary_path_guard_status, 'passed');
  assert.equal(report.live_domain_progress_status, 'required_from_domain_owner');
  assert.equal(report.live_domain_progress_status, report.live_stage_run_progress_evidence_status);
  assert.equal(report.production_evidence_tail_count, 2);
  assert.equal(report.production_evidence_tail_policy, 'reported_separately_not_a_structural_pass_condition');
  assert.equal(report.summary.total_repo_count, 1);
  assert.equal(report.summary.passed_count, 1);
  assert.equal(report.summary.blocked_count, 0);
  assert.equal(report.summary.structural_conformance_status, 'passed');
  assert.equal(report.summary.structural_contract_status, 'passed');
  assert.equal(report.summary.ordinary_path_guard_status, 'passed');
  assert.equal(report.summary.live_domain_progress_status, 'required_from_domain_owner');
  assert.equal(report.summary.production_evidence_tail_count, 2);
  assert.equal(conformancePayload.passed_count, report.passed_count);
  assert.equal(conformancePayload.blocked_count, report.blocked_count);
  assert.equal(
    conformancePayload.structural_conformance_status,
    report.structural_conformance_status,
  );
  assert.equal(conformancePayload.structural_contract_status, report.structural_contract_status);
  assert.equal(conformancePayload.ordinary_path_guard_status, report.ordinary_path_guard_status);
  assert.equal(conformancePayload.live_domain_progress_status, report.live_domain_progress_status);
  assert.equal(
    conformancePayload.production_evidence_tail_count,
    report.production_evidence_tail_count,
  );
  assert.equal(
    conformancePayload.production_evidence_tail_policy,
    'reported_separately_not_a_structural_pass_condition',
  );
  assert.equal(
    conformancePayload.live_stage_run_progress_evidence_status,
    'required_from_domain_owner',
  );
  assert.equal(conformancePayload.live_stage_run_progress_evidence_open_domain_count, 1);
  assert.equal(
    conformancePayload.live_stage_run_progress_evidence_policy,
    'controlled_canary_and_structural_conformance_do_not_close_live_domain_progress_evidence',
  );
  const adoptionReadModel = conformancePayload.stage_run_domain_adoption_read_model;
  assert.deepEqual(adoptionReadModel, report.stage_run_domain_adoption_read_model);
  assert.equal(
    conformancePayload.live_stage_run_progress_evidence_status,
    adoptionReadModel.live_stage_run_progress_evidence_status,
  );
  assert.equal(
    conformancePayload.live_stage_run_progress_evidence_open_domain_count,
    adoptionReadModel.live_stage_run_progress_evidence_worklist.open_domain_count,
  );
  assert.equal(
    conformancePayload.live_stage_run_progress_evidence_policy,
    adoptionReadModel.live_stage_run_progress_evidence_policy,
  );
  assert.equal(
    report.live_stage_run_progress_evidence_status,
    adoptionReadModel.live_stage_run_progress_evidence_status,
  );
  assert.equal(report.live_stage_run_progress_evidence_open_domain_count, 1);
  assert.equal(
    report.summary.live_stage_run_progress_evidence_status,
    adoptionReadModel.live_stage_run_progress_evidence_status,
  );
  assert.equal(report.summary.live_stage_run_progress_evidence_open_domain_count, 1);
  assert.equal(adoptionReadModel.surface_kind, 'opl_stage_run_domain_adoption_read_model');
  assert.equal(adoptionReadModel.status, 'passed');
  assert.equal(adoptionReadModel.domain_count, 1);
  assert.equal(adoptionReadModel.stage_run_kernel_profile_passed_count, 1);
  assert.equal(adoptionReadModel.stage_run_canary_evidence_passed_count, 1);
  assert.equal(adoptionReadModel.controlled_canary_evidence_scope, 'controlled_fixture_not_live_domain_progress');
  assert.equal(adoptionReadModel.production_evidence_tail_count, 2);
  assert.equal(adoptionReadModel.open_production_evidence_tail_count, 2);
  assert.equal(adoptionReadModel.domain_production_acceptance_tail_count, 2);
  assert.equal(adoptionReadModel.open_domain_production_acceptance_tail_count, 2);
  assert.equal(
    adoptionReadModel.domain_production_acceptance_tail_policy,
    'domain_owned_acceptance_refs_are_reported_separately_from_live_stage_run_progress',
  );
  assert.equal(
    adoptionReadModel.live_stage_run_progress_evidence_status,
    'required_from_domain_owner',
  );
  assert.equal(
    adoptionReadModel.live_stage_run_progress_evidence_policy,
    'controlled_canary_and_structural_conformance_do_not_close_live_domain_progress_evidence',
  );
  const liveProgressWorklist = adoptionReadModel.live_stage_run_progress_evidence_worklist;
  assert.equal(liveProgressWorklist.surface_kind, 'opl_live_stage_run_progress_evidence_worklist');
  assert.equal(liveProgressWorklist.owner, 'domain_owner');
  assert.equal(liveProgressWorklist.status, 'required_from_domain_owner');
  assert.equal(liveProgressWorklist.open_domain_count, 1);
  assert.deepEqual(liveProgressWorklist.accepted_refs_only_result_shapes, [
    'domain_owner_receipt_ref',
    'typed_blocker_ref',
    'human_gate_ref',
    'quality_or_export_receipt_ref',
    'no_regression_ref',
    'long_soak_ref',
  ]);
  assert.equal(liveProgressWorklist.authority_boundary.can_claim_live_domain_progress, false);
  assert.equal(liveProgressWorklist.authority_boundary.can_claim_domain_ready, false);
  assert.equal(liveProgressWorklist.authority_boundary.can_sign_owner_receipt, false);
  assert.equal(liveProgressWorklist.authority_boundary.can_create_typed_blocker, false);
  assert.equal(adoptionReadModel.conformance_pass_counts_as_domain_ready, false);
  assert.equal(adoptionReadModel.conformance_pass_counts_as_production_ready, false);
  assert.equal(adoptionReadModel.authority_boundary.can_claim_domain_ready, false);
  assert.equal(adoptionReadModel.authority_boundary.can_create_typed_blocker, false);
  assert.equal(report.summary.stage_run_domain_adoption_status, 'passed');
  assert.equal(
    report.summary.stage_run_controlled_canary_evidence_scope,
    'controlled_fixture_not_live_domain_progress',
  );
  assert.equal(report.authority_boundary.conformance_report_can_claim_domain_ready, false);

  const repo = report.reports[0];
  const adoptionDomain = adoptionReadModel.domains[0];
  assert.equal(adoptionDomain.domain_id, repo.domain_id);
  assert.equal(adoptionDomain.stage_run_kernel_profile_status, 'passed');
  assert.equal(adoptionDomain.stage_run_canary_evidence_status, 'passed');
  assert.equal(adoptionDomain.stage_run_canary_evidence_scope, 'controlled_fixture_not_live_domain_progress');
  assert.equal(adoptionDomain.stage_run_canary_operator_status, 'ready');
  assert.equal(adoptionDomain.controlled_canary_claims_live_domain_progress, false);
  assert.equal(
    adoptionDomain.domain_production_acceptance_tail_status,
    'production_evidence_tail_present',
  );
  assert.equal(adoptionDomain.domain_production_acceptance_tail_count, 2);
  assert.equal(adoptionDomain.domain_production_acceptance_tail_open_count, 2);
  assert.equal(adoptionDomain.domain_production_acceptance_tail_typed_blocker_count, 0);
  assert.equal(
    adoptionDomain.domain_production_acceptance_tail_scope,
    'domain_owned_acceptance_refs_not_live_stage_run_progress_evidence',
  );
  assert.equal(adoptionDomain.production_evidence_tail_status, 'production_evidence_tail_present');
  assert.equal(
    adoptionDomain.live_stage_run_progress_evidence_status,
    'required_from_domain_owner',
  );
  assert.equal(adoptionDomain.live_stage_run_progress_evidence_required_from, 'domain_owner');
  assert.equal(adoptionDomain.structural_conformance_is_domain_ready, false);
  assert.equal(liveProgressWorklist.domains[0].domain_id, adoptionDomain.domain_id);
  assert.equal(
    liveProgressWorklist.domains[0].next_required_owner_action,
    adoptionDomain.next_required_owner_action,
  );
  assert.equal(liveProgressWorklist.domains[0].conformance_can_claim_domain_ready, false);
  assert.equal(liveProgressWorklist.domains[0].can_create_typed_blocker, false);
  assert.equal(
    adoptionDomain.next_required_owner_action,
    'domain_owner_live_receipt_typed_blocker_no_regression_or_long_soak_ref_required',
  );
  assert.equal(adoptionDomain.authority_boundary.can_claim_production_ready, false);
  assert.equal(repo.status, 'passed');
  assert.deepEqual(repo.blockers, []);
  assert.equal(repo.scaffold_validation.status, 'passed');
  assert.equal(repo.pack_compiler_checks.canonical_semantic_pack_root, 'agent/');
  assert.deepEqual(repo.pack_compiler_checks.legacy_pack_root_fields, []);
  assert.deepEqual(repo.pack_compiler_checks.readme_required_paths, []);
  assert.equal(repo.generated_surface_handoff_checks.generated_surface_owner, 'one-person-lab');
  assert.equal(repo.private_surface_checks.domain_can_claim_generic_runtime_owner, false);
  assert.equal(repo.platform_surface_ownership_checks.status, 'passed');
  assert.equal(repo.platform_surface_ownership_checks.generic_subdomain_count, 7);
  assert.deepEqual(repo.platform_surface_ownership_checks.explicit_forbidden_owner_claims, []);
  assert.equal(repo.platform_surface_ownership_checks.authority_boundary.report_can_claim_production_ready, false);
  assert.equal(repo.generated_interface_checks.generated_interfaces_status, 'ready');
  assert.equal(repo.generated_interface_checks.generated_wrapper_bundle_status, 'ready');
  assert.equal(repo.generated_interface_checks.active_caller_target_proof_status, 'ready');
  assert.equal(
    repo.generated_interface_checks.active_caller_cutover_proof_status,
    'cutover_to_opl_generated_or_domain_handler_targets',
  );
  assert.equal(repo.physical_morphology_checks.status, 'passed');
  assert.equal(repo.physical_morphology_checks.policy_status, 'declared');
  assert.equal(repo.workspace_file_lifecycle_checks.status, 'passed');
  assert.equal(repo.workspace_file_lifecycle_checks.policy_status, 'declared');
  assert.equal(repo.stage_artifact_kernel_adoption_checks.status, 'passed');
  assert.equal(repo.stage_artifact_kernel_adoption_checks.policy_status, 'declared');
  assert.deepEqual(repo.stage_artifact_kernel_adoption_checks.stage_folder_unit, [
    'Stage Folder',
    'Manifest',
    'Receipt',
    'current pointer',
  ]);
  assert.equal(
    repo.stage_artifact_kernel_adoption_checks.projection_boundary.file_presence_only_counts_as,
    'orphan_or_historical',
  );
  assert.equal(
    repo.stage_artifact_kernel_adoption_checks.projection_boundary.provider_completion_counts_as_progress,
    false,
  );
  assert.equal(
    repo.stage_artifact_kernel_adoption_checks.authority_boundary.opl_can_create_domain_owner_receipt,
    false,
  );
  assert.equal(repo.stage_run_kernel_profile_checks.status, 'passed');
  assert.equal(repo.stage_run_kernel_profile_checks.profile_status, 'declared');
  assert.equal(repo.stage_run_kernel_profile_checks.kernel_role, 'minimal_state_shell_not_domain_controller_system');
  assert.deepEqual(repo.stage_run_kernel_profile_checks.stage_native_unit, [
    'stage_folder',
    'stage_manifest',
    'role_artifacts',
    'owner_receipt_or_typed_blocker',
  ]);
  assert.deepEqual(repo.stage_run_kernel_profile_checks.required_object_models, [
    'StageRun',
    'RoleArtifactRef',
    'OwnerReceipt',
    'TypedBlocker',
    'ReadModel',
  ]);
  assert.equal(
    repo.stage_run_kernel_profile_checks.stage_run_state_machine.provider_completion_counts_as_domain_accepted,
    false,
  );
  assert.equal(
    repo.stage_run_kernel_profile_checks.stage_run_state_machine.file_presence_counts_as_stage_complete,
    false,
  );
  assert.equal(
    repo.stage_run_kernel_profile_checks.transition_authority.terminal_transition_authority,
    'owner_receipt_or_typed_blocker',
  );
  assert.equal(
    repo.stage_run_kernel_profile_checks.authority_boundary.opl_can_sign_domain_owner_receipt,
    false,
  );
  assert.equal(repo.stage_run_canary_evidence_checks.status, 'passed');
  assert.equal(repo.stage_run_canary_evidence_checks.evidence_status, 'declared');
  assert.equal(
    repo.stage_run_canary_evidence_checks.evidence_scope,
    'controlled_fixture_not_live_domain_progress',
  );
  assert.deepEqual(
    Object.keys(repo.stage_run_canary_evidence_checks.strategy_trace),
    [
      'candidate_generation',
      'grounded_reflection',
      'comparative_selection',
      'evolution_and_revision',
      'meta_review_learning',
      'independent_quality_gate',
    ],
  );
  assert.equal(
    repo.stage_run_canary_evidence_checks.closeout.same_attempt_self_review,
    false,
  );
  assert.equal(repo.workspace_norm_checks.status, 'passed');
  assert.equal(repo.workspace_norm_checks.default_precondition_command, 'opl workspace ensure');
  assert.equal(repo.workspace_norm_checks.app_action_id, 'workspace_ensure');
  assert.equal(repo.workspace_norm_checks.descriptor_delegate_tool, 'opl_workspace_ensure');
  assert.equal(repo.workspace_norm_checks.descriptor_delegate_is_mcp_runtime, false);
  assert.equal(repo.workspace_norm_checks.user_default_surface, 'workspace_local_project_stage_outputs');
  assert.equal(repo.workspace_norm_checks.runtime_state_is_default_user_surface, false);
  assert.equal(repo.workspace_norm_checks.conformance_pass_counts_as_domain_ready, false);
  assert.equal(repo.workspace_norm_projection.contract_ref, 'contracts/opl-framework/agent-workspace-norm-contract.json');
  assert.equal(repo.workspace_norm_projection.default_workspace_precondition.must_run_before_domain_task_when_no_active_binding, true);
  assert.equal(
    repo.stage_run_canary_evidence_checks.authority_boundary.controlled_canary_claims_live_domain_progress,
    false,
  );
  assertStageOperatingPrincipleChecksPassed(repo);
  assert.equal(repo.legacy_runtime_residue_guard.status, 'passed');
  assert.equal(repo.legacy_runtime_residue_guard.active_private_generic_residue_count, 0);
  assert.equal(
    repo.legacy_runtime_residue_guard.authority_boundary.domain_agent_can_own_generic_scheduler_or_queue,
    false,
  );
  assert.deepEqual(repo.workspace_file_lifecycle_checks.repo_source_boundaries.required_roots, [
    'agent/',
    'contracts/',
    'runtime/authority_functions/',
    'docs/',
    'src/ or packages/',
  ]);
  assert.equal(
    repo.workspace_file_lifecycle_checks.authority_boundary
      .policy_can_claim_domain_ready_or_artifact_authority,
    false,
  );
  assert.equal(repo.evidence_tail_classification.status, 'production_evidence_tail_present');
  assert.equal(repo.evidence_tail_classification.tail_items.length, 2);
  assert.deepEqual(
    repo.evidence_tail_classification.tail_items.map((item: { status: string }) => item.status),
    ['open', 'open'],
  );
  assert.equal(repo.evidence_tail_classification.tail_items[0].repo_path, repoDir);
  assert.equal(repo.evidence_tail_classification.tail_items[0].authority_boundary.conformance_report_can_claim_domain_ready, false);
});

test('agents conformance exposes a live family probe over generated interfaces, action catalog, stage plane, and admission gates', () => {
  const repoDir = buildReadyAgentRepo();
  const payload = runCli([
    'agents',
    'conformance',
    '--agent',
    `sample=${repoDir}`,
  ]);
  const report = payload.standard_domain_agent_conformance;
  const probe = report.family_live_conformance_probe;
  const domain = probe.domains[0];

  assert.equal(payload.family_live_conformance_probe_status, 'passed');
  assert.equal(payload.family_live_conformance_probe_blocked_domain_count, 0);
  assert.equal(report.family_live_conformance_probe_status, 'passed');
  assert.equal(report.summary.family_live_conformance_probe_status, 'passed');
  assert.equal(probe.surface_kind, 'opl_family_live_conformance_probe');
  assert.equal(probe.status, 'passed');
  assert.equal(probe.total_domain_count, 1);
  assert.equal(probe.passed_domain_count, 1);
  assert.equal(probe.blocked_domain_count, 0);

  assert.equal(domain.surface_kind, 'opl_family_live_conformance_probe_domain');
  assert.equal(domain.domain_id, 'sample-brief-agent');
  assert.equal(domain.status, 'passed');
  assert.equal(domain.live_inputs.generated_interfaces.status, 'passed');
  assert.equal(domain.live_inputs.generated_interfaces.generated_interfaces_status, 'ready');
  assert.equal(domain.live_inputs.action_catalog.status, 'passed');
  assert.equal(domain.live_inputs.action_catalog.action_count > 0, true);
  assert.equal(domain.live_inputs.stage_plane.status, 'passed');
  assert.equal(domain.live_inputs.stage_plane.stage_count > 0, true);
  assert.equal(
    domain.standard_admission_gate_contract.version,
    'standard-agent-admission-gates.v1',
  );
  assert.equal(domain.blocked_gate_count, 0);
  assert.equal(
    domain.gate_results.some((gate: { gate_id: string; status: string }) =>
      gate.gate_id === 'generated_surface_default_entry' && gate.status === 'passed'
    ),
    true,
  );
  assert.equal(
    domain.gate_results.some((gate: { gate_id: string; status: string }) =>
      gate.gate_id === 'standard_pack_abi' && gate.status === 'passed'
    ),
    true,
  );
  assert.equal(domain.false_authority_boundary.domain_ready_authorized, false);
  assert.equal(domain.false_authority_boundary.production_ready_authorized, false);
  assert.equal(domain.false_authority_boundary.conformance_probe_can_admit_domain, false);
  assert.equal(domain.false_authority_boundary.conformance_probe_can_write_domain_truth, false);
  assert.equal(domain.false_authority_boundary.conformance_probe_can_create_owner_receipt, false);
  assert.equal(domain.false_authority_boundary.conformance_probe_can_create_typed_blocker, false);
  assert.equal(probe.false_authority_boundary.domain_ready_authorized, false);
  assert.equal(probe.false_authority_boundary.production_ready_authorized, false);
  assert.equal(Object.hasOwn(probe, 'domain_ready'), false);
  assert.equal(Object.hasOwn(probe, 'production_ready'), false);
  assert.equal(Object.hasOwn(domain, 'domain_ready'), false);
  assert.equal(Object.hasOwn(domain, 'production_ready'), false);
});

test('agents conformance live family probe blocks admission gates when a domain stage plane is missing', () => {
  const repoDir = buildReadyAgentRepo();
  fs.rmSync(path.join(repoDir, 'contracts', 'stage_control_plane.json'));

  const payload = runCli([
    'agents',
    'conformance',
    '--agent',
    `sample=${repoDir}`,
  ]);
  const probe = payload.standard_domain_agent_conformance.family_live_conformance_probe;
  const domain = probe.domains[0];
  const generatedSurfaceGate = domain.gate_results.find((gate: { gate_id: string }) =>
    gate.gate_id === 'generated_surface_default_entry'
  );
  const packAbiGate = domain.gate_results.find((gate: { gate_id: string }) =>
    gate.gate_id === 'standard_pack_abi'
  );

  assert.equal(payload.family_live_conformance_probe_status, 'blocked');
  assert.equal(probe.status, 'blocked');
  assert.equal(probe.blocked_domain_count, 1);
  assert.equal(domain.status, 'blocked');
  assert.equal(domain.live_inputs.stage_plane.status, 'blocked');
  assert.equal(
    domain.live_inputs.stage_plane.blockers.includes('stage_plane_missing'),
    true,
  );
  assert.equal(generatedSurfaceGate.status, 'blocked');
  assert.equal(
    generatedSurfaceGate.blockers.some((blocker: string) => blocker.includes('stage_plane_missing')),
    true,
  );
  assert.equal(packAbiGate.status, 'blocked');
  assert.equal(domain.false_authority_boundary.domain_ready_authorized, false);
  assert.equal(domain.false_authority_boundary.production_ready_authorized, false);
});

test('agents platform-surfaces projects RCA guarded action catalog as action metadata shell only', () => {
  const repoDir = buildReadyAgentRepo();
  retargetReadyRepo(repoDir, 'redcube-ai', 'RedCube AI');
  configureReadyRcaMorphology(repoDir);
  const guardedActionCatalogPath = path.join(
    repoDir,
    'packages',
    'redcube-domain-entry',
    'src',
    'actions',
    'domain-action-adapter-parts',
    'guarded-action-catalog.ts',
  );
  fs.mkdirSync(path.dirname(guardedActionCatalogPath), { recursive: true });
  fs.writeFileSync(
    guardedActionCatalogPath,
    [
      'export const rcaGuardedActionCatalog = {',
      "  surfaceKind: 'rca_guarded_action_catalog',",
      "  role: 'domain_action_metadata_refs_only_source',",
      '};',
      '',
    ].join('\n'),
    'utf8',
  );

  const platformSurfaces = runCli([
    'agents',
    'platform-surfaces',
    '--agent',
    `rca=${repoDir}`,
  ]).agent_platform_surface_ownership;

  const rcaReport = platformSurfaces.reports[0];
  const actionMetadataSurface = rcaReport.generic_subdomains
    .find((surface: { subdomain_id: string }) => (
      surface.subdomain_id === 'generated_action_metadata_command_registration_shell'
    ));

  assert.equal(platformSurfaces.status, 'passed');
  assert.equal(actionMetadataSurface.owner, 'one-person-lab');
  assert.equal(
    actionMetadataSurface.observed_source_refs.includes(
      'packages/redcube-domain-entry/src/actions/domain-action-adapter-parts/guarded-action-catalog.ts',
    ),
    true,
  );
  assert.equal(rcaReport.authority_boundary.report_can_claim_domain_ready, false);
  assert.equal(rcaReport.authority_boundary.report_can_claim_production_ready, false);
});

test('agents conformance canonicalizes StageRun adoption owner-facing domain ids', () => {
  const repoDir = buildReadyAgentRepo();
  retargetReadyRepo(repoDir, 'redcube_ai', 'RedCube AI');
  configureReadyRcaMorphology(repoDir);

  const report = runCli([
    'agents',
    'conformance',
    '--agent',
    `rca=${repoDir}`,
  ]).standard_domain_agent_conformance;

  const adoptionDomain = report.stage_run_domain_adoption_read_model.domains[0];
  assert.equal(report.status, 'passed');
  assert.equal(report.reports[0].domain_id, 'redcube_ai');
  assert.equal(adoptionDomain.domain_id, 'redcube-ai');
  assert.equal(adoptionDomain.source_domain_id, 'redcube_ai');
  assert.equal(adoptionDomain.authority_boundary.can_claim_domain_ready, false);
});

test('agents conformance keeps StageRun next action on domain owner when non-StageRun conformance is blocked', () => {
  const repoDir = buildReadyAgentRepo();
  fs.rmSync(path.join(repoDir, 'contracts', 'workspace_lifecycle_policy.json'));

  const report = runCli([
    'agents',
    'conformance',
    '--agent',
    `sample=${repoDir}`,
  ]).standard_domain_agent_conformance;

  const repo = report.reports[0];
  const adoptionDomain = report.stage_run_domain_adoption_read_model.domains[0];
  assert.equal(report.status, 'blocked');
  assert.equal(report.passed_count, 0);
  assert.equal(report.blocked_count, 1);
  assert.equal(report.structural_conformance_status, 'blocked');
  assert.equal(report.structural_contract_status, 'blocked');
  assert.equal(report.ordinary_path_guard_status, 'passed');
  assert.equal(report.live_domain_progress_status, 'required_from_domain_owner');
  assert.equal(report.summary.structural_contract_status, 'blocked');
  assert.equal(report.summary.ordinary_path_guard_status, 'passed');
  assert.equal(report.summary.live_domain_progress_status, 'required_from_domain_owner');
  assert.equal(report.live_stage_run_progress_evidence_status, 'required_from_domain_owner');
  assert.equal(report.live_stage_run_progress_evidence_open_domain_count, 1);
  assert.equal(
    report.summary.live_stage_run_progress_evidence_status,
    'required_from_domain_owner',
  );
  assert.equal(report.summary.live_stage_run_progress_evidence_open_domain_count, 1);
  assert.equal(repo.workspace_file_lifecycle_checks.status, 'blocked');
  assert.equal(repo.stage_run_kernel_profile_checks.status, 'passed');
  assert.equal(repo.stage_run_canary_evidence_checks.status, 'passed');
  assert.equal(report.stage_run_domain_adoption_read_model.status, 'passed');
  assert.equal(
    adoptionDomain.live_stage_run_progress_evidence_status,
    'required_from_domain_owner',
  );
  assert.equal(
    adoptionDomain.next_required_owner_action,
    'domain_owner_live_receipt_typed_blocker_no_regression_or_long_soak_ref_required',
  );
  assert.equal(adoptionDomain.authority_boundary.can_create_typed_blocker, false);
  assert.equal(adoptionDomain.authority_boundary.can_claim_domain_ready, false);
});

test('agents conformance marks live domain progress blocked when StageRun ordinary guard is blocked', () => {
  const repoDir = buildReadyAgentRepo();
  fs.rmSync(path.join(repoDir, 'contracts', 'stage_run_kernel_profile.json'));

  const payload = runCli([
    'agents',
    'conformance',
    '--agent',
    `sample=${repoDir}`,
  ]);
  const report = payload.standard_domain_agent_conformance;

  assert.equal(report.status, 'blocked');
  assert.equal(report.structural_conformance_status, 'blocked');
  assert.equal(report.structural_contract_status, 'blocked');
  assert.equal(report.ordinary_path_guard_status, 'blocked');
  assert.equal(report.live_domain_progress_status, 'blocked');
  assert.equal(report.summary.structural_contract_status, 'blocked');
  assert.equal(report.summary.ordinary_path_guard_status, 'blocked');
  assert.equal(report.summary.live_domain_progress_status, 'blocked');
  assert.equal(payload.structural_contract_status, 'blocked');
  assert.equal(payload.ordinary_path_guard_status, 'blocked');
  assert.equal(payload.live_domain_progress_status, 'blocked');
  assert.equal(report.stage_run_domain_adoption_read_model.status, 'blocked');
  assert.equal(report.reports[0].stage_run_kernel_profile_checks.status, 'blocked');
  assert.equal(
    report.reports[0].blockers.includes('stage_run_kernel_profile_missing'),
    true,
  );
});

test('agents conformance reads domain-owned production acceptance evidence without claiming domain ready', () => {
  const masRepo = buildReadyAgentRepo();
  retargetReadyRepo(masRepo, 'med-autoscience', 'Med Auto Science');

  const magRepo = buildReadyAgentRepo();
  retargetReadyRepoToMag(magRepo);
  configureReadyMagMorphology(magRepo);
  writeProductionAcceptance(magRepo, 'mag-production-acceptance.json', {
    evidence_tail_status: 'closed_by_domain_owned_acceptance_receipt',
    domain_owner: 'med-autogrant',
    closure_evidence: {
      accepted_return_shape: 'owner_receipt',
      next_verification_ref: 'verification:mag/production-default-caller',
    },
    refs: {
      owner_receipt_refs: ['receipt:mag/production-default-caller'],
      doc_refs: ['docs/status.md#production-acceptance'],
      next_verification_command_refs: ['mag production acceptance --json'],
      agent_lab_handoff_refs: ['agent-lab-handoff:mag/owner-receipt-scaleout'],
    },
    authority_boundary: {
      domain_ready_claimed: false,
    },
  });

  const rcaRepo = buildReadyAgentRepo();
  retargetReadyRepo(rcaRepo, 'redcube-ai', 'RedCube AI');
  configureReadyRcaMorphology(rcaRepo);
  writeProductionAcceptance(rcaRepo, 'rca-production-acceptance.json', {
    evidence_tail_status: 'domain_owned_typed_blocker_with_next_verification_ref',
    domain_owner: 'redcube-ai',
    closure_evidence: {
      accepted_return_shape: 'typed_blocker',
      typed_blocker_kind: 'live_visual_soak_pending',
      next_verification_ref: 'verification:rca/live-visual-soak',
    },
    refs: {
      typed_blocker_refs: ['blocker:rca/live-visual-soak'],
      artifact_receipt_refs: ['artifact-receipt:rca/last-known-good'],
      doc_refs: ['docs/status.md#production-evidence-tail'],
      next_verification_command_refs: ['rca acceptance verify --json'],
    },
    authority_boundary: {
      domain_ready_claimed: false,
    },
  });

  const metaRepo = buildReadyAgentRepo();
  retargetReadyRepo(metaRepo, 'opl-meta-agent', 'OPL Meta Agent');
  configureReadyMetaMorphology(metaRepo);
  writeProductionAcceptance(metaRepo, 'meta-production-acceptance.json', {
    status: 'domain_owner_receipt_observed',
    domain_owner: 'opl-meta-agent',
    receipt_ref: 'receipt:meta-agent/real-target-scaleout',
    doc_ref: 'docs/status.md#managed-module-acceptance',
    next_verification_command: 'opl-meta-agent acceptance verify --json',
    authority_boundary: {
      domain_ready_claimed: false,
    },
  });

  const report = runCli([
    'agents',
    'conformance',
    '--agent',
    `mas=${masRepo}`,
    '--agent',
    `mag=${magRepo}`,
    '--agent',
    `rca=${rcaRepo}`,
    '--agent',
    `opl-meta-agent=${metaRepo}`,
  ]).standard_domain_agent_conformance;

  assert.equal(report.status, 'passed');
  assert.equal(report.summary.total_repo_count, 4);
  assert.equal(report.summary.passed_count, 4);
  assert.equal(report.summary.structural_conformance_status, 'passed');
  assert.equal(report.authority_boundary.conformance_report_can_claim_domain_ready, false);

  const [mas, mag, rca, meta] = report.reports;
  assert.equal(mas.evidence_tail_classification.status, 'production_evidence_tail_present');
  assert.equal(mas.evidence_tail_classification.tail_items[0].status, 'open');
  assert.equal(mas.evidence_tail_classification.tail_items[0].evidence_ref, null);

  assert.equal(mag.evidence_tail_classification.status, 'closed');
  assert.equal(mag.evidence_tail_classification.tail_items[0].status, 'closed');
  assert.equal(mag.evidence_tail_classification.tail_items[0].evidence_ref, 'receipt:mag/production-default-caller');
  assert.equal(mag.evidence_tail_classification.tail_items[0].doc_ref, 'docs/status.md#production-acceptance');
  assert.equal(
    mag.evidence_tail_classification.tail_items[0].next_verification_command,
    'mag production acceptance --json',
  );
  assert.deepEqual(
    mag.evidence_tail_classification.tail_items[0].advisory_refs.agent_lab_handoff_refs,
    ['agent-lab-handoff:mag/owner-receipt-scaleout'],
  );
  assert.equal(mag.evidence_tail_classification.tail_items[0].authority_boundary.conformance_report_can_claim_domain_ready, false);

  assert.equal(rca.status, 'passed');
  assert.equal(rca.evidence_tail_classification.status, 'domain_owned_typed_blocker_reported');
  assert.equal(rca.evidence_tail_classification.tail_items[0].status, 'domain_owned_typed_blocker');
  assert.equal(rca.evidence_tail_classification.tail_items[0].evidence_ref, 'blocker:rca/live-visual-soak');
  assert.equal(rca.evidence_tail_classification.tail_items[0].next_verification_command, 'rca acceptance verify --json');
  assert.equal(
    rca.evidence_tail_classification.tail_items[0].authority_boundary.domain_acceptance_status,
    'domain_owned_typed_blocker_with_next_verification_ref',
  );
  assert.equal(
    rca.evidence_tail_classification.tail_items[0].authority_boundary.typed_blocker_kind,
    'live_visual_soak_pending',
  );

  assert.equal(meta.evidence_tail_classification.status, 'closed');
  assert.equal(meta.evidence_tail_classification.tail_items[0].domain_owner, 'opl-meta-agent');
  assert.equal(meta.evidence_tail_classification.authority_boundary.evidence_tail_can_claim_domain_ready, false);
});

test('agents conformance parses nested MAS and RCA production acceptance evidence tails', () => {
  const masRepo = buildReadyAgentRepo();
  retargetReadyRepo(masRepo, 'med-autoscience', 'Med Auto Science');
  writeProductionAcceptance(masRepo, 'mas-production-acceptance.json', {
    surface_kind: 'mas_domain_owned_production_acceptance',
    domain_id: 'med-autoscience',
    owner: 'MedAutoScience',
    acceptance_status: 'closed_by_domain_owned_acceptance_receipt',
    domain_acceptance_receipt: {
      receipt_id: 'mas-production-acceptance-2026-05-19',
      receipt_class: 'owner_receipt',
      receipt_owner: 'MedAutoScience',
      receipt_status: 'accepted',
      owner_receipt_refs: [
        {
          ref: 'contracts/owner_receipt_contract.json',
          role: 'domain_owner_receipt_contract',
          body_included: false,
        },
        {
          ref: 'contracts/production_acceptance/mas-production-acceptance.json#/domain_acceptance_receipt',
          role: 'domain_owned_production_acceptance_receipt',
          body_included: false,
        },
      ],
      progress_delta_refs: [
        {
          ref: 'docs/status.md#current-evidence-tail',
          role: 'human_doc_progress_delta',
          body_included: false,
        },
      ],
      quality_publication_gate_refs: [
        {
          ref: 'publication_eval/latest.json',
          role: 'mas_owned_publication_eval_surface',
          body_included: false,
        },
      ],
      typed_blocker_refs: [],
      next_verification_command_refs: [
        {
          ref: 'scripts/run-pytest-clean.sh -q tests/test_mas_production_acceptance.py',
          role: 'focused_contract_test',
          body_included: false,
        },
      ],
    },
    refs: {
      next_verification_command_refs: [
        {
          ref: 'scripts/verify.sh',
          role: 'minimum_repo_verification',
          body_included: false,
        },
      ],
    },
    authority_boundary: {
      opl_can_authorize_domain_ready: false,
      provider_completion_is_domain_ready: false,
    },
  });

  const rcaRepo = buildReadyAgentRepo();
  retargetReadyRepo(rcaRepo, 'redcube-ai', 'RedCube AI');
  configureReadyRcaMorphology(rcaRepo);
  writeProductionAcceptance(rcaRepo, 'rca-production-acceptance.json', {
    surface_kind: 'rca_domain_owned_visual_production_acceptance_evidence',
    domain_id: 'redcube_ai',
    owner: 'redcube_ai',
    visual_artifact_receipt_chain: {
      artifact_receipt_refs: [
        'contracts/artifact_locator_contract.json',
        'workspace-runtime-ref:artifact-locator:transition-hosted-domain-receipt',
      ],
      review_export_gate_refs: ['workspace-runtime-ref:review-export:transition-run'],
    },
    evidence_tail: {
      status: 'closed_by_domain_owned_acceptance_receipt',
      closure_receipt: {
        return_shape: 'domain_receipt',
        owner: 'redcube_ai',
        receipt_ref: 'rca-owner-receipt:visual-stage:transition-hosted-domain-receipt',
        artifact_locator_ref: 'contracts/artifact_locator_contract.json',
        artifact_receipt_refs: [
          'workspace-runtime-ref:artifact-locator:transition-hosted-domain-receipt',
        ],
        review_export_ref: 'workspace-runtime-ref:review-export:transition-run',
      },
      typed_blocker: null,
    },
    next_verification_command_refs: [
      {
        ref: 'command:npm run --silent build && node --experimental-strip-types --test tests/rca-production-acceptance.test.ts',
        purpose: 'focused_production_acceptance_contract_test',
      },
    ],
    authority_boundary: {
      opl_can_authorize_domain_ready: false,
      provider_completion_is_domain_ready: false,
    },
  });

  const report = runCli([
    'agents',
    'conformance',
    '--agent',
    `mas=${masRepo}`,
    '--agent',
    `rca=${rcaRepo}`,
  ]).standard_domain_agent_conformance;

  assert.equal(report.status, 'passed');
  assert.equal(report.summary.structural_conformance_status, 'passed');
  assert.equal(report.authority_boundary.conformance_report_can_claim_domain_ready, false);

  const [mas, rca] = report.reports;
  const masTail = mas.evidence_tail_classification.tail_items[0];
  assert.equal(mas.evidence_tail_classification.status, 'closed');
  assert.equal(masTail.status, 'closed');
  assert.equal(masTail.domain_owner, 'MedAutoScience');
  assert.equal(masTail.evidence_ref, 'contracts/owner_receipt_contract.json');
  assert.equal(masTail.doc_ref, 'docs/status.md#current-evidence-tail');
  assert.equal(
    masTail.next_verification_command,
    'scripts/run-pytest-clean.sh -q tests/test_mas_production_acceptance.py',
  );
  assert.equal(masTail.contract_ref, 'contracts/production_acceptance/mas-production-acceptance.json');
  assert.equal(masTail.owner_ref, 'MedAutoScience');
  assert.equal(masTail.authority_boundary.conformance_report_can_claim_domain_ready, false);
  assert.equal(masTail.authority_boundary.domain_ready_claimed_by_conformance, false);

  const rcaTail = rca.evidence_tail_classification.tail_items[0];
  assert.equal(rca.evidence_tail_classification.status, 'closed');
  assert.equal(rcaTail.status, 'closed');
  assert.equal(rcaTail.domain_owner, 'redcube_ai');
  assert.equal(rcaTail.evidence_ref, 'rca-owner-receipt:visual-stage:transition-hosted-domain-receipt');
  assert.equal(rcaTail.doc_ref, 'workspace-runtime-ref:review-export:transition-run');
  assert.equal(
    rcaTail.next_verification_command,
    'command:npm run --silent build && node --experimental-strip-types --test tests/rca-production-acceptance.test.ts',
  );
  assert.equal(rcaTail.contract_ref, 'contracts/production_acceptance/rca-production-acceptance.json');
  assert.equal(rcaTail.owner_ref, 'redcube_ai');
  assert.equal(rcaTail.authority_boundary.conformance_report_can_claim_domain_ready, false);
  assert.equal(rcaTail.authority_boundary.domain_ready_claimed_by_conformance, false);
});

test('agents conformance allows opl-meta-agent contract guard tests to name forbidden roles', () => {
  const metaRepo = buildReadyAgentRepo();
  retargetReadyRepo(metaRepo, 'opl-meta-agent', 'OPL Meta Agent');
  configureReadyMetaMorphology(metaRepo);
  fs.mkdirSync(path.join(metaRepo, 'tests'), { recursive: true });
  fs.mkdirSync(path.join(metaRepo, 'tests', 'support'), { recursive: true });
  fs.writeFileSync(
    path.join(metaRepo, 'tests', 'contracts.test.ts'),
    [
      'const forbiddenRoles = [',
      "  'generic_runtime_owner',",
      "  'generic_registry_owner',",
      "  'app_shell_owner',",
      "  'agent_lab_execution_owner',",
      "  'promotion_gate_owner',",
      "  'target_domain_truth_writer',",
      '];',
      'export { forbiddenRoles };',
      '',
    ].join('\n'),
    'utf8',
  );
  fs.writeFileSync(
    path.join(metaRepo, 'tests', 'support', 'contracts.ts'),
    [
      'export function assertForbiddenRolesAreOnlyPolicyTerms() {',
      "  return ['app_shell_owner', 'promotion_gate_owner'];",
      '}',
      '',
    ].join('\n'),
    'utf8',
  );

  const report = runCli([
    'agents',
    'conformance',
    '--agent',
    `opl-meta-agent=${metaRepo}`,
  ]).standard_domain_agent_conformance;
  const forbiddenNameResidue = report.reports[0].physical_morphology_checks.forbidden_name_residue;

  assert.equal(report.status, 'passed');
  assert.equal(report.reports[0].status, 'passed');
  assert.equal(
    forbiddenNameResidue.some((entry: { path: string; allowed: boolean }) =>
      entry.path === 'tests/contracts.test.ts' && entry.allowed === true
    ),
    true,
  );
  assert.equal(
    forbiddenNameResidue.some((entry: { path: string; allowed: boolean }) =>
      entry.path === 'tests/support/contracts.ts' && entry.allowed === true
    ),
    true,
  );
  const morphologyChecks = report.reports[0].physical_morphology_checks;
  assert.equal(morphologyChecks.residue_classification_summary.status, 'no_active_forbidden_name_residue');
  assert.equal(morphologyChecks.residue_classification_summary.active_forbidden_name_residue_count, 0);
  assert.equal(
    morphologyChecks.residue_classification_summary.allowed_name_residue_count,
    morphologyChecks.forbidden_name_residue.length,
  );
  assert.equal(
    morphologyChecks.residue_classification_summary.allowed_name_residue_by_classification
      .contract_or_legacy_guard_test,
    8,
  );
  assert.equal(
    morphologyChecks.residue_classification_summary.allowed_name_residue_by_classification
      .machine_contract_policy_or_projection,
    6,
  );
  assert.equal(
    morphologyChecks.residue_classification_summary.allowed_name_residue_by_classification
      .authority_function_policy_manifest,
    6,
  );
  assert.deepEqual(morphologyChecks.active_forbidden_name_residue, []);
  assert.equal(
    morphologyChecks.allowed_name_residue.every((entry: { allowance_classification: string }) =>
      [
        'authority_function_policy_manifest',
        'contract_or_legacy_guard_test',
        'machine_contract_policy_or_projection',
      ].includes(entry.allowance_classification)
    ),
    true,
  );
  assert.deepEqual(report.reports[0].blockers, []);
});

test('agents conformance blocks missing physical morphology policy', () => {
  const repoDir = buildReadyAgentRepo();
  const privateSurfacePolicyPath = path.join(repoDir, 'contracts', 'private_functional_surface_policy.json');
  const privateSurfacePolicy = JSON.parse(fs.readFileSync(privateSurfacePolicyPath, 'utf8'));
  delete privateSurfacePolicy.physical_source_morphology_policy;
  writeJson(privateSurfacePolicyPath, privateSurfacePolicy);

  const report = runCli([
    'agents',
    'conformance',
    '--repo-dir',
    repoDir,
  ]).standard_domain_agent_conformance;

  assert.equal(report.status, 'blocked');
  assert.equal(report.reports[0].blockers.includes('physical_morphology_policy_not_declared'), true);
});

test('agents conformance blocks missing workspace file lifecycle policy', () => {
  const repoDir = buildReadyAgentRepo();
  fs.rmSync(path.join(repoDir, 'contracts', 'workspace_lifecycle_policy.json'));

  const report = runCli([
    'agents',
    'conformance',
    '--repo-dir',
    repoDir,
  ]).standard_domain_agent_conformance;

  assert.equal(report.status, 'blocked');
  assert.equal(report.reports[0].workspace_file_lifecycle_checks.status, 'blocked');
  assert.equal(
    report.reports[0].blockers.includes('workspace_file_lifecycle_policy_not_declared'),
    true,
  );
});

test('agents conformance blocks missing stage artifact kernel adoption policy', () => {
  const repoDir = buildReadyAgentRepo();
  fs.rmSync(path.join(repoDir, 'contracts', 'stage_artifact_kernel_adoption.json'));

  const report = runCli([
    'agents',
    'conformance',
    '--agent',
    `sample=${repoDir}`,
  ]).standard_domain_agent_conformance;

  assert.equal(report.status, 'blocked');
  assert.equal(report.reports[0].stage_artifact_kernel_adoption_checks.status, 'blocked');
  assert.equal(
    report.reports[0].blockers.includes('stage_artifact_kernel_adoption_not_declared'),
    true,
  );
});

test('agents conformance blocks legacy roots, README pack paths, and unavailable active-path scans', () => {
  const repoDir = buildReadyAgentRepo();
  const packCompilerInputPath = path.join(repoDir, 'contracts', 'pack_compiler_input.json');
  const packCompilerInput = JSON.parse(fs.readFileSync(packCompilerInputPath, 'utf8'));
  packCompilerInput.canonical_repo_source_semantic_pack_root = 'src/';
  packCompilerInput.required_domain_pack_paths.push('agent/README.md');
  writeJson(packCompilerInputPath, packCompilerInput);

  const functionalAuditPath = path.join(repoDir, 'contracts', 'functional_privatization_audit.json');
  const functionalAudit = JSON.parse(fs.readFileSync(functionalAuditPath, 'utf8'));
  functionalAudit.scan = { active_path_scan_state: 'not_available' };
  writeJson(functionalAuditPath, functionalAudit);

  const report = runCli([
    'agents',
    'conformance',
    '--repo-dir',
    repoDir,
  ]).standard_domain_agent_conformance;

  assert.equal(report.status, 'blocked');
  const blockers = report.reports[0].blockers;
  assert.equal(blockers.includes('pack_compiler_legacy_pack_root_field:canonical_repo_source_semantic_pack_root'), true);
  assert.equal(blockers.includes('required_domain_pack_path_must_not_be_readme:agent/README.md'), true);
  assert.equal(blockers.includes('active_path_scan_state_not_available:$.scan.active_path_scan_state'), true);
});

test('agents conformance treats OPL replacement ledger refs as non-residue', () => {
  const repoDir = buildReadyAgentRepo();
  retargetReadyRepoToMag(repoDir);
  const actionCatalogPath = path.join(repoDir, 'contracts', 'action_catalog.json');
  const actionCatalog = JSON.parse(fs.readFileSync(actionCatalogPath, 'utf8'));
  actionCatalog.notes.push('OPL replacement consumes stage_attempt_ledger refs only.');
  writeJson(actionCatalogPath, actionCatalog);

  const privateSurfacePolicyPath = path.join(repoDir, 'contracts', 'private_functional_surface_policy.json');
  const privateSurfacePolicy = JSON.parse(fs.readFileSync(privateSurfacePolicyPath, 'utf8'));
  privateSurfacePolicy.physical_source_morphology_policy.required_surface_ids = [
    'domain_runtime',
    'product_entry',
    'status',
    'user_loop',
    'domain_handler',
    'runtime_registration',
    'control_plane',
    'lifecycle',
    'memory',
    'package',
    'autonomy_controller',
    'legacy_runtime_residue',
  ];
  privateSurfacePolicy.physical_source_morphology_policy.surface_classifications = (
    privateSurfacePolicy.physical_source_morphology_policy.required_surface_ids.map((surface_id: string) => ({
      surface_id,
      classification: surface_id === 'legacy_runtime_residue' ? 'legacy_proof_tombstone' : 'refs_only_adapter',
      source_refs: surface_id === 'legacy_runtime_residue' ? ['docs/history/runtime-tombstone.md'] : ['agent/'],
    }))
  );
  privateSurfacePolicy.physical_source_morphology_policy.forbidden_residue_classes = [
    'legacy_local_persistence_surface',
    'legacy_attempt_record_surface',
    'legacy_repo_cadence_owner',
    'legacy_executor_runtime_probe',
    'legacy_compat_alias_surface',
  ];
  privateSurfacePolicy.physical_source_morphology_policy.authority_boundary = {
    mag_can_own_generic_runtime: false,
    mag_can_own_generated_wrapper: false,
    mag_can_restore_legacy_compat_alias: false,
  };
  writeJson(privateSurfacePolicyPath, privateSurfacePolicy);

  const report = runCli([
    'agents',
    'conformance',
    '--agent',
    `mag=${repoDir}`,
  ]).standard_domain_agent_conformance;

  assert.equal(report.status, 'passed');
  assert.equal(report.reports[0].physical_morphology_checks.status, 'passed');
  assert.deepEqual(report.reports[0].physical_morphology_checks.forbidden_name_residue, []);
});

test('agents conformance blocks legacy sidecar aliases as active physical morphology surfaces', () => {
  const magRepoDir = buildReadyAgentRepo();
  retargetReadyRepoToMag(magRepoDir);
  configureReadyMagMorphology(magRepoDir);
  const magPrivateSurfacePolicyPath = path.join(magRepoDir, 'contracts', 'private_functional_surface_policy.json');
  const magPrivateSurfacePolicy = JSON.parse(fs.readFileSync(magPrivateSurfacePolicyPath, 'utf8'));
  magPrivateSurfacePolicy.physical_source_morphology_policy.required_surface_ids = (
    magPrivateSurfacePolicy.physical_source_morphology_policy.required_surface_ids.map((surfaceId: string) => (
      surfaceId === 'domain_handler' ? 'sidecar' : surfaceId
    ))
  );
  magPrivateSurfacePolicy.physical_source_morphology_policy.surface_classifications = (
    magPrivateSurfacePolicy.physical_source_morphology_policy.surface_classifications.map((
      entry: { surface_id: string },
    ) => ({
      ...entry,
      surface_id: entry.surface_id === 'domain_handler' ? 'sidecar' : entry.surface_id,
    }))
  );
  writeJson(magPrivateSurfacePolicyPath, magPrivateSurfacePolicy);

  const rcaRepoDir = buildReadyAgentRepo();
  retargetReadyRepo(rcaRepoDir, 'redcube_ai', 'RedCube AI');
  configureReadyRcaMorphology(rcaRepoDir);
  const rcaPolicyPath = path.join(rcaRepoDir, 'contracts', 'physical_source_morphology_policy.json');
  const rcaPolicy = JSON.parse(fs.readFileSync(rcaPolicyPath, 'utf8'));
  rcaPolicy.active_surface_classifications = rcaPolicy.active_surface_classifications.map((
    entry: { surface_id: string },
  ) => ({
    ...entry,
    surface_id: entry.surface_id === 'product_entry_continuity_refs_adapter'
      ? 'product_entry_session_snapshot_refs_adapter'
      : entry.surface_id === 'domain_action_adapter_guarded_actions'
        ? 'product_sidecar_guarded_actions'
        : entry.surface_id,
  }));
  writeJson(rcaPolicyPath, rcaPolicy);

  const report = runCli([
    'agents',
    'conformance',
    '--agent',
    `mag=${magRepoDir}`,
    '--agent',
    `rca=${rcaRepoDir}`,
  ]).standard_domain_agent_conformance;

  assert.equal(report.status, 'blocked');
  assert.equal(report.passed_count, 0);
  assert.equal(report.blocked_count, 2);
  assert.equal(report.summary.passed_count, 0);
  assert.equal(report.summary.blocked_count, 2);
  assert.equal(report.reports[0].physical_morphology_checks.status, 'blocked');
  assert.equal(
    report.reports[0].physical_morphology_checks.blockers.includes(
      'mag_physical_surface_missing:domain_handler',
    ),
    true,
  );
  assert.equal(
    report.reports[0].physical_morphology_checks.blockers.includes(
      'mag_physical_surface_unclassified:domain_handler',
    ),
    true,
  );
  assert.equal(report.reports[1].physical_morphology_checks.status, 'blocked');
  assert.equal(
    report.reports[1].physical_morphology_checks.blockers.includes(
      'rca_physical_surface_unclassified:domain_action_adapter_guarded_actions',
    ),
    true,
  );
});
