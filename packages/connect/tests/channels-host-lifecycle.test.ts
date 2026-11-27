import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import { EventBus, openSqliteStore, runMigrations } from '@opl/core';

import {
  ChannelError,
  ChannelProviderHost,
  MIGRATION_0002_CONNECT_CHANNELS,
  SqliteChannelPackageDiscovery,
  SqliteChannelThreadBindingStore,
  ensureConnectSchema,
  instantiateChannelFactory,
  resolveSafePackageModulePath,
  type ChannelHostEvents,
  type ChannelProvider,
  type ChannelThreadBinding,
  type ChannelThreadHostCallback,
} from '../src/index.ts';

function makeTempDir(prefix = 'connect-channels-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('SqliteChannelPackageDiscovery enforces realpath containment and zero-arg sync factory checks', async () => {
  const tmpDir = makeTempDir('connect-chandisc-');
  const prevStateDir = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = tmpDir;
  const db = openSqliteStore(path.join(tmpDir, 'opl.db'));
  try {
    runMigrations(db);
    const pkgDir = path.join(tmpDir, 'chan-alpha');
    const outsideDir = path.join(tmpDir, 'outside');
    fs.mkdirSync(path.join(pkgDir, 'dist'), { recursive: true });
    fs.mkdirSync(outsideDir, { recursive: true });

    const validEntry = path.join(pkgDir, 'dist', 'index.mjs');
    fs.writeFileSync(
      validEntry,
      `
      export function createAlphaChannel() {
        return {
          provider_id: 'chan-alpha',
          start() { return { dispose() {} }; },
        };
      }
      export async function asyncFactory() {
        return { provider_id: 'chan-alpha', start() { return { dispose() {} }; } };
      }
      export function argFactory(x) {
        return { provider_id: x, start() { return { dispose() {} }; } };
      }
      `,
      'utf8',
    );
    const outsideFile = path.join(outsideDir, 'escape.mjs');
    fs.writeFileSync(outsideFile, 'export default {};\n', 'utf8');
    fs.symlinkSync(outsideFile, path.join(pkgDir, 'dist', 'symlink-escape.mjs'));

    const manifest = {
      schema_version: 'opl.package.v2',
      identity: { id: 'chan-alpha', version: '1.0.0', intent: 'channel' },
      provides: {
        channels: [
          {
            channel_id: 'alpha',
            entrypoint: { kind: 'esm_module', module: './dist/index.mjs', export: 'createAlphaChannel' },
          },
        ],
      },
      ui: {
        declarative: {
          views: [
            {
              id: 'alpha.access',
              view_type: 'channel_access',
              data_ref: 'alpha.state#view',
              actions: [{ id: 'disconnect', action_ref: 'alpha#disconnect', confirm: true }],
            },
          ],
        },
      },
    };

    const now = new Date().toISOString();
    db.prepare(
      "INSERT INTO installed_packages (package_id, version, intent, origin, install_mode, install_path, content_digest, manifest_json, enabled, carrier_synced, installed_at, updated_at) VALUES (?, '1.0.0', 'channel', 'local_dev', 'dev_link', ?, ?, ?, 1, 0, ?, ?)",
    ).run('chan-alpha', pkgDir, `sha256:${'a'.repeat(64)}`, JSON.stringify(manifest), now, now);

    const discovery = new SqliteChannelPackageDiscovery(db);
    const pkgs = discovery.listEnabledChannelPackages();
    assert.equal(pkgs.length, 1);
    assert.equal(pkgs[0]!.package_id, 'chan-alpha');
    assert.equal(pkgs[0]!.channels[0]!.resolved_module_path, fs.realpathSync(validEntry));

    // Path traversal & symlink escape fail closed
    assert.throws(
      () => resolveSafePackageModulePath(pkgDir, '../outside/escape.mjs'),
      (err: unknown) => err instanceof ChannelError && err.code === 'CHANNEL_IDENTITY_MISMATCH',
    );
    assert.throws(
      () => resolveSafePackageModulePath(pkgDir, '/etc/passwd'),
      (err: unknown) => err instanceof ChannelError && err.code === 'CHANNEL_IDENTITY_MISMATCH',
    );
    assert.throws(
      () => resolveSafePackageModulePath(pkgDir, './dist/symlink-escape.mjs'),
      (err: unknown) => err instanceof ChannelError && err.code === 'CHANNEL_IDENTITY_MISMATCH',
    );

    const mod = (await import(pathToFileURL(pkgs[0]!.channels[0]!.resolved_module_path).href)) as Record<
      string,
      unknown
    >;
    const provider = instantiateChannelFactory<ChannelProvider>(mod, 'createAlphaChannel');
    assert.equal(provider.provider_id, 'chan-alpha');

    assert.throws(
      () => instantiateChannelFactory(mod, 'asyncFactory'),
      (err: unknown) => err instanceof ChannelError && err.code === 'CHANNEL_INVALID_INPUT',
    );
    assert.throws(
      () => instantiateChannelFactory(mod, 'argFactory'),
      (err: unknown) => err instanceof ChannelError && err.code === 'CHANNEL_INVALID_INPUT',
    );
  } finally {
    db.close();
    if (prevStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = prevStateDir;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('ChannelProviderHost enforces status lifecycle, confirmation_required, safe disconnect, and reconciliation', async () => {
  const tmpDir = makeTempDir('connect-chanhost-');
  const prevStateDir = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = tmpDir;
  const db = openSqliteStore(path.join(tmpDir, 'opl.db'));
  try {
    runMigrations(db);
    const pkgDir = path.join(tmpDir, 'chan-beta');
    fs.mkdirSync(pkgDir, { recursive: true });
    const digestV1 = `sha256:${'b'.repeat(64)}`;
    const now = new Date().toISOString();
    db.prepare(
      "INSERT INTO installed_packages (package_id, version, intent, origin, install_mode, install_path, content_digest, manifest_json, enabled, carrier_synced, installed_at, updated_at) VALUES (?, '1.0.0', 'channel', 'opl', 'release', ?, ?, ?, 1, 0, ?, ?)",
    ).run(
      'chan-beta',
      pkgDir,
      digestV1,
      JSON.stringify({ schema_version: 'opl.package.v2', identity: { id: 'chan-beta', intent: 'channel' } }),
      now,
      now,
    );

    const bindings: ChannelThreadBinding[] = [];
    let turnSubDisposed = 0;
    let providerDisposed = 0;
    let failTurnTransport = false;

    const callback: ChannelThreadHostCallback = {
      startThread: async (identity) => {
        const ref = { canonical_thread_host: 'local-host', canonical_thread_id: 'thr_1' };
        bindings.push({ ...identity, ...ref });
        return ref;
      },
      resumeThread: async () => {},
      startTurn: async (turnInput) => {
        if (failTurnTransport) {
          throw new ChannelError('CHANNEL_TRANSPORT_ERROR', 'Socket closed unexpectedly');
        }
        return { ...turnInput, canonical_turn_id: 'turn_1' };
      },
      subscribeTurn: () => ({
        dispose: () => {
          turnSubDisposed += 1;
        },
      }),
      readTransportBindings: async () => bindings,
    };

    const eventBus = new EventBus<ChannelHostEvents>();
    const statusChanges: Array<{ status: string; reason?: string }> = [];
    const transportErrors: Array<{ reason: string; safe_disconnected: boolean }> = [];
    eventBus.on('channel.provider.status_changed', (ev) => {
      statusChanges.push({ status: ev.status, reason: ev.reason });
    });
    eventBus.on('channel.transport.error', (ev) => {
      transportErrors.push({ reason: ev.reason, safe_disconnected: ev.safe_disconnected });
    });

    const host = new ChannelProviderHost({
      callback,
      eventBus,
      discovery: new SqliteChannelPackageDiscovery(db),
    });

    let capturedCallback!: Parameters<ChannelProvider['start']>[0]['callback'];
    const provider: ChannelProvider = {
      provider_id: 'chan-beta',
      channel_access: {
        data_ref: 'beta.state#info',
        action_refs: ['beta#ping', 'beta#disconnect'],
        read: () => ({ connected: true }),
        execute: ({ action_ref }) => ({ executed: action_ref }),
      },
      start: (startInput) => {
        capturedCallback = startInput.callback;
        return {
          dispose: () => {
            providerDisposed += 1;
          },
        };
      },
    };

    await host.attach(provider, {
      package_id: 'chan-beta',
      content_digest: digestV1,
      ui_views: [
        {
          id: 'beta.access',
          view_type: 'channel_access',
          data_ref: 'beta.state#info',
          actions: [
            { id: 'ping', action_ref: 'beta#ping' },
            { id: 'disconnect', action_ref: 'beta#disconnect', confirm: true },
          ],
        },
      ],
    });

    // Cross-provider identity spoofing blocked
    await assert.rejects(
      () =>
        capturedCallback.startThread({
          provider_id: 'other-provider',
          account_id: 'acct_1',
          channel_session_id: 'cs_1',
        }),
      (err: unknown) => err instanceof ChannelError && err.code === 'CHANNEL_IDENTITY_MISMATCH',
    );

    const thr = await capturedCallback.startThread({
      provider_id: 'chan-beta',
      account_id: 'acct_1',
      channel_session_id: 'cs_1',
    });
    assert.equal(thr.canonical_thread_id, 'thr_1');
    const turn = await capturedCallback.startTurn({ ...thr, text: 'hello' });
    capturedCallback.subscribeTurn(turn, { onTerminal: () => {} });

    // confirmation_required gate
    await assert.rejects(
      () => host.executeChannelAccessAction({ package_id: 'chan-beta', ref: 'beta#disconnect' }),
      (err: unknown) => err instanceof ChannelError && err.code === 'CHANNEL_CONFIRMATION_REQUIRED',
    );
    const confirmedRes = await host.executeChannelAccessAction({
      package_id: 'chan-beta',
      ref: 'beta#disconnect',
      confirmed: true,
    });
    assert.equal(confirmedRes.ok, true);

    // Transport error triggers idempotent safe disconnect, disposing turn sub + provider once
    failTurnTransport = true;
    await assert.rejects(
      () => capturedCallback.startTurn({ ...thr, text: 'boom' }),
      (err: unknown) => err instanceof ChannelError && err.code === 'CHANNEL_TRANSPORT_ERROR',
    );

    assert.equal(turnSubDisposed, 1);
    assert.equal(providerDisposed, 1);
    assert.equal(transportErrors.length, 1);
    assert.equal(transportErrors[0]?.reason, 'transport_error');
    assert.equal(host.getStateProjection().providers[0]?.status, 'error');

    // Subsequent read fails closed
    await assert.rejects(
      () => host.readChannelAccess({ package_id: 'chan-beta', ref: 'beta.state#info' }),
      (err: unknown) => err instanceof ChannelError && err.code === 'CHANNEL_PROVIDER_UNAVAILABLE',
    );

    // Re-attach and verify reconcileWithInstalledPackages disconnects on digest drift
    failTurnTransport = false;
    await host.attach(provider, { package_id: 'chan-beta', content_digest: digestV1 });
    assert.equal(host.getStateProjection().providers[0]?.status, 'active');

    db.prepare('UPDATE installed_packages SET content_digest = ? WHERE package_id = ?').run(
      `sha256:${'f'.repeat(64)}`,
      'chan-beta',
    );
    await host.reconcileWithInstalledPackages();
    assert.equal(host.getStateProjection().providers[0]?.status, 'error');
    assert.equal(host.getStateProjection().providers[0]?.last_reason, 'digest_changed');
    assert.equal(providerDisposed, 2);
  } finally {
    db.close();
    if (prevStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = prevStateDir;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('ChannelProviderHost does not resurrect or leak disposable on in-start detach or sync reportError', async () => {
  // 1. ChannelProviderHost: detach() while provider.start() is pending
  {
    let disposedCount = 0;
    let resolveStart!: (d: { dispose(): void }) => void;
    const host = new ChannelProviderHost({
      callback: {
        startThread: async () => ({ canonical_thread_host: 'h', canonical_thread_id: 't' }),
        resumeThread: async () => {},
        startTurn: async (x) => ({ ...x, canonical_turn_id: 'turn' }),
        subscribeTurn: () => ({ dispose: () => {} }),
        readTransportBindings: async () => [],
      },
    });
    const attachPromise = host.attach({
      provider_id: 'chan-race-1',
      start: () =>
        new Promise((resolve) => {
          resolveStart = resolve;
        }),
    });
    await host.detach('chan-race-1');
    resolveStart({
      dispose: () => {
        disposedCount += 1;
      },
    });
    await assert.rejects(
      () => attachPromise,
      (err: unknown) => err instanceof ChannelError && err.code === 'CHANNEL_PROVIDER_UNAVAILABLE',
    );
    assert.equal(disposedCount, 1);
    assert.equal(host.getStateProjection().providers[0]?.status, 'disconnected');
  }

  // 2. ChannelProviderHost: synchronous reportError() inside provider.start()
  {
    let disposedCount = 0;
    const eventBus = new EventBus<ChannelHostEvents>();
    const transportErrors: string[] = [];
    eventBus.on('channel.transport.error', (ev) => transportErrors.push(ev.reason));
    const host = new ChannelProviderHost({
      eventBus,
      callback: {
        startThread: async () => ({ canonical_thread_host: 'h', canonical_thread_id: 't' }),
        resumeThread: async () => {},
        startTurn: async (x) => ({ ...x, canonical_turn_id: 'turn' }),
        subscribeTurn: () => ({ dispose: () => {} }),
        readTransportBindings: async () => [],
      },
    });
    await assert.rejects(
      () =>
        host.attach({
          provider_id: 'chan-sync-err',
          start: ({ reportError }) => {
            reportError(new ChannelError('CHANNEL_TRANSPORT_ERROR', 'sync startup failure'));
            return {
              dispose: () => {
                disposedCount += 1;
              },
            };
          },
        }),
      (err: unknown) => err instanceof ChannelError && err.code === 'CHANNEL_PROVIDER_UNAVAILABLE',
    );
    assert.equal(disposedCount, 1);
    assert.equal(host.getStateProjection().providers[0]?.status, 'error');
    assert.deepEqual(transportErrors, ['transport_error']);
  }

  // 3. ChannelProviderHost: detach() while refreshTransportBindings() is pending after start() returned
  {
    let disposedCount = 0;
    let resolveBindings!: (b: ChannelThreadBinding[]) => void;
    const host = new ChannelProviderHost({
      callback: {
        startThread: async () => ({ canonical_thread_host: 'h', canonical_thread_id: 't' }),
        resumeThread: async () => {},
        startTurn: async (x) => ({ ...x, canonical_turn_id: 'turn' }),
        subscribeTurn: () => ({ dispose: () => {} }),
        readTransportBindings: () =>
          new Promise((resolve) => {
            resolveBindings = resolve;
          }),
      },
    });
    const attachPromise = host.attach({
      provider_id: 'chan-race-bindings',
      start: () => ({
        dispose: () => {
          disposedCount += 1;
        },
      }),
    });
    await new Promise((r) => setTimeout(r, 10));
    await host.detach('chan-race-bindings');
    resolveBindings([]);
    await assert.rejects(
      () => attachPromise,
      (err: unknown) => err instanceof ChannelError && err.code === 'CHANNEL_PROVIDER_UNAVAILABLE',
    );
    assert.equal(disposedCount, 1);
    assert.equal(host.getStateProjection().providers[0]?.status, 'disconnected');
  }

  // 4. SqliteChannelPackageDiscovery isolates per-package invalid entrypoints
  {
    const tmpDir = makeTempDir('connect-chandisc-iso-');
    const db = openSqliteStore(path.join(tmpDir, 'opl.db'));
    try {
      runMigrations(db);
      const validDir = path.join(tmpDir, 'chan-valid');
      fs.mkdirSync(path.join(validDir, 'dist'), { recursive: true });
      fs.writeFileSync(path.join(validDir, 'dist', 'index.mjs'), 'export default () => ({ provider_id: "chan-valid", start: () => ({ dispose() {} }) });\n', 'utf8');
      const now = new Date().toISOString();
      db.prepare(
        "INSERT INTO installed_packages (package_id, version, intent, origin, install_mode, install_path, content_digest, manifest_json, enabled, carrier_synced, installed_at, updated_at) VALUES (?, '1.0.0', 'channel', 'opl', 'release', ?, ?, ?, 1, 0, ?, ?)",
      ).run(
        'chan-broken',
        path.join(tmpDir, 'missing-dir'),
        `sha256:${'a'.repeat(64)}`,
        JSON.stringify({
          schema_version: 'opl.package.v2',
          identity: { id: 'chan-broken', intent: 'channel' },
          provides: { channels: [{ channel_id: 'broken', entrypoint: { module: './dist/missing.mjs' } }] },
        }),
        now,
        now,
      );
      db.prepare(
        "INSERT INTO installed_packages (package_id, version, intent, origin, install_mode, install_path, content_digest, manifest_json, enabled, carrier_synced, installed_at, updated_at) VALUES (?, '1.0.0', 'channel', 'opl', 'release', ?, ?, ?, 1, 0, ?, ?)",
      ).run(
        'chan-valid',
        validDir,
        `sha256:${'b'.repeat(64)}`,
        JSON.stringify({
          schema_version: 'opl.package.v2',
          identity: { id: 'chan-valid', intent: 'channel' },
          provides: { channels: [{ channel_id: 'valid', entrypoint: { module: './dist/index.mjs' } }] },
        }),
        now,
        now,
      );
      const pkgs = new SqliteChannelPackageDiscovery(db).listEnabledChannelPackages();
      assert.deepEqual(pkgs.map((p) => p.package_id), ['chan-valid']);
    } finally {
      db.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }
});

test('ChannelProviderHost ignores callbacks and disposal from a detached provider', async () => {
  const callback: ChannelThreadHostCallback = {
    startThread: async () => ({ canonical_thread_host: 'h', canonical_thread_id: 't' }),
    resumeThread: async () => {},
    startTurn: async (x) => ({ ...x, canonical_turn_id: 'turn' }),
    subscribeTurn: () => ({ dispose: () => {} }),
    readTransportBindings: async () => [],
  };

  // 1. ChannelProviderHost: stale reportError and stale attach1.dispose() must NOT touch re-attached provider2
  {
    const host = new ChannelProviderHost({ callback });
    let disposed1 = 0;
    let disposed2 = 0;
    let staleReportError!: (err: unknown) => void;

    const handle1 = await host.attach({
      provider_id: 'chan-reattach',
      start: ({ reportError }) => {
        staleReportError = reportError!;
        return { dispose: () => { disposed1 += 1; } };
      },
    });
    await host.detach('chan-reattach');
    assert.equal(disposed1, 1);

    await host.attach({
      provider_id: 'chan-reattach',
      start: () => ({ dispose: () => { disposed2 += 1; } }),
    });
    assert.equal(host.getStateProjection().providers[0]?.status, 'active');

    staleReportError(new ChannelError('CHANNEL_TRANSPORT_ERROR', 'late error from provider1'));
    await handle1.dispose();
    await new Promise((r) => setTimeout(r, 20));

    assert.equal(disposed2, 0);
    assert.equal(host.getStateProjection().providers[0]?.status, 'active');
  }
});

test('SqliteChannelThreadBindingStore persists bindings across SQLite reopen and enforces resumeThread / recordTurnDispatch', async () => {
  const tmpDir = makeTempDir('connect-thread-bindings-');
  const dbPath = path.join(tmpDir, 'opl.db');
  let db = openSqliteStore(dbPath);
  try {
    runMigrations(db);
    const migRes = ensureConnectSchema(db);
    assert.equal(migRes.applied.includes(MIGRATION_0002_CONNECT_CHANNELS.version), true);

    const tbl = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'channel_thread_bindings'")
      .get() as { name?: string } | undefined;
    assert.equal(tbl?.name, 'channel_thread_bindings');

    const store = new SqliteChannelThreadBindingStore(db);
    const identity = {
      provider_id: 'chan-persist',
      account_id: 'acct-42',
      channel_session_id: 'sess-99',
    };
    const ref1 = store.startThread(identity);
    assert.equal(ref1.canonical_thread_host, 'opld');
    assert.match(ref1.canonical_thread_id, /^thread_/);

    // Idempotent startThread returns the exact same thread ref
    const ref2 = store.startThread(identity);
    assert.deepEqual(ref2, ref1);

    // resumeThread updates last_resumed_at and fails closed on missing thread
    const resumed = store.resumeThread(ref1);
    assert.equal(resumed.canonical_thread_id, ref1.canonical_thread_id);
    assert.ok(resumed.last_resumed_at);
    assert.throws(
      () => store.resumeThread({ canonical_thread_host: 'opld', canonical_thread_id: 'thread_missing' }),
      (err: unknown) => err instanceof ChannelError && err.code === 'CHANNEL_IDENTITY_MISMATCH',
    );

    // Seed workspace + task so foreign keys on channel_thread_bindings are exercised
    const now = new Date().toISOString();
    db.prepare(
      "INSERT INTO workspaces (workspace_id, name, root_path, domain_id, revision, metadata_json, created_at, updated_at) VALUES ('ws_chan_1', 'Chan WS', ?, NULL, 1, '{}', ?, ?)",
    ).run(path.join(tmpDir, 'ws1'), now, now);
    db.prepare(
      "INSERT INTO workspaces (workspace_id, name, root_path, domain_id, revision, metadata_json, created_at, updated_at) VALUES ('ws_chan_2', 'Chan WS 2', ?, NULL, 1, '{}', ?, ?)",
    ).run(path.join(tmpDir, 'ws2'), now, now);
    db.prepare(
      "INSERT INTO tasks (task_id, workspace_id, agent_id, title, goal_prompt, status, revision, created_at, updated_at) VALUES ('task_chan_1', 'ws_chan_1', NULL, 'T1', 'G1', 'active', 1, ?, ?)",
    ).run(now, now);
    db.prepare(
      "INSERT INTO tasks (task_id, workspace_id, agent_id, title, goal_prompt, status, revision, created_at, updated_at) VALUES ('task_chan_2', 'ws_chan_1', NULL, 'T2', 'G2', 'active', 1, ?, ?)",
    ).run(now, now);

    store.recordTurnDispatch({
      binding_id: resumed.binding_id,
      workspace_id: 'ws_chan_1',
      last_task_id: 'task_chan_1',
    });
    // Subsequent dispatch updates last_task_id while preserving bound workspace_id via COALESCE
    store.recordTurnDispatch({
      binding_id: resumed.binding_id,
      workspace_id: 'ws_chan_2',
      last_task_id: 'task_chan_2',
    });

    db.close();

    // Reopen SQLite and verify persistence through SqliteChannelThreadBindingStore + ChannelProviderHost
    db = openSqliteStore(dbPath);
    const reopenedStore = new SqliteChannelThreadBindingStore(db);
    assert.deepEqual(reopenedStore.listBindings(), [{ ...identity, ...ref1 }]);
    const persisted = reopenedStore.getBindingByThread(ref1);
    assert.equal(persisted?.workspace_id, 'ws_chan_1');
    assert.equal(persisted?.last_task_id, 'task_chan_2');
    assert.deepEqual(reopenedStore.startThread(identity), ref1);

    const host = new ChannelProviderHost({
      callback: {
        startThread: async (id) => reopenedStore.startThread(id),
        resumeThread: async (ref) => {
          reopenedStore.resumeThread(ref);
        },
        startTurn: async (x) => ({ ...x, canonical_turn_id: 'turn_unused' }),
        subscribeTurn: () => ({ dispose: () => {} }),
        readTransportBindings: async () => reopenedStore.listBindings(),
      },
    });
    await host.attach({
      provider_id: 'chan-persist',
      start: () => ({ dispose: () => {} }),
    });
    const proj = host.getStateProjection();
    assert.equal(proj.transport_bindings.status, 'available');
    assert.equal(proj.transport_bindings.bindings.length, 1);
    assert.equal(proj.transport_bindings.bindings[0]?.canonical_thread_id, ref1.canonical_thread_id);
  } finally {
    try {
      db.close();
    } catch {
      // ignore if already closed
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
