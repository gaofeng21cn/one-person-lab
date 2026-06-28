import { assert, runCli, test } from '../helpers.ts';

test('framework tranche backlog exposes current selection and closed tranche archive guards', () => {
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
  assert.equal(readback.current_tranche.selected_lane_count, 0);
  assert.equal(readback.current_tranche.selected_lane_count_within_policy, true);
  assert.equal(
    readback.current_tranche.tranche_role,
    'fresh_non_live_functional_structure_tranche_selected_not_full_completion_audit',
  );
  assert.equal(
    readback.current_tranche.current_work_order_status,
    'no_active_non_live_structure_lanes_selected',
  );
  assert.deepEqual(readback.current_tranche.selected_milestone_ids, []);
  assert.deepEqual(readback.current_tranche.closed_or_advanced_structural_milestone_ids, [
    'strict_source_purity_private_wrapper_retirement',
    'support_repo_profile_no_resurrection',
  ]);
  assert.equal(readback.current_tranche.next_selection_required, true);
  assert.equal(
    readback.current_tranche.closed_tranche_ref,
    'opl-family-ideal-operating-model-tranche-20260622c',
  );
  assert.deepEqual(
    readback.current_tranche.lanes.map((lane: { lane_id: string }) => lane.lane_id),
    [],
  );
  assert.deepEqual(
    readback.current_tranche.closed_selection_archive.lanes.map((lane: { lane_id: string }) => lane.lane_id),
    [
      'opl-tranche-backlog-foldback-20260622d',
      'rca-private-platform-json-readback-20260622d',
      'opl-doc-native-support-readback-20260622d',
    ],
  );
  assert.equal(
    readback.tranche_rollforward_guard.surface_kind,
    'opl_framework_tranche_rollforward_guard',
  );
  assert.equal(
    readback.tranche_rollforward_guard.status,
    'closed_tranche_archived_next_selection_required',
  );
  assert.equal(readback.tranche_rollforward_guard.source_tranche_is_current_work_order, false);
  assert.equal(readback.tranche_rollforward_guard.selected_lane_count, 3);
  assert.equal(readback.tranche_rollforward_guard.closed_lane_count, 3);
  assert.equal(readback.tranche_rollforward_guard.active_or_partial_lane_count, 0);
  assert.equal(readback.tranche_rollforward_guard.next_selection_required, true);
  assert.equal(
    readback.tranche_rollforward_guard.next_selection_policy.can_select_archived_lane_without_new_gap,
    false,
  );
  assert.equal(
    readback.tranche_rollforward_guard.false_ready_guard.archived_tranche_can_claim_full_goal_complete,
    false,
  );
  assert.equal(
    readback.last_closed_tranche.tranche_id,
    'opl-family-ideal-operating-model-tranche-20260622c',
  );
  assert.equal(readback.last_closed_tranche.selected_lane_count, 3);
  assert.deepEqual(
    readback.last_closed_tranche.lanes.map((lane: { lane_id: string }) => lane.lane_id),
    [
      'opl-tranche-backlog-foldback-20260622c',
      'mag-repo-shell-wrapper-source-purity-guard-20260622c',
      'rca-active-source-resurrection-scan-20260622c',
    ],
  );
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
  assert.equal(
    readback.current_tranche.tranche_closeout_progress.progress_status,
    'no_pending_self_lane_all_selected_structure_milestones_closed',
  );
  assert.equal(readback.current_tranche.tranche_closeout_progress.selected_lane_count, 0);
  assert.equal(readback.current_tranche.tranche_closeout_progress.remote_readback_matched_lane_count, 0);
  assert.equal(readback.current_tranche.tranche_closeout_progress.pending_self_lane_count, 0);
  assert.deepEqual(
    readback.current_tranche.tranche_closeout_progress.absorbed_remote_readbacks.map(
      (entry: { lane_id: string; commit_sha: string; remote_sha_matches_local: boolean }) => ({
        lane_id: entry.lane_id,
        commit_sha: entry.commit_sha,
        remote_sha_matches_local: entry.remote_sha_matches_local,
      }),
    ),
    [
      {
        lane_id: 'rca-private-platform-json-readback-20260622d',
        commit_sha: '0726ef03f158a0c90484edc53536f17cfe59a42f',
        remote_sha_matches_local: true,
      },
      {
        lane_id: 'opl-doc-native-support-readback-20260622d',
        commit_sha: '95b3cfaa4d35aa5791919d20052cb1c2d8d54841',
        remote_sha_matches_local: true,
      },
    ],
  );
  assert.equal(
    readback.current_tranche.tranche_closeout_progress.false_ready_boundary
      .static_backlog_can_self_certify_own_push,
    false,
  );
  assert.equal(
    readback.current_tranche.tranche_closeout_progress.false_ready_boundary
      .tranche_closeout_progress_can_claim_full_goal_completion,
    false,
  );
  const lanesById = Object.fromEntries(
    readback.last_closed_tranche.lanes.map((lane: { lane_id: string }) => [lane.lane_id, lane]),
  );
  const closedSelectionArchiveLanesById = Object.fromEntries(
    readback.current_tranche.closed_selection_archive.lanes.map((lane: { lane_id: string }) => [
      lane.lane_id,
      lane,
    ]),
  );
  assert.deepEqual(
    closedSelectionArchiveLanesById['opl-tranche-backlog-foldback-20260622d'].milestone_ids,
    [
      'strict_source_purity_private_wrapper_retirement',
      'support_repo_profile_no_resurrection',
    ],
  );
  assert.equal(
    closedSelectionArchiveLanesById['opl-tranche-backlog-foldback-20260622d'].repo,
    'one-person-lab',
  );
  assert.ok(
    closedSelectionArchiveLanesById['opl-tranche-backlog-foldback-20260622d']
      .non_live_completion_evidence_required.includes(
        'OPL_framework_tranche_backlog_remote_readbacks_reflect_RCA_and_OPL_DOC_origin_main_sha',
      ),
  );
  assert.ok(
    closedSelectionArchiveLanesById['opl-tranche-backlog-foldback-20260622d'].forbidden_scope.includes(
      'AGUI_update_or_foreground_resurrection',
    ),
  );
  assert.equal(
    closedSelectionArchiveLanesById['opl-tranche-backlog-foldback-20260622d']
      .authority_boundary.can_claim_plan_completion,
    false,
  );
  assert.deepEqual(
    closedSelectionArchiveLanesById['rca-private-platform-json-readback-20260622d'].milestone_ids,
    ['strict_source_purity_private_wrapper_retirement'],
  );
  assert.equal(
    closedSelectionArchiveLanesById['rca-private-platform-json-readback-20260622d'].repo,
    'redcube-ai',
  );
  assert.ok(
    closedSelectionArchiveLanesById['rca-private-platform-json-readback-20260622d']
      .required_surfaces.includes('API_readback'),
  );
  assert.ok(
    closedSelectionArchiveLanesById['rca-private-platform-json-readback-20260622d']
      .non_live_completion_evidence_required.includes(
        'RCA_private_platform_direct_JSON_readback_over_64KB_is_parseable',
      ),
  );
  assert.ok(
    closedSelectionArchiveLanesById['rca-private-platform-json-readback-20260622d'].forbidden_scope.includes(
      'visual_ready_or_exportable_claim',
    ),
  );
  assert.deepEqual(
    closedSelectionArchiveLanesById['opl-doc-native-support-readback-20260622d'].milestone_ids,
    ['support_repo_profile_no_resurrection'],
  );
  assert.equal(
    closedSelectionArchiveLanesById['opl-doc-native-support-readback-20260622d'].repo,
    'opl-doc',
  );
  assert.ok(
    closedSelectionArchiveLanesById['opl-doc-native-support-readback-20260622d']
      .required_surfaces.includes('API_readback'),
  );
  assert.ok(
    closedSelectionArchiveLanesById['opl-doc-native-support-readback-20260622d']
      .non_live_completion_evidence_required.includes(
        'OPL_DOC_native_check_materializes_support_profile_guard_and_audit',
      ),
  );
  assert.ok(
    closedSelectionArchiveLanesById['opl-doc-native-support-readback-20260622d'].forbidden_scope.includes(
      'Foundry_Agent_truth_set_membership_claim',
    ),
  );
  assert.deepEqual(
    lanesById['mag-repo-shell-wrapper-source-purity-guard-20260622c'].milestone_ids,
    ['strict_source_purity_private_wrapper_retirement'],
  );
  assert.equal(lanesById['mag-repo-shell-wrapper-source-purity-guard-20260622c'].repo, 'med-autogrant');
  assert.ok(
    lanesById['mag-repo-shell-wrapper-source-purity-guard-20260622c'].required_surfaces.includes('contract'),
  );
  assert.ok(
    lanesById['mag-repo-shell-wrapper-source-purity-guard-20260622c'].required_surfaces.includes('CLI_readback'),
  );
  assert.ok(
    lanesById['mag-repo-shell-wrapper-source-purity-guard-20260622c'].required_surfaces.includes('API_readback'),
  );
  assert.ok(
    lanesById['mag-repo-shell-wrapper-source-purity-guard-20260622c'].non_live_completion_evidence_required.includes(
      'MAG_repo_shell_verification_wrapper_guard_landed_in_source_purity_readback',
    ),
  );
  assert.ok(
    lanesById['mag-repo-shell-wrapper-source-purity-guard-20260622c'].non_live_completion_evidence_required.includes(
      'MAG_main_absorbed_push_and_remote_sha_readback_7d35de2d2084054b014b3e9e1952845633c3369e',
    ),
  );
  assert.ok(
    lanesById['mag-repo-shell-wrapper-source-purity-guard-20260622c'].forbidden_scope.includes(
      'physical_delete_authorization',
    ),
  );
  assert.ok(
    lanesById['mag-repo-shell-wrapper-source-purity-guard-20260622c'].forbidden_scope.includes(
      'grant_ready_claim',
    ),
  );
  assert.equal(
    lanesById['mag-repo-shell-wrapper-source-purity-guard-20260622c']
      .authority_boundary.can_create_second_active_backlog,
    false,
  );
  assert.deepEqual(
    lanesById['rca-active-source-resurrection-scan-20260622c'].milestone_ids,
    ['strict_source_purity_private_wrapper_retirement'],
  );
  assert.equal(lanesById['rca-active-source-resurrection-scan-20260622c'].repo, 'redcube-ai');
  assert.ok(
    lanesById['rca-active-source-resurrection-scan-20260622c'].required_surfaces.includes('contract'),
  );
  assert.ok(
    lanesById['rca-active-source-resurrection-scan-20260622c'].required_surfaces.includes('CLI_readback'),
  );
  assert.ok(
    lanesById['rca-active-source-resurrection-scan-20260622c'].non_live_completion_evidence_required.includes(
      'RCA_active_source_resurrection_scan_landed_in_private_platform_readback',
    ),
  );
  assert.ok(
    lanesById['rca-active-source-resurrection-scan-20260622c'].non_live_completion_evidence_required.includes(
      'RCA_private_platform_strict_and_default_caller_tail_strict_readbacks_include_guard',
    ),
  );
  assert.ok(
    lanesById['rca-active-source-resurrection-scan-20260622c'].forbidden_scope.includes(
      'physical_delete_authorization',
    ),
  );
  assert.ok(
    lanesById['rca-active-source-resurrection-scan-20260622c'].forbidden_scope.includes(
      'default_caller_cutover_claim',
    ),
  );
  assert.equal(
    lanesById['rca-active-source-resurrection-scan-20260622c']
      .authority_boundary.can_create_second_active_backlog,
    false,
  );
  assert.ok(
    lanesById['rca-active-source-resurrection-scan-20260622c'].forbidden_scope.includes(
      'visual_ready_or_exportable_claim',
    ),
  );
  assert.equal(
    readback.foundry_standard_agent_membership_readback.surface_kind,
    'opl_foundry_standard_agent_membership_readback',
  );
  assert.equal(
    readback.foundry_standard_agent_membership_readback.status,
    'closed_structure_gate_not_live_evidence',
  );
  assert.deepEqual(
    readback.foundry_standard_agent_membership_readback.standard_member_agent_ids,
    ['mas', 'mag', 'rca', 'oma', 'opl-bookforge'],
  );
  assert.equal(
    readback.foundry_standard_agent_membership_readback.public_projection_policy
      .generated_surface_or_hosted_route_is_membership_axis,
    false,
  );
  assert.equal(
    readback.foundry_standard_agent_membership_readback.false_ready_guard
      .standard_membership_can_claim_domain_ready,
    false,
  );
  assert.equal(readback.authority_boundary.can_create_second_active_backlog, false);
  assert.equal(readback.authority_boundary.can_claim_plan_completion, false);
  assert.equal(readback.authority_boundary.can_claim_domain_ready, false);
  assert.equal(readback.false_ready_guard.plan_completion_audit_required_for_full_goal_completion, true);
  assert.equal(
    readback.operator_compact_readback_guard.surface_kind,
    'opl_operator_compact_readback_guard',
  );
  assert.equal(
    readback.operator_compact_readback_guard.status,
    'closed_structure_gate_not_live_evidence',
  );
  assert.deepEqual(
    readback.operator_compact_readback_guard.compact_surface_ids,
    ['framework_readiness_compact', 'framework_operating_maturity_compact'],
  );
  assert.equal(readback.operator_compact_readback_guard.compact_surface_count, 2);
  assert.equal(
    readback.operator_compact_readback_guard.no_second_truth_guard
      .compact_surfaces_can_be_source_of_truth,
    false,
  );
  assert.equal(
    readback.operator_compact_readback_guard.structural_closeout_guard.default_full_readback_unchanged,
    true,
  );
  assert.equal(
    readback.operator_compact_readback_guard.structural_closeout_guard
      .does_not_claim_lower_compute_cost,
    true,
  );
  assert.deepEqual(
    readback.operator_compact_readback_guard.structural_closeout_guard.requires_full_detail_for,
    [
      'raw audit drilldown inspection',
      'owner evidence intake review',
      'evidence worklist inspection',
      'provider or App release evidence review',
      'diagnostic payload debugging',
      'Plan Completion Audit',
    ],
  );
  assert.equal(
    readback.operator_compact_readback_guard.authority_boundary
      .compact_readback_can_claim_goal_complete,
    false,
  );
  assert.equal(
    readback.source_structure_operator_guard.surface_kind,
    'opl_source_structure_operator_readback',
  );
  assert.equal(
    readback.source_structure_operator_guard.readback_role,
    'operator_source_structure_guard_not_completion_audit_not_readiness_or_quality_verdict',
  );
  assert.equal(readback.source_structure_operator_guard.owner, 'one-person-lab');
  assert.equal(readback.source_structure_operator_guard.default_limit, 1000);
  assert.equal(readback.source_structure_operator_guard.advisory_passed, true);
  assert.equal(
    readback.source_structure_operator_guard.authority_boundary.can_create_second_source_truth,
    false,
  );
  assert.equal(
    readback.source_structure_operator_guard.authority_boundary.can_claim_plan_completion,
    false,
  );
  assert.equal(
    readback.source_structure_operator_guard.false_ready_guard
      .source_structure_readback_can_claim_goal_complete,
    false,
  );
  assert.equal(
    readback.source_structure_operator_guard.false_ready_guard
      .findings_are_maintenance_signal_not_domain_blocker,
    true,
  );
});
