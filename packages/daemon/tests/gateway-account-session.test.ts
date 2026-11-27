import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { connectTestRpc, createDaemonSandbox, ROOT_OPL_BIN, type DaemonSandbox } from './helpers/sandbox.ts';

const device = {
  deviceId: '29bf60b4-c312-4567-890a-2c91656f458d',
  role: 'host',
  name: 'Integration test computer',
  platform: 'darwin',
  identityKey: Buffer.alloc(32, 7).toString('base64url'),
  clientVersion: '2.0.0',
};
const email = 'example@example.test';
const password = 'fixture-password-only';
const accessToken = 'fixture-account-access-only';
const refreshToken = 'fixture-account-refresh-only';
const linkAccess = 'fixture-link-access-only';
const linkRefresh = 'fixture-link-refresh-only';
const managedKey = 'fixture-managed-key-only';

function checkPublic(value: string) {
  for (const secret of [password, accessToken, refreshToken, linkAccess, linkRefresh, managedKey]) {
    assert.equal(value.includes(secret), false, 'Private session material appeared in a public response');
  }
}

async function cli(sb: DaemonSandbox, args: string[], input?: object) {
  const child = spawn(process.execPath, [ROOT_OPL_BIN, 'connect', 'gateway', ...args, '--json'], {
    cwd: sb.workspaceDir, env: sb.env, stdio: ['pipe', 'pipe', 'pipe'],
  });
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  child.stdout.on('data', chunk => stdout.push(chunk));
  child.stderr.on('data', chunk => stderr.push(chunk));
  const exited = new Promise<number | null>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });
  child.stdin.end(input && JSON.stringify(input));
  const code = await exited;
  const output = Buffer.concat(stdout).toString('utf8');
  checkPublic(output + Buffer.concat(stderr).toString('utf8'));
  return { code, value: JSON.parse(output) };
}

test('Gateway login and phone authorization share the account across the real socket and CLI', async t => {
  const sb = createDaemonSandbox();
  t.after(() => sb.cleanup());
  const origin = 'https://gateway.medopl.com/api/v1';
  const relay = 'https://link.medopl.com';
  const key = { id: 99, name: '', key: managedKey, status: 'active', group_id: 3 };
  let currentRefresh = refreshToken;
  let rotations = 0;
  let registrations = 0;
  let logouts = 0;
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    const body = init.body ? JSON.parse(String(init.body)) : {};
    const auth = new Headers(init.headers).get('authorization');
    const ok = (data: unknown) => Response.json({ code: 0, data });
    if (url === origin + '/settings/public') return ok({});
    if (url === origin + '/auth/login') {
      if (body.email !== email || body.password !== password) return new Response(null, { status: 401 });
      return ok({ access_token: accessToken, refresh_token: currentRefresh });
    }
    if (url === origin + '/auth/refresh') {
      if (body.refresh_token !== currentRefresh) return new Response(null, { status: 401 });
      currentRefresh = refreshToken + '-' + (++rotations);
      return ok({ access_token: accessToken, refresh_token: currentRefresh });
    }
    if (auth !== 'Bearer ' + accessToken) return new Response(null, { status: 403 });
    if (url === relay + '/api/v1/devices/register') {
      assert.equal(init.redirect, 'error');
      assert.deepEqual(body, { v: 1, device });
      registrations++;
      return Response.json({
        serverUrl: relay, accountScope: Buffer.alloc(32, 3).toString('base64url'),
        accessToken: linkAccess, refreshToken: linkRefresh,
        accessTokenExpiresAt: Date.now() + 3_600_000, refreshTokenExpiresAt: Date.now() + 86_400_000,
      });
    }
    if (url === origin + '/user/profile') return ok({ id: 42, username: 'Test account', email, status: 'active' });
    if (url === origin + '/groups/available') return ok([{ id: 3, name: 'Codex' }]);
    if (url === origin + '/usage/dashboard/stats') return ok({ today_tokens: 14 });
    if (url.startsWith(origin + '/keys?')) return ok({ items: [] });
    if (url === origin + '/keys' && init.method === 'POST') {
      key.name = body.name;
      return ok(key);
    }
    if (url === origin + '/keys/99') {
      if (init.method === 'PUT') key.status = body.status;
      return ok(key);
    }
    if (url === origin + '/auth/logout') {
      assert.equal(body.refresh_token, currentRefresh);
      logouts++;
      return ok({});
    }
    return new Response(null, { status: 404 });
  });
  const gatewayDir = path.join(sb.stateDir, 'gateway');
  const first = await sb.startInProcess();
  const app = await connectTestRpc(sb.sessionPath, 'opl_app', '2.0');
  t.after(() => app.close());
  await assert.rejects(app.call('connect.add', {
    provider_type: 'opl_gateway', account_label: email, display_name: email, secret: 'incorrect',
  }), (error: Error & { data?: { reason_code?: string } }) => error.data?.reason_code === 'invalid_credentials');
  const registry = await app.call('connect.list', { provider_type: 'opl_gateway' }) as { connections: unknown[] };
  assert.equal(registry.connections.length, 0);
  const rejected = await cli(sb, ['login', '--credentials-stdin'], { email, password: 'incorrect' });
  assert.notEqual(rejected.code, 0);
  assert.equal(rejected.value.error.reason_code, 'invalid_credentials');
  assert.equal(fs.existsSync(path.join(gatewayDir, 'credentials.json')), false);
  assert.equal((await cli(sb, ['status'])).value.gateway_account.status, 'not_connected');

  const login = await app.call('connect.gateway.login', { email, password });
  checkPublic(JSON.stringify(login));
  assert.equal((await cli(sb, ['status'])).value.gateway_account.account.email, email);
  assert.equal(fs.existsSync(path.join(sb.codexHome, 'config.toml')), false);
  assert.equal(JSON.parse(fs.readFileSync(path.join(gatewayDir, 'account.json'), 'utf8')).surface_kind,
    'opl_gateway_account_state.v1');
  await app.close();
  await first.shutdown();
  await sb.startInProcess();
  assert.equal((await cli(sb, ['status'])).value.gateway_account.status, 'connected');

  const destination = path.join(sb.root, 'link-credential.json');
  const args = ['authorize-companion', '--request-stdin', '--credential-file', destination];
  const request = { service: 'opl_link', device };
  const granted = await cli(sb, args, request);
  assert.equal(granted.code, 0, JSON.stringify(granted.value));
  assert.equal(granted.value.companion_authorization.credential_written, true);
  const stored = JSON.parse(fs.readFileSync(destination, 'utf8'));
  assert.equal(stored.deviceId, device.deviceId);
  assert.equal(stored.identityKey, device.identityKey);
  assert.equal(stored.accessToken, linkAccess);
  if (process.platform !== 'win32') assert.equal(fs.statSync(destination).mode & 0o777, 0o600);
  assert.notEqual((await cli(sb, args, request)).code, 0);
  assert.equal(registrations, 1);
  assert.equal(rotations, 1);
  const settings = await connectTestRpc(sb.sessionPath, 'opl_app', '2.0');
  t.after(() => settings.close());
  const disconnected = await settings.call('app.action.execute', {
    action_id: 'gateway_account_disconnect', payload: { confirmed: true }, dry_run: false,
  }) as { status: string };
  checkPublic(JSON.stringify(disconnected));
  assert.equal(disconnected.status, 'executed');
  assert.equal((await cli(sb, ['status'])).value.gateway_account.status, 'not_connected');
  await settings.close();
  assert.equal(key.status, 'inactive');
  assert.equal(logouts, 1);
  assert.equal(fs.existsSync(path.join(gatewayDir, 'credentials.json')), false);
});

test('reads an existing v1 account on cold start without a new login', async t => {
  const sb = createDaemonSandbox();
  t.after(() => sb.cleanup());
  const accountDir = path.join(sb.stateDir, 'gateway');
  fs.mkdirSync(accountDir, { mode: 0o700 });
  const filename = path.join(accountDir, 'account.json');
  const data = JSON.stringify({
    surface_kind: 'opl_gateway_account_state.v1', status: 'connected', account_user_id: '42',
    canonical_key_name: 'Test installation', key_id: null, key_status: null, key_group_id: null,
    available_groups: [], observed_at: null, stale_after: null, last_error_code: null,
    codex_binding: null, transaction_stage: null,
    snapshot: { display_name: 'Prior session', email, account_status: 'active' },
  });
  fs.writeFileSync(filename, data, { mode: 0o600 });
  fs.writeFileSync(path.join(accountDir, 'credentials.json'), JSON.stringify({
    surface_kind: 'opl_gateway_credentials.v1', refresh_token: refreshToken,
    previous_codex_config: null, previous_codex_config_existed: false,
  }), { mode: 0o600 });
  await sb.startInProcess();
  const readback = await cli(sb, ['status']);
  assert.equal(readback.code, 0, JSON.stringify(readback.value));
  assert.equal(readback.value.gateway_account.connection_mode, 'account');
  assert.equal(readback.value.gateway_account.account.email, email);
  assert.equal(fs.readFileSync(filename, 'utf8'), data);
});
