import { assert, fs, path, repoRoot, runCli, runCliFailure, test } from '../helpers.ts';
import { FrameworkContractError } from '../../../../src/modules/charter/contracts.ts';
import type { CommandSpec } from '../../../../src/entrypoints/cli/modules/support.ts';
import { validateCommandRegistryCoverage } from '../../../../src/entrypoints/cli/modules/command-registry.ts';

test('connect pubmed search exposes registry metadata in command help', () => {
  const help = runCli(['help', 'connect', 'pubmed', 'search']).help;
  const contract = JSON.parse( // reuse-first: allow contract fixture parser
    fs.readFileSync(
    path.join(repoRoot, 'contracts', 'opl-framework', 'cli-command-registry.json'),
    'utf8',
    ),
  );

  assert.equal(help.registry.command_id, 'connect pubmed search');
  assert.equal(contract.commands.connect_pubmed_search.command_id, help.registry.command_id);
  assert.equal(help.registry.parser_adapter, 'node_util_parse_args');
  assert.equal(contract.commands.connect_pubmed_search.parser_adapter, help.registry.parser_adapter);
  assert.deepEqual(help.registry.options.map((option: { name: string }) => option.name), ['query', 'limit']);
  assert.equal(
    help.registry.json_output_schema_ref,
    'contracts/opl-framework/cli-command-registry.json#/commands/connect_pubmed_search/output_schema',
  );
  assert.equal(contract.commands.connect_pubmed_search.output_schema.properties.version.const, 'g2');
  assert.equal(help.registry.authority_boundary.can_write_domain_truth, false);
  assert.equal(help.registry.authority_boundary.can_create_owner_receipt, false);
  assert.equal(help.registry.authority_boundary.can_claim_domain_ready, false);
  assert.equal(help.registry.authority_boundary.can_claim_production_ready, false);
});

test('connect module actions expose registry metadata in command help', () => {
  const contract = JSON.parse( // reuse-first: allow contract fixture parser
    fs.readFileSync(
    path.join(repoRoot, 'contracts', 'opl-framework', 'cli-command-registry.json'),
    'utf8',
    ),
  );

  for (const action of ['install', 'update', 'reinstall', 'remove']) {
    const help = runCli(['help', 'connect', action]).help;
    const contractCommand = contract.commands[`connect_${action}`];

    assert.equal(help.registry.command_id, `connect ${action}`);
    assert.equal(contractCommand.command_id, help.registry.command_id);
    assert.equal(help.registry.parser_adapter, 'node_util_parse_args');
    assert.equal(contractCommand.parser_adapter, help.registry.parser_adapter);
    assert.deepEqual(help.registry.options.map((option: { name: string }) => option.name), ['module']);
    assert.equal(
      help.registry.json_output_schema_ref,
      `contracts/opl-framework/cli-command-registry.json#/commands/connect_${action}/output_schema`,
    );
    assert.equal(contractCommand.output_schema.properties.module_action.properties.action.const, action);
    assert.equal(help.registry.authority_boundary.can_write_domain_truth, false);
    assert.equal(help.registry.authority_boundary.can_create_owner_receipt, false);
    assert.equal(help.registry.authority_boundary.can_claim_domain_ready, false);
    assert.equal(help.registry.authority_boundary.can_claim_production_ready, false);
  }
});

test('status commands expose registry metadata in command help', () => {
  const contract = JSON.parse( // reuse-first: allow contract fixture parser
    fs.readFileSync(
    path.join(repoRoot, 'contracts', 'opl-framework', 'cli-command-registry.json'),
    'utf8',
    ),
  );

  const expected = [
    {
      command: 'status workspace',
      contractKey: 'status_workspace',
      owner: 'OPL Console',
      options: ['path'],
    },
    {
      command: 'status runtime',
      contractKey: 'status_runtime',
      owner: 'OPL Runway',
      options: ['limit'],
    },
    {
      command: 'status dashboard',
      contractKey: 'status_dashboard',
      owner: 'OPL Console',
      options: ['path', 'sessions-limit'],
    },
  ];

  assert.equal(contract.protected_command_prefixes.includes('status'), true);
  for (const command of expected.map((entry) => entry.command)) {
    assert.equal(contract.required_command_ids.includes(command), true);
  }

  for (const entry of expected) {
    const help = runCli(['help', ...entry.command.split(' ')]).help;
    const contractCommand = contract.commands[entry.contractKey];

    assert.equal(help.registry.command_id, entry.command);
    assert.equal(contractCommand.command_id, help.registry.command_id);
    assert.equal(help.registry.parser_adapter, 'node_util_parse_args');
    assert.equal(contractCommand.parser_adapter, help.registry.parser_adapter);
    assert.equal(help.registry.authority_boundary.owner, entry.owner);
    assert.deepEqual(
      help.registry.options.map((option: { name: string }) => option.name),
      entry.options,
    );
    assert.equal(
      help.registry.json_output_schema_ref,
      `contracts/opl-framework/cli-command-registry.json#/commands/${entry.contractKey}/output_schema`,
    );
    assert.equal(help.registry.authority_boundary.can_write_domain_truth, false);
    assert.equal(help.registry.authority_boundary.can_create_owner_receipt, false);
    assert.equal(help.registry.authority_boundary.can_claim_domain_ready, false);
    assert.equal(help.registry.authority_boundary.can_claim_production_ready, false);
  }
});

test('status command options are parsed through the registry adapter', () => {
  assert.equal(runCli(['status', 'workspace', '--path', repoRoot]).workspace.requested_path, repoRoot);
  assert.equal(runCli(['status', 'runtime', '--limit', '1']).runtime_status.managed_session_ledger.entries.length, 1);
  assert.equal(runCli(['status', 'dashboard', '--path', repoRoot, '--sessions-limit', '1']).dashboard.workspace.requested_path, repoRoot);

  const invalid = runCliFailure(['status', 'runtime', '--limit', '0']);
  assert.equal(invalid.payload.error.code, 'cli_usage_error');
  assert.match(invalid.payload.error.message, /must be an integer from 1 to 500/);
});

test('protected command prefixes cannot bypass registry metadata', () => {
  const specs: Record<string, CommandSpec> = {
    'connect pubmed search': {
      usage: 'opl connect pubmed search --query <query>',
      summary: 'Search PubMed.',
      examples: ['opl connect pubmed search --query diabetes'],
      handler: () => ({}),
    },
  };

  assert.throws(
    () => validateCommandRegistryCoverage(specs, {
      protectedCommandPrefixes: ['connect pubmed'],
      requiredCommandIds: ['connect pubmed search'],
    }),
    (error) => {
      assert.equal(error instanceof FrameworkContractError, true);
      assert.equal((error as FrameworkContractError).code, 'contract_shape_invalid');
      assert.equal((error as FrameworkContractError).details?.command, 'connect pubmed search');
      return true;
    },
  );
});
