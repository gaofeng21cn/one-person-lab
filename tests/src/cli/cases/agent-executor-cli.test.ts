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

test('explicit Hermes-Agent executor fails closed when binary is missing', () => {
  const failure = runCliFailure(['executor', 'doctor', '--executor', 'hermes_agent'], {
    OPL_HERMES_AGENT_EXECUTOR_BIN: '',
    PATH: '',
  });

  assert.equal(failure.status, 4);
  assert.equal(failure.payload.error.code, 'surface_not_found');
  assert.equal(failure.payload.error.details.executor_kind, 'hermes_agent');
  assert.equal(failure.payload.error.details.fallback_allowed, false);
});

test('Codex executor receipt exposes model route and local config provenance', () => {
  const fake = makeExecutable(
    'codex',
    '#!/bin/sh\nprintf \'{"type":"thread.started","thread_id":"thread_receipt"}\\n{"type":"agent_message","message":"ok"}\\n\'\n',
  );
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-executor-codex-home-'));
  const codexHome = path.join(homeRoot, 'codex-home');
  const requestRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-executor-codex-request-'));
  const requestPath = path.join(requestRoot, 'request.json');
  fs.writeFileSync(requestPath, JSON.stringify({
    executor_kind: 'codex_cli',
    prompt: 'Execute through Codex CLI.',
    cwd: repoRoot,
    model: 'gpt-5.5',
    provider: 'gflab',
    reasoning_effort: 'xhigh',
    required_capabilities: ['image_generation'],
  }));

  try {
    const run = runCli(['executor', 'run', '--request', requestPath], {
      OPL_CODEX_BIN: fake.file,
      CODEX_HOME: codexHome,
      PATH: '',
    });
    const proof = run.agent_execution_receipt.proof;
    assert.equal(run.agent_execution_receipt.executor_kind, 'codex_cli');
    assert.deepEqual(run.agent_execution_receipt.requested_capabilities, ['image_generation']);
    assert.deepEqual(run.agent_execution_receipt.activated_capabilities, ['image_generation']);
    assert.equal(proof.model, 'gpt-5.5');
    assert.equal(proof.provider, 'gflab');
    assert.equal(proof.reasoning_effort, 'xhigh');
    assert.equal(proof.codex_binary_path, fake.file);
    assert.equal(proof.codex_binary_source, 'env');
    assert.equal(proof.codex_home, codexHome);
    assert.equal(proof.codex_config_path, path.join(codexHome, 'config.toml'));
    assert.deepEqual(proof.command_preview.slice(0, 5), [
      'codex',
      'exec',
      '--skip-git-repo-check',
      '--full-auto',
      '--json',
    ]);
    assert.equal(proof.command_preview.includes('--model'), true);
    assert.equal(proof.command_preview.includes('gpt-5.5'), true);
    assert.equal(proof.command_preview.includes('image_generation'), true);
  } finally {
    fs.rmSync(fake.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(requestRoot, { recursive: true, force: true });
  }
});
