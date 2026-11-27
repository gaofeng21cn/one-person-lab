import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { acquireAdvisoryLock } from '@opl/core';
import { createPackageSourceArchive } from '@opl/pack';
import { stageCodexPayload } from '../src/executors/codex/runtime-payload.ts';
import { activateCodexRuntime, ensureCodexRuntime } from '../src/executors/codex/runtime-install.ts';
import { codexRuntimeRoot, managedCodexBinary } from '../src/executors/codex/binary.ts';

test('an explicit private Codex path permits first install, while an invalid external selection stays authoritative', async (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-codex-first-selection-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const env: NodeJS.ProcessEnv = { HOME: home, PATH: '', OPL_FULL_RUNTIME_HOME: home };
  env.OPL_CODEX_BIN = managedCodexBinary(env);
  fs.mkdirSync(path.join(home, 'manifest'));
  fs.writeFileSync(path.join(home, 'manifest', 'full-package-manifest.json'), '{}');
  assert.deepEqual(await activateCodexRuntime(env), { status: 'unavailable', runtime_binary_path: null });
  await assert.rejects(ensureCodexRuntime(env), /missing its verified Codex offline seed/);

  if (process.platform !== 'win32') {
    fs.writeFileSync(env.OPL_CODEX_BIN, 'unusable private executable', { mode: 0o600 });
    assert.deepEqual(await activateCodexRuntime(env), { status: 'unavailable', runtime_binary_path: null });
    await assert.rejects(ensureCodexRuntime(env), /missing its verified Codex offline seed/);
    assert.equal(fs.readFileSync(env.OPL_CODEX_BIN, 'utf8'), 'unusable private executable');
  }

  env.OPL_CODEX_BIN = path.join(home, 'external', 'codex');
  await assert.rejects(activateCodexRuntime(env), /OPL_CODEX_BIN/);
  await assert.rejects(ensureCodexRuntime(env), /OPL_CODEX_BIN/);
});

test('a second installer waits across a slow download and never reclaims the live installer by age', async (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-codex-install-wait-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const env: NodeJS.ProcessEnv = { HOME: home, PATH: '', OPL_FULL_RUNTIME_HOME: home };
  fs.mkdirSync(path.join(home, 'manifest'));
  fs.writeFileSync(path.join(home, 'manifest', 'full-package-manifest.json'), '{}');
  const lockPath = path.join(codexRuntimeRoot(env), 'codex-install.lock');
  const holder = acquireAdvisoryLock(lockPath);
  t.after(() => holder.release());
  let result: unknown;
  const waiter = ensureCodexRuntime(env).catch(error => { result = error; });
  const now = Date.now();
  let advanced = now + 6 * 60_000;
  t.mock.method(Date, 'now', () => advanced);
  try {
    await delay(400);
    assert.equal(result, undefined);
    advanced = now + 31 * 60_000;
    await delay(400);
    assert.equal(result, undefined);
    assert.equal(fs.existsSync(lockPath), true);
  } finally {
    holder.release();
    await waiter;
  }
  assert.match(String(result), /missing its verified Codex offline seed/);
});

test('Codex install lock timeout and cancellation preserve a live holder', async t => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-codex-install-busy-'));
  const env = { HOME: home, OPL_RUNTIME_ROOT: home };
  const lockPath = path.join(home, 'codex-install.lock');
  const holder = acquireAdvisoryLock(lockPath);
  t.after(() => {
    holder.release();
    fs.rmSync(home, { recursive: true, force: true });
  });
  const original = fs.readFileSync(lockPath, 'utf8');
  await assert.rejects(ensureCodexRuntime(env, { timeoutMs: 20 }), { code: 'CODEX_INSTALL_BUSY' });
  const controller = new AbortController();
  const waiting = ensureCodexRuntime(env, { signal: controller.signal });
  controller.abort();
  await assert.rejects(waiting, { code: 'CODEX_INSTALL_BUSY' });
  assert.equal(fs.readFileSync(lockPath, 'utf8'), original);
});

test('Full Codex staging verifies frozen bytes and refuses an archive for another platform', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-codex-seed-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const version = '1.2.3';
  const platform = `${process.platform}-${process.arch}`;
  const seedDir = path.join(root, 'runtime-payloads', 'codex-cli', version);
  const packageDir = path.join(root, 'input', 'package');
  fs.mkdirSync(seedDir, { recursive: true });
  fs.mkdirSync(packageDir, { recursive: true });
  const archives: Record<string, {path: string; sha256: string; size_bytes: number}> = {};
  for (const [kind, manifest] of Object.entries({
    package: { name: '@openai/codex', version, optionalDependencies: { [`@openai/codex-${platform}`]: `npm:@openai/codex@${version}-${platform}` } },
    platform: { name: '@openai/codex', version: `${version}-other-architecture` },
  })) {
    fs.writeFileSync(path.join(packageDir, 'package.json'), JSON.stringify(manifest));
    const archivePath = path.join(seedDir, `${kind}.tgz`);
    const digest = createPackageSourceArchive(path.dirname(packageDir), archivePath, ['package']);
    archives[kind] = { path: `runtime-payloads/codex-cli/${version}/${kind}.tgz`, sha256: digest.slice('sha256:'.length), size_bytes: fs.statSync(archivePath).size };
  }
  const outputManifest = path.join(root, 'manifest', 'full-package-manifest.json');
  const saveManifest = () => fs.writeFileSync(outputManifest, JSON.stringify({
    codex_offline_seed: { schema: 'opl_full_codex_offline_seed.v1', installation_owner: 'one-person-lab', version, archives },
  }));
  fs.mkdirSync(path.dirname(outputManifest));
  saveManifest();
  const stage = () => stageCodexPayload(fs.mkdtempSync(path.join(root, 'stage-')), { OPL_FULL_RUNTIME_HOME: root });
  await assert.rejects(stage(), /platform Package identity/);
  archives.platform.sha256 = '0'.repeat(64);
  saveManifest();
  await assert.rejects(stage(), /does not match the frozen manifest/);
});
