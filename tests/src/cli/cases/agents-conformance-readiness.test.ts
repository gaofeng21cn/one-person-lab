import { assert, runCli, test } from '../helpers.ts';
import { buildReadyAgentRepo } from './agents-conformance-fixtures.ts';

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
  assert.equal(readiness.detail_level, 'summary');
  assert.equal(
    readiness.projection_detail_policy,
    'attention_first_kernel_floor_default_with_embedded_compatibility_drilldowns',
  );
  assert.equal(readiness.readiness_model.mode, 'ai_first_contract_light');
  assert.equal(readiness.readiness_model.default_payload, 'operator_attention_summary');
  assert.equal(readiness.readiness_model.ai_executor_internal_strategy_is_contract, false);
  assert.equal(readiness.status, 'passed_with_production_evidence_tail');
  assert.equal(readiness.attention_first_payload.surface_kind, 'opl_agent_readiness_attention_first_payload');
  assert.equal(readiness.attention_first_payload.summary.blocker_count, 0);
  assert.equal(readiness.attention_first_payload.summary.warning_count, 1);
  assert.equal(readiness.attention_first_payload.summary.production_evidence_tail_count, 2);
  assert.deepEqual(
    readiness.attention_first_payload.diagnostic_drilldown_refs,
    [
      '/agent_readiness/conformance_report',
      '/agent_readiness/production_evidence_tail_ledger',
      '/agent_readiness/gates/pack_compiler',
    ],
  );
  assert.match(readiness.attention_first_payload.claim_policy, /emits_no_domain_quality_artifact_or_production_ready/);
  assert.equal(readiness.kernel_floor.policy, 'minimum_structural_boundary_and_evidence_floor_only');
  assert.equal(readiness.kernel_floor.ai_executor_strategy_contract, false);
  assert.equal(readiness.kernel_floor.production_evidence_tail_can_block_structural_conformance, false);
  assert.equal(readiness.kernel_floor.contract_floor_can_claim_domain_or_quality_ready, false);
  assert.equal(readiness.diagnostic_drilldowns.every((lens: { role: string; default_surface: boolean }) => (
    lens.role === 'diagnostic_drilldown' && lens.default_surface === false
  )), true);
  assert.deepEqual(readiness.excluded_ready_verdicts, [
    'domain_ready_verdict',
    'quality_verdict',
    'artifact_authority_verdict',
    'production_ready_verdict',
  ]);
  assert.equal(Object.hasOwn(readiness, 'domain_ready_verdict'), false);
  assert.equal(Object.hasOwn(readiness, 'quality_verdict'), false);
  assert.equal(Object.hasOwn(readiness, 'artifact_authority_verdict'), false);
  assert.equal(Object.hasOwn(readiness, 'production_ready_verdict'), false);
  assert.equal(readiness.summary.structural_conformance_status, 'passed');
  assert.equal(readiness.summary.conformance_passed_count, 1);
  assert.equal(readiness.summary.conformance_blocked_count, 0);
  assert.equal(readiness.summary.pack_compiler_blocked_domain_count, 0);
  assert.equal(readiness.summary.generated_interface_blocked_count, 0);
  assert.equal(readiness.summary.generated_default_entry_source_of_work_blocked_count, 0);
  assert.equal(readiness.summary.domain_generated_surface_owner_claim_count, 0);
  assert.equal(readiness.summary.platform_surface_ownership_blocked_count, 0);
  assert.equal(readiness.summary.explicit_forbidden_platform_owner_claim_count, 0);
  assert.equal(readiness.summary.agent_readiness_production_evidence_tail_count, 2);
  assert.deepEqual(
    Object.keys(readiness.summary).filter((key) => key.startsWith('production_evidence_tail_')),
    [],
  );
  assert.equal(
    readiness.summary.agent_readiness_production_evidence_tail_policy,
    'reported_separately_not_a_structural_pass_condition',
  );
  assert.equal(Object.hasOwn(readiness.summary, 'deprecated_alias_metadata'), false);
  assert.equal(Object.hasOwn(readiness.summary, 'production_or_domain_ready'), false);

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
  assert.equal(readiness.gates.generated_default_entry_source_of_work.status, 'passed');
  assert.equal(
    readiness.gates.generated_default_entry_source_of_work.policy,
    'cli_mcp_openai_ai_sdk_skill_app_status_workbench_are_generated_from_one_action_stage_lineage',
  );
  assert.equal(readiness.generated_default_entry_source_of_work.status, 'passed');
  assert.equal(readiness.generated_default_entry_source_of_work.blocked_domain_count, 0);
  assert.deepEqual(readiness.generated_default_entry_source_of_work.required_default_entry_surface_ids, [
    'cli',
    'mcp',
    'openai_tool',
    'ai_sdk',
    'skill_plugin',
    'app_action',
    'status_read_model',
    'workbench',
  ]);
  assert.equal(readiness.generated_default_entry_source_of_work.domain_repo_can_own_default_entry, false);
  assert.equal(readiness.generated_default_entry_source_of_work.descriptor_pass_can_claim_domain_ready, false);
  assert.equal(readiness.gates.platform_surface_ownership.status, 'passed');
  assert.equal(
    readiness.gates.platform_surface_ownership.policy,
    'opl_owns_generic_platform_surfaces_domain_repos_keep_authority_refs_only',
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
  assert.equal(readiness.authority_boundary.expert_judgment_priority, 'ai_native_expert_judgment_first');
  assert.equal(
    readiness.authority_boundary.contract_floor_policy,
    'contracts_preserve_minimum_safety_audit_recovery_floor_only',
  );
  assert.equal(readiness.authority_boundary.structural_gates_are_contract_floor_only, true);
  assert.equal(readiness.authority_boundary.readiness_can_claim_domain_ready, false);
  assert.equal(readiness.authority_boundary.readiness_can_claim_artifact_authority, false);
  assert.equal(readiness.authority_boundary.readiness_can_claim_production_ready, false);
  assert.equal(readiness.authority_boundary.mechanical_signals_can_claim_quality_verdict, false);
  assert.equal(readiness.authority_boundary.contract_completeness_is_quality_verdict, false);
});
