import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { authorizeOplLinkCompanion } from '../../src/adapters/integration/opl-gateway-account.ts';
import { exchangeCompanionCredentials, OPL_LINK_RELAY_ORIGIN } from '../../src/adapters/integration/opl-gateway-account-parts/companion-authorization.ts';
import { readGatewayCredentials, writeGatewayAccountState, writeGatewayCredentials } from '../../src/adapters/integration/opl-gateway-account-parts/private-store.ts';

const device = {
  deviceId: '29bf60b4-c312-4567-890a-2c91656f458d', role: 'host' as const,
  name: 'Test Mac', platform: 'darwin', clientVersion: '2.0.0',
  identityKey: Buffer.alloc(32, 7).toString('base64url'),
};
const request = { service: 'opl_link', device };
const credentials = (origin: string) => ({
  serverUrl: origin, accountScope: Buffer.alloc(32, 3).toString('base64url'),
  accessToken: 'relay-access-test-only', refreshToken: 'relay-refresh-test-only',
  accessTokenExpiresAt: Date.now() + 3600_000, refreshTokenExpiresAt: Date.now() + 30 * 86400_000,
});
function restoreEnv(previous: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
}

test('companion secret bridge rotates the existing account and writes only private scoped credentials', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-companion-auth-'));
  fs.chmodSync(root, 0o700);
  const previous = Object.fromEntries(['OPL_STATE_DIR', 'NODE_ENV', 'OPL_GATEWAY_CONTROL_BASE_URL', 'OPL_LINK_RELAY_BASE_URL']
    .map(key => [key, process.env[key]]));
  let refreshes = 0;
  let registrations = 0;
  let leakedRedirect = 0;
  let mode = 'ok';
  let origin = '';
  const server = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const part of req) chunks.push(Buffer.from(part));
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
    res.setHeader('content-type', 'application/json');
    if (req.url === '/api/v1/auth/refresh') {
      assert.match(body.refresh_token, /^refresh-(before|\d+)$/);
      refreshes += 1;
      res.end(JSON.stringify({ code: 0, data: { access_token: `account-access-${refreshes}`, refresh_token: `refresh-${refreshes}` } }));
      return;
    }
    if (req.url === '/api/v1/devices/register') {
      registrations += 1;
      assert.deepEqual(body, { v: 1, device });
      assert.equal(req.headers.authorization, `Bearer account-access-${refreshes}`);
      if (mode === 'redirect') { res.writeHead(302, { location: `${origin}/leak` }); res.end(); return; }
      if (mode === 'denied') { res.writeHead(403); res.end(JSON.stringify({ error: 'account-access-private' })); return; }
      if (mode === 'oversize') { res.end(JSON.stringify({ ...credentials(origin), ignored: 'x'.repeat(17 * 1024) })); return; }
      const value = credentials(mode === 'wrong-origin' ? 'https://other.invalid' : origin);
      if (mode === 'expired') value.accessTokenExpiresAt = Date.now() - 1000;
      res.end(JSON.stringify(value)); return;
    }
    if (req.url === '/leak') leakedRedirect += 1;
    res.writeHead(404); res.end('{}');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert(address && typeof address === 'object');
  origin = `http://127.0.0.1:${address.port}`;
  process.env.OPL_STATE_DIR = path.join(root, 'state');
  process.env.NODE_ENV = 'test';
  process.env.OPL_GATEWAY_CONTROL_BASE_URL = `${origin}/api/v1`;
  process.env.OPL_LINK_RELAY_BASE_URL = origin;
  writeGatewayAccountState({
    surface_kind: 'opl_gateway_account_state.v1', status: 'connected', account_user_id: '42',
    canonical_key_name: 'Test account', key_id: null, key_status: null, key_group_id: null,
    available_groups: [], snapshot: null, observed_at: null, stale_after: null,
    last_error_code: null, codex_binding: null, transaction_stage: null,
  });
  writeGatewayCredentials({ surface_kind: 'opl_gateway_credentials.v1', refresh_token: 'refresh-before',
    previous_codex_config: null, previous_codex_config_existed: false });
  try {
    await t.test('credential file is exclusive, private, device-bound and absent from public output', async () => {
      const destination = path.join(root, 'credentials.json');
      const result = await authorizeOplLinkCompanion(request, destination);
      assert.equal(fs.statSync(destination).mode & 0o777, 0o600);
      const privateValue = JSON.parse(fs.readFileSync(destination, 'utf8'));
      assert.equal(privateValue.schema, 'opl_link_remote_credentials.v1');
      assert.equal(privateValue.deviceId, device.deviceId);
      assert.equal(privateValue.identityKey, device.identityKey);
      assert.equal(privateValue.accessToken, 'relay-access-test-only');
      assert.equal(readGatewayCredentials()?.refresh_token, 'refresh-1');
      const publicValue = JSON.stringify(result);
      for (const secret of ['relay-access-test-only', 'relay-refresh-test-only', 'account-access-1', 'refresh-1']) {
        assert.equal(publicValue.includes(secret), false);
      }
      assert.equal(result.companion_authorization.credential_written, true);
      assert.equal(refreshes, 1); assert.equal(registrations, 1);
    });
    await t.test('invalid identities and unsafe destinations fail before any account or service mutation', async () => {
      const before = refreshes;
      const existing = path.join(root, 'existing'); fs.writeFileSync(existing, 'preserved', { mode: 0o600 });
      const link = path.join(root, 'symlink'); fs.symlinkSync(existing, link);
      const publicDir = path.join(root, 'public'); fs.mkdirSync(publicDir, { mode: 0o755 });
      for (const target of [existing, link, path.join(publicDir, 'credential'), 'relative.json']) {
        await assert.rejects(authorizeOplLinkCompanion(request, target));
      }
      await assert.rejects(authorizeOplLinkCompanion({ service: 'other', device }, path.join(root, 'other')));
      await assert.rejects(authorizeOplLinkCompanion({ service: 'opl_link', device: { ...device, role: 'client' } }, path.join(root, 'client')));
      await assert.rejects(authorizeOplLinkCompanion({ ...request, endpoint: 'https://other.invalid' }, path.join(root, 'endpoint')));
      await assert.rejects(authorizeOplLinkCompanion({ ...request, device: { ...device, deviceId: 'invalid' } }, path.join(root, 'bad-id')));
      assert.equal(refreshes, before);
      assert.equal(fs.readFileSync(existing, 'utf8'), 'preserved');
    });
    await t.test('redirects, invalid credentials and service failures leave no partial credential file', async () => {
      for (const failure of ['redirect', 'denied', 'wrong-origin', 'oversize', 'expired']) {
        mode = failure;
        const target = path.join(root, `failure-${failure}.json`);
        let captured: unknown;
        try { await authorizeOplLinkCompanion(request, target); } catch (error) { captured = error; }
        assert(captured, failure);
        assert.equal(fs.existsSync(target), false, failure);
        assert.equal(String(captured).includes('account-access-private'), false);
      }
      assert.equal(leakedRedirect, 0);
    });
    await t.test('the actual opl launcher routes stdin, validates options and keeps secrets off stdout', async () => {
      mode = 'ok';
      const launcher = fileURLToPath(new URL('../../bin/opl', import.meta.url));
      const run = (args: string[], input = '') => new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
        const child = spawn(launcher, args, { env: process.env, stdio: ['pipe', 'pipe', 'pipe'] });
        let stdout = ''; let stderr = '';
        child.stdout.on('data', chunk => { stdout += chunk; });
        child.stderr.on('data', chunk => { stderr += chunk; });
        child.once('error', reject);
        child.once('close', code => resolve({ code, stdout, stderr }));
        child.stdin.end(input);
      });
      const help = await run(['help', 'connect', 'gateway', 'authorize-companion', '--json']);
      assert.equal(help.code, 0, help.stderr);
      assert.equal(JSON.parse(help.stdout).help.registry.command_id, 'connect gateway authorize-companion');
      const before = registrations;
      const invalid = await run(['connect', 'gateway', 'authorize-companion', '--request-stdin', '--credential-file', path.join(root, 'bad-cli'), '--endpoint', origin, '--json'], JSON.stringify(request));
      assert.notEqual(invalid.code, 0);
      assert.equal(JSON.parse(invalid.stderr).error.code, 'cli_usage_error');
      assert.equal(registrations, before);
      const destination = path.join(root, 'cli-credentials.json');
      const valid = await run(['connect', 'gateway', 'authorize-companion', '--request-stdin', '--credential-file', destination, '--json'], JSON.stringify(request));
      assert.equal(valid.code, 0, valid.stderr);
      assert.equal(JSON.parse(valid.stdout).companion_authorization.credential_written, true);
      assert.equal(JSON.parse(fs.readFileSync(destination, 'utf8')).deviceId, device.deviceId);
      assert.equal(fs.statSync(destination).mode & 0o777, 0o600);
      assert.equal(registrations, before + 1);
      assert.equal(/relay-access-test-only|relay-refresh-test-only|account-access-|refresh-\d+/.test(valid.stdout + valid.stderr), false);
    });
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    restoreEnv(previous); fs.rmSync(root, { recursive: true, force: true });
  }
});

test('production companion authorization ignores test endpoint overrides', async t => {
  const previous = { NODE_ENV: process.env.NODE_ENV, OPL_LINK_RELAY_BASE_URL: process.env.OPL_LINK_RELAY_BASE_URL };
  process.env.NODE_ENV = 'production'; process.env.OPL_LINK_RELAY_BASE_URL = 'http://127.0.0.1:1';
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, options?: RequestInit) => {
    assert.equal(String(input), `${OPL_LINK_RELAY_ORIGIN}/api/v1/devices/register`);
    assert.equal(options?.redirect, 'error');
    return new Response(JSON.stringify(credentials(OPL_LINK_RELAY_ORIGIN)), { headers: { 'content-type': 'application/json' } });
  });
  try {
    const result = await exchangeCompanionCredentials(device, 'test-account-access');
    assert.equal(result.serverUrl, OPL_LINK_RELAY_ORIGIN);
  } finally { restoreEnv(previous); }
});
