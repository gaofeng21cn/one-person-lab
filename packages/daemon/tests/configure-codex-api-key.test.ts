import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { connectTestRpc, createDaemonSandbox, TestRpcClient, WORKTREE_ROOT } from './helpers/sandbox.ts';

test('saving a manual Gateway key configures the selected Codex home through trusted IPC', async (t) => {
  const sandbox = createDaemonSandbox();
  t.after(() => sandbox.cleanup());
  await sandbox.startInProcess();
  const untrusted = await connectTestRpc(sandbox.sessionPath, 'sdk_python');
  const host = await connectTestRpc(sandbox.sessionPath, 'opl_app');
  t.after(async () => { await Promise.all([host.close(), untrusted.close()]); });

  const method = 'connect.configureCodexApiKey';
  const configPath = path.join(sandbox.codexHome, 'config.toml');
  const apiKey = 'isolated-gateway-test-key';
  async function readApiKeyPresence() {
    const snapshot = await host.call('app.state.get', { profile: 'fast' }) as {
      app_state: { settings_control_center: { app_settings_read_model: { codex_model_policy: { api_key_present: boolean } } } };
    };
    assert.ok(!JSON.stringify(snapshot).includes(apiKey));
    return snapshot.app_state.settings_control_center.app_settings_read_model.codex_model_policy.api_key_present;
  }
  assert.equal(await readApiKeyPresence(), false);
  await assert.rejects(() => untrusted.call(method, { api_key: apiKey }), /TRUSTED_HOST_REQUIRED/);
  await assert.rejects(() => host.call(method, { api_key: apiKey, config_path: 'elsewhere' }), /INVALID_INPUT/);
  assert.equal(fs.existsSync(configPath), false);

  // Read the credential from the same config.toml Codex uses after its reload.
  const receipt = await host.call(method, { api_key: apiKey });
  assert.deepEqual(receipt, { ok: true });
  assert.equal(await readApiKeyPresence(), true);
  const config = fs.readFileSync(configPath, 'utf8');
  assert.match(config, /model_provider\s*=\s*"oplgateway"/);
  assert.ok(config.includes(apiKey));
  if (process.platform !== 'win32') assert.equal(fs.statSync(configPath).mode & 0o077, 0);
  assert.deepEqual((await host.call('connect.list', {}) as { connections: unknown[] }).connections, []);

  fs.unlinkSync(configPath);
  fs.mkdirSync(configPath);
  await assert.rejects(() => host.call(method, { api_key: apiKey }), (error: Error) => {
    assert.match(error.message, /codex_configuration_failed/);
    assert.ok(!error.message.includes(apiKey));
    return true;
  });
});

test('two Studio profiles sharing an opld read and write their own Codex configuration', async (t) => {
  const sandbox = createDaemonSandbox();
  t.after(() => sandbox.cleanup());
  await sandbox.startInProcess();
  const first = await connectTestRpc(sandbox.sessionPath);
  const second = new TestRpcClient(sandbox.sessionPath);
  await second.connect();
  t.after(async () => { await Promise.all([first.close(), second.close()]); });
  const otherHome = path.join(sandbox.root, 'other-codex');
  await assert.rejects(() => second.handshake('sdk_python', '2.0', otherHome), /TRUSTED_HOST_REQUIRED/);
  await assert.rejects(() => second.handshake('opl_app', '2.0', 'relative'), /INVALID_INPUT/);
  const handshake = await second.handshake('opl_app', '2.0', otherHome);
  assert.equal(handshake.codex_home, otherHome);
  assert.equal(first.handshakeResult?.codex_home, sandbox.codexHome);

  await second.call('connect.configureCodexApiKey', { api_key: 'second-profile-key' });
  assert.ok(fs.readFileSync(path.join(otherHome, 'config.toml'), 'utf8').includes('second-profile-key'));
  assert.equal(fs.existsSync(path.join(sandbox.codexHome, 'config.toml')), false);
  async function read(client: TestRpcClient) {
    const state = await client.call('app.state.get', { profile: 'fast' }) as {
      app_state: { settings_control_center: { app_settings_read_model: { codex_model_policy: { api_key_present: boolean } } } };
    };
    return state.app_state.settings_control_center.app_settings_read_model.codex_model_policy.api_key_present;
  }
  assert.deepEqual(await Promise.all([read(first), read(second)]), [false, true]);
});

test('opl connect configure-codex reads bounded UTF-8 from stdin via the daemon', async t => {
  const sandbox = createDaemonSandbox();
  t.after(() => sandbox.cleanup());
  await sandbox.startInProcess();
  const key = 'local-test-key-stdin';
  const command = ['connect', 'configure-codex', '--api-key-stdin', '--json'];
  const invoke = (stdin: string | Buffer, args = command) => new Promise<{ code: number | null; output: string }>((resolve, reject) => {
    const child = spawn(path.join(WORKTREE_ROOT, 'bin', 'opl'), args, { env: sandbox.env, cwd: sandbox.workspaceDir });
    let output = '';
    child.stdout.on('data', chunk => { output += String(chunk); });
    child.stderr.on('data', chunk => { output += String(chunk); });
    child.stdin.on('error', () => {});
    child.once('error', reject);
    child.once('close', code => resolve({ code, output }));
    child.stdin.end(stdin);
  });
  for (const input of ['', Buffer.from([0xc3, 0x28]), 'a'.repeat(8193)]) {
    const failure = await invoke(input);
    assert.equal(failure.code, 2, failure.output);
    assert.match(failure.output, /INVALID_INPUT/);
  }
  const rejected = await invoke('', [...command, '--api-key=' + key]);
  assert.equal(rejected.code, 2);
  assert.ok(!rejected.output.includes(key));
  const config = path.join(sandbox.codexHome, 'config.toml');
  assert.equal(fs.existsSync(config), false);
  const success = await invoke(key + '\n');
  assert.equal(success.code, 0, success.output);
  assert.deepEqual(JSON.parse(success.output), { ok: true });
  assert.ok(fs.readFileSync(config, 'utf8').includes(key));
});
