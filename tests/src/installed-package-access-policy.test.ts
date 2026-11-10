import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import { normalizePackageManifest } from '../../src/adapters/integration/agent-package-registry-parts/manifest-normalizers.ts';
import {
  installedDescriptorSupportsFrameworkCalls,
  withCurrentOwnerProjection,
} from '../../src/adapters/integration/agent-package-registry-parts/installed-codex-plugin-directory-descriptor.ts';
import type { InstalledPackageDescriptor } from '../../src/adapters/integration/agent-package-registry-parts/installed-codex-plugin-directory-types.ts';

const publicationRef = 'ghcr.io/gaofeng21cn/one-person-lab-packages/occ:latest-stable';

function descriptor(version: string, privateOwner = false): InstalledPackageDescriptor {
  const manifestPath = path.resolve('contracts/opl-framework/packages/occ.json');
  const owner = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  owner.version = version;
  owner.visibility = privateOwner ? 'authorized_only' : 'public';
  owner.access_policy_ref = privateOwner ? 'github-package:gaofeng21cn/one-person-lab-packages/occ' : null;
  owner.credential_provider = privateOwner ? 'github_packages' : null;
  owner.codex_surface.configured_codex_plugin_carrier.publication_ref = publicationRef;
  const manifest = normalizePackageManifest(owner, pathToFileURL(manifestPath).href);
  const carrier = manifest.configured_codex_plugin_carrier!;
  return {
    manifest,
    manifestPath,
    manifest_sha256: `manifest-${version}`,
    sourcePath: `/installed/occ/${version}`,
    pluginId: carrier.carrier.pluginId,
    marketplaceSource: carrier.carrier.marketplaceSource,
    enabled: true,
    carrier,
    carrier_readback: {
      kind: 'codex_plugin_manager', identity: carrier.carrier.pluginId,
      source_ref: `/installed/occ/${version}`, version, enabled: true,
      lifecycle_authority: 'carrier_owned',
    },
    readiness: { installed: true, physical_status: 'available', callability: 'callable' },
  };
}

test('newer installed Package takes current owner access policy without changing local runtime or removal identity', () => {
  const installed = descriptor('0.2.0');
  const owner = descriptor('0.1.5', true);
  installed.manifest.source_repo = 'https://github.com/old-owner/old-occ.git';
  installed.manifest.content_digest = `sha256:${'b'.repeat(64)}`;
  installed.manifest.content_lock_paths = ['physical-only.txt'];
  installed.manifest.codex_surface.configured_codex_plugin_carrier = {
    ...(installed.manifest.codex_surface.configured_codex_plugin_carrier as Record<string, unknown>),
    publication_ref: 'ghcr.io/old-owner/one-person-lab-packages/occ:latest-stable',
  };
  const selected = withCurrentOwnerProjection(installed, owner);

  assert.equal(selected.manifest.visibility, 'authorized_only');
  assert.equal(selected.manifest.access_policy_ref, owner.manifest.access_policy_ref);
  assert.equal(selected.manifest.credential_provider, 'github_packages');
  assert.equal(selected.manifest.source_repo, owner.manifest.source_repo);
  assert.equal((selected.manifest.codex_surface.configured_codex_plugin_carrier as Record<string, unknown>).publication_ref, publicationRef);
  assert.equal(selected.carrier.publicationRef, publicationRef);
  assert.equal(selected.manifest.configured_codex_plugin_carrier?.publicationRef, publicationRef);
  assert.equal(selected.manifest.version, '0.2.0');
  assert.equal(selected.manifest.content_digest, installed.manifest.content_digest);
  assert.deepEqual(selected.manifest.content_lock_paths, installed.manifest.content_lock_paths);
  assert.equal(selected.manifest_sha256, installed.manifest_sha256);
  assert.equal(selected.manifestPath, installed.manifestPath);
  assert.equal(selected.sourcePath, installed.sourcePath);
  assert.deepEqual(selected.carrier_readback, installed.carrier_readback);
  assert.deepEqual(selected.readiness, installed.readiness);
  assert.deepEqual(selected.carrier.carrier, installed.carrier.carrier);
  assert.deepEqual(selected.carrier.executor, installed.carrier.executor);
  assert.equal(installedDescriptorSupportsFrameworkCalls(selected), true);
  assert.equal(installed.manifest.visibility, 'public', 'projection must not mutate physical descriptor');
});

test('older installed Package also receives owner access policy while keeping its physical version', () => {
  const installed = descriptor('0.1.4');
  const selected = withCurrentOwnerProjection(installed, descriptor('0.1.5', true));
  assert.equal(selected.manifest.visibility, 'authorized_only');
  assert.equal(selected.manifest.version, '0.1.4');
  assert.equal(installedDescriptorSupportsFrameworkCalls(selected), true);
});

test('owner access policy cannot attach to a different Package or native plugin identity', () => {
  const installed = descriptor('0.2.0');
  const differentPackage = descriptor('0.1.5', true);
  differentPackage.manifest.package_id = 'other';
  assert.equal(withCurrentOwnerProjection(installed, differentPackage), installed);
  const differentCarrier = descriptor('0.1.5', true);
  differentCarrier.carrier.carrier.pluginId = 'other@other';
  assert.equal(withCurrentOwnerProjection(installed, differentCarrier), installed);
});

test('owner access policy also covers a prior marketplace selector for the same native plugin', () => {
  const installed = descriptor('0.2.0');
  installed.pluginId = 'occ@previous-marketplace';
  installed.carrier.carrier.pluginId = installed.pluginId;
  const selected = withCurrentOwnerProjection(installed, descriptor('0.1.5', true));
  assert.equal(selected.manifest.visibility, 'authorized_only');
  assert.equal(selected.carrier.carrier.pluginId, 'occ@previous-marketplace');
  assert.equal(selected.pluginId, installed.pluginId);
});

test('same-version owner replacement retains existing complete projection semantics', () => {
  const installed = descriptor('0.1.5');
  const owner = descriptor('0.1.5', true);
  owner.manifest.display_name = 'Current owner display';
  owner.manifest_sha256 = 'current-owner-hash';
  const selected = withCurrentOwnerProjection(installed, owner);
  assert.equal(selected.manifest.display_name, 'Current owner display');
  assert.equal(selected.manifest.visibility, 'authorized_only');
  assert.equal(selected.manifest_sha256, 'current-owner-hash');
  assert.equal(selected.sourcePath, installed.sourcePath);
  assert.deepEqual(selected.carrier_readback, installed.carrier_readback);
});


test('an available native descriptor also inherits private owner policy before directory discovery', () => {
  const installed = descriptor('0.2.0', false);
  const owner = descriptor('0.1.5', true);
  installed.readiness.installed = false;
  const projected = withCurrentOwnerProjection(installed, owner);
  assert.equal(projected.readiness.installed, false);
  assert.equal(projected.manifest.visibility, 'authorized_only');
  assert.equal(projected.manifest.version, '0.2.0');
});
