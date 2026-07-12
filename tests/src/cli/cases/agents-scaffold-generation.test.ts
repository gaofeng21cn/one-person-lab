import { validateJsonSchemaPayload } from '../../../../src/kernel/schema-registry.ts';
import { compileStandardAgentStageManifest } from '../../../../src/modules/pack/index.ts';
import { assert, fs, os, parseJsonText, path, repoRoot, runCli, test } from '../helpers.ts';

function readJsonFile<T = any>(filePath: string): T {
  return parseJsonText(fs.readFileSync(filePath, 'utf8')) as T;
}

function assertFilesExist(root: string, paths: string[]) {
  for (const relativePath of paths) assert.equal(fs.existsSync(path.join(root, relativePath)), true, relativePath);
}

function assertIncludesAll(values: unknown[], expected: unknown[]) {
  for (const value of expected) assert.ok(values.includes(value), String(value));
}

test('agents scaffold generates and validates a standard domain-agent skeleton', () => {
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

    assert.equal(generated.state, 'scaffold_generated');
    assert.equal(generated.mode, 'generate');
    assert.equal(generated.generation_policy.creates_files, true);
    assert.equal(generated.write_summary.written_count, generated.template_files.length);
    assert.equal(generated.scaffold_consumption_refs.status, 'generated_scaffold_pending_validation');
    assert.equal(generated.scaffold_consumption_refs.authority_boundary.scaffold_validation_can_claim_domain_ready, false);
    assertFilesExist(targetDir, [
      'contracts/domain_descriptor.json',
      'contracts/foundry_agent_series.json',
      'contracts/pack_compiler_input.json',
      'contracts/generated_surface_handoff.json',
      'contracts/domain-intake.input.schema.json',
      'contracts/domain-intake.output.schema.json',
      'contracts/standard-agent-principles-adoption.json',
      'contracts/capability_map.json',
      'contracts/functional_privatization_audit.json',
      'contracts/private_functional_surface_policy.json',
      'contracts/workspace_lifecycle_policy.json',
      'contracts/stage_artifact_kernel_adoption.json',
      'agent/principles/opl-standard-agent-principles.md',
      'agent/stages/domain_intake.md',
      'agent/prompts/domain_intake.md',
      'agent/skills/domain_execution.md',
      'agent/knowledge/domain_boundary.md',
      'agent/quality_gates/domain_acceptance.md',
      'runtime/authority_functions/README.md',
      'runtime/native_helpers/README.md',
    ]);
    assert.equal(fs.existsSync(path.join(targetDir, 'runtime/sidecar/README.md')), false);
    assert.equal(fs.existsSync(path.join(targetDir, 'contracts/state_index_kernel_adoption.json')), false);

    const stageArtifactAdoption = readJsonFile(
      path.join(targetDir, 'contracts/stage_artifact_kernel_adoption.json'),
    );
    assert.equal(stageArtifactAdoption.opl_state_index_kernel_adoption.owner, 'one-person-lab');
    assert.equal(stageArtifactAdoption.opl_state_index_kernel_adoption.consumer, 'award-foundry');
    assert.equal(stageArtifactAdoption.opl_state_index_kernel_adoption.sqlite_enabled_now, false);

    const descriptor = readJsonFile(path.join(targetDir, 'contracts/domain_descriptor.json'));
    assert.equal(descriptor.domain_id, 'award-foundry');
    assert.equal(descriptor.standard_contract_refs.foundry_agent_series, 'contracts/foundry_agent_series.json');
    assert.equal(descriptor.standard_contract_refs.capability_map, 'contracts/capability_map.json');
    assert.equal(descriptor.standard_contract_refs.stage_manifest, 'agent/stages/manifest.json');
    assert.equal(descriptor.standard_contract_refs.stage_control_plane, 'opl-generated:family_stage_control_plane');
    assert.equal(descriptor.authority_boundary.opl_can_write_domain_truth, false);

    const foundryAgentSeries = readJsonFile(path.join(targetDir, 'contracts/foundry_agent_series.json'));
    assert.equal(foundryAgentSeries.surface_kind, 'opl_foundry_agent_series_consumer');
    assert.equal(foundryAgentSeries.version, 'foundry-agent-series-consumer.v1');
    assert.equal(foundryAgentSeries.canonical_policy_export, 'opl-framework/foundry-agent-series-policy');
    assert.equal(foundryAgentSeries.domain_id, 'award-foundry');
    assert.equal(foundryAgentSeries.stage_manifest_ref, 'agent/stages/manifest.json');
    assert.equal(foundryAgentSeries.stage_control_plane_ref, 'opl-generated:family_stage_control_plane');
    assert.equal(foundryAgentSeries.shared_policy_release.domain_adapter_must_not_copy_policy_body_as_authority, true);
    assert.match(foundryAgentSeries.shared_policy_release.policy_bundle_fingerprint, /^sha256:[0-9a-f]{64}$/);
    assert.equal(Object.hasOwn(foundryAgentSeries, 'series_design_profile'), false);
    assert.equal(Object.hasOwn(foundryAgentSeries, 'workspace_topology_profile'), false);

    const packCompilerInput = readJsonFile(path.join(targetDir, 'contracts/pack_compiler_input.json'));
    assert.equal(packCompilerInput.surface_kind, 'opl_domain_pack_compiler_input');
    assert.equal(packCompilerInput.generated_surface_owner, 'one-person-lab');
    assert.deepEqual(packCompilerInput.implementation_profile, {
      profile_id: 'opl.standard_domain_agent.v1',
      agent_identity: 'declarative_standard_agent_pack',
      pack_formats: ['markdown', 'json'],
      helpers: {
        optional: true,
        entries: [],
        language_is_identity: false,
        rust_policy: 'framework_hot_path_only',
      },
      generated_surfaces_owner: 'one-person-lab',
    });
    assert.equal(packCompilerInput.domain_pack_owner, 'award-foundry');
    assertIncludesAll(
      packCompilerInput.standard_agent_pack_abi.required_repo_layout.map((entry: { path: string }) => entry.path),
      ['agent/', 'contracts/', 'runtime/authority_functions/'],
    );
    assertIncludesAll(Object.keys(packCompilerInput.source_refs), [
      'stage_graph_source_ref',
      'owner_receipt_schema_source_ref',
      'generated_surface_handoff_source_ref',
      'capability_map_source_ref',
    ]);
    assert.equal(
      Object.hasOwn(packCompilerInput.source_refs, 'functional_privatization_audit_source_ref'),
      false,
    );
    assert.equal(Object.hasOwn(packCompilerInput.source_refs, 'functional_audit'), false);

    assert.equal(fs.existsSync(path.join(targetDir, 'contracts/stage_control_plane.json')), false);
    const stageControlPlane = compileStandardAgentStageManifest(targetDir).stage_control_plane;
    const stage = stageControlPlane.stages[0] as any;
    assert.equal(stageControlPlane.surface_kind, 'family_stage_control_plane');
    assert.equal(stage.stage_pack_conformance_version, 'standard-stage-pack.v2');
    assert.equal(stage.selected_executor.executor_kind, 'codex_cli');
    assert.equal(stage.authority_boundary.provider_completion_is_domain_completion, false);
    assertIncludesAll(stage.stage_contract.requires, [
      'user_intent_ref',
      'domain_authority_owner_ref',
      'stage-completion-policy-ref:award-foundry/domain_intake',
    ]);
    assertIncludesAll(stage.stage_contract.user_stage_log_contract.required_domain_semantic_fields, [
      'problem_summary',
      'stage_work_done',
      'changed_stage_surfaces',
    ]);
    assert.equal(stage.stage_contract.progress_delta_policy.platform_only_is_not_deliverable_progress, true);
    assert.equal(stage.stage_contract.typed_blocker_lineage_policy.surface_kind, 'family-stall-lineage.v1');
    assert.equal(
      runCli(['agents', 'interfaces', '--repo-dir', targetDir]).generated_agent_interfaces.status,
      'ready',
    );
    const outputSchema = readJsonFile(path.join(targetDir, 'contracts/domain-intake.output.schema.json'));
    const outputSchemaEntry = {
      schemaId: 'opl.standard_agent_scaffold.domain_intake_output.v1',
      schema: outputSchema,
      sourceRef: 'contracts/domain-intake.output.schema.json',
    };
    assert.equal(validateJsonSchemaPayload(outputSchemaEntry, {}).ok, false);
    assert.equal(validateJsonSchemaPayload(outputSchemaEntry, { owner_receipt_ref: 'receipt://owner' }).ok, true);
    assert.equal(validateJsonSchemaPayload(outputSchemaEntry, { typed_blocker_ref: 'blocker://typed' }).ok, true);
    assert.equal(validateJsonSchemaPayload(outputSchemaEntry, {
      owner_receipt_ref: 'receipt://owner',
      typed_blocker_ref: 'blocker://typed',
    }).ok, false);
    assert.equal(validateJsonSchemaPayload(outputSchemaEntry, {
      owner_receipt_ref: '',
      typed_blocker_ref: 'blocker://typed',
    }).ok, false);
    assert.equal(validateJsonSchemaPayload(outputSchemaEntry, {
      owner_receipt_ref: 'receipt://owner',
      typed_blocker_ref: '',
    }).ok, false);

    const capabilityMap = readJsonFile(path.join(targetDir, 'contracts/capability_map.json'));
    const capabilityMapSchema = readJsonFile(path.join(repoRoot, 'contracts/opl-framework/standard-agent-capability-map.schema.json'));
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
      ['stage_prompt', 'professional_skill', 'tool_connector', 'knowledge_pack', 'quality_gate', 'eval_suite'],
    );
    assert.equal(capabilityMap.authority_boundary.can_write_domain_truth, false);
    assert.equal(capabilityMap.authority_boundary.can_sign_owner_receipt, false);
    for (const capability of capabilityMap.capabilities) {
      assert.equal(capability.canonical_target_paths.length > 0, true);
      assert.equal(capability.owner_closeout_boundary.can_create_typed_blocker, false);
    }

    assert.equal(readJsonFile(path.join(targetDir, 'contracts/generated_surface_handoff.json')).domain_repo_can_own_generated_surface, false);
    assert.equal(readJsonFile(path.join(targetDir, 'contracts/functional_privatization_audit.json')).authority_boundary.domain_can_claim_generic_runtime_owner, false);
    assert.ok(
      readJsonFile(path.join(targetDir, 'contracts/private_functional_surface_policy.json'))
        .forbidden_private_surface_classes.includes('generic_cli_mcp_product_wrapper'),
    );
    assert.equal(
      readJsonFile(path.join(targetDir, 'contracts/workspace_lifecycle_policy.json'))
        .authority_boundary.policy_can_claim_domain_ready_or_artifact_authority,
      false,
    );
    assert.equal(
      readJsonFile(path.join(targetDir, 'contracts/standard-agent-principles-adoption.json'))
        .authority_boundary.adoption_can_claim_domain_ready,
      false,
    );

    const validated = runCli(['agents', 'scaffold', '--validate', targetDir]).standard_domain_agent_scaffold;
    assert.equal(validated.mode, 'validate');
    assert.equal(validated.state, 'validated');
    assert.equal(validated.validation.status, 'passed');
    assert.equal(validated.validation.agent_pack_validation.semantic_listed_path_count, 9);
    assert.deepEqual(validated.validation.user_stage_log_validation.blockers, []);
    assert.deepEqual(validated.validation.foundry_agent_series_validation.blockers, []);
    assert.deepEqual(validated.validation.stage_pack_v2_validation.blockers, []);
    assert.equal(validated.validation.capability_map_validation.status, 'passed');
    assert.deepEqual(validated.validation.blockers, []);
  } finally {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
});
