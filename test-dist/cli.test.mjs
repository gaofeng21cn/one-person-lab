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

  assert.notEqual(result.status, 0);
  return {
    status: result.status ?? 1,
    payload: JSON.parse(result.stderr),
  };
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
  assert.deepEqual(output.help.global_options, [
    {
      option: '--contracts-dir <path>',
      summary:
        'Use an explicit OPL contract root. When omitted, the CLI resolves from cwd or cwd/contracts/opl-gateway.',
    },
  ]);
});

test('built cli global --contracts-dir override takes precedence over OPL_CONTRACTS_DIR', () => {
  const envContracts = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-built-env-contracts-'));
  const flagContracts = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-built-flag-contracts-'));

  fs.cpSync(path.join(repoRoot, 'contracts', 'opl-gateway'), envContracts, {
    recursive: true,
  });
  fs.cpSync(path.join(repoRoot, 'contracts', 'opl-gateway'), flagContracts, {
    recursive: true,
  });

  const envWorkstreams = JSON.parse(
    fs.readFileSync(path.join(envContracts, 'workstreams.json'), 'utf8'),
  );
  envWorkstreams.workstreams[0].label = 'Research Ops From Env';
  fs.writeFileSync(
    path.join(envContracts, 'workstreams.json'),
    JSON.stringify(envWorkstreams, null, 2),
  );

  const flagWorkstreams = JSON.parse(
    fs.readFileSync(path.join(flagContracts, 'workstreams.json'), 'utf8'),
  );
  flagWorkstreams.workstreams[0].label = 'Research Ops From Flag';
  fs.writeFileSync(
    path.join(flagContracts, 'workstreams.json'),
    JSON.stringify(flagWorkstreams, null, 2),
  );

  try {
    const output = runBuiltCli(
      ['--contracts-dir', flagContracts, 'get-workstream', 'research_ops'],
      { OPL_CONTRACTS_DIR: envContracts },
    );

    assert.equal(output.workstream.label, 'Research Ops From Flag');
  } finally {
    fs.rmSync(envContracts, { recursive: true, force: true });
    fs.rmSync(flagContracts, { recursive: true, force: true });
  }
});

test('built cli treats OPL_CONTRACTS_DIR as an explicit contract root override', () => {
  const { status, payload } = runBuiltCliFailure(['validate-contracts'], {
    OPL_CONTRACTS_DIR: repoRoot,
  });

  assert.equal(payload.version, 'g2');
  assert.equal(payload.error.code, 'contract_file_missing');
  assert.equal(payload.error.exit_code, 3);
  assert.equal(status, 3);
});

test('built cli root --help stays in parity with help output', () => {
  const output = runBuiltCli(['--help']);

  assert.equal(output.version, 'g2');
  assert.equal(output.help.command, null);
  assert.equal(output.help.usage, 'opl <command> [args]');
  assert.ok(output.help.commands.some((entry) => entry.command === 'get-domain'));
  assert.ok(output.help.global_options.some((entry) => entry.option === '--contracts-dir <path>'));
});

test('built cli treats command help literal as a usage error', () => {
  const { status, payload } = runBuiltCliFailure(['get-domain', 'help']);

  assert.equal(payload.version, 'g2');
  assert.equal(payload.error.code, 'cli_usage_error');
  assert.equal(payload.error.exit_code, 2);
  assert.equal(status, 2);
  assert.equal(payload.error.details.help_usage, 'opl get-domain --help');
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
    const { status, payload } = runBuiltCliFailure(['validate-contracts'], {
      OPL_CONTRACTS_DIR: tempContracts,
    });

    assert.equal(payload.version, 'g2');
    assert.equal(payload.error.code, 'contract_json_invalid');
    assert.equal(payload.error.exit_code, 3);
    assert.equal(status, 3);
    assert.match(payload.error.message, /public-surface-index\.json/i);
  } finally {
    fs.rmSync(tempContracts, { recursive: true, force: true });
  }
});

test('built cli unknown-command discovery includes validate-contracts', () => {
  const { status, payload } = runBuiltCliFailure(['unknown-command']);

  assert.equal(payload.version, 'g2');
  assert.equal(payload.error.code, 'unknown_command');
  assert.equal(payload.error.exit_code, 2);
  assert.equal(status, 2);
  assert.ok(payload.error.details.commands.includes('validate-contracts'));
});

test('built cli usage errors expose machine-readable guidance', () => {
  const { status, payload } = runBuiltCliFailure(['get-domain']);

  assert.equal(payload.version, 'g2');
  assert.equal(payload.error.code, 'cli_usage_error');
  assert.equal(payload.error.exit_code, 2);
  assert.equal(status, 2);
  assert.equal(payload.error.details.usage, 'opl get-domain <domain_id>');
});

test('built cli contract validation failures use the contract-error exit code', () => {
  const tempContracts = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-built-missing-contracts-'));
  fs.cpSync(path.join(repoRoot, 'contracts', 'opl-gateway'), tempContracts, {
    recursive: true,
  });
  fs.rmSync(path.join(tempContracts, 'task-topology.json'));

  const result = spawnSync(
    process.execPath,
    [cliPath, '--contracts-dir', tempContracts, 'validate-contracts'],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
      },
    },
  );

  try {
    assert.equal(result.status, 3);
    const output = JSON.parse(result.stderr);
    assert.equal(output.error.code, 'contract_file_missing');
    assert.equal(output.error.exit_code, 3);
  } finally {
    fs.rmSync(tempContracts, { recursive: true, force: true });
  }
});
