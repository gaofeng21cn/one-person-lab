import { validateJsonSchemaPayload } from '../../../../src/kernel/schema-registry.ts';
import { assert, fs, os, path, repoRoot, runCli, test } from '../helpers.ts';

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
    assert.equal(fs.existsSync(path.join(targetDir, 'contracts/standard-agent-principles-adoption.json')), true);
    assert.equal(fs.existsSync(path.join(targetDir, 'contracts/capability_map.json')), true);
    assert.equal(fs.existsSync(path.join(targetDir, 'contracts/functional_privatization_audit.json')), true);
    assert.equal(fs.existsSync(path.join(targetDir, 'contracts/private_functional_surface_policy.json')), true);
    assert.equal(fs.existsSync(path.join(targetDir, 'contracts/workspace_lifecycle_policy.json')), true);
    assert.equal(fs.existsSync(path.join(targetDir, 'contracts/state_index_kernel_adoption.json')), true);
    assert.equal(fs.existsSync(path.join(targetDir, 'agent/principles/README.md')), true);
    assert.equal(fs.existsSync(path.join(targetDir, 'agent/principles/opl-standard-agent-principles.md')), true);
    assert.equal(fs.existsSync(path.join(targetDir, 'agent/principles/domain-specialization.md')), true);
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
    assert.equal(
      descriptor.standard_contract_refs.standard_agent_principles,
      'contracts/opl-framework/standard-agent-principles.json',
    );
    assert.equal(
      descriptor.standard_contract_refs.standard_agent_principles_adoption,
      'contracts/standard-agent-principles-adoption.json',
    );
    assert.equal(descriptor.standard_contract_refs.capability_map, 'contracts/capability_map.json');
    assert.equal(descriptor.authority_boundary.opl_can_write_domain_truth, false);
    const foundryAgentSeries = JSON.parse(
      fs.readFileSync(path.join(targetDir, 'contracts/foundry_agent_series.json'), 'utf8'),
    );
    assert.equal(foundryAgentSeries.surface_kind, 'opl_foundry_agent_series_contract');
    assert.equal(foundryAgentSeries.version, 'foundry-agent-series.v1');
    assert.equal(
      foundryAgentSeries.framework_brand_taxonomy_policy.agent_cli_public_command_surface_role,
      'foundry_agent_series_spine',
    );
    assert.deepEqual(foundryAgentSeries.framework_brand_taxonomy_policy.top_level_modules, [
      'charter',
      'atlas',
      'workspace',
      'stagecraft',
      'runway',
      'ledger',
      'console',
      'foundry-lab',
      'connect',
    ]);
    assert.equal(
      foundryAgentSeries.framework_brand_taxonomy_policy.agent_cli_must_not_replicate_top_level_modules_as_series_spine,
      true,
    );
    assert.equal(
      foundryAgentSeries.agent_cli_command_surface_policy.policy_id,
      'foundry_agent_series_spine_public_command_surface',
    );
    assert.deepEqual(foundryAgentSeries.agent_cli_command_surface_policy.ordinary_public_command_surface_spine, [
      'workspace',
      'work',
      'stage',
      'run',
      'ledger',
      'handoff',
      'connect',
    ]);
    assert.deepEqual(foundryAgentSeries.agent_cli_command_surface_policy.required_public_surface_derivatives, [
      'cli',
      'skill',
      'mcp',
      'app_action',
    ]);
    assert.equal(
      foundryAgentSeries.non_standard_implementation_bucket_policy.ordinary_public_command_surface_allowed,
      false,
    );
    assert.ok(
      foundryAgentSeries.non_standard_implementation_bucket_policy.non_standard_bucket_prefixes.includes('skill'),
    );
    assert.equal(
      foundryAgentSeries.skill_mcp_surface_policy.skill_pack_must_delegate_to_series_spine,
      true,
    );
    assert.equal(
      foundryAgentSeries.skill_mcp_surface_policy.mcp_descriptor_must_delegate_to_series_spine,
      true,
    );
    assert.equal(
      foundryAgentSeries.skill_mcp_surface_policy.canonical_skill_sync_command_surface,
      'opl connect sync-skills',
    );
    assert.equal(
      foundryAgentSeries.skill_mcp_surface_policy.standard_agent_standalone_mcp_default_enabled,
      false,
    );
    assert.equal(
      foundryAgentSeries.skill_mcp_surface_policy.standard_agent_plugin_manifest_must_not_expose_mcp_servers,
      true,
    );
    assert.equal(
      foundryAgentSeries.skill_mcp_surface_policy.cli_mcp_relationship_policy.all_cli_commands_are_mcp_tools,
      false,
    );
    assert.equal(
      foundryAgentSeries.skill_mcp_surface_policy.mcp_context_budget_policy.progressive_discovery_required_for_large_catalogs,
      true,
    );
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
    assert.equal(foundryAgentSeries.workspace_topology_profile.default_profiles.one_off.workspace_mode, 'one_off');
    assert.equal(foundryAgentSeries.workspace_topology_profile.default_profiles.one_off.series_capable_skeleton, true);
    assert.equal(
      foundryAgentSeries.workspace_topology_profile.default_profiles.one_off.project_collection_path,
      'projects',
    );
    assert.equal(foundryAgentSeries.workspace_topology_profile.default_project_stage_outputs_root, 'artifacts/stage_outputs');
    assert.equal(foundryAgentSeries.workspace_topology_profile.default_profiles.mas_portfolio.workspace_mode, 'portfolio');
    assert.equal(foundryAgentSeries.workspace_topology_profile.default_profiles.mas_portfolio.project_collection_path, 'projects');
    assert.equal(foundryAgentSeries.workspace_topology_profile.default_profiles.rca_series.workspace_mode, 'series');
    assert.equal(
      foundryAgentSeries.workspace_topology_profile.default_profiles.rca_series.project_collection_path,
      'projects',
    );
    assert.deepEqual(
      foundryAgentSeries.workspace_topology_profile.workspace_initialization_policy.legacy_project_collection_aliases,
      ['deliverables', 'studies'],
    );
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
      owner_receipt_schema_source_ref: 'contracts/owner_receipt_contract.json',
      authority_functions_source_ref: 'runtime/authority_functions/README.md',
          functional_privatization_audit_source_ref: 'contracts/functional_privatization_audit.json',
          generated_surface_handoff_source_ref: 'contracts/generated_surface_handoff.json',
          capability_map_source_ref: 'contracts/capability_map.json',
          standard_agent_principles_source_ref: 'contracts/opl-framework/standard-agent-principles.json',
          standard_agent_principles_adoption_source_ref:
            'contracts/standard-agent-principles-adoption.json',
        });
    assert.equal(packCompilerInput.capability_map_ref, 'contracts/capability_map.json');
    assert.deepEqual(packCompilerInput.standard_stage_pack_conformance, {
      version: 'standard-stage-pack.v2',
      required: true,
      enforcement_ref: 'contracts/stage_control_plane.json#stage_pack_conformance_version',
    });
    assert.equal(packCompilerInput.standard_agent_pack_abi.version, 'standard-agent-pack-abi.v1');
    assert.deepEqual(
      packCompilerInput.standard_agent_pack_abi.required_repo_layout.map((entry: { path: string }) => entry.path),
      ['agent/', 'contracts/', 'runtime/authority_functions/'],
    );
    assert.deepEqual(packCompilerInput.required_domain_pack_paths, [
      'agent/principles/opl-standard-agent-principles.md',
      'agent/principles/domain-specialization.md',
      'agent/prompts/domain_intake.md',
      'agent/stages/domain_intake.md',
      'agent/skills/domain_execution.md',
      'agent/tools/domain_affordances.md',
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
    assert.deepEqual(stageControlPlane.stages[0].capability_map_refs, [
      {
        ref_kind: 'repo_path',
        ref: 'contracts/capability_map.json',
        role: 'stage_capability_resolver_index',
      },
    ]);
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
      'stage-completion-policy-ref:award-foundry/domain_intake',
    ]);
    assert.deepEqual(stageControlPlane.stages[0].stage_contract.ensures, [
      'domain_intake_receipt_or_typed_blocker_ref',
      'next_stage_recommendation_ref',
      'authority_boundary_ref',
      'no_forbidden_write_evidence_ref',
      'stage-closeout-packet-ref:award-foundry/domain_intake/{stage_attempt_id}',
    ]);
    assert.deepEqual(stageControlPlane.stages[0].stage_contract.expected_receipt_refs, [
      {
        ref_kind: 'domain_ref',
        ref: 'intake_receipt_ref',
        role: 'domain_owner_receipt',
      },
      {
        ref_kind: 'stage_closeout_packet_ref',
        ref: 'stage-closeout-packet-ref:award-foundry/domain_intake/{stage_attempt_id}',
        role: 'domain_stage_completion_closeout',
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
      stageControlPlane.stages[0].stage_contract.user_stage_log_contract.incomplete_semantics_policy,
      'emit_missing_domain_fields_without_opl_domain_inference',
    );
    assert.equal(
      stageControlPlane.stages[0].stage_contract.user_stage_log_contract.accounting_policy,
      'OPL projects duration/token/cost status, source refs, and explicit missing reasons; duration may use provider or attempt wall-clock fallback for user readability while duration_telemetry_status stays missing until usage telemetry exists',
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
    const capabilityMap = JSON.parse( // reuse-first: allow generated fixture parser
      fs.readFileSync(path.join(targetDir, 'contracts/capability_map.json'), 'utf8'),
    );
    const capabilityMapSchema = JSON.parse( // reuse-first: allow framework schema fixture parser
      fs.readFileSync(
        path.join(repoRoot, 'contracts/opl-framework/standard-agent-capability-map.schema.json'),
        'utf8',
      ),
    );
    const capabilityMapValidation = validateJsonSchemaPayload(
      {
        schemaId: 'opl.standard_agent_capability_map.v1',
        schema: capabilityMapSchema,
        sourceRef: 'contracts/opl-framework/standard-agent-capability-map.schema.json',
      },
      capabilityMap,
    );
    assert.equal(capabilityMapValidation.ok, true);
    assert.deepEqual(
      capabilityMap.capabilities.map((entry: { surface_role: string }) => entry.surface_role),
      [
        'stage_prompt',
        'professional_skill',
        'tool_connector',
        'knowledge_pack',
        'quality_gate',
        'eval_suite',
      ],
    );
    assert.equal(capabilityMap.resolver_policy, 'resolver_index_only_no_domain_truth');
    assert.equal(capabilityMap.capability_pack.pack_root_ref, 'agent/');
    assert.equal(capabilityMap.authority_boundary.map_is_resolver_index_only, true);
    assert.equal(capabilityMap.authority_boundary.can_write_domain_truth, false);
    assert.equal(capabilityMap.authority_boundary.can_sign_owner_receipt, false);
    assert.equal(capabilityMap.authority_boundary.can_create_typed_blocker, false);
    for (const capability of capabilityMap.capabilities) {
      assert.equal(capability.improvement_tokens.length > 0, true);
      assert.equal(capability.canonical_target_paths.length > 0, true);
      assert.equal(capability.verification_refs.length > 0, true);
      assert.equal(capability.forbidden_surfaces.length > 0, true);
      assert.equal(capability.owner_closeout_boundary.owner, 'award-foundry');
      assert.deepEqual(capability.owner_closeout_boundary.required_return_shapes, [
        'owner_receipt_ref',
        'typed_blocker_ref',
        'human_gate_ref',
        'route_back_ref',
      ]);
      assert.equal(capability.owner_closeout_boundary.can_write_owner_receipt_body, false);
      assert.equal(capability.owner_closeout_boundary.can_create_typed_blocker, false);
    }
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
      'opl_storage_substrate_mas_refs_projection',
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
    const stageOperatingPrinciples = JSON.parse(
      fs.readFileSync(path.join(targetDir, 'contracts/stage_operating_principles.json'), 'utf8'),
    );
    assert.equal(stageOperatingPrinciples.surface_kind, 'opl_standard_agent_stage_operating_principles');
    assert.equal(stageOperatingPrinciples.domain_id, 'award-foundry');
    assert.equal(stageOperatingPrinciples.management_boundary.stage_unit, 'coarse_grained_stage_attempt');
    assert.equal(stageOperatingPrinciples.default_read_surface.root, 'current_owner_delta');
    assert.equal(stageOperatingPrinciples.default_read_surface.raw_worklist_default, false);
    assert.equal(stageOperatingPrinciples.default_read_surface.readiness_default, false);
    const principleAdoption = JSON.parse(
      fs.readFileSync(path.join(targetDir, 'contracts/standard-agent-principles-adoption.json'), 'utf8'),
    );
    assert.equal(principleAdoption.surface_kind, 'opl_standard_agent_principles_adoption');
    assert.equal(principleAdoption.adopted_principle_pack_ref, 'contracts/opl-framework/standard-agent-principles.json');
    assert.equal(principleAdoption.domain_mapping.domain_intake.is_standalone_skill, false);
    assert.equal(principleAdoption.module_organization.domain_pack_root, 'agent/');
    assert.equal(principleAdoption.module_organization.capability_pack_is_not_domain_intake, true);
    assert.equal(principleAdoption.authority_boundary.adoption_can_claim_domain_ready, false);

    const validated = runCli(['agents', 'scaffold', '--validate', targetDir]).standard_domain_agent_scaffold;
    assert.equal(validated.mode, 'validate');
    assert.equal(validated.state, 'validated');
    assert.equal(validated.validation.status, 'passed');
    assert.equal(validated.validation.functional_privatization_audit_required, true);
    assert.equal(validated.validation.agent_pack_validation.semantic_listed_path_count, 8);
    assert.deepEqual(
      validated.validation.agent_pack_validation.section_status.map((
        item: { section: string; status: string },
      ) => [item.section, item.status]),
      [
        ['principles', 'ok'],
        ['prompts', 'ok'],
        ['stages', 'ok'],
        ['skills', 'ok'],
        ['tools', 'ok'],
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
      validated.validation.foundry_agent_series_validation.series_design_profile.profile_id,
      'opl_foundry_agent_series_design_profile.v1',
    );
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
    assert.equal(
      validated.validation.foundry_agent_series_validation.workspace_topology_profile.default_project_stage_outputs_root,
      'artifacts/stage_outputs',
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
    assert.equal(validated.validation.stage_pack_v2_validation.standard_agent_pack_abi.status, 'passed');
    assert.equal(
      validated.validation.stage_pack_v2_validation.stage_statuses[0].l4_entry_gate_status,
      'declared',
    );
    assert.equal(
      validated.validation.stage_pack_v2_validation.stage_statuses[0].l5_entry_gate_status,
      'declared',
    );
    assert.deepEqual(validated.validation.stage_pack_v2_validation.blockers, []);
    assert.equal(
      validated.validation.required_contract_files.includes('contracts/stage_operating_principles.json'),
      true,
    );
    assert.equal(
      validated.validation.required_contract_files.includes('contracts/standard-agent-principles-adoption.json'),
      true,
    );
    assert.equal(
      validated.validation.required_contract_files.includes('contracts/capability_map.json'),
      true,
    );
    assert.equal(validated.validation.capability_map_validation.status, 'passed');
    assert.deepEqual(validated.validation.capability_map_validation.missing_roles, []);
    assert.equal(validated.validation.capability_map_validation
      .self_evolution_routing_validation.status, 'passed');
    assert.equal(validated.validation.capability_map_validation
      .self_evolution_routing_validation.self_evolution_ready_capability_count, 6);
    assert.deepEqual(validated.validation.blockers, []);
  } finally {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
});
