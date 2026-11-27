import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { openSqliteStore, resolveStatePaths } from '@opl/core';
import { initializePrivatePackageSourceStore } from '../src/distribution/private-package-source-store.ts';
import {
  officialPackageInstallSource,
  officialPackagePrivateSourceId,
  readOfficialPackageCatalog,
  readCachedOfficialPackageCatalog,
  readOfficialV2Source,
  type OfficialPackageCatalogEntry,
} from '../src/distribution/official-package-catalog.ts';
import { buildPackage, createPackageSourceArchive } from '../src/index.ts';
import { resolveOciArtifact } from '../src/distribution/registry-client.ts';
import { createOfficialPackageResolver } from '../src/distribution/official-package-source.ts';
import { configurePrivatePackageSource } from '../src/distribution/private-package-sources.ts';
import type { PackageOperationProgress } from '../src/types.ts';

const packageId = 'sample-agent';
const repository = 'https://github.com/gaofeng21cn/example-repo.git';
const commit = 'a'.repeat(40);
const publication = 'ghcr.io/gaofeng21cn/one-person-lab-packages/sample-agent:latest-stable';
const entry: OfficialPackageCatalogEntry = {
  package_id: packageId,
  visibility: 'public',
  version: '1.2.3',
  manifest: {
    package_id: packageId, source_repo: repository, version: '1.2.3',
    codex_surface: { carrier_source_commit: commit, configured_codex_plugin_carrier: { publication_ref: publication } },
  },
  payload: { package_id: packageId, source_repo: repository, source_commit: commit, package_version: '1.2.3' },
};
const index = { schema_version: 'opl_software_catalog_index.v1', catalog_id: 'public-registry:opl', packages: [entry] };

test('online catalog selects the registered public OCI publication and rejects an unrelated target', async () => {
  const entries = await readOfficialPackageCatalog({
    runtimeRoot: null,
    fetchImpl: async url => {
      assert.equal(url, 'https://raw.githubusercontent.com/gaofeng21cn/opl-catalog/main/catalog-index.json');
      return Response.json(index);
    },
  });
  assert.deepEqual(officialPackageInstallSource(entries.get(packageId)!, null), {
    kind: 'oci', package_id: packageId, ref: publication, version: '1.2.3',
  });
  assert.throws(() => officialPackageInstallSource({ ...entry, version: undefined }, null), /no selected Catalog version/);
  assert.throws(() => officialPackageInstallSource({ ...entry, version: 'latest-stable' }, null), /no selected Catalog version/);
  assert.throws(() => officialPackageInstallSource({ ...entry, visibility: 'authorized_only' }, null), /public Package source unavailable/);
  const wrongRef = { ...entry.manifest, codex_surface: { configured_codex_plugin_carrier: { publication_ref: publication.replace(packageId, 'another') } } };
  assert.throws(() => officialPackageInstallSource({ ...entry, manifest: wrongRef }, null), /outside its registered Package repository/);
});

test('a cached v1 catalog keeps downloading its numbered artifact after latest-stable moves', async () => {
  const source = officialPackageInstallSource(entry, null);
  const publishedDigest = 'sha256:' + 'a'.repeat(64);
  const newStableDigest = 'sha256:' + 'b'.repeat(64);
  const artifact = await resolveOciArtifact({
    ociRef: source.ref!,
    version: source.version,
    fetchImpl: async url => {
      if (url.startsWith('https://ghcr.io/token?')) return Response.json({ token: 'fixture-token' });
      const digest = url.endsWith('/manifests/1.2.3') ? publishedDigest : newStableDigest;
      return Response.json({ layers: [{
        mediaType: 'application/vnd.onepersonlab.package.source.v1+gzip', digest, size: 250,
      }] });
    },
  });
  assert.equal(artifact.reference, '1.2.3');
  assert.equal(artifact.digest, publishedDigest);
});

test('Full selects a commit-bound module offline and supports old capability seeds', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-full-seed-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (name: string, value: unknown) => {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value));
  };
  const module = 'modules/unrelated-directory-name';
  write('opl/catalog-seed/catalog-index.json', index);
  write(`${module}/opl-runtime-module.json`, { packaged_runtime: true, repo_name: 'example-repo', source_git: { head_sha: commit } });
  const catalog = await readOfficialPackageCatalog({
    env: { OPL_FULL_RUNTIME_HOME: root },
    fetchImpl: async () => { throw new Error('Catalog is offline'); },
  });
  const resolve = () => officialPackageInstallSource(catalog.get(packageId)!, root);
  const expected = { kind: 'local_dir', package_id: packageId, path: path.join(root, module) };
  assert.deepEqual(resolve(), expected);

  fs.unlinkSync(path.join(root, module, 'opl-runtime-module.json'));
  assert.throws(resolve, /0 matching modules/);
  const manifestPath = 'manifest/full-package-manifest.json';
  write(manifestPath, { resolved_refs: { capability_seed: { repository, resolved_commit: commit, runtime_module_relative_path: module } } });
  assert.deepEqual(resolve(), expected);
  const select = (sourceCommit: string, relative: string) => write(manifestPath, {
    runtime_assertions: { selected_package_set: { packages: [{ package_id: packageId, source_commit: sourceCommit, runtime_module_relative_path: relative }] } },
  });
  select(commit, module);
  assert.deepEqual(resolve(), expected);
  select('b'.repeat(40), module);
  assert.throws(resolve, /differs from its frozen catalog source/);
  select(commit, 'modules/../other');
  assert.throws(resolve, /Invalid Full Package path/);
});

test('selects a numbered v2 OCI tag and pins the archive using the immutable payload bytes', async () => {
  const version = '2.4.0';
  const archiveDigest = 'sha256:' + 'd'.repeat(64);
  const contentDigest = 'sha256:' + 'c'.repeat(64);
  const payload = {
    package_format: 'v2', package_id: packageId, package_version: version, source_commit: commit,
    source_repo: repository, archive_sha256: archiveDigest, content_lock: { digest: contentDigest },
  };
  const bytes = JSON.stringify(payload, null, 2) + '\n';
  const facet = {
    version, source_commit: commit, payload_manifest_ref: `payloads/${packageId}-${version}.json`,
    payload_sha256: 'sha256:' + createHash('sha256').update(bytes).digest('hex'),
  };
  const candidate = { ...entry, manifest: { ...entry.manifest, v2_release: facet } };
  const fetchImpl = async (url: RequestInfo | URL) => {
    assert.equal(url, 'https://raw.githubusercontent.com/gaofeng21cn/opl-catalog/main/packages/' + facet.payload_manifest_ref);
    return new Response(bytes);
  };
  assert.equal(officialPackageInstallSource(candidate, null).version, version);
  assert.deepEqual(await readOfficialV2Source(candidate, fetchImpl), { version, commit, archiveDigest, contentDigest });
  await assert.rejects(readOfficialV2Source(candidate, async () => Response.json(payload)), /payload bytes differ/);
  const mismatched = { ...candidate, manifest: { ...candidate.manifest, v2_release: { ...facet, source_commit: 'b'.repeat(40) } } };
  await assert.rejects(readOfficialV2Source(mismatched, fetchImpl), /does not match the selected release/);
  assert.throws(() => officialPackageInstallSource({
    ...candidate, manifest: { ...candidate.manifest, v2_release: { ...facet, payload_manifest_ref: '../../different.json' } },
  }, null), /Invalid Catalog v2 release/);
});

test('official resolver fails closed when the selected public v2 manifest is missing', async () => {
  const version = '2.4.0';
  const digest = 'sha256:' + 'c'.repeat(64);
  const bytes = JSON.stringify({
    package_format: 'v2', package_id: packageId, package_version: version, source_commit: commit,
    source_repo: repository, archive_sha256: digest, content_lock: { digest },
  });
  const candidate = {
    ...entry,
    manifest: {
      ...entry.manifest,
      v2_release: {
        version, source_commit: commit, payload_manifest_ref: `payloads/${packageId}-${version}.json`,
        payload_sha256: 'sha256:' + createHash('sha256').update(bytes).digest('hex'),
      },
    },
  };
  const missing = () => Response.json({ errors: [{ code: 'MANIFEST_UNKNOWN' }] }, { status: 404 });
  type ExpectedFailure = { message: string | RegExp };
  const cases: Array<{
    response?: () => Response;
    expected: ExpectedFailure;
    tokenStatus?: number;
    payloadStatus?: number;
    requests: string[];
  }> = [
    { response: missing, expected: { message: /manifest fetch failed with HTTP 404/ }, requests: [version] },
    { response: () => new Response('', { status: 404 }), expected: { message: /manifest fetch failed with HTTP 404/ }, requests: [version] },
    { response: () => Response.json({ errors: [{ code: 'DENIED' }] }, { status: 404 }), expected: { message: /manifest fetch failed with HTTP 404/ }, requests: [version] },
    { response: () => new Response('', { status: 403 }), expected: { message: /manifest fetch failed with HTTP 403/ }, requests: [version] },
    { response: () => new Response('', { status: 500 }), expected: { message: /manifest fetch failed with HTTP 500/ }, requests: [version] },
    { response: () => { throw new Error('Registry network failure'); }, expected: { message: /network failure/ }, requests: [version] },
    { tokenStatus: 404, expected: { message: /token request failed with HTTP 404/ }, requests: [] },
    { payloadStatus: 404, expected: { message: /Catalog v2 payload.*HTTP 404/ }, requests: [] },
    {
      response: () => Response.json({ layers: [{
        mediaType: 'application/vnd.onepersonlab.package.source.v2+gzip',
        digest: 'sha256:' + 'b'.repeat(64), size: 128,
      }] }),
      expected: { message: /OCI digest mismatch/ }, requests: [version],
    },
  ];
  for (const scenario of cases) {
    const requestedVersions: string[] = [];
    const resolve = createOfficialPackageResolver({
      runtimeRoot: null,
      fetchImpl: async url => {
        const address = new URL(String(url));
        if (address.pathname.endsWith('/catalog-index.json')) return Response.json({ ...index, packages: [candidate] });
        if (address.pathname.endsWith(`/${packageId}-${version}.json`)) return new Response(bytes, { status: scenario.payloadStatus });
        if (address.pathname === '/token') return Response.json({ token: 'fixture-token' }, { status: scenario.tokenStatus });
        const selected = address.pathname.split('/').pop()!;
        requestedVersions.push(selected);
        assert.equal(selected, version);
        return scenario.response!();
      },
    });
    await assert.rejects(resolve(packageId), scenario.expected);
    assert.deepEqual(requestedVersions, scenario.requests);
  }
});

test('authorized private v2 packages resolve with Basic auth header, reject unauthorized/offline/wrong-repo, and fail closed on missing manifests', async (t) => {
  const privatePkgId = 'private-agent';
  const privateRepo = 'https://github.com/gaofeng21cn/private-agent.git';
  const privatePub = `ghcr.io/gaofeng21cn/one-person-lab-private-packages/${privatePkgId}:latest-stable`;
  const v2Version = '2.1.0';
  const digest = 'sha256:' + 'e'.repeat(64);
  const payloadBytes = JSON.stringify({
    package_format: 'v2', package_id: privatePkgId, package_version: v2Version, source_commit: commit,
    source_repo: privateRepo, archive_sha256: digest, content_lock: { digest },
  });
  const privateEntry: OfficialPackageCatalogEntry = {
    package_id: privatePkgId,
    visibility: 'authorized_only',
    version: '1.2.3',
    manifest: {
      package_id: privatePkgId, source_repo: privateRepo, version: '1.2.3',
      codex_surface: { carrier_source_commit: commit, configured_codex_plugin_carrier: { publication_ref: privatePub } },
      v2_release: {
        version: v2Version, source_commit: commit, payload_manifest_ref: `payloads/${privatePkgId}-${v2Version}.json`,
        payload_sha256: 'sha256:' + createHash('sha256').update(payloadBytes).digest('hex'),
      },
    },
    payload: { package_id: privatePkgId, source_repo: privateRepo, source_commit: commit, package_version: '1.2.3' },
  };

  assert.equal(officialPackagePrivateSourceId(privateEntry), 'github-packages:gaofeng21cn');
  assert.equal(officialPackagePrivateSourceId(entry), null);
  assert.throws(() => officialPackageInstallSource(privateEntry, null), /public Package source unavailable/);
  assert.equal(officialPackageInstallSource(privateEntry, '/tmp/full-seed', { allowAuthorizedOnly: true }).ref, privatePub);
  assert.deepEqual(officialPackageInstallSource(privateEntry, null, { allowAuthorizedOnly: true }), {
    kind: 'oci', package_id: privatePkgId, ref: privatePub, version: v2Version,
  });
  const wrongPrivateRef = {
    ...privateEntry.manifest,
    codex_surface: { configured_codex_plugin_carrier: { publication_ref: `ghcr.io/gaofeng21cn/one-person-lab-packages/${privatePkgId}:latest-stable` } },
  };
  assert.throws(
    () => officialPackageInstallSource({ ...privateEntry, manifest: wrongPrivateRef }, null, { allowAuthorizedOnly: true }),
    /outside its registered Package repository/,
  );

  // Missing authorization fails closed before contacting registry
  const unauthorizedResolve = createOfficialPackageResolver({
    runtimeRoot: null,
    fetchImpl: async url => {
      if (String(url).endsWith('/catalog-index.json')) return Response.json({ ...index, packages: [privateEntry] });
      assert.fail(`Unauthorized request must not reach ${String(url)}`);
    },
  });
  await assert.rejects(unauthorizedResolve(privatePkgId), /requires an authorized 'github-packages:gaofeng21cn'/);

  // Configured env token passes Authorization: Basic to GHCR /token for only the selected tag
  const authState = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-priv-auth-ok-'));
  t.after(() => fs.rmSync(authState, { recursive: true, force: true }));
  const db = openSqliteStore(':memory:');
  t.after(() => db.close());
  initializePrivatePackageSourceStore(db, resolveStatePaths({ stateDir: authState }));
  configurePrivatePackageSource(db, {
    sourceId: 'github-packages:gaofeng21cn',
    credentialHandle: 'env:OPL_GITHUB_PACKAGES_TOKEN',
    enabled: true,
  });
  const prevToken = process.env.OPL_GITHUB_PACKAGES_TOKEN;
  const prevUser = process.env.OPL_GITHUB_USERNAME;
  process.env.OPL_GITHUB_PACKAGES_TOKEN = 'ghp_private_fixture_token';
  process.env.OPL_GITHUB_USERNAME = 'x-access-token';
  t.after(() => {
    if (prevToken === undefined) delete process.env.OPL_GITHUB_PACKAGES_TOKEN;
    else process.env.OPL_GITHUB_PACKAGES_TOKEN = prevToken;
    if (prevUser === undefined) delete process.env.OPL_GITHUB_USERNAME;
    else process.env.OPL_GITHUB_USERNAME = prevUser;
  });

  const expectedBasic = 'Basic ' + Buffer.from('x-access-token:ghp_private_fixture_token', 'utf8').toString('base64');
  const tokenHeaders: string[] = [];
  const manifestTags: string[] = [];
  const authorizedResolve = createOfficialPackageResolver({
    runtimeRoot: authState,
    db,
    fetchImpl: async (url, init) => {
      const address = new URL(String(url));
      if (address.pathname.endsWith('/catalog-index.json')) return Response.json({ ...index, packages: [privateEntry] });
      if (address.pathname.endsWith(`/${privatePkgId}-${v2Version}.json`)) return new Response(payloadBytes);
      if (address.pathname === '/token') {
        const hdr = new Headers(init?.headers).get('authorization') ?? '';
        tokenHeaders.push(hdr);
        assert.equal(hdr, expectedBasic);
        assert.match(address.searchParams.get('scope') ?? '', /one-person-lab-private-packages\/private-agent:pull/);
        return Response.json({ token: 'private-bearer-token' });
      }
      assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer private-bearer-token');
      const tag = address.pathname.split('/').pop()!;
      manifestTags.push(tag);
      if (tag === v2Version) return Response.json({ errors: [{ code: 'MANIFEST_UNKNOWN' }] }, { status: 404 });
      assert.fail(`Unexpected tag ${tag}`);
    },
  });
  await assert.rejects(authorizedResolve(privatePkgId), {
    code: 'PACK_DOWNLOAD_FAILED', message: /manifest fetch failed with HTTP 404/,
  });
  assert.deepEqual(tokenHeaders, [expectedBasic]);
  assert.deepEqual(manifestTags, [v2Version]);
});

test('Full merges the online selection, consumes matching locked bytes and survives an offline restart', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-catalog-cache-'));
  const module = path.join(root, 'modules', packageId);
  const seedPath = path.join(root, 'opl', 'catalog-seed');
  const dbFile = path.join(root, 'opl.db');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(module, { recursive: true });
  fs.mkdirSync(seedPath, { recursive: true });
  const text = { 'en-US': 'Sample', 'zh-CN': '样例' };
  fs.writeFileSync(path.join(module, 'opl-package.json'), JSON.stringify({
    schema_version: 'opl.package.v2',
    identity: { id: packageId, version: '1.2.3', intent: 'extension', publisher: 'OPL', name: text, summary: text },
  }));
  fs.writeFileSync(path.join(module, 'opl-runtime-module.json'), JSON.stringify({
    packaged_runtime: true, repo_name: 'example-repo', source_git: { head_sha: commit },
  }));
  const { digest } = buildPackage(module, { gitCommit: commit });
  const seed = { ...entry, payload: { ...entry.payload, content_lock: { digest } } };
  fs.writeFileSync(path.join(seedPath, 'catalog-index.json'), JSON.stringify({ ...index, packages: [seed] }));
  const onlineOnly = { ...entry, package_id: 'online-only' };
  const online = { ...index, packages: [entry, onlineOnly] };
  let requests = 0;
  const lookup = async (url: RequestInfo | URL) => {
    assert.match(String(url), /catalog-index\.json$/);
    requests += 1;
    return Response.json(online);
  };
  const db = openSqliteStore(dbFile);
  try {
    const opts = { db, runtimeRoot: root, fetchImpl: lookup, nowIso: () => '2026-11-27T01:00:00Z' };
    assert.ok((await readOfficialPackageCatalog(opts)).has('online-only'));
    const staged = await createOfficialPackageResolver(opts)(packageId);
    try { assert.equal(staged.manifest.identity.version, '1.2.3'); }
    finally { staged.dispose(); }
    assert.equal(requests, 2);

    const newer = { ...entry, version: '1.2.4' };
    fs.writeFileSync(path.join(module, 'opl-package.json'), JSON.stringify({
      schema_version: 'opl.package.v2',
      identity: { id: packageId, version: '1.2.4', intent: 'extension', publisher: 'OPL', name: text, summary: text },
    }));
    buildPackage(module, { gitCommit: commit });
    const blobFile = path.join(root, 'newer.tar.gz');
    const blobDigest = createPackageSourceArchive(module, blobFile,
      ['opl-package.json', 'opl-release.lock.json', 'opl-runtime-module.json']);
    const bytes = fs.readFileSync(blobFile);
    const manifestRequests: string[] = [];
    const options = {
      runtimeRoot: root,
      cacheRoot: path.join(root, 'download-cache'),
      fetchImpl: async (url: RequestInfo | URL) => {
        const address = new URL(String(url));
        if (address.pathname.endsWith('catalog-index.json')) return Response.json({ ...index, packages: [newer] });
        if (address.pathname === '/token') return Response.json({ token: 'fixture' });
        manifestRequests.push(address.pathname);
        return Response.json({ layers: [{ digest: blobDigest, size: bytes.length,
          mediaType: 'application/vnd.onepersonlab.package.source.v2+gzip' }] });
      },
    };
    let downloads = 0;
    const progress: PackageOperationProgress[] = [];
    const transport = {
      fetchRange: async () => assert.fail('Small source archive should use the sequential download path.'),
      fetchFull: async () => {
        downloads += 1;
        return { status: 200, bytes };
      },
    };
    try {
      for (const opId of ['install', 'repair']) {
        const result = await createOfficialPackageResolver(options)(packageId, {
          opId, transport, onProgress: row => progress.push(row),
        });
        try { assert.equal(result.manifest.identity.version, '1.2.4'); }
        finally { result.dispose(); }
      }
      assert.equal(downloads, 1);
      assert.equal(manifestRequests.length, 2);
      assert.ok(manifestRequests.every(request => request.endsWith('/manifests/1.2.4')));
      assert.ok(progress.some(row => row.stage === 'downloading' && row.bytes_done === bytes.length
        && row.bytes_total === bytes.length && row.eta_sec === 0));
      assert.ok(progress.some(row => row.cached_bytes === bytes.length));
    } finally {
      fs.writeFileSync(path.join(module, 'opl-package.json'), JSON.stringify({
        schema_version: 'opl.package.v2',
        identity: { id: packageId, version: '1.2.3', intent: 'extension', publisher: 'OPL', name: text, summary: text },
      }));
      buildPackage(module, { gitCommit: commit });
    }
  } finally {
    db.close();
  }

  const reopened = openSqliteStore(dbFile);
  try {
    const cached = readCachedOfficialPackageCatalog(reopened)!;
    assert.equal(cached.fetchedAt, '2026-11-27T01:00:00Z');
    assert.ok(cached.entries.has('online-only'));
    const offline = async () => { throw new Error('offline'); };
    const staged = await createOfficialPackageResolver({ db: reopened, runtimeRoot: root, fetchImpl: offline })(packageId);
    staged.dispose();
    fs.appendFileSync(path.join(module, 'opl-package.json'), '\n');
    await assert.rejects(createOfficialPackageResolver({ db: reopened, runtimeRoot: root, fetchImpl: offline })(packageId), /digest|lock/i);
  } finally {
    reopened.close();
  }
});
