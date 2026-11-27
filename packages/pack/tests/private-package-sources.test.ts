import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { openSqliteStore, resolveStatePaths } from '@opl/core';
import { initializePrivatePackageSourceStore } from '../src/distribution/private-package-source-store.ts';
import {
  checkPrivatePackageSource, configurePrivatePackageSource,
  disconnectPrivatePackageSource, listPrivatePackageSources,
} from '../src/distribution/private-package-sources.ts';

test('private source changes leave the legacy JSON intact and an in-flight check cannot reconnect a removed reference', async t => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-private-source-'));
  t.after(() => fs.rmSync(stateDir, { recursive: true, force: true }));
  const sourceId = 'github-packages:fixture';
  const file = path.join(stateDir, 'software-sources.json');
  const unrelated = { source_id: 'public-registry:opl', revision: 'kept', extra: 3 };
  fs.writeFileSync(file, JSON.stringify({ surface_kind: 'opl_software_sources_store.v1', sources: [unrelated] }));
  const legacy = fs.readFileSync(file, 'utf8');
  const db = openSqliteStore(':memory:');
  t.after(() => db.close());
  initializePrivatePackageSourceStore(db, resolveStatePaths({ stateDir }));
  const { OPL_GITHUB_PACKAGES_TOKEN: previous } = process.env;
  process.env.OPL_GITHUB_PACKAGES_TOKEN = 'fixture-only-source-token';
  t.after(() => {
    if (previous === undefined) delete process.env.OPL_GITHUB_PACKAGES_TOKEN;
    else process.env.OPL_GITHUB_PACKAGES_TOKEN = previous;
  });
  const configured = configurePrivatePackageSource(db, { sourceId, credentialHandle: 'env:OPL_GITHUB_PACKAGES_TOKEN' });
  assert.equal(configured.status, 'unknown');
  assert.equal(configured.catalog_origin, 'external');
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).sources[0], unrelated);
  const response = Promise.withResolvers<Response>();
  const started = Promise.withResolvers<void>();
  t.mock.method(globalThis, 'fetch', async url => {
    if (String(url) !== 'https://api.github.com/user') return new Response(null, { status: 404 });
    started.resolve();
    return response.promise;
  });
  const checking = checkPrivatePackageSource(db, sourceId);
  await started.promise;
  const disconnected = disconnectPrivatePackageSource(db, sourceId);
  response.resolve(Response.json({ id: 1, login: 'fixture' }));
  await assert.rejects(checking, { code: 'PACK_OPERATION_BUSY' });
  assert.deepEqual(listPrivatePackageSources(db).find(entry => entry.source_id === sourceId), disconnected);
  assert.equal(fs.readFileSync(file, 'utf8'), legacy);
  const before = fs.readFileSync(file, 'utf8');
  assert.throws(() => configurePrivatePackageSource(db, { sourceId, credentialHandle: 'raw' }), { code: 'INVALID_INPUT' });
  assert.equal(fs.readFileSync(file, 'utf8'), before);
});
