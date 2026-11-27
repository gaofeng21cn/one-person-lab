import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import type { AppStateSnapshot } from '../src/state/app-state-cache.ts';
import { createDaemonSandbox, connectTestRpc } from './helpers/sandbox.ts';

test('desktop reads an upgraded working directory, previews changes and persists the owner readback', async t => {
  const sb = createDaemonSandbox();
  t.after(() => sb.cleanup());
  await sb.startInProcess();
  const host = await connectTestRpc(sb.sessionPath, 'opl_app', '2.0');
  const sdk = await connectTestRpc(sb.sessionPath, 'sdk_python', '2.0');
  t.after(async () => { await host.close(); await sdk.close(); });
  const read = async () => (await host.call('app.state.get', {}) as AppStateSnapshot).app_state;
  const selected = (state: AppStateSnapshot['app_state']) =>
    state.settings_control_center?.app_settings_read_model.workspace_services?.workspace_root;
  const pref = path.join(sb.stateDir, 'workspace-root.json');
  const action = { action_id: 'workspace_root_set', payload: { path: sb.workspaceDir, confirmed: true } };
  const originalEnv = process.env.OPL_WORKSPACE_ROOT;
  delete process.env.OPL_WORKSPACE_ROOT;
  try {
    assert.equal(selected(await read())?.source, 'default_home');
    fs.writeFileSync(pref, JSON.stringify({ version: 'g1', selected_path: sb.homeDir, updated_at: '2026-01-01' }));
    assert.equal(selected(await read())?.source, 'state');
    assert.equal(selected(await read())?.selected_path, sb.homeDir);
    assert.ok((await read()).actions?.some(item => item.action_id === 'workspace_root_set'));
    await host.call('app.action.execute', { ...action, dry_run: true });
    assert.equal(JSON.parse(fs.readFileSync(pref, 'utf8')).selected_path, sb.homeDir);
    await assert.rejects(sdk.call('app.action.execute', action));
    await host.call('app.action.execute', action);
    assert.equal(selected(await read())?.selected_path, sb.workspaceDir);
    assert.equal((await read()).paths?.workspace_root_path, sb.workspaceDir);
    assert.equal(JSON.parse(fs.readFileSync(pref, 'utf8')).selected_path, sb.workspaceDir);

    process.env.OPL_WORKSPACE_ROOT = sb.homeDir;
    assert.equal(selected(await read())?.source, 'env');
    assert.equal((await read()).actions?.some(item => item.action_id === 'workspace_root_set'), false);
    await assert.rejects(host.call('app.action.execute', action), /deployment manages/);
    assert.equal(JSON.parse(fs.readFileSync(pref, 'utf8')).selected_path, sb.workspaceDir);

    delete process.env.OPL_WORKSPACE_ROOT;
    fs.writeFileSync(pref, '{');
    assert.equal(selected(await read())?.health_status, 'attention_needed');
    await host.call('app.action.execute', action);
    assert.equal(selected(await read())?.health_status, 'ready');
  } finally {
    if (originalEnv === undefined) delete process.env.OPL_WORKSPACE_ROOT;
    else process.env.OPL_WORKSPACE_ROOT = originalEnv;
  }
});
