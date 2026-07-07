import { assert, runCli, test } from '../helpers.ts';
import { WORKSPACE_TOPOLOGY_PROFILE_CONTRACT } from '../../../../src/modules/workspace/workspace-topology.ts';

test('agents scaffold exposes OPL-owned reusable agent scaffold without owning domain truth', () => {
  const output = runCli(['agents', 'scaffold']);
  const scaffold = output.standard_domain_agent_scaffold;

  assert.equal(scaffold.surface_kind, 'opl_standard_domain_agent_scaffold');
  assert.equal(scaffold.owner, 'one-person-lab');
  assert.equal(scaffold.state, 'template_contract_available');
  assert.equal(scaffold.generation_policy.scaffold_command_is_read_only, true);
  assert.equal(scaffold.generation_policy.creates_files, false);
  assert.equal(scaffold.generation_policy.write_requires_explicit_target_dir, true);
  assert.deepEqual(scaffold.repo_source_boundary.required_dirs, ['agent', 'contracts', 'runtime', 'docs']);
  assert.deepEqual(scaffold.repo_source_boundary.forbidden_dirs, ['artifacts']);
  assert.equal(scaffold.repo_source_boundary.runtime_artifacts_live_in_source_repo, false);
  assert.deepEqual(scaffold.docs_taxonomy, [
    'active',
    'public',
    'product',
    'runtime',
    'delivery',
    'source',
    'policies',
    'specs',
    'references',
    'history',
  ]);
  assert.deepEqual(
    scaffold.opl_owned_generic_primitives.map((primitive: { primitive_id: string }) => primitive.primitive_id),
    [
      'scheduler_supervision_cadence',
      'provider_slo_and_wakeup_transport',
      'queue_attempt_ledger',
      'generic_transition_runner',
      'workspace_source_intake_shell',
      'memory_locator_writeback_transport',
      'artifact_package_lifecycle_shell',
      'operator_workbench_drilldown_shell',
      'observability_repair_projection',
      'generic_persistence_store',
      'runtime_lifecycle_sqlite_index_contract',
      'native_helper_generic_envelope',
      'review_repair_transport',
      'pack_compiler_generated_surface',
      'functional_privatization_audit_read_model',
    ],
  );
  assert.equal(scaffold.declarative_domain_pack.includes('stage_descriptors'), true);
  assert.equal(scaffold.declarative_domain_pack.includes('owner_receipt_schema'), true);
  assert.equal(scaffold.minimal_authority_functions.includes('quality_or_export_verdict_authorizer'), true);
  assert.equal(scaffold.minimal_authority_functions.includes('memory_accept_reject_decider'), true);
  assert.equal(scaffold.pack_compiler_contract.generated_surface_owner, 'one-person-lab');
  assert.equal(
    scaffold.opl_generated_surfaces.some((surface: { surface_id: string }) => surface.surface_id === 'cli'),
    true,
  );
  assert.equal(
    scaffold.opl_generated_surfaces.some((surface: { surface_id: string }) => surface.surface_id === 'mcp'),
    true,
  );
  assert.equal(
    scaffold.opl_generated_surfaces.some((surface: { surface_id: string }) =>
      surface.surface_id === 'status_read_model'
    ),
    true,
  );
  assert.equal(scaffold.agent_pack_contract.conformance_version, 'standard-stage-pack.v2');
  assert.equal(scaffold.default_runtime_policy.surface_kind, 'opl_standard_agent_default_runtime_policy');
  assert.equal(scaffold.default_runtime_policy.default_runtime_path, 'opl_temporal_hosted_autonomous');
  assert.equal(scaffold.default_runtime_policy.temporal_hosted_autonomy_default_enabled, true);
  assert.equal(scaffold.default_runtime_policy.domain_agent_internal_daemon_allowed, false);
  assert.equal(scaffold.default_runtime_policy.codex_app_drives_long_running_tasks, false);
  assert.equal(scaffold.default_runtime_policy.provider_managed_surfaces.includes('stage_progress_log'), true);
  assert.equal(
    scaffold.default_runtime_policy.required_user_stage_log.missing_semantic_summary_status,
    'missing_domain_semantic_summary',
  );
  assert.equal(
    scaffold.default_runtime_policy.required_user_stage_log.canonical_domain_fields.includes('stage_work_done'),
    true,
  );
  assert.equal(
    scaffold.default_runtime_policy.required_user_stage_log.canonical_domain_fields.includes(
      'deliverable_progress_delta',
    ),
    true,
  );
  assert.equal(
    scaffold.default_runtime_policy.required_user_stage_log.platform_only_is_not_deliverable_progress,
    true,
  );
  assert.equal(
    scaffold.required_contract_surfaces.includes('user_stage_log_contract'),
    true,
  );
  assert.equal(
    scaffold.required_contract_surfaces.includes('progress_delta_policy'),
    true,
  );
  assert.equal(
    scaffold.required_contract_surfaces.includes('typed_blocker_lineage_policy'),
    true,
  );
  assert.equal(
    scaffold.required_contract_surfaces.includes('foundry_agent_series_contract'),
    true,
  );
  assert.equal(
    scaffold.required_contract_surfaces.includes('stage_operating_principles'),
    true,
  );
  assert.equal(
    scaffold.required_verification.includes('user_stage_log_semantics_or_typed_blocker'),
    true,
  );
  assert.equal(
    scaffold.required_verification.includes('stage_operating_principles_declared'),
    true,
  );
  assert.equal(
    scaffold.user_stage_log_contract.surface_kind,
    'opl_standard_agent_user_stage_log_contract',
  );
  assert.equal(
    scaffold.user_stage_log_contract.standard_agent_requirement,
    'domain_stage_closeout_must_return_user_readable_stage_semantics_or_typed_blocker',
  );
  assert.deepEqual(scaffold.user_stage_log_contract.required_observability_fields, [
    'duration',
    'token_usage',
    'cost',
  ]);
  assert.equal(
    scaffold.user_stage_log_contract.incomplete_semantics_policy,
    'emit_missing_domain_fields_without_opl_domain_inference',
  );
  assert.equal(
    scaffold.user_stage_log_contract.accounting_policy,
    'OPL projects duration/token/cost status, source refs, and explicit missing reasons; duration may use provider or attempt wall-clock fallback for user readability while duration_telemetry_status stays missing until usage telemetry exists',
  );
  assert.equal(scaffold.user_stage_log_contract.authority_boundary.opl_can_infer_domain_semantics, false);
  assert.deepEqual(scaffold.progress_delta_policy.required_fields, [
    'progress_delta_classification',
    'deliverable_progress_delta',
    'platform_repair_delta',
    'next_forced_delta',
  ]);
  assert.equal(scaffold.progress_delta_policy.platform_only_is_not_deliverable_progress, true);
  assert.equal(scaffold.typed_blocker_lineage_policy.surface_kind, 'family-stall-lineage.v1');
  assert.deepEqual(scaffold.typed_blocker_lineage_policy.repeat_budget, {
    mechanism_repair_after_repeat_count: 2,
    human_gate_or_stop_loss_after_repeat_count: 3,
  });
  assert.equal(
    scaffold.stage_operating_principles_policy.surface_kind,
    'opl_standard_agent_stage_operating_principles',
  );
  assert.equal(
    scaffold.stage_operating_principles_policy.management_boundary.stage_unit,
    'coarse_grained_stage_attempt',
  );
  assert.equal(scaffold.stage_operating_principles_policy.default_read_surface.root, 'current_owner_delta');
  assert.equal(scaffold.stage_operating_principles_policy.default_read_surface.raw_worklist_default, false);
  assert.equal(scaffold.stage_operating_principles_policy.default_read_surface.readiness_default, false);
  assert.equal(
    scaffold.stage_operating_principles_policy.speed_policy.quality_gaps_block_ordinary_progress_by_default,
    false,
  );
  assert.equal(
    scaffold.foundry_agent_series_contract.surface_kind,
    'opl_foundry_agent_series_contract',
  );
  assert.equal(
    scaffold.foundry_agent_series_contract.agent_membership_projection_policy.policy_id,
    'standard_agent_membership_not_surface_origin',
  );
  assert.equal(
    scaffold.foundry_agent_series_contract.agent_membership_projection_policy.default_membership,
    'standard_domain_agent',
  );
  assert.equal(
    scaffold.foundry_agent_series_contract.agent_membership_projection_policy
      .public_agent_list_must_not_split_by_generated_surface,
    true,
  );
  assert.equal(
    scaffold.foundry_agent_series_contract.agent_membership_projection_policy
      .public_agent_list_must_not_split_by_plugin_transport,
    true,
  );
  assert.equal(
    scaffold.foundry_agent_series_contract.agent_membership_projection_policy.generated_surface_is_membership_axis,
    false,
  );
  assert.equal(
    scaffold.foundry_agent_series_contract.agent_membership_projection_policy.generated_surface_is_status_axis,
    false,
  );
  assert.equal(
    scaffold.foundry_agent_series_contract.agent_membership_projection_policy.plugin_transport_is_membership_axis,
    false,
  );
  assert.equal(
    scaffold.foundry_agent_series_contract.agent_membership_projection_policy.plugin_transport_is_status_axis,
    false,
  );
  assert.deepEqual(scaffold.foundry_agent_series_contract.shared_progress_projection_fields, [
    'progress_delta_classification',
    'deliverable_progress_delta',
    'platform_repair_delta',
    'next_forced_delta',
  ]);
  assert.equal(
    scaffold.foundry_agent_series_contract.domain_adapter_policy.no_parallel_progress_schema,
    true,
  );
  assert.deepEqual(
    scaffold.foundry_agent_series_contract.workspace_topology_profile,
    WORKSPACE_TOPOLOGY_PROFILE_CONTRACT,
  );
  assert.deepEqual(scaffold.foundry_agent_series_contract.contract_version_policy, {
    current_version: 'foundry-agent-series.v1',
    domain_contract_ref: 'contracts/foundry_agent_series.json',
    exact_version_pin_required: true,
    compatible_version_range: ['foundry-agent-series.v1'],
    breaking_change_requires_new_version: true,
    domain_descriptor_must_reference_domain_contract: true,
  });
  assert.equal(
    scaffold.foundry_agent_series_contract.shared_release_pin_strategy.owner_release_contract_ref,
    'contracts/family-release/shared-owner-release.json',
  );
  assert.equal(
    scaffold.foundry_agent_series_contract.shared_release_pin_strategy.consumer_alignment_check,
    'family:shared-release',
  );
  assert.equal(
    scaffold.foundry_agent_series_contract.shared_policy_release.policy_release_contract_ref,
    'contracts/opl-framework/foundry-agent-series-policy-release.json',
  );
  assert.equal(
    scaffold.foundry_agent_series_contract.shared_policy_release.consumer_alignment_check,
    'foundry:policy-release',
  );
  assert.match(
    scaffold.foundry_agent_series_contract.shared_policy_release.policy_bundle_fingerprint,
    /^sha256:[0-9a-f]{64}$/,
  );
  assert.equal(
    scaffold.foundry_agent_series_policy_release.policy_bundle_fingerprint,
    scaffold.foundry_agent_series_contract.shared_policy_release.policy_bundle_fingerprint,
  );
  assert.equal(
    scaffold.foundry_agent_series_policy_release.domain_pin_requirements
      .domain_adapter_must_not_copy_policy_body_as_authority,
    true,
  );
  assert.equal(
    scaffold.foundry_agent_series_contract.app_projection_policy.app_consumes_shared_progress_projection_only,
    true,
  );
  assert.equal(
    scaffold.agent_pack_contract.stage_ref_requirements.includes(
      'selected_executor:codex_cli default binding or explicit non-default executor binding',
    ),
    true,
  );
  assert.equal(
    scaffold.agent_pack_contract.stage_ref_requirements.includes(
      'user_stage_log_requirement:domain provides human-readable stage semantics; OPL projects timing usage refs only',
    ),
    true,
  );
  assert.equal(
    scaffold.agent_pack_contract.foundry_agent_series_contract.version,
    'foundry-agent-series.v1',
  );
  assert.deepEqual(scaffold.pack_compiler_contract.required_source_refs, [
    'stage_graph_source_ref',
    'quality_gate_source_ref',
    'executor_policy_source_ref',
    'owner_receipt_schema_source_ref',
    'authority_functions_source_ref',
    'functional_privatization_audit_source_ref',
    'generated_surface_handoff_source_ref',
    'capability_map_source_ref',
  ]);
  assert.equal(scaffold.domain_retained_thin_surfaces.includes('domain_truth'), true);
  assert.equal(
    scaffold.domain_retained_thin_surfaces.includes(
      'domain_handler_target_or_opaque_ref_projection_output',
    ),
    true,
  );
  assert.equal(scaffold.domain_retained_thin_surfaces.includes('sidecar_or_projection_adapter'), false);
  assert.equal('domain_retained_thin_surfaces_deprecated' in scaffold, false);
  assert.equal(
    scaffold.private_functional_surface_admission_policy.surface_kind,
    'opl_domain_private_functional_surface_admission_policy',
  );
  assert.equal(
    scaffold.private_functional_surface_admission_policy.default_posture,
    'forbidden_until_classified_and_receipted',
  );
  assert.equal(
    scaffold.private_functional_surface_admission_policy.default_review_view.attention_required.includes(
      'tombstone_has_active_caller',
    ),
    true,
  );
  assert.equal(
    scaffold.private_functional_surface_admission_policy.default_review_view.hidden_by_default.includes(
      'cleared_or_stable_boundary',
    ),
    true,
  );
  assert.equal(
    scaffold.private_functional_surface_admission_policy.default_review_view
      .semantic_equivalence_review_required_when
      .includes('active_caller_status_or_migration_action_says_active_private'),
    true,
  );
  assert.equal(
    scaffold.private_functional_surface_admission_policy.taxonomy_layers.standard_domain_pack_inventory.private_surface,
    false,
  );
  assert.equal(
    scaffold.private_functional_surface_admission_policy.taxonomy_layers.authority_function_inventory
      .abi.output.includes('owner_receipt'),
    true,
  );
  assert.equal(
    scaffold.private_functional_surface_admission_policy.taxonomy_layers.private_platform_residue_inventory.private_surface,
    true,
  );
  assert.equal(
    scaffold.private_functional_surface_admission_policy.taxonomy_layers.authority_function_inventory
      .abi.forbidden_outputs.includes('queue_or_attempt_ledger_mutation'),
    true,
  );
  assert.equal(
    scaffold.private_functional_surface_admission_policy.allowed_private_surface_classes.some(
      (surfaceClass: { class_id: string; long_term_allowed: boolean }) =>
        surfaceClass.class_id === 'minimal_authority_function' && surfaceClass.long_term_allowed === true,
    ),
    true,
  );
  assert.equal(
    scaffold.private_functional_surface_admission_policy.allowed_private_surface_classes.some(
      (surfaceClass: { class_id: string; long_term_allowed: boolean }) =>
        surfaceClass.class_id === 'temporary_migration_bridge' && surfaceClass.long_term_allowed === false,
    ),
    true,
  );
  assert.equal(
    scaffold.private_functional_surface_admission_policy.forbidden_private_surface_classes.includes(
      'generic_persistence_or_sqlite_lifecycle_engine',
    ),
    true,
  );
  assert.equal(
    scaffold.private_functional_surface_admission_policy.required_evidence_before_retaining_private_surface.includes(
      'cannot_absorb_reason_or_retirement_gate',
    ),
    true,
  );
  assert.equal(scaffold.forbidden_domain_generic_owner_roles.includes('generic_scheduler_owner'), true);
  assert.equal(scaffold.forbidden_domain_generic_owner_roles.includes('generic_attempt_ledger_owner'), true);
  assert.equal(scaffold.forbidden_domain_generic_owner_roles.includes('generic_persistence_engine_owner'), true);
  assert.equal(scaffold.forbidden_domain_generic_owner_roles.includes('generated_surface_owner_in_domain_repo'), true);
  assert.equal(scaffold.required_contract_surfaces.includes('pack_compiler_input'), true);
  assert.equal(scaffold.required_contract_surfaces.includes('generated_surface_handoff'), true);
  assert.equal(scaffold.required_contract_surfaces.includes('functional_privatization_audit'), true);
  assert.equal(scaffold.required_contract_surfaces.includes('workspace_lifecycle_policy'), true);
  assert.equal(scaffold.required_contract_surfaces.includes('stage_operating_principles'), true);
  assert.equal(scaffold.required_contract_surfaces.includes('state_index_kernel_adoption'), true);
  assert.equal(scaffold.required_verification.includes('functional_privatization_audit_no_generic_owner'), true);
  assert.equal(scaffold.required_verification.includes('workspace_file_lifecycle_policy_declared'), true);
  assert.equal(scaffold.required_verification.includes('stage_operating_principles_declared'), true);
  assert.equal(scaffold.required_verification.includes('state_index_kernel_adoption_declared'), true);
  assert.equal(scaffold.required_verification.includes('generated_surface_handoff_parity'), true);
  assert.equal(
    scaffold.workspace_file_lifecycle_policy.surface_kind,
    'opl_domain_workspace_file_lifecycle_policy',
  );
  assert.equal(
    scaffold.workspace_file_lifecycle_policy.repo_source_boundaries.runtime_artifacts_live_in_source_repo,
    false,
  );
  assert.equal(
    scaffold.workspace_file_lifecycle_policy.workspace_runtime_artifact_roots.repo_source_policy,
    'locator_index_schema_receipt_refs_only',
  );
  assert.equal(
    scaffold.state_index_kernel_adoption_policy.surface_kind,
    'opl_state_index_kernel_adoption',
  );
  assert.equal(
    scaffold.state_index_kernel_adoption_policy.authority_boundary.sqlite_sidecar_source_of_truth,
    false,
  );
  assert.equal(
    scaffold.functional_privatization_audit_contract.surface_kind,
    'opl_functional_privatization_audit_contract',
  );
  assert.equal(scaffold.functional_privatization_audit_contract.migration_classes.includes('opl_generated_surface'), true);
  assert.equal(scaffold.functional_privatization_audit_contract.migration_classes.includes('declarative_pack'), true);
  assert.equal(
    scaffold.functional_privatization_audit_contract.migration_classes.includes('minimal_authority_function'),
    true,
  );
  assert.equal(
    scaffold.functional_privatization_audit_contract.module_inventory_fields.includes('standardization_layer'),
    true,
  );
  assert.equal(
    scaffold.functional_privatization_audit_contract.standardization_layers.includes('private_platform_residue_inventory'),
    true,
  );
  assert.deepEqual(scaffold.functional_privatization_audit_contract.accepted_source_fields, [
    'functional_privatization_audit',
  ]);
  assert.equal(
    scaffold.functional_privatization_audit_contract.legacy_import_source_fields.includes(
      'functional_consumer_boundary',
    ),
    true,
  );
  assert.equal(
    scaffold.functional_privatization_audit_contract.source_shape_policy.legacy_import_adapter_only,
    true,
  );
  assert.equal(
    scaffold.functional_privatization_audit_contract.source_shape_policy
      .new_agents_must_emit_canonical_functional_privatization_audit,
    true,
  );
  assert.equal(scaffold.retirement_gate.delete_policy, 'delete_or_history_tombstone_only');
  assert.equal(scaffold.retirement_gate.opl_can_execute_domain_repo_delete, false);
  assert.equal(scaffold.retirement_gate.executable_plan_surface, 'family_runtime_lifecycle_apply');
  assert.deepEqual(scaffold.retirement_gate.executable_when, [
    'full_no_active_caller',
    'replacement_parity',
    'provenance_proof',
    'history_or_tombstone',
    'no_retained_legacy_entry',
  ]);
  assert.deepEqual(scaffold.retirement_gate.allowed_opl_apply_scopes, [
    'opl_owned_runtime_ref',
    'opl_owned_index_ref',
    'opl_owned_provenance_ref',
    'opl_owned_tombstone_ref',
  ]);
  assert.deepEqual(scaffold.retirement_gate.forbidden_apply_scopes, [
    'domain_truth',
    'memory_body',
    'artifact_body',
    'source_repo_active_file',
  ]);
  assert.equal(scaffold.authority_boundary.opl_can_write_domain_truth, false);
  assert.equal(scaffold.authority_boundary.opl_can_authorize_domain_quality_or_export, false);
  assert.equal(scaffold.authority_boundary.domain_can_own_generic_scheduler_or_queue, false);
});
