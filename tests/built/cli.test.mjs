import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const cliEntrypoint = path.join(repoRoot, 'dist', 'cli.js');

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
  return JSON.parse(result.stdout.trim());
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
  assert.equal(fs.existsSync(path.join(repoRoot, 'dist', 'cli', 'main.js')), true);

  const result = runBuiltCli(['contract', 'validate']);
  const output = parseJsonOutput(result);
  const taskTopology = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'contracts', 'opl-gateway', 'task-topology.json'), 'utf8'),
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
  assert.ok(commands.includes('skill sync'));
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
