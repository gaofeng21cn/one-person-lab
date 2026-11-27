import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { openSqliteStore } from '@opl/core';
import { createPackService, ensurePackage, type OplPackageManifestV2, type PackError } from '../src/index.ts';

function fixture(t: { after(fn: () => void): void }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-ensure-'));
  const stateDir = path.join(root, 'state');
  const db = openSqliteStore(path.join(stateDir, 'opl.db'));
  t.after(() => { db.close(); fs.rmSync(root, { recursive: true, force: true }); });
  const pack = createPackService({ db, stateDir, marketplaceRoot: path.join(root, 'marketplace') });
  const resolved: string[] = [];
  const disposed: string[] = [];
  const sources = new Map<string, { manifest: OplPackageManifestV2; dir: string }>();
  function publish(id: string, dependencies: NonNullable<OplPackageManifestV2['dependencies']>['packages'] = [], skills: string[] = []) {
    const manifest: OplPackageManifestV2 = {
      schema_version: 'opl.package.v2',
      identity: { id, version: '1.0.0', intent: 'extension', name: { 'en-US': id, 'zh-CN': id }, summary: { 'en-US': id, 'zh-CN': id }, publisher: 'opl' },
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
