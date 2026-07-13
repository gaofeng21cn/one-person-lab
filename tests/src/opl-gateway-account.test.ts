import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { FrameworkContractError } from '../../src/kernel/contract-validation.ts';
import { bindGatewayKeyToCodex, restoreCodexBinding } from '../../src/modules/connect/opl-gateway-account-parts/codex-binding.ts';
import { inspectGatewayPublicSettings, loginGateway } from '../../src/modules/connect/opl-gateway-account-parts/client.ts';
import { buildGatewayInstallation, normalizeGatewayDeviceSlug } from '../../src/modules/connect/opl-gateway-account-parts/identity.ts';
import { reconcileGatewayManagedKey } from '../../src/modules/connect/opl-gateway-account-parts/key-reconcile.ts';
import { readOrCreateGatewayInstallation } from '../../src/modules/connect/opl-gateway-account-parts/private-store.ts';
import {
  disconnectOplGatewayAccount,
  loginOplGatewayAccount,
  readOplGatewayAccount,
  refreshOplGatewayAccount,
  repairOplGatewayAccount,
} from '../../src/modules/connect/opl-gateway-account.ts';

function json(response: http.ServerResponse, value: unknown, status = 200) {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(value));
}

test('gateway identity uses a stable readable name without hardware identity', () => {
  const installation = buildGatewayInstallation('高峰 MacBook Pro', '11111111-2222-4333-8444-555555555555');
  assert.equal(normalizeGatewayDeviceSlug('高峰 MacBook Pro'), 'MacBook-Pro');
  assert.match(installation.canonical_key_name, /^OPL App · MacBook-Pro · [A-F0-9]{8}$/);
  assert.equal(installation.canonical_key_name.includes('11111111'), false);
});

test('gateway account login, refresh and disconnect keep secrets private and disable only the managed key', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-gateway-account-'));
  const stateDir = path.join(root, 'state');
  const codexHome = path.join(root, 'codex');
  let refreshCount = 0;
  let keyStatus = 'active';
  let createIdempotency = '';
  let refreshUnauthorized = false;
  let refreshFailureStatus: number | null = null;
  const requests: Array<{ method: string; url: string; body: Record<string, unknown> }> = [];
  const server = http.createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const bodyText = Buffer.concat(chunks).toString('utf8');
    const body = bodyText ? JSON.parse(bodyText) as Record<string, unknown> : {};
    requests.push({ method: request.method ?? 'GET', url: request.url ?? '', body });
    const route = request.url ?? '';
    if (route === '/api/v1/settings/public') return json(response, { code: 0, data: { server_timezone: 'Asia/Shanghai' } });
    if (route === '/api/v1/auth/login') {
      assert.deepEqual(body, { email: 'user@example.test', password: 'login-secret' });
      return json(response, { code: 0, data: { access_token: 'access-login', refresh_token: 'refresh-login' } });
    }
    if (route === '/api/v1/auth/refresh') {
      if (refreshUnauthorized) return json(response, { code: 401, message: 'expired' }, 401);
      if (refreshFailureStatus !== null) {
        return json(response, { code: refreshFailureStatus, message: 'temporary failure' }, refreshFailureStatus);
      }
      refreshCount += 1;
      return json(response, { code: 0, data: {
        access_token: `access-${refreshCount}`,
        refresh_token: `refresh-${refreshCount}`,
      } });
    }
    if (route === '/api/v1/user/profile') return json(response, { code: 0, data: {
      id: 42,
      username: 'OPL User',
      email: 'user@example.test',
      status: 'active',
      balance: 12.5,
      currency: 'USD',
    } });
    if (route === '/api/v1/usage/dashboard/stats') return json(response, { code: 0, data: {
      today_tokens: 100,
      total_tokens: 1000,
      today_actual_cost: 0.12,
      total_actual_cost: 1.2,
      currency: 'USD',
    } });
    if (route === '/api/v1/groups/available') return json(response, { code: 0, data: [{ id: 7, name: 'Default' }] });
    if (route.startsWith('/api/v1/keys?')) return json(response, { code: 0, data: { items: [] } });
    if (route === '/api/v1/keys' && request.method === 'POST') {
      createIdempotency = String(request.headers['idempotency-key'] ?? '');
      return json(response, { code: 0, data: {
        id: 99,
        name: body.name,
        key: 'managed-api-secret',
        status: keyStatus,
        group_id: 7,
        ip_whitelist: ['127.0.0.1'],
        ip_blacklist: [],
      } });
    }
    if (route === '/api/v1/keys/99' && request.method === 'GET') return json(response, { code: 0, data: {
      id: 99,
      name: requests.find((entry) => entry.url === '/api/v1/keys' && entry.method === 'POST')?.body.name,
      key: 'managed-api-secret',
      status: keyStatus,
      group_id: 7,
      ip_whitelist: ['127.0.0.1'],
      ip_blacklist: [],
    } });
    if (route === '/api/v1/keys/99' && request.method === 'PUT') {
      keyStatus = String(body.status);
      assert.deepEqual(body.ip_whitelist, ['127.0.0.1']);
      assert.equal('key' in body, false);
      return json(response, { code: 0, data: {
        id: 99, name: body.name, key: 'managed-api-secret', status: keyStatus, group_id: 7,
        ip_whitelist: body.ip_whitelist, ip_blacklist: body.ip_blacklist,
      } });
    }
    if (route === '/api/v1/auth/logout') return json(response, { code: 0, data: {} });
    return json(response, { code: 404, message: 'not found' }, 404);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert(address && typeof address === 'object');

  const previous = {
    state: process.env.OPL_STATE_DIR,
    codex: process.env.CODEX_HOME,
    home: process.env.HOME,
    control: process.env.OPL_GATEWAY_CONTROL_BASE_URL,
    nodeEnv: process.env.NODE_ENV,
  };
  process.env.OPL_STATE_DIR = stateDir;
  process.env.CODEX_HOME = codexHome;
  process.env.HOME = root;
  process.env.NODE_ENV = 'test';
  process.env.OPL_GATEWAY_CONTROL_BASE_URL = `http://127.0.0.1:${address.port}/api/v1`;
  try {
    const login = await loginOplGatewayAccount({
      email: 'user@example.test',
      password: 'login-secret',
      device_label: 'Test Device',
    });
    assert.equal(login.gateway_account.status, 'connected');
    assert.equal(login.gateway_account.account?.masked_email, 'u***@example.test');
    assert.equal(login.gateway_account.usage?.today_actual_cost, 0.12);
    assert.equal(login.gateway_account.managed_key?.ownership, 'opl_app_managed');
    assert.match(createIdempotency, /^opl-app-key-create:42:/);

    const publicJson = JSON.stringify(login);
    for (const secret of ['login-secret', 'refresh-login', 'managed-api-secret', 'access-login']) {
      assert.equal(publicJson.includes(secret), false);
    }
    const gatewayDir = path.join(stateDir, 'gateway');
    assert.equal(fs.statSync(gatewayDir).mode & 0o777, 0o700);
    for (const file of ['installation.json', 'account.json', 'credentials.json']) {
      assert.equal(fs.statSync(path.join(gatewayDir, file)).mode & 0o777, 0o600);
    }
    const accountDisk = fs.readFileSync(path.join(gatewayDir, 'account.json'), 'utf8');
    assert.equal(accountDisk.includes('managed-api-secret'), false);
    assert.equal(accountDisk.includes('refresh-login'), false);

    const refreshed = await Promise.all([refreshOplGatewayAccount(), refreshOplGatewayAccount()]);
    assert.equal(refreshed[0].gateway_account.status, 'connected');
    assert.equal(JSON.stringify(refreshed).includes('refresh-1'), false);
    assert.equal(refreshCount, 1);

    refreshFailureStatus = 503;
    await assert.rejects(
      refreshOplGatewayAccount(),
      (error: unknown) => error instanceof FrameworkContractError
        && error.details?.reason_code === 'gateway_unavailable',
    );
    const staleAfterFailure = readOplGatewayAccount();
    assert.equal(staleAfterFailure.status, 'connected');
    assert.equal(staleAfterFailure.freshness.stale, true);
    assert.equal(staleAfterFailure.freshness.last_error_code, 'gateway_unavailable');
    refreshFailureStatus = null;

    refreshUnauthorized = true;
    await assert.rejects(refreshOplGatewayAccount(), (error: unknown) =>
      error instanceof FrameworkContractError && error.details?.reason_code === 'reauth_required');
    assert.equal(readOplGatewayAccount().status, 'reauth_required');
    refreshUnauthorized = false;

    const disconnected = await disconnectOplGatewayAccount();
    assert.equal(disconnected.gateway_account.status, 'not_connected');
    assert.equal(keyStatus, 'inactive');
    assert.equal(fs.existsSync(path.join(gatewayDir, 'credentials.json')), false);
    assert.equal(readOplGatewayAccount().status, 'not_connected');
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      const envKey = key === 'state' ? 'OPL_STATE_DIR'
        : key === 'codex' ? 'CODEX_HOME'
          : key === 'home' ? 'HOME'
            : key === 'control' ? 'OPL_GATEWAY_CONTROL_BASE_URL'
              : 'NODE_ENV';
      if (value === undefined) delete process.env[envKey];
      else process.env[envKey] = value;
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(root, { recursive: true, force: true });
  }
});

async function withControlServer(
  responder: (request: http.IncomingMessage, response: http.ServerResponse) => void,
  run: (baseUrl: string) => Promise<void>,
) {
  const server = http.createServer(responder);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert(address && typeof address === 'object');
  const previousBase = process.env.OPL_GATEWAY_CONTROL_BASE_URL;
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';
  process.env.OPL_GATEWAY_CONTROL_BASE_URL = `http://127.0.0.1:${address.port}/api/v1`;
  try {
    await run(process.env.OPL_GATEWAY_CONTROL_BASE_URL);
  } finally {
    if (previousBase === undefined) delete process.env.OPL_GATEWAY_CONTROL_BASE_URL;
    else process.env.OPL_GATEWAY_CONTROL_BASE_URL = previousBase;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test('gateway client preserves typed failures for 2FA and non-success HTTP 200 envelopes', async () => {
  await withControlServer((request, response) => {
    if (request.url === '/api/v1/auth/login') {
      return json(response, { code: 0, data: { requires_2fa: true, temp_token: 'private-temp' } });
    }
    return json(response, { code: 403, message: 'blocked', data: null });
  }, async () => {
    await assert.rejects(loginGateway('user@example.test', 'secret'), (error: unknown) =>
      error instanceof FrameworkContractError && error.details?.reason_code === 'mfa_or_challenge_required');
    await assert.rejects(inspectGatewayPublicSettings(), (error: unknown) =>
      error instanceof FrameworkContractError && error.details?.reason_code === 'gateway_request_rejected');
  });
});

test('managed key reconcile fails closed for duplicate names and renamed known IDs', async () => {
  const installation = buildGatewayInstallation('Conflict Device', '11111111-2222-4333-8444-555555555555');
  let mutations = 0;
  let renamed = false;
  await withControlServer((request, response) => {
    if (request.method !== 'GET') mutations += 1;
    if (request.url === '/api/v1/keys/9') {
      return json(response, { code: 0, data: { id: 9, name: renamed ? 'Renamed' : installation.canonical_key_name,
        key: 'secret', status: 'active', ip_whitelist: [], ip_blacklist: [] } });
    }
    if (request.url?.startsWith('/api/v1/keys?')) {
      return json(response, { code: 0, data: { items: [1, 2].map((id) => ({
        id, name: installation.canonical_key_name, key: `secret-${id}`, status: 'active',
        ip_whitelist: [], ip_blacklist: [],
      })) } });
    }
    return json(response, { code: 404 }, 404);
  }, async () => {
    await assert.rejects(reconcileGatewayManagedKey({
      accessToken: 'access', accountUserId: '42', installation, accountState: null,
    }), (error: unknown) => error instanceof FrameworkContractError
      && error.details?.reason_code === 'managed_key_conflict');
    assert.equal(mutations, 0);
    renamed = true;
    await assert.rejects(reconcileGatewayManagedKey({
      accessToken: 'access', accountUserId: '42', installation,
      accountState: { key_id: '9' } as never,
    }), (error: unknown) => error instanceof FrameworkContractError
      && error.details?.reason_code === 'managed_key_identity_drift');
    assert.equal(mutations, 0);
  });
});

test('gateway private store rejects broad permissions and symlink roots', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-gateway-private-store-'));
  const previous = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = root;
  try {
    fs.mkdirSync(path.join(root, 'gateway'), { mode: 0o755 });
    assert.throws(() => readOrCreateGatewayInstallation(), (error: unknown) =>
      error instanceof FrameworkContractError && error.details?.reason_code === 'gateway_store_permissions_invalid');
    fs.rmSync(path.join(root, 'gateway'), { recursive: true });
    const target = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-gateway-target-'));
    fs.symlinkSync(target, path.join(root, 'gateway'));
    assert.throws(() => readOrCreateGatewayInstallation(), (error: unknown) =>
      error instanceof FrameworkContractError && error.details?.reason_code === 'gateway_store_symlink_forbidden');
    fs.rmSync(target, { recursive: true, force: true });
  } finally {
    if (previous === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previous;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Codex binding restores only owned provider fields and preserves manual token overrides', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-gateway-codex-binding-'));
  const previous = { codex: process.env.CODEX_HOME, home: process.env.HOME, state: process.env.OPL_STATE_DIR };
  process.env.CODEX_HOME = path.join(root, 'codex');
  process.env.HOME = root;
  process.env.OPL_STATE_DIR = path.join(root, 'state');
  try {
    const first = bindGatewayKeyToCodex('managed-one');
    assert(first.binding);
    const configPath = first.binding.config_path;
    let config = fs.readFileSync(configPath, 'utf8');
    config = config.replace(/model_reasoning_effort\s*=.*\n/, 'model_reasoning_effort = "high"\n');
    config = config.replace('\n[model_providers.', '\nunrelated_setting = "keep"\n\n[model_providers.');
    fs.writeFileSync(configPath, config, { mode: 0o600 });
    assert.equal(restoreCodexBinding(first.binding, null, false), 'removed_managed_fields');
    const restored = fs.readFileSync(configPath, 'utf8');
    assert.match(restored, /model_reasoning_effort = "high"/);
    assert.match(restored, /unrelated_setting = "keep"/);

    const second = bindGatewayKeyToCodex('managed-two');
    assert(second.binding);
    const overridden = fs.readFileSync(second.binding.config_path, 'utf8').replace('managed-two', 'manual-token');
    fs.writeFileSync(second.binding.config_path, overridden, { mode: 0o600 });
    assert.equal(restoreCodexBinding(second.binding, restored, true), 'manual_override_preserved');
    assert.match(fs.readFileSync(second.binding.config_path, 'utf8'), /manual-token/);
  } finally {
    for (const [envKey, value] of [['CODEX_HOME', previous.codex], ['HOME', previous.home], ['OPL_STATE_DIR', previous.state]] as const) {
      if (value === undefined) delete process.env[envKey];
      else process.env[envKey] = value;
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('post-key Codex binding failure disables the mutation and repair reuses the same key', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-gateway-rollback-'));
  let keyName = '';
  let keyStatus = 'active';
  let createCount = 0;
  const server = http.createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const bodyText = Buffer.concat(chunks).toString('utf8');
    const body = bodyText ? JSON.parse(bodyText) as Record<string, unknown> : {};
    const route = request.url ?? '';
    if (route === '/api/v1/settings/public') return json(response, { code: 0, data: { server_timezone: 'Asia/Shanghai' } });
    if (route === '/api/v1/auth/login') return json(response, { code: 0, data: { access_token: 'a0', refresh_token: 'r0' } });
    if (route === '/api/v1/auth/refresh') return json(response, { code: 0, data: { access_token: 'a1', refresh_token: 'r1' } });
    if (route === '/api/v1/user/profile') return json(response, { code: 0, data: { id: 42, email: 'u@example.test', status: 'active' } });
    if (route === '/api/v1/usage/dashboard/stats') return json(response, { code: 0, data: {} });
    if (route === '/api/v1/groups/available') return json(response, { code: 0, data: [{ id: 7, name: 'Default' }] });
    if (route.startsWith('/api/v1/keys?')) return json(response, { code: 0, data: { items: [] } });
    if (route === '/api/v1/keys' && request.method === 'POST') {
      createCount += 1;
      keyName = String(body.name);
      return json(response, { code: 0, data: { id: 99, name: keyName, key: 'managed-secret', status: keyStatus,
        group_id: 7, ip_whitelist: [], ip_blacklist: [] } });
    }
    if (route === '/api/v1/keys/99' && request.method === 'GET') return json(response, { code: 0, data: {
      id: 99, name: keyName, key: 'managed-secret', status: keyStatus, group_id: 7,
      ip_whitelist: [], ip_blacklist: [],
    } });
    if (route === '/api/v1/keys/99' && request.method === 'PUT') {
      keyStatus = String(body.status);
      return json(response, { code: 0, data: { id: 99, name: keyName, key: 'managed-secret', status: keyStatus,
        group_id: 7, ip_whitelist: [], ip_blacklist: [] } });
    }
    if (route === '/api/v1/auth/logout') return json(response, { code: 0, data: {} });
    return json(response, { code: 404 }, 404);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert(address && typeof address === 'object');
  const previous = {
    state: process.env.OPL_STATE_DIR, codex: process.env.CODEX_HOME, home: process.env.HOME,
    control: process.env.OPL_GATEWAY_CONTROL_BASE_URL, nodeEnv: process.env.NODE_ENV,
  };
  process.env.OPL_STATE_DIR = path.join(root, 'state');
  process.env.CODEX_HOME = path.join(root, 'codex');
  process.env.HOME = root;
  process.env.NODE_ENV = 'test';
  process.env.OPL_GATEWAY_CONTROL_BASE_URL = `http://127.0.0.1:${address.port}/api/v1`;
  fs.mkdirSync(process.env.CODEX_HOME, { recursive: true });
  fs.writeFileSync(path.join(process.env.CODEX_HOME, 'config.toml'), 'model = "unterminated\n', { mode: 0o600 });
  fs.chmodSync(process.env.CODEX_HOME, 0o500);
  try {
    await assert.rejects(loginOplGatewayAccount({ email: 'u@example.test', password: 'secret' }), (error: unknown) =>
      error instanceof FrameworkContractError && error.details?.reason_code === 'gateway_codex_binding_failed');
    assert.equal(createCount, 1);
    assert.equal(keyStatus, 'inactive');
    assert.equal(readOplGatewayAccount().status, 'attention_needed');

    fs.chmodSync(process.env.CODEX_HOME, 0o700);
    fs.rmSync(path.join(process.env.CODEX_HOME, 'config.toml'));
    const repaired = await repairOplGatewayAccount();
    assert.equal(repaired.gateway_account.status, 'connected');
    assert.equal(createCount, 1);
    assert.equal(keyStatus, 'active');
  } finally {
    for (const [envKey, value] of [
      ['OPL_STATE_DIR', previous.state], ['CODEX_HOME', previous.codex], ['HOME', previous.home],
      ['OPL_GATEWAY_CONTROL_BASE_URL', previous.control], ['NODE_ENV', previous.nodeEnv],
    ] as const) {
      if (value === undefined) delete process.env[envKey];
      else process.env[envKey] = value;
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(root, { recursive: true, force: true });
  }
});
