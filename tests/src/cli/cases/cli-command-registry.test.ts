import { assert, fs, os, parseJsonText, path, repoRoot, runCli, runCliFailure, test } from '../helpers.ts';
import { FrameworkContractError } from '../../../../src/modules/charter/contracts.ts';
import type { CommandSpec } from '../../../../src/entrypoints/cli/modules/support.ts';
import { validateCommandRegistryCoverage } from '../../../../src/entrypoints/cli/modules/command-registry.ts';

type CliCommandRegistryContract = {
  protected_command_prefixes: string[];
  required_command_ids: string[];
  commands: Record<string, any>;
};

const registryCases = [
  ['connect pubmed search', 'connect_pubmed_search', ['query', 'limit'], undefined],
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
  for (const [command, contractKey, optionNames, owner] of registryCases) {
    assert.equal(contract.required_command_ids.includes(command), true, command);
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
  const pubmed = contract.commands.connect_pubmed_search.output_schema.properties.opl_connect_pubmed;
  const pubmedBoundary = pubmed.properties.authority_boundary;
  const scientific = contract.commands.connect_scientific_search.output_schema.properties.opl_connect_scientific;
  const scientificBoundary = scientific.properties.authority_boundary;
  const referenceVerification = contract.commands.connect_references_verify.output_schema
    .properties.opl_connect_reference_verification.properties;
  const referenceBoundary = referenceVerification.no_authority_boundary;

  for (const key of ['connect_pubmed_search', 'connect_scientific_search', 'connect_references_verify']) {
    assert.equal(contract.commands[key].output_schema.properties.version.const, 'g2');
  }
  assert.equal(pubmed.properties.connector_profile.const, 'scientific');
  assert.equal(pubmed.properties.canonical_profile_command.const, 'connect scientific search --provider pubmed');
  assert.equal(pubmed.properties.provider_receipt_role.const, 'provider_receipt_candidate_only');
  assert.equal(scientific.properties.profile_role.const, 'optional_scientific_connector_profile');
  assert.equal(scientific.properties.provider_receipt_role.const, 'provider_receipt_candidate_only');
  assert.equal(referenceVerification.verification_role.const, 'metadata_provider_receipt_only');
  assert.equal(referenceVerification.provider_receipts.items.properties.receipt_scope.const, 'metadata_provider_receipt_only');
  assert.equal(referenceVerification.provider_receipts.items.properties.authority.const, 'provider_receipt_candidate_only');

  assert.equal(pubmedBoundary.properties.read_only.const, true);
  for (const field of [
    'can_write_domain_truth',
    'can_sign_owner_receipt',
    'can_create_typed_blocker',
    'can_claim_publication_readiness',
    'can_claim_citation_truth',
    'can_claim_domain_ready',
    'can_claim_production_ready',
  ]) {
    assert.equal(pubmedBoundary.required.includes(field), true, field);
    assert.equal(pubmedBoundary.properties[field].const, false, field);
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
