import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  checkPrivatePackageSource, configurePrivatePackageSource,
  disconnectPrivatePackageSource, listPrivatePackageSources,
} from '../src/distribution/private-package-sources.ts';

test('private source changes preserve other v1 entries and an in-flight check cannot reconnect a removed reference', async t => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-private-source-'));
  t.after(() => fs.rmSync(stateDir, { recursive: true, force: true }));
  const sourceId = 'github-packages:fixture';
  const file = path.join(stateDir, 'software-sources.json');
  const unrelated = { source_id: 'public-registry:opl', revision: 'kept', extra: 3 };
  fs.writeFileSync(file, JSON.stringify({ surface_kind: 'opl_software_sources_store.v1', sources: [unrelated] }));
  const { OPL_GITHUB_PACKAGES_TOKEN: previous } = process.env;
  process.env.OPL_GITHUB_PACKAGES_TOKEN = 'fixture-only-source-token';
  t.after(() => {
    if (previous === undefined) delete process.env.OPL_GITHUB_PACKAGES_TOKEN;
    else process.env.OPL_GITHUB_PACKAGES_TOKEN = previous;
  });
  const configured = configurePrivatePackageSource({ stateDir, sourceId, credentialHandle: 'env:OPL_GITHUB_PACKAGES_TOKEN' });
  assert.equal(configured.status, 'unknown');
  assert.equal(configured.catalog_origin, 'external');
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).sources[0], unrelated);
  const response = Promise.withResolvers<Response>();
  const started = Promise.withResolvers<void>();
  t.mock.method(globalThis, 'fetch', async () => { started.resolve(); return response.promise; });
  const checking = checkPrivatePackageSource({ stateDir, sourceId });
  await started.promise;
  const disconnected = disconnectPrivatePackageSource({ stateDir, sourceId });
  response.resolve(Response.json({ id: 1, login: 'fixture' }));
  await assert.rejects(checking, { code: 'PACK_OPERATION_BUSY' });
  assert.deepEqual(listPrivatePackageSources({ stateDir }).find(entry => entry.source_id === sourceId), disconnected);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).sources[1].credential_handle, null);
  const before = fs.readFileSync(file, 'utf8');
  assert.throws(() => configurePrivatePackageSource({ stateDir, sourceId, credentialHandle: 'raw' }), { code: 'INVALID_INPUT' });
  assert.equal(fs.readFileSync(file, 'utf8'), before);
});
