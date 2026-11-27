import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  officialPackageInstallSource,
  readOfficialPackageCatalog,
  readOfficialV2Source,
  type OfficialPackageCatalogEntry,
} from '../src/distribution/official-package-catalog.ts';
import { resolveOciArtifact } from '../src/distribution/registry-client.ts';

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
    codex_surface: { configured_codex_plugin_carrier: { publication_ref: publication } },
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
    fetchImpl: async () => assert.fail('Full must stay offline'),
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
