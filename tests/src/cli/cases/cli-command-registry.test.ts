import { assert, fs, os, parseJsonText, path, repoRoot, runCli, runCliFailure, test } from '../helpers.ts';
import { FrameworkContractError } from '../../../../src/modules/charter/contracts.ts';
import type { CommandSpec } from '../../../../src/entrypoints/cli/modules/support.ts';
import { validateCommandRegistryCoverage } from '../../../../src/entrypoints/cli/modules/command-registry.ts';

type CliCommandRegistryContract = {
  protected_command_prefixes: string[];
  required_command_ids: string[];
  commands: Record<string, any>;
};

function loadCliCommandRegistryContract() {
  return parseJsonText(
    fs.readFileSync(
      path.join(repoRoot, 'contracts', 'opl-framework', 'cli-command-registry.json'),
      'utf8',
    ),
  ) as CliCommandRegistryContract;
}

test('connect pubmed search exposes registry metadata in command help', () => {
  const help = runCli(['help', 'connect', 'pubmed', 'search']).help;
  const contract = loadCliCommandRegistryContract();

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

test('connect scientific search exposes registry metadata in command help', () => {
  const help = runCli(['help', 'connect', 'scientific', 'search']).help;
  const contract = loadCliCommandRegistryContract();

  assert.equal(help.registry.command_id, 'connect scientific search');
  assert.equal(contract.commands.connect_scientific_search.command_id, help.registry.command_id);
  assert.equal(help.registry.parser_adapter, 'node_util_parse_args');
  assert.equal(contract.commands.connect_scientific_search.parser_adapter, help.registry.parser_adapter);
  assert.deepEqual(help.registry.options.map((option: { name: string }) => option.name), ['provider', 'query', 'limit']);
  assert.equal(
    help.registry.json_output_schema_ref,
    'contracts/opl-framework/cli-command-registry.json#/commands/connect_scientific_search/output_schema',
  );
  assert.equal(contract.commands.connect_scientific_search.output_schema.properties.version.const, 'g2');
  assert.equal(help.registry.authority_boundary.can_write_domain_truth, false);
  assert.equal(help.registry.authority_boundary.can_create_owner_receipt, false);
  assert.equal(help.registry.authority_boundary.can_claim_domain_ready, false);
  assert.equal(help.registry.authority_boundary.can_claim_production_ready, false);
});

test('connect references verify exposes registry metadata in command help', () => {
  const help = runCli(['help', 'connect', 'references', 'verify']).help;
  const contract = loadCliCommandRegistryContract();

  assert.equal(help.registry.command_id, 'connect references verify');
  assert.equal(contract.commands.connect_references_verify.command_id, help.registry.command_id);
  assert.equal(help.registry.parser_adapter, 'node_util_parse_args');
  assert.equal(contract.commands.connect_references_verify.parser_adapter, help.registry.parser_adapter);
  assert.deepEqual(help.registry.options.map((option: { name: string }) => option.name), [
    'references-file',
    'providers',
    'cache-root',
    'max-retries',
  ]);
  assert.equal(
    help.registry.json_output_schema_ref,
    'contracts/opl-framework/cli-command-registry.json#/commands/connect_references_verify/output_schema',
  );
  assert.equal(contract.commands.connect_references_verify.output_schema.properties.version.const, 'g2');
  assert.equal(help.registry.authority_boundary.can_write_domain_truth, false);
  assert.equal(help.registry.authority_boundary.can_create_owner_receipt, false);
  assert.equal(help.registry.authority_boundary.can_claim_domain_ready, false);
  assert.equal(help.registry.authority_boundary.can_claim_production_ready, false);
});

test('connect module actions expose registry metadata in command help', () => {
  const contract = loadCliCommandRegistryContract();

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
  const contract = loadCliCommandRegistryContract();

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
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-status-registry-'));

  try {
    fs.writeFileSync(
      path.join(stateRoot, 'session-ledger.json'),
      `${JSON.stringify({
        version: 'g2',
        entries: [
          {
            ledger_id: 'ledger-newer',
            recorded_at: '2026-07-03T00:00:01.000Z',
            session_id: 'session-newer',
            mode: 'resume',
            source_surface: 'test_fixture',
            domain_id: null,
            workstream_id: null,
            goal_preview: null,
            workspace_locator: null,
            resource_sample: { status: 'unavailable', reason: 'test fixture' },
          },
          {
            ledger_id: 'ledger-older',
            recorded_at: '2026-07-03T00:00:00.000Z',
            session_id: 'session-older',
            mode: 'start',
            source_surface: 'test_fixture',
            domain_id: null,
            workstream_id: null,
            goal_preview: null,
            workspace_locator: null,
            resource_sample: { status: 'unavailable', reason: 'test fixture' },
          },
        ],
      }, null, 2)}\n`,
    );
    const env = { OPL_STATE_DIR: stateRoot };

    assert.equal(runCli(['status', 'workspace', '--path', repoRoot], env).workspace.requested_path, repoRoot);
    assert.equal(runCli(['status', 'runtime', '--limit', '1'], env).runtime_status.managed_session_ledger.entries.length, 1);
    assert.equal(runCli(['status', 'dashboard', '--path', repoRoot, '--sessions-limit', '1'], env).dashboard.workspace.requested_path, repoRoot);

    const invalid = runCliFailure(['status', 'runtime', '--limit', '0'], env);
    assert.equal(invalid.payload.error.code, 'cli_usage_error');
    assert.match(invalid.payload.error.message, /must be an integer from 1 to 500/);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('runtime manager commands expose registry metadata and parse action mode through the registry adapter', () => {
  const contract = loadCliCommandRegistryContract();
  const expected = [
    {
      command: 'runtime manager',
      contractKey: 'runtime_manager',
      options: [],
    },
    {
      command: 'runtime manager action',
      contractKey: 'runtime_manager_action',
      options: ['dry-run', 'apply'],
    },
  ];

  assert.equal(contract.protected_command_prefixes.includes('runtime manager'), true);
  for (const entry of expected) {
    assert.equal(contract.required_command_ids.includes(entry.command), true);
    const help = runCli(['help', ...entry.command.split(' ')]).help;
    const contractCommand = contract.commands[entry.contractKey];

    assert.equal(help.registry.command_id, entry.command);
    assert.equal(contractCommand.command_id, help.registry.command_id);
    assert.equal(help.registry.parser_adapter, 'node_util_parse_args');
    assert.deepEqual(
      help.registry.options.map((option: { name: string }) => option.name),
      entry.options,
    );
    assert.equal(
      help.registry.json_output_schema_ref,
      `contracts/opl-framework/cli-command-registry.json#/commands/${entry.contractKey}/output_schema`,
    );
    assert.equal(help.registry.authority_boundary.owner, 'OPL Runway');
    assert.equal(help.registry.authority_boundary.can_write_domain_truth, false);
    assert.equal(help.registry.authority_boundary.can_create_owner_receipt, false);
    assert.equal(help.registry.authority_boundary.can_claim_domain_ready, false);
    assert.equal(help.registry.authority_boundary.can_claim_production_ready, false);
  }

  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-manager-registry-'));
  try {
    const action = runCli(['runtime', 'manager', 'action', '--dry-run'], {
      OPL_STATE_DIR: stateRoot,
      OPL_NATIVE_HELPER_BIN_DIR: path.join(stateRoot, 'missing-native-bin'),
      OPL_FAMILY_RUNTIME_PROVIDER: 'local_sqlite',
    }).runtime_manager_action;
    assert.equal(action.mode, 'dry_run');
    assert.equal(action.dry_run, true);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }

  const invalid = runCliFailure(['runtime', 'manager', 'action', '--dry-run', '--apply']);
  assert.equal(invalid.payload.error.code, 'cli_usage_error');
  assert.match(invalid.payload.error.message, /exactly one of --dry-run or --apply/);
});

test('stage commands expose registry metadata and reject unknown options through the registry adapter', () => {
  const contract = loadCliCommandRegistryContract();
  const expected = [
    { command: 'stages list', contractKey: 'stages_list', options: [] },
    { command: 'stages inspect', contractKey: 'stages_inspect', options: ['domain', 'stage'] },
    {
      command: 'stages readiness',
      contractKey: 'stages_readiness',
      options: ['domain', 'family-defaults', 'detail'],
    },
    { command: 'stages proof-bundle', contractKey: 'stages_proof_bundle', options: ['domain'] },
    { command: 'stages graph', contractKey: 'stages_graph', options: ['domain'] },
    { command: 'stages assumptions', contractKey: 'stages_assumptions', options: ['domain'] },
    { command: 'stages cohort-loop', contractKey: 'stages_cohort_loop', options: ['domain'] },
    { command: 'stages runtime-budget', contractKey: 'stages_runtime_budget', options: ['domain'] },
    {
      command: 'stages registry',
      contractKey: 'stages_registry',
      options: [
        'domain',
        'library-status',
        'promotion-ref',
        'deprecation-ref',
        'supersession-ref',
        'superseded-by-stage-pack-ref',
        'previous-stage-pack-hash',
        'migration-policy',
        'migration-policy-ref',
        'reused-by-ref',
        'attempt-id',
        'attempt-stage-pack-hash',
        'attempt-stage',
        'attempt-created-at-ref',
      ],
    },
    {
      command: 'stages source-spec',
      contractKey: 'stages_source_spec',
      options: [
        'domain',
        'library-status',
        'promotion-ref',
        'deprecation-ref',
        'supersession-ref',
        'superseded-by-stage-pack-ref',
        'previous-stage-pack-hash',
        'migration-policy',
        'migration-policy-ref',
        'reused-by-ref',
        'append-only-event-log-ref',
        'attempt-ledger-ref',
        'recorded-runtime-event-ref',
        'closeout-receipt-ref',
      ],
    },
    {
      command: 'stages replay-certification',
      contractKey: 'stages_replay_certification',
      options: [
        'domain',
        'append-only-event-log-ref',
        'attempt-ledger-ref',
        'recorded-runtime-event-ref',
        'closeout-receipt-ref',
      ],
    },
  ];

  assert.equal(contract.protected_command_prefixes.includes('stages'), true);
  for (const entry of expected) {
    assert.equal(contract.required_command_ids.includes(entry.command), true);
    const help = runCli(['help', ...entry.command.split(' ')]).help;
    const contractCommand = contract.commands[entry.contractKey];

    assert.equal(help.registry.command_id, entry.command);
    assert.equal(contractCommand.command_id, help.registry.command_id);
    assert.equal(help.registry.parser_adapter, 'node_util_parse_args');
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

  const invalid = runCliFailure(['stages', 'proof-bundle', '--domain', 'mas', '--unknown', 'value']);
  assert.equal(invalid.payload.error.code, 'cli_usage_error');
  assert.match(invalid.payload.error.message, /Unknown option/);
});

test('runtime observability commands expose registry metadata in command help', () => {
  const contract = loadCliCommandRegistryContract();
  const expected = [
    {
      command: 'runtime observability-export',
      contractKey: 'runtime_observability_export',
      options: ['format'],
    },
    {
      command: 'runtime observability-endpoint',
      contractKey: 'runtime_observability_endpoint',
      options: ['host', 'port', 'metrics-path', 'once', 'ready-file'],
    },
    {
      command: 'runtime observability-collector-smoke',
      contractKey: 'runtime_observability_collector_smoke',
      options: ['collector-command', 'endpoint', 'host', 'port', 'metrics-path', 'timeout-ms'],
    },
  ];

  assert.equal(contract.protected_command_prefixes.includes('runtime observability'), true);
  for (const entry of expected) {
    assert.equal(contract.required_command_ids.includes(entry.command), true);
    const help = runCli(['help', ...entry.command.split(' ')]).help;
    const contractCommand = contract.commands[entry.contractKey];

    assert.equal(help.registry.command_id, entry.command);
    assert.equal(contractCommand.command_id, help.registry.command_id);
    assert.equal(help.registry.parser_adapter, 'node_util_parse_args');
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

test('update commands expose registry metadata and parse options through the registry adapter', () => {
  const contract = loadCliCommandRegistryContract();
  const commands = [
    ['status', ['component']],
    ['check', ['component']],
    ['plan', ['component']],
    ['apply', ['component']],
    ['repair', ['component', 'receipt']],
    ['rollback', ['component']], // reuse-first: allow owner-routed update command registry metadata.
  ] as const;

  assert.equal(contract.protected_command_prefixes.includes('update'), true);
  for (const [operation, optionNames] of commands) {
    const command = `update ${operation}`;
    const contractKey = `update_${operation}`;
    assert.equal(contract.required_command_ids.includes(command), true);

    const help = runCli(['help', 'update', operation]).help;
    const contractCommand = contract.commands[contractKey];
    assert.equal(help.registry.command_id, command);
    assert.equal(contractCommand.command_id, help.registry.command_id);
    assert.equal(help.registry.parser_adapter, 'node_util_parse_args');
    assert.deepEqual(
      help.registry.options.map((option: { name: string }) => option.name),
      optionNames,
    );
    assert.equal(
      help.registry.json_output_schema_ref,
      `contracts/opl-framework/cli-command-registry.json#/commands/${contractKey}/output_schema`,
    );
    assert.equal(help.registry.authority_boundary.can_write_domain_truth, false);
    assert.equal(help.registry.authority_boundary.can_create_owner_receipt, false);
    assert.equal(help.registry.authority_boundary.can_claim_domain_ready, false);
    assert.equal(help.registry.authority_boundary.can_claim_production_ready, false);
  }

  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-update-registry-'));
  try {
    const status = runCli(['update', 'status', '--component', 'capability_packages'], { OPL_STATE_DIR: stateRoot });
    assert.equal(status.managed_update.operation, 'status');
    assert.equal(status.managed_update.requested_component_id, 'capability_packages');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }

  const invalid = runCliFailure(['update', 'status', '--receipt', 'receipt-001']);
  assert.equal(invalid.payload.error.code, 'cli_usage_error');
  assert.match(invalid.payload.error.message, /Unknown option/);
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
