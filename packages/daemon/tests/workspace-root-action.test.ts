import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import type { AppStateSnapshot } from '../src/state/app-state-cache.ts';
import { createDaemonSandbox, connectTestRpc } from './helpers/sandbox.ts';

test('daemon imports both legacy preferences once and persists workspace root changes across restart', async t => {
  const sb = createDaemonSandbox();
  t.after(() => sb.cleanup());
  const pref = path.join(sb.stateDir, 'workspace-root.json');
  const sources = path.join(sb.stateDir, 'software-sources.json');
  const workspaceBytes = JSON.stringify({ version: 'g1', selected_path: sb.homeDir, updated_at: '2026-01-01' });
  const sourceBytes = JSON.stringify({ surface_kind: 'opl_software_sources_store.v1', sources: [{
    source_id: 'github-packages:fixture', provider_id: 'github_packages',
    enabled: true, credential_handle: 'env:OPL_GITHUB_PACKAGES_TOKEN', status: 'authorized',
  }] });
  fs.writeFileSync(pref, workspaceBytes);
  fs.writeFileSync(sources, sourceBytes);
  const daemon = await sb.startInProcess();
  const host = await connectTestRpc(sb.sessionPath, 'opl_app', '2.0');
  const sdk = await connectTestRpc(sb.sessionPath, 'sdk_python', '2.0');
  t.after(async () => { await host.close(); await sdk.close(); });
  const read = async () => (await host.call('app.state.get', {}) as AppStateSnapshot).app_state;
  const selected = (state: AppStateSnapshot['app_state']) =>
    state.settings_control_center?.app_settings_read_model.workspace_services?.workspace_root;
  const action = { action_id: 'workspace_root_set', payload: { path: sb.workspaceDir, confirmed: true } };
  const originalEnv = process.env.OPL_WORKSPACE_ROOT;
  delete process.env.OPL_WORKSPACE_ROOT;
  try {
    type Sources = { software_sources: { entries: { source_id: string; credential_handle_present: boolean }[] } };
    const source = async (client: typeof host) => (await client.call('pack.sources.list', {}) as Sources)
      .software_sources.entries.find(row => row.source_id === 'github-packages:fixture');
    assert.equal((await source(host))?.credential_handle_present, true);
    assert.equal(selected(await read())?.source, 'state');
    assert.equal(selected(await read())?.selected_path, sb.homeDir);
    assert.ok((await read()).actions?.some(item => item.action_id === 'workspace_root_set'));
    await host.call('app.action.execute', { ...action, dry_run: true });
    assert.equal(JSON.parse(fs.readFileSync(pref, 'utf8')).selected_path, sb.homeDir);
    await assert.rejects(sdk.call('app.action.execute', action));
    await host.call('app.action.execute', action);
    assert.equal(selected(await read())?.selected_path, sb.workspaceDir);
    assert.equal((await read()).paths?.workspace_root_path, sb.workspaceDir);
    assert.equal(fs.readFileSync(pref, 'utf8'), workspaceBytes);

    process.env.OPL_WORKSPACE_ROOT = sb.homeDir;
    assert.equal(selected(await read())?.source, 'env');
    assert.equal((await read()).actions?.some(item => item.action_id === 'workspace_root_set'), false);
    await assert.rejects(host.call('app.action.execute', action), /deployment manages/);
    assert.equal(fs.readFileSync(pref, 'utf8'), workspaceBytes);

    delete process.env.OPL_WORKSPACE_ROOT;
    await host.call('pack.sources.disconnect', { source_id: 'github-packages:fixture' });
    assert.equal(fs.readFileSync(sources, 'utf8'), sourceBytes);
    await host.close();
    await sdk.close();
    await daemon.shutdown();
    await sb.startInProcess();
    const reopened = await connectTestRpc(sb.sessionPath, 'opl_app', '2.0');
    t.after(() => reopened.close());
    const readback = (await reopened.call('app.state.get', {}) as AppStateSnapshot).app_state;
    assert.equal(selected(readback)?.selected_path, sb.workspaceDir);
    assert.equal((await source(reopened))?.credential_handle_present, false);
  } finally {
    if (originalEnv === undefined) delete process.env.OPL_WORKSPACE_ROOT;
    else process.env.OPL_WORKSPACE_ROOT = originalEnv;
  }
});
