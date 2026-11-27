import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const publication = 'ghcr.io/example/one-person-lab-private-packages/sample:latest-stable';
const envHandle = 'env:OPL_GITHUB_PACKAGES_TOKEN';
const adapter = new URL('../scripts/private-package-source-access.mjs', import.meta.url).href;

function sandbox(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-publication-source-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const isolated = Object.fromEntries(['bin', 'registry', 'docker', 'state'].map(name => {
    const directory = path.join(root, name);
    fs.mkdirSync(directory, { mode: 0o700 });
    return [name, directory];
  }));
  const storeFile = path.join(isolated.state, 'software-sources.json');
  const output = path.join(isolated.registry, 'config.json');
  const calls = path.join(root, 'calls');
  const env = {
    PATH: isolated.bin, HOME: root, OPL_STATE_DIR: isolated.state, DOCKER_CONFIG: isolated.docker,
    FIXTURE_CALLS: calls, OPL_GITHUB_PACKAGES_TOKEN: 'fixture-env-secret',
    ...(process.platform === 'win32' ? { SystemRoot: process.env.SystemRoot } : {}),
  };
  const setSource = (handle, fields = {}, copies = 1) => {
    const source = { source_id: 'github-packages:example', enabled: true, credential_handle: handle, ...fields };
    fs.writeFileSync(storeFile, JSON.stringify({ surface_kind: 'opl_software_sources_store.v1', sources: Array(copies).fill(source) }));
  };
  const run = (publicationRef = publication, writeConfig = false, overrides = {}) => {
    const child = spawnSync(process.execPath, ['--input-type=module', '-e',
      `import { preparePrivatePackageRegistryAccess } from ${JSON.stringify(adapter)};
       console.log(preparePrivatePackageRegistryAccess(...JSON.parse(process.argv[1])));`,
      JSON.stringify(writeConfig ? [publicationRef, isolated.registry] : [publicationRef]),
    ], { env: { ...env, ...overrides }, encoding: 'utf8', timeout: 10000 });
    assert.doesNotMatch(child.stdout + child.stderr, /fixture-.*-secret|YWNjb3VudDpmaXh0dXJl/);
    assert.equal(child.status, 0, child.stderr);
    return child.stdout.trim();
  };
  return { ...isolated, output, storeFile, calls, setSource, run };
}

test('an enabled namespace grants only its selected environment handle to the short-lived GHCR config', t => {
  const fixture = sandbox(t);
  assert.equal(fixture.run(), 'source_not_configured');
  fixture.setSource(envHandle);
  assert.equal(fixture.run(), 'ready');
  assert.equal(fs.existsSync(fixture.output), false);
  assert.equal(fixture.run(publication, true, { OPL_GITHUB_USERNAME: 'account' }), 'ready');
  assert.deepEqual(JSON.parse(fs.readFileSync(fixture.output, 'utf8')), {
    auths: { 'ghcr.io': { auth: Buffer.from('account:fixture-env-secret').toString('base64') } },
  });
  if (process.platform !== 'win32') assert.equal(fs.statSync(fixture.output).mode & 0o777, 0o600);
  assert.equal(fixture.run(publication, false, { OPL_GITHUB_PACKAGES_TOKEN: '', GH_TOKEN: 'fixture-other-secret' }), 'credential_unavailable');
});

test('disabled, foreign, duplicate, and unconfigured references cannot use local credentials', t => {
  const fixture = sandbox(t);
  fixture.setSource(envHandle, { enabled: false });
  assert.equal(fixture.run(publication, true), 'source_not_configured');
  fixture.setSource(envHandle, { provider_id: 'foreign' });
  assert.equal(fixture.run(publication, true), 'source_not_configured');
  fixture.setSource(envHandle, {}, 2);
  assert.equal(fixture.run(publication, true), 'source_not_configured');
  fixture.setSource('env:GH_TOKEN');
  assert.equal(fixture.run(publication, true), 'source_not_configured');
  fixture.setSource(envHandle);
  for (const ref of [
    publication.replace('example/', 'other/'), publication.replace('ghcr.io', 'registry.example'),
    publication.replace('private-packages', 'packages'), publication.replace(':latest-stable', ':other'),
  ]) assert.equal(fixture.run(ref, true), 'source_not_configured');
  assert.equal(fs.existsSync(fixture.output), false);
});

test('only the configured native helper runs, including the GHCR provider ordered fallback', { skip: process.platform === 'win32' }, t => {
  const fixture = sandbox(t);
  fs.writeFileSync(path.join(fixture.docker, 'config.json'), JSON.stringify({ credHelpers: { 'ghcr.io': 'fixture' } }));
  fs.writeFileSync(path.join(fixture.bin, 'docker-credential-fixture'), `#!/bin/sh
echo docker >> "$FIXTURE_CALLS"
read -r registry
[ "$1" = get ] && [ "$registry" = ghcr.io ] && [ "$FAIL_DOCKER" != 1 ] || exit 1
echo '{"Username":"docker-user","Secret":"fixture-docker-secret"}'
`, { mode: 0o700 });
  fs.writeFileSync(path.join(fixture.bin, 'gh'), `#!/bin/sh
echo gh >> "$FIXTURE_CALLS"
echo 'fixture-diagnostic-secret' >&2
[ "$*" = 'auth token --hostname github.com' ] && [ "$FAIL_GH" != 1 ] || exit 1
echo 'fixture-gh-secret'
`, { mode: 0o700 });
  for (const [provider, failures, status, expectedCalls] of [
    ['docker', {}, 'ready', 'docker'],
    ['docker', { FAIL_DOCKER: '1' }, 'credential_unavailable', 'docker'],
    ['gh-cli', {}, 'ready', 'gh'],
    ['gh-cli', { FAIL_GH: '1' }, 'credential_unavailable', 'gh'],
    ['ghcr', {}, 'ready', 'docker'],
    ['ghcr', { FAIL_DOCKER: '1' }, 'ready', 'docker\ngh'],
    ['ghcr', { FAIL_DOCKER: '1', FAIL_GH: '1' }, 'credential_unavailable', 'docker\ngh'],
  ]) {
    fixture.setSource(`provider:github_packages:${provider}`);
    fs.writeFileSync(fixture.calls, '');
    assert.equal(fixture.run(publication, false, failures), status);
    assert.equal(fs.readFileSync(fixture.calls, 'utf8').trim(), expectedCalls);
  }
  fixture.setSource('provider:github_packages:gh-cli', { enabled: false });
  fs.writeFileSync(fixture.calls, '');
  assert.equal(fixture.run(), 'source_not_configured');
  assert.equal(fs.readFileSync(fixture.calls, 'utf8'), '');
});
