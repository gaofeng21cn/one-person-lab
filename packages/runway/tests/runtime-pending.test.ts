import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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

// Interrupt a separate process so every on-disk state comes from the real
// installer and a process exit cannot run its ordinary error recovery.
const interruptedActivation = `
  import fs from 'node:fs';
  import path from 'node:path';
  const { runtime, current, previous, pending, generation, stop } = JSON.parse(process.argv[2]);
  const transaction = path.join(generation, '.opl-v2-activation');
  const old = path.join(transaction, 'old');
  const next = path.join(transaction, 'next');
  const retired = path.join(transaction, 'retired');
  const firstSource = fs.existsSync(current) ? current : next;
  const rename = fs.renameSync;
  const remove = fs.rmSync;
  const interrupt = point => { if (stop === point) process.exit(86); };
  fs.renameSync = (from, to) => {
    if (to === path.join(transaction, 'prepared.json')) interrupt('preparing');
    if (from === firstSource) interrupt('prepared');
    if (to === pending) interrupt('committing');
    rename(from, to);
    if (from === current && to === old) interrupt('live-saved');
    if (from === next && to === current) interrupt('new-live');
    if (from === previous && to === retired) interrupt('rollback-retired');
    if (from === old && to === previous) interrupt('rollback-installed');
    if (to === pending) interrupt('committed');
  };
  fs.rmSync = (target, options) => {
    if (target === generation && stop === 'partly-cleaned') {
      remove(path.join(generation, 'bin'), { recursive: true, force: true });
      interrupt('partly-cleaned');
    }
    remove(target, options);
    if (target === generation) interrupt('stage-removed');
  };
  const { activateLegacyCodexGeneration } = await import(process.argv[1]);
  await activateLegacyCodexGeneration(runtime, process.env);
`;

const activationModule = new URL('../src/executors/codex/runtime-pending.ts', import.meta.url).href;
const cleanupPoints = ['committed', 'partly-cleaned', 'stage-removed'];
const layouts = [
  {
    name: 'upgrade with rollback', live: true, previous: true,
    points: ['preparing', 'prepared', 'live-saved', 'new-live', 'rollback-retired', 'rollback-installed', 'committing', ...cleanupPoints],
  },
  {
    name: 'upgrade without rollback', live: true, previous: false,
    points: ['new-live', 'rollback-installed'],
  },
  {
    name: 'first install', live: false, previous: false,
    points: ['preparing', 'prepared', 'new-live', 'committing', ...cleanupPoints],
  },
];

for (const layout of layouts) {
  for (const stop of layout.points) {
    test(`${layout.name} recovers a process exit at ${stop}`, async (t) => {
      const f = installFixture(t);
      if (!layout.live) fs.rmSync(f.current, { recursive: true });
      if (!layout.previous) fs.rmSync(f.previous, { recursive: true });
      const { runtime, current, previous, pending, generation } = f;
      const crash = spawnSync(process.execPath, [
        '--conditions=opl-source', '--experimental-strip-types', '--input-type=module',
        '-e', interruptedActivation, activationModule,
        JSON.stringify({ runtime, current, previous, pending, generation, stop }),
      ], { env, encoding: 'utf8', timeout: 20_000 });
      assert.equal(crash.status, 86, crash.error?.message ?? crash.stderr);
      if (cleanupPoints.includes(stop)) {
        assert.deepEqual(JSON.parse(fs.readFileSync(pending, 'utf8')), {
          surface_kind: 'opl_runtime_applied_codex_generation.v2', generation: path.basename(generation),
        });
      }

      await activateLegacyCodexGeneration(runtime, env);
      assert.equal(fs.readFileSync(path.join(current, 'codex'), 'utf8'), candidate);
      assert.equal(fs.readFileSync(path.join(current, 'rg'), 'utf8'), 'staged search tool');
      if (layout.live) {
        assert.equal(fs.readFileSync(path.join(current, 'opl'), 'utf8'), 'existing tool');
        assert.equal(fs.readFileSync(path.join(previous, 'codex'), 'utf8'), 'active version');
        assert.equal(fs.readFileSync(path.join(previous, 'opl'), 'utf8'), 'existing tool');
      } else {
        assert.equal(fs.existsSync(previous), false);
      }
      assert.equal(fs.existsSync(generation), false);
      assert.equal(fs.existsSync(pending), false);
      assert.equal(await activateLegacyCodexGeneration(runtime, env), 'none');
    });
  }
}

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
