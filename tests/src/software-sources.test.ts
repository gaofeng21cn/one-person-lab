import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { FrameworkContractError } from '../../src/kernel/contract-validation.ts';
import {
  checkOplSoftwareSource, configureOplSoftwareSource, disconnectOplSoftwareSource,
  executeOplSoftwareSourceAction, listOplSoftwareSources, resolvePackageSourceCredentialProvider,
} from '../../src/adapters/integration/software-sources.ts';
import { readSoftwareSource } from '../../src/adapters/integration/software-sources-store.ts';
import { verifySoftwareSourceCredential } from '../../src/adapters/integration/software-sources-verification.ts';
import { refreshHomebrewSource } from '../../src/adapters/integration/homebrew-source.ts';

const privateId = 'github-packages:gaofeng21cn';
async function withState(run: (directory: string) => void | Promise<void>) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-software-sources-'));
  const previous = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = directory;
  try { await run(directory); } finally {
    if (previous === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previous;
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test('software sources persist only handles and disconnect immediately changes the runtime credential selection', async () => withState(directory => {
  const initial = listOplSoftwareSources();
  assert.equal(initial.status, 'available');
  assert.equal(initial.entries.find(source => source.source_id === privateId)?.status, 'signed_out');
  assert.equal(fs.existsSync(path.join(directory, 'software-sources.json')), false);
  assert.equal(resolvePackageSourceCredentialProvider('gaofeng21cn/opl-capital-compass', 'ghcr.io/gaofeng21cn/one-person-lab-packages/occ:latest')?.credential_handle, null);
  configureOplSoftwareSource({ source_id: privateId });
  assert.equal(resolvePackageSourceCredentialProvider('gaofeng21cn/opl-capital-compass')?.credential_handle, 'provider:github_packages:gh-cli');
  assert.equal('credential_handle' in listOplSoftwareSources().entries[2], false);
  assert.equal(listOplSoftwareSources().entries.find(source => source.source_id === privateId)?.credential_handle_present, true);
  const before = fs.readFileSync(path.join(directory, 'software-sources.json'), 'utf8');
  assert.throws(() => configureOplSoftwareSource({ source_id: privateId, token: 'must-not-persist' } as never), FrameworkContractError);
  assert.throws(() => configureOplSoftwareSource({ source_id: privateId, credential_handle: 'raw-token-must-not-persist' }), FrameworkContractError);
  assert.equal(fs.readFileSync(path.join(directory, 'software-sources.json'), 'utf8'), before);
  configureOplSoftwareSource({ source_id: privateId, enabled: false });
  assert.equal(resolvePackageSourceCredentialProvider('gaofeng21cn/opl-capital-compass')?.enabled, false);
  disconnectOplSoftwareSource(privateId);
  assert.equal(resolvePackageSourceCredentialProvider('gaofeng21cn/opl-capital-compass')?.credential_handle, null);
  assert.equal(listOplSoftwareSources().entries.find(source => source.source_id === privateId)?.status, 'signed_out');
}));

test('provider verification requires provider readback and sends credentials only through stdin', async () => withState(async () => {
  configureOplSoftwareSource({ source_id: privateId });
  const source = readSoftwareSource(privateId);
  const token = 'test-provider-secret';
  const credentialReader = () => ({ provider_id: 'github_packages' as const, credential_handle: source.credential_handle!, username: 'fixture', token });
  for (const [http, expected] of [['200', 'authorized'], ['401', 'expired'], ['403', 'forbidden'], ['500', 'unknown']]) {
    const result = await verifySoftwareSourceCredential(source, {}, {
      credentialReader,
      run(args, input) {
        assert.equal(JSON.stringify(args).includes(token), false);
        assert.match(input, /Authorization: Basic/);
        return { status: 0, stdout: http };
      },
    });
    assert.equal(result.status, expected);
    assert.equal(JSON.stringify(result).includes(token), false);
  }
  assert.equal((await verifySoftwareSourceCredential(source, {}, { credentialReader: () => null })).status, 'signed_out');
  const verified = await checkOplSoftwareSource(privateId, { verify: async () => ({ status: 'expired', verification_reason: 'credential_expired' }) });
  assert.equal(verified.status, 'expired');
  assert.equal(listOplSoftwareSources().entries.find(source => source.source_id === privateId)?.status, 'expired');
}));

test('a delayed source check cannot restore disconnected credentials', async () => withState(async () => {
  configureOplSoftwareSource({ source_id: privateId });
  let release: (() => void) | undefined;
  const pending = checkOplSoftwareSource(privateId, { verify: async () => {
    await new Promise<void>(resolve => { release = resolve; });
    return { status: 'authorized', verification_reason: 'provider_verified' };
  } });
  disconnectOplSoftwareSource(privateId);
  release!();
  await assert.rejects(pending, (error: unknown) => error instanceof FrameworkContractError && error.details?.reason_code === 'software_source_changed');
  assert.equal(readSoftwareSource(privateId).credential_handle, null);
  assert.equal(readSoftwareSource(privateId).status, 'signed_out');
}));

test('source actions enforce exact safe payloads and count directory entries without source secrets', async () => withState(async () => {
  await assert.rejects(async () => executeOplSoftwareSourceAction('source_configure', { source_id: privateId, enabled: 'false' }), FrameworkContractError);
  await assert.rejects(async () => executeOplSoftwareSourceAction('source_check', { source_id: privateId, token: 'forbidden' }), FrameworkContractError);
  const publicChecked = await checkOplSoftwareSource('public-registry:opl', { verify: async () => ({ status: 'public', verification_reason: 'public_source_reachable' }) });
  assert.equal(publicChecked.status, 'public');
  const state = listOplSoftwareSources({ packageEntries: [{ package_id: 'public', package_access: { visibility: 'public' }, configured_carrier: { publication_ref: 'ghcr.io/gaofeng21cn/one-person-lab-packages/public:latest-stable' } }, { package_id: 'private', package_access: { visibility: 'authorized_only', source_id: privateId } }] });
  assert.equal(state.entries.find(source => source.source_id === privateId)?.entry_count, 1);
  assert.equal(state.entries.find(source => source.source_id === 'public-registry:opl')?.entry_count, 1);
  assert.equal(state.entries.find(source => source.source_id === 'public-registry:opl')?.available_actions.some(action => action.action_id === 'source_configure'), false);
}));

test('owner requests refresh for connected stale private sources and bounds retries after access failures', async () => withState(async () => {
  const input = { refreshRequiredSourceIds: [privateId] };
  const needsRefresh = () => listOplSoftwareSources(input).entries.find(source => source.source_id === privateId)!.access_refresh_required;
  assert.equal(needsRefresh(), false);
  configureOplSoftwareSource({ source_id: privateId });
  assert.equal(needsRefresh(), true);
  assert.equal(listOplSoftwareSources().entries.find(source => source.source_id === privateId)!.access_refresh_required, false);
  await checkOplSoftwareSource(privateId, { verify: async () => ({ status: 'authorized', verification_reason: 'verified' }), refreshPackageAccess: async () => {} });
  assert.equal(needsRefresh(), true);
  await checkOplSoftwareSource(privateId, { verify: async () => ({ status: 'expired', verification_reason: 'expired' }) });
  assert.equal(needsRefresh(), false);
  await checkOplSoftwareSource(privateId, { now: () => new Date(Date.now() - 61_000),
    verify: async () => ({ status: 'unknown', verification_reason: 'offline' }) });
  assert.equal(needsRefresh(), true);
  configureOplSoftwareSource({ source_id: privateId, enabled: false });
  assert.equal(needsRefresh(), false);
  disconnectOplSoftwareSource(privateId);
  assert.equal(needsRefresh(), false);
}));

test('installed Framework remains visible without a Homebrew catalog or provider', async () => withState(async directory => {
  const userHome = path.join(directory, 'user-home');
  const root = path.join(userHome, '.opl', 'one-person-lab');
  const env = { ...process.env, HOME: userHome, OPL_STATE_DIR: directory };
  fs.mkdirSync(path.join(root, 'bin'), { recursive: true });
  fs.mkdirSync(path.join(userHome, '.local', 'bin'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'opl-framework', version: '0.3.12' }));
  fs.writeFileSync(path.join(root, 'bin', 'opl'), '#!/bin/sh\n');
  fs.writeFileSync(path.join(root, '.opl-framework-installed-source-identity.json'), JSON.stringify({
    schema: 'opl_framework_installed_source_identity.v1', framework_sha: 'a'.repeat(40), install_mode: 'archive', identity_source: 'install_ref',
  }));
  fs.symlinkSync(path.join(root, 'bin', 'opl'), path.join(userHome, '.local', 'bin', 'opl'));
  const assertInstalled = (expectedSourceStatus: string) => {
    const projection = listOplSoftwareSources({}, env);
    const brew = projection.entries.find(source => source.provider_id === 'homebrew')!;
    assert.equal(brew.inventory_status, expectedSourceStatus);
    assert.deepEqual(brew.native_items, []);
    assert.equal(brew.entry_count, null);
    assert.equal(projection.installed_products.length, 1);
    const framework = projection.installed_products[0];
    assert.equal(framework.product_id, 'github:gaofeng21cn/one-person-lab');
    assert.equal(framework.display_name, 'OPL Framework');
    assert.equal(framework.installed_version, '0.3.12');
    assert.equal(framework.installation_owner, 'opl_framework');
    assert.equal(framework.owner_settings_route, 'updates');
    assert.deepEqual(framework.available_actions, []);
    assert.equal(JSON.stringify(framework).includes(userHome), false);
  };
  assertInstalled('not_checked');
  await refreshHomebrewSource({ env, run: async () => ({ status: null, stdout: '' }) });
  assertInstalled('unavailable');
  fs.rmSync(path.join(userHome, '.local', 'bin', 'opl'));
  assert.deepEqual(listOplSoftwareSources({}, env).installed_products, []);
}));
