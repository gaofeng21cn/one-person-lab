import assert from 'node:assert/strict';
import test from 'node:test';
import { connectTestRpc, createDaemonSandbox, E2E_CODEX_STUB } from './helpers/sandbox.ts';

test('Studio can discover and preview local Codex installation through the trusted App socket', async (t) => {
  const sandbox = createDaemonSandbox();
  t.after(() => sandbox.cleanup());
  await sandbox.spawnDaemonProcess();
  const app = await connectTestRpc(sandbox.sessionPath, 'opl_app', '2.0');
  t.after(() => app.close());
  const state = await app.call('app.state.get', { profile: 'fast' }) as {
    app_state: { actions: Array<{ action_id: string; confirmation_required: boolean }> };
  };
  const action = state.app_state.actions.find(({ action_id }) => action_id === 'codex_install');
  assert.equal(action?.confirmation_required, true);
  const request = { action_id: 'codex_install', payload: {} };
  const preview = await app.call('app.action.execute', { ...request, dry_run: true }) as { status: string };
  assert.equal(preview.status, 'preview');
  await assert.rejects(() => app.call('app.action.execute', request), /CONFIRMATION_REQUIRED/);
  await assert.rejects(() => app.call('app.action.execute', {
    action_id: 'codex_install', payload: { confirmed: true, full_runtime_root: 'relative/path' },
  }), /INVALID_INPUT/);

  const current = await app.call('app.codexRuntime.get') as {
    runtime_activation: { codex: { runtime_binary_path: string } };
  };
  assert.equal(current.runtime_activation.codex.runtime_binary_path, E2E_CODEX_STUB);
  const sdk = await connectTestRpc(sandbox.sessionPath, 'sdk_python', '2.0');
  t.after(() => sdk.close());
  await assert.rejects(() => sdk.call('app.action.execute', { ...request, dry_run: true }), /TRUSTED_HOST_REQUIRED/);
  await assert.rejects(() => sdk.call('app.codexRuntime.activate'), /TRUSTED_HOST_REQUIRED/);
});
