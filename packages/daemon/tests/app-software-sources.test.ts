import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { buildPackage, createPackageSourceArchive } from '@opl/pack';
import type { projectSoftwareSources } from '../src/rpc/software-source-actions.ts';
import { connectTestRpc, createDaemonSandbox } from './helpers/sandbox.ts';

test('trusted Studio connects, checks and disconnects a private software source through its projected actions', async t => {
  const token = 'synthetic-private-source-only';
  const sandbox = createDaemonSandbox({ OPL_GITHUB_PACKAGES_TOKEN: token });
  t.after(() => sandbox.cleanup());
  let identityReads = 0;
  let identityStatus = 200;
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/catalog-index.json')) return Response.json({
      schema_version: 'opl_software_catalog_index.v1', catalog_id: 'public-registry:opl',
      packages: [{ package_id: 'fixture', visibility: 'authorized_only',
        manifest: { source_repo: 'https://github.com/gaofeng21cn/fixture.git' } }],
    });
    if (url.origin === 'https://ghcr.io') {
      if (url.pathname === '/token') return Response.json({ token: 'fixture-registry-token' });
      assert.equal(init?.method, 'HEAD');
      assert.equal(url.pathname, '/v2/gaofeng21cn/one-person-lab-private-packages/fixture/manifests/latest-stable');
      return new Response(null, { status: 200 });
    }
    if (url.href !== 'https://api.github.com/user') return new Response(null, { status: 404 });
    ++identityReads;
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer ' + token);
    return Response.json({ id: 42, login: 'fixture-user' }, { status: identityStatus });
  });

  await sandbox.startInProcess();
  const app = await connectTestRpc(sandbox.sessionPath, 'opl_app', '2.0');
  const external = await connectTestRpc(sandbox.sessionPath, 'external', '2.0');
  t.after(() => Promise.all([app.close(), external.close()]));

  const state = async (profile: string, client = app) => {
    const result = await client.call('app.state.get', { profile }) as {
      app_state: { agent_packages: { sources?: ReturnType<typeof projectSoftwareSources> }; actions: { action_id: string }[] };
    };
    return result.app_state;
  };
  const request = (action_id: string, payload: Record<string, unknown>, client = app) =>
    client.call('app.action.execute', { action_id, payload, dry_run: false });
  const initial = await state('fast');
  const sources = initial.agent_packages.sources!;
  assert.equal(sources.surface_kind, 'opl_software_sources_projection.v1');
  const entry = sources.entries.find(source => source.catalog_origin === 'opl')!;
  assert.equal(entry.status, 'signed_out');
  assert.equal(entry.credential_handle_present, false);
  for (const action of ['source_list', 'source_check', 'source_disconnect', 'source_configure']) {
    assert.ok(entry.available_actions.some(a => a.action_id === action));
    assert.ok(initial.actions.some(a => a.action_id === action));
  }
  const definition = entry.available_actions.find(a => a.action_id === 'source_configure')!;
  assert.equal(definition.default_payload?.credential_handle, 'provider:github_packages:gh-cli');
  const selected = { source_id: entry.source_id, ...definition.default_payload, credential_handle: 'env:OPL_GITHUB_PACKAGES_TOKEN' };
  assert.equal((await state('fast', external)).agent_packages.sources, undefined);
  await assert.rejects(request('source_configure', { ...selected, confirmed: true }, external), /TRUSTED_HOST_REQUIRED/);
  await assert.rejects(request('source_configure', selected), /CONFIRMATION_REQUIRED/);
  await assert.rejects(request('source_configure', { ...selected, confirmed: true, token }), /INVALID_INPUT/);
  assert.equal(identityReads, 0);

  const connected = await request('source_configure', { ...selected, confirmed: true });
  assert.ok(!JSON.stringify(connected).includes(token));
  assert.equal(identityReads, 1);
  const observed = (await state('full')).agent_packages.sources!.entries[0]!;
  assert.equal(observed.status, 'authorized');
  assert.equal(observed.credential_handle_present, true);
  assert.equal(observed.verification_reason, 'provider_identity_and_registry_package_read_verified');
  assert.equal(fs.existsSync(path.join(sandbox.stateDir, 'software-sources.json')), false);
  await assert.rejects(external.call('pack.sources.list', {}), /TRUSTED_HOST_REQUIRED/);
  const publicSource = sources.entries.find(source => source.source_id === 'public-registry:opl')!;
  assert.deepEqual(publicSource.available_actions.map(action => action.action_id), ['source_refresh']);
  const refresh = await request('source_refresh', { source_id: publicSource.source_id }) as any;
  assert.equal(refresh.app_action_execution.result.refreshed, true);
  assert.equal((await state('fast')).agent_packages.sources!.entries.find(source => source.source_id === publicSource.source_id)?.status, 'ready');
  await request('source_list', { confirmed: true });
  assert.equal(identityReads, 1);

  identityStatus = 401;
  await request('source_check', { source_id: entry.source_id, confirmed: true });
  assert.equal((await state('fast')).agent_packages.sources!.entries[0]!.status, 'expired');
  await request('source_configure', { ...selected, enabled: false, confirmed: true });
  await request('source_check', { source_id: entry.source_id });
  await assert.rejects(request('source_disconnect', { source_id: entry.source_id }), /CONFIRMATION_REQUIRED/);
  await request('source_disconnect', { source_id: entry.source_id, confirmed: true });
  const disconnected = (await state('fast')).agent_packages.sources!.entries[0]!;
  assert.equal(disconnected.status, 'signed_out');
  assert.equal(disconnected.credential_handle_present, false);
  assert.equal(identityReads, 2);
});

test('trusted Studio uses logged-in OPL Gateway account for opl-cloud entitlements, restricted install, and disconnect cleanup', async t => {
  const saved = {
    nodeEnv: process.env.NODE_ENV,
    gw: process.env.OPL_GATEWAY_CONTROL_BASE_URL,
    cloud: process.env.OPL_CLOUD_BASE_URL,
  };
  t.after(() => {
    for (const [k, v] of [['NODE_ENV', saved.nodeEnv], ['OPL_GATEWAY_CONTROL_BASE_URL', saved.gw], ['OPL_CLOUD_BASE_URL', saved.cloud]] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  const sandbox = createDaemonSandbox();
  t.after(() => sandbox.cleanup());

  // Build valid restricted package archive fixture
  const pkgSrc = path.join(sandbox.root, 'src-private-cloud');
  fs.mkdirSync(pkgSrc, { recursive: true });
  const text = { 'en-US': 'Private Cloud Pkg', 'zh-CN': '云端私有包' };
  fs.writeFileSync(path.join(pkgSrc, 'opl-package.json'), JSON.stringify({
    schema_version: 'opl.package.v2',
    identity: { id: 'private-cloud', version: '1.3.0', intent: 'extension', publisher: 'OPL', name: text, summary: text },
  }));
  const commit = 'b'.repeat(40);
  const { digest: contentDigest } = buildPackage(pkgSrc, { gitCommit: commit });
  const archiveFile = path.join(sandbox.root, 'private-cloud-1.3.0.tar.gz');
  const archiveDigest = createPackageSourceArchive(pkgSrc, archiveFile, ['opl-package.json', 'opl-release.lock.json']);
  const archiveBytes = fs.readFileSync(archiveFile);
  const payloadBytes = JSON.stringify({
    package_format: 'v2',
    package_id: 'private-cloud',
    package_version: '1.3.0',
    source_commit: commit,
    source_repo: 'https://github.com/gaofeng21cn/private-cloud.git',
    archive_sha256: archiveDigest,
    content_lock: { digest: contentDigest },
  });
  const payloadSha = 'sha256:' + createHash('sha256').update(payloadBytes).digest('hex');

  const cloudAuthHeaders: string[] = [];
  let keyStatus = 'active';
  const server = http.createServer(async (req, res) => {
    const url = req.url ?? '';
    const jsonRes = (obj: unknown, status = 200) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(obj));
    };
    if (url === '/api/v1/settings/public') return jsonRes({ code: 0, data: { server_timezone: 'Asia/Shanghai' } });
    if (url === '/api/v1/auth/login') return jsonRes({ code: 0, data: { access_token: 'gw-access-1', refresh_token: 'gw-refresh-1' } });
    if (url === '/api/v1/auth/refresh') return jsonRes({ code: 0, data: { access_token: 'gw-access-2', refresh_token: 'gw-refresh-2' } });
    if (url === '/api/v1/user/profile') {
      return jsonRes({ code: 0, data: { id: 6, username: 'gaofeng', email: 'gaofeng@example.com', status: 'active', balance: 50, currency: 'USD' } });
    }
    if (url === '/api/v1/usage/dashboard/stats') {
      return jsonRes({ code: 0, data: { today_tokens: 0, total_tokens: 0, today_actual_cost: 0, total_actual_cost: 0, currency: 'USD' } });
    }
    if (url === '/api/v1/groups/available') return jsonRes({ code: 0, data: [{ id: 1, name: 'Codex' }] });
    if (url.startsWith('/api/v1/keys?')) return jsonRes({ code: 0, data: { items: [] } });
    if (url === '/api/v1/keys' && req.method === 'POST') {
      return jsonRes({ code: 0, data: { id: 77, name: 'opl-managed', key: 'k-secret', status: keyStatus, group_id: 1, ip_whitelist: [], ip_blacklist: [] } });
    }
    if (url === '/api/v1/keys/77' && req.method === 'PUT') {
      keyStatus = 'inactive';
      return jsonRes({ code: 0, data: { id: 77, name: 'opl-managed', key: 'k-secret', status: keyStatus, group_id: 1, ip_whitelist: [], ip_blacklist: [] } });
    }
    if (url === '/api/v1/auth/logout') return jsonRes({ code: 0, data: {} });
    if (url === '/api/v2/software/entitlements' && req.method === 'GET') {
      cloudAuthHeaders.push(String(req.headers.authorization ?? ''));
      return jsonRes({
        entitlements: [
          { package_id: 'private-cloud', enabled: true, selected_version: '1.3.0', sha256: archiveDigest },
          { package_id: 'unlisted-cloud', enabled: true, selected_version: '0.2.0', display_name: 'Unlisted Cloud Addon' },
        ],
      });
    }
    if (url === '/api/v2/software/packages/private-cloud/download' && req.method === 'POST') {
      cloudAuthHeaders.push(String(req.headers.authorization ?? ''));
      res.writeHead(200, { 'content-type': 'application/gzip', 'x-opl-artifact-sha256': archiveDigest });
      res.end(archiveBytes);
      return;
    }
    return jsonRes({ error: 'not_found' }, 404);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const addr = server.address();
  assert.ok(addr && typeof addr === 'object');

  process.env.NODE_ENV = 'test';
  process.env.OPL_GATEWAY_CONTROL_BASE_URL = `http://127.0.0.1:${addr.port}/api/v1`;
  process.env.OPL_CLOUD_BASE_URL = `http://127.0.0.1:${addr.port}`;

  const origFetch = globalThis.fetch;
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/catalog-index.json')) {
      return Response.json({
        schema_version: 'opl_software_catalog_index.v1',
        catalog_id: 'public-registry:opl',
        packages: [{
          package_id: 'private-cloud',
          visibility: 'authorized_only',
          manifest: {
            package_id: 'private-cloud',
            source_repo: 'https://github.com/gaofeng21cn/private-cloud.git',
            codex_surface: { configured_codex_plugin_carrier: { publication_ref: 'ghcr.io/gaofeng21cn/one-person-lab-private-packages/private-cloud:latest-stable' } },
            v2_release: {
              version: '1.3.0',
              source_commit: commit,
              payload_manifest_ref: 'payloads/private-cloud-1.3.0.json',
              payload_sha256: payloadSha,
            },
          },
          public_summary: {
            owner_source_repo: 'https://github.com/gaofeng21cn/private-cloud.git',
            display_name: 'Private Cloud Summary',
          },
        }],
      });
    }
    if (url.pathname.endsWith('/payloads/private-cloud-1.3.0.json')) {
      return new Response(payloadBytes);
    }
    return origFetch(input, init);
  });

  await sandbox.startInProcess();
  const app = await connectTestRpc(sandbox.sessionPath, 'opl_app', '2.0');
  t.after(() => app.close());

  await app.call('connect.gateway.login', { email: 'gaofeng@example.com', password: 'pw' });
  const refreshed = await app.call('app.action.execute', {
    action_id: 'source_refresh', payload: { source_id: 'public-registry:opl' }, dry_run: false,
  });
  assert.ok(refreshed);

  const checkRes = await app.call('app.action.execute', {
    action_id: 'source_check', payload: { source_id: 'opl-cloud:default' }, dry_run: false,
  }) as { app_action_execution: { result: { software_source: Record<string, unknown> } } };
  assert.equal(checkRes.app_action_execution.result.software_source.status, 'authorized');
  assert.equal(checkRes.app_action_execution.result.software_source.provider_id, 'opl_cloud');
  assert.equal(checkRes.app_action_execution.result.software_source.entry_count, 2);

  const state = await app.call('app.state.get', { profile: 'fast' }) as {
    app_state: { agent_packages: { directory: { entries: Array<Record<string, any>> }; sources: ReturnType<typeof projectSoftwareSources> } };
  };
  const cloudSource = state.app_state.agent_packages.sources.entries.find(s => s.source_id === 'opl-cloud:default')!;
  assert.equal(cloudSource.status, 'authorized');
  assert.equal(cloudSource.account_login, 'gaofeng@example.com');
  const listedRow = state.app_state.agent_packages.directory.entries.find(e => e.package_id === 'private-cloud')!;
  assert.equal(listedRow.installability.installable, true);
  assert.equal(listedRow.package_access.provider_id, 'opl_cloud');
  const unlistedRow = state.app_state.agent_packages.directory.entries.find(e => e.package_id === 'unlisted-cloud')!;
  assert.equal(unlistedRow.installability.installable, true);

  await app.call('app.action.execute', {
    action_id: 'agent_package_install', payload: { package_id: 'private-cloud', confirmed: true }, dry_run: false,
  });
  const installed = await app.call('pack.list', {}) as { packages: Array<{ package_id: string; version: string }> };
  assert.equal(installed.packages.some(p => p.package_id === 'private-cloud' && p.version === '1.3.0'), true);
  assert.equal(cloudAuthHeaders.length >= 2, true);
  assert.ok(cloudAuthHeaders.every(h => h.startsWith('Bearer gw-access-')));

  await app.call('app.action.execute', {
    action_id: 'gateway_account_disconnect', payload: { confirmed: true }, dry_run: false,
  });
  const afterDisconnect = await app.call('app.state.get', { profile: 'fast' }) as {
    app_state: { agent_packages: { sources: ReturnType<typeof projectSoftwareSources> } };
  };
  const clearedSource = afterDisconnect.app_state.agent_packages.sources.entries.find(s => s.source_id === 'opl-cloud:default')!;
  assert.equal(clearedSource.status, 'signed_out');
});
