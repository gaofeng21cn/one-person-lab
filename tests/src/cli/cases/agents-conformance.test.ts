import { assert, fs, os, path, runCli, test } from '../helpers.ts';

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

function writeJson(filePath: string, payload: unknown) {
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function buildReadyAgentRepo() {
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
      { surface_id: 'sidecar_export_dispatch', owner: 'one-person-lab', status: 'descriptor_source_available' },
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
        surface_id: 'sidecar_export_dispatch',
        current_paths: ['runtime/sidecar.ts'],
        current_role: 'sidecar_adapter',
        target_role: 'opl_generated_sidecar_handoff_surface',
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
        module_id: 'sample_brief_sidecar_adapter',
        classification: 'declarative_pack_generated_surface',
        owner: 'SampleBriefAgent',
        code_paths: ['runtime/sidecar.ts'],
        active_callers: ['OPL generated sidecar dispatch'],
        active_caller_status: 'opl_generated_sidecar_surface_targets_domain_handler',
        migration_action: 'declare_sidecar_descriptor_for_opl_generated_dispatch_surface',
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
        source_refs: ['agent/status.ts', 'runtime/sidecar.ts', 'runtime/workbench.ts'],
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

  return targetDir;
}

function retargetReadyRepoToMag(repoDir: string) {
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

function retargetReadyRepo(repoDir: string, domainId: string, domainLabel: string) {
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

function configureReadyMagMorphology(repoDir: string) {
  const privateSurfacePolicyPath = path.join(repoDir, 'contracts', 'private_functional_surface_policy.json');
  const privateSurfacePolicy = JSON.parse(fs.readFileSync(privateSurfacePolicyPath, 'utf8'));
  privateSurfacePolicy.physical_source_morphology_policy.required_surface_ids = [
    'domain_runtime',
    'product_entry',
    'status',
    'user_loop',
    'sidecar',
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

function configureReadyRcaMorphology(repoDir: string) {
  writeJson(path.join(repoDir, 'contracts', 'physical_source_morphology_policy.json'), {
    canonical_pack_root: 'agent/',
    status: 'active_source_classification_policy_landed',
    active_surface_classifications: [
      'mcp_product_entry_domain_entry',
      'product_entry_session_store',
      'runtime_watch_projection',
      'product_sidecar_guarded_actions',
      'operator_evidence_stability_projection',
      'visual_authority_functions',
      'legacy_managed_runtime_gateway_names',
    ].map((surface_id) => ({
      surface_id,
      classification: surface_id === 'legacy_managed_runtime_gateway_names'
        ? 'history_tombstone'
        : 'domain_handler_or_refs_only_adapter',
      forbidden_generic_owner_flags: {
        generic_runtime_owner: false,
        generated_surface_owner_in_domain_repo: false,
      },
    })),
  });
}

function configureReadyMetaMorphology(repoDir: string) {
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

function writeProductionAcceptance(repoDir: string, fileName: string, payload: unknown) {
  const directory = path.join(repoDir, 'contracts', 'production_acceptance');
  fs.mkdirSync(directory, { recursive: true });
  writeJson(path.join(directory, fileName), payload);
}

test('agents conformance reports structural readiness separately from production evidence tail', () => {
  const repoDir = buildReadyAgentRepo();
  const report = runCli([
    'agents',
    'conformance',
    '--agent',
    `sample=${repoDir}`,
  ]).standard_domain_agent_conformance;

  assert.equal(report.surface_kind, 'opl_standard_domain_agent_conformance_report');
  assert.equal(report.owner, 'one-person-lab');
  assert.equal(report.status, 'passed');
  assert.equal(report.summary.total_repo_count, 1);
  assert.equal(report.summary.passed_count, 1);
  assert.equal(report.summary.blocked_count, 0);
  assert.equal(report.summary.structural_conformance_status, 'passed');
  assert.equal(report.summary.production_evidence_tail_count, 2);
  assert.equal(report.authority_boundary.conformance_report_can_claim_domain_ready, false);

  const repo = report.reports[0];
  assert.equal(repo.status, 'passed');
  assert.deepEqual(repo.blockers, []);
  assert.equal(repo.scaffold_validation.status, 'passed');
  assert.equal(repo.pack_compiler_checks.canonical_semantic_pack_root, 'agent/');
  assert.deepEqual(repo.pack_compiler_checks.legacy_pack_root_fields, []);
  assert.deepEqual(repo.pack_compiler_checks.readme_required_paths, []);
  assert.equal(repo.generated_surface_handoff_checks.generated_surface_owner, 'one-person-lab');
  assert.equal(repo.private_surface_checks.domain_can_claim_generic_runtime_owner, false);
  assert.equal(repo.generated_interface_checks.generated_interfaces_status, 'ready');
  assert.equal(repo.generated_interface_checks.generated_wrapper_bundle_status, 'ready');
  assert.equal(repo.generated_interface_checks.active_caller_target_proof_status, 'ready');
  assert.equal(
    repo.generated_interface_checks.active_caller_cutover_proof_status,
    'cutover_to_opl_generated_or_domain_handler_targets',
  );
  assert.equal(repo.physical_morphology_checks.status, 'passed');
  assert.equal(repo.physical_morphology_checks.policy_status, 'declared');
  assert.equal(repo.evidence_tail_classification.status, 'production_evidence_tail_present');
  assert.equal(repo.evidence_tail_classification.tail_items.length, 2);
  assert.deepEqual(
    repo.evidence_tail_classification.tail_items.map((item: { status: string }) => item.status),
    ['open', 'open'],
  );
  assert.equal(repo.evidence_tail_classification.tail_items[0].repo_path, repoDir);
  assert.equal(repo.evidence_tail_classification.tail_items[0].authority_boundary.conformance_report_can_claim_domain_ready, false);
});

test('agents readiness aggregates structural gates and production evidence tail without claiming authority', () => {
  const repoDir = buildReadyAgentRepo();
  const readiness = runCli([
    'agents',
    'readiness',
    '--agent',
    `sample=${repoDir}`,
  ]).agent_readiness;

  assert.equal(readiness.surface_kind, 'opl_agent_readiness_summary');
  assert.equal(readiness.owner, 'one-person-lab');
  assert.equal(readiness.status, 'passed_with_production_evidence_tail');
  assert.equal(readiness.summary.structural_conformance_status, 'passed');
  assert.equal(readiness.summary.conformance_passed_count, 1);
  assert.equal(readiness.summary.conformance_blocked_count, 0);
  assert.equal(readiness.summary.pack_compiler_blocked_domain_count, 0);
  assert.equal(readiness.summary.generated_interface_blocked_count, 0);
  assert.equal(readiness.summary.domain_generated_surface_owner_claim_count, 0);
  assert.equal(readiness.summary.production_evidence_tail_count, 2);
  assert.equal(
    readiness.summary.production_evidence_tail_policy,
    'reported_separately_not_a_structural_pass_condition',
  );
  assert.equal(readiness.summary.production_or_domain_ready, false);

  assert.equal(readiness.gates.scaffold_and_conformance.status, 'passed');
  assert.equal(
    readiness.gates.scaffold_and_conformance.source_command,
    'opl agents conformance --family-defaults --json',
  );
  assert.equal(
    readiness.gates.pack_compiler.policy,
    'canonical_domain_pack_metadata_source_for_generated_surfaces',
  );
  assert.equal(
    readiness.gates.generated_interfaces.policy,
    'generated_descriptors_route_to_domain_handler_targets_without_claiming_domain_truth',
  );
  assert.equal(
    readiness.gates.semantic_hygiene.policy,
    'framework_hygiene_guard_only_no_domain_authority',
  );

  assert.equal(
    readiness.production_evidence_tail_ledger.surface_kind,
    'opl_production_evidence_tail_ledger',
  );
  assert.equal(readiness.production_evidence_tail_ledger.summary.tail_item_count, 2);
  assert.equal(readiness.production_evidence_tail_ledger.summary.blocking_tail_item_count, 0);
  assert.equal(readiness.production_evidence_tail_ledger.authority_boundary.can_claim_domain_ready, false);
  assert.equal(readiness.authority_boundary.readiness_can_claim_domain_ready, false);
  assert.equal(readiness.authority_boundary.readiness_can_claim_artifact_authority, false);
  assert.equal(readiness.authority_boundary.readiness_can_claim_production_ready, false);
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
    'sidecar',
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

test('agents conformance blocks exact MAG legacy residue tokens', () => {
  const repoDir = buildReadyAgentRepo();
  retargetReadyRepoToMag(repoDir);
  const actionCatalogPath = path.join(repoDir, 'contracts', 'action_catalog.json');
  const actionCatalog = JSON.parse(fs.readFileSync(actionCatalogPath, 'utf8'));
  actionCatalog.notes.push('old attempt_ledger exact token must stay out of active paths');
  writeJson(actionCatalogPath, actionCatalog);

  const report = runCli([
    'agents',
    'conformance',
    '--agent',
    `mag=${repoDir}`,
  ]).standard_domain_agent_conformance;

  assert.equal(report.status, 'blocked');
  assert.equal(
    report.reports[0].blockers.includes('active_forbidden_name_residue:attempt_ledger:contracts/action_catalog.json'),
    true,
  );
});
