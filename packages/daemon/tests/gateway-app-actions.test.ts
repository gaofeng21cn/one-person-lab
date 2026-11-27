import assert from 'node:assert/strict';
import { test } from 'node:test';
import { connectTestRpc, createDaemonSandbox } from './helpers/sandbox.ts';

test('Gateway App actions preserve explicit confirmation, request scope and owner results over the daemon socket', async t => {
  const sandbox = createDaemonSandbox();
  t.after(() => sandbox.cleanup());
  await sandbox.startInProcess();
  const app = await connectTestRpc(sandbox.sessionPath, 'opl_app', '2.0');
  const external = await connectTestRpc(sandbox.sessionPath, 'external', '2.0');
  t.after(() => Promise.all([app.close(), external.close()]));

  const disconnect = { action_id: 'gateway_account_disconnect', dry_run: false };
  await assert.rejects(external.call('app.action.execute', { ...disconnect, payload: { confirmed: true } }), /TRUSTED_HOST_REQUIRED/);
  await assert.rejects(app.call('app.action.execute', disconnect), /CONFIRMATION_REQUIRED/);
  await assert.rejects(app.call('app.action.execute', { ...disconnect, mode: 'preview', payload: { confirmed: true } }), /do not support preview/);
  await assert.rejects(app.call('app.action.execute', {
    ...disconnect, payload: { confirmed: true, group_id: '1' },
  }), /Unexpected Gateway/);
  await assert.rejects(app.call('app.action.execute', {
    ...disconnect, action_id: 'gateway_account_use_for_model_access',
  }), /CONFIRMATION_REQUIRED/);
  await assert.rejects(app.call('app.action.execute', {
    ...disconnect, action_id: 'gateway_account_complete_setup', payload: {},
  }), /group_id/);
  await assert.rejects(app.call('app.action.execute', {
    ...disconnect, action_id: 'gateway_account_refresh', payload: { confirmed: true },
  }), /not connected/);
  const result = await app.call('app.action.execute', { ...disconnect, payload: { confirmed: true } }) as {
    status: string;
    app_action_execution: { result: { gateway_account: { status: string } } };
  };
  assert.equal(result.status, 'executed');
  assert.equal(result.app_action_execution.result.gateway_account.status, 'not_connected');
});
