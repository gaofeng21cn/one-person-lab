import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { isProcessAlive, resolveStatePaths } from '@opl/core';
import { spawnDetachedDaemon, stopDaemonGracefully } from '../src/cli/client.ts';
import {
  connectTestRpc,
  createDaemonSandbox,
  writeMinimalV2Package,
} from './helpers/sandbox.ts';

test('T5-DAEMON-01 (G2-01 / Bug 1): spawnDetachedDaemon propagates OPL_STATE_DIR and survives 5-way concurrent cold boot', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 't5-daemon-boot-'));
  const customStateDir = path.join(tmpDir, 'isolated-state');
  const prevEnv = process.env.OPL_STATE_DIR;
  delete process.env.OPL_STATE_DIR;
  let bootPids = new Set<number>();
  try {
    const paths = resolveStatePaths({ stateDir: customStateDir });
    const results = await Promise.all(
      Array.from({ length: 5 }, () => spawnDetachedDaemon(paths)),
    );
    bootPids = new Set(results.map((r) => r.pid));
    assert.equal(bootPids.size, 1, 'All 5 concurrent callers must converge on 1 opld PID');
    assert.equal(fs.existsSync(paths.session_file), true);
  } finally {
    const stopRes = await stopDaemonGracefully(customStateDir);
    assert.equal(stopRes.stopped, true, 'stopDaemonGracefully must report stopped: true');
    for (const pid of bootPids) {
      assert.equal(isProcessAlive(pid), false, `Booted opld PID ${pid} must not remain alive after stop`);
    }
    const paths = resolveStatePaths({ stateDir: customStateDir });
    assert.equal(fs.existsSync(paths.session_file), false, 'opld.session.json must be removed after stop');
    assert.equal(fs.existsSync(paths.lock_file), false, 'opld.lock must be removed after stop');
    if (prevEnv !== undefined) process.env.OPL_STATE_DIR = prevEnv;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('T5-DAEMON-02 (G2-05, G2-06 / Bug 4, Bug 9): contribution_handler auth gate and workspace.read edge boundaries', async (t) => {
  const sb = createDaemonSandbox();
  t.after(() => sb.cleanup());
  await sb.startInProcess();

  const appRpc = await connectTestRpc(sb.sessionPath, 'opl_app');
  const extRpc = await connectTestRpc(sb.sessionPath, 'external');
  t.after(async () => {
    await appRpc.close();
    await extRpc.close();
  });

  // 1. Package with contribution_handler rejected for untrusted external client without consumer_bind_token
  const contribPkg = writeMinimalV2Package(path.join(sb.root, 'contrib-pkg'), {
    id: 'contrib-pkg',
    intent: 'app',
    extraManifest: {
      provides: {
        contribution_handler: { kind: 'cli', argv: ['node', './handler.mjs'] },
      },
      ui: {
        mcp_apps: [
          {
            id: 'contrib-pkg.wb',
            title: { 'zh-CN': 'WB', 'en-US': 'WB' },
            mcp_server_id: 'srv-1',
            resource_uri: 'ui://contrib-pkg/wb',
            host_capabilities: ['workspace_read'],
          },
        ],
        declarative: undefined,
      },
    },
  });
  // Wait: mcp_server_id requires provides.mcp_servers -> overwrite manifest cleanly with mcp_servers + contribution_handler
  fs.writeFileSync(path.join(contribPkg, 'handler.mjs'), 'console.log(JSON.stringify({ ok: true, leaked: true }));\n');
  fs.writeFileSync(path.join(contribPkg, 'srv.mjs'), 'console.log("ok");\n');
  fs.writeFileSync(
    path.join(contribPkg, 'opl-package.json'),
    JSON.stringify({
      schema_version: 'opl.package.v2',
      identity: {
        id: 'contrib-pkg',
        version: '1.0.0',
        intent: 'app',
        name: { 'zh-CN': 'C', 'en-US': 'C' },
        summary: { 'zh-CN': 'S', 'en-US': 'S' },
        publisher: 'one-person-lab',
      },
      provides: {
        mcp_servers: [{ id: 'srv-1', transport: 'stdio', command: 'node', args: ['./srv.mjs'] }],
        contribution_handler: { kind: 'cli', argv: ['node', './handler.mjs'] },
      },
      ui: {
        mcp_apps: [
          {
            id: 'contrib-pkg.wb',
            title: { 'zh-CN': 'WB', 'en-US': 'WB' },
            mcp_server_id: 'srv-1',
            resource_uri: 'ui://contrib-pkg/wb',
            host_capabilities: ['workspace_read'],
          },
        ],
      },
    }),
  );
  await appRpc.call('pack.link', { dir: contribPkg });

  await assert.rejects(
    () => extRpc.call('app.contribution.read', { package_id: 'contrib-pkg', ref: 'custom.read', input: {} }),
    (err: Error & { code?: number }) => err.code === -32003,
  );

  // With valid consumer_bind_token for contrib-pkg, external client succeeds
  const issued = (await appRpc.call('connect.issueConsumerBindToken', {
    consumer_package_id: 'contrib-pkg',
    session_id: extRpc.handshakeResult!.session_id,
  })) as { token: string };
  const okRead = (await extRpc.call('app.contribution.read', {
    package_id: 'contrib-pkg',
    ref: 'custom.read',
    consumer_bind_token: issued.token,
    input: {},
  })) as { ok: boolean };
  assert.equal(okRead.ok, true);

  // 2. workspace.read edge boundaries: >1 MiB FILE_TOO_LARGE, directory path, backslash traversal, deleted root_path -> -32004
  const wsDir = path.join(sb.root, 'ws-edge');
  fs.mkdirSync(path.join(wsDir, 'subdir'), { recursive: true });
  fs.writeFileSync(path.join(wsDir, 'big.bin'), Buffer.alloc(1024 * 1024 + 5, 0x61));
  const ws = (await appRpc.call('workspace.init', { root_path: wsDir, name: 'Edge WS' })) as { workspace_id: string };

  await assert.rejects(
    () =>
      extRpc.call('app.contribution.read', {
        package_id: 'contrib-pkg',
        ref: 'workspace.read',
        consumer_bind_token: issued.token,
        input: { workspace_id: ws.workspace_id, path: 'big.bin' },
      }),
    (err: Error & { message: string }) => /FILE_TOO_LARGE|exceeds/i.test(err.message),
  );
  await assert.rejects(
    () =>
      extRpc.call('app.contribution.read', {
        package_id: 'contrib-pkg',
        ref: 'workspace.read',
        consumer_bind_token: issued.token,
        input: { workspace_id: ws.workspace_id, path: 'subdir' },
      }),
    (err: Error & { code?: number }) => err.code === -32602,
  );
  await assert.rejects(
    () =>
      extRpc.call('app.contribution.read', {
        package_id: 'contrib-pkg',
        ref: 'workspace.read',
        consumer_bind_token: issued.token,
        input: { workspace_id: ws.workspace_id, path: '..\\outside.txt' },
      }),
    (err: Error & { code?: number }) => err.code === -32003,
  );

  // Deleted workspace root_path maps ENOENT to -32004 WORKSPACE_ROOT_MISSING
  fs.rmSync(wsDir, { recursive: true, force: true });
  await assert.rejects(
    () =>
      extRpc.call('app.contribution.read', {
        package_id: 'contrib-pkg',
        ref: 'workspace.read',
        consumer_bind_token: issued.token,
        input: { workspace_id: ws.workspace_id, path: 'note.md' },
      }),
    (err: Error & { code?: number }) => err.code === -32004,
  );
});

test('T5-DAEMON-03 (G2-07 / Bug 9): socket server caps oversized NDJSON buffer (>4 MiB) without OOM and rejects batch arrays', async (t) => {
  const sb = createDaemonSandbox();
  t.after(() => sb.cleanup());
  const srv = await sb.startInProcess();

  // Send >4 MiB without newline -> receives -32600 and closes socket
  const res = await new Promise<{ frames: unknown[]; closed: boolean }>((resolve, reject) => {
    const sock = net.createConnection(srv.session.socket_path);
    const frames: unknown[] = [];
    let buf = '';
    sock.setEncoding('utf8');
    sock.on('error', () => resolve({ frames, closed: true }));
    sock.on('data', (c) => {
      buf += c;
      let idx: number;
      while ((idx = buf.indexOf('\n')) >= 0) {
        frames.push(JSON.parse(buf.slice(0, idx)));
        buf = buf.slice(idx + 1);
      }
    });
    sock.on('close', () => resolve({ frames, closed: true }));
    sock.on('connect', () => {
      const chunk = 'x'.repeat(512 * 1024);
      let sent = 0;
      const sendNext = () => {
        if (sock.destroyed || !sock.writable || sent >= 9) return;
        sent += 1;
        sock.write(chunk, () => {
          setTimeout(sendNext, 5);
        });
      };
      sendNext();
    });
    setTimeout(() => reject(new Error('Timed out waiting for oversized buffer close')), 5000);
  });
  assert.equal(res.closed, true);
  assert.equal((res.frames[0] as { error?: { code?: number } })?.error?.code, -32600);

  // Batch array rejected with -32600
  const batchRes = await new Promise<{ frames: Array<{ id?: number | null; error?: { code?: number }; result?: unknown }> }>(
    (resolve, reject) => {
      const sock = net.createConnection(srv.session.socket_path);
      const frames: Array<{ id?: number | null; error?: { code?: number }; result?: unknown }> = [];
      let buf = '';
      let sentBatch = false;
      sock.setEncoding('utf8');
      sock.on('error', reject);
      sock.on('data', (c) => {
        buf += c;
        let idx: number;
        while ((idx = buf.indexOf('\n')) >= 0) {
          const frame = JSON.parse(buf.slice(0, idx)) as { id?: number | null; error?: { code?: number }; result?: unknown };
          frames.push(frame);
          buf = buf.slice(idx + 1);
          if (!sentBatch && frame.id === 1) {
            sentBatch = true;
            sock.write(`${JSON.stringify([{ jsonrpc: '2.0', id: 9, method: 'daemon.health' }])}\n`);
          } else if (sentBatch) {
            sock.destroy();
            resolve({ frames });
            return;
          }
        }
      });
      sock.on('connect', () => {
        sock.write(
          `${JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'daemon.handshake',
            params: { token: srv.session.token, client_kind: 'opl_app', api_version: '2.0' },
          })}\n`,
        );
      });
      setTimeout(() => reject(new Error('Timed out waiting for batch array -32600 response')), 5000);
    },
  );
  assert.equal(batchRes.frames.length, 2);
  assert.equal(batchRes.frames[1]?.error?.code, -32600);
});
