import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createClientContext, openSqliteStore, runMigrations } from '@opl/core';

import {
  ConnectError,
  createConnectService,
  type ConnectionProvider,
} from '../src/index.ts';

function makeTempDir(prefix = 'connect-bindtoken-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function seedPackage(
  db: ReturnType<typeof openSqliteStore>,
  packageId: string,
  digest: string,
  installPath: string,
): void {
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO installed_packages (package_id, version, intent, origin, install_mode, install_path, content_digest, manifest_json, enabled, carrier_synced, installed_at, updated_at) VALUES (?, '1.0.0', 'app', 'opl', 'release', ?, ?, ?, 1, 0, ?, ?)",
  ).run(packageId, installPath, digest, JSON.stringify({ identity: { id: packageId } }), now, now);
}

test('consumerBindToken enforces session, package, digest, signature, expiry, and zero admin privilege', async () => {
  const tmpDir = makeTempDir();
  const prevStateDir = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = tmpDir;
  const db = openSqliteStore(path.join(tmpDir, 'opl.db'));
  try {
    runMigrations(db);
    seedPackage(db, 'pkg-alpha', `sha256:${'1'.repeat(64)}`, tmpDir);
    seedPackage(db, 'pkg-beta', `sha256:${'2'.repeat(64)}`, tmpDir);

    let currentTime = Date.parse('2026-11-24T15:00:00.000Z');
    const provider: ConnectionProvider = {
      provider_type: 'storage',
      listCapabilities: () => [{ capability_id: 'obj.read', title: 'Read Object', risk: 'read' }],
      invoke: async ({ input }) => ({ echo: input }),
    };

    const connect = createConnectService({
      db,
      stateDir: tmpDir,
      providers: [provider],
      nowMs: () => currentTime,
    });

    const appCtx = createClientContext({ session_id: 'sess_app', client_kind: 'opl_app' });
    const conn = await connect.add(appCtx, {
      provider_type: 'storage',
      display_name: 'Object Store',
      capabilities: [{ capability_id: 'obj.read', title: 'Read Object', risk: 'read' }],
      secret: 'store_secret',
    });

    const issued = await connect.issueConsumerBindToken(appCtx, {
      session_id: 'sess_mcp_1',
      consumer_package_id: 'pkg-alpha',
      ttl_ms: 60_000,
    });

    const req = await connect.requestAccess({
      consumer_bind_token: issued.token,
      session_id: 'sess_mcp_1',
      connection_id: conn.connection_id,
      capability_ids: ['obj.read'],
    });
    await connect.approveRequest(appCtx, { request_id: req.request_id });

    // 1. Valid invocation with matching (session_id, package_id, digest)
    const ok = await connect.invoke({
      consumer_bind_token: issued.token,
      session_id: 'sess_mcp_1',
      consumer_package_id: 'pkg-alpha',
      connection_id: conn.connection_id,
      capability_id: 'obj.read',
      input: { key: 'a.txt' },
    });
    assert.equal(ok.disposition, 'completed');

    // 2. Wrong session_id rejected
    await assert.rejects(
      () =>
        connect.invoke({
          consumer_bind_token: issued.token,
          session_id: 'sess_spoofed',
          consumer_package_id: 'pkg-alpha',
          connection_id: conn.connection_id,
          capability_id: 'obj.read',
          input: {},
        }),
      (err: unknown) =>
        err instanceof ConnectError
        && err.code === 'BIND_TOKEN_SESSION_MISMATCH'
        && err.rpcCode === -32001,
    );

    // 3. Wrong consumer_package_id rejected (pkg-beta presenting pkg-alpha's token)
    await assert.rejects(
      () =>
        connect.invoke({
          consumer_bind_token: issued.token,
          session_id: 'sess_mcp_1',
          consumer_package_id: 'pkg-beta',
          connection_id: conn.connection_id,
          capability_id: 'obj.read',
          input: {},
        }),
      (err: unknown) =>
        err instanceof ConnectError
        && err.code === 'BIND_TOKEN_PACKAGE_MISMATCH'
        && err.rpcCode === -32001,
    );

    // 4. 1-char signature tamper rejected
    const lastChar = issued.token.slice(-1);
    const tamperedSig = `${issued.token.slice(0, -1)}${lastChar === 'a' ? 'b' : 'a'}`;
    await assert.rejects(
      () =>
        connect.verifyConsumerBindToken(tamperedSig, {
          session_id: 'sess_mcp_1',
          consumer_package_id: 'pkg-alpha',
        }),
      (err: unknown) =>
        err instanceof ConnectError
        && err.code === 'UNAUTHORIZED_BIND_TOKEN'
        && err.rpcCode === -32001,
    );

    // 5. Digest change after token issuance invalidates token
    db.prepare('UPDATE installed_packages SET content_digest = ? WHERE package_id = ?').run(
      `sha256:${'9'.repeat(64)}`,
      'pkg-alpha',
    );
    await assert.rejects(
      () =>
        connect.verifyConsumerBindToken(issued.token, {
          session_id: 'sess_mcp_1',
          consumer_package_id: 'pkg-alpha',
        }),
      (err: unknown) => err instanceof ConnectError && err.code === 'CONSUMER_DIGEST_MISMATCH',
    );
    db.prepare('UPDATE installed_packages SET content_digest = ? WHERE package_id = ?').run(
      `sha256:${'1'.repeat(64)}`,
      'pkg-alpha',
    );

    // 6. Expiry rejected
    currentTime += 120_000;
    await assert.rejects(
      () =>
        connect.verifyConsumerBindToken(issued.token, {
          session_id: 'sess_mcp_1',
          consumer_package_id: 'pkg-alpha',
        }),
      (err: unknown) =>
        err instanceof ConnectError
        && err.code === 'BIND_TOKEN_EXPIRED'
        && err.rpcCode === -32001,
    );

    // 7. Zero admin/approval privilege: sdk_python/external cannot approve/revoke even with valid consumerBindToken
    currentTime -= 120_000;
    const req2 = await connect.requestAccess({
      consumer_bind_token: issued.token,
      session_id: 'sess_mcp_1',
      connection_id: conn.connection_id,
      capability_ids: ['obj.read'],
    });
    const pythonCtx = createClientContext({
      session_id: 'sess_mcp_1',
      client_kind: 'sdk_python',
      consumer_package_id: 'pkg-alpha',
    });
    await assert.rejects(
      () => connect.approveRequest(pythonCtx, { request_id: req2.request_id }),
      (err: unknown) =>
        err instanceof ConnectError && err.code === 'TRUSTED_HOST_REQUIRED' && err.rpcCode === -32003,
    );
  } finally {
    db.close();
    if (prevStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = prevStateDir;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('consumerBindToken requires non-empty session_id across all verification paths and batch re-approval throws REQUEST_NOT_PENDING', async () => {
  const tmpDir = makeTempDir('connect-bindtoken-reg-');
  const prevStateDir = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = tmpDir;
  const db = openSqliteStore(path.join(tmpDir, 'opl.db'));
  try {
    runMigrations(db);
    seedPackage(db, 'pkg-alpha', `sha256:${'1'.repeat(64)}`, tmpDir);

    const provider: ConnectionProvider = {
      provider_type: 'storage',
      listCapabilities: () => [{ capability_id: 'obj.read', title: 'Read Object', risk: 'read' }],
      invoke: async ({ input }) => ({ echo: input }),
    };

    const connect = createConnectService({
      db,
      stateDir: tmpDir,
      providers: [provider],
    });

    const appCtx = createClientContext({ session_id: 'sess_app', client_kind: 'opl_app' });
    const conn = await connect.add(appCtx, {
      provider_type: 'storage',
      display_name: 'Object Store',
      capabilities: [{ capability_id: 'obj.read', title: 'Read Object', risk: 'read' }],
      secret: 'store_secret',
    });

    const issued = await connect.issueConsumerBindToken(appCtx, {
      session_id: 'sess_legit',
      consumer_package_id: 'pkg-alpha',
      ttl_ms: 60_000,
    });

    // Omitted or empty session_id must fail closed on verifyConsumerBindToken, requestAccess, checkGrant, invoke, and forPackage
    for (const badSessionId of [undefined, '', '   ']) {
      await assert.rejects(
        () =>
          connect.verifyConsumerBindToken(issued.token, {
            session_id: badSessionId,
            consumer_package_id: 'pkg-alpha',
          }),
        (err: unknown) =>
          err instanceof ConnectError
          && err.code === 'BIND_TOKEN_SESSION_MISMATCH'
          && err.rpcCode === -32001,
      );

      await assert.rejects(
        () =>
          connect.requestAccess({
            consumer_bind_token: issued.token,
            session_id: badSessionId,
            connection_id: conn.connection_id,
            capability_ids: ['obj.read'],
          }),
        (err: unknown) =>
          err instanceof ConnectError && err.code === 'BIND_TOKEN_SESSION_MISMATCH',
      );

      const grantCheck = await connect.checkGrant({
        consumer_package_id: 'pkg-alpha',
        connection_id: conn.connection_id,
        capability_id: 'obj.read',
        consumer_bind_token: issued.token,
        session_id: badSessionId,
      });
      assert.equal(grantCheck.allowed, false);
      if (!grantCheck.allowed) {
        assert.equal(grantCheck.reason, 'bind_token_session_mismatch');
      }
    }

    const req = await connect.requestAccess({
      consumer_bind_token: issued.token,
      session_id: 'sess_legit',
      connection_id: conn.connection_id,
      capability_ids: ['obj.read'],
    });
    await connect.approveRequest(appCtx, { request_id: req.request_id });

    // Re-approving / denying already-processed batch request_id throws REQUEST_NOT_PENDING (-32009)
    await assert.rejects(
      () => connect.approveRequest(appCtx, { request_id: req.request_id }),
      (err: unknown) =>
        err instanceof ConnectError && err.code === 'REQUEST_NOT_PENDING' && err.rpcCode === -32009,
    );
    assert.throws(
      () => connect.denyRequest(appCtx, { request_id: req.request_id }),
      (err: unknown) =>
        err instanceof ConnectError && err.code === 'REQUEST_NOT_PENDING' && err.rpcCode === -32009,
    );
    await assert.rejects(
      () => connect.approveRequest(appCtx, { request_id: 'req_nonexistent' }),
      (err: unknown) =>
        err instanceof ConnectError && err.code === 'REQUEST_NOT_FOUND' && err.rpcCode === -32004,
    );

    // Invoke and forPackage without session_id must reject even after grant approval
    await assert.rejects(
      () =>
        connect.invoke({
          consumer_bind_token: issued.token,
          consumer_package_id: 'pkg-alpha',
          connection_id: conn.connection_id,
          capability_id: 'obj.read',
          input: {},
        }),
      (err: unknown) =>
        err instanceof ConnectError
        && err.code === 'BIND_TOKEN_SESSION_MISMATCH'
        && err.rpcCode === -32001,
    );

    const portMissingSession = connect.forPackage('pkg-alpha', {
      consumer_bind_token: issued.token,
    });
    assert.throws(
      () => portMissingSession.listConnections(),
      (err: unknown) => err instanceof ConnectError && err.code === 'BIND_TOKEN_SESSION_MISMATCH',
    );
    assert.throws(
      () => portMissingSession.listGrants(),
      (err: unknown) => err instanceof ConnectError && err.code === 'BIND_TOKEN_SESSION_MISMATCH',
    );
    await assert.rejects(
      () =>
        portMissingSession.invoke({
          connection_id: conn.connection_id,
          capability_id: 'obj.read',
          input: {},
        }),
      (err: unknown) =>
        err instanceof ConnectError && err.code === 'BIND_TOKEN_SESSION_MISMATCH',
    );
  } finally {
    db.close();
    if (prevStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = prevStateDir;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
