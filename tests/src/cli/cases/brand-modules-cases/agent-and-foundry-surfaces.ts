import { assert, runCli, runCliFailure, test } from '../../helpers.ts';

import { canonicalOwnerId } from '../../../../../src/kernel/owner-id.ts';
import { expectedModuleIds } from './shared.ts';

const expectedStandardDomainAgentIds = ['mas', 'mag', 'rca', 'oma', 'obf'];
const expectedStandardAgentIds = expectedStandardDomainAgentIds;

const allowedFoundryAgentListFields = [
  'agent_id',
  'brand_cli',
  'brand_cli_path_safe_executable',
  'canonical_series_command_surface',
  'cli_smoke',
  'connect_command_surfaces',
  'default_foundry_command_surface',
  'domain_alias',
  'domain_id',
  'foundry_command_surface',
  'foundry_operations',
  'label',
  'mcp_projection',
  'ordinary_golden_path',
  'ordinary_spine',
  'series',
  'series_id',
  'series_membership',
  'work_alias',
  'work_object',
] as const;

const allowedFoundryAgentInspectFields = [
  ...allowedFoundryAgentListFields,
  'authority_boundary',
  'command_surface_policy',
  'developer_mode_target_hint',
  'feedback_self_evolution_trigger',
  'opl_base_domain_authority',
  'owner_answer_shape',
  'series_contract_ref',
  'stage_profile',
  'standard_agent_registry_ref',
  'status',
  'surface_kind',
] as const;

const allowedFoundryCliSmokeFields = [
  'executable_brand_cli_command_surface',
  'help_smoke_commands',
  'json_flag_aliases',
  'status_json_command',
] as const;

const forbiddenRuntimeMcpReadinessFields = [
  'unified_mcp_server_ready',
  'unified_mcp_server_readiness',
  'runtime_server_ready',
  'runtime_server_readiness',
  'runtime_server_url',
  'runtime_server_command',
] as const;

function assertOnlyAllowedFoundryProjectionFields(
  agent: Record<string, unknown>,
  allowedFields: readonly string[],
) {
  assert.deepEqual(Object.keys(agent).sort(), [...allowedFields].sort());
  const cliSmoke = agent.cli_smoke as Record<string, unknown>;
  assert.deepEqual(Object.keys(cliSmoke).sort(), [...allowedFoundryCliSmokeFields].sort());
}

function assertNoRuntimeMcpReadinessClaim(surface: Record<string, unknown>) {
  for (const field of forbiddenRuntimeMcpReadinessFields) {
    assert.equal(field in surface, false);
  }
}

test('agent-owned internal modules expose the same branding spine without becoming OPL platform modules', () => {
  const list = runCli(['agents', 'modules', 'list']).agent_internal_modules;

  assert.equal(list.surface_kind, 'opl_agent_internal_brand_module_list');
  assert.deepEqual(list.domain_ids, expectedStandardDomainAgentIds);
  assert.deepEqual(list.platform_module_ids, expectedModuleIds);
  assert.deepEqual(list.agent_module_ids, expectedModuleIds.map((moduleId) => `agent-${moduleId}`));
  assert.equal(list.domain_count, 5);
  assert.equal(list.module_count_per_domain, 10);
  assert.equal(list.canonical_command_surface, 'opl agents modules');
  assert.equal(list.authority_boundary.can_write_domain_truth, false);
  assert.equal(list.authority_boundary.can_replace_domain_owner, false);

  const inspect = runCli([
    'agents',
    'modules',
    'inspect',
    '--domain',
    'oma',
    '--module',
    'agent-runway',
  ]).agent_internal_module;

  assert.equal(inspect.surface_kind, 'opl_agent_internal_brand_module_inspect');
  assert.equal(inspect.domain_id, 'oma');
  assert.equal(inspect.agent_module_id, 'agent-runway');
  assert.equal(inspect.platform_analogue_module_id, 'runway');
  assert.equal(inspect.canonical_command_surface, 'opl agents modules');
  assert.equal(inspect.module_command_surface, 'opl agents modules inspect --domain oma --module agent-runway');
  assert.equal(inspect.authority_boundary.can_write_domain_truth, false);
  assert.equal(inspect.authority_boundary.can_claim_production_ready, false);

  const aliasInspect = runCli([
    'agents',
    'modules',
    'inspect',
    '--domain',
    'medautoscience',
    '--module',
    'agent-runway',
  ]).agent_internal_module;
  assert.equal(aliasInspect.domain_id, 'mas');
  assert.equal(aliasInspect.module_command_surface, 'opl agents modules inspect --domain mas --module agent-runway');

  const interfaces = runCli(['agents', 'modules', 'interfaces']).agent_internal_module_interfaces;
  assert.equal(interfaces.surface_kind, 'opl_agent_internal_brand_module_interfaces');
  assert.equal(interfaces.cli.commands.includes('opl agents modules validate --json'), true);
  assert.equal(interfaces.descriptor.refs.includes('contracts/opl-framework/brand-cli-governance.json#agent_internal_modules'), true);
  assert.equal(interfaces.authority_boundary.can_write_domain_truth, false);

  const validation = runCli(['agents', 'modules', 'validate']).agent_internal_module_validation;
  assert.equal(validation.surface_kind, 'opl_agent_internal_brand_module_validation');
  assert.equal(validation.status, 'valid');
  assert.deepEqual(validation.domain_ids, expectedStandardDomainAgentIds);
  assert.deepEqual(validation.missing_domain_module_sets, []);

  const doctor = runCli(['agents', 'modules', 'doctor']).agent_internal_module_doctor;
  assert.equal(doctor.surface_kind, 'opl_agent_internal_brand_module_doctor');
  assert.equal(doctor.status, 'pass');
});

test('Foundry Agent series exposes a shared CLI spine instead of copying OPL brand modules into each agent', () => {
  for (const operation of ['status', 'inspect', 'interfaces', 'validate', 'doctor', 'peers']) {
    const output = runCli(['agents', 'foundry', operation]).foundry_agent_cli_spine;

    assert.equal(output.series_id, 'opl_foundry_agent_series.v1');
    assert.equal(output.series_label, 'OPL Foundry Agent');
    assert.equal(output.standard_agent_registry.source_ref, 'src/kernel/standard-agent-registry.ts');
    assert.deepEqual(output.standard_agent_registry.agent_ids, expectedStandardAgentIds);
    assert.equal(output.refs.standard_agent_registry_ref, 'src/kernel/standard-agent-registry.ts');
    assert.equal(output.refs.policy_release_ref, 'contracts/opl-framework/foundry-agent-series-policy-release.json');
    assert.equal(output.operation, operation);
    assert.equal(output.canonical_command_surface, 'opl agents foundry');
    assert.equal(output.status, operation === 'doctor' ? 'pass' : 'valid');
    assert.equal(output.command_surface_policy.agent_cli_uses_foundry_series_spine, true);
    assert.equal(output.command_surface_policy.agent_cli_does_not_replicate_opl_nine_brand_modules, true);
    assert.equal(
      output.command_surface_policy.non_standard_implementation_buckets_are_not_ordinary_command_surfaces,
      true,
    );
    assert.equal('canonical_frontdoor' in output, false);
    assert.equal('frontdoor_policy' in output, false);
    assert.equal('ordinary_frontdoor' in output, false);
    assert.deepEqual(
      output.spine.map((entry: { object: string }) => entry.object),
      ['workspace', 'work', 'stage', 'run', 'ledger', 'handoff', 'connect'],
    );
    assert.deepEqual(
      output.peers.map((entry: { agent_id: string }) => entry.agent_id),
      expectedStandardAgentIds,
    );
    assert.deepEqual(
      output.peers.map((entry: { series_membership: string }) => entry.series_membership),
      expectedStandardAgentIds.map(() => 'standard_domain_agent'),
    );
    for (const peer of output.peers) {
      assert.deepEqual(Object.keys(peer).sort(), [
        'agent_id',
        'brand_cli',
        'domain_alias',
        'domain_id',
        'label',
        'ordinary_golden_path',
        'series_membership',
        'work_alias',
      ]);
    }
    assert.equal(output.authority_boundary.generated_surface_can_write_domain_truth, false);
    assert.equal(output.authority_boundary.generated_surface_can_create_owner_receipt, false);
    assert.equal(output.mcp_and_skill_policy.skill_pack_must_delegate_to_series_spine, true);
    assert.equal(output.mcp_and_skill_policy.mcp_descriptor_must_delegate_to_series_spine, true);
    assert.equal(output.mcp_and_skill_policy.standard_agent_standalone_mcp_default_enabled, false);
    assert.equal(output.mcp_and_skill_policy.standard_agent_plugin_manifest_must_not_expose_mcp_servers, true);
    assert.equal(output.mcp_and_skill_policy.unified_mcp_projection_owner, 'one-person-lab');
    assert.equal(output.mcp_and_skill_policy.future_unified_mcp_server_strategy, 'opl_owned_unified_server_when_runtime_verified');
    assert.equal(output.mcp_and_skill_policy.all_cli_commands_are_mcp_tools, false);
    assert.equal(output.mcp_and_skill_policy.progressive_discovery_required_for_large_catalogs, true);
    assert.equal(output.mcp_and_skill_policy.toolset_filtering_required_for_broad_surfaces, true);
    assert.equal('expose_legacy_buckets_as_diagnostic_or_migration_only' in output.mcp_and_skill_policy, false);
    assertNoRuntimeMcpReadinessClaim(output.mcp_and_skill_policy);
    assert.equal('non_standard_implementation_buckets' in output, false);
  }
});

test('OPL Foundry Agent index exposes all standard agents as one standard series', () => {
  const list = runCli(['foundry', 'agents', 'list']).foundry_agents;

  assert.deepEqual(
    list.agents.map((entry: { agent_id: string }) => entry.agent_id),
    expectedStandardAgentIds,
  );
  assert.deepEqual(
    list.agents.map((entry: { series_membership: string }) => entry.series_membership),
    expectedStandardAgentIds.map(() => 'standard_domain_agent'),
  );
  assert.deepEqual(
    list.agents.map((entry: { foundry_command_surface: string }) => entry.foundry_command_surface),
    expectedStandardAgentIds.map((agentId) => `opl foundry agents inspect ${agentId}`),
  );
  assert.deepEqual(
    list.agents.map((entry: { canonical_series_command_surface: string }) => entry.canonical_series_command_surface),
    expectedStandardAgentIds.map(() => 'opl agents foundry'),
  );
  assert.deepEqual(
    list.agents.map((entry: { cli_smoke: { executable_brand_cli_command_surface: string | null } }) =>
      entry.cli_smoke.executable_brand_cli_command_surface
    ),
    expectedStandardAgentIds.map(() => null),
  );
  assert.deepEqual(
    list.agents.map((entry: { cli_smoke: { json_flag_aliases: string[] } }) =>
      entry.cli_smoke.json_flag_aliases
    ),
    expectedStandardAgentIds.map(() => ['--json']),
  );
  for (const agent of list.agents) {
    assertOnlyAllowedFoundryProjectionFields(agent, allowedFoundryAgentListFields);
  }

  const expectedTriggerFields = [
    'accepted_feedback_profile',
    'adapter_kind',
    'authority_boundary',
    'contract_can_trigger_execution',
    'default_oma_skill_ref',
    'developer_mode_execution_gate_refs',
    'feedback_capture_requires_developer_mode',
    'feedbackops_event_kind',
    'external_suite_ref',
    'idempotency_key',
    'oma_evolution_skill_ref',
    'owner_closeout_readback_refs',
    'policy_id',
    'policy_ref',
    'repo_fix_execution_requires_opl_developer_mode',
    'required_trigger_fields',
    'status_projection_ref',
    'surface_kind',
    'target_agent_id',
    'target_domain_id',
    'trigger_chain',
  ];
  const expectedDeveloperModeTargetHintFields = [
    'execution_surfaces',
    'repo_permission_selector',
    'route_builder_surface',
    'route_hints',
    'surface_kind',
    'target_agent_id',
    'target_domain_id',
    'target_kind',
    'target_series_membership',
  ];
  function assertSelfEvolutionTrigger(agent: Record<string, any>, expectedAdapterKind: string) {
    const trigger = agent.feedback_self_evolution_trigger;
    assert.deepEqual(Object.keys(trigger).sort(), expectedTriggerFields.sort());
    assert.equal(trigger.surface_kind, 'opl_foundry_agent_feedback_self_evolution_trigger');
    assert.equal(trigger.policy_id, 'standard_agent_feedback_self_evolution_trigger.v1');
    assert.equal(trigger.target_agent_id, agent.agent_id);
    assert.equal(trigger.target_domain_id, agent.domain_id);
    assert.equal(trigger.adapter_kind, expectedAdapterKind);
    assert.equal(trigger.feedbackops_event_kind, 'target_agent_feedback_external_suite');
    assert.equal(trigger.accepted_feedback_profile, 'target_agent_feedback_external_suite');
    assert.equal(trigger.feedback_capture_requires_developer_mode, false);
    assert.equal(trigger.repo_fix_execution_requires_opl_developer_mode, true);
    assert.equal(trigger.contract_can_trigger_execution, false);
    assert.equal(trigger.default_oma_skill_ref, 'opl-meta-agent:oma-agent-evolution');
    assert.equal(trigger.oma_evolution_skill_ref, 'opl-meta-agent:oma-agent-evolution');
    assert.equal(trigger.status_projection_ref, 'contracts/opl-framework/agent-lab-contract.json#domain_feedback_self_evolution_surface');
    assert.deepEqual(trigger.idempotency_key, {
      owner: expectedAdapterKind,
      derivation: 'target_agent_id + external_suite_ref + feedback_fingerprint',
      required: true,
    });
    assert.deepEqual(trigger.external_suite_ref, {
      owner: expectedAdapterKind,
      profile: 'target_agent_feedback_external_suite',
      required: true,
    });
    assert.deepEqual(trigger.owner_closeout_readback_refs, [
      'developer_mode_projection_ref',
      'route_eligibility_ref',
      'diff_ref',
      'verification_refs',
      'no_forbidden_write_ref',
      'target_owner_acceptance_or_typed_blocker_ref',
    ]);
    assert.deepEqual(trigger.developer_mode_execution_gate_refs, [
      'opl-developer-mode:repo-fix-execution',
      'opl-developer-mode:direct-fix-or-fork-pr-route',
    ]);
    assert.equal(trigger.authority_boundary.can_execute_repo_patch_without_developer_mode, false);
    assert.equal(trigger.authority_boundary.can_write_domain_truth, false);
  }
  function assertDeveloperModeTargetHint(agent: Record<string, any>, expectedTargetKind: string) {
    const hint = agent.developer_mode_target_hint;
    assert.deepEqual(Object.keys(hint).sort(), expectedDeveloperModeTargetHintFields.sort());
    assert.equal(hint.surface_kind, 'opl_foundry_agent_developer_mode_target_hint');
    assert.equal(hint.target_agent_id, agent.agent_id);
    assert.equal(hint.target_domain_id, agent.domain_id);
    assert.equal(hint.target_series_membership, agent.series_membership);
    assert.equal(hint.target_kind, expectedTargetKind);
    assert.equal(hint.repo_permission_selector.match_policy, 'target_id_then_repo_then_repo_url');
    assert.equal(hint.route_hints.manual_enable_without_target_repo_write_routes_to, 'fork_pull_request');
    assert.deepEqual(hint.route_hints.direct_write_identity_levels, ['opl_maintainer', 'target_agent_developer']);
    assert.equal(hint.execution_surfaces.direct_repo_fix, 'opl work-order execute');
    assert.equal(hint.execution_surfaces.fork_pull_request, 'owner_or_fork_pull_request_route');
    assert.equal(hint.route_builder_surface, 'opl_agent_lab_developer_mode_dynamic_repair_route');
  }

  const mas = runCli(['foundry', 'agents', 'inspect', 'mas']).foundry_agent;
  assert.equal(mas.status, 'standard_domain_agent');
  assert.equal(mas.standard_agent_registry_ref, 'src/kernel/standard-agent-registry.ts');
  assert.equal(mas.series_membership, 'standard_domain_agent');
  assert.equal(mas.work_object.natural_alias, 'study');
  assert.equal(mas.brand_cli, 'mas');
  assert.equal(mas.cli_smoke.executable_brand_cli_command_surface, null);
  assert.equal(mas.foundry_command_surface, 'opl foundry agents inspect mas');
  assertOnlyAllowedFoundryProjectionFields(mas, allowedFoundryAgentInspectFields);
  assert.equal('foundry_frontdoor' in mas, false);
  assert.equal('compatibility_frontdoor' in mas, false);
  assert.equal('executable_brand_cli_frontdoor' in mas.cli_smoke, false);
  assert.equal(mas.cli_smoke.status_json_command, 'opl foundry agents inspect mas --json');
  assert.equal(mas.mcp_projection.mcp_descriptor_must_delegate_to_series_spine, true);
  assert.equal(mas.mcp_projection.standard_agent_standalone_mcp_default_enabled, false);
  assert.equal(mas.mcp_projection.all_cli_commands_are_mcp_tools, false);
  assertSelfEvolutionTrigger(mas, 'domain_thin_feedback_adapter');
  assertDeveloperModeTargetHint(mas, 'domain_module');

  const masAlias = runCli(['foundry', 'agents', 'inspect', 'med-autoscience']).foundry_agent;
  assert.equal(masAlias.agent_id, 'mas');
  assert.equal(masAlias.status, 'standard_domain_agent');

  const mag = runCli(['foundry', 'agents', 'inspect', 'mag']).foundry_agent;
  assert.equal(mag.status, 'standard_domain_agent');
  assert.equal(mag.series_membership, 'standard_domain_agent');
  assert.equal(mag.brand_cli, 'mag');
  assert.equal(mag.foundry_command_surface, 'opl foundry agents inspect mag');
  assertOnlyAllowedFoundryProjectionFields(mag, allowedFoundryAgentInspectFields);
  assert.equal(mag.cli_smoke.executable_brand_cli_command_surface, null);
  assert.equal(
    mag.cli_smoke.status_json_command,
    'opl foundry agents inspect mag --json',
  );
  assertSelfEvolutionTrigger(mag, 'domain_thin_feedback_adapter');
  assertDeveloperModeTargetHint(mag, 'domain_module');

  const rca = runCli(['foundry', 'agents', 'inspect', 'rca']).foundry_agent;
  assert.equal(rca.status, 'standard_domain_agent');
  assert.equal(rca.series_membership, 'standard_domain_agent');
  assert.equal(rca.brand_cli, 'rca');
  assert.equal(rca.foundry_command_surface, 'opl foundry agents inspect rca');
  assertOnlyAllowedFoundryProjectionFields(rca, allowedFoundryAgentInspectFields);
  assert.equal(rca.cli_smoke.executable_brand_cli_command_surface, null);
  assert.equal(
    rca.cli_smoke.status_json_command,
    'opl foundry agents inspect rca --json',
  );
  assertSelfEvolutionTrigger(rca, 'domain_thin_feedback_adapter');
  assertDeveloperModeTargetHint(rca, 'domain_module');

  const oma = runCli(['foundry', 'agents', 'inspect', 'oma']).foundry_agent;
  assert.equal(oma.status, 'standard_domain_agent');
  assert.equal(oma.series_membership, 'standard_domain_agent');
  assert.equal(oma.foundry_command_surface, 'opl foundry agents inspect oma');
  assertOnlyAllowedFoundryProjectionFields(oma, allowedFoundryAgentInspectFields);
  assert.equal(oma.cli_smoke.executable_brand_cli_command_surface, null);
  assert.equal(oma.command_surface_policy.first_screen_must_identify_series, true);
  assertSelfEvolutionTrigger(oma, 'domain_thin_feedback_adapter');
  assertDeveloperModeTargetHint(oma, 'domain_module');

  const bookforge = runCli(['foundry', 'agents', 'inspect', 'obf']).foundry_agent;
  assert.equal(bookforge.status, 'standard_domain_agent');
  assert.equal(bookforge.agent_id, 'obf');
  assert.equal(bookforge.standard_agent_registry_ref, 'src/kernel/standard-agent-registry.ts');
  assert.equal(bookforge.series_membership, 'standard_domain_agent');
  assert.equal(bookforge.work_object.natural_alias, 'book');
  assert.equal(bookforge.brand_cli, 'obf');
  assert.equal(bookforge.foundry_command_surface, 'opl foundry agents inspect obf');
  assertOnlyAllowedFoundryProjectionFields(bookforge, allowedFoundryAgentInspectFields);
  assert.equal(bookforge.cli_smoke.status_json_command, 'opl foundry agents inspect obf --json');
  assert.equal(bookforge.cli_smoke.executable_brand_cli_command_surface, null);
  assert.equal(bookforge.command_surface_policy.first_screen_must_identify_series, true);
  assertSelfEvolutionTrigger(bookforge, 'domain_thin_feedback_adapter');
  assertDeveloperModeTargetHint(bookforge, 'domain_module');

  const bookforgeAlias = runCli(['foundry', 'agents', 'inspect', 'bookforge']).foundry_agent;
  assert.equal(bookforgeAlias.agent_id, 'obf');
  assert.equal(bookforgeAlias.status, 'standard_domain_agent');

  const bookforgeRepoAlias = runCli(['foundry', 'agents', 'inspect', 'opl-bookforge']).foundry_agent;
  assert.equal(bookforgeRepoAlias.agent_id, 'obf');
  assert.equal(bookforgeRepoAlias.foundry_command_surface, 'opl foundry agents inspect obf');

  const scholarSkillsFailure = runCliFailure(['foundry', 'agents', 'inspect', 'mas-scholar-skills']);
  assert.equal(scholarSkillsFailure.status, 2);
  assert.equal(scholarSkillsFailure.payload.error.code, 'cli_usage_error');
  assert.match(scholarSkillsFailure.payload.error.message, /Unknown Foundry Agent id/);
});

test('standard owner aliases normalize to the repo owner ids used by evidence surfaces', () => {
  assert.equal(canonicalOwnerId('mas'), 'med-autoscience');
  assert.equal(canonicalOwnerId('mag'), 'med-autogrant');
  assert.equal(canonicalOwnerId('rca'), 'redcube-ai');
  assert.equal(canonicalOwnerId('oma'), 'opl-meta-agent');
  assert.equal(canonicalOwnerId('opl_meta_agent'), 'opl-meta-agent');
  assert.equal(canonicalOwnerId('obf'), 'opl-bookforge');
  assert.equal(canonicalOwnerId('opl_bookforge'), 'opl-bookforge');
});
