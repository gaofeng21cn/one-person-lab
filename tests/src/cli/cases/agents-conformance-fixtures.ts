import { fs, os, path, runCli } from '../helpers.ts';

const FORBIDDEN_GENERIC_OWNER_ROLES = [
  'generic_scheduler_owner',
  'generic_daemon_owner',
  'generic_lifecycle_owner',
  'generic_queue_owner',
  'generic_attempt_ledger_owner',
  'generic_state_machine_runner_owner',
  'generic_workspace_source_intake_owner',
  'generic_memory_transport_owner',
  'generic_artifact_gallery_owner',
  'generic_operator_workbench_owner',
  'generic_observability_slo_owner',
  'generic_persistence_engine_owner',
  'generic_sqlite_lifecycle_owner',
  'generic_native_helper_envelope_owner',
  'generic_review_repair_transport_owner',
  'generic_cli_mcp_product_wrapper_owner',
  'generic_sidecar_owner',
  'generic_session_store_owner',
  'generic_status_workbench_owner',
  'generated_surface_owner_in_domain_repo',
];

export function writeJson(filePath: string, payload: unknown) {
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

export function buildReadyAgentRepo() {
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-conformance-'));
  runCli([
    'agents',
    'scaffold',
    '--target-dir',
    targetDir,
    '--domain-id',
    'sample-brief-agent',
    '--domain-label',
    'Sample Brief Agent',
  ]);

  writeJson(path.join(targetDir, 'contracts', 'action_catalog.json'), {
    surface_kind: 'family_action_catalog',
    version: 'family-action-catalog.v1',
    catalog_id: 'sample_brief_agent_action_catalog',
    target_domain_id: 'sample-brief-agent',
    owner: 'SampleBriefAgent',
    domain_id: 'sample-brief-agent',
    forbidden_generic_owner_roles: FORBIDDEN_GENERIC_OWNER_ROLES,
    authority_boundary: {
      domain_truth_owner: 'SampleBriefAgent',
      opl_role: 'generated_interface_projection_only',
    },
    actions: [
      {
        action_id: 'draft_brief',
        title: 'Draft brief',
        summary: 'Draft a source-grounded brief.',
        owner: 'SampleBriefAgent',
        effect: 'mutating',
        source_command: {
          command: 'sample-brief-agent draft --workspace-root <workspace_root>',
          surface_kind: 'domain_cli',
        },
        input_schema_ref: 'contracts/draft-brief.input.schema.json',
        output_schema_ref: 'contracts/draft-brief.output.schema.json',
        workspace_locator_fields: ['workspace_root'],
        human_gate_ids: ['brief_owner_review'],
        supported_surfaces: {
          cli: {
            command: 'sample-brief-agent draft --workspace-root <workspace_root>',
            surface_kind: 'domain_cli',
          },
          mcp: {
            tool_name: 'sample_brief_agent_draft_brief',
            surface_kind: 'domain_mcp_descriptor',
            descriptor_only: true,
            public_runtime: false,
          },
          skill: {
            command_contract_id: 'sample_brief_agent.draft_brief',
            surface_kind: 'domain_skill_contract',
          },
          product_entry: {
            action_key: 'draft_brief',
            command: 'sample-brief-agent product draft --workspace-root <workspace_root>',
            surface_kind: 'domain_product_entry',
          },
          openai: { tool_name: 'sample_brief_agent_draft_brief' },
          ai_sdk: { tool_name: 'sample_brief_agent_draft_brief' },
        },
        authority_boundary: {
          opl_can_write_domain_truth: false,
        },
      },
    ],
    notes: [],
  });

  writeJson(path.join(targetDir, 'contracts', 'generated_surface_handoff.json'), {
    surface_kind: 'opl_generated_surface_handoff',
    schema_version: 1,
    domain_id: 'sample-brief-agent',
    generated_surface_owner: 'one-person-lab',
    domain_repo_can_own_generated_surface: false,
    generated_surfaces: [
      { surface_id: 'cli', owner: 'one-person-lab', status: 'descriptor_source_available' },
      { surface_id: 'mcp', owner: 'one-person-lab', status: 'descriptor_source_available' },
      { surface_id: 'skill', owner: 'one-person-lab', status: 'descriptor_source_available' },
      { surface_id: 'product_entry_manifest', owner: 'one-person-lab', status: 'descriptor_source_available' },
      { surface_id: 'domain_handler', owner: 'one-person-lab', status: 'descriptor_source_available' },
      { surface_id: 'status_read_model', owner: 'one-person-lab', status: 'descriptor_source_available' },
      { surface_id: 'workbench_drilldown', owner: 'one-person-lab', status: 'descriptor_source_available' },
      { surface_id: 'functional_harness_cases', owner: 'one-person-lab', status: 'descriptor_source_available' },
    ],
    handoff_surfaces: [
      {
        surface_id: 'cli',
        current_paths: ['agent/cli.ts'],
        current_role: 'domain_handler_target',
        target_role: 'opl_generated_command_surface',
      },
      {
        surface_id: 'mcp',
        current_paths: ['agent/mcp.ts'],
        current_role: 'domain_handler_target',
        target_role: 'opl_generated_mcp_descriptor_surface',
      },
      {
        surface_id: 'skill',
        current_paths: ['agent/skills/domain_execution.md'],
        current_role: 'domain_handler_target',
        target_role: 'opl_generated_skill_descriptor_surface',
      },
      {
        surface_id: 'product_entry_manifest',
        current_paths: ['agent/product-entry.ts'],
        current_role: 'domain_handler_target',
        target_role: 'opl_generated_product_entry_surface',
      },
      {
        surface_id: 'status_read_model',
        current_paths: ['agent/status.ts'],
        current_role: 'domain_projection_refs',
        target_role: 'opl_generated_status_read_model_surface',
      },
      {
        surface_id: 'domain_handler',
        current_paths: ['runtime/domain-handler.ts'],
        current_role: 'domain_handler_target',
        target_role: 'domain_handler_target',
      },
      {
        surface_id: 'workbench_drilldown',
        current_paths: ['runtime/workbench.ts'],
        current_role: 'projection_refs',
        target_role: 'opl_hosted_workbench_shell_consuming_domain_refs',
      },
      {
        surface_id: 'functional_harness_cases',
        current_paths: ['runtime/harness.ts'],
        current_role: 'oracle_fixture_refs',
        target_role: 'opl_generated_functional_harness_cases',
      },
    ],
    required_domain_handoff: [
      'owner_receipt_schema',
      'typed_blocker_schema',
      'minimal_authority_function_refs',
      'no_forbidden_write_evidence',
    ],
  });

  writeJson(path.join(targetDir, 'contracts', 'functional_privatization_audit.json'), {
    surface_kind: 'functional_privatization_audit',
    target_domain_id: 'sample-brief-agent',
    authority_boundary: {
      opl_can_write_domain_truth: false,
      opl_can_write_memory_body: false,
      opl_can_authorize_quality_or_export: false,
      domain_can_claim_generic_runtime_owner: false,
      domain_repo_can_own_generated_surface: false,
    },
    modules: [
      {
        module_id: 'sample_brief_generated_wrappers',
        classification: 'declarative_pack_generated_surface',
        owner: 'SampleBriefAgent',
        code_paths: ['agent/cli.ts', 'agent/mcp.ts', 'agent/product-entry.ts', 'agent/status.ts'],
        active_callers: ['OPL generated CLI', 'OPL generated MCP', 'OPL generated product-entry'],
        active_caller_status: 'domain_handlers_active_opl_generated_wrapper_metadata_consumed',
        migration_action: 'derive_wrapper_metadata_from_declarative_pack_and_opl_generated_surfaces',
        retained_domain_authority: ['domain_action_handler', 'owner_receipt'],
      },
      {
        module_id: 'sample_brief_domain_handler',
        classification: 'declarative_pack_generated_surface',
        owner: 'SampleBriefAgent',
        code_paths: ['runtime/domain-handler.ts'],
        active_callers: ['OPL generated domain handler dispatch'],
        active_caller_status: 'domain_handler_target_returns_owner_receipt_or_typed_blocker',
        migration_action: 'route_generated_domain_handler_to_minimal_authority_function_targets',
        retained_domain_authority: ['owner_receipt'],
      },
      {
        module_id: 'sample_brief_workbench_projection',
        classification: 'declarative_pack_generated_surface',
        owner: 'SampleBriefAgent',
        code_paths: ['runtime/workbench.ts'],
        active_callers: ['OPL hosted workbench'],
        active_caller_status: 'opl_hosted_workbench_surface_consumes_domain_projection_refs',
        migration_action: 'declare_workbench_projection_inputs_for_opl_app_generated_shell',
        retained_domain_authority: ['status_projection_refs'],
      },
      {
        module_id: 'sample_brief_functional_harness',
        classification: 'declarative_pack_generated_surface',
        owner: 'SampleBriefAgent',
        code_paths: ['runtime/harness.ts'],
        active_callers: ['OPL functional harness'],
        active_caller_status: 'opl_generated_functional_harness_cases_target_domain_handler',
        migration_action: 'derive_harness_cases_from_declarative_pack_and_opl_functional_runtime_harness',
        retained_domain_authority: ['fixture_oracle_refs'],
      },
      {
        module_id: 'sample_brief_owner_receipt_signer',
        classification: 'minimal_authority_function',
        owner: 'SampleBriefAgent',
        cannot_absorb_reason: 'OPL cannot sign target domain owner receipts.',
      },
    ],
  });

  const privateSurfacePolicyPath = path.join(targetDir, 'contracts', 'private_functional_surface_policy.json');
  const privateSurfacePolicy = JSON.parse(fs.readFileSync(privateSurfacePolicyPath, 'utf8'));
  privateSurfacePolicy.physical_source_morphology_policy = {
    policy_id: 'sample_brief_agent.physical_source_morphology.v1',
    state: 'classified_no_generic_runtime_reflow',
    required_surface_ids: [
      'agent_semantic_pack',
      'domain_handler_targets',
      'refs_only_adapters',
      'minimal_authority_functions',
      'legacy_runtime_residue',
    ],
    classification_buckets: [
      'declarative_domain_pack',
      'domain_handler_target',
      'refs_only_adapter',
      'minimal_authority_function',
      'legacy_proof_tombstone',
    ],
    authority_boundary: {
      domain_can_claim_generic_runtime_owner: false,
      domain_repo_can_own_generated_surface: false,
    },
    surface_classifications: [
      {
        surface_id: 'agent_semantic_pack',
        classification: 'declarative_domain_pack',
        source_refs: ['agent/'],
      },
      {
        surface_id: 'domain_handler_targets',
        classification: 'domain_handler_target',
        source_refs: ['agent/cli.ts', 'agent/mcp.ts', 'agent/product-entry.ts'],
      },
      {
        surface_id: 'refs_only_adapters',
        classification: 'refs_only_adapter',
        source_refs: ['agent/status.ts', 'runtime/domain-handler.ts', 'runtime/workbench.ts'],
      },
      {
        surface_id: 'minimal_authority_functions',
        classification: 'minimal_authority_function',
        source_refs: ['runtime/authority_functions/owner-receipt.json'],
      },
      {
        surface_id: 'legacy_runtime_residue',
        classification: 'legacy_proof_tombstone',
        source_refs: ['docs/history/runtime-tombstone.md'],
      },
    ],
  };
  writeJson(privateSurfacePolicyPath, privateSurfacePolicy);

  writeJson(path.join(targetDir, 'contracts', 'workspace_lifecycle_policy.json'), {
    surface_kind: 'opl_domain_workspace_file_lifecycle_policy',
    version: 'opl-domain-workspace-file-lifecycle.v1',
    policy_owner: 'one-person-lab',
    structural_gate_only: true,
    repo_source_boundaries: {
      required_roots: [
        'agent/',
        'contracts/',
        'runtime/authority_functions/',
        'docs/',
        'src/ or packages/',
      ],
      source_truth_policy: 'repo_source_contains_pack_contracts_authority_functions_and_domain_code_only',
      runtime_artifacts_live_in_source_repo: false,
      developer_checkout_may_define_app_runtime_without_explicit_override: false,
      forbidden_runtime_artifact_roots: [
        'artifacts/',
        'workspaces/',
        'workspace/',
        'runtime/artifacts/',
        'runtime/workspaces/',
      ],
    },
    workspace_runtime_artifact_roots: {
      externalized: true,
      repo_source_policy: 'locator_index_schema_receipt_refs_only',
      allowed_authoritative_roots: [
        'workspace_root',
        'runtime_artifact_root',
        'user_runtime_state_root',
        'OPL_STATE_DIR',
      ],
      required_locator_refs: [
        'workspace_root_ref',
        'runtime_artifact_root_ref',
        'artifact_locator_ref',
        'restore_or_retention_receipt_ref',
      ],
    },
    byproduct_policy: {
      caches_and_install_artifacts_externalized: true,
      ignored_only_is_fallback_not_authority: true,
      forbidden_generated_paths: [
        '.venv/',
        '__pycache__/',
        '.pytest_cache/',
        '*.egg-info/',
        'dist/',
        'coverage/',
        'node_modules/',
      ],
    },
    lifecycle_authority_split: {
      opl_owned_primitives: [
        'workspace_lifecycle',
        'file_lifecycle',
        'artifact_locator_index',
        'retention_restore_ledger',
        'migration_ledger',
        'operator_projection',
      ],
      domain_owned_authority: [
        'domain_truth',
        'quality_export_visual_verdict',
        'artifact_body_authority',
        'memory_body_accept_reject',
        'owner_receipt',
      ],
    },
    authority_boundary: {
      policy_can_claim_domain_ready_or_artifact_authority: false,
      opl_can_write_domain_truth: false,
      opl_can_write_memory_body: false,
      opl_can_mutate_domain_artifact_body: false,
      opl_can_authorize_quality_or_export: false,
    },
  });

  writeJson(path.join(targetDir, 'contracts', 'stage_artifact_kernel_adoption.json'), {
    surface_kind: 'opl_stage_artifact_kernel_adoption',
    version: 'opl-stage-artifact-kernel-adoption.v1',
    owner: 'SampleBriefAgent',
    kernel_contract_ref: 'contracts/opl-framework/stage-artifact-runtime-contract.json',
    stage_folder_unit: [
      'Stage Folder',
      'Manifest',
      'Receipt',
      'current pointer',
    ],
    terminal_states: [
      'success',
      'blocked',
      'skipped',
      'deferred',
    ],
    required_ref_fields: [
      'stage_folder_contract_ref',
      'stage_json_ref',
      'attempt_json_ref',
      'manifest_ref',
      'receipt_ref',
      'current_pointer_ref',
      'canonical_artifact_ref',
      'export_ref',
      'lineage_ref',
      'retention_ref',
    ],
    kernel_refs: {
      physical_stage_folder_source_of_truth: true,
      derived_index_rebuildable: true,
      manifest_receipt_hash_required: true,
    },
    domain_pack_binding: {
      accepted_source_refs: [
        'contracts/stage_control_plane.json',
        'contracts/foundry_agent_series.json',
      ],
      domain_output_roles_are_interface: true,
      file_name_is_not_interface: true,
    },
    projection_boundary: {
      derived_projection_refs: [
        'stage_artifact_index',
        'stage_operating_layer',
        'app_workbench_artifact_drilldown',
      ],
      file_presence_only_counts_as: 'orphan_or_historical',
      provider_completion_counts_as_progress: false,
    },
    authority_boundary: {
      opl_can_create_domain_owner_receipt: false,
      opl_can_write_domain_truth: false,
      opl_can_write_memory_body: false,
      opl_can_mutate_domain_artifact_body: false,
      opl_can_authorize_quality_or_export: false,
    },
  });

  writeJson(path.join(targetDir, 'contracts', 'state_index_kernel_adoption.json'), {
    surface_kind: 'opl_state_index_kernel_adoption',
    version: 'opl-state-index-kernel-adoption.v1',
    owner: 'SampleBriefAgent',
    kernel_contract_ref: 'contracts/opl-framework/state-index-kernel-contract.json',
    sqlite_role: 'rebuildable_refs_only_sidecar_index',
    physical_truth_role: 'stage_folder_manifest_receipt_artifact_body_file_truth',
    required_index_databases: [
      'queue',
      'lifecycle_index',
      'artifact_index',
      'operator_read_model',
    ],
    required_ref_fields: [
      'domain_id',
      'program_id',
      'stage_id',
      'attempt_id',
      'surface_id',
      'source_ref',
      'receipt_ref',
      'content_hash',
      'observed_at',
      'indexed_at',
      'index_version',
      'rebuild_epoch',
    ],
    domain_ref_sources: [
      'contracts/stage_artifact_kernel_adoption.json',
      'contracts/workspace_lifecycle_policy.json',
      'contracts/generated_surface_handoff.json',
      'contracts/action_catalog.json',
    ],
    compaction_policy: {
      small_file_runtime_refs_may_be_indexed: true,
      large_payload_strategy: 'store_preview_hash_and_refs_never_body',
      index_rebuild_source: 'physical_stage_folder_manifest_receipt_refs',
      app_reads_projection_not_sqlite_directly: true,
    },
    maintenance_policy: {
      journal_mode: 'WAL',
      busy_timeout_ms: 5000,
      checkpoint_required: true,
      backup_required: true,
      integrity_check_required: true,
      optimize_required: true,
      network_filesystem_multi_writer_supported: false,
    },
    authority_boundary: {
      sqlite_sidecar_source_of_truth: false,
      sqlite_record_counts_as_stage_complete: false,
      opl_can_write_domain_truth: false,
      opl_can_write_memory_body: false,
      opl_can_write_artifact_body: false,
      opl_can_store_large_artifact_blob_in_sqlite: false,
      opl_can_create_domain_owner_receipt: false,
      opl_can_authorize_quality_or_export: false,
      domain_repo_can_own_generic_sqlite_persistence_engine: false,
    },
  });

  return targetDir;
}

export function retargetReadyRepoToMag(repoDir: string) {
  const domainDescriptorPath = path.join(repoDir, 'contracts', 'domain_descriptor.json');
  const domainDescriptor = JSON.parse(fs.readFileSync(domainDescriptorPath, 'utf8'));
  domainDescriptor.domain_id = 'med-autogrant';
  domainDescriptor.domain_label = 'Med Auto Grant';
  writeJson(domainDescriptorPath, domainDescriptor);

  const actionCatalogPath = path.join(repoDir, 'contracts', 'action_catalog.json');
  const actionCatalog = JSON.parse(fs.readFileSync(actionCatalogPath, 'utf8'));
  actionCatalog.target_domain_id = 'med-autogrant';
  writeJson(actionCatalogPath, actionCatalog);
}

export function retargetReadyRepo(repoDir: string, domainId: string, domainLabel: string) {
  const domainDescriptorPath = path.join(repoDir, 'contracts', 'domain_descriptor.json');
  const domainDescriptor = JSON.parse(fs.readFileSync(domainDescriptorPath, 'utf8'));
  domainDescriptor.domain_id = domainId;
  domainDescriptor.domain_label = domainLabel;
  writeJson(domainDescriptorPath, domainDescriptor);

  const actionCatalogPath = path.join(repoDir, 'contracts', 'action_catalog.json');
  const actionCatalog = JSON.parse(fs.readFileSync(actionCatalogPath, 'utf8'));
  actionCatalog.target_domain_id = domainId;
  writeJson(actionCatalogPath, actionCatalog);
}

export function configureReadyMagMorphology(repoDir: string) {
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
}

export function configureReadyRcaMorphology(repoDir: string) {
  writeJson(path.join(repoDir, 'contracts', 'physical_source_morphology_policy.json'), {
    canonical_pack_root: 'agent/',
    status: 'active_source_classification_policy_landed',
    active_surface_classifications: [
      'mcp_product_entry_domain_entry',
      'product_entry_continuity_refs_adapter',
      'runtime_watch_projection',
      'domain_action_adapter_guarded_actions',
      'operator_evidence_stability_projection',
      'visual_authority_functions',
    ].map((surface_id) => ({
      surface_id,
      classification: 'domain_handler_or_refs_only_adapter',
      forbidden_generic_owner_flags: {
        generic_runtime_owner: false,
        generated_surface_owner_in_domain_repo: false,
      },
    })),
    legacy_name_policy: {
      forbidden_active_surface_ids: [
        'legacy_managed_runtime_gateway_names',
      ],
      compatibility_alias_allowed: false,
      active_generic_runtime_owner_allowed: false,
      active_generic_gateway_owner_allowed: false,
      active_generic_session_runtime_owner_allowed: false,
    },
  });
}

export function configureReadyMetaMorphology(repoDir: string) {
  fs.mkdirSync(path.join(repoDir, 'runtime', 'authority_functions'), { recursive: true });
  const privateSurfacePolicyPath = path.join(repoDir, 'contracts', 'private_functional_surface_policy.json');
  const privateSurfacePolicy = JSON.parse(fs.readFileSync(privateSurfacePolicyPath, 'utf8'));
  privateSurfacePolicy.forbidden_script_roles = [
    'generic_runtime_owner',
    'generic_registry_owner',
    'app_shell_owner',
    'agent_lab_execution_owner',
    'promotion_gate_owner',
    'target_domain_truth_writer',
  ];
  writeJson(privateSurfacePolicyPath, privateSurfacePolicy);
  writeJson(path.join(repoDir, 'runtime', 'authority_functions', 'meta-agent-authority-functions.json'), {
    script_morphology_policy: {
      allowed_classes: [
        'authority_function_implementation_ref',
        'smoke_helper',
        'fixture_or_proof_helper',
        'developer_work_order_materializer',
      ],
      forbidden_roles: privateSurfacePolicy.forbidden_script_roles,
      script_classifications: [],
    },
  });
}

export function writeProductionAcceptance(repoDir: string, fileName: string, payload: unknown) {
  const directory = path.join(repoDir, 'contracts', 'production_acceptance');
  fs.mkdirSync(directory, { recursive: true });
  writeJson(path.join(directory, fileName), payload);
}
