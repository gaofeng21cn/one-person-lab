import assert from 'node:assert/strict';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { openSqliteStore } from '@opl/core';
import { buildPackage, createPackageSourceArchive } from '@opl/pack';
import {
  connectTestRpc,
  createDaemonSandbox,
  writeMinimalV2Package,
  type DaemonSandbox,
} from './helpers/sandbox.ts';

const sandboxes: DaemonSandbox[] = [];

function trackSandbox(): DaemonSandbox {
  const sb = createDaemonSandbox();
  sandboxes.push(sb);
  return sb;
}

afterEach(async () => {
  while (sandboxes.length > 0) {
    await sandboxes.pop()!.cleanup();
  }
});

describe('Wave 1 Gate 2 (Daemon Side): app.state.get P99 < 20ms & pack.updateAll progress push', () => {
  it('achieves P99 < 20ms across 100 warm app.state.get(fast) calls and streams event.pack.progress with reload_mode before RPC return', async () => {
    const sb = trackSandbox();
    await sb.startInProcess();

    const appRpc = await connectTestRpc(sb.sessionPath, 'opl_app', '2.0');

    const v1Dir = writeMinimalV2Package(path.join(sb.root, 'pkg-v1'), {
      id: 'gate2-app',
      version: '0.1.0',
      intent: 'app',
    });
    const v2Dir = writeMinimalV2Package(path.join(sb.root, 'pkg-v2'), {
      id: 'gate2-app',
      version: '0.2.0',
      intent: 'app',
    });
    buildPackage(v1Dir, { writeLock: true });
    buildPackage(v2Dir, { writeLock: true });

    const archV1 = path.join(sb.root, 'gate2-app-0.1.0.tgz');
    const archV2 = path.join(sb.root, 'gate2-app-0.2.0.tgz');
    const archiveFiles = ['opl-package.json', 'opl-release.lock.json', 'README.md'];
    await createPackageSourceArchive(v1Dir, archV1, archiveFiles);
    await createPackageSourceArchive(v2Dir, archV2, archiveFiles);

    await appRpc.call('pack.install', { source: archV1 });

    // Warmup 5 calls, measure 100 consecutive app.state.get({ profile: 'fast' }) calls
    for (let i = 0; i < 5; i += 1) {
      await appRpc.call('app.state.get', { profile: 'fast' });
    }
    const latenciesMs: number[] = [];
    for (let i = 0; i < 100; i += 1) {
      const start = performance.now();
      const state = (await appRpc.call('app.state.get', { profile: 'fast' })) as {
        profile: string;
        packages: Array<{ package_id: string }>;
      };
      latenciesMs.push(performance.now() - start);
      assert.equal(state.profile, 'fast');
      assert.equal(state.packages.some((p) => p.package_id === 'gate2-app'), true);
    }
    latenciesMs.sort((a, b) => a - b);
    const p99 = latenciesMs[Math.min(latenciesMs.length - 1, Math.ceil(latenciesMs.length * 0.99) - 1)]!;
    assert.ok(p99 < 20, `Expected app.state.get('fast') P99 < 20ms, got ${p99.toFixed(3)}ms`);

    // pack.updateAll streams event.pack.progress (no id, includes reload_mode) before RPC return
    appRpc.drainEvents();
    const updateRes = (await appRpc.call('pack.updateAll', {
      updates: [{ package_id: 'gate2-app', source: archV2 }],
    })) as { batch_id: string; reload_mode: string };
    assert.ok(updateRes.batch_id);

    const progressEvents = appRpc.drainEvents('event.pack.progress');
    assert.ok(progressEvents.length >= 1, 'Expected >= 1 event.pack.progress push before RPC return');
    for (const ev of progressEvents) {
      assert.equal(ev.raw.id, undefined);
    }
    const finalPush = progressEvents.find(
      (ev) =>
        ev.params.package_id === 'gate2-app'
        && (ev.params.reload_mode === 'none'
          || ev.params.reload_mode === 'renderer_reload'
          || ev.params.reload_mode === 'restart_required'),
    );
    assert.ok(finalPush, `Expected reload_mode in event.pack.progress: ${JSON.stringify(progressEvents)}`);

    const db = openSqliteStore(sb.dbPath, { readOnly: true });
    try {
      const rows = db
        .prepare("SELECT reload_mode FROM package_operations WHERE package_id = 'gate2-app' AND status = 'succeeded'")
        .all() as Array<{ reload_mode: string | null }>;
      assert.equal(
        rows.some((r) => r.reload_mode === finalPush.params.reload_mode),
        true,
      );
    } finally {
      db.close();
    }

    await appRpc.close();
  });
});
