import { assert, runCli, test } from '../../helpers.ts';

import { expectedModuleIds } from './shared.ts';

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
  for (const operation of ['status', 'inspect', 'interfaces', 'validate', 'doctor', 'peers']) {
    const output = runCli(['agents', 'foundry', operation]).foundry_agent_cli_spine;

    assert.equal(output.series_id, 'opl_foundry_agent_series.v1');
    assert.equal(output.series_label, 'OPL Foundry Agent');
    assert.equal(output.operation, operation);
    assert.equal(output.canonical_command_surface, 'opl agents foundry');
    assert.equal(output.status, operation === 'doctor' ? 'pass' : 'valid');
    assert.equal(output.command_surface_policy.agent_cli_uses_foundry_series_spine, true);
    assert.equal(output.command_surface_policy.agent_cli_does_not_replicate_opl_nine_brand_modules, true);
    assert.equal(output.command_surface_policy.old_implementation_buckets_are_not_ordinary_command_surfaces, true);
    assert.equal('canonical_frontdoor' in output, false);
    assert.equal('frontdoor_policy' in output, false);
    assert.equal('ordinary_frontdoor' in output, false);
    assert.deepEqual(
      output.spine.map((entry: { object: string }) => entry.object),
      ['workspace', 'work', 'stage', 'run', 'vault', 'handoff', 'connect'],
    );
    assert.deepEqual(
      output.peers.map((entry: { agent_id: string }) => entry.agent_id),
      ['mas', 'mag', 'rca', 'oma', 'opl-bookforge'],
    );
    assert.equal(output.authority_boundary.generated_surface_can_write_domain_truth, false);
    assert.equal(output.authority_boundary.generated_surface_can_create_owner_receipt, false);
    assert.equal(output.mcp_and_skill_policy.skill_pack_must_delegate_to_series_spine, true);
    assert.equal(output.mcp_and_skill_policy.mcp_descriptor_must_delegate_to_series_spine, true);
    assert.equal(output.mcp_and_skill_policy.expose_legacy_buckets_as_diagnostic_or_migration_only, true);
    assert.equal(
      output.retired_implementation_buckets.some((entry: { bucket: string }) => entry.bucket === 'skill'),
      true,
    );
  }
});

test('OPL Foundry Agent index exposes MAS MAG RCA OMA Book Forge direct and generated CLI command surfaces', () => {
  const list = runCli(['foundry', 'agents', 'list']).foundry_agents;
  assert.deepEqual(
    list.agents.map((entry: { agent_id: string }) => entry.agent_id),
    ['mas', 'mag', 'rca', 'oma', 'opl-bookforge'],
  );
  assert.deepEqual(
    list.agents.map((entry: { foundry_command_surface: string }) => entry.foundry_command_surface),
    [
      'medautosci foundry',
      'medautogrant foundry',
      'redcube foundry',
      'opl foundry agents inspect oma',
      'opl foundry agents inspect opl-bookforge',
    ],
  );
  assert.deepEqual(
    list.agents.map((entry: { cli_smoke: { executable_brand_cli_command_surface: string | null } }) =>
      entry.cli_smoke.executable_brand_cli_command_surface
    ),
    [null, null, null, null, null],
  );
  assert.deepEqual(
    list.agents.map((entry: { cli_smoke: { json_flag_aliases: string[] } }) =>
      entry.cli_smoke.json_flag_aliases
    ),
    [
      ['--json', '--format json'],
      ['--json', '--format json'],
      ['--json', '--format json'],
      ['--json'],
      ['--json'],
    ],
  );

  const mas = runCli(['foundry', 'agents', 'inspect', 'mas']).foundry_agent;
  assert.equal(mas.status, 'direct_domain_surface_ready');
  assert.equal(mas.work_object.natural_alias, 'study');
  assert.equal(mas.brand_cli, 'mas');
  assert.equal(mas.cli_smoke.executable_brand_cli_command_surface, null);
  assert.equal(mas.cli_smoke.executable_direct_cli_command_surface, 'medautosci foundry');
  assert.equal('foundry_frontdoor' in mas, false);
  assert.equal('compatibility_frontdoor' in mas, false);
  assert.equal('executable_brand_cli_frontdoor' in mas.cli_smoke, false);
  assert.equal(mas.cli_smoke.status_json_command, 'medautosci foundry status --json');
  assert.equal(mas.compatibility_command_surface, 'medautosci foundry');
  assert.equal(mas.mcp_projection.mcp_descriptor_must_delegate_to_series_spine, true);

  const mag = runCli(['foundry', 'agents', 'inspect', 'mag']).foundry_agent;
  assert.equal(mag.status, 'direct_domain_surface_ready');
  assert.equal(mag.brand_cli, 'mag');
  assert.equal(mag.foundry_command_surface, 'medautogrant foundry');
  assert.equal(mag.cli_smoke.executable_brand_cli_command_surface, null);
  assert.equal(
    mag.cli_smoke.executable_direct_cli_command_surface,
    '<med-autogrant-repo>/scripts/run-python-clean.sh -m med_autogrant.cli foundry',
  );
  assert.equal(
    mag.cli_smoke.status_json_command,
    '<med-autogrant-repo>/scripts/run-python-clean.sh -m med_autogrant.cli foundry status --json',
  );
  assert.equal(mag.cli_smoke.compatibility_status_json_command, 'medautogrant foundry status --json');

  const rca = runCli(['foundry', 'agents', 'inspect', 'rca']).foundry_agent;
  assert.equal(rca.status, 'direct_domain_surface_ready');
  assert.equal(rca.brand_cli, 'rca');
  assert.equal(rca.foundry_command_surface, 'redcube foundry');
  assert.equal(rca.cli_smoke.executable_brand_cli_command_surface, null);
  assert.equal(
    rca.cli_smoke.executable_direct_cli_command_surface,
    'npm run --prefix <redcube-ai-repo> redcube -- foundry',
  );
  assert.equal(
    rca.cli_smoke.status_json_command,
    'npm run --prefix <redcube-ai-repo> redcube -- foundry status --json',
  );
  assert.equal(rca.cli_smoke.compatibility_status_json_command, 'redcube foundry status --json');

  const oma = runCli(['foundry', 'agents', 'inspect', 'oma']).foundry_agent;
  assert.equal(oma.status, 'generated_surface_only');
  assert.equal(oma.direct_domain_cli, 'opl agents interfaces --repo-dir <opl-meta-agent-repo>');
  assert.equal(oma.foundry_command_surface, 'opl foundry agents inspect oma');
  assert.equal(oma.compatibility_command_surface, 'opl agents interfaces --repo-dir <opl-meta-agent-repo>');
  assert.equal(oma.cli_smoke.executable_brand_cli_command_surface, null);
  assert.equal(oma.direct_cli_command_surface_policy.first_screen_must_identify_series, true);

  const bookforge = runCli(['foundry', 'agents', 'inspect', 'opl-bookforge']).foundry_agent;
  assert.equal(bookforge.status, 'generated_surface_only');
  assert.equal(bookforge.work_object.natural_alias, 'book');
  assert.equal(bookforge.brand_cli, 'opl-bookforge');
  assert.equal(bookforge.direct_domain_cli, 'opl agents interfaces --repo-dir <opl-bookforge-repo>');
  assert.equal(bookforge.foundry_command_surface, 'opl foundry agents inspect opl-bookforge');
  assert.equal(bookforge.compatibility_command_surface, 'opl agents interfaces --repo-dir <opl-bookforge-repo>');
  assert.equal(bookforge.cli_smoke.status_json_command, 'opl foundry agents inspect opl-bookforge --json');
  assert.equal(bookforge.cli_smoke.executable_brand_cli_command_surface, null);
  assert.equal(bookforge.direct_cli_command_surface_policy.first_screen_must_identify_series, true);
});
