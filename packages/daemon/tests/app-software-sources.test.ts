import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import type { projectSoftwareSources } from '../src/rpc/software-source-actions.ts';
import { connectTestRpc, createDaemonSandbox } from './helpers/sandbox.ts';

test('trusted Studio connects, checks and disconnects a private software source through its projected actions', async t => {
  const token = 'synthetic-private-source-only';
  const sandbox = createDaemonSandbox({ OPL_GITHUB_PACKAGES_TOKEN: token });
  t.after(() => sandbox.cleanup());
  let identityReads = 0;
  let identityStatus = 200;
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    if (String(input) !== 'https://api.github.com/user') return new Response(null, { status: 404 });
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
  assert.equal(observed.verification_reason, 'provider_identity_verified_package_grants_checked_at_install');
  assert.ok(!fs.readFileSync(path.join(sandbox.stateDir, 'software-sources.json'), 'utf8').includes(token));
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
