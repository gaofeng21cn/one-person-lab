import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseJsonText } from '../../src/kernel/json-file.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const cliEntrypoint = path.join(repoRoot, 'dist', 'entrypoints', 'cli.js');

function runBuiltCli(args, envOverrides = {}) {
  const result = spawnSync(process.execPath, [cliEntrypoint, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_NO_WARNINGS: '1',
      ...envOverrides,
    },
  });

  assert.equal(result.status, 0, result.stderr);
  return result;
}

function parseJsonOutput(result) {
  return parseJsonText(result.stdout.trim());
}

function createFakeCodexFixture(handlerBody) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-built-codex-fixture-'));
  const codexPath = path.join(fixtureRoot, 'codex');
  fs.writeFileSync(
    codexPath,
    `#!/usr/bin/env bash
set -euo pipefail
${handlerBody}
`,
    { mode: 0o755 },
  );
  return {
    fixtureRoot,
    codexPath,
  };
}

test('built CLI entrypoint loads the emitted main module', () => {
  assert.equal(fs.existsSync(cliEntrypoint), true);
  assert.equal(fs.existsSync(path.join(repoRoot, 'dist', 'entrypoints', 'cli', 'main.js')), true);

  const result = runBuiltCli(['contract', 'validate']);
  const output = parseJsonOutput(result);
  const taskTopology = parseJsonText(
    fs.readFileSync(path.join(repoRoot, 'contracts', 'opl-framework', 'task-topology.json'), 'utf8'),
  );

  assert.equal(output.version, 'g2');
  assert.equal(output.validation.status, 'valid');
  assert.equal(
    output.validation.validated_contracts.find((entry) => entry.contract_id === 'task_topology')?.schema_version,
    taskTopology.version,
  );
});

test('built CLI help exposes current Codex-default command surfaces', () => {
  const output = parseJsonOutput(runBuiltCli(['help']));
  const commands = output.help.commands.map((entry) => entry.command);

  assert.equal(output.version, 'g2');
  assert.equal(output.help.usage, 'opl [command ...|request...] [args]');
  assert.ok(commands.includes('install'));
  assert.ok(commands.includes('exec'));
  assert.ok(commands.includes('resume'));
  assert.ok(commands.includes('connect sync-skills'));
  assert.ok(commands.includes('foundry status'));
  assert.equal(commands.includes('skill sync'), false);
  assert.equal(commands.includes('ask'), false);
  assert.equal(commands.includes('web'), false);
  assert.equal(commands.some((command) => command.startsWith('service ')), false);
});

test('built CLI exec remains a raw Codex passthrough', () => {
  const capturePath = path.join(os.tmpdir(), `opl-built-codex-exec-args-${process.pid}.txt`);
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
printf '%s\\n' "$@" > ${JSON.stringify(capturePath)}
if [ "$1" = "exec" ]; then
  cat <<'EOF'
{"type":"thread.started","thread_id":"codex-built-exec-session"}
{"type":"turn.started"}
{"item":{"type":"agent_message","text":"CODEX EXEC BUILT SMOKE"}}
EOF
  exit 0
fi
echo "unexpected fake-codex args: $*" >&2
exit 1
`);

  try {
    const result = runBuiltCli(
      ['exec', '--cd', '/tmp/opl-built-exec-smoke', '--model', 'gpt-5.4', 'Plan a medical grant proposal revision loop.'],
      { OPL_CODEX_BIN: codexPath },
    );

    assert.match(result.stdout, /"thread_id":"codex-built-exec-session"/);
    assert.match(result.stdout, /CODEX EXEC BUILT SMOKE/);
    assert.equal(result.stderr, '');
    assert.deepEqual(fs.readFileSync(capturePath, 'utf8').trim().split('\n'), [
      'exec',
      '--cd',
      '/tmp/opl-built-exec-smoke',
      '--model',
      'gpt-5.4',
      'Plan a medical grant proposal revision loop.',
    ]);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(capturePath, { force: true });
  }
});

test('npm tarball installs its workspace runtime dependencies without a checkout repair', { timeout: 240_000 }, () => {
  const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-npm-installed-cli-'));
  const prefix = path.join(testRoot, 'prefix');
  const testHome = path.join(testRoot, 'home');
  fs.mkdirSync(testHome);
  const env = {
    ...process.env,
    HOME: testHome,
    USERPROFILE: testHome,
    OPL_STATE_DIR: path.join(testRoot, 'state'),
    NODE_NO_WARNINGS: '1',
    NODE_PATH: '',
    NODE_OPTIONS: '',
  };
  const run = (command, args, cwd = testRoot) => {
    const result = spawnSync(command, args, { cwd, env, encoding: 'utf8', timeout: 180_000, maxBuffer: 8 * 1024 * 1024 });
    assert.equal(result.status, 0, `${command} ${args.join(' ')}\n${result.error?.message ?? ''}\n${result.stderr}`);
    return result;
  };
  try {
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const packed = JSON.parse(run(npm, ['pack', '--ignore-scripts', '--json', '--pack-destination', testRoot], repoRoot).stdout)[0];
    run(npm, ['install', '--global', '--prefix', prefix, path.join(testRoot, packed.filename),
      '--prefer-offline', '--no-audit', '--no-fund']);
    const installedRoot = path.join(prefix, 'lib', 'node_modules', 'opl-framework');
    assert.equal(fs.existsSync(path.join(installedRoot, 'src', 'entrypoints', 'cli.ts')), false);
    const resolvedPackages = JSON.parse(run(process.execPath, ['--eval',
      'const resolve = require("node:module").createRequire(process.argv[1]).resolve; process.stdout.write(JSON.stringify(["@one-person-lab/cordis-abi", "@one-person-lab/package-host"].map(id => resolve(id))));',
      path.join(installedRoot, 'package.json')]).stdout);
    for (const packagePath of resolvedPackages) {
      const resolved = fs.realpathSync(packagePath);
      assert.ok(resolved.startsWith(`${fs.realpathSync(installedRoot)}${path.sep}`), resolved);
      assert.equal(resolved.startsWith(`${fs.realpathSync(repoRoot)}${path.sep}`), false);
    }
    const fixture = path.join(testRoot, 'agent');
    fs.mkdirSync(path.join(fixture, 'contracts'), { recursive: true });
    fs.writeFileSync(path.join(fixture, 'contracts', 'durable_knowledge_catalog.json'), JSON.stringify({
      surface_kind: 'opl_durable_knowledge_catalog', version: 'durable-knowledge-catalog.v2',
      owner: 'one-person-lab', domain_id: 'fixture', items: [],
    }));
    const installedCli = path.join(prefix, 'bin', 'opl');
    const knowledge = JSON.parse(run(installedCli, ['knowledge', 'list', '--repo', fixture, '--json']).stdout);
    assert.equal(knowledge.durable_knowledge.version, 'durable-knowledge-catalog.v2');
    const packages = JSON.parse(run(installedCli, ['packages', 'list', '--json']).stdout);
    assert.equal(packages.version, 'g2');
    assert.equal(packages.opl_agent_packages.surface_kind, 'opl_agent_package_readback');
    assert.equal(packages.opl_agent_packages.status, 'available');
  } finally {
    fs.rmSync(testRoot, { recursive: true, force: true });
  }
});
