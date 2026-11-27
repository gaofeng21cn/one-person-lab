import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  officialPackageInstallSource,
  readOfficialPackageCatalog,
  type OfficialPackageCatalogEntry,
} from '../src/distribution/official-package-catalog.ts';

const packageId = 'sample-agent';
const repository = 'https://github.com/gaofeng21cn/example-repo.git';
const commit = 'a'.repeat(40);
const publication = 'ghcr.io/gaofeng21cn/one-person-lab-packages/sample-agent:latest-stable';
const entry: OfficialPackageCatalogEntry = {
  package_id: packageId,
  visibility: 'public',
  manifest: {
    package_id: packageId, source_repo: repository,
    codex_surface: { configured_codex_plugin_carrier: { publication_ref: publication } },
  },
  payload: { package_id: packageId, source_repo: repository, source_commit: commit },
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
    kind: 'oci', package_id: packageId, ref: publication,
  });
  assert.throws(() => officialPackageInstallSource({ ...entry, visibility: 'authorized_only' }, null), /public Package source unavailable/);
  const wrongRef = { ...entry.manifest, codex_surface: { configured_codex_plugin_carrier: { publication_ref: publication.replace(packageId, 'another') } } };
  assert.throws(() => officialPackageInstallSource({ ...entry, manifest: wrongRef }, null), /outside its registered Package repository/);
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
