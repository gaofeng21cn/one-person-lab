import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { FrameworkContractError } from '../../src/kernel/contract-validation.ts';
import { readLocalCodexAccessState } from '../../src/kernel/local-codex-defaults.ts';
import { bindGatewayKeyToCodex, restoreCodexBinding } from '../../src/adapters/integration/opl-gateway-account-parts/codex-binding.ts';
import { inspectGatewayPublicSettings, loginGateway } from '../../src/adapters/integration/opl-gateway-account-parts/client.ts';
import { buildGatewayInstallation, normalizeGatewayDeviceSlug } from '../../src/adapters/integration/opl-gateway-account-parts/identity.ts';
import { reconcileGatewayManagedKey } from '../../src/adapters/integration/opl-gateway-account-parts/key-reconcile.ts';
import {
  readOrCreateGatewayInstallation,
  withGatewayAccountLock,
} from '../../src/adapters/integration/opl-gateway-account-parts/private-store.ts';
import { resolveOplStatePaths } from '../../src/kernel/runtime-state-paths.ts';
import {
  OPL_GATEWAY_CONTROL_BASE_URL,
  OPL_GATEWAY_INFERENCE_BASE_URL,
} from '../../src/adapters/integration/opl-gateway-account-parts/types.ts';
import {
  disconnectOplGatewayAccount,
  loginOplGatewayAccount,
  readOplGatewayAccount,
  refreshOplGatewayAccount,
  selectOplGatewayManagedGroup,
  useOplGatewayForModelAccess,
} from '../../src/adapters/integration/opl-gateway-account.ts';

function json(response: http.ServerResponse, value: unknown, status = 200) {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(value));
}

test('gateway login, account inspection and Codex inference use the medopl endpoints', () => {
  assert.equal(OPL_GATEWAY_CONTROL_BASE_URL, 'https://gateway.medopl.com/api/v1');
  assert.equal(OPL_GATEWAY_INFERENCE_BASE_URL, 'https://gateway.medopl.com/v1');
});

test('gateway identity uses a stable readable name without hardware identity', () => {
  const installation = buildGatewayInstallation('高峰 MacBook Pro', '11111111-2222-4333-8444-555555555555');
  assert.equal(normalizeGatewayDeviceSlug('高峰 MacBook Pro'), 'MacBook-Pro');
  assert.match(installation.canonical_key_name, /^OPL App · MacBook-Pro · [A-F0-9]{8}$/);
  assert.equal(installation.canonical_key_name.includes('11111111'), false);
});

test('gateway account selects the unique Codex group without asking the user', () => {
  assert.equal(
    selectOplGatewayManagedGroup([
      { group_id: '1', label: 'AGI' },
      { group_id: '3', label: 'cOdEx（专用）' },
      { group_id: '4', label: 'Gemini' },
    ]),
    '3',
  );
  assert.equal(
    selectOplGatewayManagedGroup([
      { group_id: '3', label: 'Codex A' },
      { group_id: '5', label: 'Codex B' },
    ]),
    null,
  );
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
    if (route === '/api/v1/groups/available') return json(response, { code: 0, data: [
      { id: 1, name: 'AGI' },
      { id: 3, name: 'Codex（专用）' },
      { id: 4, name: 'Gemini' },
    ] });
    if (route.startsWith('/api/v1/keys?')) return json(response, { code: 0, data: { items: [] } });
    if (route === '/api/v1/keys' && request.method === 'POST') {
      createIdempotency = String(request.headers['idempotency-key'] ?? '');
      assert.equal(typeof body.group_id, 'number');
      assert.equal(body.group_id, 3);
      return json(response, { code: 0, data: {
        id: 99,
        name: body.name,
        key: 'managed-api-secret',
        status: keyStatus,
        group_id: 3,
        ip_whitelist: ['127.0.0.1'],
        ip_blacklist: [],
      } });
    }
    if (route === '/api/v1/keys/99' && request.method === 'GET') return json(response, { code: 0, data: {
      id: 99,
      name: requests.find((entry) => entry.url === '/api/v1/keys' && entry.method === 'POST')?.body.name,
      key: 'managed-api-secret',
      status: keyStatus,
      group_id: 3,
      ip_whitelist: ['127.0.0.1'],
      ip_blacklist: [],
    } });
    if (route === '/api/v1/keys/99' && request.method === 'PUT') {
      keyStatus = String(body.status);
      assert.deepEqual(body.ip_whitelist, ['127.0.0.1']);
      assert.equal('key' in body, false);
      assert.equal(typeof body.group_id, 'number');
      assert.equal(body.group_id, 3);
      return json(response, { code: 0, data: {
        id: 99, name: body.name, key: 'managed-api-secret', status: keyStatus, group_id: 3,
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
    assert.equal(login.gateway_account.account?.email, 'user@example.test');
    assert.equal(login.gateway_account.usage?.today_actual_cost, 0.12);
    assert.equal(login.gateway_account.managed_key?.ownership, 'opl_app_managed');
    assert.equal(requests.find((entry) => entry.url === '/api/v1/keys' && entry.method === 'POST')?.body.group_id, 3);
    assert.match(createIdempotency, /^opl-app-key-create:42:/);
    assert.equal(
      fs.existsSync(path.join(codexHome, 'config.toml')),
      false,
      'account login must not bind model access before the explicit use action',
    );

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

    const firstUse = await useOplGatewayForModelAccess();
    assert.equal(firstUse.gateway_account.status, 'connected');
    assert.equal(readLocalCodexAccessState().model_access_source, 'opl_gateway');
    const configPath = path.join(codexHome, 'config.toml');
    const receiptPath = path.join(stateDir, 'codex-config-management-receipt.json');
    const firstConfig = fs.readFileSync(configPath, 'utf8');
    const firstReceipt = fs.readFileSync(receiptPath, 'utf8');
    const secondUse = await useOplGatewayForModelAccess();
    assert.equal(secondUse.gateway_account.status, 'connected');
    assert.equal(fs.readFileSync(configPath, 'utf8'), firstConfig);
    assert.equal(fs.readFileSync(receiptPath, 'utf8'), firstReceipt);

    fs.writeFileSync(configPath, firstConfig.replace('managed-api-secret', 'other-gateway-key'), { mode: 0o600 });
    assert.equal(readLocalCodexAccessState().model_access_source, 'opl_gateway');
    const repairedUse = await useOplGatewayForModelAccess();
    assert.equal(repairedUse.gateway_account.status, 'connected');
    assert.match(fs.readFileSync(configPath, 'utf8'), /managed-api-secret/);
    assert.doesNotMatch(fs.readFileSync(configPath, 'utf8'), /other-gateway-key/);

    const refreshCountBeforeConcurrentRead = refreshCount;
    const refreshed = await Promise.all([refreshOplGatewayAccount(), refreshOplGatewayAccount()]);
    assert.equal(refreshed[0].gateway_account.status, 'connected');
    assert.equal(JSON.stringify(refreshed).includes('refresh-1'), false);
    assert.equal(refreshCount, refreshCountBeforeConcurrentRead + 1);

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
    assert.equal(fs.existsSync(configPath), false);
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

test('gateway client recovers after two consecutive transient control-plane failures', async () => {
  let settingsRequests = 0;
  let loginRequests = 0;
  await withControlServer((request, response) => {
    if (request.url === '/api/v1/settings/public') {
      settingsRequests += 1;
      if (settingsRequests < 3) return json(response, { code: 503 }, 503);
      return json(response, { code: 0, data: { server_timezone: 'Asia/Shanghai' } });
    }
    if (request.url === '/api/v1/auth/login') {
      loginRequests += 1;
      if (loginRequests < 3) return json(response, { code: 503 }, 503);
      return json(response, { code: 0, data: { access_token: 'access', refresh_token: 'refresh' } });
    }
    return json(response, { code: 404 }, 404);
  }, async () => {
    const settings = await inspectGatewayPublicSettings();
    assert.equal(settings.server_timezone, 'Asia/Shanghai');
    assert.equal(settingsRequests, 3);

    const session = await loginGateway('user@example.test', 'secret');
    assert.deepEqual(session, { access_token: 'access', refresh_token: 'refresh' });
    assert.equal(loginRequests, 3);
  });
});

test('gateway client bounds chunked oversized responses without retrying the current request', async () => {
  const previousLimit = process.env.OPL_CONNECT_MAX_RESPONSE_BODY_BYTES;
  let oversized = true;
  let settingsRequests = 0;
  process.env.OPL_CONNECT_MAX_RESPONSE_BODY_BYTES = '64';
  try {
    await withControlServer((request, response) => {
      if (request.url !== '/api/v1/settings/public') return json(response, { code: 404 }, 404);
      settingsRequests += 1;
      if (oversized) {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end('x'.repeat(128));
        return;
      }
      return json(response, { code: 0, data: { server_timezone: 'Asia/Shanghai' } });
    }, async () => {
      await assert.rejects(inspectGatewayPublicSettings(), (error: unknown) =>
        error instanceof FrameworkContractError && error.details?.reason_code === 'gateway_response_too_large');
      assert.equal(settingsRequests, 1);

      oversized = false;
      const recovered = await inspectGatewayPublicSettings();
      assert.equal(recovered.server_timezone, 'Asia/Shanghai');
      assert.equal(settingsRequests, 2);
    });
  } finally {
    if (previousLimit === undefined) delete process.env.OPL_CONNECT_MAX_RESPONSE_BODY_BYTES;
    else process.env.OPL_CONNECT_MAX_RESPONSE_BODY_BYTES = previousLimit;
  }
});

test('gateway client preserves the default 1 MiB response limit', async () => {
  const previousLimit = process.env.OPL_CONNECT_MAX_RESPONSE_BODY_BYTES;
  delete process.env.OPL_CONNECT_MAX_RESPONSE_BODY_BYTES;
  const prefix = '{"code":0,"data":{"server_timezone":"Asia/Shanghai","padding":"';
  const suffix = '"}}';
  const atLimit = `${prefix}${'x'.repeat(1024 * 1024 - prefix.length - suffix.length)}${suffix}`;
  let responseBody = atLimit;
  let settingsRequests = 0;
  try {
    await withControlServer((request, response) => {
      if (request.url !== '/api/v1/settings/public') return json(response, { code: 404 }, 404);
      settingsRequests += 1;
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(responseBody);
    }, async () => {
      const legal = await inspectGatewayPublicSettings();
      assert.equal(legal.server_timezone, 'Asia/Shanghai');

      responseBody = `${atLimit} `;
      await assert.rejects(inspectGatewayPublicSettings(), (error: unknown) =>
        error instanceof FrameworkContractError && error.details?.reason_code === 'gateway_response_too_large');
      assert.equal(settingsRequests, 2);
    });
  } finally {
    if (previousLimit === undefined) delete process.env.OPL_CONNECT_MAX_RESPONSE_BODY_BYTES;
    else process.env.OPL_CONNECT_MAX_RESPONSE_BODY_BYTES = previousLimit;
  }
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

test('explicit Gateway binding activates an incomplete existing provider and restores it on disconnect', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-gateway-explicit-binding-'));
  const previous = { codex: process.env.CODEX_HOME, home: process.env.HOME, state: process.env.OPL_STATE_DIR };
  process.env.CODEX_HOME = path.join(root, 'codex');
  process.env.HOME = root;
  process.env.OPL_STATE_DIR = path.join(root, 'state');
  try {
    fs.mkdirSync(process.env.CODEX_HOME, { recursive: true });
    const configPath = path.join(process.env.CODEX_HOME, 'config.toml');
    const previousConfig = [
      'model_provider = "custom"',
      'model = "custom-model"',
      'model_reasoning_effort = "medium"',
      '',
      '[model_providers.custom]',
      'name = "Existing custom provider"',
      'base_url = "https://custom.example.test/v1"',
      'experimental_bearer_token = "custom-secret"',
      '',
    ].join('\n');
    fs.writeFileSync(configPath, previousConfig, { mode: 0o600 });

    const binding = bindGatewayKeyToCodex('managed-explicit');
    assert(binding.binding);
    const activated = fs.readFileSync(configPath, 'utf8');
    assert.equal(readLocalCodexAccessState().model_access_source, 'opl_gateway');
    assert.equal(readLocalCodexAccessState().provider_base_url, 'https://gateway.medopl.com/v1');
    assert.match(activated, new RegExp(`^model_provider = "${binding.binding.provider_id}"$`, 'm'));
    assert.match(activated, /experimental_bearer_token = "managed-explicit"/);

    assert.equal(restoreCodexBinding(binding.binding, binding.previous_config, true), 'restored_owned_fields');
    assert.equal(fs.readFileSync(configPath, 'utf8'), previousConfig);
  } finally {
    for (const [envKey, value] of [
      ['CODEX_HOME', previous.codex],
      ['HOME', previous.home],
      ['OPL_STATE_DIR', previous.state],
    ] as const) {
      if (value === undefined) delete process.env[envKey];
      else process.env[envKey] = value;
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('explicit Gateway binding reuses an active legacy provider and restores its exact identity', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-gateway-legacy-binding-'));
  const previous = { codex: process.env.CODEX_HOME, home: process.env.HOME, state: process.env.OPL_STATE_DIR };
  process.env.CODEX_HOME = path.join(root, 'codex');
  process.env.HOME = root;
  process.env.OPL_STATE_DIR = path.join(root, 'state');
  try {
    fs.mkdirSync(process.env.CODEX_HOME, { recursive: true });
    const configPath = path.join(process.env.CODEX_HOME, 'config.toml');
    const previousConfig = [
      'model_provider = "gflabtoken"',
      'model = "legacy-model"',
      'model_reasoning_effort = "high"',
      '',
      '[model_providers."gflabtoken"]',
      'name = "gflabtoken"',
      'base_url = "https://gflabtoken.cn/v1"',
      'experimental_bearer_token = "legacy-secret"',
      '',
    ].join('\n');
    fs.writeFileSync(configPath, previousConfig, { mode: 0o600 });

    const binding = bindGatewayKeyToCodex('managed-legacy');
    assert(binding.binding);
    assert.equal(binding.binding.provider_id, 'gflabtoken');
    const activated = fs.readFileSync(configPath, 'utf8');
    assert.match(activated, /^model_provider = "gflabtoken"$/m);
    assert.match(activated, /base_url = "https:\/\/gflabtoken\.cn\/v1"/);
    assert.match(activated, /^name = "gflabtoken"$/m);
    assert.match(activated, /\[model_providers\."gflabtoken"\]/);
    assert.doesNotMatch(activated, /\[model_providers\.gflabtoken\]/);
    assert.doesNotMatch(activated, /\[model_providers\.oplgateway\]/);
    assert.equal(readLocalCodexAccessState().model_access_source, 'opl_gateway');

    assert.equal(restoreCodexBinding(binding.binding, binding.previous_config, true), 'restored_owned_fields');
    assert.equal(fs.readFileSync(configPath, 'utf8'), previousConfig);
  } finally {
    for (const [envKey, value] of [
      ['CODEX_HOME', previous.codex],
      ['HOME', previous.home],
      ['OPL_STATE_DIR', previous.state],
    ] as const) {
      if (value === undefined) delete process.env[envKey];
      else process.env[envKey] = value;
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('explicit Gateway binding overrides ChatGPT and environment access without consuming ambient routes', () => {
  for (const source of ['chatgpt', 'environment'] as const) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), `opl-gateway-${source}-`));
    const previous = {
      codex: process.env.CODEX_HOME,
      home: process.env.HOME,
      state: process.env.OPL_STATE_DIR,
      openaiKey: process.env.OPENAI_API_KEY,
      openaiBaseUrl: process.env.OPENAI_BASE_URL,
    };
    process.env.CODEX_HOME = path.join(root, 'codex');
    process.env.HOME = root;
    process.env.OPL_STATE_DIR = path.join(root, 'state');
    process.env.OPENAI_BASE_URL = 'https://ambient.invalid/v1';
    delete process.env.OPENAI_API_KEY;
    try {
      fs.mkdirSync(process.env.CODEX_HOME, { recursive: true });
      if (source === 'chatgpt') {
        fs.writeFileSync(
          path.join(process.env.CODEX_HOME, 'auth.json'),
          `${JSON.stringify({ auth_mode: 'chatgpt', tokens: { access_token: 'private' } })}\n`,
          { mode: 0o600 },
        );
      } else {
        process.env.OPENAI_API_KEY = 'ambient-key';
      }

      assert.equal(readLocalCodexAccessState().model_access_source, source === 'chatgpt' ? 'codex_login' : 'env_api_key');
      const binding = bindGatewayKeyToCodex(`managed-${source}`);
      assert(binding.binding);
      const access = readLocalCodexAccessState();
      assert.equal(access.model_access_source, 'opl_gateway');
      assert.equal(access.provider_base_url, 'https://gateway.medopl.com/v1');
      assert.doesNotMatch(fs.readFileSync(binding.binding.config_path, 'utf8'), /ambient\.invalid/);
    } finally {
      for (const [envKey, value] of [
        ['CODEX_HOME', previous.codex],
        ['HOME', previous.home],
        ['OPL_STATE_DIR', previous.state],
        ['OPENAI_API_KEY', previous.openaiKey],
        ['OPENAI_BASE_URL', previous.openaiBaseUrl],
      ] as const) {
        if (value === undefined) delete process.env[envKey];
        else process.env[envKey] = value;
      }
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test('failed Gateway post-write readback restores config and management receipt bytes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-gateway-readback-rollback-'));
  const previous = { codex: process.env.CODEX_HOME, home: process.env.HOME, state: process.env.OPL_STATE_DIR };
  process.env.CODEX_HOME = path.join(root, 'codex');
  process.env.HOME = root;
  process.env.OPL_STATE_DIR = path.join(root, 'state');
  try {
    fs.mkdirSync(process.env.CODEX_HOME, { recursive: true });
    fs.mkdirSync(process.env.OPL_STATE_DIR, { recursive: true });
    const configPath = path.join(process.env.CODEX_HOME, 'config.toml');
    const receiptPath = path.join(process.env.OPL_STATE_DIR, 'codex-config-management-receipt.json');
    const configBefore = [
      'model_provider = "custom"',
      'model = "custom-model"',
      '',
      '[model_providers.custom]',
      'name = "Custom"',
      'base_url = "https://custom.example.test/v1"',
      'experimental_bearer_token = "custom-secret"',
      '',
    ].join('\n');
    const receiptBefore = `${JSON.stringify({
      surface_kind: 'opl_codex_config_management_receipt.v1',
      config_path: configPath,
      provider_id: 'custom',
      selection_mode: 'inactive_provider',
      provider_route: 'inactive_provider',
      owned_keys: [],
      last_applied_values: {
        model_provider: 'custom',
        model: 'custom-model',
        model_reasoning_effort: null,
        provider_base_url: 'https://custom.example.test/v1',
      },
      backup_path: null,
      updated_at: '2026-07-26T00:00:00.000Z',
    }, null, 2)}\n`;
    fs.writeFileSync(configPath, configBefore, { mode: 0o600 });
    fs.writeFileSync(receiptPath, receiptBefore, { mode: 0o600 });

    assert.throws(
      () => bindGatewayKeyToCodex('managed-failure', {
        readback: () => ({
          ...readLocalCodexAccessState(),
          model_access_ready: false,
          model_access_source: 'missing',
        }),
      }),
      /gateway_codex_binding_failed/,
    );
    assert.equal(fs.readFileSync(configPath, 'utf8'), configBefore);
    assert.equal(fs.readFileSync(receiptPath, 'utf8'), receiptBefore);
  } finally {
    for (const [envKey, value] of [
      ['CODEX_HOME', previous.codex],
      ['HOME', previous.home],
      ['OPL_STATE_DIR', previous.state],
    ] as const) {
      if (value === undefined) delete process.env[envKey];
      else process.env[envKey] = value;
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('explicit Codex binding failure keeps the managed key reusable for a corrected retry', async () => {
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
    const login = await loginOplGatewayAccount({ email: 'u@example.test', password: 'secret' });
    assert.equal(login.gateway_account.status, 'connected');
    await assert.rejects(useOplGatewayForModelAccess(), (error: unknown) =>
      error instanceof FrameworkContractError && error.details?.reason_code === 'gateway_codex_binding_failed');
    assert.equal(createCount, 1);
    assert.equal(keyStatus, 'active');
    assert.equal(readOplGatewayAccount().status, 'attention_needed');

    fs.chmodSync(process.env.CODEX_HOME, 0o700);
    fs.rmSync(path.join(process.env.CODEX_HOME, 'config.toml'));
    const retried = await useOplGatewayForModelAccess();
    assert.equal(retried.gateway_account.status, 'connected');
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

// ---------------------------------------------------------------------------
// Gateway account lock recovery.
//
// A crash between creating account.lock and recording its owner used to leave
// every later Gateway operation waiting out the full 10s deadline and then
// failing with gateway_account_busy, which the App surfaced as "login failed".
// Reclaiming such a lock has to be driven by proof that the recorded owner is
// gone, not by a timer.
// ---------------------------------------------------------------------------

function exitedProcessId() {
  // A process that already exited: `process.kill(pid, 0)` fails with ESRCH for it.
  const child = spawnSync(process.execPath, ['-e', 'process.exit(0)']);
  assert.ok(typeof child.pid === 'number' && child.pid > 0);
  return child.pid as number;
}

async function withIsolatedGatewayState<T>(run: (lockPath: string) => Promise<T>): Promise<T> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-gateway-lock-'));
  const previous = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = path.join(root, 'state');
  try {
    const lockPath = resolveOplStatePaths().gateway_account_lock_file;
    fs.mkdirSync(path.dirname(lockPath), { recursive: true, mode: 0o700 });
    fs.chmodSync(path.dirname(path.dirname(lockPath)), 0o700);
    return await run(lockPath);
  } finally {
    if (previous === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previous;
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

test('a Gateway account lock left by a dead process is reclaimed instead of blocking every operation', async () => {
  await withIsolatedGatewayState(async (lockPath) => {
    fs.writeFileSync(lockPath, `${exitedProcessId()}\n`, { mode: 0o600 });

    const started = Date.now();
    const value = await withGatewayAccountLock(async () => 'ran');

    assert.equal(value, 'ran');
    // The old rule waited for a five-minute age before reclaiming a lock whose
    // owner was already gone, and then failed after the ten-second deadline.
    assert.ok(Date.now() - started < 2_000, `lock recovery took ${Date.now() - started}ms`);
    assert.equal(fs.existsSync(lockPath), false);
  });
});

test('a Gateway account lock held by a live process is honored, then reclaimed when that process exits', async () => {
  await withIsolatedGatewayState(async (lockPath) => {
    const owner = spawn(process.execPath, ['-e', 'setInterval(() => {}, 50)'], { stdio: 'ignore' });
    try {
      assert.ok(typeof owner.pid === 'number' && owner.pid > 0);
      const ownerRecord = `${owner.pid}\n`;
      fs.writeFileSync(lockPath, ownerRecord, { mode: 0o600 });

      let ran = false;
      const pending = withGatewayAccountLock(async () => { ran = true; return 'ran'; });
      await sleep(400);

      // A live owner must never be evicted: that is what makes reclaiming safe.
      assert.equal(ran, false);
      assert.equal(fs.existsSync(lockPath), true);
      assert.equal(fs.readFileSync(lockPath, 'utf8'), ownerRecord);

      owner.kill('SIGKILL');
      await new Promise<void>((resolve) => owner.once('exit', () => resolve()));

      assert.equal(await pending, 'ran');
      assert.equal(fs.existsSync(lockPath), false);
    } finally {
      if (owner.exitCode === null && owner.signalCode === null) owner.kill('SIGKILL');
    }
  });
});

test('an unattributed Gateway account lock is only reclaimed once its owner record cannot predate any holder', async () => {
  await withIsolatedGatewayState(async (lockPath) => {
    // An interrupted older writer: the file exists but its owner record was never
    // completed, so nothing proves the owner is gone.
    fs.writeFileSync(lockPath, '', { mode: 0o600 });

    let ran = false;
    const pending = withGatewayAccountLock(async () => { ran = true; return 'ran'; });
    await sleep(400);

    assert.equal(ran, false);
    assert.equal(fs.existsSync(lockPath), true);

    fs.rmSync(lockPath, { force: true });
    assert.equal(await pending, 'ran');
  });
});

test('concurrent Gateway account operations stay serialized', async () => {
  await withIsolatedGatewayState(async () => {
    const order: string[] = [];
    const first = withGatewayAccountLock(async () => {
      order.push('first:start');
      await sleep(150);
      order.push('first:end');
    });
    const second = withGatewayAccountLock(async () => {
      order.push('second:start');
      await sleep(10);
      order.push('second:end');
    });

    await Promise.all([first, second]);

    assert.deepEqual(order, ['first:start', 'first:end', 'second:start', 'second:end']);
  });
});

test('releasing the lock never removes a lock another process republished', async () => {
  await withIsolatedGatewayState(async (lockPath) => {
    const replacement = `${exitedProcessId()}\n`;
    await withGatewayAccountLock(async () => {
      // Simulate another process reclaiming and republishing the path while this
      // operation still holds the previous inode.
      fs.rmSync(lockPath, { force: true });
      fs.writeFileSync(lockPath, replacement, { mode: 0o600 });
    });

    assert.equal(fs.existsSync(lockPath), true);
    assert.equal(fs.readFileSync(lockPath, 'utf8'), replacement);
  });
});

test('dead-owner evidence cannot reclaim a lock replaced during the owner probe', async () => {
  await withIsolatedGatewayState(async (lockPath) => {
    const dead = exitedProcessId();
    fs.writeFileSync(lockPath, `${dead}\n`, { mode: 0o600 });
    const kill = process.kill;
    let replaced = false;
    process.kill = ((pid: number, signal: number) => {
      if (pid === dead && !replaced) {
        replaced = true;
        fs.rmSync(lockPath);
        fs.writeFileSync(lockPath, `${process.pid}\n`, { mode: 0o600 });
        throw Object.assign(new Error('old owner exited'), { code: 'ESRCH' });
      }
      return kill(pid, signal);
    }) as typeof process.kill;
    try {
      let ran = false;
      const pending = withGatewayAccountLock(async () => { ran = true; });
      await sleep(150);
      assert.equal(replaced, true);
      assert.equal(ran, false);
      assert.equal(fs.readFileSync(lockPath, 'utf8'), `${process.pid}\n`);
      fs.rmSync(lockPath);
      await pending;
      assert.equal(ran, true);
    } finally { process.kill = kill; }
  });
});
