import { assert, buildManifestCommand, createFamilyContractsFixtureRoot, fs, loadFamilyManifestFixtures, loadFrameworkContracts, os, path, repoRoot, runCli, shellSingleQuote, test } from '../helpers.ts';
import { buildFamilyAgentDescriptorList } from '../../../../src/family-domain-agent-descriptor.ts';
import {
  attachManifestSurface,
  bindFamilyManifests,
  type JsonRecord,
  withPackCompilerReadySurfaces,
} from './domain-pack-compiler-fixtures.ts';

function buildDelayedManifestCommand(payload: Record<string, unknown>, delayMs: number) {
  return `${process.execPath} -e ${
    shellSingleQuote(`setTimeout(() => process.stdout.write(process.argv[1]), ${delayMs});`)
  } ${shellSingleQuote(JSON.stringify(payload))}`;
}

test('domain pack compiler projects OPL-owned generated surfaces for admitted domain packs', () => {
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-compiler-state-'));
  const env = { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot };

  bindFamilyManifests(env);

  const list = runCli(['agents', 'pack-compiler'], env);
  assert.equal(list.domain_pack_compiler.surface_kind, 'opl_domain_pack_compiler_index');
  assert.equal(list.domain_pack_compiler.owner, 'one-person-lab');
  assert.equal(list.domain_pack_compiler.summary.total_domain_count, 3);
  assert.equal(list.domain_pack_compiler.summary.ready_domain_count, 3);
  assert.equal(list.domain_pack_compiler.summary.blocked_domain_count, 0);
  assert.equal(list.domain_pack_compiler.summary.generated_surface_count, 24);
  assert.equal(list.domain_pack_compiler.summary.generated_surface_ready_count, 24);
  assert.equal(list.domain_pack_compiler.summary.domain_generated_surface_owner_claim_count, 0);
  assert.equal(list.domain_pack_compiler.authority_boundary.opl_owns_generated_surfaces, true);
  assert.equal(list.domain_pack_compiler.authority_boundary.domain_repo_can_own_generated_surface, false);
  assert.equal(list.domain_pack_compiler.authority_boundary.opl_can_write_domain_truth, false);

  const mas = runCli(['agents', 'pack-compiler', 'inspect', '--domain', 'mas'], env);
  assert.equal(mas.domain_pack_compiler.surface_kind, 'opl_domain_pack_compiler_inspection');
  assert.equal(mas.domain_pack_compiler.compiler_status, 'ready');
  assert.deepEqual(mas.domain_pack_compiler.blocker_reasons, []);
  assert.equal(mas.domain_pack_compiler.pack_compiler_input_projection.generated_surface_owner, 'one-person-lab');
  assert.equal(mas.domain_pack_compiler.pack_compiler_input_projection.domain_repo_can_own_generated_surface, false);
  assert.equal(mas.domain_pack_compiler.generated_interface_bundle.surface_kind, 'opl_generated_agent_interface_bundle');
  assert.equal(mas.domain_pack_compiler.generated_interface_bundle.owner, 'one-person-lab');
  assert.equal(mas.domain_pack_compiler.generated_interface_bundle.domain_repo_can_own_generated_surface, false);
  assert.equal(mas.domain_pack_compiler.generated_interface_bundle.status, 'ready');
  assert.deepEqual(mas.domain_pack_compiler.generated_interface_bundle.generated_from, [
    'family_action_catalog',
    'family_stage_control_plane',
    'domain_memory_descriptor',
    'runtime_surfaces',
    'functional_privatization_audit',
    'generated_surface_handoff',
    'product_entry_manifest_descriptor',
    'sidecar_descriptor',
  ]);
  assert.equal(mas.domain_pack_compiler.generated_interface_bundle.cli.descriptors[0].command, 'MedAutoScience study_packet');
  assert.equal(mas.domain_pack_compiler.generated_interface_bundle.mcp.descriptors[0].name, 'study_packet');
  assert.equal(mas.domain_pack_compiler.generated_interface_bundle.skill.descriptors[0].command_contract_id, 'study_packet');
  assert.equal(
    mas.domain_pack_compiler.generated_interface_bundle.product_entry.descriptors[0].command,
    'MedAutoScience product study_packet',
  );
  assert.equal(
    mas.domain_pack_compiler.generated_interface_bundle.openai_tool.descriptors[0].function.name,
    'study_packet',
  );
  assert.deepEqual(
    mas.domain_pack_compiler.generated_interface_bundle.stage_routes[0],
    {
      stage_id: 'study_stage',
      allowed_action_refs: ['study_packet'],
      authority_owner: 'MedAutoScience',
    },
  );
  assert.equal(
    mas.domain_pack_compiler.generated_interface_bundle.authority_boundary.generated_interface_can_write_domain_truth,
    false,
  );
  assert.equal(
    mas.domain_pack_compiler.generated_interface_bundle.authority_boundary
      .generated_interface_can_authorize_quality_or_export,
    false,
  );
  assert.equal(
    mas.domain_pack_compiler.generated_surface_handoff.generated_surfaces.some(
      (surface: { surface_id: string; status: string }) =>
        surface.surface_id === 'sidecar_export_dispatch' && surface.status === 'ready_from_descriptor',
    ),
    true,
  );
  assert.equal(
    mas.domain_pack_compiler.pack_compiler_input_projection.minimal_authority_function_refs[0].cannot_absorb_reason,
    'OPL cannot authorize domain quality, export, or truth verdicts.',
  );
  assert.equal(mas.domain_pack_compiler.authority_boundary.opl_can_authorize_quality_or_export, false);
  assert.equal(mas.domain_pack_compiler.authority_boundary.provider_completion_is_domain_ready, false);
});

test('domain pack compiler uses an extended manifest discovery budget without changing descriptor default timeout', () => {
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-compiler-timeout-state-'));
  const env = {
    OPL_CONTRACTS_DIR: fixtureContractsRoot,
    OPL_STATE_DIR: stateRoot,
  };
  const fixtures = loadFamilyManifestFixtures();
  const slowMas = withPackCompilerReadySurfaces(fixtures.medautoscience, {
    agentId: 'mas',
    targetDomainId: 'med-autoscience',
    owner: 'MedAutoScience',
    actionId: 'study_packet',
    stageId: 'study_stage',
    memoryRefId: 'mas_publication_route_memory',
  });

  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      repoRoot,
      '--manifest-command',
      buildDelayedManifestCommand(slowMas, 500),
    ], env);

    const previousContractsDir = process.env.OPL_CONTRACTS_DIR;
    const previousStateDir = process.env.OPL_STATE_DIR;
    process.env.OPL_CONTRACTS_DIR = fixtureContractsRoot;
    process.env.OPL_STATE_DIR = stateRoot;
    const descriptors = buildFamilyAgentDescriptorList(loadFrameworkContracts(), {
      manifestCommandTimeoutMs: 100,
    });
    if (previousContractsDir === undefined) {
      delete process.env.OPL_CONTRACTS_DIR;
    } else {
      process.env.OPL_CONTRACTS_DIR = previousContractsDir;
    }
    if (previousStateDir === undefined) {
      delete process.env.OPL_STATE_DIR;
    } else {
      process.env.OPL_STATE_DIR = previousStateDir;
    }
    const masDescriptor = descriptors.family_agent_descriptors.descriptors.find(
      (descriptor: { project_id: string }) => descriptor.project_id === 'medautoscience',
    );
    assert.ok(masDescriptor);
    assert.equal(masDescriptor.manifest_status, 'command_timeout');

    const packCompiler = runCli(['agents', 'pack-compiler', 'inspect', '--domain', 'mas'], env);
    assert.equal(packCompiler.domain_pack_compiler.compiler_status, 'ready');
    assert.deepEqual(packCompiler.domain_pack_compiler.blocker_reasons, []);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('domain pack compiler blocks generated handoff when a domain still declares generic residue', () => {
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-compiler-blocked-state-'));
  const env = { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot };
  const fixtures = loadFamilyManifestFixtures();
  const blockedMas = attachManifestSurface(
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
          module_id: 'repo_owned_generic_scheduler',
          classification: 'generic_scheduler_or_daemon',
          owner: 'med-autoscience',
          code_paths: ['src/med_autoscience/controllers/supervision_scheduler.py'],
          active_callers: ['default runtime'],
          active_caller_status: 'active_default_caller',
          migration_action: 'must move scheduler owner to OPL',
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
    buildManifestCommand(blockedMas),
  ], env);

  const mas = runCli(['agents', 'pack-compiler', 'inspect', '--domain', 'mas'], env);
  assert.equal(mas.domain_pack_compiler.compiler_status, 'blocked');
  assert.equal(
    mas.domain_pack_compiler.blocker_reasons.includes(
      'functional_privatization_audit_has_generic_residue_or_blocker',
    ),
    true,
  );
  assert.equal(
    mas.domain_pack_compiler.pack_compiler_input_projection.functional_privatization_summary
      .active_private_generic_residue_count,
    1,
  );
});

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
  assert.equal(bundle.authority_boundary.generated_interface_can_write_memory_body, false);
  assert.equal(bundle.authority_boundary.generated_interface_can_mutate_artifacts, false);

  const mcpOnly = runCli(['agents', 'interfaces', '--domain', 'mas', '--format', 'mcp'], env)
    .generated_agent_interfaces;
  assert.equal(mcpOnly.selected_format, 'mcp');
  assert.equal(mcpOnly.mcp.descriptors[0].name, 'study_packet');
  assert.equal('cli' in mcpOnly, false);
  assert.equal('skill' in mcpOnly, false);
  assert.deepEqual(mcpOnly.stage_routes, []);
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

test('generated interfaces can compile a standard agent repo contract pack without private wrappers', () => {
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-generated-interface-repo-'));
  fs.mkdirSync(path.join(targetDir, 'contracts'), { recursive: true });
  fs.writeFileSync(
    path.join(targetDir, 'contracts', 'domain_descriptor.json'),
    `${JSON.stringify({
      surface_kind: 'domain_agent_descriptor',
      schema_version: 1,
      domain_id: 'sample-brief-agent',
      domain_label: 'Sample Brief Agent',
      authority_boundary: {
        opl_can_write_domain_truth: false,
        opl_can_write_memory_body: false,
        opl_can_authorize_quality_or_export: false,
      },
    })}\n`,
  );
  fs.writeFileSync(
    path.join(targetDir, 'contracts', 'action_catalog.json'),
    `${JSON.stringify({
      surface_kind: 'family_action_catalog',
      version: 'family-action-catalog.v1',
      catalog_id: 'sample_brief_agent_action_catalog',
      target_domain_id: 'sample-brief-agent',
      owner: 'SampleBriefAgent',
      authority_boundary: {
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
    })}\n`,
  );
  fs.writeFileSync(
    path.join(targetDir, 'contracts', 'stage_control_plane.json'),
    `${JSON.stringify({
      surface_kind: 'family_stage_control_plane',
      version: 'family-stage-control-plane.v1',
      plane_id: 'sample_brief_agent_stage_plane',
      target_domain_id: 'sample-brief-agent',
      owner: 'SampleBriefAgent',
      authority_boundary: {
        opl_role: 'projection_only',
      },
      stages: [
        {
          stage_id: 'brief-draft',
          stage_kind: 'creation',
          title: 'Brief draft',
          summary: 'Draft the brief.',
          goal: 'Draft a source-grounded brief.',
          owner: 'SampleBriefAgent',
          domain_stage_refs: ['brief-draft'],
          inputs: [],
          knowledge_refs: [],
          skills: [],
          prompt_refs: [],
          allowed_action_refs: ['draft_brief'],
          outputs: [],
          evaluation: [],
          handoff: null,
          source_refs: [],
          authority_boundary: {
            domain_truth_owner: 'SampleBriefAgent',
          },
        },
      ],
      notes: [],
    })}\n`,
  );
  fs.writeFileSync(
    path.join(targetDir, 'contracts', 'functional_privatization_audit.json'),
    `${JSON.stringify({
      surface_kind: 'functional_privatization_audit',
      target_domain_id: 'sample-brief-agent',
      modules: [
        {
          module_id: 'sample_brief_stage_pack',
          classification: 'declarative_pack',
          owner: 'SampleBriefAgent',
        },
        {
          module_id: 'sample_brief_generated_wrappers',
          classification: 'declarative_pack_generated_surface',
          owner: 'SampleBriefAgent',
          code_paths: [
            'agent/cli.ts',
            'agent/mcp.ts',
            'agent/product-entry.ts',
          ],
          active_callers: [
            'OPL generated CLI',
            'OPL generated MCP',
            'OPL generated Skill',
            'OPL generated product-entry',
            'OPL generated status read model',
          ],
          active_caller_status: 'domain_handlers_active_opl_generated_wrapper_metadata_consumed',
          migration_action: 'derive_wrapper_metadata_from_declarative_pack_and_opl_generated_surfaces',
          retained_domain_authority: [
            'domain_action_handler',
            'owner_receipt',
          ],
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
    })}\n`,
  );
  fs.writeFileSync(
    path.join(targetDir, 'contracts', 'generated_surface_handoff.json'),
    `${JSON.stringify({
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
          current_paths: ['agent/skill.ts'],
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
    })}\n`,
  );
  fs.writeFileSync(
    path.join(targetDir, 'contracts', 'pack_compiler_input.json'),
    `${JSON.stringify({
      surface_kind: 'opl_domain_pack_compiler_input',
      domain_id: 'sample-brief-agent',
      domain_repo_runtime_role: 'domain_handler_target_and_authority_functions',
      generated_surface_owner: 'one-person-lab',
      domain_repo_can_own_generated_surface: false,
    })}\n`,
  );

  const bundle = runCli(['agents', 'interfaces', '--repo-dir', targetDir]).generated_agent_interfaces;
  assert.equal(bundle.source_kind, 'standard_agent_repo_contracts');
  assert.equal(bundle.repo_dir, targetDir);
  assert.equal(bundle.status, 'ready');
  assert.equal(bundle.owner, 'one-person-lab');
  assert.equal(bundle.domain_repo_can_own_generated_surface, false);
  assert.equal(bundle.active_caller_cutover_proof.status, 'cutover_to_opl_generated_or_domain_handler_targets');
  assert.equal(bundle.active_caller_cutover_proof.generated_blocks_ready, true);
  assert.equal(bundle.active_caller_cutover_proof.domain_handler_targets_only, true);
  assert.equal(bundle.cli.descriptors[0].action_id, 'draft_brief');
  assert.equal(bundle.mcp.descriptors[0].descriptor_only, true);
  assert.equal(bundle.product_entry.descriptors[0].command, 'sample-brief-agent product draft --workspace-root <workspace_root>');
  assert.deepEqual(bundle.stage_routes[0], {
    stage_id: 'brief-draft',
    allowed_action_refs: ['draft_brief'],
    authority_owner: 'SampleBriefAgent',
  });
  assert.equal(bundle.source_contract_consumption.status, 'ready');
  assert.equal(
    bundle.source_contract_consumption.consumed_contracts.find(
      (contract: { contract_id: string }) => contract.contract_id === 'generated_surface_handoff',
    ).status,
    'resolved',
  );
  assert.equal(
    bundle.source_contract_consumption.consumed_contracts.find(
      (contract: { contract_id: string }) => contract.contract_id === 'product_entry_manifest_descriptor',
    ).status,
    'resolved_from_family_action_catalog',
  );
  assert.equal(
    bundle.source_contract_consumption.consumed_contracts.find(
      (contract: { contract_id: string }) => contract.contract_id === 'sidecar_descriptor',
    ).status,
    'resolved_from_generated_surface_handoff',
  );
  assert.equal(bundle.product_status.status, 'ready_from_family_action_catalog');
  assert.equal(bundle.product_session.status, 'ready_from_session_continuity_or_stage_control_plane');
  assert.equal(bundle.sidecar.status, 'ready');
  assert.equal(bundle.workbench.status, 'ready_from_stage_control_plane');
  assert.equal(bundle.generated_wrapper_bundle.surface_kind, 'opl_generated_hosted_wrapper_bundle_descriptor');
  assert.equal(bundle.generated_wrapper_bundle.owner, 'one-person-lab');
  assert.equal(bundle.generated_wrapper_bundle.generated_surface_owner, 'one-person-lab');
  assert.equal(bundle.generated_wrapper_bundle.domain_repo_can_own_generated_surface, false);
  assert.equal(bundle.generated_wrapper_bundle.domain_repo_declared_as_generated_wrapper_owner, false);
  assert.equal(bundle.generated_wrapper_bundle.status, 'ready');
  assert.deepEqual(bundle.generated_wrapper_bundle.blockers, []);
  assert.deepEqual(bundle.generated_wrapper_bundle.descriptor_scope_ids, [
    'cli',
    'mcp',
    'skill',
    'product_entry',
    'product_status',
    'product_session',
    'sidecar',
    'workbench',
  ]);
  assert.equal(
    bundle.generated_wrapper_bundle.descriptor_scope.every(
      (scope: { owner: string; domain_repo_can_own_generated_surface: boolean; blockers: string[] }) =>
        scope.owner === 'one-person-lab'
        && scope.domain_repo_can_own_generated_surface === false
        && scope.blockers.length === 0,
    ),
    true,
  );
  assert.equal(bundle.active_caller_target_proof.status, 'ready');
  assert.equal(bundle.active_caller_target_proof.blocked_target_count, 0);
  const cliTarget = bundle.active_caller_target_proof.surface_targets.find(
    (target: { surface_id: string }) => target.surface_id === 'cli',
  );
  assert.equal(cliTarget.target_kind, 'opl_generated_surface');
  assert.equal(cliTarget.active_caller_module_id, 'sample_brief_generated_wrappers');
  const sidecarTarget = bundle.active_caller_target_proof.surface_targets.find(
    (target: { surface_id: string }) => target.surface_id === 'sidecar_export_dispatch',
  );
  assert.equal(sidecarTarget.target_kind, 'opl_generated_surface');
  assert.equal(sidecarTarget.active_caller_module_id, 'sample_brief_sidecar_adapter');
  const workbenchTarget = bundle.active_caller_target_proof.surface_targets.find(
    (target: { surface_id: string }) => target.surface_id === 'workbench_drilldown',
  );
  assert.equal(workbenchTarget.target_kind, 'opl_hosted_surface');
  assert.equal(workbenchTarget.active_caller_module_id, 'sample_brief_workbench_projection');
  assert.equal(bundle.authority_boundary.generated_interface_can_write_domain_truth, false);
  assert.equal(bundle.authority_boundary.generated_interface_can_mutate_artifacts, false);
  assert.equal(
    bundle.active_caller_target_proof.authority_boundary.opl_can_generate_domain_handler,
    false,
  );
  assert.equal(
    bundle.active_caller_target_proof.authority_boundary.domain_handler_target_allowed,
    true,
  );
});

test('generated interfaces expose RCA wrapper descriptor scope from real repo contracts when present', {
  skip: !fs.existsSync('/Users/gaofeng/workspace/redcube-ai/contracts/domain_descriptor.json'),
}, () => {
  const bundle = runCli([
    'agents',
    'interfaces',
    '--repo-dir',
    '/Users/gaofeng/workspace/redcube-ai',
  ]).generated_agent_interfaces;

  assert.equal(bundle.source_kind, 'standard_agent_repo_contracts');
  assert.equal(bundle.target_domain_id, 'redcube_ai');
  assert.equal(bundle.status, 'ready');
  assert.equal(bundle.blocker_reasons.length, 0);
  assert.equal(bundle.generated_wrapper_bundle.status, 'ready');
  assert.equal(bundle.generated_wrapper_bundle.owner, 'one-person-lab');
  assert.equal(bundle.generated_wrapper_bundle.generated_surface_owner, 'one-person-lab');
  assert.equal(bundle.generated_wrapper_bundle.domain_repo_can_own_generated_surface, false);
  assert.equal(bundle.generated_wrapper_bundle.domain_repo_declared_as_generated_wrapper_owner, false);
  assert.deepEqual(bundle.generated_wrapper_bundle.blockers, []);
  assert.deepEqual(bundle.generated_wrapper_bundle.descriptor_scope_ids, [
    'cli',
    'mcp',
    'skill',
    'product_entry',
    'product_status',
    'product_session',
    'sidecar',
    'workbench',
  ]);
  assert.equal(
    bundle.generated_wrapper_bundle.descriptor_scope.every(
      (scope: {
        owner: string;
        status: string;
        domain_repo_can_own_generated_surface: boolean;
        domain_repo_role: string;
        blockers: string[];
      }) =>
        scope.owner === 'one-person-lab'
        && scope.status === 'ready'
        && scope.domain_repo_can_own_generated_surface === false
        && scope.domain_repo_role === 'domain_handler_target_or_refs_only_adapter'
        && scope.blockers.length === 0,
    ),
    true,
  );
  assert.equal(
    bundle.generated_wrapper_bundle.authority_boundary
      .generated_wrapper_routes_to_domain_handler_or_refs_only_adapter,
    true,
  );
  assert.equal(bundle.generated_wrapper_bundle.claims_live_soak_complete, false);
  assert.equal(bundle.generated_wrapper_bundle.claims_artifact_producing_owner_receipt, false);
});
