import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { activateLegacyCodexGeneration } from '../src/executors/codex/runtime-pending.ts';

// v1 staged a native executable with a successful App Server protocol receipt.
const candidate = `#!/usr/bin/env node
if (process.argv[2] === '--version') {
  console.log('codex-cli 0.169.0');
} else if (process.argv[2] === 'app-server') {
  const input = require('node:readline').createInterface({ input: process.stdin });
  input.on('line', line => {
    const { id, method } = JSON.parse(line);
    if (method === 'initialize') console.log(JSON.stringify({ id, result: { userAgent: 'codex-cli/0.169.0' } }));
    if (method === 'thread/list') console.log(JSON.stringify({ id, result: { data: [], nextCursor: null } }));
  });
} else process.exitCode = 2;
`;

function installFixture(t: TestContext) {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'opl-v1-pending-')));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const runtime = path.join(tmp, 'runtime');
  const generation = path.join(runtime, 'generations', 'codex-1000-42');
  const current = path.join(runtime, 'current', 'bin');
  const previous = path.join(runtime, 'previous-toolchain');
  const pending = path.join(runtime, 'pending-codex-generation.json');
  for (const directory of [current, previous, path.join(generation, 'bin')]) fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(current, 'codex'), 'active version', { mode: 0o755 });
  fs.writeFileSync(path.join(current, 'opl'), 'existing tool', { mode: 0o755 });
  fs.writeFileSync(path.join(previous, 'codex'), 'older version', { mode: 0o755 });
  fs.writeFileSync(path.join(generation, 'bin', 'codex'), candidate, { mode: 0o755 });
  fs.writeFileSync(path.join(generation, 'bin', 'opl'), 'old tool at staging time', { mode: 0o755 });
  fs.writeFileSync(path.join(generation, 'bin', 'rg'), 'staged search tool', { mode: 0o755 });
  const receipt = {
    surface_kind: 'opl_runtime_pending_generation.v1', dependency_id: 'codex-cli',
    generation_root: generation, version: '0.169.0',
    codex_sha256: crypto.createHash('sha256').update(candidate).digest('hex'),
    protocol_verification: { verified: true, protocol: 'initialize_initialized_thread_list.v1', reason: null },
    staged_at: new Date(1000).toISOString(), activation: 'next_app_start',
    rollback_root: previous, staging_process_instance_id: 'desktop:first-launch',
  };
  fs.writeFileSync(pending, JSON.stringify(receipt));
  return { tmp, runtime, generation, current, previous, pending, receipt };
}

const env = { PATH: path.dirname(process.execPath), OPL_APP_PROCESS_INSTANCE_ID: 'desktop:next-launch' };

test('upgrade activates a v1 pending Codex once and retains the running toolchain for rollback', async (t) => {
  const f = installFixture(t);
  const stagingEnv = { ...env, OPL_APP_PROCESS_INSTANCE_ID: f.receipt.staging_process_instance_id };
  assert.equal(await activateLegacyCodexGeneration(f.runtime, stagingEnv), 'deferred_same_app_instance');
  assert.equal(fs.readFileSync(path.join(f.current, 'codex'), 'utf8'), 'active version');
  assert.equal(fs.existsSync(f.pending), true);

  assert.equal(await activateLegacyCodexGeneration(f.runtime, env), 'activated');
  assert.equal(fs.readFileSync(path.join(f.current, 'codex'), 'utf8'), candidate);
  assert.equal(fs.readFileSync(path.join(f.current, 'opl'), 'utf8'), 'existing tool');
  assert.equal(fs.readFileSync(path.join(f.current, 'rg'), 'utf8'), 'staged search tool');
  assert.equal(fs.readFileSync(path.join(f.previous, 'codex'), 'utf8'), 'active version');
  assert.equal(fs.existsSync(f.pending), false);
  assert.equal(await activateLegacyCodexGeneration(f.runtime, env), 'none');
  assert.equal(fs.readFileSync(path.join(f.previous, 'codex'), 'utf8'), 'active version');
});

test('first install activates a v1 pending Codex even when it was staged by the current app instance', async (t) => {
  const f = installFixture(t);
  fs.rmSync(f.current, { recursive: true, force: true });
  fs.rmSync(f.previous, { recursive: true, force: true });
  const stagingEnv = { ...env, OPL_APP_PROCESS_INSTANCE_ID: f.receipt.staging_process_instance_id };

  assert.equal(await activateLegacyCodexGeneration(f.runtime, stagingEnv), 'activated');
  assert.equal(fs.readFileSync(path.join(f.current, 'codex'), 'utf8'), candidate);
  assert.equal(fs.existsSync(f.previous), false);
  assert.equal(fs.existsSync(f.pending), false);
});

test('upgrade recovers a crash after the old bin directory was moved, then activates the pending generation', async (t) => {
  const f = installFixture(t);
  const transaction = path.join(f.generation, '.opl-v2-activation');
  fs.mkdirSync(transaction);
  fs.cpSync(f.current, path.join(transaction, 'next'), { recursive: true });
  fs.writeFileSync(path.join(transaction, 'prepared.json'), JSON.stringify({ hadLive: true }));
  fs.renameSync(f.current, path.join(transaction, 'old'));

  assert.equal(await activateLegacyCodexGeneration(f.runtime, env), 'activated');
  assert.equal(fs.readFileSync(path.join(f.current, 'codex'), 'utf8'), candidate);
  assert.equal(fs.readFileSync(path.join(f.previous, 'codex'), 'utf8'), 'active version');
  assert.equal(fs.existsSync(transaction), false);
});

for (const invalid of ['digest', 'version', 'protocol', 'escaped generation'] as const) {
  test(`upgrade preserves the active and rollback binaries when a pending generation has an invalid ${invalid}`, async (t) => {
    const f = installFixture(t);
    if (invalid === 'digest') f.receipt.codex_sha256 = '0'.repeat(64);
    if (invalid === 'version') f.receipt.version = '0.170.0';
    if (invalid === 'protocol') f.receipt.protocol_verification.verified = false;
    if (invalid === 'escaped generation') {
      const outside = path.join(f.tmp, 'outside');
      fs.renameSync(f.generation, outside);
      fs.symlinkSync(outside, f.generation, 'dir');
    }
    const bytes = JSON.stringify(f.receipt);
    fs.writeFileSync(f.pending, bytes);
    await assert.rejects(activateLegacyCodexGeneration(f.runtime, env));
    assert.equal(fs.readFileSync(f.pending, 'utf8'), bytes);
    assert.equal(fs.readFileSync(path.join(f.generation, 'bin', 'codex'), 'utf8'), candidate);
    assert.equal(fs.readFileSync(path.join(f.current, 'codex'), 'utf8'), 'active version');
    assert.equal(fs.readFileSync(path.join(f.previous, 'codex'), 'utf8'), 'older version');
  });
}

test('upgrade refuses an executable whose actual App Server protocol no longer matches its staging receipt', async (t) => {
  const f = installFixture(t);
  const invalidCandidate = '#!/usr/bin/env node\nif (process.argv[2] === "--version") console.log("codex-cli 0.169.0"); else console.log("not-json");\n';
  fs.writeFileSync(path.join(f.generation, 'bin', 'codex'), invalidCandidate, { mode: 0o755 });
  f.receipt.codex_sha256 = crypto.createHash('sha256').update(invalidCandidate).digest('hex');
  fs.writeFileSync(f.pending, JSON.stringify(f.receipt));

  await assert.rejects(activateLegacyCodexGeneration(f.runtime, env));
  assert.equal(fs.readFileSync(path.join(f.generation, 'bin', 'codex'), 'utf8'), invalidCandidate);
  assert.equal(fs.readFileSync(path.join(f.current, 'codex'), 'utf8'), 'active version');
  assert.equal(fs.readFileSync(path.join(f.previous, 'codex'), 'utf8'), 'older version');
  assert.equal(fs.existsSync(f.pending), true);
});
