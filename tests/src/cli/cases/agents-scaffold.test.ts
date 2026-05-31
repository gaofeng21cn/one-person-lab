import { assert, fs, os, path, runCli, test } from '../helpers.ts';

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
    scaffold.required_verification.includes('user_stage_log_semantics_or_typed_blocker'),
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
    scaffold.foundry_agent_series_contract.surface_kind,
    'opl_foundry_agent_series_contract',
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
    'functional_privatization_audit_source_ref',
    'generated_surface_handoff_source_ref',
  ]);
  assert.equal(scaffold.domain_retained_thin_surfaces_deprecated.includes('domain_truth'), true);
  assert.equal(
    scaffold.domain_retained_thin_surfaces_deprecated.includes(
      'domain_handler_target_or_opaque_ref_projection_output',
    ),
    true,
  );
  assert.equal(scaffold.domain_retained_thin_surfaces_deprecated.includes('sidecar_or_projection_adapter'), false);
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
  assert.equal(scaffold.required_verification.includes('functional_privatization_audit_no_generic_owner'), true);
  assert.equal(scaffold.required_verification.includes('workspace_file_lifecycle_policy_declared'), true);
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

test('agents scaffold can generate and validate a declarative pack domain-agent skeleton', () => {
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-standard-agent-'));

  try {
    const generated = runCli([
      'agents',
      'scaffold',
      '--target-dir',
      targetDir,
      '--domain-id',
      'award-foundry',
      '--domain-label',
      'Award Foundry',
    ]).standard_domain_agent_scaffold;

    assert.equal(generated.state, 'template_generated');
    assert.equal(generated.mode, 'generate');
    assert.equal(generated.generation_policy.scaffold_command_is_read_only, false);
    assert.equal(generated.generation_policy.creates_files, true);
    assert.equal(generated.write_summary.written_count, generated.template_files.length);
    assert.equal(generated.write_summary.skipped_existing_count, 0);
    assert.equal(
      generated.scaffold_consumption_refs.status,
      'generated_template_pending_validation',
    );
    assert.equal(generated.scaffold_consumption_refs.app_operator_consumable, true);
    assert.equal(
      generated.scaffold_consumption_refs.claim_policy,
      'template_generation_and_validation_evidence_only_no_domain_ready_artifact_authority_or_production_ready_claim',
    );
    assert.equal(
      generated.scaffold_consumption_refs.authority_boundary.scaffold_validation_can_claim_domain_ready,
      false,
    );
    assert.equal(fs.existsSync(path.join(targetDir, 'contracts/domain_descriptor.json')), true);
    assert.equal(fs.existsSync(path.join(targetDir, 'contracts/foundry_agent_series.json')), true);
    assert.equal(fs.existsSync(path.join(targetDir, 'contracts/pack_compiler_input.json')), true);
    assert.equal(fs.existsSync(path.join(targetDir, 'contracts/generated_surface_handoff.json')), true);
    assert.equal(fs.existsSync(path.join(targetDir, 'contracts/functional_privatization_audit.json')), true);
    assert.equal(fs.existsSync(path.join(targetDir, 'contracts/private_functional_surface_policy.json')), true);
    assert.equal(fs.existsSync(path.join(targetDir, 'contracts/workspace_lifecycle_policy.json')), true);
    assert.equal(fs.existsSync(path.join(targetDir, 'agent/stages/README.md')), true);
    assert.equal(fs.existsSync(path.join(targetDir, 'agent/stages/domain_intake.md')), true);
    assert.equal(fs.existsSync(path.join(targetDir, 'agent/prompts/domain_intake.md')), true);
    assert.equal(fs.existsSync(path.join(targetDir, 'agent/skills/domain_execution.md')), true);
    assert.equal(fs.existsSync(path.join(targetDir, 'agent/knowledge/domain_boundary.md')), true);
    assert.equal(fs.existsSync(path.join(targetDir, 'agent/quality_gates/domain_acceptance.md')), true);
    assert.equal(fs.existsSync(path.join(targetDir, 'agent/policies/README.md')), true);
    assert.equal(fs.existsSync(path.join(targetDir, 'runtime/authority_functions/README.md')), true);
    assert.equal(fs.existsSync(path.join(targetDir, 'runtime/native_helpers/README.md')), true);
    assert.equal(fs.existsSync(path.join(targetDir, 'runtime/fixtures/README.md')), true);
    assert.equal(fs.existsSync(path.join(targetDir, 'runtime/sidecar/README.md')), false);

    const descriptor = JSON.parse(
      fs.readFileSync(path.join(targetDir, 'contracts/domain_descriptor.json'), 'utf8'),
    );
    assert.equal(descriptor.domain_id, 'award-foundry');
    assert.equal(
      descriptor.standard_contract_refs.foundry_agent_series,
      'contracts/foundry_agent_series.json',
    );
    assert.equal(
      descriptor.standard_contract_refs.foundry_agent_series_policy_release,
      'contracts/opl-framework/foundry-agent-series-policy-release.json',
    );
    assert.equal(descriptor.authority_boundary.opl_can_write_domain_truth, false);
    const foundryAgentSeries = JSON.parse(
      fs.readFileSync(path.join(targetDir, 'contracts/foundry_agent_series.json'), 'utf8'),
    );
    assert.equal(foundryAgentSeries.surface_kind, 'opl_foundry_agent_series_contract');
    assert.equal(foundryAgentSeries.version, 'foundry-agent-series.v1');
    assert.equal(
      foundryAgentSeries.contract_version_policy.current_version,
      'foundry-agent-series.v1',
    );
    assert.equal(
      foundryAgentSeries.contract_version_policy.exact_version_pin_required,
      true,
    );
    assert.equal(
      foundryAgentSeries.shared_release_pin_strategy.owner_release_contract_ref,
      'contracts/family-release/shared-owner-release.json',
    );
    assert.equal(
      foundryAgentSeries.shared_release_pin_strategy.domain_contract_version_pin_does_not_authorize_domain_truth,
      true,
    );
    assert.equal(
      foundryAgentSeries.shared_policy_release.policy_release_contract_ref,
      'contracts/opl-framework/foundry-agent-series-policy-release.json',
    );
    assert.match(
      foundryAgentSeries.shared_policy_release.policy_bundle_fingerprint,
      /^sha256:[0-9a-f]{64}$/,
    );
    assert.equal(
      foundryAgentSeries.shared_policy_release.domain_adapter_must_not_copy_policy_body_as_authority,
      true,
    );
    assert.equal(foundryAgentSeries.domain_id, 'award-foundry');
    assert.equal(foundryAgentSeries.foundry_agent_id, 'award-foundry');
    assert.equal(foundryAgentSeries.authority_owner, 'award-foundry');
    assert.equal(foundryAgentSeries.stage_control_plane_ref, 'contracts/stage_control_plane.json');
    assert.equal(foundryAgentSeries.domain_adapter_policy.no_parallel_progress_schema, true);
    assert.equal(foundryAgentSeries.domain_adapter_policy.no_parallel_blocker_lineage_schema, true);
    assert.equal(
      foundryAgentSeries.app_projection_policy.app_consumes_shared_progress_projection_only,
      true,
    );
    const packCompilerInput = JSON.parse(
      fs.readFileSync(path.join(targetDir, 'contracts/pack_compiler_input.json'), 'utf8'),
    );
    assert.equal(packCompilerInput.surface_kind, 'opl_domain_pack_compiler_input');
    assert.equal(packCompilerInput.generated_surface_owner, 'one-person-lab');
    assert.equal(packCompilerInput.domain_pack_owner, 'award-foundry');
    assert.equal(packCompilerInput.canonical_semantic_pack_root, 'agent/');
    assert.deepEqual(packCompilerInput.source_refs, {
      stage_graph_source_ref: 'contracts/stage_control_plane.json',
      quality_gate_source_ref: 'agent/quality_gates/domain_acceptance.md',
      executor_policy_source_ref: 'contracts/stage_control_plane.json#/stages/0/selected_executor',
      functional_privatization_audit_source_ref: 'contracts/functional_privatization_audit.json',
      generated_surface_handoff_source_ref: 'contracts/generated_surface_handoff.json',
    });
    assert.deepEqual(packCompilerInput.standard_stage_pack_conformance, {
      version: 'standard-stage-pack.v2',
      required: true,
      enforcement_ref: 'contracts/stage_control_plane.json#stage_pack_conformance_version',
    });
    assert.deepEqual(packCompilerInput.required_domain_pack_paths, [
      'agent/prompts/domain_intake.md',
      'agent/stages/domain_intake.md',
      'agent/skills/domain_execution.md',
      'agent/knowledge/domain_boundary.md',
      'agent/quality_gates/domain_acceptance.md',
    ]);
    const stageControlPlane = JSON.parse(
      fs.readFileSync(path.join(targetDir, 'contracts/stage_control_plane.json'), 'utf8'),
    );
    assert.equal(stageControlPlane.surface_kind, 'family_stage_control_plane');
    assert.equal(stageControlPlane.stage_pack_conformance_version, 'standard-stage-pack.v2');
    assert.equal(stageControlPlane.stages.length, 1);
    assert.equal(stageControlPlane.stages[0].stage_pack_conformance_version, 'standard-stage-pack.v2');
    assert.deepEqual(stageControlPlane.stages[0].selected_executor, {
      executor_kind: 'codex_cli',
      default_executor: true,
      executor_binding_ref: 'default_codex_cli',
      binding_policy: 'default_first_class_executor_for_ai_first_stage_execution',
      required_capabilities: [
        'repo_context_reading',
        'domain_skill_invocation',
        'receipt_or_typed_blocker_return',
        'no_forbidden_write_guard',
      ],
    });
    assert.deepEqual(stageControlPlane.stages[0].prompt_refs, [
      {
        ref_kind: 'repo_path',
        ref: 'agent/prompts/domain_intake.md',
        role: 'stage_prompt',
      },
    ]);
    assert.deepEqual(stageControlPlane.stages[0].skills, [
      {
        ref_kind: 'repo_path',
        ref: 'agent/skills/domain_execution.md',
        role: 'domain_pack_skill_policy',
      },
    ]);
    assert.deepEqual(stageControlPlane.stages[0].knowledge_refs, [
      {
        ref_kind: 'repo_path',
        ref: 'agent/knowledge/domain_boundary.md',
        role: 'domain_pack_knowledge',
      },
    ]);
    assert.deepEqual(stageControlPlane.stages[0].evaluation, [
      {
        ref_kind: 'repo_path',
        ref: 'agent/quality_gates/domain_acceptance.md',
        role: 'agent_quality_gate',
      },
    ]);
    assert.deepEqual(stageControlPlane.stages[0].independent_gate_policy, {
      gate_ref: 'agent/quality_gates/domain_acceptance.md',
      gate_owner: 'award-foundry',
      execution_review_separation_required: true,
      mechanical_completion_can_close_stage: false,
      provider_completion_can_claim_domain_ready: false,
      generated_surface_readiness_can_claim_quality_or_export: false,
    });
    assert.deepEqual(stageControlPlane.stages[0].stage_contract.requires, [
      'user_intent_ref',
      'source_locator_refs',
      'expected_deliverable_class_ref',
      'domain_authority_owner_ref',
    ]);
    assert.deepEqual(stageControlPlane.stages[0].stage_contract.ensures, [
      'domain_intake_receipt_or_typed_blocker_ref',
      'next_stage_recommendation_ref',
      'authority_boundary_ref',
      'no_forbidden_write_evidence_ref',
    ]);
    assert.deepEqual(stageControlPlane.stages[0].stage_contract.expected_receipt_refs, [
      {
        ref_kind: 'domain_ref',
        ref: 'intake_receipt_ref',
        role: 'domain_owner_receipt',
      },
      {
        ref_kind: 'domain_ref',
        ref: 'typed_blocker_ref',
        role: 'route_back_or_blocker',
      },
    ]);
    assert.equal(
      stageControlPlane.stages[0].stage_contract.user_stage_log_contract.surface_kind,
      'opl_standard_agent_user_stage_log_contract',
    );
    assert.equal(
      stageControlPlane.stages[0].stage_contract.user_stage_log_contract
        .required_domain_semantic_fields.includes('problem_summary'),
      true,
    );
    assert.equal(
      stageControlPlane.stages[0].stage_contract.user_stage_log_contract
        .required_domain_semantic_fields.includes('stage_work_done'),
      true,
    );
    assert.equal(
      stageControlPlane.stages[0].stage_contract.user_stage_log_contract
        .required_domain_semantic_fields.includes('changed_stage_surfaces'),
      true,
    );
    assert.equal(
      stageControlPlane.stages[0].stage_contract.progress_delta_policy.platform_only_is_not_deliverable_progress,
      true,
    );
    assert.deepEqual(
      stageControlPlane.stages[0].stage_contract.progress_delta_policy.required_fields,
      [
        'progress_delta_classification',
        'deliverable_progress_delta',
        'platform_repair_delta',
        'next_forced_delta',
      ],
    );
    assert.equal(
      stageControlPlane.stages[0].stage_contract.typed_blocker_lineage_policy.surface_kind,
      'family-stall-lineage.v1',
    );
    const generatedSurfaceHandoff = JSON.parse(
      fs.readFileSync(path.join(targetDir, 'contracts/generated_surface_handoff.json'), 'utf8'),
    );
    assert.equal(generatedSurfaceHandoff.surface_kind, 'opl_generated_surface_handoff');
    assert.equal(generatedSurfaceHandoff.generated_surface_owner, 'one-person-lab');
    assert.equal(generatedSurfaceHandoff.domain_repo_can_own_generated_surface, false);
    const functionalAudit = JSON.parse(
      fs.readFileSync(path.join(targetDir, 'contracts/functional_privatization_audit.json'), 'utf8'),
    );
    assert.equal(functionalAudit.surface_kind, 'functional_privatization_audit');
    assert.equal(
      functionalAudit.private_functional_surface_admission_policy.default_posture,
      'forbidden_until_classified_and_receipted',
    );
    assert.deepEqual(functionalAudit.classification_policy.accepted_migration_classes, [
      'opl_hosted_surface',
      'opl_generated_surface',
      'declarative_pack',
      'minimal_authority_function',
      'refs_only_domain_adapter',
      'domain_handler_target',
      'native_helper_implementation',
      'temporary_migration_bridge',
      'diagnostic_cleanup_path',
      'provenance_or_fixture',
    ]);
    assert.equal(functionalAudit.authority_boundary.domain_can_claim_generic_runtime_owner, false);
    const privateSurfacePolicy = JSON.parse(
      fs.readFileSync(path.join(targetDir, 'contracts/private_functional_surface_policy.json'), 'utf8'),
    );
    assert.equal(privateSurfacePolicy.surface_kind, 'opl_domain_private_functional_surface_admission_policy');
    assert.equal(privateSurfacePolicy.domain_id, 'award-foundry');
    assert.equal(
      privateSurfacePolicy.forbidden_private_surface_classes.includes('generic_cli_mcp_product_wrapper'),
      true,
    );
    const workspaceLifecyclePolicy = JSON.parse(
      fs.readFileSync(path.join(targetDir, 'contracts/workspace_lifecycle_policy.json'), 'utf8'),
    );
    assert.equal(
      workspaceLifecyclePolicy.repo_source_boundaries.runtime_artifacts_live_in_source_repo,
      false,
    );
    assert.equal(
      workspaceLifecyclePolicy.authority_boundary.policy_can_claim_domain_ready_or_artifact_authority,
      false,
    );

    const validated = runCli(['agents', 'scaffold', '--validate', targetDir]).standard_domain_agent_scaffold;
    assert.equal(validated.mode, 'validate');
    assert.equal(validated.state, 'validated');
    assert.equal(validated.validation.status, 'passed');
    assert.equal(validated.validation.functional_privatization_audit_required, true);
    assert.equal(validated.validation.agent_pack_validation.semantic_listed_path_count, 5);
    assert.deepEqual(
      validated.validation.agent_pack_validation.section_status.map((
        item: { section: string; status: string },
      ) => [item.section, item.status]),
      [
        ['prompts', 'ok'],
        ['stages', 'ok'],
        ['skills', 'ok'],
        ['quality_gates', 'ok'],
        ['knowledge', 'ok'],
      ],
    );
    assert.equal(validated.validation.stage_ref_validation.stage_count, 1);
    assert.equal(validated.validation.user_stage_log_validation.status, 'passed');
    assert.equal(validated.validation.user_stage_log_validation.required_for_standard_agent, true);
    assert.deepEqual(validated.validation.user_stage_log_validation.blockers, []);
    assert.equal(validated.validation.foundry_agent_series_validation.status, 'passed');
    assert.equal(validated.validation.foundry_agent_series_validation.required_for_standard_agent, true);
    assert.equal(
      validated.validation.foundry_agent_series_validation.contract_version_policy.current_version,
      'foundry-agent-series.v1',
    );
    assert.equal(
      validated.validation.foundry_agent_series_validation.shared_release_pin_strategy.consumer_alignment_check,
      'family:shared-release',
    );
    assert.equal(
      validated.validation.foundry_agent_series_validation.shared_policy_release.consumer_alignment_check,
      'foundry:policy-release',
    );
    assert.deepEqual(validated.validation.foundry_agent_series_validation.blockers, []);
    assert.equal(validated.validation.stage_pack_v2_validation.status, 'passed');
    assert.equal(validated.validation.stage_pack_v2_validation.required_for_repo, true);
    assert.equal(
      validated.validation.stage_pack_v2_validation.stage_statuses[0].selected_executor_kind,
      'codex_cli',
    );
    assert.equal(
      validated.validation.stage_pack_v2_validation.stage_statuses[0].executor_binding_ref,
      'default_codex_cli',
    );
    assert.deepEqual(validated.validation.stage_pack_v2_validation.blockers, []);
    assert.deepEqual(validated.validation.blockers, []);
  } finally {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
});

test('agents scaffold consumption evidence generates and validates an ephemeral new agent skeleton', () => {
  const evidence = runCli([
    'agents',
    'scaffold',
    '--consumption-evidence',
    '--domain-id',
    'award-foundry',
  ]).standard_domain_agent_template_consumption_evidence;

  assert.equal(evidence.surface_kind, 'opl_standard_agent_template_consumption_evidence');
  assert.equal(evidence.owner, 'one-person-lab');
  assert.equal(evidence.status, 'passed');
  assert.equal(evidence.proof_kind, 'ephemeral_generate_then_validate_new_agent_skeleton');
  assert.match(
    evidence.evidence_ref,
    /^opl:\/\/standard-agent-template-consumption\/award-foundry\/[a-f0-9]{16}$/,
  );
  assert.match(evidence.evidence_fingerprint, /^sha256:[a-f0-9]{64}$/);
  assert.equal(
    evidence.evidence_ref_policy,
    'deterministic_shape_ref_for_replayable_template_consumption_evidence_not_a_ledger_receipt',
  );
  assert.equal(evidence.generated_repo_dir_policy, 'ephemeral_removed_after_validation');
  assert.equal(fs.existsSync(evidence.generated_repo_dir_ref), false);
  assert.equal(evidence.generation_summary.generated_written_file_count > 0, true);
  assert.equal(
    evidence.generation_summary.generated_written_file_count,
    evidence.generation_summary.generated_template_file_count,
  );
  assert.equal(evidence.validation_summary.validation_status, 'passed');
  assert.equal(evidence.validation_summary.blocker_count, 0);
  assert.equal(evidence.validation_summary.consumed_pack_path_count, 5);
  assert.equal(evidence.validation_summary.consumed_stage_count, 1);
  assert.equal(evidence.validation_summary.selected_executor_binding_observed_count, 1);
  assert.equal(evidence.validation_summary.default_codex_executor_binding_count, 1);
  assert.equal(evidence.validation_summary.quality_gate_ref_resolved_stage_count, 1);
  assert.equal(evidence.validation_summary.generated_surface_owner_verified, true);
  assert.equal(evidence.validation_summary.private_surface_policy_guarded, true);
  assert.equal(evidence.validation_summary.stage_pack_v2_status, 'passed');
  assert.equal(
    evidence.surface_consumption_proof.consumed_surface_status,
    'scaffold_conformance_readiness_and_app_operator_surfaces_consumed',
  );
  assert.equal(evidence.surface_consumption_proof.conformance_status, 'passed');
  assert.equal(evidence.surface_consumption_proof.conformance_passed_count, 1);
  assert.equal(evidence.surface_consumption_proof.conformance_blocked_count, 0);
  assert.equal(evidence.surface_consumption_proof.readiness_structural_conformance_status, 'passed');
  assert.equal(evidence.surface_consumption_proof.readiness_scaffold_gate_status, 'passed');
  assert.equal(
    evidence.surface_consumption_proof.app_operator_refs.status,
    'app_operator_projection_consumable',
  );
  assert.equal(evidence.scaffold_consumption_refs.status, 'validated_template_consumed');
  assert.equal(evidence.scaffold_consumption_refs.validation_consumed_generated_repo, true);
  assert.equal(evidence.scaffold_consumption_refs.default_codex_executor_binding_count, 1);
  assert.equal(evidence.scaffold_consumption_refs.app_operator_consumable, true);
  assert.equal(
    evidence.scaffold_consumption_refs.authority_boundary.scaffold_validation_can_claim_production_ready,
    false,
  );
  assert.deepEqual(evidence.non_goals, [
    'does_not_claim_domain_ready',
    'does_not_claim_artifact_authority',
    'does_not_claim_production_ready',
    'does_not_authorize_quality_or_export',
  ]);
  assert.equal(evidence.consumption_cohort.sample_count, 1);
  assert.equal(evidence.consumption_cohort.explicit_sample_requested, true);
  assert.deepEqual(evidence.sample_domain_ids, ['award-foundry']);
});

test('agents scaffold consumption evidence repeats generate and validate across default new-agent samples', () => {
  const evidence = runCli([
    'agents',
    'scaffold',
    '--consumption-evidence',
  ]).standard_domain_agent_template_consumption_evidence;

  assert.equal(evidence.surface_kind, 'opl_standard_agent_template_consumption_evidence');
  assert.equal(evidence.owner, 'one-person-lab');
  assert.equal(evidence.status, 'passed');
  assert.equal(evidence.proof_kind, 'repeat_ephemeral_generate_then_validate_new_agent_skeletons');
  assert.match(
    evidence.cohort_evidence_ref,
    /^opl:\/\/standard-agent-template-consumption\/cohort\/[a-f0-9]{16}$/,
  );
  assert.match(evidence.cohort_evidence_fingerprint, /^sha256:[a-f0-9]{64}$/);
  assert.equal(
    evidence.evidence_receipt_candidate_policy,
    'candidate_refs_are_body_free_replayable_shape_ids_not_recorded_ledger_receipts_and_do_not_claim_domain_ready_or_production_ready',
  );
  assert.deepEqual(evidence.sample_domain_ids, [
    'award-foundry',
    'thesis-foundry',
    'review-foundry',
  ]);
  assert.equal(
    evidence.read_model_contract_ref,
    '/runtime_tray_snapshot/app_operator_drilldown/standard_agent_template_consumption_refs/evidence_contract',
  );
  assert.equal(evidence.consumption_cohort.sample_count, 3);
  assert.equal(evidence.consumption_cohort.passed_sample_count, 3);
  assert.equal(evidence.consumption_cohort.blocked_sample_count, 0);
  assert.equal(evidence.consumption_cohort.all_samples_passed, true);
  assert.equal(evidence.consumption_cohort.explicit_sample_requested, false);
  const sampleEvidenceRefs = evidence.consumption_cohort.samples.map((
    sample: { evidence_ref: string },
  ) => sample.evidence_ref);
  assert.deepEqual(
    sampleEvidenceRefs.map((ref: string) =>
      /^opl:\/\/standard-agent-template-consumption\/[a-z-]+\/[a-f0-9]{16}$/.test(ref)
    ),
    [true, true, true],
  );
  assert.equal(new Set(sampleEvidenceRefs).size, 3);
  assert.deepEqual(
    evidence.consumption_cohort.samples.map((sample: { evidence_fingerprint: string }) =>
      /^sha256:[a-f0-9]{64}$/.test(sample.evidence_fingerprint)
    ),
    [true, true, true],
  );
  assert.deepEqual(
    evidence.consumption_cohort.samples.map((sample: { generated_repo_dir_policy: string }) =>
      sample.generated_repo_dir_policy
    ),
    [
      'ephemeral_removed_after_validation',
      'ephemeral_removed_after_validation',
      'ephemeral_removed_after_validation',
    ],
  );
  assert.deepEqual(
    evidence.consumption_cohort.samples.map((sample: { validation_summary: { validation_status: string } }) =>
      sample.validation_summary.validation_status
    ),
    ['passed', 'passed', 'passed'],
  );
  assert.deepEqual(
    evidence.consumption_cohort.samples.map((sample: { validation_summary: { default_codex_executor_binding_count: number } }) =>
      sample.validation_summary.default_codex_executor_binding_count
    ),
    [1, 1, 1],
  );
  assert.equal(evidence.consumption_cohort.consumed_surface_count_per_sample, 4);
  assert.deepEqual(evidence.consumption_cohort.consumed_surfaces, [
    'scaffold_validation',
    'standard_agent_conformance',
    'agent_readiness',
    'app_operator_projection',
  ]);
  assert.deepEqual(
    evidence.consumption_cohort.samples.map((
      sample: {
        surface_consumption_proof: {
          conformance_status: string;
          readiness_structural_conformance_status: string;
          app_operator_refs: { status: string };
        };
      },
    ) => [
      sample.surface_consumption_proof.conformance_status,
      sample.surface_consumption_proof.readiness_structural_conformance_status,
      sample.surface_consumption_proof.app_operator_refs.status,
    ]),
    [
      ['passed', 'passed', 'app_operator_projection_consumable'],
      ['passed', 'passed', 'app_operator_projection_consumable'],
      ['passed', 'passed', 'app_operator_projection_consumable'],
    ],
  );
  assert.equal(
    evidence.repeat_consumption_policy,
    'default_command_runs_a_small_multi_domain_ephemeral_cohort_through_scaffold_conformance_readiness_and_app_operator_projection_without_claiming_domain_ready_or_production_ready',
  );
});

test('agents scaffold validation blocks empty or unreferenced agent directories', () => {
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-empty-agent-'));

  try {
    runCli([
      'agents',
      'scaffold',
      '--target-dir',
      targetDir,
      '--domain-id',
      'empty-agent',
    ]);
    fs.rmSync(path.join(targetDir, 'agent/prompts/domain_intake.md'));

    const validated = runCli(['agents', 'scaffold', '--validate', targetDir]).standard_domain_agent_scaffold;
    assert.equal(validated.mode, 'validate');
    assert.equal(validated.state, 'validation_blocked');
    assert.equal(validated.validation.status, 'blocked');
    assert.equal(
      validated.validation.blockers.includes(
        'invalid_domain_pack_path:agent/prompts/domain_intake.md:missing',
      ),
      true,
    );
    assert.equal(
      validated.validation.blockers.includes('missing_agent_pack_section:prompts'),
      true,
    );
    assert.equal(
      validated.validation.blockers.some((blocker: string) =>
        blocker.startsWith('stage_invalid_agent_ref:domain_intake:agent/prompts/domain_intake.md:missing')
      ),
      true,
    );
  } finally {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
});

test('agents scaffold validation blocks legacy pack roots and README-only required paths', () => {
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-legacy-pack-root-'));

  try {
    runCli([
      'agents',
      'scaffold',
      '--target-dir',
      targetDir,
      '--domain-id',
      'legacy-pack-root',
    ]);
    const packCompilerPath = path.join(targetDir, 'contracts/pack_compiler_input.json');
    const packCompilerInput = JSON.parse(fs.readFileSync(packCompilerPath, 'utf8'));
    delete packCompilerInput.canonical_semantic_pack_root;
    packCompilerInput.domain_pack_root = 'agent';
    packCompilerInput.required_domain_pack_paths = [
      'agent/prompts/domain_intake.md',
      'agent/README.md',
    ];
    fs.writeFileSync(packCompilerPath, `${JSON.stringify(packCompilerInput, null, 2)}\n`);

    const validated = runCli(['agents', 'scaffold', '--validate', targetDir]).standard_domain_agent_scaffold;
    assert.equal(validated.mode, 'validate');
    assert.equal(validated.state, 'validation_blocked');
    assert.equal(validated.validation.status, 'blocked');
    assert.equal(
      validated.validation.blockers.includes('pack_compiler_canonical_semantic_pack_root_must_be_agent_slash'),
      true,
    );
    assert.equal(
      validated.validation.blockers.includes('pack_compiler_legacy_pack_root_field:domain_pack_root'),
      true,
    );
    assert.equal(
      validated.validation.blockers.includes('required_domain_pack_path_must_not_be_readme:agent/README.md'),
      true,
    );
  } finally {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
});
