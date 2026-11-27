import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { connectTestRpc, createDaemonSandbox, writeMinimalV2Package } from './helpers/sandbox.ts';
import type { projectConnectionAuthorization } from '../src/state/connection-authorization.ts';

test('App reads a multi-capability request and can approve, deny and revoke through its actual routes', async (t) => {
  const sandbox = createDaemonSandbox();
  t.after(() => sandbox.cleanup());
  await sandbox.startInProcess();
  const app = await connectTestRpc(sandbox.sessionPath, 'opl_app', '2.0');
  const consumer = await connectTestRpc(sandbox.sessionPath, 'sdk_python', '2.0');
  t.after(() => Promise.all([app.close(), consumer.close()]));
  const dir = writeMinimalV2Package(path.join(sandbox.root, 'consumer'), {
    id: 'test-consumer',
    extraManifest: {
      permissions: { connections: [{ provider_type: 'test.mail', capabilities: ['read', 'draft'], reason: { 'en-US': 'Prepare drafts', 'zh-CN': '准备草稿' } }] },
    },
  });
  await app.call('pack.link', { dir });
  await app.call('connect.add', {
    connection_id: 'research-mail', provider_type: 'test.mail', display_name: 'Research mail',
    capabilities: [
      { capability_id: 'read', title: 'Read messages', risk: 'read' },
      { capability_id: 'draft', title: 'Prepare draft', risk: 'local_write' },
    ],
    credential_handle: 'provider:test-mail:synthetic',
  });
  const consumerIdentity = await app.call('connect.issueConsumerBindToken', {
    consumer_package_id: 'test-consumer', session_id: consumer.handshakeResult!.session_id,
  }) as { token: string };
  const requestAccess = async (extra: Record<string, unknown> = {}) => await consumer.call('connect.requestAccess', {
    ...extra,
    connection_id: 'research-mail', consumer_bind_token: consumerIdentity.token, capability_ids: ['read', 'draft'],
  }) as { request_id: string };
  const read = async (profile: string) => {
    const result = await app.call('app.state.get', { profile }) as {
      app_state: { settings_control_center: { app_settings_read_model: { connections: {
        authorization: ReturnType<typeof projectConnectionAuthorization>;
      } } }; actions: { action_id: string }[] };
    };
    return { auth: result.app_state.settings_control_center.app_settings_read_model.connections.authorization, actions: result.app_state.actions };
  };
  const action = (action_id: string, payload: Record<string, unknown>, dry_run = false) =>
    app.call('app.action.execute', { action_id, payload, dry_run });
  const first = await requestAccess();
  const { auth: pending, actions } = await read('fast');
  assert.equal(pending.surface_kind, 'opl_connection_authorization_projection.v1');
  assert.equal(pending.requests.length, 1);
  assert.equal(pending.requests[0]!.request_id, first.request_id);
  assert.equal(pending.requests[0]!.connection?.display_name, 'Research mail');
  assert.deepEqual(pending.requests[0]!.capabilities.map(c => c.label).sort(), ['Prepare draft', 'Read messages']);
  assert.ok(actions.some(a => a.action_id === 'connection_grant_revoke'));
  assert.ok(actions.some(a => a.action_id === 'connection_access_request_deny'));
  await app.call('connect.approveRequest', { request_id: first.request_id });
  const { auth: approved } = await read('full');
  assert.equal(approved.requests.length, 0);
  assert.equal(approved.grants.filter(g => g.status === 'granted' && g.request_id === first.request_id).length, 2);
  const grantId = approved.grants[0]!.grant_id;
  await assert.rejects(action('connection_grant_revoke', { grant_id: grantId }), /CONFIRMATION_REQUIRED/);
  await action('connection_grant_revoke', { grant_id: grantId, confirmed: true });
  assert.equal((await read('fast')).auth.grants.find(g => g.grant_id === grantId)?.status, 'revoked');
  const second = await requestAccess();
  await action('connection_access_request_deny', { request_id: second.request_id, confirmed: true });
  const denied = (await read('fast')).auth;
  assert.equal(denied.requests.length, 0);
  assert.equal(denied.grants.filter(g => g.request_id === second.request_id && g.status === 'denied').length, 2);
  await assert.rejects(action('connection_access_request_deny', { request_id: second.request_id }), /REQUEST_NOT_PENDING/);
  const third = await requestAccess({ expires_at: '2001-01-01T00:00:00Z' });
  const changed = (await read('fast')).auth;
  assert.ok(!changed.requests.some(request => request.request_id === third.request_id));
  assert.ok(changed.grants.some(grant => grant.request_id === third.request_id && grant.status === 'superseded'));
});

test('trusted App Settings reads workspace sources and delegates resource and connection lifecycle actions', async t => {
  const sandbox = createDaemonSandbox();
  t.after(() => sandbox.cleanup());
  const { runtime } = await sandbox.startInProcess();
  const rpc = await connectTestRpc(sandbox.sessionPath);
  t.after(() => rpc.close());
  const action = async (action_id: string, payload: Record<string, unknown>) => {
    const receipt = await rpc.call('app.action.execute', { action_id, payload }) as any;
    return receipt.app_action_execution.result;
  };
  const state = () => rpc.call('app.state.get', { profile: 'fast' }) as Promise<any>;
  const first = await state();
  const app = first.app_state;
  assert.deepEqual(app.meta, { generated_at: first.generated_at, profile: 'fast' });
  assert.ok(app.core.codex.runtime_root);
  assert.ok(['executable', 'unavailable'].includes(app.core.codex.executable_status));
  assert.equal(app.managed_update.components.find((row: any) => row.component_id === 'opl_base').auto_apply.eligible, false);
  assert.ok(app.transport_bindings);
  assert.ok(app.services.runway.schedule_runner.tick_interval_ms);
  const settings = app.settings_control_center.app_settings_read_model;
  assert.ok(settings.local_environment.state_dir);
  assert.equal(settings.storage_lifecycle.package_cache.path, runtime.packService.cacheRoot);
  assert.equal(settings.resource_sources.surface_kind, 'opl_knowledge_sources_projection.v1');
  assert.ok(app.settings_control_center.status_summary.model_access);
  assert.ok('provider_name' in settings.codex_model_policy);
  assert.ok('provider_base_url' in settings.codex_model_policy);

  const workspace = runtime.workspaceService.initWorkspace({ root_path: sandbox.workspaceDir, name: 'Resources' });
  const sourceId = 'fixture-knowledge';
  const source = { source_id: sourceId };
  const connected = await action('knowledge_source_connect', {
    ...source, workspace_id: workspace.workspace_id, root_path: sandbox.workspaceDir, scope: 'project_local',
  });
  assert.equal(connected.source.status, 'active');
  assert.equal((await action('knowledge_source_check', source)).source.source_id, sourceId);
  assert.equal((await action('knowledge_source_configure', { ...source, accepted_revision: '2' })).source.accepted_revision, '2');
  assert.equal((await action('knowledge_source_list', { workspace_id: workspace.workspace_id })).resource_sources.entries[0].source_id, sourceId);
  const next = (await state()).app_state;
  assert.equal(next.settings_control_center.app_settings_read_model.resource_sources.entries[0].accepted_revision, '2');
  assert.ok(next.application_management.shared_resources.some((row: any) => row.source_id === sourceId));
  await assert.rejects(action('knowledge_source_disconnect', source), /CONFIRMATION_REQUIRED/);
  await action('knowledge_source_disconnect', { ...source, confirmed: true });
  assert.equal((await action('knowledge_source_check', source)).source.status, 'revoked');

  const registered = await rpc.call('connect.add', { provider_type: 'test.fixture', display_name: 'Settings Fixture', capabilities: [], credential_handle: 'provider:test-fixture:synthetic' }) as any;
  const connectionId = registered.connection?.connection_id ?? registered.connection_id;
  assert.ok(connectionId);
  const connection = { connection_id: connectionId };
  assert.deepEqual(await action('connection_test', connection), await rpc.call('connect.check', connection));
  await action('connection_update', { ...connection, status: 'disabled' });
  const list = await rpc.call('connect.list', {}) as any;
  assert.equal(list.connections.find((row: any) => row.connection_id === connectionId).status, 'disabled');
  await assert.rejects(action('connection_delete', connection), /CONFIRMATION_REQUIRED/);
  await action('connection_delete', { ...connection, confirmed: true });
  assert.ok(!(await rpc.call('connect.list', {}) as any).connections.some((row: any) => row.connection_id === connectionId));
});
