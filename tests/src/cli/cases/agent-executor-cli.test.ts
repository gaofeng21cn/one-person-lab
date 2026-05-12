import { assert, fs, os, path, repoRoot, runCli, runCliFailure } from '../helpers.ts';
import test from 'node:test';

function makeExecutable(name: string, body: string) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-executor-cli-'));
  const file = path.join(fixtureRoot, name);
  fs.writeFileSync(file, body, { mode: 0o755 });
  return { fixtureRoot, file };
}

test('executor CLI exposes doctor and request-file run surfaces', () => {
  const fake = makeExecutable(
    'claude',
    '#!/bin/sh\nprintf \'{"surface_kind":"stage_attempt_closeout_packet","closeout_refs":["receipt:cli"]}\\n\'\n',
  );
  const requestRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-executor-request-'));
  const requestPath = path.join(requestRoot, 'request.json');
  fs.writeFileSync(requestPath, JSON.stringify({
    executor_kind: 'claude_code',
    prompt: 'Execute through CLI.',
    cwd: repoRoot,
  }));

  try {
    const doctor = runCli(['executor', 'doctor', '--executor', 'claude_code'], {
      OPL_CLAUDE_CODE_BIN: fake.file,
      PATH: '',
    });
    assert.equal(doctor.executor_doctor.ready, true);
    assert.equal(doctor.executor_doctor.executor_kind, 'claude_code');

    const run = runCli(['executor', 'run', '--request', requestPath], {
      OPL_CLAUDE_CODE_BIN: fake.file,
      PATH: '',
    });
    assert.equal(run.agent_execution_receipt.executor_kind, 'claude_code');
    assert.equal(run.agent_execution_receipt.closeout_packet.closeout_refs[0], 'receipt:cli');
  } finally {
    fs.rmSync(fake.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(requestRoot, { recursive: true, force: true });
  }
});

test('explicit non-default executor fails closed when binary is missing', () => {
  const failure = runCliFailure(['executor', 'doctor', '--executor', 'hermes_agent'], {
    OPL_HERMES_AGENT_EXECUTOR_BIN: '',
    PATH: '',
  });

  assert.equal(failure.status, 4);
  assert.equal(failure.payload.error.code, 'surface_not_found');
  assert.equal(failure.payload.error.details.fallback_allowed, false);
});
