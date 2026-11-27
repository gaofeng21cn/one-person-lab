import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import type { readSystemInitialize } from '../src/state/initialize.ts';
import { connectTestRpc, createDaemonSandbox, E2E_CODEX_STUB } from './helpers/sandbox.ts';

test('Studio startup checks track actual local readiness independently of installed Packages', async (t) => {
  const sb = createDaemonSandbox({
    OPL_CODEX_API_KEY: '', OPENAI_API_KEY: '', CODEX_API_KEY: '', OPL_WORKSPACE_ROOT: '',
  });
  t.after(() => sb.cleanup());
  await sb.spawnDaemonProcess();
  const app = await connectTestRpc(sb.sessionPath, 'opl_app', '2.0');
  const sdk = await connectTestRpc(sb.sessionPath, 'sdk_python', '2.0');
  t.after(async () => { await app.close(); await sdk.close(); });
  const read = async () => (await app.call('app.initialize.get', {}) as { system_initialize: ReturnType<typeof readSystemInitialize> }).system_initialize;
  const fast = async (client: typeof app, includeSetup = false) => (
    await client.call('app.state.get', { profile: 'fast', include_setup: includeSetup }) as {
      app_state: { system_initialize?: ReturnType<typeof readSystemInitialize> };
    }
  ).app_state.system_initialize;

  assert.equal(await fast(app), undefined);
  assert.equal(await fast(sdk, true), undefined);
  assert.deepEqual((await fast(app, true))?.setup_flow.blocking_items, ['codex_config']);
  const initial = await read();
  assert.deepEqual(initial.setup_flow.blocking_items, ['codex_config']);
  assert.equal(initial.setup_flow.is_first_run, true);
  assert.equal(initial.setup_flow.progress.ready_required_count, 2);
  assert.equal(initial.setup_flow.ready_to_launch, false);
  assert.equal(initial.checklist.find(item => item.item_id === 'codex_config')?.user_action_required, true);

  await app.call('connect.configureCodexApiKey', { api_key: 'first-run-test-key' });
  const ready = await read();
  assert.deepEqual(ready.setup_flow.blocking_items, []);
  assert.equal(ready.setup_flow.ready_to_launch, true);
  assert.equal(ready.setup_flow.progress.ready_required_count, 3);
  assert.equal((await fast(app, true))?.setup_flow.ready_to_launch, true);

  fs.rmSync(path.join(sb.codexHome, 'auth.json'), { force: true });
  fs.rmSync(path.join(sb.codexHome, 'config.toml'), { force: true });
  assert.deepEqual((await read()).setup_flow.blocking_items, ['codex_config']);
  const publicResponse = await sdk.call('app.initialize.get', {}) as { system_initialize?: unknown };
  assert.equal(publicResponse.system_initialize, undefined);
});

test('a present but broken Codex stays unavailable until the selected executable works', async (t) => {
  const sb = createDaemonSandbox();
  t.after(() => sb.cleanup());
  const binary = path.join(sb.root, 'codex');
  fs.symlinkSync(process.execPath, binary); // Executes successfully, but reports a Node version.
  await sb.spawnDaemonProcess({ OPL_CODEX_BIN: binary });
  const app = await connectTestRpc(sb.sessionPath, 'opl_app', '2.0');
  t.after(() => app.close());

  const assistantReady = async () => {
    const data = await app.call('app.initialize.get', {}) as { system_initialize: ReturnType<typeof readSystemInitialize> };
    return !data.system_initialize.setup_flow.blocking_items.includes('codex');
  };
  const activePath = async (method: string) => {
    const data = await app.call(method, {}) as { runtime_activation: { codex: { runtime_binary_path: string | null } } };
    return data.runtime_activation.codex.runtime_binary_path;
  };
  const fastReady = async () => {
    const result = await app.call('app.state.get', { profile: 'fast', include_setup: true }) as {
      app_state: { system_initialize: ReturnType<typeof readSystemInitialize> };
    };
    return !result.app_state.system_initialize.setup_flow.blocking_items.includes('codex');
  };
  assert.equal(await assistantReady(), false);
  assert.equal(await fastReady(), false);
  assert.equal(await activePath('app.codexRuntime.get'), null);
  assert.equal(await activePath('app.codexRuntime.activate'), null);
  fs.unlinkSync(binary);
  fs.symlinkSync(E2E_CODEX_STUB, binary);
  assert.equal(await fastReady(), true);
  assert.equal(await assistantReady(), true);
  assert.equal(await activePath('app.codexRuntime.get'), binary);
});
