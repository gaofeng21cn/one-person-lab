import { assert, fs, os, parseJsonText, path, repoRoot, runCli, runCliFailure, test } from '../helpers.ts';
import { FrameworkContractError } from '../../../../src/modules/charter/contracts.ts';
import type { CommandSpec } from '../../../../src/entrypoints/cli/modules/support.ts';
import {
  bindCommandRegistryMetadata,
  validateCommandRegistryCoverage,
} from '../../../../src/entrypoints/cli/modules/command-registry.ts';

type CliCommandRegistryContract = {
  protected_command_prefixes: string[];
  commands: Record<string, any>;
};

const registryCases = [
  ['connect scientific search', 'connect_scientific_search', ['provider', 'query', 'limit'], undefined],
  ['connect references verify', 'connect_references_verify', ['references-file', 'providers', 'cache-root', 'max-retries'], undefined],
  ['connect install', 'connect_install', ['module'], undefined],
  ['connect update', 'connect_update', ['module'], undefined],
  ['connect reinstall', 'connect_reinstall', ['module'], undefined],
  ['connect remove', 'connect_remove', ['module'], undefined],
  ['status workspace', 'status_workspace', ['path'], 'OPL Console'],
  ['status runtime', 'status_runtime', ['limit'], 'OPL Runway'],
  ['status dashboard', 'status_dashboard', ['path', 'sessions-limit'], 'OPL Console'],
  ['runtime manager', 'runtime_manager', [], 'OPL Runway'],
  ['runtime manager action', 'runtime_manager_action', ['dry-run', 'apply'], 'OPL Runway'],
  ['stages list', 'stages_list', [], undefined],
  ['stages inspect', 'stages_inspect', ['domain', 'stage'], undefined],
  ['stages readiness', 'stages_readiness', ['domain', 'family-defaults', 'detail'], undefined],
  ['stages proof-bundle', 'stages_proof_bundle', ['domain'], undefined],
  ['stages graph', 'stages_graph', ['domain'], undefined],
  ['stages assumptions', 'stages_assumptions', ['domain'], undefined],
  ['stages cohort-loop', 'stages_cohort_loop', ['domain'], undefined],
  ['stages runtime-budget', 'stages_runtime_budget', ['domain'], undefined],
  ['stages registry', 'stages_registry', [
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
  ], undefined],
  ['stages source-spec', 'stages_source_spec', [
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
  ], undefined],
  ['stages replay-certification', 'stages_replay_certification', [
    'domain',
    'append-only-event-log-ref',
    'attempt-ledger-ref',
    'recorded-runtime-event-ref',
    'closeout-receipt-ref',
  ], undefined],
  ['runtime observability-export', 'runtime_observability_export', ['format'], undefined],
  ['runtime observability-endpoint', 'runtime_observability_endpoint', ['host', 'port', 'metrics-path', 'once', 'ready-file'], undefined],
  ['runtime observability-collector-smoke', 'runtime_observability_collector_smoke', ['collector-command', 'endpoint', 'host', 'port', 'metrics-path', 'timeout-ms'], undefined],
  ['update status', 'update_status', ['component'], undefined],
  ['update check', 'update_check', ['component'], undefined],
  ['update plan', 'update_plan', ['component'], undefined],
  ['update apply', 'update_apply', ['component'], undefined],
  ['update repair', 'update_repair', ['component', 'receipt'], undefined],
  ['update rollback', 'update_rollback', ['component'], undefined],
] as const;

function loadCliCommandRegistryContract() {
  return parseJsonText(
    fs.readFileSync(
      path.join(repoRoot, 'contracts', 'opl-framework', 'cli-command-registry.json'),
      'utf8',
    ),
  ) as CliCommandRegistryContract;
}

test('registered command help mirrors the canonical command registry', () => {
  const contract = loadCliCommandRegistryContract();

  for (const prefix of ['status', 'runtime manager', 'stages', 'runtime observability', 'update']) {
    assert.equal(contract.protected_command_prefixes.includes(prefix), true, prefix);
  }
  assert.equal(contract.protected_command_prefixes.includes('connect pubmed'), false);
  assert.equal(Object.hasOwn(contract, 'required_command_ids'), false);
  for (const [command, contractKey, optionNames, owner] of registryCases) {
    const help = runCli(['help', ...command.split(' ')]).help;
    const contractCommand = contract.commands[contractKey];

    assert.equal(help.registry.command_id, command);
    assert.equal(contractCommand.command_id, command);
    assert.equal(help.registry.parser_adapter, 'node_util_parse_args');
    assert.equal(contractCommand.parser_adapter, help.registry.parser_adapter);
    assert.deepEqual(help.registry.options.map((option: { name: string }) => option.name), optionNames);
    assert.equal(
      help.registry.json_output_schema_ref,
      `contracts/opl-framework/cli-command-registry.json#/commands/${contractKey}/output_schema`,
    );
    if (owner) {
      assert.equal(help.registry.authority_boundary.owner, owner);
    }
    for (const claim of [
      'can_write_domain_truth',
      'can_create_owner_receipt',
      'can_claim_domain_ready',
      'can_claim_production_ready',
    ]) {
      assert.equal(help.registry.authority_boundary[claim], false, `${command} must not claim ${claim}`);
    }
  }
});

test('Connect output schemas freeze provider receipts behind no-authority flags', () => {
  const contract = loadCliCommandRegistryContract();
  const scientificProvider = contract.commands.connect_scientific_search.options.find(
    (option: { name: string }) => option.name === 'provider',
  );
  const scientific = contract.commands.connect_scientific_search.output_schema.properties.opl_connect_scientific;
  const scientificBoundary = scientific.properties.authority_boundary;
  const referenceVerification = contract.commands.connect_references_verify.output_schema
    .properties.opl_connect_reference_verification.properties;
  const referenceBoundary = referenceVerification.no_authority_boundary;

  for (const key of ['connect_scientific_search', 'connect_references_verify']) {
    assert.equal(contract.commands[key].output_schema.properties.version.const, 'g2');
  }
  assert.equal(scientific.properties.profile_role.const, 'optional_scientific_connector_profile');
  assert.deepEqual(scientificProvider.allowed_values, ['crossref', 'openalex']);
  assert.equal(scientificProvider.summary, 'Scientific provider id: crossref, openalex.');
  assert.equal(
    contract.commands.connect_references_verify.options.find(
      (option: { name: string }) => option.name === 'providers',
    ).default,
    'crossref,openalex,semantic-scholar,crossmark,publisher',
  );
  assert.equal(scientific.properties.provider_receipt_role.const, 'provider_receipt_candidate_only');
  assert.equal(referenceVerification.verification_role.const, 'metadata_provider_receipt_only');
  assert.equal(referenceVerification.provider_receipts.items.properties.receipt_scope.const, 'metadata_provider_receipt_only');
  assert.equal(referenceVerification.provider_receipts.items.properties.authority.const, 'provider_receipt_candidate_only');

  for (const field of [
    'can_write_domain_truth',
    'can_sign_owner_receipt',
    'can_create_typed_blocker',
    'can_claim_publication_readiness',
    'can_claim_citation_truth',
    'can_claim_domain_ready',
    'can_claim_production_ready',
  ]) {
    assert.equal(scientificBoundary.required.includes(field), true, field);
    assert.equal(scientificBoundary.properties[field].const, false, field);
  }
  assert.equal(scientificBoundary.properties.can_claim_citation_truth.const, false);
  assert.equal(referenceBoundary.properties.read_only.const, true);
  for (const field of [
    'can_write_domain_truth',
    'can_create_owner_receipt',
    'can_create_typed_blocker',
    'can_claim_reference_truth',
    'can_claim_citation_quality',
    'can_claim_claim_support',
    'can_claim_citation_truth',
    'can_claim_publication_readiness',
    'can_claim_domain_ready',
    'can_claim_production_ready',
  ]) {
    assert.equal(referenceBoundary.required.includes(field), true, field);
    assert.equal(referenceBoundary.properties[field].const, false, field);
  }
});

test('migrated registry entries own their authority metadata', () => {
  const contract = loadCliCommandRegistryContract();
  const owners = new Map([
    ['connect ', 'OPL Connect'],
    ['update ', 'OPL Managed Update / Pack owners'],
  ]);
  for (const command of Object.values(contract.commands) as Array<Record<string, any>>) {
    const owner = [...owners].find(([prefix]) => String(command.command_id).startsWith(prefix))?.[1];
    if (!owner) continue;
    assert.equal(command.authority_boundary.owner, owner, command.command_id);
    assert.equal(typeof command.authority_boundary.surface, 'string', command.command_id);
    assert.notEqual(command.authority_boundary.surface.length, 0, command.command_id);
  }
});

test('status command options are parsed through the registry adapter', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-status-registry-'));

  try {
    const entries = ['newer', 'older'].map((id, index) => ({
      ledger_id: `ledger-${id}`,
      recorded_at: `2026-07-03T00:00:0${1 - index}.000Z`,
      session_id: `session-${id}`,
      mode: index === 0 ? 'resume' : 'start',
      source_surface: 'test_fixture',
      domain_id: null,
      workstream_id: null,
      goal_preview: null,
      workspace_locator: null,
      resource_sample: { status: 'unavailable', reason: 'test fixture' },
    }));
    fs.writeFileSync(path.join(stateRoot, 'session-ledger.json'), `${JSON.stringify({ version: 'g2', entries }, null, 2)}\n`);
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

test('runtime manager action parses one explicit mode and rejects conflicts', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-manager-registry-'));
  try {
    const action = runCli(['runtime', 'manager', 'action', '--dry-run'], {
      OPL_STATE_DIR: stateRoot,
      OPL_NATIVE_HELPER_BIN_DIR: path.join(stateRoot, 'missing-native-bin'),
      OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
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

test('stage commands reject options outside their registry entry', () => {
  const invalid = runCliFailure(['stages', 'proof-bundle', '--domain', 'mas', '--unknown', 'value']);
  assert.equal(invalid.payload.error.code, 'cli_usage_error');
  assert.match(invalid.payload.error.message, /Unknown option/);
});

test('update commands parse registered options and reject cross-command options', () => {
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
    'example inspect': {
      usage: 'opl example inspect --target <target>',
      summary: 'Inspect one example.',
      examples: ['opl example inspect --target demo'],
      handler: () => ({}),
    },
  };

  assert.throws(
    () => validateCommandRegistryCoverage(specs, {
      protectedCommandPrefixes: ['example'],
    }),
    (error) => {
      assert.equal(error instanceof FrameworkContractError, true);
      assert.equal((error as FrameworkContractError).code, 'contract_shape_invalid');
      assert.equal((error as FrameworkContractError).details?.command, 'example inspect');
      return true;
    },
  );
});

test('command specs bind parser metadata from the machine registry', () => {
  const spec: CommandSpec = {
    usage: 'opl example inspect --target <target>',
    summary: 'Inspect one example.',
    examples: ['opl example inspect --target demo'],
    handler: () => ({}),
  };
  const specs = { 'example inspect': spec };

  assert.equal(bindCommandRegistryMetadata(specs, {
    example_inspect: {
      command_id: 'example inspect',
      parser_adapter: 'node_util_parse_args',
      options: [{
        name: 'target',
        flag: '--target',
        value_kind: 'string',
        summary: 'Example target.',
        required: true,
      }],
      authority_boundary: {
        owner: 'OPL Connect',
        surface: 'example_inspect',
        can_write_domain_truth: false,
        can_create_owner_receipt: false,
        can_claim_domain_ready: false,
        can_claim_production_ready: false,
      },
      output_schema: { type: 'object' },
    },
  }), specs);
  assert.deepEqual(spec.registry, {
    command_id: 'example inspect',
    parser_adapter: 'node_util_parse_args',
    options: [{
      name: 'target',
      flag: '--target',
      value_kind: 'string',
      summary: 'Example target.',
      required: true,
    }],
    authority_boundary: {
      owner: 'OPL Connect',
      surface: 'example_inspect',
      can_write_domain_truth: false,
      can_create_owner_receipt: false,
      can_claim_domain_ready: false,
      can_claim_production_ready: false,
    },
    json_output_schema_ref:
      'contracts/opl-framework/cli-command-registry.json#/commands/example_inspect/output_schema',
  });
});

test('command registry rejects incomplete options, duplicates, and inline authority fallback', () => {
  const validOption = {
    name: 'target',
    flag: '--target',
    value_kind: 'string',
    summary: 'Example target.',
    required: true,
  } as const;
  const validAuthorityBoundary = {
    owner: 'OPL Connect',
    surface: 'example_inspect',
    can_write_domain_truth: false,
    can_create_owner_receipt: false,
    can_claim_domain_ready: false,
    can_claim_production_ready: false,
  } as const;
  const validEntry = {
    command_id: 'example inspect',
    parser_adapter: 'node_util_parse_args',
    options: [validOption],
    authority_boundary: validAuthorityBoundary,
    output_schema: { type: 'object' },
  };
  const specWithInlineFallback = (): CommandSpec => ({
    usage: 'opl example inspect --target <target>',
    summary: 'Inspect one example.',
    examples: ['opl example inspect --target demo'],
    handler: () => ({}),
    registry: {
      command_id: 'example inspect',
      parser_adapter: 'node_util_parse_args',
      options: validEntry.options,
      json_output_schema_ref: 'inline-fallback-must-not-be-used',
      authority_boundary: validEntry.authority_boundary,
    },
  });
  const cases = [
    ['missing option summary', {
      ...validEntry,
      options: [{ ...validEntry.options[0], summary: undefined }],
    }, 'registry.option.summary'],
    ['duplicate option name', {
      ...validEntry,
      options: [validEntry.options[0], { ...validEntry.options[0], flag: '--other' }],
    }, 'registry.option.name_duplicate'],
    ['duplicate option flag', {
      ...validEntry,
      options: [validEntry.options[0], { ...validEntry.options[0], name: 'other' }],
    }, 'registry.option.flag_duplicate'],
    ['missing authority owner', {
      ...validEntry,
      authority_boundary: { ...validEntry.authority_boundary, owner: undefined },
    }, 'registry.authority_boundary.owner'],
    ['missing authority surface', {
      ...validEntry,
      authority_boundary: { ...validEntry.authority_boundary, surface: undefined },
    }, 'registry.authority_boundary.surface'],
  ] as const;

  for (const [label, entry, violation] of cases) {
    assert.throws(
      () => bindCommandRegistryMetadata(
        { 'example inspect': specWithInlineFallback() },
        { example_inspect: entry },
      ),
      (error) => {
        assert.equal(error instanceof FrameworkContractError, true, label);
        assert.equal((error as FrameworkContractError).code, 'contract_shape_invalid', label);
        assert.equal(
          ((error as FrameworkContractError).details?.violations as string[]).includes(violation),
          true,
          label,
        );
        return true;
      },
    );
  }
});
