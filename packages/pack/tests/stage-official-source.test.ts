import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { openSqliteStore } from '@opl/core';
import { PackError, createPackService, stageOfficialPackageSource } from '../src/index.ts';

test('stages a valid v2 official seed without modifying it and fails closed on legacy v1 descriptors', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-v2-seed-'));
  const seed = path.join(root, 'seed');
  const db = openSqliteStore(path.join(root, 'state.db'));
  try {
    fs.mkdirSync(path.join(seed, 'skills', 'example'), { recursive: true });
    fs.writeFileSync(path.join(seed, 'skills', 'example', 'SKILL.md'), '# Example\n');
    const descriptor = JSON.stringify({
      schema_version: 'opl.package.v2',
      identity: {
        id: 'example',
        version: '1.2.0',
        intent: 'agent',
        name: { 'en-US': 'Example', 'zh-CN': '示例' },
        summary: { 'en-US': 'Example package', 'zh-CN': '示例包' },
        publisher: 'one-person-lab',
        license: 'Apache-2.0',
      },
      dependencies: { opl_base: '^2.0.0' },
      provides: {
        skills: [{ id: 'example', path: './skills/example', exposure: 'default' }],
      },
    });
    fs.writeFileSync(path.join(seed, 'opl-package.json'), descriptor);

    const source = { kind: 'local_dir' as const, path: seed, package_id: 'example' };
    const pack = createPackService({ db, stateDir: root });
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
    assert.equal(fs.readFileSync(path.join(seed, 'opl-package.json'), 'utf8'), descriptor);

    const rootV1Seed = path.join(root, 'root-v1-seed');
    fs.mkdirSync(rootV1Seed, { recursive: true });
    fs.writeFileSync(
      path.join(rootV1Seed, 'opl-package.json'),
      '{"surface_kind":"opl_agent_package_manifest.v1","package_id":"legacy-root","version":"1.2.0"}',
    );
    await assert.rejects(
      stageOfficialPackageSource({ kind: 'local_dir', path: rootV1Seed, package_id: 'legacy-root' }),
      (error) => error instanceof PackError && error.code === 'INVALID_MANIFEST',
    );

    const nestedV1Seed = path.join(root, 'nested-v1-seed');
    const nested = path.join(nestedV1Seed, 'plugins', 'legacy-nested');
    fs.mkdirSync(path.join(nested, '.codex-plugin'), { recursive: true });
    fs.writeFileSync(path.join(nested, '.codex-plugin', 'plugin.json'), '{"name":"legacy-nested","version":"1.2.0"}');
    fs.writeFileSync(
      path.join(nested, 'opl-package.json'),
      '{"surface_kind":"opl_agent_package_manifest.v1","package_id":"legacy-nested","version":"1.2.0"}',
    );
    await assert.rejects(
      stageOfficialPackageSource({ kind: 'local_dir', path: nestedV1Seed, package_id: 'legacy-nested' }),
      (error) => error instanceof PackError && error.code === 'PACK_MISSING_PATH',
    );
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
