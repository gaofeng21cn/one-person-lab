import { assert, fs, path, repoRoot, runCli, runCliFailure, test } from '../helpers.ts';

test('framework readiness rejects non-default invocation to avoid a second truth surface', () => {
  const failure = runCliFailure(['framework', 'readiness']);

  assert.equal(failure.payload.error.code, 'cli_usage_error');
  assert.match(failure.payload.error.message, /requires --family-defaults/);
  assert.deepEqual(failure.payload.error.details.required, ['--family-defaults']);
});

test('framework readiness exposes command-scoped help', () => {
  const scoped = runCli(['help', 'framework', 'readiness']);
  assert.equal(scoped.help.command, 'framework readiness');
  assert.match(scoped.help.usage, /framework readiness --family-defaults/);
});

test('framework operating maturity exposes command-scoped help', () => {
  const scoped = runCli(['help', 'framework', 'operating-maturity']);
  assert.equal(scoped.help.command, 'framework operating-maturity');
  assert.match(scoped.help.usage, /framework operating-maturity --family-defaults/);
});

test('framework tranche backlog rejects non-default invocation to avoid a second active backlog', () => {
  const failure = runCliFailure(['framework', 'tranche-backlog']);

  assert.equal(failure.payload.error.code, 'cli_usage_error');
  assert.match(failure.payload.error.message, /requires --family-defaults/);
  assert.deepEqual(failure.payload.error.details.required, ['--family-defaults']);
});

test('framework tranche backlog exposes a guarded milestone index without completion authority', () => {
  const readback = runCli(['framework', 'tranche-backlog', '--family-defaults']).framework_tranche_backlog;

  assert.equal(
    readback.surface_kind,
    'opl_family_ideal_operating_model_tranche_backlog_readback',
  );
  assert.equal(
    readback.backlog_role,
    'milestone_tranche_execution_index_not_completion_audit_not_second_active_backlog',
  );
  assert.equal(readback.active_gap_owner_ref, 'docs/active/current-state-vs-ideal-gap.md');
  assert.equal(readback.default_tranche_policy.lane_count_min, 2);
  assert.equal(readback.default_tranche_policy.lane_count_max, 4);
  assert.equal(readback.default_tranche_policy.live_evidence_deferred, true);
  assert.equal(readback.milestone_state_counts.open, 0);
  assert.equal(readback.milestone_state_counts.partial, 0);
  assert.equal(readback.milestone_state_counts.closed_structure_gate, 8);
  assert.equal(readback.current_tranche.selected_lane_count, 4);
  assert.equal(readback.current_tranche.selected_lane_count_within_policy, true);
  assert.equal(
    readback.current_tranche.tranche_role,
    'non_live_functional_structure_milestone_tranche_not_full_completion_audit',
  );
  assert.deepEqual(readback.current_tranche.selected_milestone_ids, [
    'strict_source_purity_private_wrapper_retirement',
    'oma_script_to_pack_hygiene',
  ]);
  assert.deepEqual(readback.current_tranche.closed_or_advanced_structural_milestone_ids, [
    'strict_source_purity_private_wrapper_retirement',
    'oma_script_to_pack_hygiene',
  ]);
  const milestonesById = Object.fromEntries(
    readback.milestones.map((milestone: { milestone_id: string }) => [milestone.milestone_id, milestone]),
  );
  assert.equal(
    milestonesById['domain_pack_generated_hosted_surfaces'].state,
    'closed_structure_gate',
  );
  assert.equal(
    milestonesById['opl_primitive_runtime_owner_route_guard'].state,
    'closed_structure_gate',
  );
  assert.equal(
    milestonesById['memory_artifact_lifecycle_functional_boundary'].state,
    'closed_structure_gate',
  );
  assert.equal(
    milestonesById['standard_agent_landing_acceptance_guard'].state,
    'closed_structure_gate',
  );
  assert.equal(
    milestonesById['app_active_shell_hermes_convergence'].state,
    'closed_structure_gate',
  );
  assert.equal(
    readback.current_tranche.lane_selection_policy.root_checkout_role,
    'read_absorb_push_readback_cleanup_only',
  );
  assert.equal(
    readback.current_tranche.write_set_isolation_guard.each_lane_requires_isolated_worktree,
    true,
  );
  assert.equal(
    readback.current_tranche.full_goal_completion_guard.this_tranche_can_claim_full_goal_completion,
    false,
  );
  assert.equal(
    readback.current_tranche.full_goal_completion_guard.plan_completion_audit_required_before_full_goal_completion,
    true,
  );
  assert.ok(readback.current_tranche.required_closeout_evidence.includes('remote_sha_readback_equal'));
  assert.ok(readback.current_tranche.required_closeout_evidence.includes('worktree_and_branch_cleanup'));
  const lanesById = Object.fromEntries(
    readback.current_tranche.lanes.map((lane: { lane_id: string }) => [lane.lane_id, lane]),
  );
  assert.deepEqual(
    lanesById['mag-source-purity-cli-readback-20260622'].milestone_ids,
    ['strict_source_purity_private_wrapper_retirement'],
  );
  assert.equal(lanesById['mag-source-purity-cli-readback-20260622'].repo, 'med-autogrant');
  assert.ok(
    lanesById['mag-source-purity-cli-readback-20260622'].required_surfaces.includes('contract'),
  );
  assert.ok(
    lanesById['mag-source-purity-cli-readback-20260622'].required_surfaces.includes('CLI_readback'),
  );
  assert.ok(
    lanesById['mag-source-purity-cli-readback-20260622'].required_surfaces.includes('API_readback'),
  );
  assert.ok(
    lanesById['mag-source-purity-cli-readback-20260622'].non_live_completion_evidence_required.includes(
      'MAG_authority_source_purity_cli_readback_landed',
    ),
  );
  assert.ok(
    lanesById['mag-source-purity-cli-readback-20260622'].non_live_completion_evidence_required.includes(
      'MAG_main_absorbed_push_and_remote_sha_readback',
    ),
  );
  assert.ok(
    lanesById['mag-source-purity-cli-readback-20260622'].forbidden_scope.includes(
      'physical_delete_authorization',
    ),
  );
  assert.ok(
    lanesById['mag-source-purity-cli-readback-20260622'].forbidden_scope.includes(
      'grant_ready_claim',
    ),
  );
  assert.equal(
    lanesById['mag-source-purity-cli-readback-20260622']
      .authority_boundary.can_create_second_active_backlog,
    false,
  );
  assert.deepEqual(
    lanesById['rca-tail-owner-delta-readback-20260622'].milestone_ids,
    ['strict_source_purity_private_wrapper_retirement'],
  );
  assert.equal(lanesById['rca-tail-owner-delta-readback-20260622'].repo, 'redcube-ai');
  assert.ok(
    lanesById['rca-tail-owner-delta-readback-20260622'].required_surfaces.includes('contract'),
  );
  assert.ok(
    lanesById['rca-tail-owner-delta-readback-20260622'].required_surfaces.includes('CLI_readback'),
  );
  assert.ok(
    lanesById['rca-tail-owner-delta-readback-20260622'].non_live_completion_evidence_required.includes(
      'RCA_default_caller_tail_owner_delta_readback_landed',
    ),
  );
  assert.ok(
    lanesById['rca-tail-owner-delta-readback-20260622'].non_live_completion_evidence_required.includes(
      'RCA_default_caller_tail_readback_and_strict_gate_emit_same_payload',
    ),
  );
  assert.ok(
    lanesById['rca-tail-owner-delta-readback-20260622'].forbidden_scope.includes(
      'physical_delete_authorization',
    ),
  );
  assert.ok(
    lanesById['rca-tail-owner-delta-readback-20260622'].forbidden_scope.includes(
      'default_caller_cutover_claim',
    ),
  );
  assert.equal(
    lanesById['rca-tail-owner-delta-readback-20260622']
      .authority_boundary.can_create_second_active_backlog,
    false,
  );
  assert.ok(
    lanesById['rca-tail-owner-delta-readback-20260622'].forbidden_scope.includes(
      'visual_ready_or_exportable_claim',
    ),
  );
  assert.deepEqual(
    lanesById['opl-tranche-backlog-readback-foldback-20260622'].milestone_ids,
    ['strict_source_purity_private_wrapper_retirement'],
  );
  assert.equal(lanesById['opl-tranche-backlog-readback-foldback-20260622'].repo, 'one-person-lab');
  assert.ok(
    lanesById['opl-tranche-backlog-readback-foldback-20260622'].non_live_completion_evidence_required.includes(
      'framework_tranche_backlog_current_tranche_selects_MAG_RCA_OMA_OPL_foldback_lanes',
    ),
  );
  assert.ok(
    lanesById['opl-tranche-backlog-readback-foldback-20260622'].non_live_completion_evidence_required.includes(
      'framework_tranche_backlog_mas_conformance_residue_closeout_points_to_MAS_source_closeout_sha_with_latest_remote_ancestor_guard',
    ),
  );
  assert.ok(
    lanesById['opl-tranche-backlog-readback-foldback-20260622'].forbidden_scope.includes(
      'AGUI_update_or_foreground_resurrection',
    ),
  );
  assert.equal(
    lanesById['opl-tranche-backlog-readback-foldback-20260622']
      .authority_boundary.can_claim_production_ready,
    false,
  );
  assert.deepEqual(
    lanesById['opl-oma-conformance-residue-classification-20260622'].milestone_ids,
    ['strict_source_purity_private_wrapper_retirement', 'oma_script_to_pack_hygiene'],
  );
  assert.equal(
    lanesById['opl-oma-conformance-residue-classification-20260622'].repo,
    'one-person-lab',
  );
  assert.ok(
    lanesById['opl-oma-conformance-residue-classification-20260622'].required_surfaces.includes(
      'CLI_readback',
    ),
  );
  assert.ok(
    lanesById['opl-oma-conformance-residue-classification-20260622']
      .non_live_completion_evidence_required.includes(
        'OPL_conformance_allows_OMA_canonical_policy_manifest_and_source_purity_guard_residue',
      ),
  );
  assert.ok(
    lanesById['opl-oma-conformance-residue-classification-20260622']
      .non_live_completion_evidence_required.includes(
        'OPL_conformance_still_blocks_unclassified_OMA_active_forbidden_role_tokens',
      ),
  );
  assert.ok(
    lanesById['opl-oma-conformance-residue-classification-20260622'].forbidden_scope.includes(
      'OMA_script_physical_retirement_claim',
    ),
  );
  assert.ok(
    lanesById['opl-oma-conformance-residue-classification-20260622'].forbidden_scope.includes(
      'target_agent_ready_claim',
    ),
  );
  assert.equal(
    lanesById['opl-oma-conformance-residue-classification-20260622']
      .authority_boundary.can_create_second_active_backlog,
    false,
  );
  assert.equal(readback.authority_boundary.can_create_second_active_backlog, false);
  assert.equal(readback.authority_boundary.can_claim_plan_completion, false);
  assert.equal(readback.authority_boundary.can_claim_domain_ready, false);
  assert.equal(readback.false_ready_guard.plan_completion_audit_required_for_full_goal_completion, true);
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
  assert.equal(sourceRefGuardsByRepo['med-autogrant'].compact_cleanup_candidate_count, 7);
  assert.equal(sourceRefGuardsByRepo['med-autogrant'].compact_cleanup_owner_delta_required, true);
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
  assert.equal(
    readback.standard_agent_landing_acceptance_guard.surface_kind,
    'opl_standard_agent_landing_acceptance_guard_readback',
  );
  assert.equal(
    readback.standard_agent_landing_acceptance_guard.status,
    'closed_structure_gate_not_live_evidence',
  );
  assert.equal(
    readback.standard_agent_landing_acceptance_guard.acceptance_summary.current_completion_status,
    'family_evidence_tail_open_not_complete',
  );
  assert.equal(
    readback.standard_agent_landing_acceptance_guard.acceptance_summary.completion_claim_authorized,
    false,
  );
  assert.equal(
    readback.standard_agent_landing_acceptance_guard.acceptance_summary.gate_status_counts.total,
    7,
  );
  assert.equal(
    readback.standard_agent_landing_acceptance_guard.acceptance_summary.gate_status_counts.can_claim_complete,
    0,
  );
  assert.ok(
    readback.standard_agent_landing_acceptance_guard.acceptance_summary.open_evidence_tail_ids.includes(
      'generated_surface_production_consumption',
    ),
  );
  assert.equal(
    readback.standard_agent_landing_acceptance_guard.private_residue_owner_decision_summary.ledger_state,
    'refs_only_owner_decision_ledger',
  );
  assert.equal(
    readback.standard_agent_landing_acceptance_guard.private_residue_owner_decision_summary.physical_delete_authorized,
    false,
  );
  assert.equal(
    readback.standard_agent_landing_acceptance_guard.private_residue_owner_decision_summary
      .invalid_owner_decision_count,
    0,
  );
  assert.equal(
    readback.standard_agent_landing_acceptance_guard.private_residue_owner_decision_summary
      .physical_delete_authorized_count,
    0,
  );
  assert.equal(
    readback.standard_agent_landing_acceptance_guard.negative_conformance_summary
      .can_claim_standard_agent_complete_count,
    0,
  );
  assert.equal(
    readback.standard_agent_landing_acceptance_guard.structural_closeout_guard
      .can_close_non_live_structure_gate,
    true,
  );
  assert.ok(
    readback.standard_agent_landing_acceptance_guard.structural_closeout_guard.cannot_claim.includes(
      'standard_agent_complete',
    ),
  );
  assert.ok(
    readback.standard_agent_landing_acceptance_guard.structural_closeout_guard.cannot_claim.includes(
      'physical_delete_authorized',
    ),
  );
  assert.equal(
    readback.standard_agent_landing_acceptance_guard.no_second_truth_guard
      .evidence_status_can_create_second_active_backlog,
    false,
  );
  assert.equal(
    readback.standard_agent_landing_acceptance_guard.authority_boundary
      .private_residue_decision_ledger_can_authorize_physical_delete,
    false,
  );
  assert.equal(
    readback.standard_agent_landing_acceptance_guard.false_ready_guard
      .acceptance_definition_landed_can_claim_standard_agent_complete,
    false,
  );
  assert.equal(
    readback.standard_agent_landing_acceptance_guard.false_ready_guard
      .residue_decision_ledger_can_authorize_physical_delete,
    false,
  );
  assert.equal(
    readback.domain_progress_transition_runtime_guard.surface_kind,
    'opl_domain_progress_transition_runtime_guard_readback',
  );
  assert.equal(
    readback.domain_progress_transition_runtime_guard.contract_identity.surface_kind,
    'opl_domain_progress_transition_runtime_first_slice',
  );
  assert.equal(
    readback.domain_progress_transition_runtime_guard.runtime_identity.runtime_id,
    'opl_domain_progress_transition_runtime',
  );
  assert.equal(
    readback.domain_progress_transition_runtime_guard.runtime_identity.runtime_owner,
    'one-person-lab',
  );
  assert.equal(
    readback.domain_progress_transition_runtime_guard.runtime_identity.not_a_new_brand_module,
    true,
  );
  assert.equal(
    readback.domain_progress_transition_runtime_guard
      .physical_persistence_refs.runtime_live_readback_api,
    'readDomainProgressTransitionRuntimeReadbackJsonl',
  );
  assert.equal(
    readback.domain_progress_transition_runtime_guard
      .physical_persistence_refs.live_readback_contract.complete_transaction_status,
    'complete_transaction',
  );
  assert.equal(
    readback.domain_progress_transition_runtime_guard
      .physical_persistence_refs.live_readback_contract.incomplete_transaction_outcome_kind,
    'blocked_incomplete_transaction',
  );
  assert.equal(
    readback.domain_progress_transition_runtime_guard
      .physical_persistence_refs.live_readback_contract
      .projection_metadata_consumable_only_when_transaction_complete,
    true,
  );
  assert.deepEqual(
    readback.domain_progress_transition_runtime_guard.allowed_transition_decisions,
    [
      'execute_current_owner_delta',
      'consume_terminal_closeout',
      'materialize_recovery_action',
      'wait_for_owner_with_resume_token',
      'stop_with_stable_typed_blocker',
      'stop_with_owner_receipt',
    ],
  );
  assert.equal(
    readback.domain_progress_transition_runtime_guard.decision_surface_policy.read_model_can_execute,
    false,
  );
  assert.equal(
    readback.domain_progress_transition_runtime_guard.policy_adapter_contract
      .source_export_matches_stage_route_scheduler_contract,
    true,
  );
  assert.equal(
    readback.domain_progress_transition_runtime_guard.policy_adapter_contract
      .normalized_request_surface,
    'mas_domain_progress_transition_request',
  );
  assert.ok(
    readback.domain_progress_transition_runtime_guard.policy_adapter_contract
      .fail_closed_reasons.includes('domain_progress_policy_adapter_authority_overclaim'),
  );
  assert.ok(
    readback.domain_progress_transition_runtime_guard.policy_adapter_contract
      .forbidden_domain_adapter_outputs.includes('typed_blocker'),
  );
  assert.equal(
    readback.domain_progress_transition_runtime_guard
      .authority_boundary.runtime_can_write_domain_truth,
    false,
  );
  assert.equal(
    readback.domain_progress_transition_runtime_guard
      .authority_boundary.runtime_can_sign_owner_receipt,
    false,
  );
  assert.equal(
    readback.domain_progress_transition_runtime_guard
      .authority_boundary.runtime_can_create_typed_blocker,
    false,
  );
  assert.equal(
    readback.domain_progress_transition_runtime_guard
      .authority_boundary.policy_adapter_can_create_owner_receipt,
    false,
  );
  assert.equal(
    readback.domain_progress_transition_runtime_guard
      .false_ready_guard.complete_transaction_can_claim_domain_ready,
    false,
  );
  assert.equal(
    readback.domain_progress_transition_runtime_guard
      .false_ready_guard.read_model_projection_consumable_can_claim_domain_progress,
    false,
  );
  assert.equal(
    readback.domain_progress_transition_runtime_guard
      .false_ready_guard.non_advancing_apply_can_claim_paper_progress,
    false,
  );
  assert.equal(
    readback.memory_artifact_lifecycle_boundary_guard.surface_kind,
    'opl_memory_artifact_lifecycle_boundary_guard_readback',
  );
  assert.equal(
    readback.memory_artifact_lifecycle_boundary_guard.target_surface,
    'memory_artifact_lifecycle',
  );
  assert.equal(
    readback.memory_artifact_lifecycle_boundary_guard.status,
    'closed_structure_gate_not_live_evidence',
  );
  assert.equal(
    readback.memory_artifact_lifecycle_boundary_guard.structural_closeout_guard
      .can_close_non_live_structure_gate,
    true,
  );
  assert.equal(
    readback.memory_artifact_lifecycle_boundary_guard.evidence_intake_policy.refs_only,
    true,
  );
  assert.deepEqual(
    readback.memory_artifact_lifecycle_boundary_guard.accepted_refs_only_result_shapes,
    [
      'memory_receipt_ref',
      'memory_writeback_receipt_ref',
      'artifact_mutation_receipt_ref',
      'package_lifecycle_receipt_ref',
      'export_lifecycle_receipt_ref',
      'cleanup_restore_retention_receipt_ref',
      'typed_blocker_ref',
      'owner_acceptance_ref',
    ],
  );
  assert.ok(
    readback.memory_artifact_lifecycle_boundary_guard.source_cli_readback_refs.includes(
      'opl runtime memory-artifact-lifecycle-evidence record|verify|list --json',
    ),
  );
  assert.ok(
    readback.memory_artifact_lifecycle_boundary_guard.source_api_readback_refs.includes(
      'buildMemoryArtifactLifecycleReadback',
    ),
  );
  assert.equal(
    readback.memory_artifact_lifecycle_boundary_guard.authority_boundary.can_write_memory_body,
    false,
  );
  assert.equal(
    readback.memory_artifact_lifecycle_boundary_guard.authority_boundary.can_mutate_artifact_body,
    false,
  );
  assert.equal(
    readback.memory_artifact_lifecycle_boundary_guard.authority_boundary.can_create_owner_receipt,
    false,
  );
  assert.equal(
    readback.memory_artifact_lifecycle_boundary_guard.authority_boundary.can_create_typed_blocker,
    false,
  );
  assert.equal(
    readback.memory_artifact_lifecycle_boundary_guard.authority_boundary.can_authorize_export_readiness,
    false,
  );
  assert.equal(
    readback.memory_artifact_lifecycle_boundary_guard.false_ready_guard
      .verified_refs_only_ledger_can_claim_memory_ready,
    false,
  );
  assert.equal(
    readback.memory_artifact_lifecycle_boundary_guard.false_ready_guard
      .verified_refs_only_ledger_can_claim_artifact_ready,
    false,
  );
  assert.equal(
    readback.memory_artifact_lifecycle_boundary_guard.false_ready_guard
      .verified_refs_only_ledger_can_claim_package_ready,
    false,
  );
  assert.equal(
    readback.memory_artifact_lifecycle_boundary_guard.false_ready_guard
      .owner_acceptance_ref_can_claim_domain_ready,
    false,
  );
  assert.equal(
    readback.memory_artifact_lifecycle_boundary_guard.false_ready_guard
      .review_repair_transport_passed_can_claim_repair_accepted,
    false,
  );
  assert.ok(
    readback.memory_artifact_lifecycle_boundary_guard.structural_closeout_guard.cannot_claim.includes(
      'artifact_body_mutated',
    ),
  );
  assert.ok(
    readback.memory_artifact_lifecycle_boundary_guard.structural_closeout_guard.cannot_claim.includes(
      'owner_receipt_signed',
    ),
  );
  assert.equal(
    readback.runtime_environment_substrate_guard.surface_kind,
    'opl_runtime_environment_substrate_guard_readback',
  );
  assert.equal(
    readback.runtime_environment_substrate_guard.readback_role,
    'runtime_environment_substrate_owner_policy_not_domain_ready_not_live_evidence_not_app_release_ready',
  );
  assert.equal(
    readback.runtime_environment_substrate_guard.contract_identity.contract_id,
    'opl_runtime_environment_substrate_contract',
  );
  assert.equal(
    readback.runtime_environment_substrate_guard.contract_identity.implementation_status,
    'runtime_lock_materializer_cache_prune_run_context_guard_available',
  );
  assert.deepEqual(
    readback.runtime_environment_substrate_guard.ordinary_path.steps,
    [
      'runtime_environment_descriptor',
      'runtime_lock',
      'content_addressed_layers',
      'runtime_bundle_manifest',
      'materialized_runtime_root',
      'receipt_cleanup_rollback',
    ],
  );
  assert.equal(
    readback.runtime_environment_substrate_guard.ordinary_path.domain_agents_declare_dependency_intent_only,
    true,
  );
  assert.equal(
    readback.runtime_environment_substrate_guard.materialization_policy.writes_development_checkout,
    false,
  );
  assert.equal(
    readback.runtime_environment_substrate_guard.materialization_policy.writes_runtime_root_only_with_apply,
    true,
  );
  assert.equal(
    readback.runtime_environment_substrate_guard.cache_policy.cache_hit_counts_as_ready,
    false,
  );
  assert.equal(
    readback.runtime_environment_substrate_guard.cache_inventory_policy.deletes_domain_artifacts,
    false,
  );
  assert.equal(
    readback.runtime_environment_substrate_guard.dependency_prepare_policy.writes_domain_truth,
    false,
  );
  assert.equal(
    readback.runtime_environment_substrate_guard.dependency_prepare_policy
      .run_context_consumer_preflight,
    'fail_closed_on_missing_run_context_or_target_mismatch',
  );
  assert.equal(
    readback.runtime_environment_substrate_guard.dependency_prepare_policy
      .host_environment_fallback_allowed,
    false,
  );
  assert.equal(
    readback.runtime_environment_substrate_guard.run_context_consumer_policy.status,
    'fail_closed_consumer_preflight_available',
  );
  assert.equal(
    readback.runtime_environment_substrate_guard.run_context_consumer_policy
      .run_context_exists_counts_as_provider_ready,
    false,
  );
  assert.ok(
    readback.runtime_environment_substrate_guard.readback_commands.includes(
      'opl runtime env verify --runtime-root <path>',
    ),
  );
  assert.ok(
    readback.runtime_environment_substrate_guard.required_readback_claim_fields.includes(
      'can_claim_runtime_ready',
    ),
  );
  assert.ok(
    readback.runtime_environment_substrate_guard.forbidden_claims.includes(
      'runtime_environment_receipt_means_domain_ready',
    ),
  );
  assert.equal(
    readback.runtime_environment_substrate_guard.authority_boundary.can_write_domain_truth,
    false,
  );
  assert.equal(
    readback.runtime_environment_substrate_guard.authority_boundary.can_sign_owner_receipt,
    false,
  );
  assert.equal(
    readback.runtime_environment_substrate_guard.authority_boundary.can_create_typed_blocker,
    false,
  );
  assert.equal(
    readback.runtime_environment_substrate_guard.authority_boundary.can_schedule_domain_stage,
    false,
  );
  assert.equal(
    readback.runtime_environment_substrate_guard.false_ready_guard.materialization_receipt_can_claim_domain_ready,
    false,
  );
  assert.equal(
    readback.runtime_environment_substrate_guard.false_ready_guard.verification_receipt_can_claim_app_release_ready,
    false,
  );
  assert.equal(
    readback.runtime_environment_substrate_guard.false_ready_guard.runtime_environment_readback_can_create_typed_blocker,
    false,
  );
  assert.equal(
    readback.runtime_environment_substrate_guard.false_ready_guard
      .missing_run_context_allows_host_environment_fallback,
    false,
  );
  assert.equal(
    readback.runtime_environment_substrate_guard.false_ready_guard
      .run_context_target_mismatch_allows_consumer_execution,
    false,
  );
  assert.equal(
    readback.ordinary_progress_guard.surface_kind,
    'opl_ordinary_progress_owner_route_guard_readback',
  );
  assert.equal(
    readback.ordinary_progress_guard.ordinary_route_policy.default_planning_root,
    'current_owner_delta',
  );
  assert.equal(
    readback.ordinary_progress_guard.owner_answer_admission_gate.surface_kind,
    'opl_owner_answer_admission_gate_readback',
  );
  assert.equal(
    readback.ordinary_progress_guard.owner_answer_admission_gate.source_schema.surface_kind,
    'opl_owner_answer',
  );
  assert.equal(
    readback.ordinary_progress_guard.owner_answer_admission_gate.source_schema.schema_version,
    'owner-answer.v1',
  );
  assert.equal(
    readback.ordinary_progress_guard.owner_answer_admission_gate
      .source_schema.owner_answer_required_fields_present,
    true,
  );
  assert.deepEqual(
    readback.ordinary_progress_guard.owner_answer_admission_gate.accepted_answer_kinds,
    [
      'owner_receipt',
      'typed_blocker',
      'human_decision',
      'route_back',
    ],
  );
  assert.equal(
    readback.ordinary_progress_guard.owner_answer_admission_gate
      .default_next_action_source_priority[0],
    'fresh_current_owner_delta',
  );
  assert.ok(
    readback.ordinary_progress_guard.owner_answer_admission_gate.rejected_default_roots.includes(
      'provider_trace',
    ),
  );
  assert.equal(
    readback.ordinary_progress_guard.owner_answer_admission_gate
      .authority_boundary.opl_can_sign_domain_owner_answer,
    false,
  );
  assert.equal(
    readback.ordinary_progress_guard.owner_answer_admission_gate
      .authority_boundary.opl_can_create_typed_blocker,
    false,
  );
  assert.equal(
    readback.ordinary_progress_guard.owner_answer_admission_gate
      .false_ready_guard.owner_answer_shape_valid_can_claim_domain_ready,
    false,
  );
  assert.equal(
    readback.ordinary_progress_guard.owner_route_schema.surface_kind,
    'family_owner_route',
  );
  assert.equal(
    readback.ordinary_progress_guard.owner_route_schema.version,
    'family-owner-route.v1',
  );
  assert.equal(
    readback.ordinary_progress_guard.owner_route_schema.owner_route_required_fields_present,
    true,
  );
  assert.equal(
    readback.ordinary_progress_guard.typed_blocker_schema.surface_kind,
    'opl_stage_typed_blocker',
  );
  assert.equal(
    readback.ordinary_progress_guard.typed_blocker_schema.schema_version,
    'stage-typed-blocker.v1',
  );
  assert.equal(
    readback.ordinary_progress_guard.typed_blocker_schema.typed_blocker_required_fields_present,
    true,
  );
  assert.equal(
    readback.ordinary_progress_guard.human_gate_boundary.opl_can_make_human_decision,
    false,
  );
  assert.equal(
    readback.ordinary_progress_guard.human_gate_boundary.source_schema.version,
    'family-human-gate.v1',
  );
  assert.equal(
    readback.ordinary_progress_guard.human_gate_boundary.source_schema
      .human_gate_required_fields_present,
    true,
  );
  assert.ok(
    readback.ordinary_progress_guard.human_gate_boundary.source_schema.required_fields.includes(
      'decision_options',
    ),
  );
  assert.equal(
    readback.ordinary_progress_guard.authority_boundary.evidence_worklist_can_override_current_owner_delta,
    false,
  );
  assert.equal(
    readback.ordinary_progress_guard.false_ready_guard.typed_blocker_ref_can_claim_stage_success,
    false,
  );
  assert.equal(
    readback.primitive_runtime_owner_route_guard.surface_kind,
    'opl_primitive_runtime_owner_route_guard_readback',
  );
  assert.equal(
    readback.primitive_runtime_owner_route_guard.status,
    'closed_structure_gate_not_live_evidence',
  );
  assert.equal(
    readback.primitive_runtime_owner_route_guard.structural_closeout_guard.can_close_non_live_structure_gate,
    true,
  );
  assert.equal(
    readback.primitive_runtime_owner_route_guard.runtime_environment_summary
      .host_environment_fallback_allowed,
    false,
  );
  assert.equal(
    readback.primitive_runtime_owner_route_guard.domain_progress_runtime_summary
      .policy_adapter_matches_contract,
    true,
  );
  assert.equal(
    readback.primitive_runtime_owner_route_guard.ordinary_route_summary.typed_blocker_schema_ready,
    true,
  );
  assert.equal(
    readback.primitive_runtime_owner_route_guard.ordinary_route_summary.human_gate_schema_ready,
    true,
  );
  assert.equal(
    readback.primitive_runtime_owner_route_guard.authority_boundary
      .primitive_guard_can_create_typed_blocker,
    false,
  );
  assert.equal(
    readback.primitive_runtime_owner_route_guard.authority_boundary
      .primitive_guard_can_make_human_decision,
    false,
  );
  assert.equal(
    readback.primitive_runtime_owner_route_guard.false_ready_guard
      .runtime_environment_guard_closed_can_claim_runtime_ready,
    false,
  );
  assert.equal(
    readback.primitive_runtime_owner_route_guard.false_ready_guard
      .no_second_truth_guard_ready_can_claim_full_goal_complete,
    false,
  );
  assert.ok(
    readback.primitive_runtime_owner_route_guard.structural_closeout_guard.cannot_claim.includes(
      'provider_long_soak_complete',
    ),
  );
  assert.equal(readback.app_shell_policy.mainline, 'AionUI/opl-aion-shell');
  assert.equal(readback.app_shell_policy.foreground_alternative, 'Hermes Desktop/hermes-codex');
  assert.equal(readback.app_shell_policy.archived_technical_proof_only, 'AGUI/agui-codex');
  assert.equal(
    readback.app_shell_policy.convergence_readback.status,
    'closed_structure_gate_not_live_evidence',
  );
  assert.equal(
    readback.app_shell_policy.convergence_readback.absorbed_origin_main_sha,
    '9cb0196c06d1203a33d9aad20b9299eac6f36a0e',
  );
  assert.equal(
    readback.app_shell_policy.convergence_readback.readback_command,
    'npm run validate:shell-convergence',
  );
  assert.deepEqual(
    readback.app_shell_policy.convergence_readback.default_candidate_validation_scope,
    ['hermes-codex'],
  );
  assert.deepEqual(
    readback.app_shell_policy.convergence_readback.archived_technical_proofs,
    ['agui-codex'],
  );
  assert.deepEqual(readback.app_shell_policy.convergence_readback.false_ready_boundary, {
    active_shell_switch_allowed_by_this_readback: false,
    can_claim_active_shell_adopted: false,
    can_claim_app_release_ready: false,
    can_claim_production_ready: false,
    can_claim_live_user_path: false,
    can_claim_live_evidence: false,
    can_claim_packaged_gui_acceptance: false,
  });
  assert.equal(
    readback.app_shell_policy.convergence_readback.hermes_candidate_functional_convergence_readback
      .surface_kind,
    'opl_hermes_candidate_functional_convergence_readback',
  );
  assert.equal(
    readback.app_shell_policy.convergence_readback.hermes_candidate_functional_convergence_readback
      .absorbed_origin_main_sha,
    'bd139d5e1bcb57e47defbd59f411032e0b240a60',
  );
  assert.equal(
    readback.app_shell_policy.convergence_readback.hermes_candidate_functional_convergence_readback
      .false_ready_boundary.can_claim_app_release_ready,
    false,
  );
  assert.equal(
    readback.app_shell_policy.convergence_readback.hermes_candidate_operator_functional_surface_readback
      .surface_kind,
    'opl_hermes_candidate_operator_functional_surface_readback',
  );
  assert.equal(
    readback.app_shell_policy.convergence_readback.hermes_candidate_operator_functional_surface_readback
      .absorbed_origin_main_sha,
    'bd139d5e1bcb57e47defbd59f411032e0b240a60',
  );
  assert.deepEqual(
    readback.app_shell_policy.convergence_readback.hermes_candidate_operator_functional_surface_readback
      .operator_surface_ids,
    [
      'domain_skill_catalog',
      'ordinary_session_prompt_path',
      'operator_settings_and_model_access',
      'composer_affordances',
    ],
  );
  assert.equal(
    readback.app_shell_policy.convergence_readback.hermes_candidate_operator_functional_surface_readback
      .false_ready_boundary.can_claim_app_operator_sustained_consumption,
    false,
  );
  assert.ok(
    readback.current_tranche.lanes.some((lane: { lane_id: string; repo: string }) => (
      lane.lane_id === 'mag-source-purity-cli-readback-20260622'
      && lane.repo === 'med-autogrant'
    )),
  );
  assert.ok(
    readback.current_tranche.lanes.some((lane: { lane_id: string; repo: string }) => (
      lane.lane_id === 'rca-tail-owner-delta-readback-20260622'
      && lane.repo === 'redcube-ai'
    )),
  );
  assert.ok(
    readback.current_tranche.lanes.some((lane: { lane_id: string; repo: string }) => (
      lane.lane_id === 'opl-tranche-backlog-readback-foldback-20260622'
      && lane.repo === 'one-person-lab'
    )),
  );
  assert.ok(
    readback.current_tranche.lanes.some((lane: { lane_id: string; repo: string }) => (
      lane.lane_id === 'opl-oma-conformance-residue-classification-20260622'
      && lane.repo === 'one-person-lab'
    )),
  );
  assert.ok(
    readback.milestones.some((milestone: { milestone_id: string; priority: string }) =>
      milestone.milestone_id === 'opl_primitive_runtime_owner_route_guard'
      && milestone.priority === 'P0'
    ),
  );
  const supportMilestone = readback.milestones.find(
    (milestone: { milestone_id: string }) =>
      milestone.milestone_id === 'support_repo_profile_no_resurrection',
  );
  assert.ok(supportMilestone);
  assert.ok(
    supportMilestone.current_truth_refs.includes('opl-doc:contracts/support-repo-policy.json'),
  );
  assert.equal(
    supportMilestone.current_truth_refs.includes('opl-doc:contracts/support_repo_policy.json'),
    false,
  );
  assert.ok(
    milestonesById['strict_source_purity_private_wrapper_retirement'].current_truth_refs.includes(
      'med-autogrant:authority morphology-guard#strict_source_purity_no_second_truth_guard',
    ),
  );
  assert.ok(
    milestonesById['oma_script_to_pack_hygiene'].current_truth_refs.includes(
      'opl-meta-agent:npm run source-structure:json --silent',
    ),
  );
  assert.ok(
    readback.milestones.every((milestone: { authority_boundary: { can_create_second_active_backlog: boolean } }) =>
      milestone.authority_boundary.can_create_second_active_backlog === false
    ),
  );
});

test('framework tranche backlog guard readbacks stay split behind a thin facade', () => {
  const facade = fs.readFileSync(
    path.join(repoRoot, 'src/framework-tranche-backlog-parts/guard-readbacks.ts'),
    'utf8',
  );
  const guardParts = [
    ['domain-progress-runtime-guard.ts', 'buildDomainProgressTransitionRuntimeGuardReadback'],
    ['runtime-environment-guard.ts', 'buildRuntimeEnvironmentSubstrateGuardReadback'],
    ['ordinary-progress-guard.ts', 'buildOrdinaryProgressGuardReadback'],
    ['primitive-runtime-owner-route-guard.ts', 'buildPrimitiveRuntimeOwnerRouteGuardReadback'],
    ['generated-hosted-boundary-guard.ts', 'buildGeneratedHostedBoundaryReadback'],
    ['memory-artifact-lifecycle-boundary-guard.ts', 'buildMemoryArtifactLifecycleBoundaryGuardReadback'],
    ['standard-agent-landing-guard.ts', 'buildStandardAgentLandingAcceptanceGuardReadback'],
  ] as const;

  assert.equal(facade.includes('export function '), false);
  assert.equal(facade.trim().split(/\r?\n/).length, guardParts.length);

  for (const [fileName, exportName] of guardParts) {
    assert.match(
      facade,
      new RegExp(`export \\{ ${exportName} \\} from './${fileName.replace('.', '\\.')}'`),
    );
    const source = fs.readFileSync(
      path.join(repoRoot, 'src/framework-tranche-backlog-parts', fileName),
      'utf8',
    );
    assert.match(source, new RegExp(`export function ${exportName}\\(`));
    assert.ok(
      source.trim().split(/\r?\n/).length <= 240,
      `${fileName} should stay inside the focused source-boundary budget`,
    );
  }
});

test('framework production closeout command is retired in favor of operating maturity', () => {
  const failure = runCliFailure(['framework', 'production-closeout']);

  assert.equal(failure.payload.error.code, 'cli_usage_error');
  assert.match(failure.payload.error.message, /has been retired/);
  assert.equal(failure.payload.error.details.command, 'opl framework production-closeout');
  assert.equal(
    failure.payload.error.details.replacement,
    'opl framework operating-maturity --family-defaults --json',
  );
  assert.equal(failure.payload.error.details.retired, true);
});
