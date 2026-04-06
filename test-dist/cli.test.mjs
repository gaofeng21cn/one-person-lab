import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const cliPath = path.join(repoRoot, 'dist', 'cli.js');

function runBuiltCli(args, envOverrides = {}) {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_NO_WARNINGS: '1',
      ...envOverrides,
    },
  });

  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

function runBuiltCliFailure(args, envOverrides = {}) {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_NO_WARNINGS: '1',
      ...envOverrides,
    },
  });

  assert.equal(result.status, 1);
  return JSON.parse(result.stderr);
}

test('built cli lists admitted workstreams', () => {
  const output = runBuiltCli(['list-workstreams']);

  assert.equal(output.version, 'g2');
  assert.deepEqual(
    output.workstreams.map((entry) => entry.workstream_id),
    ['research_ops', 'presentation_ops'],
  );
});

test('built cli resolves presentation delivery to redcube', () => {
  const output = runBuiltCli([
    'resolve-request-surface',
    '--intent',
    'presentation_delivery',
    '--target',
    'deliverable',
    '--goal',
    'Prepare a defense-ready slide deck for a thesis committee.',
  ]);

  assert.equal(output.resolution.status, 'routed');
  assert.equal(output.resolution.workstream_id, 'presentation_ops');
  assert.equal(output.resolution.domain_id, 'redcube');
});

test('built cli validates the required contract set', () => {
  const output = runBuiltCli(['validate-contracts']);

  assert.equal(output.version, 'g2');
  assert.equal(output.validation.status, 'valid');
  assert.deepEqual(
    output.validation.validated_contracts.map((entry) => ({
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

test('built cli exposes machine-readable help', () => {
  const output = runBuiltCli(['help']);

  assert.equal(output.version, 'g2');
  assert.equal(output.help.command, null);
  assert.equal(output.help.usage, 'opl <command> [args]');
  assert.ok(output.help.commands.some((entry) => entry.command === 'validate-contracts'));
  assert.ok(output.help.examples.includes('opl validate-contracts'));
});

test('built cli validate-contracts surfaces invalid JSON with a stable error envelope', () => {
  const tempContracts = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-built-validate-invalid-'));
  fs.cpSync(path.join(repoRoot, 'contracts', 'opl-gateway'), tempContracts, {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(tempContracts, 'public-surface-index.json'),
    '{ invalid json\n',
  );

  try {
    const output = runBuiltCliFailure(['validate-contracts'], {
      OPL_CONTRACTS_DIR: tempContracts,
    });

    assert.equal(output.version, 'g2');
    assert.equal(output.error.code, 'contract_json_invalid');
    assert.match(output.error.message, /public-surface-index\.json/i);
  } finally {
    fs.rmSync(tempContracts, { recursive: true, force: true });
  }
});

test('built cli unknown-command discovery includes validate-contracts', () => {
  const output = runBuiltCliFailure(['unknown-command']);

  assert.equal(output.version, 'g2');
  assert.equal(output.error.code, 'unknown_command');
  assert.ok(output.error.details.commands.includes('validate-contracts'));
});

test('built cli usage errors expose machine-readable guidance', () => {
  const output = runBuiltCliFailure(['get-domain']);

  assert.equal(output.version, 'g2');
  assert.equal(output.error.code, 'cli_usage_error');
  assert.equal(output.error.details.usage, 'opl get-domain <domain_id>');
});
