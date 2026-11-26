import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createClientContext, openSqliteStore, runMigrations, type ClientContext } from '@opl/core';

import {
  ConnectError,
  createConnectService,
  type ConnectionProvider,
} from '../src/index.ts';

function makeTempDir(prefix = 'connect-trusted-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function seedPackage(db: ReturnType<typeof openSqliteStore>, packageId: string, dir: string): void {
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO installed_packages (package_id, version, intent, origin, install_mode, install_path, content_digest, manifest_json, enabled, carrier_synced, installed_at, updated_at) VALUES (?, '1.0.0', 'agent', 'opl', 'release', ?, ?, ?, 1, 0, ?, ?)",
  ).run(packageId, dir, `sha256:${'d'.repeat(64)}`, '{}', now, now);
}

test('trusted-host enforcement (-32003 TRUSTED_HOST_REQUIRED) across all privileged connect operations', async () => {
  const tmpDir = makeTempDir();
  const prevStateDir = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = tmpDir;
  const db = openSqliteStore(path.join(tmpDir, 'opl.db'));
  try {
    runMigrations(db);
    seedPackage(db, 'pkg-consumer', tmpDir);

    const provider: ConnectionProvider = {
      provider_type: 'ext-api',
      listCapabilities: () => [{ capability_id: 'data.fetch', title: 'Fetch Data', risk: 'read' }],
      invoke: async () => ({ ok: true }),
    };

    const connect = createConnectService({
      db,
      stateDir: tmpDir,
      providers: [provider],
    });

    const appCtx = createClientContext({ session_id: 'app_1', client_kind: 'opl_app' });
    const cliCtx = createClientContext({ session_id: 'cli_1', client_kind: 'opl_cli' });
    const sdkPythonCtx = createClientContext({ session_id: 'py_1', client_kind: 'sdk_python' });
    const externalCtx = createClientContext({ session_id: 'ext_1', client_kind: 'external' });
    const forgedCtx: ClientContext = {
      session_id: 'forged_1',
      client_kind: 'external',
      trusted_host: true,
      authenticated_at: new Date().toISOString(),
    };

    const untrustedContexts: readonly ClientContext[] = [sdkPythonCtx, externalCtx, forgedCtx];

    for (const badCtx of untrustedContexts) {
      await assert.rejects(
        () =>
          connect.add(badCtx, {
            provider_type: 'ext-api',
            display_name: 'Blocked',
            secret: 'sec',
          }),
        (err: unknown) =>
          err instanceof ConnectError && err.code === 'TRUSTED_HOST_REQUIRED' && err.rpcCode === -32003,
      );
      await assert.rejects(
        () =>
          connect.issueConsumerBindToken(badCtx, {
            session_id: 's1',
            consumer_package_id: 'pkg-consumer',
          }),
        (err: unknown) =>
          err instanceof ConnectError && err.code === 'TRUSTED_HOST_REQUIRED' && err.rpcCode === -32003,
      );
    }

    // Trusted hosts opl_app & opl_cli succeed
    const conn = await connect.add(cliCtx, {
      provider_type: 'ext-api',
      display_name: 'Allowed CLI',
      capabilities: [{ capability_id: 'data.fetch', title: 'Fetch Data', risk: 'read' }],
      secret: 'secret_abc',
    });

    const req = await connect.requestAccess({
      consumer_package_id: 'pkg-consumer',
      connection_id: conn.connection_id,
      capability_ids: ['data.fetch'],
    });

    for (const badCtx of untrustedContexts) {
      await assert.rejects(
        () => connect.approveRequest(badCtx, { request_id: req.request_id }),
        (err: unknown) =>
          err instanceof ConnectError && err.code === 'TRUSTED_HOST_REQUIRED' && err.rpcCode === -32003,
      );
      assert.throws(
        () => connect.denyRequest(badCtx, { request_id: req.request_id }),
        (err: unknown) =>
          err instanceof ConnectError && err.code === 'TRUSTED_HOST_REQUIRED' && err.rpcCode === -32003,
      );
      await assert.rejects(
        () => connect.revoke(badCtx, { connection_id: conn.connection_id }),
        (err: unknown) =>
          err instanceof ConnectError && err.code === 'TRUSTED_HOST_REQUIRED' && err.rpcCode === -32003,
      );
      await assert.rejects(
        () => connect.rotateCredential(badCtx, { connection_id: conn.connection_id, secret: 'new_sec' }),
        (err: unknown) =>
          err instanceof ConnectError && err.code === 'TRUSTED_HOST_REQUIRED' && err.rpcCode === -32003,
      );
      assert.throws(
        () =>
          connect.updateCapabilities(badCtx, {
            connection_id: conn.connection_id,
            capabilities: [],
          }),
        (err: unknown) =>
          err instanceof ConnectError && err.code === 'TRUSTED_HOST_REQUIRED' && err.rpcCode === -32003,
      );
      await assert.rejects(
        () =>
          connect.invoke({
            client_context: badCtx,
            consumer_package_id: 'pkg-consumer',
            connection_id: conn.connection_id,
            capability_id: 'data.fetch',
            input: {},
          }),
        (err: unknown) =>
          err instanceof ConnectError && err.code === 'TRUSTED_HOST_REQUIRED' && err.rpcCode === -32003,
      );
    }

    // Grant row must remain 'requested' (zero approved rows)
    const row = db
      .prepare('SELECT status FROM connection_grants WHERE grant_id = ?')
      .get(req.grants[0]!.grant_id) as { status: string };
    assert.equal(row.status, 'requested');

    // Trusted opl_app approves and revokes cleanly
    const [approved] = await connect.approveRequest(appCtx, { grant_id: req.grants[0]!.grant_id });
    assert.equal(approved?.status, 'granted');

    await connect.revoke(cliCtx, { grant_id: approved!.grant_id });
    const afterRevoke = db
      .prepare('SELECT status FROM connection_grants WHERE grant_id = ?')
      .get(approved!.grant_id) as { status: string };
    assert.equal(afterRevoke.status, 'revoked');
  } finally {
    db.close();
    if (prevStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = prevStateDir;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
