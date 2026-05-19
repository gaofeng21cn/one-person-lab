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
    'local_journal',
    'attempt_ledger',
    'repo_owned_scheduler',
    'hermes_gateway_local_manager_probe',
    'compat_facade_active_alias',
  ];
  privateSurfacePolicy.physical_source_morphology_policy.authority_boundary = {
    mag_can_own_generic_runtime: false,
    mag_can_own_generated_wrapper: false,
    mag_can_restore_compat_facade_active_alias: false,
  };
  writeJson(privateSurfacePolicyPath, privateSurfacePolicy);
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

  const report = runCli([
    'agents',
    'conformance',
    '--agent',
    `mag=${repoDir}`,
  ]).standard_domain_agent_conformance;

  assert.equal(report.status, 'passed');
  assert.equal(report.reports[0].physical_morphology_checks.status, 'passed');
  assert.deepEqual(
    report.reports[0].physical_morphology_checks.forbidden_name_residue.filter((entry: { allowed: boolean }) => !entry.allowed),
    [],
  );
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
