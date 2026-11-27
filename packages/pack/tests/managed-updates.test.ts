import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { openSqliteStore } from '@opl/core';
import { buildPackage, createPackService, readPackageManifestFromDir } from '../src/index.ts';

function setup(t: TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-updates-'));
  const stateDir = path.join(root, 'state');
  const marketplaceRoot = path.join(root, 'marketplace');
  let db = openSqliteStore(path.join(stateDir, 'opl.db'));
  t.after(() => {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const openService = () => createPackService({ db, stateDir, marketplaceRoot });
  const reopen = () => {
    db.close();
    db = openSqliteStore(path.join(stateDir, 'opl.db'));
    return openService();
  };
  return { root, marketplaceRoot, reopen, service: openService() };
}

function writeRelease(root: string, id: string, version: string) {
  const source = { kind: 'local_dir' as const, path: path.join(root, id) };
  const label = { 'en-US': id, 'zh-CN': id };
  const skillDir = path.join(source.path, 'skills', id);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), version);
  fs.writeFileSync(path.join(source.path, 'opl-package.json'), JSON.stringify({
    schema_version: 'opl.package.v2',
    identity: { id, version, name: label, summary: label, intent: 'extension', publisher: 'OPL' },
    provides: { skills: [{ id, path: './skills/' + id }] },
  }));
  return source;
}

test('planning reads the saved source after restart and batch apply preserves disabled state', async (t) => {
  const { root, marketplaceRoot, reopen, service } = setup(t);
  const id = 'disabled-extension';
  const projectionPath = path.join(marketplaceRoot, 'plugins', id);
  await service.install({ source: writeRelease(root, id, '1.0.0') });
  assert.equal(fs.existsSync(projectionPath), true);
  await service.toggle({ packageId: id, enabled: false });
  writeRelease(root, id, '1.1.0');

  assert.equal(fs.existsSync(projectionPath), false);
  const reopened = reopen();
  const operations = reopened.operationStatus();
  const plan = await reopened.updatePlan();
  assert.equal(plan.packages.length, 1);
  const [candidate] = plan.packages;
  assert.ok(candidate);
  assert.equal(candidate.package_id, id);
  assert.equal(candidate.installed_version, '1.0.0');
  assert.equal(candidate.available_version, '1.1.0');
  assert.equal(candidate.status, 'available');
  assert.equal(candidate.background_eligible, false);
  assert.deepEqual((await reopened.updateAll({ background: true })).results, []);
  const empty = await reopened.updateAll({ updates: [] });
  assert.deepEqual(empty.results, []);
  assert.equal(reopened.inspect(id)?.version, '1.0.0');
  assert.deepEqual(reopened.operationStatus(), operations);

  const applied = await reopened.updateAll({});
  assert.deepEqual(applied.results.map(({ package: pkg }) => pkg.package_id), [id]);
  const installed = reopened.inspect(id);
  assert.ok(installed);
  assert.equal(installed.version, '1.1.0');
  assert.equal(fs.readFileSync(path.join(installed.install_path, 'skills', id, 'SKILL.md'), 'utf8'), '1.1.0');
  assert.equal(installed.enabled, false);
  assert.equal(installed.carrier_synced, false);
  assert.equal(fs.existsSync(projectionPath), false);
  const postUpdateOperations = reopened.operationStatus();
  assert.equal((await reopened.updatePlan()).packages[0]?.status, 'current');
  assert.deepEqual((await reopened.updateAll({})).results, []);
  assert.deepEqual(reopened.operationStatus(), postUpdateOperations);

  const source = writeRelease(root, id, '1.2.0');
  await reopened.update({ packageId: id, source });
  assert.equal(reopened.inspect(id)?.version, '1.2.0');
  assert.equal(reopened.inspect(id)?.enabled, false);
  assert.equal(reopened.inspect(id)?.carrier_synced, false);
  assert.equal(fs.existsSync(projectionPath), false);
});

test('an unreachable source and an older record without a source leave healthy updates available', async (t) => {
  const { root, service } = setup(t);
  const broken = writeRelease(root, 'broken-source', '1.0.0');
  const healthy = writeRelease(root, 'healthy-source', '1.0.0');
  await service.install({ source: broken, syncCodex: false });
  await service.install({ source: healthy, syncCodex: false });

  const legacy = writeRelease(root, 'legacy', '1.0.0');
  const { manifest } = readPackageManifestFromDir(legacy.path);
  service.store.upsertInstalledPackage({
    manifest,
    origin: 'opl',
    install_mode: 'release',
    install_path: legacy.path,
    content_digest: buildPackage(legacy.path).digest,
  });
  fs.rmSync(broken.path, { recursive: true });
  writeRelease(root, 'healthy-source', '1.1.0');

  const previousOperations = service.operationStatus();
  const { packages } = await service.updatePlan();
  const entries = new Map(packages.map((pkg) => [pkg.package_id, pkg]));
  assert.equal(entries.get('healthy-source')?.status, 'available');
  assert.equal(entries.get('broken-source')?.status, 'unavailable');
  const missingSource = entries.get('legacy');
  assert.ok(missingSource);
  assert.ok(missingSource.status === 'unmanaged' || missingSource.status === 'unavailable');
  assert.equal(missingSource.available_version, null);
  assert.deepEqual(service.operationStatus(), previousOperations);

  const batch = await service.updateAll({ syncCodex: false });
  assert.deepEqual(batch.failures.map(({ package_id }) => package_id), ['broken-source']);
  assert.equal(batch.managed_update.execution.status, 'partial_failure');
  assert.deepEqual(batch.results.map(({ package: pkg }) => pkg.package_id), ['healthy-source']);
  assert.equal(service.inspect('healthy-source')?.version, '1.1.0');
  assert.equal(service.inspect('broken-source')?.version, '1.0.0');
  assert.equal(service.inspect('legacy')?.version, '1.0.0');
});

test('a mutable source that changes version between inspection and staging leaves the installed release intact', async (t) => {
  const { root, service } = setup(t);
  const id = 'moving-source';
  await service.install({ source: writeRelease(root, id, '1.0.0'), syncCodex: false });
  writeRelease(root, id, '1.1.0');
  const off = service.eventBus.on('event.pack.progress', event => {
    if (event.action === 'update' && event.status === 'preparing') writeRelease(root, id, '0.9.0');
  });
  t.after(off);
  const batch = await service.updateAll({ syncCodex: false });
  assert.deepEqual(batch.results, []);
  assert.equal(batch.failures.length, 1);
  assert.equal(batch.failures[0]?.code, 'PACK_OPERATION_BUSY');
  assert.equal(service.inspect(id)?.version, '1.0.0');
});

test('disabling a package while its update is installing wins after both operations settle', async (t) => {
  const { root, marketplaceRoot, service } = setup(t);
  const id = 'concurrent-disable';
  await service.install({ source: writeRelease(root, id, '1.0.0') });
  const source = writeRelease(root, id, '1.1.0');
  let disable: ReturnType<typeof service.toggle> | undefined;
  const off = service.eventBus.on('event.pack.progress', event => {
    if (event.action === 'update' && event.status === 'installing') {
      disable = service.toggle({ packageId: id, enabled: false });
    }
  });
  t.after(off);

  await service.update({ packageId: id, source });
  assert.ok(disable);
  await disable;
  const pkg = service.inspect(id);
  assert.equal(pkg?.version, '1.1.0');
  assert.equal(pkg?.enabled, false);
  assert.equal(pkg?.carrier_synced, false);
  assert.equal(fs.existsSync(path.join(marketplaceRoot, 'plugins', id)), false);
});

test('official update plans use version metadata alone and stage only newer applied packages', async t => {
  const { root } = setup(t);
  const db = openSqliteStore(':memory:');
  t.after(() => db.close());
  const resolutions: string[] = [];
  const packageId = 'managed-official';
  const update = writeRelease(root, packageId, '1.0.0');
  const pack = createPackService({
    db, stateDir: path.join(root, 'official'),
    resolveOfficialUpdateVersion: async () => '1.1.0',
    resolveOfficialUpdate: async (id, operation) => {
      assert.equal(pack.store.getOperation(operation.opId)?.package_id, id);
      operation.onProgress({ stage: 'downloading', bytes_done: 1, bytes_total: 2, eta_sec: 1 });
      resolutions.push(id);
      return { source: update, dispose: () => {} };
    },
  });
  await pack.install({ source: update, updateSource: { kind: 'official', package_id: packageId }, syncCodex: false });
  writeRelease(root, packageId, '1.1.0');
  const ops = pack.operationStatus();
  assert.equal((await pack.updatePlan()).packages[0]?.available_version, '1.1.0');
  assert.deepEqual(pack.operationStatus(), ops);
  assert.deepEqual(resolutions, []);
  assert.equal((await pack.updateAll({ syncCodex: false })).results[0]?.package.version, '1.1.0');
  assert.deepEqual(resolutions, [packageId]);
  assert.deepEqual((await pack.updateAll({ syncCodex: false })).results, []);
  assert.deepEqual(resolutions, [packageId]);
  assert.equal(db.prepare('SELECT source_json FROM pack_install_sources WHERE package_id = ?').get(packageId)?.source_json,
    JSON.stringify({ kind: 'official', package_id: packageId }));
});
