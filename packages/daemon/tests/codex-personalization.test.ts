import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { connectTestRpc, createDaemonSandbox, writeMinimalV2Package } from './helpers/sandbox.ts';

test('only trusted clients can read or restore the selected Flow instructions', async (t) => {
  const sandbox = createDaemonSandbox();
  t.after(() => sandbox.cleanup());
  await sandbox.spawnDaemonProcess();
  const host = await connectTestRpc(sandbox.sessionPath, 'opl_app');
  const plugin = await connectTestRpc(sandbox.sessionPath, 'sdk_python');
  t.after(async () => { await host.close(); await plugin.close(); });

  const target = path.join(sandbox.codexHome, 'AGENTS.md');
  const previous = 'Synthetic private instructions.\n';
  fs.writeFileSync(target, previous);
  const digest = (content: string) => crypto.createHash('sha256').update(content).digest('hex');
  const app = async () => (await host.call('app.state.get', {}) as any).app_state.codex_personalization;
  assert.equal((await app()).user_agents.content, previous);
  assert.equal((await app()).opl_flow_default_user_agents.status, 'unavailable');
  for (const method of ['app.state.get', 'app.initialize.get']) {
    const state = JSON.stringify(await plugin.call(method, {}));
    assert.ok(!state.includes(previous.trim()));
    assert.ok(!state.includes('codex_personalization'));
  }

  const root = writeMinimalV2Package(path.join(sandbox.root, 'flow'), { id: 'opl-flow', intent: 'extension' });
  const profiles = path.join(root, 'profile');
  fs.mkdirSync(profiles);
  fs.writeFileSync(path.join(profiles, 'manifest.json'), JSON.stringify({
    schema: 'opl_flow_profile_manifest.v2', runtime_profile: { path: 'profile/reviewed.md' },
  }));
  const template = 'Synthetic selected Flow template.\n';
  const source = path.join(profiles, 'reviewed.md');
  fs.writeFileSync(source, template);
  await host.call('pack.link', { dir: root, sync_codex: false });
  assert.equal((await app()).opl_flow_default_user_agents.content, template);
  const restore = { action_id: 'codex_user_instructions_restore_opl_flow_default', payload: { expected_sha256: digest(previous) } };
  await assert.rejects(plugin.call('app.action.execute', restore), /trusted host/i);
  await host.call('app.action.execute', { ...restore, dry_run: true });
  assert.equal(fs.readFileSync(target, 'utf8'), previous);
  const result = await host.call('app.action.execute', restore) as any;
  assert.equal(result.app_action_execution.result.codex_user_instructions_restore.write.readback.sha256, digest(template));
  assert.equal((await app()).user_agents.content, template);
  await assert.rejects(host.call('app.action.execute', restore), /REVISION_CONFLICT/);
  fs.rmSync(source);
  fs.symlinkSync(target, source);
  assert.equal((await app()).opl_flow_default_user_agents.status, 'invalid');
  await assert.rejects(host.call('app.action.execute', restore), /no available default/);
});
