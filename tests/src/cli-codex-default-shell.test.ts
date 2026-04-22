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
const binPath = path.join(repoRoot, 'bin', 'opl');

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

function runCliRaw(args: string[], envOverrides: Record<string, string> = {}) {
  return runEntryPathRaw(cliPath, args, envOverrides);
}

function runEntryPathRaw(
  entryPath: string,
  args: string[],
  envOverrides: Record<string, string> = {},
) {
  const command = entryPath === cliPath ? process.execPath : entryPath;
  const commandArgs =
    entryPath === cliPath
      ? ['--experimental-strip-types', cliPath, ...args]
      : args;
  const result = spawnSync(
    command,
    commandArgs,
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
  return result;
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

test('bare opl command is a raw Codex frontdoor passthrough by default', () => {
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
    const result = runCliRaw([], {
      OPL_CODEX_BIN: codexPath,
    });

    assert.equal(result.stdout, 'CODEX FRONTDOOR\n');
    assert.equal(result.stderr, '');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('bare opl forwards root-level Codex options before the prompt', () => {
  const capturePath = path.join(os.tmpdir(), `opl-codex-root-args-${process.pid}.txt`);
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
printf '%s\\n' "$@" > ${JSON.stringify(capturePath)}
echo "CODEX ROOT RAW"
exit 0
`);

  try {
    const result = runCliRaw(['--model', 'gpt-5.4', 'Plan the next paper submission steps.'], {
      OPL_CODEX_BIN: codexPath,
    });

    assert.equal(result.stdout, 'CODEX ROOT RAW\n');
    assert.equal(result.stderr, '');
    assert.deepEqual(fs.readFileSync(capturePath, 'utf8').trim().split('\n'), [
      '--model',
      'gpt-5.4',
      'Plan the next paper submission steps.',
    ]);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(capturePath, { force: true });
  }
});

test('installed opl launcher bypasses Node for raw Codex exec paths', () => {
  const capturePath = path.join(os.tmpdir(), `opl-launcher-exec-args-${process.pid}.txt`);
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
printf '%s\\n' "$@" > ${JSON.stringify(capturePath)}
echo "LAUNCHER RAW EXEC"
exit 0
`);

  try {
    const result = runEntryPathRaw(binPath, ['exec', '--model', 'gpt-5.4', 'hello'], {
      OPL_CODEX_BIN: codexPath,
    });

    assert.equal(result.stdout, 'LAUNCHER RAW EXEC\n');
    assert.equal(result.stderr, '');
    assert.deepEqual(fs.readFileSync(capturePath, 'utf8').trim().split('\n'), [
      'exec',
      '--model',
      'gpt-5.4',
      'hello',
    ]);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(capturePath, { force: true });
  }
});

test('exec command is a raw codex exec passthrough', () => {
  const capturePath = path.join(os.tmpdir(), `opl-codex-exec-args-${process.pid}.txt`);
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
printf '%s\\n' "$@" > ${JSON.stringify(capturePath)}
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
    const result = runCliRaw(['exec', '--model', 'gpt-5.4', 'Plan a medical grant proposal revision loop.'], {
      OPL_CODEX_BIN: codexPath,
    });

    assert.match(result.stdout, /"thread_id":"codex-exec-session"/);
    assert.match(result.stdout, /CODEX EXEC ONE SHOT/);
    assert.equal(result.stderr, '');
    assert.deepEqual(fs.readFileSync(capturePath, 'utf8').trim().split('\n'), [
      'exec',
      '--model',
      'gpt-5.4',
      'Plan a medical grant proposal revision loop.',
    ]);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(capturePath, { force: true });
  }
});

test('resume command is a raw codex resume passthrough', () => {
  const capturePath = path.join(os.tmpdir(), `opl-codex-resume-args-${process.pid}.txt`);
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
printf '%s\\n' "$@" > ${JSON.stringify(capturePath)}
if [ "$1" = "resume" ]; then
  cat <<'EOF'
CODEX RESUME RAW
EOF
  exit 0
fi
echo "unexpected fake-codex args: $*" >&2
exit 1
`);

  try {
    const result = runCliRaw(['resume', '--last', 'continue this session'], {
      OPL_CODEX_BIN: codexPath,
    });

    assert.equal(result.stdout, 'CODEX RESUME RAW\n');
    assert.equal(result.stderr, '');
    assert.deepEqual(fs.readFileSync(capturePath, 'utf8').trim().split('\n'), [
      'resume',
      '--last',
      'continue this session',
    ]);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(capturePath, { force: true });
  }
});

test('chat and shell keep compatibility aliases with Codex raw defaults', () => {
  const capturePath = path.join(os.tmpdir(), `opl-codex-chat-shell-args-${process.pid}.txt`);
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
printf '%s\\n' "$@" >> ${JSON.stringify(capturePath)}
echo "CODEX RAW: $*"
exit 0
echo "unexpected fake-codex args: $*" >&2
exit 1
`);

  try {
    const chatResult = runCliRaw(['chat', 'Plan the next paper submission steps.'], {
      OPL_CODEX_BIN: codexPath,
    });
    assert.equal(chatResult.stdout, 'CODEX RAW: Plan the next paper submission steps.\n');

    const shellResult = runCliRaw(['shell'], {
      OPL_CODEX_BIN: codexPath,
    });
    assert.equal(shellResult.stdout, 'CODEX RAW: \n');
    assert.equal(fs.readFileSync(capturePath, 'utf8'), 'Plan the next paper submission steps.\n\n');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(capturePath, { force: true });
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
