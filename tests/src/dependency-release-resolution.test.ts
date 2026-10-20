import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { compareDependencyVersions, resolveDependencyRelease, resolveDependencyReleases } from '../../src/adapters/integration/dependency-release-resolution.ts';
import { configuredLatestVersion } from '../../src/adapters/integration/install-companions-parts/tool-version.ts';

test('dependency version comparison preserves a newer installed release', () => {
  assert.equal(compareDependencyVersions('0.6.6', '0.5.4'), 1);
  assert.equal(compareDependencyVersions('v1.9.1', '1.9.1'), 0);
});

test('runtime ignores fixed latest-version environment overrides', () => {
  const previousOverride = process.env.OPL_DEPENDENCY_TEST_OVERRIDE;
  const previousOfficeCli = process.env.OPL_OFFICECLI_LATEST_VERSION;
  try {
    process.env.OPL_DEPENDENCY_TEST_OVERRIDE = '0';
    process.env.OPL_OFFICECLI_LATEST_VERSION = '1.0.100';
    assert.equal(configuredLatestVersion('officecli'), null);
  } finally {
    if (previousOverride === undefined) delete process.env.OPL_DEPENDENCY_TEST_OVERRIDE;
    else process.env.OPL_DEPENDENCY_TEST_OVERRIDE = previousOverride;
    if (previousOfficeCli === undefined) delete process.env.OPL_OFFICECLI_LATEST_VERSION;
    else process.env.OPL_OFFICECLI_LATEST_VERSION = previousOfficeCli;
  }
});

test('manifest resolution uses the official platform archive and digest', async () => {
  const manifest = { version: '0.6.6', app: { url: 'https://cdn.kimi.com/kimi-computer-use/0.6.6/KimiCU.app.zip', sha256: '42cb1b1dcf591df766111e7cb6d075451f0caf0b94f0cad923505fd0d4bf3886', team_id: '2J9472RW75' } };
  const policy = { schema_version: 'test', sources: { 'kimi-cu': { kind: 'json-manifest' as const, url: 'https://cdn.kimi.com/kimi-computer-use/latest/version.json', platforms: { 'darwin-arm64': 'app' } } } };
  const fetch: typeof globalThis.fetch = async () => new Response(JSON.stringify(manifest), { headers: { 'content-type': 'application/json' } });
  const resolved = await resolveDependencyRelease('kimi-cu', { policy, platform: 'darwin', architecture: 'arm64', fetch, verifyArchive: false });
  assert.equal(resolved.version, '0.6.6');
  assert.equal(resolved.archive_sha256, manifest.app.sha256);
  assert.equal(resolved.archive_url, manifest.app.url);
});

test('batch resolution rejects duplicate identities and freezes each result', async () => {
  await assert.rejects(() => resolveDependencyReleases(['x', 'x'], { policy: { schema_version: 'test', sources: {} } }), /only once/);
  const policy = { schema_version: 'test', sources: { x: { kind: 'json-manifest' as const, url: 'https://example.test/version.json', platforms: { 'darwin-arm64': 'app' } } } };
  const fetch = async () => new Response(JSON.stringify({ version: '1.0.0', app: { url: 'https://example.test/1.0.0/a.zip', sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' } }));
  const [result] = await resolveDependencyReleases(['x'], { policy, platform: 'darwin', architecture: 'arm64', fetch, verifyArchive: false });
  assert.equal(Object.isFrozen(result), true);
});

test('Full source identity follows the exact release tag rather than target_commitish', async () => {
  const policy = { schema_version: 'test', sources: { officecli: { kind: 'github-release' as const, repository: 'iOfficeAI/OfficeCLI', source_commit_required: true, asset: 'officecli-mac-arm64' } } };
  const endpoints: string[] = [];
  const githubApi = async (endpoint: string) => {
    endpoints.push(endpoint);
    return endpoint.endsWith('releases/latest')
      ? { tag_name: 'v1.0.155', target_commitish: 'main', assets: [{ name: 'officecli-mac-arm64', browser_download_url: 'https://github.com/iOfficeAI/OfficeCLI/releases/download/v1.0.155/officecli-mac-arm64', digest: 'sha256:' + 'a'.repeat(64), size: 1 }] }
      : { sha: 'b'.repeat(40) };
  };
  const result = await resolveDependencyRelease('officecli', { policy, platform: 'darwin', architecture: 'arm64', githubApi, verifyArchive: false });
  assert.equal(result.resolved_commit, 'b'.repeat(40));
  assert.deepEqual(endpoints, ['repos/iOfficeAI/OfficeCLI/releases/latest', 'repos/iOfficeAI/OfficeCLI/commits/v1.0.155']);
});

test('npm Full source uses the published gitHead and rejects a mismatched repository commit', async () => {
  const bytes = new TextEncoder().encode('verified npm fixture');
  const integrity = 'sha512-' + createHash('sha512').update(bytes).digest('base64');
  const policy = { schema_version: 'test', sources: { mineru: { kind: 'npm' as const, package: 'mineru-open-api', repository: 'opendatalab/MinerU-Ecosystem', source_commit_required: true } } };
  const fetch = async (url: any) => String(url).endsWith('/latest')
    ? new Response(JSON.stringify({ version: '0.5.9', gitHead: 'c'.repeat(40), dist: { tarball: 'https://registry.npmjs.org/mineru-open-api/-/mineru-open-api-0.5.9.tgz', integrity } }))
    : new Response(bytes);
  const options = { policy, fetch, githubApi: async () => ({ sha: 'c'.repeat(40) }) };
  assert.equal((await resolveDependencyRelease('mineru', options)).resolved_commit, 'c'.repeat(40));
  await assert.rejects(() => resolveDependencyRelease('mineru', { ...options, githubApi: async () => ({ sha: 'd'.repeat(40) }) }), /configured repository/);
});
