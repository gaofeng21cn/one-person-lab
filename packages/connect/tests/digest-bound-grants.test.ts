import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createClientContext, openSqliteStore, runMigrations } from '@opl/core';
import { queryTimeline } from '@opl/ledger';

import {
  ConnectError,
  createConnectService,
  type CapabilityDescriptor,
  type ConnectionProvider,
} from '../src/index.ts';

function makeTempDir(prefix = 'connect-digest-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function sha256File(filePath: string): string {
  return `sha256:${crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')}`;
}

function seedInstalledPackage(
  db: ReturnType<typeof openSqliteStore>,
  packageId: string,
  digest: string,
  installPath: string,
  enabled = 1,
): void {
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO installed_packages (package_id, version, intent, origin, install_mode, install_path, content_digest, manifest_json, enabled, carrier_synced, installed_at, updated_at) VALUES (?, '1.0.0', 'agent', 'opl', 'release', ?, ?, ?, ?, 0, ?, ?)",
  ).run(
    packageId,
    installPath,
    digest,
    JSON.stringify({ identity: { id: packageId, name: packageId } }),
    enabled,
    now,
    now,
  );
}

function seedWorkspaceAndTask(
  db: ReturnType<typeof openSqliteStore>,
  workspaceRoot: string,
): string {
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO workspaces (workspace_id, name, root_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
  ).run('ws_1', 'Test WS', workspaceRoot, now, now);
  db.prepare(
    "INSERT INTO tasks (task_id, workspace_id, title, goal_prompt, status, created_at, updated_at) VALUES (?, ?, 'Task', 'Goal', 'active', ?, ?)",
  ).run('task_1', 'ws_1', now, now);
  return 'task_1';
}

test('forPackage fails closed on 1-byte consumer tamper, security_revision bump, capability escalation, and expiry', async () => {
  const tmpDir = makeTempDir();
  const prevStateDir = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = tmpDir;
  const db = openSqliteStore(path.join(tmpDir, 'opl.db'));
  try {
    runMigrations(db);
    const pkgDir = path.join(tmpDir, 'pkg-consumer');
    fs.mkdirSync(pkgDir, { recursive: true });
    const artifactPath = path.join(pkgDir, 'index.js');
    fs.writeFileSync(artifactPath, 'export const v = 1;\n', 'utf8');
    const initialDigest = sha256File(artifactPath);

    seedInstalledPackage(db, 'pkg-a', initialDigest, pkgDir);
    seedInstalledPackage(db, 'pkg-b', `sha256:${'b'.repeat(64)}`, pkgDir);

    let liveRisk: CapabilityDescriptor['risk'] = 'read';
    let liveTitle = 'Read Mailbox';
    let invokeCount = 0;

    const provider: ConnectionProvider = {
      provider_type: 'relay-mail',
      listCapabilities: () => [
        { capability_id: 'mail.read', title: liveTitle, risk: liveRisk },
      ],
      invoke: async () => {
        invokeCount += 1;
        return { ok: true, count: invokeCount };
      },
    };

    let nowEpoch = Date.parse('2026-11-24T12:00:00.000Z');
    const connect = createConnectService({
      db,
      stateDir: tmpDir,
      providers: [provider],
      verifyRuntimeDigest: (pkg) => {
        if (pkg.package_id !== 'pkg-a') return true;
        return sha256File(artifactPath) === pkg.content_digest;
      },
      nowMs: () => nowEpoch,
    });

    const appCtx = createClientContext({ session_id: 's1', client_kind: 'opl_app' });
    const conn = await connect.add(appCtx, {
      provider_type: 'relay-mail',
      display_name: 'Relay Mail',
      capabilities: [{ capability_id: 'mail.read', title: 'Read Mailbox', risk: 'read' }],
      secret: 'secret_v1',
    });

    const portA = connect.forPackage('pkg-a');
    const portB = connect.forPackage('pkg-b');
    const reqA = await portA.requestAccess({
      connection_id: conn.connection_id,
      capability_ids: ['mail.read'],
      expires_at: new Date(nowEpoch + 60_000).toISOString(),
    });
    const reqB = await portB.requestAccess({
      connection_id: conn.connection_id,
      capability_ids: ['mail.read'],
    });
    const [grantA] = await connect.approveRequest(appCtx, { request_id: reqA.request_id });
    const [grantB] = await connect.approveRequest(appCtx, { request_id: reqB.request_id });
    assert.ok(grantA && grantB);

    // Baseline invocation works
    const res1 = await portA.invoke({
      connection_id: conn.connection_id,
      capability_id: 'mail.read',
      input: { q: 'hello' },
    });
    assert.equal(res1.disposition, 'completed');
    assert.equal(invokeCount, 1);

    // 1. 1-byte tamper of on-disk artifact -> immediate fail-closed without calling provider.invoke
    fs.writeFileSync(artifactPath, 'export const v = 2;\n', 'utf8');
    await assert.rejects(
      () =>
        portA.invoke({
          connection_id: conn.connection_id,
          capability_id: 'mail.read',
          input: { q: 'after-tamper' },
        }),
      (err: unknown) => err instanceof ConnectError && err.code === 'CONSUMER_DIGEST_MISMATCH',
    );
    assert.equal(invokeCount, 1);

    // Restore artifact, verify 1-byte DB digest mutation also fails closed and marks grant stale
    fs.writeFileSync(artifactPath, 'export const v = 1;\n', 'utf8');
    const mutatedDigest = `${initialDigest.slice(0, -1)}${initialDigest.endsWith('0') ? '1' : '0'}`;
    db.prepare('UPDATE installed_packages SET content_digest = ? WHERE package_id = ?').run(
      mutatedDigest,
      'pkg-a',
    );
    await assert.rejects(
      () =>
        portA.invoke({
          connection_id: conn.connection_id,
          capability_id: 'mail.read',
          input: {},
        }),
      (err: unknown) => err instanceof ConnectError && err.code === 'CONSUMER_DIGEST_MISMATCH',
    );
    const staleProjection = connect.listProjection({ consumer_package_id: 'pkg-a' });
    assert.equal(staleProjection.grants[0]?.status, 'stale');
    assert.equal(staleProjection.grants[0]?.stale_reason, 'consumer_descriptor_changed');

    // Restore DB digest
    db.prepare('UPDATE installed_packages SET content_digest = ? WHERE package_id = ?').run(
      initialDigest,
      'pkg-a',
    );

    // 2. Capability risk escalation & title drift rejected fail-closed without invoking provider
    liveRisk = 'external_write';
    const riskCheck = await portA.checkGrant({
      connection_id: conn.connection_id,
      capability_id: 'mail.read',
    });
    assert.equal(riskCheck.allowed, false);
    assert.equal(riskCheck.reason, 'capability_risk_escalation');
    await assert.rejects(
      () =>
        portA.invoke({
          connection_id: conn.connection_id,
          capability_id: 'mail.read',
          input: {},
        }),
      (err: unknown) => err instanceof ConnectError && err.code === 'CAPABILITY_RISK_ESCALATION',
    );
    assert.equal(invokeCount, 1);

    liveRisk = 'read';
    liveTitle = 'Changed Title';
    await assert.rejects(
      () =>
        portA.invoke({
          connection_id: conn.connection_id,
          capability_id: 'mail.read',
          input: {},
        }),
      (err: unknown) => err instanceof ConnectError && err.code === 'CAPABILITY_MISMATCH',
    );
    liveTitle = 'Read Mailbox';

    // 3. Independent per-consumer revocation (revoking pkg-a leaves pkg-b active)
    await connect.revoke(appCtx, { grant_id: grantA.grant_id });
    const checkA = await portA.checkGrant({ connection_id: conn.connection_id, capability_id: 'mail.read' });
    const checkB = await portB.checkGrant({ connection_id: conn.connection_id, capability_id: 'mail.read' });
    assert.equal(checkA.allowed, false);
    assert.equal(checkB.allowed, true);

    // 4. Grant expiry
    const reqExp = await portA.requestAccess({
      connection_id: conn.connection_id,
      capability_ids: ['mail.read'],
      expires_at: new Date(nowEpoch + 10_000).toISOString(),
    });
    await connect.approveRequest(appCtx, { request_id: reqExp.request_id });
    nowEpoch += 20_000;
    const expCheck = await portA.checkGrant({ connection_id: conn.connection_id, capability_id: 'mail.read' });
    assert.equal(expCheck.allowed, false);
    assert.equal(expCheck.reason, 'grant_expired');

    // 5. security_revision bump via rotateCredential invalidates pkg-b's active grant
    const rotated = await connect.rotateCredential(appCtx, {
      connection_id: conn.connection_id,
      secret: 'secret_v2',
    });
    assert.equal(rotated.security_revision, 2);
    const afterRotateB = await portB.checkGrant({
      connection_id: conn.connection_id,
      capability_id: 'mail.read',
    });
    assert.equal(afterRotateB.allowed, false);
    assert.equal(invokeCount, 1);

    // 6. Soft-delete ('deleted') works with existing grants (no FK violation) and purges secret
    await connect.revoke(appCtx, {
      connection_id: conn.connection_id,
      delete_permanently: true,
      purge_secret: true,
    });
    assert.equal(connect.list().length, 0);
    assert.equal(connect.list({ include_deleted: true })[0]?.status, 'deleted');
  } finally {
    db.close();
    if (prevStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = prevStateDir;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('post-dispatch revocation or revision bump withholds result as unknown_after_dispatch with zero retry', async () => {
  const tmpDir = makeTempDir('connect-postdispatch-');
  const prevStateDir = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = tmpDir;
  const db = openSqliteStore(path.join(tmpDir, 'opl.db'));
  try {
    runMigrations(db);
    const taskId = seedWorkspaceAndTask(db, tmpDir);
    seedInstalledPackage(db, 'pkg-midflight', `sha256:${'c'.repeat(64)}`, tmpDir);

    let dispatchCalls = 0;
    let serviceRef: ReturnType<typeof createConnectService>;
    const appCtx = createClientContext({ session_id: 's1', client_kind: 'opl_app' });

    const provider: ConnectionProvider = {
      provider_type: 'midflight-provider',
      listCapabilities: () => [{ capability_id: 'op.send', title: 'Send', risk: 'external_write' }],
      invoke: async ({ connection }) => {
        dispatchCalls += 1;
        // Simulate mid-flight credential rotation while provider call is in flight
        await serviceRef.rotateCredential(appCtx, {
          connection_id: connection.connection_id,
          secret: 'rotated_midflight',
        });
        return { sent: true };
      },
    };

    serviceRef = createConnectService({
      db,
      stateDir: tmpDir,
      providers: [provider],
    });

    const conn = await serviceRef.add(appCtx, {
      provider_type: 'midflight-provider',
      display_name: 'Midflight',
      capabilities: [{ capability_id: 'op.send', title: 'Send', risk: 'external_write' }],
      secret: 'initial_secret',
    });

    const port = serviceRef.forPackage('pkg-midflight', { audit_context: { task_id: taskId } });
    const req = await port.requestAccess({
      connection_id: conn.connection_id,
      capability_ids: ['op.send'],
    });
    await serviceRef.approveRequest(appCtx, { request_id: req.request_id });

    await assert.rejects(
      () =>
        port.invoke({
          connection_id: conn.connection_id,
          capability_id: 'op.send',
          input: { target: 'user' },
        }),
      (err: unknown) =>
        err instanceof ConnectError
        && err.code === 'AUTHORIZATION_CHANGED_AFTER_DISPATCH'
        && err.disposition === 'unknown_after_dispatch',
    );

    // Must not retry after unknown_after_dispatch
    assert.equal(dispatchCalls, 1);

    const ledgerEntries = queryTimeline(db, { task_id: taskId, entry_kind: 'typed_blocker' });
    assert.equal(ledgerEntries.length, 1);
    assert.equal(ledgerEntries[0]?.payload.code, 'authorization_changed_after_dispatch');
  } finally {
    db.close();
    if (prevStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = prevStateDir;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
