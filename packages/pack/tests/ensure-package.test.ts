import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { openSqliteStore } from '@opl/core';
import { buildPackage, verifyReleaseLock, createPackService, ensurePackage, type OplPackageManifestV2, type PackError } from '../src/index.ts';

function fixture(t: { after(fn: () => void): void }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-ensure-'));
  const stateDir = path.join(root, 'state');
  const db = openSqliteStore(path.join(stateDir, 'opl.db'));
  t.after(() => { db.close(); fs.rmSync(root, { recursive: true, force: true }); });
  const pack = createPackService({ db, stateDir, marketplaceRoot: path.join(root, 'marketplace') });
  const resolved: string[] = [];
  const disposed: string[] = [];
  const sources = new Map<string, { manifest: OplPackageManifestV2; dir: string }>();
  function publish(id: string, dependencies: NonNullable<OplPackageManifestV2['dependencies']>['packages'] = [], skills: string[] = [], version = '1.0.0') {
    const manifest: OplPackageManifestV2 = {
      schema_version: 'opl.package.v2',
      identity: { id, version, intent: 'extension', name: { 'en-US': id, 'zh-CN': id }, summary: { 'en-US': id, 'zh-CN': id }, publisher: 'opl' },
      host_hints: { codex: { sync_enabled: false } },
      dependencies: { packages: dependencies },
      provides: { skills: skills.map(skill => ({ id: skill, path: './skills/' + skill })) },
    };
    const dir = fs.mkdtempSync(path.join(root, id + '-'));
    fs.writeFileSync(path.join(dir, 'opl-package.json'), JSON.stringify(manifest));
    for (const skill of skills) {
      fs.mkdirSync(path.join(dir, 'skills', skill), { recursive: true });
      fs.writeFileSync(path.join(dir, 'skills', skill, 'SKILL.md'), '# ' + skill);
    }
    sources.set(id, { manifest, dir });
    return dir;
  }
  const resolveSource = async (id: string) => {
    const entry = sources.get(id);
    assert.ok(entry, 'undeclared source request for ' + id);
    resolved.push(id);
    return { manifest: entry.manifest, source: { kind: 'local_dir' as const, path: entry.dir }, dispose: () => { disposed.push(id); } };
  };
  return { pack, publish, resolveSource, resolved, disposed };
}

test('previews, installs and restores the required graph from official sources; healthy leaves require no source', async t => {
  const { pack, publish, resolveSource, resolved, disposed } = fixture(t);
  publish('base', [], ['skill-one']);
  publish('root', [{ id: 'base', required_capabilities: ['skill-one'] }, { id: 'opt', optional: true }]);
  const options = { packageId: 'root', resolveSource };
  const preview = await ensurePackage(pack, { ...options, dryRun: true });
  assert.deepEqual([preview.changed, preview.status], [false, 'validated']);
  assert.equal(pack.list().length, 0);
  const [first, again] = await Promise.all([ensurePackage(pack, options), ensurePackage(pack, options)]);
  assert.deepEqual([first.status, again.status], ['installed', 'already_present']);
  assert.deepEqual(first.packages, [{ package_id: 'base', action: 'install' }, { package_id: 'root', action: 'install' }]);
  assert.deepEqual(disposed.sort(), [...resolved].sort());
  await pack.toggle({ packageId: 'base', enabled: false });
  const restore = await ensurePackage(pack, options);
  assert.equal(restore.status, 'reconciled');
  assert.equal(restore.packages[0]?.action, 'enable');
  assert.equal(pack.inspect('base')?.enabled, true);
  assert.equal(pack.list().length, 2);
});

test('checks new capability requirements in a diamond and does not replace a development source', async t => {
  const { pack, publish, resolveSource } = fixture(t);
  const dir = publish('base');
  await pack.link({ dir });
  publish('base', [], ['additional']);
  publish('left', [{ id: 'base' }]);
  publish('right', [{ id: 'base', required_capabilities: ['additional'] }]);
  publish('root', [{ id: 'left' }, { id: 'right' }]);
  const options = { packageId: 'root', resolveSource };
  await assert.rejects(ensurePackage(pack, options), (e: PackError) => e.code === 'PACK_DEPENDENCY_MISSING');
  assert.deepEqual(pack.list().map(p => p.package_id), ['base']);
  await pack.unlink({ packageId: 'base' });
  await pack.install({ source: { kind: 'local_dir', path: dir } });
  const result = await ensurePackage(pack, options);
  assert.equal(result.status, 'installed');
  assert.equal(pack.inspect('base')?.manifest.provides?.skills?.[0].id, 'additional');
});

test('rejects a cyclic dependency and an incorrect source identity before installing packages', async t => {
  const { pack, publish, resolveSource, resolved, disposed } = fixture(t);
  publish('first', [{ id: 'second' }]);
  publish('second', [{ id: 'first' }]);
  const options = { packageId: 'first', resolveSource };
  await assert.rejects(ensurePackage(pack, options), /cycle/);
  await assert.rejects(ensurePackage(pack, { ...options, resolveSource: () => resolveSource('second') }), /another Package/);
  assert.deepEqual(pack.list(), []);
  assert.equal(disposed.length, resolved.length);
});

test('a stalled official source does not block an unrelated restore', { timeout: 5000 }, async t => {
  const { pack, publish, resolveSource } = fixture(t);
  publish('slow');
  publish('independent');
  const started = Promise.withResolvers<void>();
  const proceed = Promise.withResolvers<void>();
  const slow = ensurePackage(pack, { packageId: 'slow', resolveSource: async id => {
    started.resolve();
    await proceed.promise;
    return resolveSource(id);
  } });
  await started.promise;
  try {
    assert.equal((await ensurePackage(pack, { packageId: 'independent', resolveSource })).status, 'installed');
  } finally {
    proceed.resolve();
    await slow;
  }
});

function lockRelease(dir: string, gitCommit: string) {
  const { lock } = buildPackage(dir, { gitCommit });
  return { version: lock.version, git_commit: gitCommit, digest: lock.digest };
}

test('activates the approved official release over a disabled older version and restores it offline', async t => {
  const { pack, publish, resolved, resolveSource } = fixture(t);
  const old = publish('root');
  await pack.install({ source: { kind: 'local_dir', path: old } });
  await pack.toggle({ packageId: 'root', enabled: false });
  publish('new-dep');
  const dir = publish('root', [{ id: 'new-dep' }], [], '1.1.0');
  const exactRelease = lockRelease(dir, '1'.repeat(40));
  const options = { packageId: 'root', exactRelease, resolveSource };
  assert.equal((await ensurePackage(pack, { ...options, dryRun: true })).status, 'validated');
  assert.equal(pack.inspect('root')?.enabled, false);
  assert.equal(pack.inspect('new-dep'), null);
  assert.equal((await ensurePackage(pack, options)).status, 'reconciled');
  assert.deepEqual(pack.store.getInstallSource('root'), { kind: 'official', package_id: 'root' });
  const installed = pack.inspect('root')!;
  assert.equal(installed.enabled, true);
  assert.equal(installed.content_digest, exactRelease.digest);
  assert.equal(verifyReleaseLock(installed.install_path).lock.git_commit, exactRelease.git_commit);
  const offline = { ...options, resolveSource: async () => assert.fail('already installed release needed a source') };
  assert.equal((await ensurePackage(pack, offline)).status, 'already_present');
  assert.deepEqual(resolved, ['root', 'new-dep', 'root', 'new-dep']);
});

test('distinguishes matching manifests with different commits or bytes and repairs changed installed bytes', async t => {
  const { pack, publish, resolveSource } = fixture(t);
  const dir = publish('root');
  const opts = { packageId: 'root', resolveSource };
  const first = lockRelease(dir, '1'.repeat(40));
  await ensurePackage(pack, { ...opts, exactRelease: first });
  const second = lockRelease(dir, '2'.repeat(40));
  assert.equal(first.digest, second.digest);
  assert.equal((await ensurePackage(pack, { ...opts, exactRelease: second })).changed, true);
  fs.writeFileSync(path.join(dir, 'payload.txt'), 'new');
  const third = lockRelease(dir, second.git_commit);
  assert.notEqual(second.digest, third.digest);
  await ensurePackage(pack, { ...opts, exactRelease: third });
  const installedPath = pack.inspect('root')!.install_path;
  const installedFile = path.join(installedPath, 'payload.txt');
  fs.writeFileSync(installedFile, 'damaged');
  await ensurePackage(pack, { ...opts, exactRelease: third });
  assert.equal(fs.readFileSync(installedFile, 'utf8'), 'new');
  assert.equal(verifyReleaseLock(installedPath).digest, third.digest);
});

test('rejects a stale approval before installing even a dependency and preserves development links', async t => {
  const { pack, publish, resolveSource, resolved } = fixture(t);
  const old = publish('root');
  await pack.install({ source: { kind: 'local_dir', path: old } });
  const dir = publish('root', [{ id: 'dep' }], [], '2.0.0');
  publish('dep');
  const release = lockRelease(dir, '3'.repeat(40));
  for (const change of [{ version: '2.0.1' }, { git_commit: '0'.repeat(40) }, { digest: 'sha256:' + '0'.repeat(64) }]) {
    await assert.rejects(ensurePackage(pack, { packageId: 'root', resolveSource, exactRelease: { ...release, ...change } }),
      (error: PackError) => error.code === 'PACK_LOCK_MISMATCH');
  }
  assert.equal(pack.inspect('dep'), null);
  assert.equal(pack.inspect('root')?.version, '1.0.0');
  assert.deepEqual(resolved, ['root', 'root', 'root']);
  await pack.link({ dir: old });
  await assert.rejects(ensurePackage(pack, { packageId: 'root', resolveSource, exactRelease: release }), /not a managed release/);
  assert.deepEqual(resolved, ['root', 'root', 'root']);
  assert.equal(pack.inspect('root')?.install_mode, 'dev_link');
});

test('rejects a changed source at install time and preserves a concurrent development link', async t => {
  const { pack, publish, resolveSource } = fixture(t);
  const dir = publish('root');
  const exactRelease = lockRelease(dir, '1'.repeat(40));
  const options = { packageId: 'root', exactRelease, resolveSource };
  await assert.rejects(ensurePackage(pack, { ...options, installSource: async input => {
    lockRelease(dir, '2'.repeat(40));
    return pack.install(input);
  } }), (error: PackError) => error.code === 'PACK_LOCK_MISMATCH');
  assert.equal(pack.inspect('root'), null);
  lockRelease(dir, exactRelease.git_commit);
  await assert.rejects(ensurePackage(pack, { ...options, installSource: async input => {
    await pack.link({ dir });
    return pack.install(input);
  } }), (error: PackError) => error.code === 'PACK_OPERATION_BUSY');
  assert.equal(pack.inspect('root')?.install_mode, 'dev_link');
});
