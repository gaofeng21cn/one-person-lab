import { assert, fs, path, repoRoot, runCli, test } from '../helpers.ts';
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
