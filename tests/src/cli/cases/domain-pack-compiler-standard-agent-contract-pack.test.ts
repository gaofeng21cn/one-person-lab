import { assert, fs, os, path, runCli, test } from '../helpers.ts';

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
      version: 'family-action-catalog.v2',
      catalog_id: 'sample_brief_agent_action_catalog',
      target_domain_id: 'sample-brief-agent',
      owner: 'SampleBriefAgent',
      authority_boundary: {
        domain_truth_owner: 'SampleBriefAgent',
        opl_role: 'projection_consumer_only',
        write_policy: 'no_domain_truth_writes',
      },
      actions: [
        {
          action_id: 'draft_brief',
          title: 'Draft brief',
          summary: 'Draft a source-grounded brief.',
          owner: 'SampleBriefAgent',
          effect: 'mutating',
          execution_binding: {
            kind: 'stage_binding',
            stage_manifest_ref: 'agent/stages/manifest.json',
          },
          input_schema_ref: 'contracts/draft-brief.input.schema.json',
          output_schema_ref: 'contracts/draft-brief.output.schema.json',
          required_fields: ['workspace_root'],
          optional_fields: [],
          workspace_locator_fields: ['workspace_root'],
          human_gate_ids: ['brief_owner_review'],
          stage_route: {
            entry_stage_ref: 'brief-draft',
            required_stage_refs: ['brief-draft'],
            optional_stage_refs: [],
            terminal_stage_refs: ['brief-draft'],
            route_policy: 'ai_selected_progress_route',
          },
          supported_surfaces: {
            cli: {
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
              surface_kind: 'domain_product_entry',
            },
            openai: { tool_name: 'sample_brief_agent_draft_brief' },
            ai_sdk: { tool_name: 'sample_brief_agent_draft_brief' },
          },
          authority_boundary: {
            opl_can_write_domain_truth: false,
          },
        },
        {
          action_id: 'invoke_internal_handler',
          title: 'Invoke internal handler',
          summary: 'Route only to a domain handler target without becoming a stage action.',
          owner: 'SampleBriefAgent',
          effect: 'mutating',
          execution_binding: {
            kind: 'handler_ref',
            handler_ref: 'handler:sample.internal-handler',
          },
          input_schema_ref: 'contracts/draft-brief.input.schema.json',
          output_schema_ref: 'contracts/draft-brief.output.schema.json',
          required_fields: ['workspace_root'],
          optional_fields: [],
          workspace_locator_fields: ['workspace_root'],
          human_gate_ids: [],
          supported_surfaces: {
            cli: null,
            mcp: {
              tool_name: 'sample_brief_agent_internal_handler',
              surface_kind: 'domain_mcp_descriptor',
              descriptor_only: true,
              public_runtime: false,
            },
            skill: null,
            product_entry: {
              action_key: 'invoke_internal_handler',
              surface_kind: 'domain_handler_target_metadata',
            },
            openai: null,
            ai_sdk: null,
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
    path.join(targetDir, 'contracts', 'domain_handler_registry.json'),
    `${JSON.stringify({
      surface_kind: 'domain_handler_registry',
      version: 'domain-handler-registry.v1',
      handlers: [{
        handler_id: 'sample.internal-handler',
        binding: {
          kind: 'typescript_export',
          file: 'runtime/authority_functions/internal-handler.ts',
          export: 'invokeInternalHandler',
        },
      }],
    })}\n`,
  );
  fs.writeFileSync(
    path.join(targetDir, 'contracts', 'draft-brief.input.schema.json'),
    `${JSON.stringify({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: { workspace_root: { type: 'string' } },
      required: ['workspace_root'],
    })}\n`,
  );
  fs.writeFileSync(
    path.join(targetDir, 'contracts', 'draft-brief.output.schema.json'),
    `${JSON.stringify({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
    })}\n`,
  );
  const packRefs = [
    'agent/stages/manifest.json',
    'agent/stages/brief-draft.md',
    'agent/prompts/brief-draft.md',
    'agent/knowledge/domain.md',
    'agent/quality_gates/domain.md',
    'agent/skills/domain.md',
    'agent/tools/domain.md',
  ];
  for (const ref of packRefs.filter((entry) => entry !== 'agent/stages/manifest.json')) {
    const file = path.join(targetDir, ref);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `# ${ref}\n`);
  }
  fs.mkdirSync(path.join(targetDir, 'runtime', 'authority_functions'), { recursive: true });
  fs.writeFileSync(path.join(targetDir, 'runtime', 'authority_functions', 'README.md'), '# Authority functions\n');
  fs.writeFileSync(
    path.join(targetDir, 'runtime', 'authority_functions', 'internal-handler.ts'),
    [
      'export function invokeInternalHandler() {',
      "  return { status: 'owner_receipt_candidate' };",
      '}',
      '',
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(targetDir, 'contracts', 'owner_receipt_contract.json'),
    `${JSON.stringify({ surface_kind: 'owner_receipt_contract' })}\n`,
  );
  fs.writeFileSync(
    path.join(targetDir, 'agent', 'stages', 'manifest.json'),
    `${JSON.stringify({
      surface_kind: 'opl_standard_agent_declarative_stage_manifest',
      version: 'opl-standard-agent-declarative-stage-manifest.v1',
      target_domain_id: 'sample-brief-agent',
      owner: 'sample-brief-agent',
      authority_boundary: {
        domain_truth_owner: 'sample-brief-agent',
        opl_can_write_domain_truth: false,
        opl_can_authorize_quality_or_export: false,
      },
      stages: [{
        stage_id: 'brief-draft',
        stage_kind: 'creation',
        title: 'Brief draft',
        summary: 'Draft the brief.',
        goal: 'Draft a source-grounded brief.',
        policy_ref: 'agent/stages/brief-draft.md',
        prompt_ref: 'agent/prompts/brief-draft.md',
        knowledge_refs: ['agent/knowledge/domain.md'],
        quality_gate_refs: ['agent/quality_gates/domain.md'],
        allowed_action_refs: ['draft_brief'],
        requires: ['source_brief_ref'],
        ensures: ['draft_brief_ref_or_typed_blocker_ref'],
        next_stage_refs: [],
        trust_lane: 'codex_executor',
      }],
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
          current_surface_refs: ['cli', 'mcp', 'skill'],
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
          current_surface_refs: ['product_status', 'status_read_model', 'workbench_drilldown'],
          active_callers: ['OPL hosted workbench'],
          active_caller_status: 'opl_hosted_workbench_surface_consumes_domain_projection_refs',
          migration_action: 'declare_workbench_projection_inputs_for_opl_app_generated_shell',
          retained_domain_authority: ['status_projection_refs'],
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
        { surface_id: 'domain_handler', owner: 'one-person-lab', status: 'descriptor_source_available' },
        { surface_id: 'status_read_model', owner: 'one-person-lab', status: 'descriptor_source_available' },
        { surface_id: 'workbench_drilldown', owner: 'one-person-lab', status: 'descriptor_source_available' },
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
      canonical_agent_id: 'sample-agent',
      required_domain_pack_paths: packRefs,
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
  assert.equal(bundle.agent_id, 'sample-agent');
  assert.equal(bundle.target_domain_id, 'sample-brief-agent');
  assert.equal(bundle.domain_repo_can_own_generated_surface, false);
  assert.equal(bundle.active_caller_cutover_proof.status, 'cutover_to_opl_generated_or_domain_handler_targets');
  assert.equal(bundle.active_caller_cutover_proof.generated_blocks_ready, true);
  assert.equal(bundle.active_caller_cutover_proof.domain_handler_targets_only, true);
  assert.equal(bundle.cli.descriptors[0].action_id, 'draft_brief');
  assert.deepEqual(bundle.cli.descriptors.map((descriptor: { action_id: string }) => descriptor.action_id), ['draft_brief']);
  assert.equal(bundle.mcp.descriptors[0].descriptor_only, true);
  assert.equal(
    bundle.mcp.descriptors.some((descriptor: { name: string }) => descriptor.name === 'sample_brief_agent_internal_handler'),
    true,
  );
  assert.deepEqual(bundle.skill.descriptors.map((descriptor: { action_id: string }) => descriptor.action_id), ['draft_brief']);
  assert.deepEqual(
    bundle.openai_tool.descriptors.map((descriptor: { function: { name: string } }) => descriptor.function.name),
    ['sample_brief_agent_draft_brief'],
  );
  assert.deepEqual(
    bundle.ai_sdk.descriptors.map((descriptor: { name: string }) => descriptor.name),
    ['sample_brief_agent_draft_brief'],
  );
  assert.equal(
    bundle.product_entry.descriptors[0].command,
    `opl agents run --domain sample-brief-agent --action draft_brief --workspace ${targetDir}`,
  );
  assert.equal(
    bundle.product_entry.descriptors.some((descriptor: { action_key: string }) => descriptor.action_key === 'invoke_internal_handler'),
    true,
  );
  const handlerParity = bundle.generated_direct_parity.action_parity.find(
    (entry: { action_id: string }) => entry.action_id === 'invoke_internal_handler',
  );
  assert.deepEqual(handlerParity.expected_generated_surface_ids, ['mcp', 'product_entry']);
  assert.equal(
    handlerParity.generated_surfaces.find((entry: { surface_id: string }) => entry.surface_id === 'cli').status,
    'not_applicable',
  );
  assert.equal(bundle.domain_handler.descriptors[0].handler_ref, 'handler:sample.internal-handler');
  assert.equal(bundle.stage_routes[0].stage_id, 'brief-draft');
  assert.deepEqual(bundle.stage_routes[0].allowed_action_refs, ['draft_brief']);
  assert.deepEqual(bundle.action_stage_routes, [{
    action_id: 'draft_brief',
    entry_stage_ref: 'brief-draft',
    required_stage_refs: ['brief-draft'],
    optional_stage_refs: [],
    terminal_stage_refs: ['brief-draft'],
    route_policy: 'ai_selected_progress_route',
  }]);
  assert.equal(bundle.stage_routes[0].authority_owner, 'sample-brief-agent');
  assert.deepEqual(bundle.stage_routes[0].prompt_refs.map((entry: { ref: string }) => entry.ref), [
    'agent/prompts/brief-draft.md',
  ]);
  assert.deepEqual(bundle.stage_routes[0].skills.map((entry: { ref: string }) => entry.ref), [
    'agent/skills/domain.md',
  ]);
  assert.deepEqual(bundle.stage_routes[0].tool_refs.map((entry: { ref: string }) => entry.ref), [
    'agent/tools/domain.md',
  ]);
  assert.deepEqual(bundle.stage_routes[0].progress_delta_policy, {
    surface_kind: 'opl_stage_progress_delta_policy',
    required_fields: [
      'progress_delta_classification',
      'deliverable_progress_delta',
      'platform_repair_delta',
      'next_forced_delta',
    ],
    platform_only_is_not_deliverable_progress: true,
  });
  assert.deepEqual(bundle.stage_routes[0].typed_blocker_lineage_policy, {
    surface_kind: 'family-stall-lineage.v1',
    repeat_budget: {
      mechanism_repair_after_repeat_count: 2,
      human_gate_or_stop_loss_after_repeat_count: 3,
    },
  });
  assert.deepEqual(bundle.product_session.session_routes[0].progress_delta_policy, bundle.stage_routes[0].progress_delta_policy);
  assert.deepEqual(bundle.workbench.stage_routes[0].typed_blocker_lineage_policy, bundle.stage_routes[0].typed_blocker_lineage_policy);
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
      (contract: { contract_id: string }) => contract.contract_id === 'domain_handler_descriptor',
    ).status,
    'resolved_from_generated_surface_handoff',
  );
  assert.equal(bundle.product_status.status, 'ready_from_family_action_catalog');
  assert.equal(bundle.product_session.status, 'ready_from_session_continuity_or_stage_control_plane');
  assert.equal(bundle.domain_handler.status, 'ready');
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
    'domain_handler',
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
  const skillTarget = bundle.active_caller_target_proof.surface_targets.find(
    (target: { surface_id: string }) => target.surface_id === 'skill',
  );
  assert.equal(skillTarget.target_kind, 'opl_generated_surface');
  assert.equal(skillTarget.active_caller_module_id, 'sample_brief_generated_wrappers');
  const statusTarget = bundle.active_caller_target_proof.surface_targets.find(
    (target: { surface_id: string }) => target.surface_id === 'status_read_model',
  );
  assert.equal(statusTarget.target_kind, 'opl_generated_surface');
  assert.equal(statusTarget.active_caller_module_id, 'sample_brief_workbench_projection');
  const domainHandlerTarget = bundle.active_caller_target_proof.surface_targets.find(
    (target: { surface_id: string }) => target.surface_id === 'domain_handler',
  );
  assert.equal(domainHandlerTarget.target_kind, 'domain_handler_target');
  assert.equal(domainHandlerTarget.active_caller_module_id, 'sample_brief_domain_handler');
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
