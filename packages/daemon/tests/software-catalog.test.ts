import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { OfficialSoftwareCatalog, isOfficialCatalogPackage, projectCatalogEntries } from '../src/state/package-catalog.ts';

function catalogEntry(id: string, restricted = false) {
  return {
    package_id: id, software_type: 'agent', version: '1.2.3', visibility: restricted ? 'authorized_only' : 'public',
    manifest: {
      package_id: id, source_repo: 'https://github.com/gaofeng21cn/' + id + '.git', display_name: id,
      presentation: { description_i18n: { 'zh-CN': 'internal description' } },
      codex_surface: { configured_codex_plugin_carrier: { publication_ref: 'ghcr.io/gaofeng21cn/one-person-lab-packages/' + id + ':stable' } },
    },
  };
}
const published = catalogEntry('published');
const v2Published = {
  ...catalogEntry('v2-published'),
  manifest: {
    ...catalogEntry('v2-published').manifest,
    v2_release: {
      version: '1.2.4', source_commit: 'a'.repeat(40),
      payload_manifest_ref: 'payloads/v2-published-1.2.4.json', payload_sha256: 'sha256:' + 'b'.repeat(64),
    },
  },
};
const guarded = catalogEntry('guarded', true);
const privateUnlisted = catalogEntry('unlisted', true);
const index = {
  schema_version: 'opl_software_catalog_index.v1', catalog_id: 'public-registry:opl',
  packages: [published, v2Published, {
    ...guarded, public_summary: { owner_source_repo: guarded.manifest.source_repo, display_name: 'Allowed summary',
      description_i18n: { 'en-US': 'Public information' } },
  }, privateUnlisted, {
    ...catalogEntry('mismatch', true), public_summary: { owner_source_repo: 'https://github.com/other/other', display_name: 'Wrong owner' },
  }],
};

test('fast reads share a single pending catalog and expose only discoverable rows plus owner-backed installs', async () => {
  const response = Promise.withResolvers<Response>();
  const changed = Promise.withResolvers<void>();
  let requests = 0;
  const catalog = new OfficialSoftwareCatalog(changed.resolve, {
    runtimeRoot: null, fetchImpl: async () => { requests++; return response.promise; },
  });
  assert.equal(catalog.read().status, 'loading');
  assert.equal(catalog.read().entries.size, 0);
  assert.equal(requests, 0);
  await Promise.resolve();
  assert.equal(requests, 1);
  response.resolve(Response.json(index));
  await changed.promise;
  const snapshot = catalog.read();
  assert.equal(snapshot.status, 'ready');
  assert.deepEqual([...snapshot.entries.keys()], ['published', 'v2-published', 'guarded']);
  const open = snapshot.entries.get('published')!;
  assert.equal(open.installed, false);
  assert.equal(open.selected_version, '1.2.3');
  assert.equal(snapshot.entries.get('v2-published')?.selected_version, '1.2.4');
  assert.equal(open.recommended_action_ref?.action_id, 'agent_package_install');
  assert.deepEqual(open.recommended_action_ref?.payload, { package_id: 'published' });
  assert.ok(isOfficialCatalogPackage(snapshot, 'published', 'https://github.com/gaofeng21cn/published'));
  assert.ok(!isOfficialCatalogPackage(snapshot, 'published', 'https://github.com/another/published'));
  const freshRows = projectCatalogEntries(snapshot, new Set(['published', 'v2-published']));
  assert.deepEqual(freshRows.map(row => row.display_name), ['Allowed summary']);
  assert.equal(freshRows[0]?.description, 'Public information');
  assert.deepEqual(freshRows[0]?.available_actions, []);
  assert.equal(freshRows[0]?.selected_version, undefined);
  assert.ok(!JSON.stringify(freshRows).includes('internal description'));
  assert.equal(requests, 1);
});

test('Full keeps unbundled catalog products discoverable without projecting installs that require absent sources', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'opl-catalog-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'opl', 'catalog-seed'), { recursive: true });
  await writeFile(path.join(root, 'opl', 'catalog-seed', 'catalog-index.json'), JSON.stringify(index));
  const changed = Promise.withResolvers<void>();
  const catalog = new OfficialSoftwareCatalog(changed.resolve, { runtimeRoot: root, fetchImpl: () => { throw new Error('offline'); } });
  catalog.read();
  await changed.promise;
  const row = catalog.read().entries.get('published');
  assert.equal(row?.installability.installable, false);
  assert.equal(row?.installability.reason, 'package_install_source_unavailable');
  assert.equal(catalog.read().entries.get('v2-published')?.selected_version, '1.2.3');
});

test('provider failure still permits a fast read and schedules no immediate retry', async () => {
  let requests = 0;
  const changed = Promise.withResolvers<void>();
  const catalog = new OfficialSoftwareCatalog(changed.resolve, {
    runtimeRoot: null, fetchImpl: async () => { requests++; throw new Error('offline'); },
  });
  const initial = catalog.read();
  assert.equal(initial.status, 'loading');
  await changed.promise;
  assert.equal(catalog.read().status, 'unavailable');
  assert.deepEqual(projectCatalogEntries(catalog.read(), new Set()), []);
  assert.equal(requests, 1);
});

test('a failed refresh preserves the last good public catalog and a later request recovers', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-01-01') });
  let online = true;
  let changed = Promise.withResolvers<void>();
  const catalog = new OfficialSoftwareCatalog(() => changed.resolve(), {
    runtimeRoot: null, fetchImpl: async () => {
      if (!online) throw new Error('offline');
      return Response.json(index);
    },
  });
  catalog.read();
  await changed.promise;
  const lastGood = catalog.read().entries;
  assert.ok(lastGood.has('published'));
  changed = Promise.withResolvers<void>();
  online = false;
  t.mock.timers.tick(5 * 60_000);
  assert.equal(catalog.read().entries, lastGood);
  await changed.promise;
  assert.equal(catalog.read().status, 'stale');
  assert.equal(catalog.read().entries, lastGood);
  changed = Promise.withResolvers<void>();
  online = true;
  t.mock.timers.tick(30_000);
  catalog.read();
  await changed.promise;
  assert.equal(catalog.read().status, 'ready');
});
