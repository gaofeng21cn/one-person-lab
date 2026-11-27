import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ConnectError } from '../src/errors.ts';
import { readLocalCodexAccessState } from '../src/gateway/codex-binding.ts';
import {
  disconnectOplGatewayAccount,
  loginOplGatewayAccount,
  readOplGatewayAccount,
  refreshOplGatewayAccount,
  selectOplGatewayManagedGroup,
  useOplGatewayForModelAccess,
  withGatewayStateDirectory,
} from '../src/gateway/account.ts';

function json(response: http.ServerResponse, value: unknown, status = 200) {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(value));
}

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
      { id: 3, name: '企业 coDEX（专用）' },
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
    assert.equal(login.gateway_account.resolved_group_id, '3');
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
    const otherState = path.join(root, 'other-state');
    const other = withGatewayStateDirectory(otherState, readOplGatewayAccount);
    assert.equal(other.status, 'not_connected');
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
    const firstConfig = fs.readFileSync(configPath, 'utf8');

    const secondUse = await useOplGatewayForModelAccess();
    assert.equal(secondUse.gateway_account.status, 'connected');
    assert.equal(fs.readFileSync(configPath, 'utf8'), firstConfig);

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
      (error: unknown) => error instanceof ConnectError
        && error.reason_code === 'gateway_unavailable',
    );
    const staleAfterFailure = readOplGatewayAccount();
    assert.equal(staleAfterFailure.status, 'connected');
    assert.equal(staleAfterFailure.freshness.stale, true);
    assert.equal(staleAfterFailure.freshness.last_error_code, 'gateway_unavailable');
    refreshFailureStatus = null;

    refreshUnauthorized = true;
    await assert.rejects(refreshOplGatewayAccount(), (error: unknown) =>
      error instanceof ConnectError && error.reason_code === 'reauth_required');
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

test('group resolution leaves ambiguous Gateway choices with the user', () => {
  assert.equal(selectOplGatewayManagedGroup([]), null);
  assert.equal(selectOplGatewayManagedGroup([{ group_id: 'a', label: 'research' }]), 'a');
  const group = (label: string) => ({ group_id: label, label });
  assert.equal(selectOplGatewayManagedGroup(['research', 'science'].map(group)), null);
  assert.equal(selectOplGatewayManagedGroup(['my CODEX', 'Team Codex A'].map(group)), null);
});
