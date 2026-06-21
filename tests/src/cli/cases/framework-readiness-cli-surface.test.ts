import { assert, runCli, runCliFailure, test } from '../helpers.ts';

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
  assert.equal(readback.current_tranche.selected_lane_count, 2);
  assert.equal(readback.current_tranche.selected_lane_count_within_policy, true);
  assert.equal(
    readback.current_tranche.tranche_role,
    'non_live_functional_structure_milestone_tranche_not_full_completion_audit',
  );
  assert.deepEqual(readback.current_tranche.selected_milestone_ids, [
    'opl_primitive_runtime_owner_route_guard',
    'memory_artifact_lifecycle_functional_boundary',
  ]);
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
    lanesById['opl-domain-progress-runtime-guard-20260621'].milestone_ids,
    ['opl_primitive_runtime_owner_route_guard'],
  );
  assert.deepEqual(
    lanesById['opl-memory-artifact-lifecycle-boundary-20260621'].milestone_ids,
    ['memory_artifact_lifecycle_functional_boundary'],
  );
  assert.ok(
    lanesById['opl-domain-progress-runtime-guard-20260621'].required_surfaces.includes(
      'API_readback',
    ),
  );
  assert.ok(
    lanesById['opl-domain-progress-runtime-guard-20260621'].required_surfaces.includes('contract'),
  );
  assert.ok(
    lanesById['opl-domain-progress-runtime-guard-20260621'].forbidden_scope.includes(
      'owner_receipt_or_typed_blocker_authority',
    ),
  );
  assert.ok(
    lanesById['opl-memory-artifact-lifecycle-boundary-20260621'].required_surfaces.includes(
      'CLI_readback',
    ),
  );
  assert.equal(
    lanesById['opl-domain-progress-runtime-guard-20260621']
      .authority_boundary.can_create_second_active_backlog,
    false,
  );
  assert.ok(
    lanesById['opl-memory-artifact-lifecycle-boundary-20260621'].forbidden_scope.includes(
      'artifact_body_mutation',
    ),
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
    readback.generated_hosted_surface_boundary.support_repo_boundary.support_repos_can_join_default_foundry_agent_truth_set,
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
    'runtime_lock_materializer_cache_prune_available',
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
    readback.ordinary_progress_guard.authority_boundary.evidence_worklist_can_override_current_owner_delta,
    false,
  );
  assert.equal(
    readback.ordinary_progress_guard.false_ready_guard.typed_blocker_ref_can_claim_stage_success,
    false,
  );
  assert.equal(readback.app_shell_policy.mainline, 'AionUI/opl-aion-shell');
  assert.equal(readback.app_shell_policy.foreground_alternative, 'Hermes Desktop/hermes-codex');
  assert.equal(readback.app_shell_policy.archived_technical_proof_only, 'AGUI/agui-codex');
  assert.ok(
    readback.milestones.some((milestone: { milestone_id: string; priority: string }) =>
      milestone.milestone_id === 'opl_primitive_runtime_owner_route_guard'
      && milestone.priority === 'P0'
    ),
  );
  assert.ok(
    readback.milestones.every((milestone: { authority_boundary: { can_create_second_active_backlog: boolean } }) =>
      milestone.authority_boundary.can_create_second_active_backlog === false
    ),
  );
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
