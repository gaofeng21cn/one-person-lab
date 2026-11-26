import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { OpldRpcError, createMcpAppOpldBridge, createOpldMcpAppHostAdapter } from '@opl/mcp-app-shared/bridge';
import { connectOpldRpcSession } from '@opl/mcp-app-shared/node-transport';
import { createDaemonSandbox, writeMinimalV2Package, type DaemonSandbox } from './helpers/sandbox.ts';

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

describe('Wave 2 Gate 7: Sandboxed MCP App Connect auth loopback & workspace.read via opld', () => {
  it('completes forPackage + consumerBindToken request/approve/invoke loopback, enforces -32003 on self-approve & 1-byte tamper, and prevents secret leaks', async () => {
    const sb = trackSandbox();
    await sb.spawnDaemonProcess();

    const canarySecret = 'CANARY_SECRET_GATE7_DO_NOT_LEAK';
    const relayDir = writeMinimalV2Package(path.join(sb.root, 'opl-relay'), {
      id: 'opl-relay',
      intent: 'app',
      extraManifest: {
        provides: {
          mcp_servers: [{ id: 'relay-mcp', transport: 'stdio', command: 'node', args: ['srv.mjs'] }],
          connection_providers: [
            {
              provider_type: 'opl-relay.mailbox',
              entrypoint: {
                kind: 'esm_module',
                module: './provider.mjs',
                export: 'invokeMailbox',
              },
              capabilities: [
                {
                  id: 'read_messages',
                  title: { 'zh-CN': '读取邮件', 'en-US': 'Read Messages' },
                  risk: 'read',
                },
              ],
            },
          ],
        },
        ui: {
          mcp_apps: [
            {
              id: 'relay_workbench',
              title: { 'zh-CN': 'Relay 工作台', 'en-US': 'Relay Workbench' },
              mcp_server_id: 'relay-mcp',
              resource_uri: 'ui://opl-relay/workbench',
              host_capabilities: ['theme_sync', 'workspace_read', 'connect_package_grant'],
            },
          ],
        },
      },
    });
    fs.writeFileSync(
      path.join(relayDir, 'provider.mjs'),
      [
        'export function invokeMailbox(req) {',
        '  return {',
        '    ok: true,',
        '    mailbox: req.connection?.account_label ?? "default",',
        '    provider_auth_ok: Boolean(req.secret && req.secret.length > 0),',
        '    messages: [{ id: "m1", subject: "Gate 7 Verified" }],',
        '  };',
        '}',
      ].join('\n'),
      'utf8',
    );

    const appSession = await connectOpldRpcSession({
      sessionPath: sb.sessionPath,
      clientKind: 'opl_app',
      apiVersion: '2.0',
    });
    const appBridge = createMcpAppOpldBridge(appSession.transport);

    const extSession = await connectOpldRpcSession({
      sessionPath: sb.sessionPath,
      clientKind: 'external',
      apiVersion: '2.0',
      consumerPackageId: 'opl-relay',
    });
    const extBridge = createMcpAppOpldBridge(extSession.transport);

    try {
      await appSession.transport.call('pack.link', { dir: relayDir, sync_codex: false });

      const ws = (await appSession.transport.call('workspace.init', {
        root_path: sb.workspaceDir,
        name: 'Gate7 WS',
      })) as { workspace_id: string };
      fs.mkdirSync(path.join(sb.workspaceDir, 'notes'), { recursive: true });
      fs.writeFileSync(path.join(sb.workspaceDir, 'notes', 'inbox.txt'), 'Sandboxed Read OK\n', 'utf8');

      await appSession.transport.call('connect.add', {
        connection_id: 'conn-mailbox',
        provider_type: 'opl-relay.mailbox',
        display_name: 'Primary Mailbox',
        account_label: 'pi@lab.org',
        secret: canarySecret,
      });

      const issued = await appBridge.issueConsumerBindToken({
        consumerPackageId: 'opl-relay',
        sessionId: extSession.handshake.session_id,
      });
      assert.ok(issued.token.startsWith('oplcbt1.'));

      const hostAdapter = createOpldMcpAppHostAdapter(extBridge, {
        consumerBindToken: issued.token,
        sessionId: extSession.handshake.session_id,
      });
      await hostAdapter.connect();

      // 1. Sandbox invokes connect -> GRANT_NOT_FOUND -> automatically submits connect.requestAccess
      const connectChangedPromise = appSession.transport.waitForEvent('event.connect.changed', {
        timeoutMs: 3_000,
      });
      const firstInvoke = await extBridge.invokeConnectOrRequestAccess({
        consumerBindToken: issued.token,
        consumerPackageId: 'opl-relay',
        sessionId: extSession.handshake.session_id,
        connectionId: 'conn-mailbox',
        capabilityId: 'read_messages',
        input: { folder: 'INBOX' },
      });
      assert.equal(firstInvoke.status, 'access_requested');
      const requestId = String((firstInvoke.request as { request_id?: string }).request_id ?? '');
      assert.ok(requestId.length > 0);
      await connectChangedPromise;

      // 2. Sandbox MUST NOT self-approve (-32003 TRUSTED_HOST_REQUIRED)
      await assert.rejects(
        () => extBridge.approveConnectRequest({ requestId }),
        (err: unknown) => err instanceof OpldRpcError && err.rpcCode === -32003 && err.isTrustedHostRequired,
      );

      // 3. Trusted opl_app approves request -> sandbox invoke succeeds without leaking canary secret
      await appBridge.approveConnectRequest({ requestId, approvedBy: 'opl_app_user' });
      const secondInvoke = await extBridge.invokeConnectOrRequestAccess({
        consumerBindToken: issued.token,
        consumerPackageId: 'opl-relay',
        sessionId: extSession.handshake.session_id,
        connectionId: 'conn-mailbox',
        capabilityId: 'read_messages',
        input: { folder: 'INBOX' },
      });
      assert.equal(secondInvoke.status, 'completed');
      const invokeJson = JSON.stringify(secondInvoke.result);
      assert.equal(invokeJson.includes(canarySecret), false);
      assert.equal(
        (secondInvoke.result as { disposition?: string; result?: { provider_auth_ok?: boolean } }).disposition,
        'completed',
      );
      assert.equal(
        (secondInvoke.result as { result?: { provider_auth_ok?: boolean } }).result?.provider_auth_ok,
        true,
      );

      // 4. Sandbox reads workspace file via MCP App Host Adapter
      const readToolRes = await hostAdapter.callServerTool({
        name: 'opl_app_contribution_read',
        arguments: {
          package_id: 'opl-relay',
          ref: 'workspace.read',
          input: { workspace_id: ws.workspace_id, path: 'notes/inbox.txt' },
        },
      });
      assert.equal(readToolRes.isError, false);
      assert.equal(
        (readToolRes.structuredContent as { content?: string }).content,
        'Sandboxed Read OK\n',
      );

      // 5. Tamper 1 byte in opl-relay -> fail-closed -32003
      fs.appendFileSync(path.join(relayDir, 'README.md'), 'X', 'utf8');
      await assert.rejects(
        () =>
          extBridge.invokeConnect({
            consumerBindToken: issued.token,
            consumerPackageId: 'opl-relay',
            sessionId: extSession.handshake.session_id,
            connectionId: 'conn-mailbox',
            capabilityId: 'read_messages',
            input: { folder: 'INBOX' },
          }),
        (err: unknown) => {
          if (!(err instanceof OpldRpcError)) return false;
          assert.equal(JSON.stringify(err).includes(canarySecret), false);
          return err.rpcCode === -32003;
        },
      );
    } finally {
      extSession.transport.close();
      appSession.transport.close();
    }
  });
});
