import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { openSqliteStore } from '@opl/core';
import { PackError, createPackService, stageOfficialPackageSource } from '../src/index.ts';

test('installs a staged nested official v1 seed without modifying the supplied files', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-legacy-seed-'));
  const seed = path.join(root, 'seed');
  const nested = path.join(seed, 'plugins', 'example');
  const db = openSqliteStore(path.join(root, 'state.db'));
  try {
    fs.mkdirSync(path.join(nested, '.codex-plugin'), { recursive: true });
    fs.writeFileSync(path.join(nested, '.codex-plugin', 'plugin.json'), '{"name":"example","version":"1.2.0"}');
    const descriptor = '{"surface_kind":"opl_agent_package_manifest.v1","package_id":"example","version":"1.2.0"}';
    fs.writeFileSync(path.join(nested, 'opl-package.json'), descriptor);

    const source = { kind: 'local_dir' as const, path: seed, package_id: 'example' };
    const pack = createPackService({ db, stateDir: root });
    await assert.rejects(pack.install({ source, syncCodex: false }), (error) =>
      error instanceof PackError && error.code === 'PACK_MISSING_PATH');
    await assert.rejects(stageOfficialPackageSource({ ...source, package_id: 'different' }), (error) =>
      error instanceof PackError && error.code === 'INVALID_MANIFEST');

    const staged = await stageOfficialPackageSource(source);
    try {
      assert.equal(staged.manifest.schema_version, 'opl.package.v2');
      await pack.install({ source: staged.source, syncCodex: false });
    } finally {
      staged.dispose();
    }
    assert.equal(fs.existsSync(staged.source.path!), false);
    assert.equal(pack.inspect('example')?.version, '1.2.0');
    assert.equal(fs.existsSync(path.join(seed, 'opl-package.json')), false);
    assert.equal(fs.readFileSync(path.join(nested, 'opl-package.json'), 'utf8'), descriptor);
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
