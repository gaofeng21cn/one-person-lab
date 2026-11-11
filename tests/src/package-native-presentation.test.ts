import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  readInstalledPackageDescriptor,
  discoverCurrentOwnerPackageDescriptors,
  withCurrentOwnerProjection,
} from '../../src/adapters/integration/agent-package-registry-parts/installed-codex-plugin-directory-descriptor.ts';
import type { InstalledCarrierEntry } from '../../src/adapters/integration/agent-package-registry-parts/installed-codex-plugin-directory-types.ts';
import { normalizePresentation } from '../../src/adapters/integration/agent-package-registry-parts/presentation-normalizers.ts';
import { normalizePackageManifest } from '../../src/adapters/integration/agent-package-registry-parts/manifest-normalizers.ts';
import { directoryFrom } from '../../src/adapters/integration/agent-package-registry-parts/registry-status-projection.ts';
import { compactFastAgentPackageDirectory } from '../../src/read-models/operator/app-state-fast-projection.ts';
import { packageArtworkUrl } from '../../src/adapters/integration/agent-package-registry-parts/package-artwork.ts';
import { isFirstPartyPackage } from '../../src/adapters/integration/agent-package-first-party.ts';

const ownerManifest = JSON.parse(fs.readFileSync(
  new URL('../../contracts/opl-framework/packages/photo-steward.json', import.meta.url), 'utf8',
));

test('catalog release manifests remain consumable without dropping their presentation', () => {
  const catalog = new URL('../../contracts/opl-framework/packages/', import.meta.url);
  for (const file of fs.readdirSync(catalog).filter((entry) => entry.endsWith('.json'))) {
    const manifestUrl = new URL(file, catalog);
    const payload = JSON.parse(fs.readFileSync(manifestUrl, 'utf8'));
    const manifest = normalizePackageManifest(payload, manifestUrl.href);
    if (payload.presentation) {
      assert.deepEqual(manifest.presentation, payload.presentation, payload.package_id);
    }
  }
});

function fixture(context: { after: (cleanup: () => void) => void }, options: {
  description?: string;
  shortDescription?: string;
  owner?: boolean;
} = {}) {
  const sourcePath = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-native-presentation-'));
  context.after(() => fs.rmSync(sourcePath, { recursive: true, force: true }));
  fs.writeFileSync(path.join(sourcePath, 'plugin.json'), JSON.stringify({
    $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
    name: options.owner ? 'photo-steward' : 'fixture-native',
    version: options.owner ? ownerManifest.version : '1.2.3',
    description: options.description,
    extensions: {
      'com.openai': {
        interface: { displayName: 'Native Product', shortDescription: options.shortDescription },
      },
    },
  }));
  if (options.owner) {
    fs.writeFileSync(path.join(sourcePath, 'opl-package.json'), JSON.stringify({
      ...ownerManifest,
      presentation: undefined,
    }));
  }
  const entry: InstalledCarrierEntry = {
    pluginId: options.owner ? 'photo-steward@photo-steward' : 'fixture-native@fixture-marketplace',
    version: options.owner ? ownerManifest.version : '1.2.3',
    installed: true,
    enabled: true,
    sourcePath,
    sourceKind: 'codex_plugin_manager',
    marketplaceSource: 'fixture/marketplace',
  };
  return entry;
}

test('native plugin discovery preserves the formal name and prefers its interface description', (t) => {
  const descriptor = readInstalledPackageDescriptor(fixture(t, {
    description: 'Long owner description.',
    shortDescription: 'Review prepared documents.',
  }));
  assert.ok(descriptor);
  assert.equal(descriptor.manifest.package_id, 'fixture-native');
  assert.equal(descriptor.manifest.display_name, 'Native Product');
  assert.equal(descriptor.manifest.version, '1.2.3');
  assert.equal(descriptor.catalog_scope, 'software');
  assert.equal(descriptor.catalog_origin, 'external');
  assert.equal(descriptor.origin_basis, 'native_carrier');
  assert.deepEqual(descriptor.catalog_source, { manager: 'codex_plugin_manager', marketplace_id: 'fixture-marketplace', delivery: 'marketplace' });
  assert.deepEqual(descriptor.manifest.presentation?.description_i18n, {
    und: 'Review prepared documents.',
  });
});

test('Host-bundled plugins retain external provenance without becoming runtime dependencies', (t) => {
  const entry = fixture(t, { description: 'Host capability.' });
  const codexRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-host-bundle-'));
  t.after(() => fs.rmSync(codexRoot, { recursive: true, force: true }));
  const sourcePath = path.join(codexRoot, '.tmp', 'bundled-marketplaces', 'host', 'plugins', 'fixture-native');
  fs.mkdirSync(sourcePath, { recursive: true });
  fs.copyFileSync(path.join(entry.sourcePath, 'plugin.json'), path.join(sourcePath, 'plugin.json'));
  const previous = process.env.CODEX_HOME;
  process.env.CODEX_HOME = codexRoot;
  try {
    const bundled = readInstalledPackageDescriptor({ ...entry, sourcePath, pluginId: 'pdf@openai-primary-runtime' });
    assert.equal(bundled?.catalog_scope, 'software');
    assert.equal(bundled?.catalog_origin, 'external');
    assert.deepEqual(bundled?.catalog_source, { manager: 'codex_plugin_manager', marketplace_id: 'openai-primary-runtime', delivery: 'host_bundled' });
    assert.equal(readInstalledPackageDescriptor(entry)?.catalog_scope, 'software');
  } finally {
    if (previous === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = previous;
  }
});

test('installed owner declarations admit OPL software without inventing a central release target', (t) => {
  const entry = fixture(t, { owner: true, description: 'Travel ledger.' });
  const file = path.join(entry.sourcePath, 'opl-package.json');
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  manifest.package_id = 'fixture-independent-atlas';
  manifest.source = 'first_party_repo_local';
  manifest.source_repo = 'https://github.com/gaofeng21cn/fixture-independent-atlas.git';
  manifest.publisher = 'gaofeng21cn';
  manifest.codex_surface.configured_codex_plugin_carrier.plugin_selector = 'fixture-independent-atlas@fixture-independent-atlas';
  fs.writeFileSync(file, JSON.stringify(manifest));
  const installed = readInstalledPackageDescriptor({ ...entry, pluginId: 'fixture-independent-atlas@fixture-independent-atlas' });
  assert.ok(installed);
  assert.equal(isFirstPartyPackage('fixture-independent-atlas'), false);
  assert.equal(installed.catalog_origin, 'opl');
  assert.equal(installed.origin_basis, 'owner_manifest');
  const result = directoryFrom({ descriptors: new Map([['fixture-independent-atlas', installed]]), installed: new Map([['fixture-independent-atlas', installed]]), access: new Map() }, 'fast');
  assert.equal(result.entries[0].catalog_origin, 'opl');
  assert.equal(result.entries[0].selected_version, null);
  const compact: Record<string, unknown> = compactFastAgentPackageDirectory(result).entries[0];
  assert.equal(compact.catalog_origin, 'opl');
  assert.equal(compact.origin_basis, 'owner_manifest');
  assert.deepEqual(compact.catalog_source, installed.catalog_source);
});

test('publisher and product names cannot promote an undeclared owner to OPL', (t) => {
  const entry = fixture(t, { owner: true, description: 'Independent extension.' });
  const file = path.join(entry.sourcePath, 'opl-package.json');
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  manifest.package_id = 'fixture-independent';
  manifest.source = 'custom-source';
  manifest.publisher = 'one-person-lab';
  manifest.display_name = 'OPL Independent';
  fs.writeFileSync(file, JSON.stringify(manifest));
  assert.equal(readInstalledPackageDescriptor(entry)?.catalog_origin, 'unknown');
  manifest.source = 'third_party';
  fs.writeFileSync(file, JSON.stringify(manifest));
  assert.equal(readInstalledPackageDescriptor(entry)?.catalog_origin, 'external');
});

test('central owner provenance wins while installation transport and action authority stay intact', (t) => {
  const installed = readInstalledPackageDescriptor(fixture(t, { owner: true }));
  const owner = discoverCurrentOwnerPackageDescriptors({ packageId: 'photo-steward' }).get('photo-steward');
  assert.ok(installed && owner);
  assert.equal(owner.catalog_origin, 'opl');
  assert.equal(owner.origin_basis, 'owner_projection');
  installed.catalog_origin = 'unknown';
  const merged = withCurrentOwnerProjection(installed, owner);
  assert.equal(merged.catalog_origin, 'opl');
  assert.equal(merged.origin_basis, 'owner_projection');
  assert.deepEqual(merged.catalog_source, installed.catalog_source);
  assert.equal(merged.carrier_readback.lifecycle_authority, 'carrier_owned');
});

test('software type is owner-declared independently from technical role and is validated', () => {
  const presentation = { ...ownerManifest.presentation, software_type: 'agent' };
  assert.equal(normalizePresentation(presentation, 'file:///fixture/opl-package.json')?.software_type, 'agent');
  assert.throws(() => normalizePresentation({ ...presentation, software_type: ['agent'] }, 'file:///fixture/opl-package.json'));
  assert.throws(() => normalizePresentation({ ...presentation, software_type: 'preview' }, 'file:///fixture/opl-package.json'));
});

test('native discovery falls back to the plugin description and leaves absent descriptions unknown', (t) => {
  const fallback = readInstalledPackageDescriptor(fixture(t, { description: 'Prepare document reviews.' }));
  assert.deepEqual(fallback?.manifest.presentation?.description_i18n, { und: 'Prepare document reviews.' });
  const absent = readInstalledPackageDescriptor(fixture(t));
  assert.ok(absent);
  assert.equal(absent.manifest.presentation, null);
});

test('a Package without presentation reuses carrier description while retaining its owner name', (t) => {
  const descriptor = readInstalledPackageDescriptor(fixture(t, {
    owner: true,
    shortDescription: 'Review photo synchronization plans.',
  }));
  assert.ok(descriptor);
  assert.equal(descriptor.manifest.display_name, ownerManifest.display_name);
  assert.deepEqual(descriptor.manifest.presentation?.display_name_i18n, { und: ownerManifest.display_name });
  assert.deepEqual(descriptor.manifest.presentation?.description_i18n, { und: 'Review photo synchronization plans.' });
});

test('unreadable optional carrier metadata does not remove a valid Package descriptor', (t) => {
  const entry = fixture(t, { owner: true });
  fs.writeFileSync(path.join(entry.sourcePath, 'plugin.json'), '{invalid');
  const descriptor = readInstalledPackageDescriptor(entry);
  assert.ok(descriptor);
  assert.equal(descriptor.manifest.display_name, ownerManifest.display_name);
  assert.equal(descriptor.manifest.presentation, null);
});

test('current owner projection preserves carrier description fallback and owns the formal name', (t) => {
  const installed = readInstalledPackageDescriptor(fixture(t, {
    owner: true,
    description: 'Keep a reviewed local photo mirror.',
  }));
  assert.ok(installed);
  const projection = {
    ...installed,
    manifest: { ...installed.manifest, display_name: 'Photo Steward Desktop', presentation: null },
  };
  const merged = withCurrentOwnerProjection(installed, projection);
  assert.equal(merged.manifest.display_name, 'Photo Steward Desktop');
  assert.deepEqual(merged.manifest.presentation?.display_name_i18n, { und: 'Photo Steward Desktop' });
  assert.deepEqual(merged.manifest.presentation?.description_i18n, { und: 'Keep a reviewed local photo mirror.' });
  assert.equal(merged.manifest.content_digest, installed.manifest.content_digest);
});

test('complete current owner presentation takes precedence over native carrier metadata', (t) => {
  const installed = readInstalledPackageDescriptor(fixture(t, { owner: true, description: 'Native summary.' }));
  assert.ok(installed);
  const presentation = {
    display_name_i18n: { 'zh-CN': '照片管家', 'en-US': 'Photo Steward' },
    description_i18n: { 'zh-CN': '审核照片同步计划。', 'en-US': 'Review photo synchronization plans.' },
    session_routing_summary_i18n: { 'en-US': 'Review photo synchronization plans.' },
    home_shortcuts: [],
  };
  const merged = withCurrentOwnerProjection(installed, {
    ...installed,
    manifest: { ...installed.manifest, presentation },
  });
  assert.deepEqual(merged.manifest.presentation, presentation);
});


test('catalog artwork uses immutable payload paths and never sends private artwork to an anonymous URL', () => {
  const owners = discoverCurrentOwnerPackageDescriptors();
  const mas = owners.get('mas')!;
  assert.ok(mas);
  const url = packageArtworkUrl(mas);
  assert.ok(url?.includes(`/med-autoscience/${mas.manifest.carrier_source_commit}/plugins/med-autoscience/assets/icon.svg`));
  const before = mas.manifest.visibility;
  mas.manifest.visibility = 'authorized_only';
  assert.equal(packageArtworkUrl(mas), null);
  mas.manifest.visibility = before;
  mas.manifest.carrier_source_commit = 'main';
  assert.equal(packageArtworkUrl(mas), null);
  for (const icon_ref of ['../secret.svg', 'https://example.com/logo.svg', '/logo.png']) {
    assert.throws(() => normalizePresentation({ home_shortcuts: [], icon_ref }, 'fixture'));
  }
});
