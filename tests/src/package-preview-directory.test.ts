import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { FrameworkContractError } from '../../src/kernel/contract-validation.ts';
import { normalizePackageManifest } from '../../src/adapters/integration/agent-package-registry-parts/manifest-normalizers.ts';
import { assertPackageInstallSourceAvailable } from '../../src/adapters/integration/agent-package-registry-parts/package-install-source.ts';
import { directoryFrom, type PackageSnapshot } from '../../src/adapters/integration/agent-package-registry-parts/registry-status-projection.ts';
import type { InstalledPackageDescriptor } from '../../src/adapters/integration/agent-package-registry-parts/installed-codex-plugin-directory-types.ts';
import type { AgentPackageAccessDecision } from '../../src/adapters/integration/agent-package-registry-parts/package-access.ts';
import { compactFastAgentPackageDirectory } from '../../src/read-models/operator/app-state-fast-projection.ts';

const source = JSON.parse(fs.readFileSync(
  new URL('../../contracts/opl-framework/packages/opl-flow.json', import.meta.url), 'utf8',
));

function descriptor(options: { packageId?: string; installed?: boolean; private?: boolean } = {}): InstalledPackageDescriptor {
  const packageId = options.packageId ?? 'fixture-development-only-without-payload';
  const installed = options.installed ?? false;
  const manifest = normalizePackageManifest({
    ...source,
    package_id: packageId,
    publication_channel_admission: 'development_only',
    visibility: options.private ? 'authorized_only' : 'public',
    access_policy_ref: options.private ? `github-package:fixture/packages/${packageId}` : null,
    credential_provider: options.private ? 'github_packages' : null,
  }, 'fixture');
  const carrier = { ...manifest.configured_codex_plugin_carrier!, publicationRef: null };
  return {
    manifest,
    manifestPath: '/fixture/opl-package.json',
    manifest_sha256: 'sha256:' + '1'.repeat(64),
    sourcePath: '/fixture/package-source-missing',
    pluginId: carrier.carrier.pluginId,
    marketplaceSource: carrier.carrier.marketplaceSource,
    enabled: installed,
    carrier,
    carrier_readback: {
      kind: 'codex_plugin_manager', identity: carrier.carrier.pluginId,
      source_ref: 'fixture', version: manifest.version, enabled: installed,
      lifecycle_authority: 'carrier_owned',
    },
    readiness: {
      installed,
      physical_status: installed ? 'available' : 'unavailable',
      callability: installed ? 'callable' : 'disabled',
    },
  };
}

function snapshot(item: InstalledPackageDescriptor): PackageSnapshot {
  const allowed = item.manifest.visibility === 'public';
  const access: AgentPackageAccessDecision = {
    visibility: item.manifest.visibility,
    status: allowed ? 'public' : 'forbidden',
    provider_id: item.manifest.credential_provider,
    credential_handle: null,
    source_id: null,
    access_policy_ref: item.manifest.access_policy_ref,
    source_ref: item.manifest.source_repo,
    verified_at: '2026-11-10T00:00:00.000Z',
    expires_at: null,
    security_revision: null,
    reason: allowed ? null : 'package_access_forbidden',
    discover_allowed: allowed,
    download_allowed: allowed,
  };
  return {
    descriptors: new Map([[item.manifest.package_id, item]]),
    installed: new Map(item.readiness.installed ? [[item.manifest.package_id, item]] : []),
    access: new Map([[item.manifest.package_id, access]]),
  };
}

function assertNoDownloadActions(entry: ReturnType<typeof directoryFrom>['entries'][number]) {
  const actions = entry.available_actions.map(action => action.action_id);
  for (const action of ['agent_package_install', 'agent_package_update', 'agent_package_repair'] as const) {
    assert.ok(!actions.includes(action), `unexpected download action: ${action}`);
  }
  assert.equal(entry.recommended_action, null);
}

test('normalization retains development-only admission and defaults existing packages to admitted', () => {
  assert.equal(descriptor().manifest.publication_channel_admission, 'development_only');
  assert.equal(normalizePackageManifest(source, 'fixture').publication_channel_admission, 'admitted');
});

test('uninstalled development-only packages are absent from the software directory', () => {
  const result = directoryFrom(snapshot(descriptor()), 'fast');
  assert.equal(result.entry_count, 0);
  assert.equal(result.installable_package_count, 0);
});

test('installed development-only without a payload remains callable and removable', () => {
  const result = directoryFrom(snapshot(descriptor({ installed: true })), 'fast');
  assert.equal(result.installed_package_count, 1);
  const [entry] = result.entries;
  assert.equal(entry.activated, true);
  assert.equal(entry.readiness.launch_allowed, true);
  assert.equal(entry.installability.reason, 'package_install_source_unavailable');
  assert.ok(entry.available_actions.some(action => action.action_id === 'agent_package_uninstall'));
  assertNoDownloadActions(entry);
});

test('pinned source payloads cannot become a software-center installation source', () => {
  const item = descriptor({ packageId: 'opl-flow' });
  const result = directoryFrom(snapshot(item), 'fast');
  assert.equal(result.installable_package_count, 0);
  assert.equal(result.entry_count, 0);
  assert.throws(() => assertPackageInstallSourceAvailable(item));
});

test('development-only admission does not disclose private packages when discovery is denied', () => {
  const result = directoryFrom(snapshot(descriptor({ private: true })), 'fast');
  assert.equal(result.entry_count, 0);
  assert.equal(result.installable_package_count, 0);
});

test('fast app state keeps development overlay distinct from maturity and retains blocked installation state', () => {
  const result = compactFastAgentPackageDirectory(directoryFrom(snapshot(descriptor({ installed: true })), 'fast'));
  const entry: Record<string, unknown> = result.entries[0];
  assert.equal(entry.release_channel, 'unknown');
  assert.equal(entry.distribution_channel, 'development');
  assert.deepEqual(entry.installability, {
    status: 'installed', installable: false, reason: 'package_install_source_unavailable',
  });
});

test('installation guard rejects development-only packages without a verified source', () => {
  const item = descriptor();
  assert.throws(() => assertPackageInstallSourceAvailable(item), (error: unknown) => {
    assert.ok(error instanceof FrameworkContractError);
    assert.equal(error.details?.failure_code, 'package_install_source_unavailable');
    assert.equal(error.details?.package_id, item.manifest.package_id);
    return true;
  });
});

test('installed and selected versions retain separate authorities and unknown selection stays unknown', () => {
  const installed = descriptor({ installed: true });
  const currentOwner = descriptor();
  installed.manifest.version = '1.0.0';
  currentOwner.manifest.version = '1.1.0';
  const observed = snapshot(installed);
  observed.currentOwner = new Map([[installed.manifest.package_id, currentOwner]]);
  const [withOwner] = directoryFrom(observed, 'fast').entries;
  assert.equal(withOwner.installed_version, '1.0.0');
  assert.equal(withOwner.selected_version, '1.1.0');
  const [withoutOwner] = directoryFrom(snapshot(installed), 'fast').entries;
  assert.equal(withoutOwner.installed_version, '1.0.0');
  assert.equal(withoutOwner.selected_version, null);
  const revoked = snapshot(descriptor({ installed: true, private: true }));
  revoked.currentOwner = observed.currentOwner;
  assert.equal(directoryFrom(revoked, 'fast').entries[0].selected_version, null);
});


test('deployment targets are absent and parent-owned components have no independent lifecycle actions', () => {
  const remote = descriptor({ installed: true });
  remote.manifest.management_scope = 'deployment_target';
  remote.manifest.deployment_target = 'device';
  assert.equal(directoryFrom(snapshot(remote), 'fast').entry_count, 0);
  const component = descriptor({ installed: true });
  component.manifest.management_scope = 'local_component';
  const [entry] = directoryFrom(snapshot(component), 'fast').entries;
  assert.equal(entry.catalog_scope, 'host_component');
  assert.deepEqual(entry.available_actions, []);
  assert.throws(() => assertPackageInstallSourceAvailable(component));
  component.manifest.publication_channel_admission = 'admitted';
  component.carrier.publicationRef = 'ghcr.io/example/packages/component:latest-stable';
  assert.doesNotThrow(() => assertPackageInstallSourceAvailable(component));
  const [publishedComponent] = directoryFrom(snapshot(component), 'fast').entries;
  assert.deepEqual(publishedComponent.available_actions, []);
  assert.equal(publishedComponent.recommended_action, null);
});

test('admission alone cannot authorize an unpublished first-party install', () => {
  const item = descriptor({ installed: true });
  item.manifest.publication_channel_admission = 'admitted';
  assert.throws(() => assertPackageInstallSourceAvailable(item));
  const [entry] = directoryFrom(snapshot(item), 'fast').entries;
  assertNoDownloadActions(entry);
});
