import { assert, runCli, test } from '../helpers.ts';

test('framework tranche backlog exposes generated surface and domain source guards', () => {
  const readback = runCli(['framework', 'tranche-backlog', '--family-defaults']).framework_tranche_backlog;

  assert.equal(
    readback.generated_hosted_surface_boundary.surface_kind,
    'opl_generated_hosted_surface_authority_boundary_readback',
  );
  assert.equal(
    readback.generated_hosted_surface_boundary.readback_role,
    'generated_hosted_surface_owner_policy_not_domain_ready_not_live_evidence_not_default_caller_cutover',
  );
  assert.equal(readback.generated_hosted_surface_boundary.generated_surface_owner, 'one-person-lab');
  assert.equal(readback.generated_hosted_surface_boundary.domain_repo_can_own_generated_surface, false);
  assert.equal(
    readback.generated_hosted_surface_boundary.default_entry_policy.domain_repo_can_own_default_entry,
    false,
  );
  assert.ok(
    readback.generated_hosted_surface_boundary.supported_derived_surfaces.some(
      (surface: { surface_id: string; owner: string; domain_repo_can_own_generated_surface: boolean }) =>
        surface.surface_id === 'workbench'
        && surface.owner === 'one-person-lab'
        && surface.domain_repo_can_own_generated_surface === false
    ),
  );
  assert.ok(
    readback.generated_hosted_surface_boundary.no_resurrection_gate.blocked_resurrection_surface_classes.includes(
      'repo_local_workbench_shell',
    ),
  );
  assert.equal(
    readback.generated_hosted_surface_boundary.structural_closeout_guard.status,
    'closed_structure_gate_not_live_evidence',
  );
  assert.equal(
    readback.generated_hosted_surface_boundary.structural_closeout_guard.can_close_non_live_structure_gate,
    true,
  );
  assert.ok(
    readback.generated_hosted_surface_boundary.structural_closeout_guard.cannot_claim.includes(
      'App_live_rendering_complete',
    ),
  );
  assert.equal(
    readback.generated_hosted_surface_boundary.generated_surface_consumption_guard.surface_kind,
    'opl_generated_surface_consumption_guard_readback',
  );
  assert.equal(
    readback.generated_hosted_surface_boundary.generated_surface_consumption_guard
      .domain_pack_compiler_family_readback.status,
    'available',
  );
  assert.equal(
    readback.generated_hosted_surface_boundary.generated_surface_consumption_guard
      .domain_pack_compiler_family_readback.summary.generated_surface_count,
    40,
  );
  assert.equal(
    readback.generated_hosted_surface_boundary.generated_surface_consumption_guard
      .generated_interfaces_family_readback.status,
    'available',
  );
  assert.equal(
    readback.generated_hosted_surface_boundary.generated_surface_consumption_guard
      .generated_interfaces_family_readback.consumption_status_counts.ready,
    40,
  );
  assert.equal(
    readback.generated_hosted_surface_boundary.generated_surface_consumption_guard
      .generated_interfaces_family_readback.consumption_status_counts.blocked,
    0,
  );
  assert.ok(
    readback.generated_hosted_surface_boundary.generated_surface_consumption_guard
      .selected_consumer_surface_ids.includes('app_action'),
  );
  assert.ok(
    readback.generated_hosted_surface_boundary.generated_surface_consumption_guard
      .active_caller_cutover_statuses.includes('cutover_to_opl_generated_or_domain_handler_targets'),
  );
  assert.equal(
    readback.generated_hosted_surface_boundary.generated_surface_consumption_guard
      .authority_boundary.consumption_guard_can_claim_default_caller_cutover,
    false,
  );
  assert.equal(
    readback.generated_hosted_surface_boundary.generated_surface_consumption_guard
      .authority_boundary.consumption_guard_can_claim_app_live_rendering_complete,
    false,
  );
  assert.equal(
    readback.generated_hosted_surface_boundary.support_repo_boundary.support_repos_can_join_default_foundry_agent_truth_set,
    false,
  );
  assert.equal(
    readback.cross_repo_ref_integrity_guard.surface_kind,
    'opl_family_cross_repo_ref_integrity_guard',
  );
  assert.equal(
    readback.cross_repo_ref_integrity_guard.status,
    'closed_structure_gate_not_live_evidence',
  );
  assert.equal(
    readback.cross_repo_ref_integrity_guard.checked_repo_refs[0].repo,
    'opl-doc',
  );
  assert.equal(
    readback.cross_repo_ref_integrity_guard.checked_repo_refs[0].canonical_ref,
    'contracts/support-repo-policy.json',
  );
  assert.deepEqual(
    readback.cross_repo_ref_integrity_guard.checked_repo_refs[0].stale_or_forbidden_refs,
    ['contracts/support_repo_policy.json'],
  );
  assert.equal(
    readback.cross_repo_ref_integrity_guard.no_second_truth_guard
      .cross_repo_ref_guard_can_create_missing_contract_alias,
    false,
  );
  assert.equal(
    readback.cross_repo_ref_integrity_guard.false_ready_guard
      .ref_integrity_pass_can_claim_plan_completion,
    false,
  );
  assert.equal(
    readback.mas_conformance_residue_closeout_readback.surface_kind,
    'opl_family_mas_conformance_residue_closeout_readback',
  );
  assert.equal(
    readback.mas_conformance_residue_closeout_readback.status,
    'closed_structure_gate_not_live_evidence',
  );
  assert.equal(
    readback.mas_conformance_residue_closeout_readback.source_closeout_origin_main_sha,
    '092ce099b2e196e08998f5ef5725c13d5896d217',
  );
  assert.equal(
    readback.mas_conformance_residue_closeout_readback.latest_observed_origin_main_sha,
    'b3d03a810b5f371b0887030fd8d5d9d1dc716b2c',
  );
  assert.equal(
    readback.mas_conformance_residue_closeout_readback
      .source_closeout_is_ancestor_of_latest_observed_origin_main,
    true,
  );
  assert.equal(
    readback.mas_conformance_residue_closeout_readback.family_conformance_readback
      .structural_conformance_status,
    'passed',
  );
  assert.equal(
    readback.mas_conformance_residue_closeout_readback.family_conformance_readback
      .blocked_count,
    0,
  );
  assert.equal(
    readback.mas_conformance_residue_closeout_readback.closed_residue_boundary
      .progress_portal_summary_status,
    'suppressed_legacy_private_control_owner',
  );
  assert.equal(
    readback.mas_conformance_residue_closeout_readback.closed_residue_boundary
      .legacy_marker_literal_resurrection_allowed,
    false,
  );
  assert.ok(
    readback.mas_conformance_residue_closeout_readback.non_live_evidence.includes(
      'OPL_agents_conformance_family_defaults_structural_passed_blocked_count_zero_after_MAS_remote_readback',
    ),
  );
  assert.equal(
    readback.mas_conformance_residue_closeout_readback.authority_boundary
      .can_claim_mas_domain_ready,
    false,
  );
  assert.equal(
    readback.mas_conformance_residue_closeout_readback.authority_boundary
      .can_create_mas_typed_blocker,
    false,
  );
  assert.equal(
    readback.mas_conformance_residue_closeout_readback.false_ready_guard
      .blocked_count_zero_can_claim_plan_completion,
    false,
  );
  assert.equal(
    readback.domain_source_ref_integrity_guard.surface_kind,
    'opl_family_domain_source_ref_integrity_guard',
  );
  assert.equal(
    readback.domain_source_ref_integrity_guard.status,
    'closed_structure_gate_not_live_evidence',
  );
  assert.equal(
    readback.domain_source_ref_integrity_guard.milestone_id,
    'strict_source_purity_private_wrapper_retirement',
  );
  assert.deepEqual(
    readback.domain_source_ref_integrity_guard.absorbed_origin_main_commits.map(
      (commit: { repo: string; commit: string }) => [commit.repo, commit.commit],
    ),
    [
      ['med-autogrant', '84828001957d4fd81da7948113915340b6e74d17'],
      ['opl-meta-agent', '3dfed67f4debf7f44b9b130bd9bb880500dd0340'],
      ['redcube-ai', '96e0dc0b9e2e3c7f7c754284810ec670d7aadd75'],
    ],
  );
  const sourceRefGuardsByRepo = Object.fromEntries(
    readback.domain_source_ref_integrity_guard.checked_domain_repo_guards.map(
      (guard: { repo: string }) => [guard.repo, guard],
    ),
  );
  assert.equal(
    sourceRefGuardsByRepo['med-autogrant'].source_ref,
    'med-autogrant:contracts/private_functional_surface_policy.json#/physical_source_morphology_policy/source_ref_integrity_gate',
  );
  assert.equal(sourceRefGuardsByRepo['med-autogrant'].checked_source_ref_count, 55);
  assert.equal(
    sourceRefGuardsByRepo['med-autogrant'].strict_source_purity_no_second_truth_guard_id,
    'mag.physical_morphology.strict_source_purity_no_second_truth_guard.v1',
  );
  assert.equal(
    sourceRefGuardsByRepo['med-autogrant'].public_readback_ref,
    'med-autogrant:authority morphology-guard',
  );
  assert.equal(
    sourceRefGuardsByRepo['med-autogrant'].source_ref_integrity_readback_ref,
    'med-autogrant:authority morphology-guard#source_ref_integrity_guard',
  );
  assert.equal(
    sourceRefGuardsByRepo['med-autogrant'].strict_readback_ref,
    'med-autogrant:authority source-purity --format json',
  );
  assert.equal(
    sourceRefGuardsByRepo['med-autogrant'].script_readback_ref,
    'med-autogrant:scripts/check_source_purity_guard.py --format json',
  );
  assert.equal(
    sourceRefGuardsByRepo['med-autogrant'].package_api_ref,
    'med-autogrant:med_autogrant.product_entry_parts.source_purity_guard_readback.build_source_purity_guard_readback',
  );
  assert.equal(
    sourceRefGuardsByRepo['med-autogrant'].verify_readback_ref,
    'med-autogrant:scripts/verify.sh source-purity:strict',
  );
  assert.equal(
    sourceRefGuardsByRepo['med-autogrant'].compact_cleanup_readiness_summary_ref,
    'med-autogrant:contracts/private_functional_surface_policy.json#/physical_source_morphology_policy/retirement_readback_cleanup_guard/compact_cleanup_readiness_summary',
  );
  assert.equal(sourceRefGuardsByRepo['med-autogrant'].compact_cleanup_candidate_count, 0);
  assert.equal(sourceRefGuardsByRepo['med-autogrant'].compact_cleanup_owner_delta_required, false);
  assert.equal(sourceRefGuardsByRepo['med-autogrant'].compact_cleanup_can_apply_cleanup, false);
  assert.equal(sourceRefGuardsByRepo['med-autogrant'].compact_cleanup_can_authorize_physical_delete, false);
  assert.equal(sourceRefGuardsByRepo['med-autogrant'].compact_cleanup_can_claim_domain_ready, false);
  assert.equal(sourceRefGuardsByRepo['med-autogrant'].compact_cleanup_can_claim_production_ready, false);
  assert.equal(
    sourceRefGuardsByRepo['opl-meta-agent'].source_ref,
    'opl-meta-agent:contracts/script_to_pack_gate_receipt.json#/machine_gate_inputs/source_ref_integrity_guard',
  );
  assert.equal(sourceRefGuardsByRepo['opl-meta-agent'].checked_source_ref_count, 31);
  assert.equal(sourceRefGuardsByRepo['opl-meta-agent'].invalid_source_ref_count, 0);
  assert.equal(
    sourceRefGuardsByRepo['opl-meta-agent'].generic_materializer_no_resurrection_guard_id,
    'oma.script_morphology.generic_materializer_no_resurrection_guard.v1',
  );
  assert.equal(sourceRefGuardsByRepo['opl-meta-agent'].generic_materializer_scan_status, 'passed');
  assert.equal(sourceRefGuardsByRepo['opl-meta-agent'].repo_owned_generic_wrapper_materializer_count, 0);
  assert.equal(sourceRefGuardsByRepo['opl-meta-agent'].repo_owned_generic_runtime_materializer_count, 0);
  assert.equal(sourceRefGuardsByRepo['opl-meta-agent'].repo_owned_queue_or_attempt_ledger_materializer_count, 0);
  assert.equal(sourceRefGuardsByRepo['opl-meta-agent'].repo_owned_target_worktree_lifecycle_materializer_count, 0);
  assert.equal(
    sourceRefGuardsByRepo['opl-meta-agent'].source_structure_json_readback_ref,
    'opl-meta-agent:npm run source-structure:json --silent',
  );
  assert.equal(
    sourceRefGuardsByRepo['opl-meta-agent'].source_structure_strict_json_readback_ref,
    'opl-meta-agent:npm run source-structure:strict:json --silent',
  );
  assert.equal(
    sourceRefGuardsByRepo['opl-meta-agent'].script_to_pack_compact_readback_ref,
    'opl-meta-agent:npm run script-to-pack:readback --silent#compact_cleanup_summary',
  );
  assert.equal(
    sourceRefGuardsByRepo['opl-meta-agent'].compact_cleanup_summary_id,
    'oma.script_to_pack_retirement_cleanup.compact_summary.v1',
  );
  assert.equal(sourceRefGuardsByRepo['opl-meta-agent'].compact_cleanup_candidate_count, 31);
  assert.equal(sourceRefGuardsByRepo['opl-meta-agent'].compact_cleanup_apply_candidate_count, 0);
  assert.equal(sourceRefGuardsByRepo['opl-meta-agent'].compact_cleanup_missing_evidence_item_count, 247);
  assert.equal(sourceRefGuardsByRepo['opl-meta-agent'].compact_cleanup_can_authorize_physical_delete, false);
  assert.equal(sourceRefGuardsByRepo['opl-meta-agent'].compact_cleanup_can_claim_retirement_complete, false);
  assert.equal(sourceRefGuardsByRepo['opl-meta-agent'].compact_cleanup_can_claim_domain_ready, false);
  assert.equal(sourceRefGuardsByRepo['opl-meta-agent'].compact_cleanup_can_claim_production_ready, false);
  assert.equal(
    sourceRefGuardsByRepo['redcube-ai'].source_ref,
    'redcube-ai:contracts/physical_source_morphology_policy.json#/source_ref_integrity_gate',
  );
  assert.equal(sourceRefGuardsByRepo['redcube-ai'].checked_source_ref_count, 58);
  assert.equal(sourceRefGuardsByRepo['redcube-ai'].checked_machine_boundary_ref_count, 3);
  assert.equal(
    sourceRefGuardsByRepo['redcube-ai'].active_source_resurrection_scan_policy_id,
    'rca.source_morphology.active_source_no_resurrection_scan.v1',
  );
  assert.equal(
    sourceRefGuardsByRepo['redcube-ai'].strict_readback_ref,
    'redcube-ai:scripts/check-private-platform-retirement.ts --format json',
  );
  assert.equal(
    sourceRefGuardsByRepo['redcube-ai'].direct_package_readback_ref,
    'redcube-ai:npm run private-platform:readback',
  );
  assert.equal(
    sourceRefGuardsByRepo['redcube-ai'].default_caller_tail_owner_delta_readback_ref,
    'redcube-ai:npm run default-caller-tail:readback',
  );
  assert.equal(
    sourceRefGuardsByRepo['redcube-ai'].default_caller_tail_owner_delta_verify_ref,
    'redcube-ai:scripts/verify.sh default-caller-tail:strict',
  );
  assert.equal(
    sourceRefGuardsByRepo['redcube-ai'].default_caller_tail_owner_delta_surface_kind,
    'rca_default_caller_tail_owner_delta_readback',
  );
  assert.equal(sourceRefGuardsByRepo['redcube-ai'].default_caller_tail_owner_delta_state, 'passed_repo_source_guard_only');
  assert.equal(sourceRefGuardsByRepo['redcube-ai'].default_caller_tail_owner_delta_route_count, 8);
  assert.equal(sourceRefGuardsByRepo['redcube-ai'].default_caller_tail_typed_blocker_ref_shape_count, 8);
  assert.equal(
    sourceRefGuardsByRepo['redcube-ai'].verify_readback_ref,
    'redcube-ai:scripts/verify.sh private-platform:strict',
  );
  assert.equal(
    sourceRefGuardsByRepo['redcube-ai'].strict_gate_artifact_ref,
    'redcube-ai:/tmp/redcube-ai-private-platform-retirement.json',
  );
  assert.equal(
    sourceRefGuardsByRepo['redcube-ai'].direct_readback_surface_kind,
    'rca_private_platform_retirement_strict_readback',
  );
  assert.equal(sourceRefGuardsByRepo['redcube-ai'].direct_readback_state, 'passed_repo_source_guard_only');
  assert.ok(
    sourceRefGuardsByRepo['redcube-ai'].active_source_resurrection_guarded_claim_keys.includes(
      'runtimeWatch_can_return_to_domain_action_adapter_default_dispatch',
    ),
  );
  assert.ok(
    sourceRefGuardsByRepo['redcube-ai'].active_source_resurrection_guarded_claim_keys.includes(
      'domain_action_adapter_can_become_generated_wrapper_owner',
    ),
  );
  assert.ok(
    readback.domain_source_ref_integrity_guard.structural_closeout_guard
      .required_current_truth_surfaces.includes(
        'med-autogrant:authority morphology-guard#strict_source_purity_no_second_truth_guard',
      ),
  );
  assert.ok(
    readback.domain_source_ref_integrity_guard.structural_closeout_guard
      .required_current_truth_surfaces.includes(
        'med-autogrant:authority source-purity --format json#compact_cleanup_readiness_summary',
      ),
  );
  assert.ok(
    readback.domain_source_ref_integrity_guard.structural_closeout_guard
      .required_current_truth_surfaces.includes(
        'opl-meta-agent:npm run source-structure:json --silent',
      ),
  );
  assert.ok(
    readback.domain_source_ref_integrity_guard.structural_closeout_guard
      .required_current_truth_surfaces.includes(
        'opl-meta-agent:npm run script-to-pack:readback --silent#compact_cleanup_summary',
      ),
  );
  assert.ok(
    readback.domain_source_ref_integrity_guard.structural_closeout_guard
      .required_current_truth_surfaces.includes(
        'opl-meta-agent:source_purity_scan_receipt.generic_script_materializer_scan',
      ),
  );
  assert.ok(
    readback.domain_source_ref_integrity_guard.structural_closeout_guard
      .required_current_truth_surfaces.includes(
        'redcube-ai:default_caller_tail_thinning_gate.active_source_resurrection_scan_policy',
      ),
  );
  assert.ok(
    readback.domain_source_ref_integrity_guard.structural_closeout_guard
      .required_current_truth_surfaces.includes(
        'redcube-ai:npm run private-platform:readback',
      ),
  );
  assert.ok(
    readback.domain_source_ref_integrity_guard.structural_closeout_guard
      .required_current_truth_surfaces.includes(
        'redcube-ai:npm run default-caller-tail:readback',
      ),
  );
  assert.equal(
    readback.domain_source_ref_integrity_guard.common_validation_policy
      .stale_or_missing_ref_reopens_structure_gap,
    true,
  );
  assert.equal(
    readback.domain_source_ref_integrity_guard.structural_closeout_guard
      .can_close_non_live_structure_gate,
    true,
  );
  assert.ok(
    readback.domain_source_ref_integrity_guard.structural_closeout_guard.cannot_claim.includes(
      'physical_delete_authorized',
    ),
  );
  assert.ok(
    readback.domain_source_ref_integrity_guard.structural_closeout_guard.cannot_claim.includes(
      'domain_ready',
    ),
  );
  assert.equal(
    readback.domain_source_ref_integrity_guard.no_second_truth_guard
      .source_ref_guard_can_create_missing_refs,
    false,
  );
  assert.equal(
    readback.domain_source_ref_integrity_guard.authority_boundary.can_authorize_physical_delete,
    false,
  );
  assert.equal(
    readback.domain_source_ref_integrity_guard.authority_boundary.can_claim_production_ready,
    false,
  );
  assert.equal(
    readback.domain_source_ref_integrity_guard.false_ready_guard
      .source_refs_exist_can_claim_domain_ready,
    false,
  );
  assert.equal(
    readback.generated_hosted_surface_boundary.authority_boundary.generated_surface_readback_can_claim_live_app_rendering,
    false,
  );
  assert.equal(
    readback.generated_hosted_surface_boundary.false_ready_guard.default_caller_evidence_worklist_can_authorize_physical_delete,
    false,
  );
  assert.equal(
    readback.generated_hosted_surface_boundary.false_ready_guard
      .generated_consumption_bundle_ready_can_claim_domain_ready,
    false,
  );
  assert.equal(
    readback.generated_hosted_surface_boundary.false_ready_guard
      .generated_consumption_bundle_ready_can_claim_App_GUI_complete,
    false,
  );
});
