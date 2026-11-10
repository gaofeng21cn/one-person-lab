import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  readInstalledPackageDescriptor,
  withCurrentOwnerProjection,
} from '../../src/adapters/integration/agent-package-registry-parts/installed-codex-plugin-directory-descriptor.ts';
import type { InstalledCarrierEntry } from '../../src/adapters/integration/agent-package-registry-parts/installed-codex-plugin-directory-types.ts';

const ownerManifest = JSON.parse(fs.readFileSync(
  new URL('../../contracts/opl-framework/packages/photo-steward.json', import.meta.url), 'utf8',
));

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
  assert.deepEqual(descriptor.manifest.presentation?.description_i18n, {
    und: 'Review prepared documents.',
  });
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
