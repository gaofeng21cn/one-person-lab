import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  OpldContributionBridge,
  OpldRpcError,
  createMcpAppOpldBridge,
  createOpldMcpAppHostAdapter,
} from '../src/opld-bridge.ts';
import {
  connectOpldRpcSession,
  probeOpldSocket,
  readOpldSessionFile,
} from '../src/node-rpc-transport.ts';
import { createOplMcpAppViewController, createSafeStorage } from '../src/view.ts';
import type { DocumentLike, ElementLike, OpldRpcTransport } from '../src/types.ts';

test('OpldRpcError parses structured JSON-RPC errors and strips sensitive keys', () => {
  const errAuth = OpldRpcError.fromJsonRpcError({
    code: -32001,
    message: 'BIND_TOKEN_EXPIRED: token expired',
    data: {
      code: 'BIND_TOKEN_EXPIRED',
      reason_code: 'expired',
      token: 'SECRET_MUST_BE_STRIPPED',
      session_token: 'ALSO_STRIPPED',
    },
  });
  assert.equal(errAuth.isAuthError, true);
  assert.equal(errAuth.errorCode, 'BIND_TOKEN_EXPIRED');
  assert.equal(errAuth.reasonCode, 'expired');
  assert.equal('token' in errAuth.data, false);
  assert.equal('session_token' in errAuth.data, false);

  const errTrust = OpldRpcError.fromJsonRpcError({
    code: -32003,
    message: 'TRUSTED_HOST_REQUIRED',
    data: { code: 'TRUSTED_HOST_REQUIRED' },
  });
  assert.equal(errTrust.isAuthError, true);
  assert.equal(errTrust.isTrustedHostRequired, true);

  const errGrant = OpldRpcError.fromJsonRpcError({
    code: -32003,
    message: 'GRANT_NOT_FOUND',
    data: { code: 'GRANT_NOT_FOUND' },
  });
  assert.equal(errGrant.isGrantRequired, true);

  const errDigest = OpldRpcError.fromJsonRpcError({
    code: -32003,
    message: 'CONSUMER_DIGEST_MISMATCH',
    data: { code: 'CONSUMER_DIGEST_MISMATCH' },
  });
  assert.equal(errDigest.isDigestMismatch, true);

  const errWorkspace = OpldRpcError.fromJsonRpcError({
    code: -32003,
    message: 'WORKSPACE_READ_CAPABILITY_REQUIRED',
    data: { code: 'WORKSPACE_READ_CAPABILITY_REQUIRED' },
  });
  assert.equal(errWorkspace.isWorkspaceReadDenied, true);

  const errUpgrade = OpldRpcError.fromJsonRpcError({
    code: -32002,
    message: 'base_upgrade_required',
    data: { code: 'base_upgrade_required' },
  });
  assert.equal(errUpgrade.isUpgradeRequired, true);

  const errRev = OpldRpcError.fromJsonRpcError({
    code: -32009,
    message: 'REVISION_CONFLICT',
    data: { code: 'REVISION_CONFLICT' },
  });
  assert.equal(errRev.isRevisionConflict, true);
});

test('OpldContributionBridge and host adapter implement Gate 7 loopback and fail-closed confirmation', async () => {
  const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
  let grantApproved = false;

  const mockTransport: OpldRpcTransport = {
    getSessionId: () => 'sess_mock_1',
    call: async <T>(method: string, params: Record<string, unknown> = {}): Promise<T> => {
      calls.push({ method, params });
      if (method === 'connect.invoke' && !grantApproved) {
        throw OpldRpcError.fromJsonRpcError({
          code: -32003,
          message: 'GRANT_NOT_FOUND',
          data: { code: 'GRANT_NOT_FOUND' },
        });
      }
      if (method === 'connect.invoke' && grantApproved) {
        return { ok: true, result: { messages: ['m1'] } } as T;
      }
      if (method === 'connect.requestAccess') {
        return { request_id: 'req-1', status: 'requested' } as T;
      }
      if (method === 'connect.approveRequest') {
        grantApproved = true;
        return { grant_id: 'grant-1', status: 'granted' } as T;
      }
      if (method === 'app.contribution.read') {
        return {
          ok: true,
          ref: params.ref,
          workspace_id: 'ws-1',
          path: 'notes/a.md',
          content: 'hello\n',
          encoding: 'utf8',
          sha256: 'sha256:abc',
        } as T;
      }
      if (method === 'app.contribution.execute') {
        return { ok: true, action_id: params.action_id, dry_run: params.dry_run } as T;
      }
      if (method === 'app.state.get') {
        return { packages: [] } as T;
      }
      return {} as T;
    },
  };

  const bridge = createMcpAppOpldBridge(mockTransport);
  assert.ok(bridge instanceof OpldContributionBridge);

  // 1. invokeConnectOrRequestAccess requests access when grant missing
  const first = await bridge.invokeConnectOrRequestAccess({
    consumerBindToken: 'oplcbt1.abc.def',
    connectionId: 'conn-1',
    capabilityId: 'mailbox.read',
  });
  assert.equal(first.status, 'access_requested');
  if (first.status === 'access_requested') {
    assert.equal(first.request.request_id, 'req-1');
  }

  // 2. After trusted host approves, second call completes
  await bridge.approveConnectRequest({ requestId: 'req-1', approvedBy: 'human' });
  const second = await bridge.invokeConnectOrRequestAccess({
    consumerBindToken: 'oplcbt1.abc.def',
    connectionId: 'conn-1',
    capabilityId: 'mailbox.read',
  });
  assert.equal(second.status, 'completed');

  // 3. Host adapter injects consumerBindToken for workspace.read and enforces confirmed: true for execute
  const adapter = createOpldMcpAppHostAdapter(bridge, {
    consumerBindToken: 'oplcbt1.abc.def',
    sessionId: 'sess_mock_1',
  });

  const wsReadRes = await adapter.callServerTool({
    name: 'opl_app_contribution_read',
    arguments: {
      package_id: 'opl-relay',
      ref: 'workspace.read',
      input: { workspace_id: 'ws-1', path: 'notes/a.md' },
    },
  });
  assert.equal(wsReadRes.isError, false);
  assert.equal(wsReadRes.structuredContent?.content, 'hello\n');

  const unconfirmedExec = await adapter.callServerTool({
    name: 'opl_app_contribution_execute',
    arguments: { package_id: 'opl-relay', ref: 'relay.send', input: {}, confirmed: false },
  });
  assert.equal(unconfirmedExec.isError, true);
  assert.equal(
    (unconfirmedExec.structuredContent?.error as { code?: string })?.code,
    'CONFIRMATION_REQUIRED',
  );

  const confirmedExec = await adapter.callServerTool({
    name: 'opl_app_contribution_execute',
    arguments: { package_id: 'opl-relay', ref: 'relay.send', input: { x: 1 }, confirmed: true },
  });
  assert.equal(confirmedExec.isError, false);
});

test('connectOpldRpcSession performs NDJSON handshake, multiplexes RPCs, handles Server-Push events, and maps errors', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-mcp-shared-rpc-'));
  const sockPath = path.join(tmpDir, 'opld.sock');
  const sessionPath = path.join(tmpDir, 'opld.session.json');
  const expectedToken = 'a'.repeat(64);

  const server = net.createServer((socket) => {
    let buf = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => {
      buf += chunk;
      let idx: number;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line) continue;
        const req = JSON.parse(line) as {
          id: number;
          method: string;
          params?: Record<string, unknown>;
        };
        if (req.method === 'daemon.handshake') {
          if (req.params?.token !== expectedToken) {
            socket.write(
              `${JSON.stringify({
                jsonrpc: '2.0',
                id: req.id,
                error: { code: -32001, message: 'UNAUTHORIZED', data: { code: 'UNAUTHORIZED' } },
              })}\n`,
            );
            socket.destroy();
            return;
          }
          socket.write(
            `${JSON.stringify({
              jsonrpc: '2.0',
              id: req.id,
              result: {
                ok: true,
                session_id: 'sess_live_1',
                api_version: '2.0',
                client_kind: req.params?.client_kind ?? 'external',
                trusted_host: req.params?.client_kind === 'opl_app',
              },
            })}\n`,
          );
          continue;
        }
        if (req.method === 'connect.requestAccess') {
          socket.write(
            `${JSON.stringify({
              jsonrpc: '2.0',
              method: 'event.connect.changed',
              params: { kind: 'access_requested', connection_id: req.params?.connection_id },
            })}\n`,
          );
          socket.write(
            `${JSON.stringify({
              jsonrpc: '2.0',
              id: req.id,
              result: { request_id: 'req-live-1', status: 'requested' },
            })}\n`,
          );
          continue;
        }
        if (req.method === 'connect.approveRequest') {
          socket.write(
            `${JSON.stringify({
              jsonrpc: '2.0',
              id: req.id,
              error: {
                code: -32003,
                message: 'TRUSTED_HOST_REQUIRED: external cannot approve',
                data: { code: 'TRUSTED_HOST_REQUIRED' },
              },
            })}\n`,
          );
          continue;
        }
      }
    });
  });

  await new Promise<void>((resolve) => server.listen(sockPath, resolve));
  fs.writeFileSync(
    sessionPath,
    JSON.stringify({
      pid: process.pid,
      version: '2.0.0',
      api_version: '2.0',
      socket_path: sockPath,
      token: expectedToken,
    }),
    'utf8',
  );

  try {
    assert.equal(await probeOpldSocket(sockPath), true);
    const meta = readOpldSessionFile(sessionPath);
    assert.equal(meta?.token, expectedToken);

    const { transport, handshake } = await connectOpldRpcSession({
      sessionPath,
      clientKind: 'external',
      consumerPackageId: 'opl-relay',
    });
    assert.equal(handshake.session_id, 'sess_live_1');
    assert.equal(handshake.trusted_host, false);

    const bridge = createMcpAppOpldBridge(transport);
    const eventPromise = transport.waitForEvent('event.connect.changed', { timeoutMs: 2000 });
    const reqRes = await bridge.requestConnectAccess({
      consumerPackageId: 'opl-relay',
      connectionId: 'conn-mail',
      capabilityIds: ['mailbox.read'],
    });
    assert.equal(reqRes.request_id, 'req-live-1');

    const pushed = await eventPromise;
    assert.equal(pushed.params.kind, 'access_requested');

    await assert.rejects(
      () => bridge.approveConnectRequest({ requestId: 'req-live-1' }),
      (err: unknown) =>
        err instanceof OpldRpcError
        && err.isTrustedHostRequired
        && err.rpcCode === -32003,
    );

    const earlyWait = transport.waitForEvent('event.never.fires', { timeoutMs: 30_000 });
    transport.close();
    await assert.rejects(
      () => earlyWait,
      (err: unknown) => err instanceof OpldRpcError && err.errorCode === 'SOCKET_CLOSED',
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('createOplMcpAppViewController + createOpldMcpAppHostAdapter execute settings_form & confirm:false cleanly while failing closed on confirm:true/unknown, and open_opl_apps supports top-level focus args', async () => {
  const executed: Array<{ package_id?: string; action_id: string; payload: unknown }> = [];
  const mockTransport: OpldRpcTransport = {
    getSessionId: () => 'sess_int_1',
    call: async <T>(method: string, params: Record<string, unknown> = {}): Promise<T> => {
      if (method === 'app.state.get') {
        return {
          packages: [
            {
              package_id: 'opl-relay',
              name: 'OPL Relay',
              version: '0.3.0',
              intent: 'app',
              enabled: true,
              ui: {
                declarative: {
                  views: [
                    {
                      id: 'inbox',
                      view_type: 'list_detail',
                      slot: 'workbench.panel',
                      title: { 'en-US': 'Inbox' },
                      data_ref: 'relay.v1#inbox',
                      actions: [
                        {
                          id: 'refresh',
                          label: { 'en-US': 'Refresh' },
                          action_ref: 'relay.refresh',
                          confirm: false,
                        },
                        {
                          id: 'send',
                          label: { 'en-US': 'Send' },
                          action_ref: 'relay.send',
                          confirm: true,
                        },
                      ],
                    },
                  ],
                  settings_forms: [
                    {
                      id: 'relay-settings',
                      destination: 'services',
                      title: { 'en-US': 'Settings' },
                      data_ref: 'relay.v1#settings',
                      submit_action_ref: 'relay.settings.save',
                    },
                  ],
                },
              },
            },
          ],
        } as T;
      }
      if (method === 'app.contribution.read') {
        return {
          opl_app_contribution: {
            response: {
              result: {
                state: 'ready',
                data: { items: [{ id: 'item-1', title: 'Row 1' }] },
              },
            },
          },
        } as T;
      }
      if (method === 'app.contribution.execute') {
        executed.push({
          package_id: typeof params.package_id === 'string' ? params.package_id : undefined,
          action_id: String(params.action_id),
          payload: params.payload,
        });
        return {
          opl_app_contribution: {
            response: {
              ok: true,
              result: { state: 'completed', action_id: params.action_id },
            },
          },
        } as T;
      }
      return {} as T;
    },
  };

  const bridge = createMcpAppOpldBridge(mockTransport);
  const adapter = createOpldMcpAppHostAdapter(bridge);

  // 1. open_opl_apps supports top-level { package_id, view_id, input } fallback
  const openRes = await adapter.callServerTool({
    name: 'open_opl_apps',
    arguments: {
      package_id: 'opl-relay',
      view_id: 'relay-settings',
      input: { scope: 'user' },
    },
  });
  assert.equal(openRes.isError, false);
  const catalog = openRes.structuredContent?.opl_mcp_app_catalog as {
    focus?: { package_id?: string; view_id?: string; input?: Record<string, unknown> };
  };
  assert.deepEqual(catalog.focus, {
    package_id: 'opl-relay',
    view_id: 'relay-settings',
    input: { scope: 'user' },
  });

  // 2. Wire controller to adapter
  const makeEl = (): ElementLike => ({
    tagName: 'DIV',
    textContent: '',
    innerHTML: '',
    className: '',
    hidden: false,
    disabled: false,
    open: false,
    value: '',
    returnValue: '',
    dataset: {},
    hasAttribute: () => false,
    getAttribute: () => null,
    setAttribute: () => {},
    removeAttribute: () => {},
    toggleAttribute: () => false,
    querySelector: () => null,
    querySelectorAll: () => [],
    contains: () => false,
    append: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
  });
  const doc: DocumentLike = {
    documentElement: { lang: 'en-US', dataset: {} },
    body: makeEl(),
    getElementById: () => null,
    createElement: () => makeEl(),
  };

  const controller = createOplMcpAppViewController({
    host: adapter,
    doc,
    storage: createSafeStorage(null),
  });
  controller.handleToolResult(openRes);
  await new Promise((resolve) => setImmediate(resolve));

  const settingsView = controller.state.catalog!.views.find((v) => v.view_id === 'relay-settings')!;
  const inboxView = controller.state.catalog!.views.find((v) => v.view_id === 'inbox')!;
  const settingsCmd = settingsView.commands[0]!;
  const refreshCmd = inboxView.commands.find((c) => c.action_ref === 'relay.refresh')!;

  // settings_form submit succeeds through controller -> adapter with confirmed: false
  await controller.executeCommand(settingsCmd, { endpoint: 'https://mail.example.com' }, settingsView);
  assert.equal(executed.length, 1);
  assert.equal(executed[0]?.action_id, 'relay.settings.save');

  // confirm: false declarative action succeeds through controller -> adapter
  controller.state.selected = inboxView;
  controller.state.selectedKey = 'opl-relay:inbox';
  await controller.executeCommand(refreshCmd, { folder: 'INBOX' }, inboxView);
  assert.equal(executed.length, 2);
  assert.equal(executed[1]?.action_id, 'relay.refresh');

  // confirm: true and unknown actions still fail closed when confirmed: false
  const unconfirmedHighRisk = await adapter.callServerTool({
    name: 'opl_app_contribution_execute',
    arguments: { package_id: 'opl-relay', ref: 'relay.send', input: {}, confirmed: false },
  });
  assert.equal(unconfirmedHighRisk.isError, true);
  assert.equal(
    (unconfirmedHighRisk.structuredContent?.error as { code?: string })?.code,
    'CONFIRMATION_REQUIRED',
  );

  const unknownAction = await adapter.callServerTool({
    name: 'opl_app_contribution_execute',
    arguments: { package_id: 'opl-relay', ref: 'relay.unknown', input: {}, confirmed: false },
  });
  assert.equal(unknownAction.isError, true);
  assert.equal(
    (unknownAction.structuredContent?.error as { code?: string })?.code,
    'CONFIRMATION_REQUIRED',
  );

  // Strict adapter option forces confirmation even on confirm: false actions
  const strictAdapter = createOpldMcpAppHostAdapter(bridge, {
    requireConfirmationForAllActions: true,
  });
  const strictRejected = await strictAdapter.callServerTool({
    name: 'opl_app_contribution_execute',
    arguments: { package_id: 'opl-relay', ref: 'relay.refresh', input: {}, confirmed: false },
  });
  assert.equal(strictRejected.isError, true);
  assert.equal(
    (strictRejected.structuredContent?.error as { code?: string })?.code,
    'CONFIRMATION_REQUIRED',
  );

  const confirmedHighRisk = await adapter.callServerTool({
    name: 'opl_app_contribution_execute',
    arguments: { package_id: 'opl-relay', ref: 'relay.send', input: { to: 'a@b.c' }, confirmed: true },
  });
  assert.equal(confirmedHighRisk.isError, false);
  assert.equal(executed.length, 3);
  controller.destroy();
});

test('createOpldMcpAppHostAdapter refreshes confirmation policy from live app.state.get without stale cachedCatalog', async () => {
  let pkgEnabled = true;
  let dynamicConfirm = false;
  let toggleConfirm = true;
  let failGetAppState = false;
  let getAppStateCalls = 0;
  const executedActions: string[] = [];

  const mockTransport: OpldRpcTransport = {
    getSessionId: () => 'sess_live_policy',
    call: async <T>(method: string, params: Record<string, unknown> = {}): Promise<T> => {
      if (method === 'app.state.get') {
        getAppStateCalls += 1;
        if (failGetAppState) {
          throw new Error('daemon unavailable');
        }
        return {
          packages: [
            {
              package_id: 'opl-relay',
              name: 'OPL Relay',
              version: '0.4.0',
              intent: 'app',
              enabled: pkgEnabled,
              ui: {
                declarative: {
                  views: [
                    {
                      id: 'inbox',
                      view_type: 'list_detail',
                      slot: 'workbench.panel',
                      title: { 'en-US': 'Inbox' },
                      data_ref: 'relay.v1#inbox',
                      actions: [
                        {
                          id: 'dynamic',
                          label: { 'en-US': 'Dynamic' },
                          action_ref: 'relay.dynamic',
                          confirm: dynamicConfirm,
                        },
                        {
                          id: 'toggle',
                          label: { 'en-US': 'Toggle' },
                          action_ref: 'relay.toggle',
                          confirm: toggleConfirm,
                        },
                      ],
                    },
                  ],
                },
              },
            },
          ],
        } as T;
      }
      if (method === 'app.contribution.execute') {
        executedActions.push(String(params.action_id));
        return { ok: true, action_id: params.action_id } as T;
      }
      return {} as T;
    },
  };

  const bridge = createMcpAppOpldBridge(mockTransport);
  const adapter = createOpldMcpAppHostAdapter(bridge);

  // Populate catalog via open_opl_apps while dynamicConfirm=false, toggleConfirm=true
  const openRes = await adapter.callServerTool({
    name: 'open_opl_apps',
    arguments: { package_id: 'opl-relay' },
  });
  assert.equal(openRes.isError, false);
  assert.equal(getAppStateCalls, 1);

  const initialDynamic = await adapter.callServerTool({
    name: 'opl_app_contribution_execute',
    arguments: { package_id: 'opl-relay', ref: 'relay.dynamic', input: {}, confirmed: false },
  });
  assert.equal(initialDynamic.isError, false);
  assert.deepEqual(executedActions, ['relay.dynamic']);

  const initialToggle = await adapter.callServerTool({
    name: 'opl_app_contribution_execute',
    arguments: { package_id: 'opl-relay', ref: 'relay.toggle', input: {}, confirmed: false },
  });
  assert.equal(initialToggle.isError, true);
  assert.equal(
    (initialToggle.structuredContent?.error as { code?: string })?.code,
    'CONFIRMATION_REQUIRED',
  );

  // (a) confirm: false -> true fails closed on subsequent confirmed: false execution
  dynamicConfirm = true;
  const escalatedDynamic = await adapter.callServerTool({
    name: 'opl_app_contribution_execute',
    arguments: { package_id: 'opl-relay', ref: 'relay.dynamic', input: {}, confirmed: false },
  });
  assert.equal(escalatedDynamic.isError, true);
  assert.equal(
    (escalatedDynamic.structuredContent?.error as { code?: string })?.code,
    'CONFIRMATION_REQUIRED',
  );
  assert.deepEqual(executedActions, ['relay.dynamic']);

  // (b) enabled: true -> false fails closed even for actions with confirm: false
  dynamicConfirm = false;
  pkgEnabled = false;
  const disabledPkgExec = await adapter.callServerTool({
    name: 'opl_app_contribution_execute',
    arguments: { package_id: 'opl-relay', ref: 'relay.dynamic', input: {}, confirmed: false },
  });
  assert.equal(disabledPkgExec.isError, true);
  assert.equal(
    (disabledPkgExec.structuredContent?.error as { code?: string })?.code,
    'CONFIRMATION_REQUIRED',
  );
  assert.deepEqual(executedActions, ['relay.dynamic']);

  // (c) enabled: true and confirm: true -> false allows subsequent confirmed: false execution (no stale denial)
  pkgEnabled = true;
  toggleConfirm = false;
  const downgradedToggle = await adapter.callServerTool({
    name: 'opl_app_contribution_execute',
    arguments: { package_id: 'opl-relay', ref: 'relay.toggle', input: {}, confirmed: false },
  });
  assert.equal(downgradedToggle.isError, false);
  assert.deepEqual(executedActions, ['relay.dynamic', 'relay.toggle']);

  // Error querying live app state fails closed
  failGetAppState = true;
  const failedStateExec = await adapter.callServerTool({
    name: 'opl_app_contribution_execute',
    arguments: { package_id: 'opl-relay', ref: 'relay.toggle', input: {}, confirmed: false },
  });
  assert.equal(failedStateExec.isError, true);
  assert.equal(
    (failedStateExec.structuredContent?.error as { code?: string })?.code,
    'CONFIRMATION_REQUIRED',
  );
});
