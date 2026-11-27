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
  assert.deepEqual(readAppPackageOperations(pack), { supports_background: true, operations: [] });

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

test('Studio updates only the selected Package, repairs its bytes, and cancels an active catalog install', async t => {
  const { createDaemonSandbox, connectTestRpc, writeMinimalV2Package } = await import('./helpers/sandbox.ts');
  const sandbox = createDaemonSandbox();
  t.after(() => sandbox.cleanup());
  const waitForDownload = Promise.withResolvers<void>();
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/catalog-index.json')) return Response.json({
      schema_version: 'opl_software_catalog_index.v1', catalog_id: 'public-registry:opl',
      packages: [{ package_id: 'remote-demo', version: '1.0.0', visibility: 'public', manifest: {
        package_id: 'remote-demo', display_name: 'Demo',
        codex_surface: { configured_codex_plugin_carrier: {
          publication_ref: 'ghcr.io/gaofeng21cn/one-person-lab-packages/remote-demo:1.0.0',
        } },
      } }],
    });
    assert.equal(url.pathname, '/token');
    waitForDownload.resolve();
    init?.signal?.throwIfAborted();
    return new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal!.reason), { once: true }));
  });
  const { runtime } = await sandbox.startInProcess();
  const rpc = await connectTestRpc(sandbox.sessionPath);
  t.after(() => rpc.close());
  const action = async (action_id: string, payload: Record<string, unknown>) => {
    const response = await rpc.call('app.action.execute', { action_id, payload }) as any;
    return response.app_action_execution.result;
  };
  const packages = ['first-local', 'second-local'];
  for (const id of packages) {
    const dir = path.join(sandbox.root, id);
    await runtime.packService.install({ source: { kind: 'local_dir', path: writeMinimalV2Package(dir, { id, version: '1.0.0' }) } });
    writeMinimalV2Package(dir, { id, version: '1.1.0' });
  }
  const update = await action('agent_package_update', { package_id: packages[0], confirmed: true });
  assert.equal(update.results.length, 1);
  assert.equal(runtime.packService.inspect(packages[0]!)?.version, '1.1.0');
  assert.equal(runtime.packService.inspect(packages[1]!)?.version, '1.0.0');
  const pkg = runtime.packService.inspect(packages[0]!)!;
  const file = path.join(pkg.install_path, 'skills', pkg.package_id, 'SKILL.md');
  fs.appendFileSync(file, 'tampered');
  await action('agent_package_repair', { package_id: pkg.package_id, confirmed: true });
  assert.ok(!fs.readFileSync(file, 'utf8').includes('tampered'));
  assert.ok(readAppPackageOperations(runtime.packService).operations.some(row => row.action_id === 'agent_package_repair' && row.status === 'completed'));

  const started = await action('package_operation_start', { package_id: 'remote-demo', action_id: 'agent_package_install', confirmed: true });
  await waitForDownload.promise;
  const status = await action('package_operation_status', {});
  const op = status.operations.find((row: { operation_id: string }) => row.operation_id === started.operation_id);
  assert.equal(op.stage, 'downloading');
  assert.equal(op.downloaded_bytes, 0);
  assert.equal(op.can_cancel, true);
  assert.equal((await action('package_operation_cancel', { operation_id: op.operation_id })).status, 'cancelled');
  assert.equal(runtime.packService.inspect('remote-demo'), null);
});
