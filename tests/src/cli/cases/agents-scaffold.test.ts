import { assert, fs, path, repoRoot, runCli, test } from '../helpers.ts';
import { parseAgentsScaffoldArgs } from '../../../../src/entrypoints/cli/cases/private-command-specs-parts/agents-scaffold.ts';
import { WORKSPACE_TOPOLOGY_PROFILE_CONTRACT } from '../../../../src/modules/workspace/workspace-topology.ts';

function assertIncludesAll(values: unknown[], expected: unknown[]) {
  for (const value of expected) assert.ok(values.includes(value), String(value));
}

function readSkeletonContract() {
  return JSON.parse(
    fs.readFileSync(
      path.join(repoRoot, 'contracts', 'opl-framework', 'standard-domain-agent-skeleton-contract.json'),
      'utf8',
    ),
  );
}

test('agents scaffold uses standard option parsing without changing command semantics', () => {
  const spec = { usage: 'opl agents scaffold', examples: ['opl agents scaffold'] };
  assert.equal(
    parseAgentsScaffoldArgs(['--target-dir', '  ./agent  '], spec).targetDir,
    '  ./agent  ',
  );
  assert.throws(() => parseAgentsScaffoldArgs(['--unknown'], spec));
  assert.throws(() => parseAgentsScaffoldArgs(['positional'], spec));
  assert.throws(() => parseAgentsScaffoldArgs(['--target-dir'], spec));
  assert.throws(
    () => parseAgentsScaffoldArgs(['--validate', ''], spec),
    /requires a non-empty value/,
  );
  assert.throws(() => parseAgentsScaffoldArgs(['--validate', '.', '--force'], spec));
});

test('agents scaffold exposes the reusable agent scaffold contract without domain authority', () => {
  const scaffold = runCli(['agents', 'scaffold']).standard_domain_agent_scaffold;

  assert.equal(scaffold.surface_kind, 'opl_standard_domain_agent_scaffold');
  assert.equal(scaffold.owner, 'one-person-lab');
  assert.equal(scaffold.state, 'scaffold_contract_available');
  assert.equal(scaffold.generation_policy.scaffold_command_is_read_only, true);
  assert.equal(scaffold.generation_policy.creates_files, false);
  assert.equal(scaffold.generation_policy.write_requires_explicit_target_dir, true);
  assert.equal(scaffold.generation_policy.scaffold_role, 'physical_skeleton_and_lower_bound_guardrail');
  assert.equal(scaffold.generation_policy.scaffold_is_agent_design_template_source, false);
  assert.equal(
    scaffold.generation_policy.scaffold_shape_source_ref,
    'contracts/opl-framework/standard-domain-agent-skeleton-contract.json',
  );
  assert.equal('template_source_of_truth' in scaffold.generation_policy, false);
  assert.equal(scaffold.design_source_boundary.scaffold_is_agent_design_template_source, false);
  assert.equal(scaffold.design_source_boundary.scaffold_can_cap_target_agent_design_ceiling, false);
  assert.equal(scaffold.design_source_boundary.profile_catalog_is_lower_bound_guardrail, true);
  assert.deepEqual(scaffold.repo_source_boundary.required_dirs, ['agent', 'contracts', 'runtime', 'docs']);
  assert.deepEqual(scaffold.repo_source_boundary.forbidden_dirs, ['artifacts']);
  assert.equal(scaffold.repo_source_boundary.runtime_artifacts_live_in_source_repo, false);
  assertIncludesAll(
    scaffold.opl_owned_generic_primitives.map((primitive: { primitive_id: string }) => primitive.primitive_id),
    [
      'provider_slo_and_wakeup_transport',
      'stage_attempt_projection_ledger',
      'pack_compiler_generated_surface',
      'functional_privatization_audit_read_model',
    ],
  );
  assertIncludesAll(scaffold.declarative_domain_pack, ['stage_descriptors', 'owner_receipt_schema']);
  assertIncludesAll(scaffold.minimal_authority_functions, [
    'quality_or_export_verdict_authorizer',
    'memory_accept_reject_decider',
  ]);
  assert.equal(scaffold.pack_compiler_contract.generated_surface_owner, 'one-person-lab');
  assertIncludesAll(
    scaffold.opl_generated_surfaces.map((surface: { surface_id: string }) => surface.surface_id),
    ['cli', 'mcp', 'status_read_model'],
  );
  assert.equal(scaffold.default_runtime_policy.default_runtime_path, 'opl_temporal_hosted_autonomous');
  assert.equal(scaffold.default_runtime_policy.domain_agent_internal_daemon_allowed, false);
  assert.equal(scaffold.default_runtime_policy.required_user_stage_log.platform_only_is_not_deliverable_progress, true);
  assertIncludesAll(scaffold.required_contract_surfaces, [
    'user_stage_log_contract',
    'progress_delta_policy',
    'typed_blocker_lineage_policy',
    'foundry_agent_series_contract',
    'functional_privatization_audit',
    'workspace_lifecycle_policy',
    'state_index_kernel_adoption',
  ]);
  assertIncludesAll(scaffold.required_verification, [
    'user_stage_log_semantics_or_typed_blocker',
    'functional_privatization_audit_no_generic_owner',
    'workspace_file_lifecycle_policy_declared',
    'state_index_kernel_adoption_declared',
  ]);
  assert.equal(scaffold.user_stage_log_contract.authority_boundary.opl_can_infer_domain_semantics, false);
  assert.deepEqual(scaffold.progress_delta_policy.required_fields, [
    'progress_delta_classification',
    'deliverable_progress_delta',
    'platform_repair_delta',
    'next_forced_delta',
  ]);
  assert.equal(scaffold.typed_blocker_lineage_policy.surface_kind, 'family-stall-lineage.v1');
  assert.equal(scaffold.stage_operating_principles_policy.default_read_surface.root, 'current_owner_delta');

  const series = scaffold.foundry_agent_series_contract;
  assert.equal(series.surface_kind, 'opl_foundry_agent_series_contract');
  assert.equal(series.contract_version_policy.current_version, 'foundry-agent-series.v1');
  assert.equal(series.agent_membership_projection_policy.default_membership, 'standard_domain_agent');
  assert.equal(series.primary_skill_carrier_projection_policy.canonical_primary_skill_path, 'agent/primary_skill/SKILL.md');
  assert.deepEqual(series.workspace_topology_profile, WORKSPACE_TOPOLOGY_PROFILE_CONTRACT);
  assert.equal(series.shared_policy_release.domain_adapter_must_not_copy_policy_body_as_authority, true);
  assert.equal(series.app_projection_policy.app_consumes_shared_progress_projection_only, true);

  const privatePolicy = scaffold.private_functional_surface_admission_policy;
  assert.equal(privatePolicy.default_posture, 'forbidden_until_classified_and_receipted');
  assert.ok(privatePolicy.default_review_view.attention_required.includes('tombstone_has_active_caller'));
  assert.ok(privatePolicy.forbidden_private_surface_classes.includes('generic_persistence_or_sqlite_lifecycle_engine'));
  assert.ok(privatePolicy.required_evidence_before_retaining_private_surface.includes('cannot_absorb_reason_or_retirement_gate'));
  assert.equal(privatePolicy.taxonomy_layers.private_platform_residue_inventory.private_surface, true);
  assert.equal(privatePolicy.taxonomy_layers.authority_function_inventory.abi.forbidden_outputs.includes('queue_or_attempt_ledger_mutation'), true);

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

test('standard agent skeleton contract keeps scaffold as physical guardrail, not design source', () => {
  const scaffold = readSkeletonContract().new_agent_scaffold;

  assert.equal(scaffold.generation_policy.scaffold_role, 'physical_skeleton_and_lower_bound_guardrail');
  assert.equal(scaffold.generation_policy.scaffold_is_agent_design_template_source, false);
  assert.equal(
    scaffold.generation_policy.scaffold_shape_source_ref,
    'contracts/opl-framework/standard-domain-agent-skeleton-contract.json',
  );
  assert.equal('template_source_of_truth' in scaffold.generation_policy, false);
  assert.equal(scaffold.design_source_boundary.scaffold_is_agent_design_template_source, false);
  assert.equal(scaffold.design_source_boundary.scaffold_can_cap_target_agent_design_ceiling, false);
  assert.equal(scaffold.design_source_boundary.profile_catalog_is_lower_bound_guardrail, true);
  assert.equal(scaffold.design_source_boundary.reference_design_sources_remain_design_source, true);
  assert.equal(
    scaffold.design_source_boundary.source_derived_design_consumption_refs_required_for_reference_backed_agents,
    true,
  );
});
