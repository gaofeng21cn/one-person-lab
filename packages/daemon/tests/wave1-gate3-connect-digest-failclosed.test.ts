import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { openSqliteStore } from '@opl/core';
import { connectTestRpc, createDaemonSandbox, writeMinimalV2Package, type DaemonSandbox } from './helpers/sandbox.ts';

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

describe('Wave 1 Gate 3: opl-relay Connect Approval + 1-byte Tamper Fail-Closed + Untrusted Client Rejection', () => {
  it('enforces 3-layer secret isolation, app approval, 1-byte tamper digest fail-closed, and -32003 untrusted rejection', async () => {
    const sb = trackSandbox();
    await sb.startInProcess();

    const dispatchLog = path.join(sb.stubLogDir, 'relay-provider.jsonl');
    const relayDir = writeMinimalV2Package(path.join(sb.root, 'opl-relay'), {
      id: 'opl-relay',
      intent: 'app',
      extraManifest: {
        provides: {
          mcp_servers: [{ id: 'opl-relay-mcp', transport: 'stdio', command: './bin/relay-mcp', args: [] }],
          connection_providers: [
            {
              provider_type: 'opl-relay.mailbox',
              entrypoint: { kind: 'cli', argv: ['./bin/relay-provider'], transport: 'stdin_json_stdout_json' },
              capabilities: [
                { id: 'mailbox.search', title: { 'zh-CN': '搜索邮箱', 'en-US': 'Search mailbox' }, risk: 'read' },
                { id: 'mailbox.read', title: { 'zh-CN': '读取邮箱', 'en-US': 'Read mailbox' }, risk: 'read' },
                { id: 'draft.create', title: { 'zh-CN': '创建草稿', 'en-US': 'Create draft' }, risk: 'local_write' },
              ],
            },
          ],
        },
        ui: {
          mcp_apps: [
            {
              id: 'mail-workbench',
              title: { 'zh-CN': '邮件工作台', 'en-US': 'Mail Workbench' },
              mcp_server_id: 'opl-relay-mcp',
              resource_uri: 'ui://opl-relay/mail-workbench.html',
              host_capabilities: ['theme_sync', 'workspace_read', 'connect_package_grant'],
            },
          ],
        },
      },
    });
    fs.mkdirSync(path.join(relayDir, 'bin'), { recursive: true });
    fs.writeFileSync(path.join(relayDir, 'bin', 'relay-mcp'), '#!/usr/bin/env node\nconsole.log("{}")\n', { mode: 0o755 });
    fs.writeFileSync(
      path.join(relayDir, 'bin', 'relay-provider'),
      [
        '#!/usr/bin/env node',
        'const fs = require("node:fs");',
        'const chunks = [];',
        'process.stdin.on("data", (c) => chunks.push(c));',
        'process.stdin.on("end", () => {',
        '  const req = JSON.parse(Buffer.concat(chunks).toString("utf8"));',
        `  fs.appendFileSync(${JSON.stringify(dispatchLog)}, JSON.stringify({ cap: req.capability_id }) + "\\n");`,
        '  process.stdout.write(JSON.stringify({ ok: true, disposition: "completed", capability: req.capability_id, items: ["msg-1"] }) + "\\n");',
        '});',
      ].join('\n'),
      { mode: 0o755 },
    );

    const masDir = writeMinimalV2Package(path.join(sb.root, 'mas'), {
      id: 'mas',
      intent: 'agent',
      extraManifest: {
        permissions: {
          connections: [
            {
              provider_type: 'opl-relay.mailbox',
              capabilities: ['mailbox.search', 'mailbox.read'],
              reason: { 'zh-CN': '检索科研邮件', 'en-US': 'Search research mailbox' },
            },
          ],
        },
      },
    });

    const appRpc = await connectTestRpc(sb.sessionPath, 'opl_app', '2.0');
    const sdkRpc = await connectTestRpc(sb.sessionPath, 'sdk_python', '2.0');
    const extRpc = await connectTestRpc(sb.sessionPath, 'external', '2.0');

    await appRpc.call('pack.link', { dir: relayDir });
    await appRpc.call('pack.link', { dir: masDir });

    const canarySecret = 'canary-relay-secret-never-leaked-g3';
    await appRpc.call('connect.add', {
      connection_id: 'conn-relay-mail',
      provider_type: 'opl-relay.mailbox',
      display_name: 'OPL Relay Mail',
      account_label: 'research@lab',
      secret: canarySecret,
    });

    const listed = (await appRpc.call('connect.list', {})) as { connections: Array<Record<string, unknown>> };
    assert.equal(JSON.stringify(listed).includes(canarySecret), false);
    assert.equal(listed.connections[0]?.credential_handle, undefined);

    const db = openSqliteStore(sb.dbPath, { readOnly: true });
    const rawConn = db
      .prepare("SELECT credential_handle FROM connections WHERE connection_id = 'conn-relay-mail'")
      .get() as { credential_handle: string };
    db.close();
    assert.match(rawConn.credential_handle, /^vault:/);
    assert.equal(fs.readFileSync(sb.dbPath).includes(Buffer.from(canarySecret, 'utf8')), false);

    // Request access + untrusted approval rejection (-32003)
    const tok = (await appRpc.call('connect.issueConsumerBindToken', {
      consumer_package_id: 'mas',
      session_id: sdkRpc.handshakeResult!.session_id,
    })) as { token: string };

    const req = (await sdkRpc.call('connect.requestAccess', {
      consumer_bind_token: tok.token,
      connection_id: 'conn-relay-mail',
      capability_ids: ['mailbox.search'],
    })) as { request_id: string };

    for (const untrusted of [sdkRpc, extRpc]) {
      await assert.rejects(
        () => untrusted.call('connect.approveRequest', { request_id: req.request_id }),
        (err: Error & { code?: number }) => err.code === -32003 && /TRUSTED_HOST_REQUIRED/i.test(err.message),
      );
    }

    // Trusted opl_app approves -> invoke succeeds
    await appRpc.call('connect.approveRequest', { request_id: req.request_id });
    const invoked = (await sdkRpc.call('connect.invoke', {
      consumer_bind_token: tok.token,
      connection_id: 'conn-relay-mail',
      capability_id: 'mailbox.search',
      input: { q: 'mace' },
    })) as { disposition: string; result: unknown };
    assert.equal(invoked.disposition, 'completed');
    assert.equal(JSON.stringify(invoked).includes(canarySecret), false);
    assert.equal(fs.readFileSync(dispatchLog, 'utf8').trim().split('\n').length, 1);

    // 1-byte tamper in consumer mas fails closed immediately (even before re-link via verifyRuntimeDigest)
    fs.appendFileSync(path.join(masDir, 'README.md'), '!', 'utf8');
    await assert.rejects(
      () =>
        sdkRpc.call('connect.invoke', {
          consumer_bind_token: tok.token,
          connection_id: 'conn-relay-mail',
          capability_id: 'mailbox.search',
          input: { q: 'tampered' },
        }),
      (err: Error & { code?: number }) => err.code === -32003,
    );
    assert.equal(fs.readFileSync(dispatchLog, 'utf8').trim().split('\n').length, 1);

    // Re-link updates digest; stale grant remains fail-closed until re-approved
    await appRpc.call('pack.link', { dir: masDir });
    await assert.rejects(
      () =>
        sdkRpc.call('connect.invoke', {
          consumer_bind_token: tok.token,
          connection_id: 'conn-relay-mail',
          capability_id: 'mailbox.search',
          input: { q: 'after-relink' },
        }),
      (err: Error & { code?: number }) => err.code === -32003,
    );
    assert.equal(fs.readFileSync(dispatchLog, 'utf8').trim().split('\n').length, 1);

    await appRpc.close();
    await sdkRpc.close();
    await extRpc.close();
  });
});
