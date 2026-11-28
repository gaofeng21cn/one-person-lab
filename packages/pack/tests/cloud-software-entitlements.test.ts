import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { openSqliteStore, resolveStatePaths } from '@opl/core';
import {
  OPL_CLOUD_DEFAULT_ORIGIN,
  OPL_CLOUD_SOFTWARE_SOURCE_ID,
  buildPackage,
  clearCachedCloudSoftwareEntitlements,
  configurePrivatePackageSource,
  createOfficialPackageResolver,
  createPackageSourceArchive,
  downloadCloudEntitledPackageArchive,
  fetchCloudSoftwareEntitlements,
  initializePrivatePackageSourceStore,
  readCachedCloudSoftwareEntitlements,
  resolveOplCloudOrigin,
  writeCachedCloudSoftwareEntitlements,
} from '../src/index.ts';

function buildFixtureArchive(rootDir: string, packageId: string, version: string) {
  const pkgDir = path.join(rootDir, `src-${packageId}`);
  const archivePath = path.join(rootDir, `${packageId}-${version}.tar.gz`);
  fs.mkdirSync(pkgDir, { recursive: true });
  const text = { 'en-US': packageId, 'zh-CN': packageId };
  fs.writeFileSync(path.join(pkgDir, 'opl-package.json'), JSON.stringify({
    schema_version: 'opl.package.v2',
    identity: { id: packageId, version, intent: 'agent', publisher: 'OPL', name: text, summary: text },
  }));
  const commit = 'a'.repeat(40);
  const { digest: contentDigest } = buildPackage(pkgDir, { gitCommit: commit });
  const archiveDigest = createPackageSourceArchive(pkgDir, archivePath, ['opl-package.json', 'opl-release.lock.json']);
  return { archivePath, archiveBytes: fs.readFileSync(archivePath), archiveDigest, contentDigest, commit };
}

test('resolveOplCloudOrigin validates HTTPS in production and allows loopback HTTP only in test', () => {
  assert.equal(resolveOplCloudOrigin({}), OPL_CLOUD_DEFAULT_ORIGIN);
  assert.equal(resolveOplCloudOrigin({ OPL_CLOUD_BASE_URL: 'https://cloud.example.com/' }), 'https://cloud.example.com');
  assert.equal(
    resolveOplCloudOrigin({ NODE_ENV: 'test', OPL_CLOUD_BASE_URL: 'http://127.0.0.1:8787' }),
    'http://127.0.0.1:8787',
  );
  assert.throws(() => resolveOplCloudOrigin({ NODE_ENV: 'production', OPL_CLOUD_BASE_URL: 'http://127.0.0.1:8787' }), /HTTPS/);
  assert.throws(() => resolveOplCloudOrigin({ NODE_ENV: 'test', OPL_CLOUD_BASE_URL: 'https://user:pass@cloud.example.com' }), /credentials/);
  assert.throws(() => resolveOplCloudOrigin({ NODE_ENV: 'test', OPL_CLOUD_BASE_URL: 'https://cloud.example.com/nested' }), /path/);
});

test('fetchCloudSoftwareEntitlements normalizes schemas, filters expired rows, and maps HTTP statuses', async () => {
  const now = () => '2026-11-28T10:00:00Z';
  const authHeaders: string[] = [];
  const res = await fetchCloudSoftwareEntitlements({
    accessToken: 'gw-access-token',
    cloudOrigin: 'https://cloud.example.com',
    nowIso: now,
    fetchImpl: async (url, init) => {
      assert.equal(String(url), 'https://cloud.example.com/api/v2/software/entitlements');
      assert.equal(init?.redirect, 'error');
      authHeaders.push(new Headers(init?.headers).get('authorization') ?? '');
      return Response.json({
        entitlements: [
          { packageId: 'occ', enabled: true, selectedVersion: '1.2.0', sha256: 'sha256:' + '1'.repeat(64), expiresAt: '2026-12-01T00:00:00Z', displayName: 'OCC' },
          { package_id: 'expired-pkg', enabled: true, selected_version: '1.0.0', expires_at: '2026-11-27T00:00:00Z' },
          { package_id: 'disabled-pkg', enabled: false, selected_version: '1.0.0' },
          { package_id: 'bad id!', enabled: true },
        ],
      });
    },
  });
  assert.deepEqual(authHeaders, ['Bearer gw-access-token']);
  assert.equal(res.status, 'authorized');
  assert.equal(res.entitlements.length, 1);
  assert.equal(res.entitlements[0]?.package_id, 'occ');
  assert.equal(res.entitlements[0]?.selected_version, '1.2.0');

  const statuses: Array<[number, string]> = [[401, 'expired'], [403, 'forbidden'], [503, 'unknown']];
  for (const [httpStatus, expected] of statuses) {
    const out = await fetchCloudSoftwareEntitlements({
      accessToken: 'gw-access-token',
      cloudOrigin: 'https://cloud.example.com',
      nowIso: now,
      fetchImpl: async () => new Response('', { status: httpStatus }),
    });
    assert.equal(out.status, expected);
    assert.deepEqual(out.entitlements, []);
  }
});

test('downloadCloudEntitledPackageArchive supports Stage 1 streaming, Stage 2 presigned URL, and fails closed on digest mismatch', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-cloud-dl-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const cacheRoot = path.join(root, 'cache');
  const fixture = buildFixtureArchive(root, 'occ', '2.0.0');

  // Stage 1 direct binary stream
  const stage1Path = await downloadCloudEntitledPackageArchive({
    packageId: 'occ',
    accessToken: 'gw-access',
    cacheRoot,
    expectedDigest: fixture.archiveDigest,
    cloudOrigin: 'https://cloud.example.com',
    fetchImpl: async (url, init) => {
      assert.equal(String(url), 'https://cloud.example.com/api/v2/software/packages/occ/download');
      assert.equal(init?.method, 'POST');
      assert.equal(init?.body, '{}');
      return new Response(fixture.archiveBytes, {
        status: 200,
        headers: {
          'content-type': 'application/gzip',
          'x-opl-artifact-sha256': fixture.archiveDigest,
        },
      });
    },
  });
  assert.equal(fs.readFileSync(stage1Path).equals(fixture.archiveBytes), true);

  // Stage 1 digest mismatch rejects and leaves no bad artifact at target digest
  await assert.rejects(
    downloadCloudEntitledPackageArchive({
      packageId: 'occ',
      accessToken: 'gw-access',
      cacheRoot,
      expectedDigest: 'sha256:' + 'f'.repeat(64),
      cloudOrigin: 'https://cloud.example.com',
      fetchImpl: async () => new Response(fixture.archiveBytes, { status: 200, headers: { 'content-type': 'application/gzip' } }),
    }),
    /digest mismatch/i,
  );

  // Stage 2 presigned download URL without Authorization header forwarded
  const stage2Path = await downloadCloudEntitledPackageArchive({
    packageId: 'occ',
    accessToken: 'gw-access',
    cacheRoot: path.join(root, 'cache-s2'),
    expectedDigest: fixture.archiveDigest,
    cloudOrigin: 'https://cloud.example.com',
    fetchImpl: async (url, init) => {
      if (String(url).startsWith('https://cloud.example.com/')) {
        return Response.json({ download_url: 'https://cos.example.com/occ.tar.gz?sig=1', sha256: fixture.archiveDigest });
      }
      assert.equal(String(url), 'https://cos.example.com/occ.tar.gz?sig=1');
      assert.equal(new Headers(init?.headers).get('authorization'), null);
      return new Response(fixture.archiveBytes, { status: 200, headers: { 'content-type': 'application/gzip' } });
    },
  });
  assert.equal(fs.readFileSync(stage2Path).equals(fixture.archiveBytes), true);

  // 403 maps to package_not_entitled
  await assert.rejects(
    downloadCloudEntitledPackageArchive({
      packageId: 'occ',
      accessToken: 'gw-access',
      cacheRoot,
      cloudOrigin: 'https://cloud.example.com',
      fetchImpl: async () => new Response('', { status: 403 }),
    }),
    (err: Error & { details?: Record<string, unknown> }) => err.details?.reason === 'package_not_entitled',
  );
});

test('SQLite Cloud entitlement cache isolates by account_user_id and clears on disconnect', () => {
  const db = openSqliteStore(':memory:');
  try {
    assert.equal(readCachedCloudSoftwareEntitlements(db, '6'), null);
    writeCachedCloudSoftwareEntitlements(db, '6', {
      status: 'authorized',
      verification_reason: 'cloud_gateway_entitlements_verified',
      checked_at: '2026-11-28T10:00:00Z',
      entitlements: [{ package_id: 'occ', enabled: true, selected_version: '1.0.0' }],
    });
    assert.equal(readCachedCloudSoftwareEntitlements(db, '6')?.entitlements[0]?.package_id, 'occ');
    assert.equal(readCachedCloudSoftwareEntitlements(db, '43'), null);
    assert.equal(readCachedCloudSoftwareEntitlements(db, null), null);
    clearCachedCloudSoftwareEntitlements(db);
    assert.equal(readCachedCloudSoftwareEntitlements(db, '6'), null);
  } finally {
    db.close();
  }
});

test('createOfficialPackageResolver resolves authorized_only packages via Cloud download, supports unlisted entries, and preserves public zero-auth', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-cloud-resolver-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const cacheRoot = path.join(root, 'cache');
  const fixture = buildFixtureArchive(root, 'occ', '1.5.0');
  const payloadBytes = JSON.stringify({
    package_format: 'v2',
    package_id: 'occ',
    package_version: '1.5.0',
    source_commit: fixture.commit,
    source_repo: 'https://github.com/gaofeng21cn/occ.git',
    archive_sha256: fixture.archiveDigest,
    content_lock: { digest: fixture.contentDigest },
  });
  const payloadSha = 'sha256:' + createHash('sha256').update(payloadBytes).digest('hex');
  const catalogIndex = {
    schema_version: 'opl_software_catalog_index.v1',
    catalog_id: 'public-registry:opl',
    packages: [{
      package_id: 'occ',
      visibility: 'authorized_only',
      manifest: {
        package_id: 'occ',
        source_repo: 'https://github.com/gaofeng21cn/occ.git',
        codex_surface: { configured_codex_plugin_carrier: { publication_ref: 'ghcr.io/gaofeng21cn/one-person-lab-private-packages/occ:latest-stable' } },
        v2_release: {
          version: '1.5.0',
          source_commit: fixture.commit,
          payload_manifest_ref: 'payloads/occ-1.5.0.json',
          payload_sha256: payloadSha,
        },
      },
    }],
  };

  let cloudCalls = 0;
  const resolveCloud = createOfficialPackageResolver({
    runtimeRoot: null,
    cacheRoot,
    fetchImpl: async url => {
      if (String(url).endsWith('/catalog-index.json')) return Response.json(catalogIndex);
      if (String(url).endsWith('/payloads/occ-1.5.0.json')) return new Response(payloadBytes);
      assert.fail(`GHCR must not be called when Cloud archive download succeeds: ${String(url)}`);
    },
    downloadEntitledArchive: async ({ packageId, expectedDigest, cacheRoot: dir }) => {
      cloudCalls += 1;
      assert.equal(packageId, 'occ');
      assert.equal(expectedDigest, fixture.archiveDigest);
      const cached = path.join(dir, 'occ-stage.tar.gz');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(cached, fixture.archiveBytes);
      return cached;
    },
  });
  const staged = await resolveCloud('occ');
  try {
    assert.equal(cloudCalls, 1);
    assert.equal(staged.manifest.identity.id, 'occ');
    assert.equal(staged.manifest.identity.version, '1.5.0');
  } finally {
    staged.dispose();
  }

  // Unlisted Cloud-entitled package installs without being present in public catalog
  const unlisted = buildFixtureArchive(root, 'unlisted-pro', '0.9.0');
  const resolveUnlisted = createOfficialPackageResolver({
    runtimeRoot: null,
    cacheRoot,
    fetchImpl: async url => {
      if (String(url).endsWith('/catalog-index.json')) return Response.json({ ...catalogIndex, packages: [] });
      assert.fail(`Unexpected fetch: ${String(url)}`);
    },
    downloadEntitledArchive: async ({ packageId, cacheRoot: dir }) => {
      assert.equal(packageId, 'unlisted-pro');
      const cached = path.join(dir, 'unlisted.tar.gz');
      fs.writeFileSync(cached, unlisted.archiveBytes);
      return cached;
    },
  });
  const stagedUnlisted = await resolveUnlisted('unlisted-pro');
  try {
    assert.equal(stagedUnlisted.manifest.identity.id, 'unlisted-pro');
    assert.equal(stagedUnlisted.manifest.identity.version, '0.9.0');
  } finally {
    stagedUnlisted.dispose();
  }

  // When developer github_packages fallback is explicitly configured and Cloud returns null, GHCR path runs cleanly
  const db = openSqliteStore(':memory:');
  t.after(() => db.close());
  initializePrivatePackageSourceStore(db, resolveStatePaths({ stateDir: root }));
  configurePrivatePackageSource(db, {
    sourceId: 'github-packages:gaofeng21cn',
    credentialHandle: 'env:OPL_GITHUB_PACKAGES_TOKEN',
    enabled: true,
  });
  let ghcrTried = false;
  const fallbackResolver = createOfficialPackageResolver({
    runtimeRoot: null,
    db,
    cacheRoot,
    resolveAuthHeader: sourceId => (sourceId === 'github-packages:gaofeng21cn' ? 'Basic dGVzdDp0b2tlbg==' : null),
    downloadEntitledArchive: async () => null,
    fetchImpl: async url => {
      const address = new URL(String(url));
      if (address.pathname.endsWith('/catalog-index.json')) return Response.json(catalogIndex);
      if (address.pathname.endsWith('/payloads/occ-1.5.0.json')) return new Response(payloadBytes);
      if (address.pathname === '/token') return Response.json({ token: 'gh-tok' });
      ghcrTried = true;
      return new Response('', { status: 404 });
    },
  });
  await assert.rejects(fallbackResolver('occ'), /HTTP 404/);
  assert.equal(ghcrTried, true);
  assert.equal(OPL_CLOUD_SOFTWARE_SOURCE_ID, 'opl-cloud:default');
});
