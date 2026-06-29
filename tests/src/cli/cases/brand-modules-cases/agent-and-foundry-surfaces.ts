import { assert, runCli, test } from '../../helpers.ts';

import { expectedModuleIds } from './shared.ts';

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
  'series_contract_ref',
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
  assert.deepEqual(list.platform_module_ids, expectedModuleIds);
  assert.deepEqual(list.agent_module_ids, expectedModuleIds.map((moduleId) => `agent-${moduleId}`));
  assert.equal(list.domain_count, 3);
  assert.equal(list.module_count_per_domain, 10);
  assert.equal(list.canonical_command_surface, 'opl agents modules');
  assert.equal(list.authority_boundary.can_write_domain_truth, false);
  assert.equal(list.authority_boundary.can_replace_domain_owner, false);

  const inspect = runCli([
    'agents',
    'modules',
    'inspect',
    '--domain',
    'medautoscience',
    '--module',
    'agent-runway',
  ]).agent_internal_module;

  assert.equal(inspect.surface_kind, 'opl_agent_internal_brand_module_inspect');
  assert.equal(inspect.domain_id, 'medautoscience');
  assert.equal(inspect.agent_module_id, 'agent-runway');
  assert.equal(inspect.platform_analogue_module_id, 'runway');
  assert.equal(inspect.canonical_command_surface, 'opl agents modules');
  assert.equal(inspect.module_command_surface, 'opl agents modules inspect --domain medautoscience --module agent-runway');
  assert.equal(inspect.authority_boundary.can_write_domain_truth, false);
  assert.equal(inspect.authority_boundary.can_claim_production_ready, false);

  const interfaces = runCli(['agents', 'modules', 'interfaces']).agent_internal_module_interfaces;
  assert.equal(interfaces.surface_kind, 'opl_agent_internal_brand_module_interfaces');
  assert.equal(interfaces.cli.commands.includes('opl agents modules validate --json'), true);
  assert.equal(interfaces.descriptor.refs.includes('contracts/opl-framework/brand-cli-governance.json#agent_internal_modules'), true);
  assert.equal(interfaces.authority_boundary.can_write_domain_truth, false);

  const validation = runCli(['agents', 'modules', 'validate']).agent_internal_module_validation;
  assert.equal(validation.surface_kind, 'opl_agent_internal_brand_module_validation');
  assert.equal(validation.status, 'valid');
  assert.deepEqual(validation.missing_domain_module_sets, []);

  const doctor = runCli(['agents', 'modules', 'doctor']).agent_internal_module_doctor;
  assert.equal(doctor.surface_kind, 'opl_agent_internal_brand_module_doctor');
  assert.equal(doctor.status, 'pass');
});

test('Foundry Agent series exposes a shared CLI spine instead of copying OPL brand modules into each agent', () => {
  const expectedStandardAgentIds = ['mas', 'mag', 'rca', 'oma', 'opl-bookforge', 'opl-scholarskills'];

  for (const operation of ['status', 'inspect', 'interfaces', 'validate', 'doctor', 'peers']) {
    const output = runCli(['agents', 'foundry', operation]).foundry_agent_cli_spine;

    assert.equal(output.series_id, 'opl_foundry_agent_series.v1');
    assert.equal(output.series_label, 'OPL Foundry Agent');
    assert.equal(output.standard_agent_registry.source_ref, 'src/standard-agent-registry.ts');
    assert.deepEqual(output.standard_agent_registry.agent_ids, expectedStandardAgentIds);
    assert.equal(output.refs.standard_agent_registry_ref, 'src/standard-agent-registry.ts');
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
      ['workspace', 'work', 'stage', 'run', 'vault', 'handoff', 'connect'],
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
  const expectedStandardAgentIds = ['mas', 'mag', 'rca', 'oma', 'opl-bookforge', 'opl-scholarskills'];

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

  const mas = runCli(['foundry', 'agents', 'inspect', 'mas']).foundry_agent;
  assert.equal(mas.status, 'standard_domain_agent');
  assert.equal(mas.standard_agent_registry_ref, 'src/standard-agent-registry.ts');
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

  const oma = runCli(['foundry', 'agents', 'inspect', 'oma']).foundry_agent;
  assert.equal(oma.status, 'standard_domain_agent');
  assert.equal(oma.series_membership, 'standard_domain_agent');
  assert.equal(oma.foundry_command_surface, 'opl foundry agents inspect oma');
  assertOnlyAllowedFoundryProjectionFields(oma, allowedFoundryAgentInspectFields);
  assert.equal(oma.cli_smoke.executable_brand_cli_command_surface, null);
  assert.equal(oma.command_surface_policy.first_screen_must_identify_series, true);

  const bookforge = runCli(['foundry', 'agents', 'inspect', 'opl-bookforge']).foundry_agent;
  assert.equal(bookforge.status, 'standard_domain_agent');
  assert.equal(bookforge.standard_agent_registry_ref, 'src/standard-agent-registry.ts');
  assert.equal(bookforge.series_membership, 'standard_domain_agent');
  assert.equal(bookforge.work_object.natural_alias, 'book');
  assert.equal(bookforge.brand_cli, 'opl-bookforge');
  assert.equal(bookforge.foundry_command_surface, 'opl foundry agents inspect opl-bookforge');
  assertOnlyAllowedFoundryProjectionFields(bookforge, allowedFoundryAgentInspectFields);
  assert.equal(bookforge.cli_smoke.status_json_command, 'opl foundry agents inspect opl-bookforge --json');
  assert.equal(bookforge.cli_smoke.executable_brand_cli_command_surface, null);
  assert.equal(bookforge.command_surface_policy.first_screen_must_identify_series, true);

  const bookforgeAlias = runCli(['foundry', 'agents', 'inspect', 'bookforge']).foundry_agent;
  assert.equal(bookforgeAlias.agent_id, 'opl-bookforge');
  assert.equal(bookforgeAlias.status, 'standard_domain_agent');
});
