import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const cliPath = path.join(repoRoot, 'src', 'cli.ts');

function runCli(args: string[], envOverrides: Record<string, string> = {}) {
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', cliPath, ...args],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
        ...envOverrides,
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

function createFakeCodexFixture(handlerBody: string) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-codex-default-fixture-'));
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

function createFakeHermesFixture(handlerBody: string) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-hermes-default-fixture-'));
  const hermesPath = path.join(fixtureRoot, 'hermes');
  fs.writeFileSync(
    hermesPath,
    `#!/usr/bin/env bash
set -euo pipefail
${handlerBody}
`,
    { mode: 0o755 },
  );
  return {
    fixtureRoot,
    hermesPath,
  };
}

test('bare opl command defaults to Codex frontdoor semantics in non-interactive mode', () => {
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
if [ "$#" -eq 0 ]; then
  cat <<'EOF'
CODEX FRONTDOOR
EOF
  exit 0
fi
if [ "$1" = "exec" ]; then
  cat <<'EOF'
{"type":"thread.started","thread_id":"codex-frontdoor-fallback"}
{"item":{"type":"agent_message","text":"CODEX EXEC READY"}}
EOF
  exit 0
fi
echo "unexpected fake-codex args: $*" >&2
exit 1
`);

  try {
    const output = runCli([], {
      OPL_CODEX_BIN: codexPath,
    });

    assert.equal(output.product_entry.mode, 'frontdoor');
    assert.equal(output.product_entry.executor_backend, 'codex');
    assert.deepEqual(output.product_entry.codex.command_preview, ['codex']);
    assert.equal('hermes' in output.product_entry, false);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('exec command delegates to Codex exec one-shot', () => {
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
if [ "$1" = "exec" ]; then
  cat <<'EOF'
{"type":"thread.started","thread_id":"codex-exec-session"}
{"type":"turn.started"}
{"item":{"type":"agent_message","text":"CODEX EXEC ONE SHOT"}}
EOF
  exit 0
fi
echo "unexpected fake-codex args: $*" >&2
exit 1
`);

  try {
    const output = runCli(['exec', 'Plan', 'a', 'medical', 'grant', 'proposal', 'revision', 'loop.'], {
      OPL_CODEX_BIN: codexPath,
    });

    assert.equal(output.product_entry.mode, 'exec');
    assert.equal(output.product_entry.executor_backend, 'codex');
    assert.equal(output.product_entry.codex.session_id, 'codex-exec-session');
    assert.equal(output.product_entry.codex.response, 'CODEX EXEC ONE SHOT');
    assert.equal(output.product_entry.input.prompt, 'Plan a medical grant proposal revision loop.');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('chat and shell keep compatibility aliases but default runtime is Codex', () => {
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
if [ "$#" -eq 0 ]; then
  cat <<'EOF'
CODEX FRONTDOOR
EOF
  exit 0
fi
echo "unexpected fake-codex args: $*" >&2
exit 1
`);

  try {
    const chatOutput = runCli(['chat', 'Plan', 'the', 'next', 'paper', 'submission', 'steps.'], {
      OPL_CODEX_BIN: codexPath,
    });
    assert.equal(chatOutput.product_entry.mode, 'chat');
    assert.equal(chatOutput.product_entry.executor_backend, 'codex');
    assert.deepEqual(chatOutput.product_entry.codex.command_preview, ['codex']);
    assert.equal('hermes' in chatOutput.product_entry, false);

    const shellOutput = runCli(['shell'], {
      OPL_CODEX_BIN: codexPath,
    });
    assert.equal(shellOutput.product_entry.mode, 'frontdoor');
    assert.equal(shellOutput.product_entry.executor_backend, 'codex');
    assert.deepEqual(shellOutput.product_entry.codex.command_preview, ['codex']);
    assert.equal('hermes' in shellOutput.product_entry, false);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('chat --executor hermes keeps explicit Hermes switch available', () => {
  const { fixtureRoot, hermesPath } = createFakeHermesFixture(`
if [ "$1" = "chat" ]; then
  cat <<'EOF'
EXPLICIT HERMES READY

session_id: hermes-explicit-session
EOF
  exit 0
fi
if [ "$1" = "--resume" ] && [ "$2" = "hermes-explicit-session" ]; then
  cat <<'EOF'
EXPLICIT HERMES RESUME
EOF
  exit 0
fi
echo "unexpected fake-hermes args: $*" >&2
exit 1
`);

  try {
    const output = runCli(
      ['chat', 'Plan', 'the', 'next', 'paper', 'submission', 'steps.', '--executor', 'hermes'],
      {
        OPL_HERMES_BIN: hermesPath,
      },
    );

    assert.equal(output.product_entry.mode, 'chat');
    assert.equal(output.product_entry.executor_backend, 'hermes');
    assert.equal(output.product_entry.seed.session_id, 'hermes-explicit-session');
    assert.equal(output.product_entry.resume.output, 'EXPLICIT HERMES RESUME');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('help text advertises Codex as the default entry and lists opl exec', () => {
  const output = runCli(['help']);
  const commands = output.help.commands as Array<{ command: string; summary: string }>;

  assert.equal(commands.some((entry) => entry.command === 'exec'), true);
  assert.equal(
    commands.some(
      (entry) => entry.command === 'chat' && /Codex/i.test(entry.summary),
    ),
    true,
  );
  assert.equal(
    commands.some(
      (entry) => entry.command === 'shell' && /Codex/i.test(entry.summary),
    ),
    true,
  );
});
