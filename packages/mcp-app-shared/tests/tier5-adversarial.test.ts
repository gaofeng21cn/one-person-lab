import assert from 'node:assert/strict';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import test from 'node:test';

import {
  NodeSocketRpcTransport,
  OpldContributionBridge,
  OpldRpcError,
  createOpldMcpAppHostAdapter,
} from '../src/index.ts';
import type { OpldRpcTransport } from '../src/types.ts';

test('T5-MCP-01 (G2-13): NodeSocketRpcTransport.waitForEvent filters by predicate, times out, and rejects on close()', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 't5-mcp-sock-'));
  const sockPath = path.join(tmpDir, 'mock.sock');
  const server = net.createServer((conn) => {
    conn.setEncoding('utf8');
    let buf = '';
    conn.on('data', (chunk) => {
      buf += chunk;
      let idx: number;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const msg = JSON.parse(buf.slice(0, idx)) as { id?: number; method?: string };
        buf = buf.slice(idx + 1);
        if (msg.method === 'daemon.handshake') {
          conn.write(
            `${JSON.stringify({
              jsonrpc: '2.0',
              id: msg.id,
              result: {
                ok: true,
                session_id: 's1',
                api_version: '2.0',
                base_version: '2.0.0',
                client_kind: 'opl_app',
                trusted_host: true,
              },
            })}\n`,
          );
          setTimeout(() => {
            conn.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'event.pack.progress', params: { seq: 1 } })}\n`);
            conn.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'event.pack.progress', params: { seq: 2 } })}\n`);
          }, 20);
        }
      }
    });
  });

  await new Promise<void>((resolve) => server.listen(sockPath, resolve));
  try {
    const socket = await new Promise<net.Socket>((resolve, reject) => {
      const s = net.createConnection(sockPath, () => resolve(s));
      s.once('error', reject);
    });
    const transport = new NodeSocketRpcTransport(socket, 1000);
    await transport.handshake({ token: '0'.repeat(64), clientKind: 'opl_app' });

    const ev = await transport.waitForEvent('event.pack.progress', {
      timeoutMs: 1000,
      predicate: (p) => p.seq === 2,
    });
    assert.equal(ev.params.seq, 2);

    await assert.rejects(
      () => transport.waitForEvent('event.never.arrives', { timeoutMs: 60 }),
      (err: unknown) => err instanceof OpldRpcError && err.errorCode === 'EVENT_TIMEOUT',
    );

    const pendingWait = transport.waitForEvent('event.after.close', { timeoutMs: 2000 });
    await transport.close();
    await assert.rejects(
      () => pendingWait,
      (err: unknown) => err instanceof OpldRpcError && err.errorCode === 'SOCKET_CLOSED',
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('T5-MCP-02 (G2-13): createOpldMcpAppHostAdapter fails closed with CONFIRMATION_REQUIRED when catalog lacks action and live getAppState fails', async () => {
  const mockTransport: OpldRpcTransport = {
    isTrustedHost: true,
    isClosed: false,
    async call(method: string) {
      if (method === 'app.state.get') {
        throw new Error('daemon_unreachable');
      }
      return { ok: true };
    },
    onEvent() {
      return () => {};
    },
    async waitForEvent() {
      throw new Error('unused');
    },
    async close() {},
  };

  const bridge = new OpldContributionBridge(mockTransport);
  const adapter = createOpldMcpAppHostAdapter(bridge, {
    consumerBindToken: 'oplcbt1.fake',
    sessionId: 's1',
  });
  await adapter.connect();

  const res = await adapter.callServerTool({
    name: 'opl_app_contribution_execute',
    arguments: {
      package_id: 'demo-pkg',
      action_id: 'unknown.mutating.action',
      payload: {},
      dry_run: false,
    },
  });
  assert.equal(res.isError, true);
  assert.match(JSON.stringify(res), /CONFIRMATION_REQUIRED/);
});
