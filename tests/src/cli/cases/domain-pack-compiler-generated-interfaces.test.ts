import { assert, buildManifestCommand, createFamilyContractsFixtureRoot, fs, loadFamilyManifestFixtures, os, path, repoRoot, runCli, runCliFailure, test } from '../helpers.ts';
import { buildReadyAgentRepo, writeJson } from './agents-conformance-fixtures.ts';
import {
  attachManifestSurface,
  bindFamilyManifests,
  createFamilyDefaultContractWorkspace,
  withPackCompilerReadySurfaces,
} from './domain-pack-compiler-fixtures.ts';

test('generated interfaces command exposes descriptors but blocks cutover without handoff proof', () => {
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-generated-interfaces-state-'));
  const env = { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot };

  bindFamilyManifests(env);

  const bundle = runCli(['agents', 'interfaces', '--domain', 'mas'], env).generated_agent_interfaces;
  assert.equal(bundle.surface_kind, 'opl_generated_agent_interface_bundle');
  assert.equal(bundle.owner, 'one-person-lab');
  assert.equal(bundle.domain_repo_can_own_generated_surface, false);
  assert.equal(bundle.active_caller_cutover_proof.status, 'blocked');
  assert.equal(bundle.active_caller_cutover_proof.generated_surface_owner, 'one-person-lab');
  assert.equal(bundle.active_caller_cutover_proof.generated_blocks_ready, true);
  assert.equal(bundle.active_caller_cutover_proof.active_caller_target_proof_status, 'blocked');
  assert.equal(bundle.active_caller_cutover_proof.blocked_target_count > 0, true);
  assert.equal(bundle.active_caller_cutover_proof.blocker_reasons.length, 0);
  assert.equal(
    bundle.active_caller_cutover_proof.domain_handler_targets_only,
    false,
  );
  assert.deepEqual(bundle.active_caller_cutover_proof.forbidden_generated_authority, [
    'domain_truth_write',
    'memory_body_write',
    'quality_or_export_verdict',
    'artifact_mutation',
  ]);
  assert.equal(bundle.cli.descriptors[0].command, 'MedAutoScience study_packet');
  assert.equal(bundle.mcp.descriptors[0].name, 'study_packet');
  assert.equal(bundle.skill.descriptors[0].command_contract_id, 'study_packet');
  assert.equal(bundle.product_entry.descriptors[0].action_key, 'study_packet');
  assert.equal(bundle.openai_tool.descriptors[0].function.name, 'study_packet');
  assert.equal(bundle.ai_sdk.descriptors[0].name, 'study_packet');
  assert.equal(bundle.generated_direct_parity.surface_kind, 'opl_generated_direct_parity_proof');
  assert.equal(bundle.generated_direct_parity.status, 'blocked_or_drift_detected');
  assert.equal(
    bundle.generated_direct_parity.issues.includes('active caller target proof is not ready'),
    true,
  );
  assert.equal(bundle.generated_direct_parity.authority_boundary.parity_proof_can_write_domain_truth, false);
  assert.equal(bundle.generated_direct_parity.authority_boundary.parity_proof_can_sign_owner_receipt, false);
  assert.equal(bundle.generated_direct_parity.authority_boundary.parity_proof_can_create_typed_blocker, false);
  assert.equal(bundle.generated_direct_parity.authority_boundary.parity_proof_can_claim_domain_ready, false);
  assert.equal(bundle.authority_boundary.generated_interface_can_write_memory_body, false);
  assert.equal(bundle.authority_boundary.generated_interface_can_mutate_artifacts, false);

  const mcpOnly = runCli(['agents', 'interfaces', '--domain', 'mas', '--format', 'mcp'], env)
    .generated_agent_interfaces;
  assert.equal(mcpOnly.selected_format, 'mcp');
  assert.equal(mcpOnly.mcp.descriptors[0].name, 'study_packet');
  assert.equal('cli' in mcpOnly, false);
  assert.equal('skill' in mcpOnly, false);
  assert.equal(mcpOnly.generated_direct_parity.checked_surface_ids.includes('mcp'), true);
  assert.deepEqual(mcpOnly.stage_routes, []);
});

test('generated interfaces declare generated surfaces as the default entry baseline', () => {
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-generated-interfaces-default-entry-'));
  const env = { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot };

  bindFamilyManifests(env);

  const bundle = runCli(['agents', 'interfaces', '--domain', 'mas'], env).generated_agent_interfaces;

  assert.deepEqual(bundle.default_entry_policy, {
    surface_kind: 'opl_generated_surface_default_entry_policy',
    version: 'opl-generated-surface-default-entry-policy.v1',
    owner: 'one-person-lab',
    status: 'generated_surfaces_are_default_entry_baseline',
    source_catalogs: ['family_action_catalog', 'family_stage_control_plane'],
    domain_repo_wrapper_policy: 'handler_target_refs_only_adapter_or_tombstone_candidate',
    domain_repo_can_own_default_entry: false,
    default_entry_surface_ids: [
      'cli',
      'mcp',
      'openai_tool',
      'ai_sdk',
      'skill_plugin',
      'app_action',
      'status_read_model',
      'workbench',
    ],
  });
  assert.deepEqual(
    bundle.supported_derived_surfaces.map((surface: { surface_id: string }) => surface.surface_id),
    [
      'cli',
      'mcp',
      'openai_tool',
      'ai_sdk',
      'skill_plugin',
      'app_action',
      'status_read_model',
      'workbench',
    ],
  );
  assert.deepEqual(
    bundle.supported_derived_surfaces.map((surface: { source_catalogs: string[] }) => surface.source_catalogs),
    [
      ['family_action_catalog'],
      ['family_action_catalog'],
      ['family_action_catalog'],
      ['family_action_catalog'],
      ['family_action_catalog'],
      ['family_action_catalog'],
      ['family_action_catalog', 'runtime_surfaces'],
      ['family_stage_control_plane', 'domain_memory_descriptor', 'runtime_surfaces'],
    ],
  );
  assert.equal(
    bundle.supported_derived_surfaces.every(
      (surface: { default_entry: boolean; owner: string; domain_repo_can_own_generated_surface: boolean }) =>
        surface.default_entry === true
        && surface.owner === 'one-person-lab'
        && surface.domain_repo_can_own_generated_surface === false,
    ),
    true,
  );
  assert.equal(
    bundle.default_entry_policy.default_entry_surface_ids.length,
    bundle.supported_derived_surfaces.length,
  );
  assert.deepEqual(bundle.source_of_work_lineage, {
    surface_kind: 'opl_generated_surface_source_of_work_lineage',
    version: 'opl-generated-surface-source-of-work-lineage.v1',
    owner: 'one-person-lab',
    status: 'ready_from_family_action_catalog',
    source_catalogs: ['family_action_catalog', 'family_stage_control_plane'],
    action_catalog_ref: 'family_action_catalog:med_autoscience_action_catalog',
    stage_catalog_ref: 'family_stage_control_plane:med_autoscience_stage_plane',
    action_ids: ['study_packet'],
    derived_surface_ids: [
      'cli',
      'mcp',
      'openai_tool',
      'ai_sdk',
      'skill_plugin',
      'app_action',
      'status_read_model',
      'workbench',
    ],
    derived_surface_policy: 'derive_cli_mcp_openai_ai_sdk_skill_app_status_workbench_from_single_catalog',
    domain_repo_wrapper_policy: 'handler_target_refs_only_adapter_or_tombstone_candidate',
    authority_boundary: {
      lineage_can_write_domain_truth: false,
      lineage_can_replace_domain_handler: false,
      lineage_can_authorize_quality_or_export: false,
      lineage_can_claim_domain_ready: false,
      lineage_can_claim_production_ready: false,
    },
  });
  assert.equal(bundle.cli.descriptors[0].source_of_work.source_action_id, 'study_packet');
  assert.equal(bundle.mcp.descriptors[0].source_of_work.source_action_id, 'study_packet');
  assert.equal(bundle.skill.descriptors[0].source_of_work.source_action_id, 'study_packet');
  assert.equal(bundle.product_entry.descriptors[0].source_of_work.source_action_id, 'study_packet');
  assert.equal(bundle.openai_tool.descriptors[0].source_of_work.source_action_id, 'study_packet');
  assert.equal(bundle.ai_sdk.descriptors[0].source_of_work.source_action_id, 'study_packet');
  assert.equal(bundle.product_status.source_of_work_lineage.status, 'ready_from_family_action_catalog');
  assert.equal(bundle.product_status.default_source_of_work.source_action_id, 'study_packet');
  assert.equal(
    bundle.product_status.source_of_work_consumption_policy,
    'status_read_model_consumes_generated_surface_lineage_without_claiming_domain_ready',
  );
  assert.equal(bundle.workbench.source_of_work_lineage.status, 'ready_from_family_action_catalog');
  assert.equal(bundle.workbench.default_source_of_work.source_action_id, 'study_packet');
  assert.equal(
    bundle.workbench.source_of_work_consumption_policy,
    'workbench_consumes_generated_surface_lineage_and_stage_routes_without_claiming_domain_ready',
  );
  assert.equal(bundle.generated_wrapper_bundle.domain_repo_role_policy, 'domain_handler_target_or_refs_only_adapter');
});

test('generated default entry release gate prevents wrapper surface resurrection', () => {
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-generated-interfaces-no-resurrection-'));
  const env = { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot };

  bindFamilyManifests(env);

  const bundle = runCli(['agents', 'interfaces', '--domain', 'mas'], env).generated_agent_interfaces;
  const contract = JSON.parse(fs.readFileSync(
    path.join(repoRoot, 'contracts', 'opl-framework', 'domain-pack-compiler-contract.json'),
    'utf8',
  ));
  const admissionGates = JSON.parse(fs.readFileSync(
    path.join(repoRoot, 'contracts', 'opl-framework', 'standard-agent-admission-gates.json'),
    'utf8',
  ));

  const expectedSurfaceIds = [
    'cli',
    'mcp',
    'openai_tool',
    'ai_sdk',
    'skill_plugin',
    'app_action',
    'status_read_model',
    'workbench',
  ];

  assert.deepEqual(
    contract.generated_interface_bundle.generated_default_entry_no_resurrection_gate
      .required_default_entry_surface_ids,
    expectedSurfaceIds,
  );
  assert.equal(contract.generated_interface_bundle.generated_default_entry_no_resurrection_gate.release_gate, true);
  assert.equal(
    contract.generated_interface_bundle.generated_default_entry_no_resurrection_gate
      .domain_repo_can_own_default_entry,
    false,
  );
  assert.equal(
    contract.generated_interface_bundle.generated_default_entry_no_resurrection_gate
      .descriptor_pass_can_claim_domain_ready,
    false,
  );
  assert.equal(
    contract.generated_interface_bundle.generated_default_entry_no_resurrection_gate
      .handwritten_default_tool_surface_allowed,
    false,
  );
  assert.equal(
    contract.generated_interface_bundle.generated_default_entry_no_resurrection_gate
      .domain_local_wrapper_can_be_default_entry,
    false,
  );
  assert.deepEqual(
    bundle.generated_default_entry_no_resurrection_gate.required_default_entry_surface_ids,
    expectedSurfaceIds,
  );
  assert.equal(
    bundle.generated_default_entry_no_resurrection_gate.default_entry_policy_ref,
    'generated_agent_interfaces.default_entry_policy',
  );
  assert.equal(bundle.generated_default_entry_no_resurrection_gate.release_gate, true);
  assert.equal(bundle.generated_default_entry_no_resurrection_gate.gate_status, 'pass');
  assert.equal(bundle.generated_default_entry_no_resurrection_gate.domain_repo_can_own_default_entry, false);
  assert.equal(bundle.generated_default_entry_no_resurrection_gate.descriptor_pass_can_claim_domain_ready, false);
  assert.equal(bundle.generated_default_entry_no_resurrection_gate.handwritten_default_tool_surface_allowed, false);
  assert.equal(bundle.generated_default_entry_no_resurrection_gate.domain_local_wrapper_can_be_default_entry, false);
  assert.equal(
    bundle.generated_default_entry_no_resurrection_gate.required_lineage_policy,
    'each_default_entry_surface_carries_source_of_work_lineage',
  );
  assert.deepEqual(
    bundle.generated_default_entry_no_resurrection_gate.blocked_resurrection_surface_classes,
    [
      'domain_local_wrapper',
      'domain_local_frontdoor',
      'handwritten_default_tool_surface',
      'repo_local_status_shell',
      'repo_local_workbench_shell',
    ],
  );
  assert.deepEqual(
    bundle.generated_default_entry_no_resurrection_gate.authority_boundary,
    {
      gate_can_claim_domain_ready: false,
      gate_can_claim_production_ready: false,
      gate_can_write_domain_truth: false,
      gate_can_authorize_quality_or_export: false,
    },
  );
  assert.deepEqual(
    bundle.generated_default_entry_no_resurrection_gate.default_entry_surface_lineage.map(
      (surface: { surface_id: string }) => surface.surface_id,
    ),
    expectedSurfaceIds,
  );
  for (const surface of bundle.generated_default_entry_no_resurrection_gate.default_entry_surface_lineage) {
    assert.equal(surface.owner, 'one-person-lab');
    assert.equal(surface.default_entry, true);
    assert.equal(surface.domain_repo_can_own_default_entry, false);
    assert.equal(surface.domain_repo_can_own_generated_surface, false);
    assert.equal(surface.descriptor_pass_can_claim_domain_ready, false);
    assert.equal(surface.source_of_work_lineage.source_action_ids.includes('study_packet'), true);
    assert.equal(
      surface.source_of_work_lineage.derived_surface_policy,
      'derive_cli_mcp_openai_ai_sdk_skill_app_status_workbench_from_single_catalog',
    );
    assert.equal(
      surface.source_of_work_lineage.domain_repo_wrapper_policy,
      'handler_target_refs_only_adapter_or_tombstone_candidate',
    );
  }
  assert.equal(
    admissionGates.false_authority_boundary.descriptor_pass_can_claim_domain_ready,
    false,
  );
});

test('domain pack compiler contract and action catalog schema declare generated default surfaces', () => {
  const contract = JSON.parse(fs.readFileSync(
    path.join(repoRoot, 'contracts', 'opl-framework', 'domain-pack-compiler-contract.json'),
    'utf8',
  ));
  const schema = JSON.parse(fs.readFileSync(
    path.join(repoRoot, 'contracts', 'family-orchestration', 'family-action-catalog.schema.json'),
    'utf8',
  ));

  assert.equal(
    contract.generated_interface_bundle.default_entry_policy.surface_kind,
    'opl_generated_surface_default_entry_policy',
  );
  assert.deepEqual(contract.generated_interface_bundle.default_entry_policy.default_entry_surface_ids, [
    'cli',
    'mcp',
    'openai_tool',
    'ai_sdk',
    'skill_plugin',
    'app_action',
    'status_read_model',
    'workbench',
  ]);
  assert.deepEqual(
    contract.generated_interface_bundle.supported_derived_surfaces.map(
      (surface: { surface_id: string }) => surface.surface_id,
    ),
    contract.generated_interface_bundle.default_entry_policy.default_entry_surface_ids,
  );
  assert.equal(
    contract.generated_interface_bundle.source_of_work_lineage.derived_surface_policy,
    'derive_cli_mcp_openai_ai_sdk_skill_app_status_workbench_from_single_catalog',
  );
  assert.equal(
    contract.generated_interface_bundle.source_of_work_lineage.authority_boundary
      .lineage_can_claim_domain_ready,
    false,
  );
  assert.deepEqual(
    schema.$defs.action.properties.supported_surfaces.required,
    ['cli', 'mcp', 'skill', 'product_entry', 'openai', 'ai_sdk'],
  );
  assert.deepEqual(schema.$defs.action.properties.source_of_work.$ref, '#/$defs/sourceOfWork');
  assert.equal(
    schema.$defs.sourceOfWork.properties.derived_surface_policy.const,
    'derive_cli_mcp_openai_ai_sdk_skill_app_status_workbench_from_single_catalog',
  );
  assert.equal(schema.$defs.action.properties.supported_surfaces.minProperties, 6);
});

test('generated interfaces reject action catalogs missing generated default surface slots', () => {
  const repoDir = buildReadyAgentRepo();
  const actionCatalogPath = path.join(repoDir, 'contracts', 'action_catalog.json');
  const actionCatalog = JSON.parse(fs.readFileSync(actionCatalogPath, 'utf8'));
  delete actionCatalog.actions[0].supported_surfaces.openai;
  writeJson(actionCatalogPath, actionCatalog);

  const failure = runCliFailure(['agents', 'interfaces', '--repo-dir', repoDir]);

  assert.equal(failure.payload.error.code, 'contract_shape_invalid');
  assert.equal(
    failure.payload.error.details.error.includes(
      'family_action_catalog.actions[0].supported_surfaces.openai',
    ),
    true,
  );
});

test('generated interfaces family-defaults product-entry format is the App workbench metadata feed', () => {
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-generated-interfaces-family-feed-'));
  const workspaceRoot = createFamilyDefaultContractWorkspace();
  const env = {
    OPL_CONTRACTS_DIR: fixtureContractsRoot,
    OPL_STATE_DIR: stateRoot,
    OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
  };

  try {
    const feed = runCli(
      ['agents', 'interfaces', '--family-defaults', '--format', 'product-entry'],
      env,
    ).generated_agent_interfaces;
    assert.equal(feed.surface_kind, 'opl_generated_agent_interfaces_family_report');
    assert.equal(feed.status, 'ready');
    assert.equal(feed.selected_format, 'product-entry');
    assert.deepEqual(feed.summary, {
      total_domain_count: 4,
      ready_domain_count: 4,
      blocked_domain_count: 0,
    });
    assert.equal(feed.authority_boundary.report_can_claim_domain_ready, false);

    for (const report of feed.reports) {
      const bundle = report.generated_agent_interfaces;
      assert.equal(bundle.status, 'ready');
      assert.equal(bundle.selected_format, 'product-entry');
      assert.equal(bundle.product_entry.status, 'ready');
      assert.equal(bundle.product_status.status, 'ready_from_family_action_catalog');
      assert.equal(bundle.product_session.status, 'ready_from_session_continuity_or_stage_control_plane');
      assert.equal(bundle.domain_handler.status, 'ready');
      assert.equal(bundle.workbench.status, 'ready_from_stage_control_plane');
      assert.equal(bundle.stage_routes.length > 0, true);
      assert.equal(bundle.source_contract_consumption.status, 'ready');
      assert.equal(bundle.authority_boundary.generated_interface_can_write_domain_truth, false);
      assert.equal(bundle.authority_boundary.generated_interface_can_authorize_quality_or_export, false);
    }
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('generated interfaces domain mode consumes generated handoff from active repo contracts', () => {
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-generated-interfaces-domain-handoff-'));
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-generated-interface-domain-repo-'));
  fs.mkdirSync(path.join(targetDir, 'contracts'), { recursive: true });
  const env = { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot };
  const fixtures = loadFamilyManifestFixtures();
  const manifest = withPackCompilerReadySurfaces(fixtures.medautoscience, {
    agentId: 'mas',
    targetDomainId: 'med-autoscience',
    owner: 'MedAutoScience',
    actionId: 'study_packet',
    stageId: 'study_stage',
    memoryRefId: 'mas_publication_route_memory',
  });
  fs.writeFileSync(
    path.join(targetDir, 'contracts', 'generated_surface_handoff.json'),
    `${JSON.stringify({
      surface_kind: 'opl_generated_surface_handoff',
      schema_version: 1,
      domain_id: 'med-autoscience',
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
          current_paths: ['runtime/authority_functions/verdict.ts'],
          current_role: 'domain_authority_active',
          target_role: 'domain_handler_target',
        },
      ],
    })}\n`,
  );

  runCli([
    'workspace',
    'bind',
    '--project',
    'medautoscience',
    '--path',
    targetDir,
    '--manifest-command',
    buildManifestCommand(manifest),
  ], env);

  const bundle = runCli(['agents', 'interfaces', '--domain', 'mas'], env).generated_agent_interfaces;
  assert.equal(bundle.status, 'ready');
  assert.equal(bundle.active_caller_target_proof.status, 'ready');
  assert.equal(bundle.active_caller_target_proof.blocked_target_count, 0);
  assert.equal(bundle.active_caller_cutover_proof.status, 'cutover_to_opl_generated_or_domain_handler_targets');
  assert.equal(bundle.generated_direct_parity.status, 'aligned');
  assert.deepEqual(bundle.generated_direct_parity.checked_action_ids, ['study_packet']);
  assert.deepEqual(bundle.generated_direct_parity.checked_surface_ids, [
    'cli',
    'mcp',
    'skill',
    'product_entry',
    'openai_tool',
    'ai_sdk',
  ]);
  assert.equal(bundle.generated_direct_parity.issue_count, 0);
  assert.equal(
    bundle.generated_direct_parity.accepted_answer_shape_policy,
    'generated_surface_and_direct_domain_handler_share_action_output_schema_or_receipt_contract',
  );
  assert.equal(
    bundle.generated_direct_parity.action_parity[0].accepted_answer_shape_ref,
    'contracts/output.schema.json',
  );
  assert.equal(
    bundle.generated_direct_parity.action_parity[0].generated_surfaces.every(
      (surface: { status: string; source_action_id: string }) =>
        surface.status === 'aligned' && surface.source_action_id === 'study_packet',
    ),
    true,
  );
  assert.equal(bundle.generated_wrapper_bundle.status, 'ready');
  const cliTarget = bundle.active_caller_target_proof.surface_targets.find(
    (target: { surface_id: string }) => target.surface_id === 'cli',
  );
  assert.equal(cliTarget.audit_visibility, 'hidden_by_default');
  assert.equal(cliTarget.semantic_equivalence_status, 'cleared_by_boundary');
  assert.equal(
    cliTarget.migration_action,
    'retain_as_minimal_authority_function',
  );
  assert.deepEqual(cliTarget.expected_opl_primitives, []);
  assert.deepEqual(cliTarget.current_surface_refs, []);
  assert.equal(cliTarget.cannot_absorb_reason, 'OPL cannot authorize domain quality, export, or truth verdicts.');
  assert.equal(cliTarget.bridge_exit_gate, null);
});

test('generated interfaces keep active caller cutover blocked while repo-local migration bridges remain', () => {
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-generated-interfaces-bridge-blocked-'));
  const env = { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot };
  const fixtures = loadFamilyManifestFixtures();
  const bridgeMas = attachManifestSurface(
    attachManifestSurface(
      withPackCompilerReadySurfaces(fixtures.medautoscience, {
        agentId: 'mas',
        targetDomainId: 'med-autoscience',
        owner: 'MedAutoScience',
        actionId: 'study_packet',
        stageId: 'study_stage',
        memoryRefId: 'mas_publication_route_memory',
      }),
      'functional_privatization_audit',
      {
        surface_kind: 'functional_privatization_audit',
        target_domain_id: 'med-autoscience',
        modules: [
          {
            module_id: 'repo_local_product_wrapper_bridge',
            classification: 'temporary_migration_bridge',
            owner: 'med-autoscience',
            code_paths: ['src/med_autoscience/cli.py'],
            active_callers: ['medautosci product-status'],
            active_caller_status: 'repo-local wrapper migration_bridge_pending',
            migration_action: 'cut over active caller to OPL generated product status surface',
          },
        ],
      },
    ),
    'generated_surface_handoff',
    {
      surface_kind: 'opl_generated_surface_handoff',
      schema_version: 1,
      domain_id: 'med-autoscience',
      generated_surface_owner: 'one-person-lab',
      domain_repo_can_own_generated_surface: false,
      handoff_surfaces: [
        {
          surface_id: 'status_read_model',
          current_paths: ['src/med_autoscience/cli.py'],
          current_role: 'repo-local wrapper migration bridge',
          target_role: 'opl_generated_product_status_surface',
        },
      ],
    },
  );

  runCli([
    'workspace',
    'bind',
    '--project',
    'medautoscience',
    '--path',
    repoRoot,
    '--manifest-command',
    buildManifestCommand(bridgeMas),
  ], env);

  const bundle = runCli(['agents', 'interfaces', '--domain', 'mas'], env).generated_agent_interfaces;
  assert.equal(bundle.active_caller_cutover_proof.status, 'blocked');
  assert.equal(bundle.active_caller_cutover_proof.generated_blocks_ready, true);
  assert.equal(bundle.active_caller_cutover_proof.blocked_target_count >= 1, true);
  assert.equal(bundle.active_caller_cutover_proof.blocked_surface_ids.includes('status_read_model'), true);
  assert.equal(bundle.active_caller_cutover_proof.domain_handler_targets_only, false);
  assert.equal(bundle.active_caller_target_proof.status, 'blocked');
  assert.equal(bundle.active_caller_target_proof.surface_targets.find(
    (target: { surface_id: string }) => target.surface_id === 'status_read_model',
  ).proof_status, 'blocked_active_caller_not_cut_over');
});

test('generated interfaces fail closed when active caller target kind is not proven', () => {
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-generated-interfaces-unknown-target-'));
  const env = { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot };
  const fixtures = loadFamilyManifestFixtures();
  const unknownTargetMas = attachManifestSurface(
    attachManifestSurface(
      withPackCompilerReadySurfaces(fixtures.medautoscience, {
        agentId: 'mas',
        targetDomainId: 'med-autoscience',
        owner: 'MedAutoScience',
        actionId: 'study_packet',
        stageId: 'study_stage',
        memoryRefId: 'mas_publication_route_memory',
      }),
      'functional_privatization_audit',
      {
        surface_kind: 'functional_privatization_audit',
        target_domain_id: 'med-autoscience',
        modules: [
          {
            module_id: 'ambiguous_status_module',
            classification: 'declarative_pack_generated_surface',
            owner: 'med-autoscience',
            code_paths: ['src/med_autoscience/status.py'],
            active_callers: ['status readout'],
            active_caller_status: 'declared active caller',
            migration_action: 'declared active caller target',
          },
        ],
      },
    ),
    'generated_surface_handoff',
    {
      surface_kind: 'opl_generated_surface_handoff',
      schema_version: 1,
      domain_id: 'med-autoscience',
      generated_surface_owner: 'one-person-lab',
      domain_repo_can_own_generated_surface: false,
      handoff_surfaces: [
        {
          surface_id: 'status_read_model',
          current_paths: ['src/med_autoscience/status.py'],
          current_role: 'declared active caller',
          target_role: 'status descriptor',
        },
      ],
    },
  );

  runCli([
    'workspace',
    'bind',
    '--project',
    'medautoscience',
    '--path',
    repoRoot,
    '--manifest-command',
    buildManifestCommand(unknownTargetMas),
  ], env);

  const bundle = runCli(['agents', 'interfaces', '--domain', 'mas'], env).generated_agent_interfaces;
  assert.equal(bundle.active_caller_cutover_proof.status, 'blocked');
  assert.equal(bundle.active_caller_target_proof.status, 'blocked');
  assert.equal(
    bundle.active_caller_cutover_proof.blocked_surface_ids.includes('status_read_model'),
    true,
  );
  const statusTarget = bundle.active_caller_target_proof.surface_targets.find(
    (target: { surface_id: string }) => target.surface_id === 'status_read_model',
  );
  assert.equal(statusTarget.proof_status, 'blocked_active_caller_target_not_proven');
  assert.equal(statusTarget.target_kind, 'descriptor_declared_target');
});

test('generated interfaces reject retired wrapper names as implicit canonical surface aliases', () => {
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-generated-interfaces-no-wrapper-alias-'));
  const env = { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot };
  const fixtures = loadFamilyManifestFixtures();
  const wrapperOnlyMas = attachManifestSurface(
    attachManifestSurface(
      withPackCompilerReadySurfaces(fixtures.medautoscience, {
        agentId: 'mas',
        targetDomainId: 'med-autoscience',
        owner: 'MedAutoScience',
        actionId: 'study_packet',
        stageId: 'study_stage',
        memoryRefId: 'mas_publication_route_memory',
      }),
      'functional_privatization_audit',
      {
        surface_kind: 'functional_privatization_audit',
        target_domain_id: 'med-autoscience',
        modules: [
          {
            module_id: 'legacy_wrapper_status_projection',
            classification: 'refs_only_adapter',
            owner: 'med-autoscience',
            code_paths: ['src/med_autoscience/product_status.py'],
            current_surface_refs: ['product_status', 'workbench'],
            active_callers: ['wrapper-only status/workbench read model'],
            active_caller_status: 'refs_only_domain_adapter_target',
            migration_action: 'domain projection consumed by historical wrapper names only',
          },
        ],
      },
    ),
    'generated_surface_handoff',
    {
      surface_kind: 'opl_generated_surface_handoff',
      schema_version: 1,
      domain_id: 'med-autoscience',
      generated_surface_owner: 'one-person-lab',
      domain_repo_can_own_generated_surface: false,
      generated_surfaces: [
        { surface_id: 'cli', owner: 'one-person-lab', status: 'descriptor_source_available' },
        { surface_id: 'mcp', owner: 'one-person-lab', status: 'descriptor_source_available' },
        { surface_id: 'skill', owner: 'one-person-lab', status: 'descriptor_source_available' },
        { surface_id: 'product_status', owner: 'one-person-lab', status: 'descriptor_source_available' },
        { surface_id: 'workbench', owner: 'one-person-lab', status: 'descriptor_source_available' },
        { surface_id: 'functional_harness_cases', owner: 'one-person-lab', status: 'descriptor_source_available' },
      ],
    },
  );

  runCli([
    'workspace',
    'bind',
    '--project',
    'medautoscience',
    '--path',
    repoRoot,
    '--manifest-command',
    buildManifestCommand(wrapperOnlyMas),
  ], env);

  const bundle = runCli(['agents', 'interfaces', '--domain', 'mas'], env).generated_agent_interfaces;
  assert.equal(bundle.active_caller_target_proof.status, 'blocked');
  assert.equal(bundle.active_caller_cutover_proof.status, 'blocked');
  assert.equal(
    bundle.active_caller_cutover_proof.blocked_surface_ids.includes('status_read_model'),
    true,
  );
  assert.equal(
    bundle.active_caller_cutover_proof.blocked_surface_ids.includes('workbench_drilldown'),
    true,
  );
  const statusTarget = bundle.active_caller_target_proof.surface_targets.find(
    (target: { surface_id: string }) => target.surface_id === 'status_read_model',
  );
  const workbenchTarget = bundle.active_caller_target_proof.surface_targets.find(
    (target: { surface_id: string }) => target.surface_id === 'workbench_drilldown',
  );
  assert.equal(statusTarget.proof_status, 'blocked_missing_handoff_and_active_caller_proof');
  assert.equal(workbenchTarget.proof_status, 'blocked_missing_handoff_and_active_caller_proof');
});
