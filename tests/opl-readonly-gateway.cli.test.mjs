import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const cliEntrypoint =
  process.env.OPL_CLI_ENTRYPOINT
  ?? [
    path.join(repoRoot, 'dist', 'cli.js'),
    path.join(repoRoot, 'dist', 'cli', 'index.js'),
  ].find((candidate) => existsSync(candidate))
  ?? path.join(repoRoot, 'dist', 'cli.js');
const contractsRoot = path.join(repoRoot, 'contracts', 'opl-gateway');

function contractVersion(fileName) {
  return JSON.parse(readFileSync(path.join(contractsRoot, fileName), 'utf8')).version;
}

function runCli(args, options = {}) {
  return spawnSync(process.execPath, [cliEntrypoint, ...args], {
    cwd: options.cwd ?? repoRoot,
    env: {
      ...process.env,
      ...options.env,
    },
    encoding: 'utf8',
  });
}

function formatFailure(result) {
  return [
    `status=${result.status}`,
    `signal=${result.signal}`,
    `stdout=${result.stdout.trim()}`,
    `stderr=${result.stderr.trim()}`,
  ].join('\n');
}

function parseJsonOutput(result) {
  const text = (result.stdout && result.stdout.trim()) || (result.stderr && result.stderr.trim()) || '';
  return JSON.parse(text);
}

function createContractsFixtureRoot(mutator) {
  const fixtureRoot = mkdtempSync(path.join(os.tmpdir(), 'opl-contract-fixture-'));
  const fixtureContractsRoot = path.join(fixtureRoot, 'contracts', 'opl-gateway');
  mkdirSync(fixtureContractsRoot, { recursive: true });

  for (const fileName of [
    'workstreams.json',
    'domains.json',
    'routing-vocabulary.json',
    'task-topology.json',
    'public-surface-index.json',
  ]) {
    writeFileSync(
      path.join(fixtureContractsRoot, fileName),
      readFileSync(path.join(contractsRoot, fileName), 'utf8'),
    );
  }

  mutator(fixtureRoot, fixtureContractsRoot);
  return { fixtureRoot, fixtureContractsRoot };
}

test('list-workstreams returns the admitted workstream summaries', () => {
  assert.ok(existsSync(cliEntrypoint), `Expected CLI entrypoint at ${cliEntrypoint}.`);

  const result = runCli(['list-workstreams']);
  assert.equal(result.status, 0, formatFailure(result));

  const payload = parseJsonOutput(result);
  assert.equal(payload.version, 'g2');
  assert.deepEqual(payload.workstreams, [
    {
      workstream_id: 'research_ops',
      label: 'Research Ops',
      status: 'active',
      domain_id: 'medautoscience',
    },
    {
      workstream_id: 'presentation_ops',
      label: 'Presentation Ops',
      status: 'emerging',
      domain_id: 'redcube',
    },
  ]);
});

test('get-domain redcube returns gateway and harness truth', () => {
  const result = runCli(['get-domain', 'redcube']);
  assert.equal(result.status, 0, formatFailure(result));

  const payload = parseJsonOutput(result);
  assert.equal(payload.version, 'g2');
  assert.equal(payload.domain.domain_id, 'redcube');
  assert.equal(payload.domain.project, 'redcube-ai');
  assert.equal(payload.domain.gateway_surface, 'Visual Deliverable Gateway');
  assert.equal(payload.domain.harness_surface, 'Visual Deliverable Harness OS');
  assert.deepEqual(payload.domain.owned_workstreams, ['presentation_ops']);
  assert.deepEqual(payload.domain.non_opl_families, ['xiaohongshu']);
});

test('resolve-request-surface maps a defense-ready slide deck to presentation_ops via redcube', () => {
  const result = runCli([
    'resolve-request-surface',
    '--intent', 'presentation_delivery',
    '--target', 'deliverable',
    '--goal', 'Prepare a defense-ready slide deck for a thesis committee.',
    '--preferred-family', 'ppt_deck',
  ]);
  assert.equal(result.status, 0, formatFailure(result));

  const payload = parseJsonOutput(result);
  assert.equal(payload.version, 'g2');
  assert.equal(payload.resolution.workstream_id, 'presentation_ops');
  assert.equal(payload.resolution.domain_id, 'redcube');
  assert.equal(payload.resolution.entry_surface, 'domain_gateway');
  assert.equal(payload.resolution.recommended_family, 'ppt_deck');
  assert.equal(payload.resolution.confidence, 'high');
});

test('resolve-request-surface keeps xiaohongshu at the redcube family boundary without auto-admitting presentation_ops', () => {
  const result = runCli([
    'resolve-request-surface',
    '--intent', 'create',
    '--target', 'deliverable',
    '--goal', 'Create a xiaohongshu campaign pack for a lab update.',
    '--preferred-family', 'xiaohongshu',
  ]);
  assert.equal(result.status, 0, formatFailure(result));

  const payload = parseJsonOutput(result);
  assert.equal(payload.version, 'g2');
  assert.equal(payload.resolution.domain_id, 'redcube');
  assert.equal(payload.resolution.workstream_id, null);
  assert.equal(payload.resolution.recommended_family, 'xiaohongshu');
  assert.match(payload.resolution.reason, /must not auto-resolve|not automatically equal|family boundary/i);
});

test('resolve-request-surface emits ambiguous_task with machine-readable clarification evidence', () => {
  const result = runCli([
    'resolve-request-surface',
    '--intent', 'create',
    '--target', 'deliverable',
    '--goal', 'Package the study for submission and also turn it into a defense-ready deck.',
  ]);
  assert.equal(result.status, 0, formatFailure(result));

  const payload = parseJsonOutput(result);
  assert.equal(payload.version, 'g2');
  assert.equal(payload.resolution.status, 'ambiguous_task');
  assert.deepEqual(payload.resolution.candidate_workstreams, [
    'research_ops',
    'presentation_ops',
  ]);
  assert.deepEqual(payload.resolution.candidate_domains, [
    'medautoscience',
    'redcube',
  ]);
});

test('validate-contracts returns a stable machine-readable success summary', () => {
  const result = runCli(['validate-contracts']);
  assert.equal(result.status, 0, formatFailure(result));

  const payload = parseJsonOutput(result);
  assert.equal(payload.version, 'g2');
  assert.equal(payload.validation.status, 'valid');
  assert.deepEqual(
    payload.validation.validated_contracts.map((entry) => ({
      contract_id: entry.contract_id,
      file: path.basename(entry.file),
      schema_version: entry.schema_version,
      status: entry.status,
    })),
    [
      { contract_id: 'workstreams', file: 'workstreams.json', schema_version: 'g1', status: 'valid' },
      { contract_id: 'domains', file: 'domains.json', schema_version: 'g1', status: 'valid' },
      { contract_id: 'routing_vocabulary', file: 'routing-vocabulary.json', schema_version: 'g1', status: 'valid' },
      { contract_id: 'task_topology', file: 'task-topology.json', schema_version: 'p17.m1', status: 'valid' },
      { contract_id: 'public_surface_index', file: 'public-surface-index.json', schema_version: 'p18.m1', status: 'valid' },
    ],
  );
});

test('validate-contracts surfaces missing files with a stable machine-readable error envelope', () => {
  const { fixtureRoot, fixtureContractsRoot } = createContractsFixtureRoot((_fixtureRoot, contractsDir) => {
    rmSync(path.join(contractsDir, 'task-topology.json'));
  });

  try {
    const result = runCli(['validate-contracts'], { env: { OPL_CONTRACTS_DIR: fixtureContractsRoot } });
    assert.notEqual(result.status, 0, 'Expected a non-zero exit when task-topology.json is missing.');

    const payload = parseJsonOutput(result);
    assert.equal(payload.version, 'g2');
    assert.equal(payload.error.code, 'contract_file_missing');
    assert.match(payload.error.message, /task-topology\.json/i);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('validate-contracts surfaces invalid JSON from the contract set rooted at cwd', () => {
  const { fixtureRoot, fixtureContractsRoot } = createContractsFixtureRoot((_fixtureRoot, contractsDir) => {
    writeFileSync(path.join(contractsDir, 'domains.json'), '{ invalid json\n');
  });

  try {
    const result = runCli(['validate-contracts'], { env: { OPL_CONTRACTS_DIR: fixtureContractsRoot } });
    assert.notEqual(result.status, 0, 'Expected a non-zero exit when domains.json is invalid.');

    const payload = parseJsonOutput(result);
    assert.equal(payload.error.code, 'contract_json_invalid');
    assert.match(payload.error.message, /domains\.json|invalid json/i);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('validate-contracts surfaces shape-invalid contracts with a stable error envelope', () => {
  const { fixtureRoot, fixtureContractsRoot } = createContractsFixtureRoot((_fixtureRoot, contractsDir) => {
    const workstreamsPath = path.join(contractsDir, 'workstreams.json');
    const workstreams = JSON.parse(readFileSync(workstreamsPath, 'utf8'));
    delete workstreams.workstreams[0].label;
    writeFileSync(workstreamsPath, JSON.stringify(workstreams, null, 2));
  });

  try {
    const result = runCli(['validate-contracts'], { env: { OPL_CONTRACTS_DIR: fixtureContractsRoot } });
    assert.notEqual(result.status, 0, 'Expected a non-zero exit when workstreams.json shape is invalid.');

    const payload = parseJsonOutput(result);
    assert.equal(payload.error.code, 'contract_shape_invalid');
    assert.match(payload.error.message, /label/i);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('unknown command remains machine-readable and discoverable', () => {
  const result = runCli(['unknown-command']);
  assert.notEqual(result.status, 0, 'Expected a non-zero exit when the command is unknown.');

  const payload = parseJsonOutput(result);
  assert.equal(payload.version, 'g2');
  assert.equal(payload.error.code, 'unknown_command');
  assert.ok(payload.error.details.commands.includes('validate-contracts'));
});

test('help stays machine-readable and discoverable for built CLI entrypoints', () => {
  const result = runCli(['help']);
  assert.equal(result.status, 0, formatFailure(result));

  const payload = parseJsonOutput(result);
  assert.equal(payload.version, 'g2');
  assert.equal(payload.help.command, null);
  assert.equal(payload.help.usage, 'opl <command> [args]');
  assert.ok(
    payload.help.commands.some((entry) => entry.command === 'validate-contracts'),
  );
  assert.ok(
    payload.help.commands.some(
      (entry) => entry.command === 'get-domain'
        && entry.examples.includes('opl get-domain redcube'),
    ),
  );
});

test('command --help stays machine-readable for built CLI entrypoints', () => {
  const result = runCli(['get-domain', '--help']);
  assert.equal(result.status, 0, formatFailure(result));

  const payload = parseJsonOutput(result);
  assert.equal(payload.version, 'g2');
  assert.equal(payload.help.command, 'get-domain');
  assert.equal(payload.help.usage, 'opl get-domain <domain_id>');
  assert.ok(payload.help.examples.includes('opl get-domain redcube'));
});
