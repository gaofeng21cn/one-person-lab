import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { openSqliteStore } from '@opl/core';
import { createPackService } from '@opl/pack';
import { readAppPackageOperations } from '../src/contributions/package-operations.ts';

test('the App reads Pack history and measured progress independently of background submission', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-pack-progress-'));
  const db = openSqliteStore(path.join(root, 'opl.db'));
  t.after(() => { db.close(); fs.rmSync(root, { recursive: true, force: true }); });
  const pack = createPackService({ db, stateDir: root });
  assert.deepEqual(readAppPackageOperations(pack), { supports_background: false, operations: [] });

  await assert.rejects(pack.install({ source: { kind: 'local_dir', path: path.join(root, 'missing'), package_id: 'sample' } }));
  const [failure] = readAppPackageOperations(pack).operations;
  assert.equal(failure.status, 'failed');
  assert.equal(failure.package_id, 'sample');
  assert.equal(failure.error_code, 'PACK_NOT_FOUND');

  const localDir = path.join(root, 'local-build-dir');
  fs.mkdirSync(localDir);
  fs.writeFileSync(path.join(localDir, 'opl-package.json'), JSON.stringify({
    schema_version: 'opl.package.v2',
    identity: {
      id: 'sample', version: '1.0.0', intent: 'app', publisher: 'Example',
      name: { 'en-US': 'Sample', 'zh-CN': '示例' }, summary: { 'en-US': 'Sample app', 'zh-CN': '示例应用' },
    },
  }));
  const installed = await pack.install({ source: { kind: 'local_dir', path: localDir }, syncCodex: false });
  assert.equal(installed.operation.package_id, 'sample');
  assert.equal(readAppPackageOperations(pack).operations[0].package_id, 'sample');
  pack.store.createOperation({ op_id: 'legacy', package_id: localDir, action: 'install', status: 'succeeded' });
  assert.ok(!readAppPackageOperations(pack).operations.some(row => row.operation_id === 'legacy'));

  pack.store.createOperation({
    op_id: 'download', package_id: 'sample', action: 'update', status: 'downloading',
    progress: { stage: 'downloading', bytes_done: 32, bytes_total: 128, speed_bps: 24 },
  });
  const [download] = readAppPackageOperations(pack).operations;
  assert.equal(download.action_id, 'agent_package_update');
  assert.equal(download.operation_id, 'download');
  assert.equal(download.status, 'running');
  assert.equal(download.stage, 'downloading');
  assert.equal(download.downloaded_bytes, 32);
  assert.equal(download.total_bytes, 128);
  assert.equal(download.bytes_per_second, 24);
  pack.reconcileOperations();
  assert.equal(readAppPackageOperations(pack).operations[0].status, 'interrupted');
});
