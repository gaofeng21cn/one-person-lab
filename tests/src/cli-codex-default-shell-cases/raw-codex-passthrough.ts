import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  createFakeCodexFixture,
  retiredCliCommandMatrix,
  runCli,
  runCliFailure,
  runCliRaw,
} from '../cli-codex-default-shell-helpers.ts';

test('bare opl command is a raw Codex product entry passthrough by default', () => {
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
if [ "$#" -eq 0 ]; then
  cat <<'EOF'
CODEX ENTRY
EOF
  exit 0
fi
if [ "$1" = "exec" ]; then
  cat <<'EOF'
{"type":"thread.started","thread_id":"codex-product-entry-fallback"}
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

    assert.equal(result.stdout, 'CODEX ENTRY\n');
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
    const result = runCliRaw(
      ['exec', '--cd', '/tmp/opl-exec-smoke', '--model', 'gpt-5.4', 'Plan a medical grant proposal revision loop.'],
      {
        OPL_CODEX_BIN: codexPath,
      },
    );

    assert.match(result.stdout, /"thread_id":"codex-exec-session"/);
    assert.match(result.stdout, /CODEX EXEC ONE SHOT/);
    assert.equal(result.stderr, '');
    assert.deepEqual(fs.readFileSync(capturePath, 'utf8').trim().split('\n'), [
      'exec',
      '--cd',
      '/tmp/opl-exec-smoke',
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

test('removed command aliases fail closed in favor of Codex-default shell and Connect skill sync', () => {
  for (const retired of retiredCliCommandMatrix) {
    const failure = runCliFailure(retired.args);
    assert.equal(failure.status, 2);
    assert.equal(failure.payload.error.code, retired.errorCode);
    if (retired.errorCode === 'cli_usage_error') {
      assert.match(failure.payload.error.message, new RegExp(`Command "${retired.command}" has been retired`));
    }
    for (const replacement of retired.replacements ?? []) {
      assert.match(failure.payload.error.message, replacement);
    }
  }
});

test('help text advertises Codex and Connect as default entries without retired aliases', () => {
  const output = runCli(['help']);
  const commands = output.help.commands as Array<{ command: string; summary: string }>;

  assert.equal(commands.some((entry) => entry.command === 'exec'), true);
  assert.equal(commands.some((entry) => entry.command === 'ask'), false);
  assert.equal(commands.some((entry) => entry.command === 'chat'), false);
  assert.equal(commands.some((entry) => entry.command === 'shell'), false);
  assert.equal(commands.some((entry) => entry.command === 'connect skills'), true);
  assert.equal(commands.some((entry) => entry.command === 'connect sync-skills'), true);
  assert.equal(commands.some((entry) => entry.command === 'foundry status'), true);
  assert.equal(commands.some((entry) => entry.command === 'foundry versions'), true);
  assert.equal(commands.some((entry) => entry.command.startsWith('agents foundry ')), false);
  assert.equal(commands.some((entry) => entry.command === 'skill list'), false);
  assert.equal(commands.some((entry) => entry.command === 'skill sync'), false);

  const diagnostics = output.help.diagnostic_command_groups as Array<{ group_id: string }>;
  const hiddenImplementationBuckets = [
    'domain manifests',
    'family-runtime',
    'index',
    'stage-artifact',
    'executor doctor',
    'executor run',
    'engine install',
    'status runtime',
    'session ledger',
  ];
  for (const command of hiddenImplementationBuckets) {
    assert.equal(commands.some((entry) => entry.command === command), false, command);
    assert.equal(runCli(['help', ...command.split(' ')]).help.command, command);
  }
  for (const groupId of ['domain', 'engine', 'runtime', 'session', 'skill', 'status', 'system']) {
    assert.equal(diagnostics.some((entry) => entry.group_id === groupId), true, groupId);
  }
});
