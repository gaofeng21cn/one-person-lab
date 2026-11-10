import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  credentialForGithubPackages,
  verifyGithubPackagesAccess,
} from '../../src/adapters/integration/agent-package-registry-parts/package-registry-access-provider.ts';

const input = {
  packageId: 'occ',
  publicationRef: 'ghcr.io/gaofeng21cn/one-person-lab-private-packages/occ:latest-stable',
  accessPolicyRef: 'github-package:gaofeng21cn/one-person-lab-private-packages/occ',
  sourceRef: 'https://github.com/gaofeng21cn/opl-capital-compass',
  credentialHandle: 'env:OPL_GITHUB_PACKAGES_TOKEN',
};

test('private Package authorization rejects public namespaces and mismatched access policies before reading credentials', () => {
  for (const selected of [
    { ...input, publicationRef: input.publicationRef.replace('one-person-lab-private-packages', 'one-person-lab-packages') },
    { ...input, accessPolicyRef: input.accessPolicyRef.replace('/occ', '/other') },
    { ...input, packageId: 'other' },
  ]) {
    const result = verifyGithubPackagesAccess({
      ...selected,
      credentialReader() { throw new Error('must not read a credential for a mismatched private namespace'); },
      commandRunner() { throw new Error('must not contact a mismatched registry'); },
    });
    assert.equal(result.status, 'unknown');
    assert.equal(result.download_allowed, false);
    assert.equal(result.discover_allowed, false);
    assert.match(result.reason ?? '', /package_publication_ref_invalid|package_access_policy_binding_mismatch/);
  }
});

test('private Package access fails closed when the provider credential is absent', () => {
  const result = verifyGithubPackagesAccess({ ...input, env: {}, credentialReader() { return null; }, commandRunner() { throw new Error('must not contact registry'); } });
  assert.equal(result.status, 'signed_out');
  assert.equal(result.discover_allowed, false);
  assert.equal(result.download_allowed, false);
  assert.equal(result.credential_handle, null);
});

test('an absent or unsupported handle never falls back to machine credentials', () => {
  for (const credentialHandle of [null, undefined, 'provider:foreign:ghcr']) {
    let readerCalled = false;
    const result = verifyGithubPackagesAccess({
      ...input,
      env: { OPL_GITHUB_PACKAGES_TOKEN: 'must-not-be-used' },
      credentialHandle,
      credentialReader() {
        readerCalled = true;
        return { provider_id: 'github_packages', credential_handle: 'unexpected', username: 'x-access-token', token: 'unexpected' };
      },
      commandRunner() { throw new Error('must not contact registry'); },
    });
    assert.equal(readerCalled, false);
    assert.equal(result.status, 'signed_out');
    assert.equal(result.reason, 'package_access_credential_required');
  }
});

test('an explicit environment handle reads only the package token bridge', () => {
  const result = verifyGithubPackagesAccess({
    ...input,
    env: { OPL_GITHUB_TOKEN: 'legacy-token' },
    credentialHandle: 'env:OPL_GITHUB_PACKAGES_TOKEN',
    commandRunner() { throw new Error('must not contact registry'); },
  });
  assert.equal(result.status, 'signed_out');
  assert.equal(result.credential_handle, null);
});

test('the provider passes the selected handle to its credential reader', () => {
  const handles: Array<string | null | undefined> = [];
  const manifestBody = '{"schemaVersion":2,"layers":[]}';
  let call = 0;
  const result = verifyGithubPackagesAccess({
    ...input,
    env: {},
    credentialHandle: 'provider:github_packages:ghcr',
    credentialReader(_env, handle) {
      handles.push(handle);
      return { provider_id: 'github_packages', credential_handle: handle ?? 'unexpected', username: 'x-access-token', token: 'test-secret' };
    },
    commandRunner() {
      call += 1;
      return { status: 200, stdout: Buffer.from(call === 1 ? '{"token":"registry-token"}' : manifestBody), stderr: '', error: null };
    },
  });
  assert.equal(result.status, 'authorized');
  assert.deepEqual(handles, ['provider:github_packages:ghcr']);
  assert.equal(result.credential_handle, 'provider:github_packages:ghcr');
});

test('a credential reader cannot substitute a different handle', () => {
  const result = verifyGithubPackagesAccess({
    ...input,
    credentialHandle: 'provider:github_packages:docker',
    credentialReader() {
      return { provider_id: 'github_packages', credential_handle: 'provider:github_packages:gh-cli', username: 'x-access-token', token: 'other-owner-secret' };
    },
    commandRunner() { throw new Error('must not contact registry with another credential owner'); },
  });
  assert.equal(result.status, 'signed_out');
  assert.equal(result.download_allowed, false);
});

test('private Package access verifies the GHCR pull scope before authorizing', () => {
  const calls: Array<{ args: string[]; input: string }> = [];
  const manifestBody = '{"schemaVersion":2,"layers":[]}';
  const result = verifyGithubPackagesAccess({
    ...input,
    env: { OPL_GITHUB_PACKAGES_TOKEN: 'test-secret', OPL_GITHUB_USERNAME: 'gaofeng21cn' },
    now: () => new Date('2026-11-10T00:00:00.000Z'),
    commandRunner(args, content) {
      calls.push({ args, input: content });
      if (calls.length === 1) return { status: 200, stdout: Buffer.from('{"token":"registry-token"}'), stderr: '', error: null };
      return { status: 200, stdout: Buffer.from(manifestBody), stderr: '', error: null };
    },
  });
  assert.equal(result.status, 'authorized');
  assert.equal(result.discover_allowed, true);
  assert.equal(result.download_allowed, true);
  assert.equal(result.credential_handle, 'env:OPL_GITHUB_PACKAGES_TOKEN');
  assert.match(result.security_revision ?? '', /^sha256:[0-9a-f]{64}$/);
  assert.equal(calls.length, 2);
  assert.match(calls[0].args.join(' '), /repository%3Agaofeng21cn%2Fone-person-lab-private-packages%2Focc%3Apull/);
  assert.match(calls[0].input, /Authorization: Basic /);
  assert.doesNotMatch(calls[0].args.join(' '), /test-secret/);
  assert.match(calls[1].input, /Authorization: Bearer registry-token/);
  for (const call of calls) {
    assert.equal(call.args[0], '--disable');
    assert.equal(call.args[call.args.indexOf('--max-time') + 1], '15');
    assert.equal(call.args[call.args.indexOf('--config') + 1], '-');
    assert.equal(call.args.includes('--location'), false);
    assert.doesNotMatch(call.args.join(' '), /test-secret|registry-token|Authorization:/);
  }
});

test('credentials and registry responses cannot inject curl config directives', () => {
  for (const badSecret of ['secret\nurl = "https://example.invalid"', 'secret\rheader = "X-Injected: yes"', 'secret\0']) {
    const result = verifyGithubPackagesAccess({
      ...input,
      env: { OPL_GITHUB_PACKAGES_TOKEN: badSecret },
      commandRunner() { throw new Error('must reject malformed credential before curl'); },
    });
    assert.equal(result.status, 'signed_out');
  }
  for (const token of ['token"\nurl = "https://example.invalid', 'token\r\nheader = "X-Injected: yes"', 'token\\"']) {
    let calls = 0;
    const result = verifyGithubPackagesAccess({
      ...input,
      env: { OPL_GITHUB_PACKAGES_TOKEN: 'safe-secret' },
      commandRunner() {
        calls += 1;
        if (calls > 1) throw new Error('must reject registry token before manifest request');
        return { status: 200, stdout: Buffer.from(JSON.stringify({ token })), stderr: 'private helper diagnostics', error: null };
      },
    });
    assert.equal(result.status, 'unknown');
    assert.equal(calls, 1);
    assert.equal(result.download_allowed, false);
    assert.equal(JSON.stringify(result).includes('private helper diagnostics'), false);
  }
});

test('the native curl runner passes credentials on stdin and applies bounded network requests', { skip: process.platform === 'win32' }, t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-registry-curl-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const callsFile = path.join(root, 'calls.jsonl');
  const script = `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
const config = fs.readFileSync(0, 'utf8');
fs.appendFileSync(process.env.FIXTURE_CALLS, JSON.stringify({ args, config }) + '\\n');
const body = args.at(-1).includes('/token?') ? { token: 'registry-token' } : { schemaVersion: 2, layers: [] };
process.stdout.write(JSON.stringify(body) + '\\nOPL_HTTP_STATUS:200\\n');
`;
  fs.writeFileSync(path.join(root, 'curl'), script, { mode: 0o700 });
  const secret = 'safe"\\quoted-secret';
  const result = verifyGithubPackagesAccess({
    ...input,
    env: { PATH: root, HOME: root, FIXTURE_CALLS: callsFile, OPL_GITHUB_PACKAGES_TOKEN: secret },
  });
  assert.equal(result.status, 'authorized');
  const calls = fs.readFileSync(callsFile, 'utf8').trim().split('\n').map(line => JSON.parse(line) as { args: string[]; config: string });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].config, `header = "Authorization: Basic ${Buffer.from(`x-access-token:${secret}`).toString('base64')}"\n`);
  assert.equal(calls[1].config, 'header = "Authorization: Bearer registry-token"\n');
  for (const call of calls) {
    assert.equal(call.args[0], '--disable');
    assert.equal(call.args[call.args.indexOf('--max-time') + 1], '15');
    assert.equal(call.args[call.args.indexOf('--config') + 1], '-');
    assert.doesNotMatch(call.args.join(' '), /quoted-secret|registry-token|Authorization:/);
    assert.equal(call.config.trim().split('\n').length, 1);
  }
});

test('GHCR authorization maps forbidden and expired responses without exposing credentials', () => {
  for (const [status, expected] of [[401, 'expired'], [403, 'forbidden'], [404, 'forbidden']] as const) {
    let call = 0;
    const result = verifyGithubPackagesAccess({
      ...input,
      env: { OPL_GITHUB_PACKAGES_TOKEN: 'test-secret' },
      commandRunner() {
        call += 1;
        return { status: call === 1 ? 200 : status, stdout: Buffer.from(call === 1 ? '{"token":"registry-token"}' : ''), stderr: '', error: null };
      },
    });
    assert.equal(result.status, expected);
    assert.equal(result.discover_allowed, false);
    assert.equal(result.download_allowed, false);
    assert.equal(result.reason, expected === 'expired' ? 'package_access_credential_expired' : 'package_access_forbidden');
  }
});

test('credential bridge returns an opaque provider handle and never logs token', () => {
  const credential = credentialForGithubPackages({ OPL_GITHUB_PACKAGES_TOKEN: 'test-secret' }, 'env:OPL_GITHUB_PACKAGES_TOKEN');
  assert.deepEqual(credential && { provider_id: credential.provider_id, credential_handle: credential.credential_handle, username: credential.username }, {
    provider_id: 'github_packages',
    credential_handle: 'env:OPL_GITHUB_PACKAGES_TOKEN',
    username: 'x-access-token',
  });
});

test('credential bridge requires explicit provider ownership without legacy fallback', () => {
  assert.equal(credentialForGithubPackages({ OPL_GITHUB_PACKAGES_TOKEN: 'secret' }, null), null);
  assert.equal(credentialForGithubPackages({ OPL_GITHUB_PACKAGES_TOKEN: 'secret' }), null);
  assert.equal(credentialForGithubPackages({ OPL_GITHUB_TOKEN: 'legacy' }, 'env:OPL_GITHUB_PACKAGES_TOKEN'), null);
  assert.equal(credentialForGithubPackages({ OPL_GITHUB_TOKEN: 'legacy' }), null);
});

test('native helper selection cannot fall through to an unselected credential owner', { skip: process.platform === 'win32' }, t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-registry-provider-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const bin = path.join(root, 'bin');
  const config = path.join(root, 'docker');
  const calls = path.join(root, 'calls');
  fs.mkdirSync(bin);
  fs.mkdirSync(config);
  fs.writeFileSync(path.join(config, 'config.json'), JSON.stringify({ credHelpers: { 'ghcr.io': 'fixture' } }));
  fs.writeFileSync(path.join(bin, 'docker-credential-fixture'), `#!/bin/sh
printf 'docker\n' >> "$FIXTURE_CALLS"
if [ "$FIXTURE_DOCKER_FAIL" = 1 ]; then exit 1; fi
printf '%s' '{"Username":"docker-user","Secret":"docker-secret"}'
`, { mode: 0o700 });
  fs.writeFileSync(path.join(bin, 'gh'), `#!/bin/sh
printf 'gh\n' >> "$FIXTURE_CALLS"
if [ "$FIXTURE_GH_FAIL" = 1 ]; then exit 1; fi
printf '%s' 'gh-secret'
`, { mode: 0o700 });
  const env: NodeJS.ProcessEnv = {
    PATH: bin, HOME: root, DOCKER_CONFIG: config, FIXTURE_CALLS: calls,
    OPL_GITHUB_PACKAGES_TOKEN: 'unselected-env-secret', OPL_GITHUB_TOKEN: 'unselected-legacy-secret',
  };
  for (const [handle, expectedToken, expectedCalls] of [
    ['provider:github_packages:ghcr', 'docker-secret', 'docker\n'],
    ['provider:github_packages:docker', 'docker-secret', 'docker\n'],
    ['provider:github_packages:gh-cli', 'gh-secret', 'gh\n'],
    ['env:OPL_GITHUB_PACKAGES_TOKEN', 'unselected-env-secret', ''],
  ]) {
    fs.writeFileSync(calls, '');
    const result = credentialForGithubPackages(env, handle);
    assert.equal(result?.token, expectedToken);
    assert.equal(result?.credential_handle, handle);
    assert.equal(fs.readFileSync(calls, 'utf8'), expectedCalls);
  }
  fs.writeFileSync(calls, '');
  assert.equal(credentialForGithubPackages({ ...env, FIXTURE_DOCKER_FAIL: '1' }, 'provider:github_packages:docker'), null);
  assert.equal(fs.readFileSync(calls, 'utf8'), 'docker\n');
  fs.writeFileSync(calls, '');
  assert.equal(credentialForGithubPackages({ ...env, FIXTURE_GH_FAIL: '1' }, 'provider:github_packages:gh-cli'), null);
  assert.equal(fs.readFileSync(calls, 'utf8'), 'gh\n');
  fs.writeFileSync(calls, '');
  const automatic = credentialForGithubPackages({ ...env, FIXTURE_DOCKER_FAIL: '1' }, 'provider:github_packages:ghcr');
  assert.equal(automatic?.token, 'gh-secret');
  assert.equal(automatic?.credential_handle, 'provider:github_packages:ghcr');
  assert.equal(fs.readFileSync(calls, 'utf8'), 'docker\ngh\n');
  for (const handle of [null, undefined, 'provider:foreign:ghcr', 'provider:github_packages:unsupported', 'env:OPL_GITHUB_TOKEN']) {
    fs.writeFileSync(calls, '');
    assert.equal(credentialForGithubPackages(env, handle), null);
    assert.equal(fs.readFileSync(calls, 'utf8'), '');
  }
});
