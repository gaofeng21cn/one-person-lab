import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { normalizePackageManifest } from '../../src/adapters/integration/agent-package-registry-parts/manifest-normalizers.ts';
import { directoryFrom, packageBackgroundUpdatePolicy, type PackageSnapshot } from '../../src/adapters/integration/agent-package-registry-parts/registry-status-projection.ts';
import type { InstalledPackageDescriptor } from '../../src/adapters/integration/agent-package-registry-parts/installed-codex-plugin-directory.ts';
import type { AgentPackageAccessDecision } from '../../src/adapters/integration/agent-package-registry-parts/package-access.ts';
import { compactFastAgentPackageDirectory } from '../../src/read-models/operator/app-state-fast-projection.ts';
import { configureOplSoftwareSource } from '../../src/adapters/integration/software-sources.ts';

const source = JSON.parse(fs.readFileSync(new URL('../../contracts/opl-framework/packages/opl-flow.json', import.meta.url), 'utf8'));

function descriptor(packageId: string, installed: boolean): InstalledPackageDescriptor {
  const manifest = normalizePackageManifest({
    ...source,
    package_id: packageId,
    visibility: 'authorized_only',
    access_policy_ref: `github-package:gaofeng21cn/one-person-lab-packages/${packageId}`,
    credential_provider: 'github_packages',
  }, 'fixture');
  const carrier = manifest.configured_codex_plugin_carrier!;
  return {
    manifest,
    manifestPath: '/fixture/opl-package.json',
    manifest_sha256: 'sha256:' + '1'.repeat(64),
    sourcePath: '/fixture/package-source-missing',
    pluginId: carrier.carrier.pluginId,
    marketplaceSource: carrier.carrier.marketplaceSource,
    enabled: true,
    carrier,
    carrier_readback: {
      kind: 'codex_plugin_manager', identity: carrier.carrier.pluginId,
      source_ref: 'fixture', version: manifest.version, enabled: true,
      lifecycle_authority: 'carrier_owned',
    },
    readiness: { installed, physical_status: 'available', callability: 'callable' },
  };
}

function access(status: AgentPackageAccessDecision['status']): AgentPackageAccessDecision {
  const allowed = status === 'authorized';
  return {
    visibility: 'authorized_only', status, provider_id: 'github_packages',
    credential_handle: allowed ? 'provider:github_packages:gh-cli' : null,
    source_id: 'github-packages:gaofeng21cn', source_ref: 'https://github.com/gaofeng21cn/opl-flow.git',
    access_policy_ref: 'github-package:gaofeng21cn/one-person-lab-packages/opl-flow',
    verified_at: '2026-11-10T00:00:00.000Z', expires_at: '2026-11-10T00:01:00.000Z',
    security_revision: allowed ? 'sha256:' + '1'.repeat(64) : null,
    reason: allowed ? null : 'package_access_credential_required',
    discover_allowed: allowed, download_allowed: allowed,
  };
}

function snapshot(items: InstalledPackageDescriptor[], decisions: AgentPackageAccessDecision[]): PackageSnapshot {
  return {
    descriptors: new Map(items.map(item => [item.manifest.package_id, item])),
    installed: new Map(items.filter(item => item.readiness.installed).map(item => [item.manifest.package_id, item])),
    access: new Map(items.map((item, index) => [item.manifest.package_id, decisions[index]])),
  };
}

test('denied private discovery is absent while the local installation remains runnable and removable', () => {
  const installed = descriptor('opl-flow', true);
  const absent = descriptor('private-not-installed', false);
  const result = directoryFrom(snapshot([installed, absent], [access('revoked'), access('signed_out')]), 'fast');
  assert.equal(result.entry_count, 1);
  assert.equal(result.installed_package_count, 1);
  assert.equal(result.installable_package_count, 0);
  const [entry] = result.entries;
  assert.equal(entry.package_id, 'opl-flow');
  assert.equal(entry.activated, true);
  assert.equal(entry.readiness.operational_ready, true);
  assert.equal(entry.readiness.launch_allowed, true);
  assert.equal(entry.readiness.status, 'attention_needed');
  assert.equal(entry.recommended_action, null);
  const actions = entry.available_actions.map(action => action.action_id);
  assert.ok(actions.includes('agent_package_uninstall'));
  assert.ok(!actions.includes('agent_package_install'));
  assert.ok(!actions.includes('agent_package_update'));
  assert.ok(!actions.includes('agent_package_repair'));
});

test('verified private discovery contributes an installable directory item', () => {
  const result = directoryFrom(snapshot([descriptor('opl-flow', false)], [access('authorized')]), 'fast');
  assert.equal(result.entry_count, 1);
  assert.equal(result.installable_package_count, 1);
  assert.equal(result.entries[0].installability.installable, true);
  assert.equal(result.entries[0].recommended_action, 'agent_package_install');
});

test('an expired private snapshot requests its source refresh without exposing Package metadata', () => {
  const pending = { ...access('unknown'), source_id: 'github-packages:gaofeng21cn',
    reason: 'package_access_check_required' };
  const result = directoryFrom(snapshot([descriptor('private-not-installed', false)], [pending]), 'fast');
  assert.equal(result.entry_count, 0);
  assert.deepEqual(result.source_refresh_required_ids, ['github-packages:gaofeng21cn']);
  const disconnected = directoryFrom(snapshot([descriptor('private-not-installed', false)],
    [{ ...pending, reason: 'package_access_credential_required' }]), 'fast');
  assert.deepEqual(disconnected.source_refresh_required_ids, []);
});

test('background update eligibility uses the existing access decision and skips denied downloads', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-private-background-'));
  const previous = process.env.OPL_STATE_DIR;
  try {
    process.env.OPL_STATE_DIR = root;
    const installed = descriptor('opl-flow', true);
    assert.equal(packageBackgroundUpdatePolicy(installed, access('authorized')).eligible, true);
    assert.equal(packageBackgroundUpdatePolicy(installed, access('revoked')).eligible, false);
    assert.equal(packageBackgroundUpdatePolicy(installed, access('unknown')).eligible, false);
  } finally {
    if (previous === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previous;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('fast app state preserves safe access state without copying credentials or provider extensions', () => {
  const result = compactFastAgentPackageDirectory({ entries: [{
    package_id: 'opl-flow', package_access: {
      ...access('revoked'), credential_handle: 'provider:github_packages:gh-cli',
      token: 'must-not-project', provider_debug: { password: 'must-not-project' },
    },
  }] });
  const projected = result.entries[0].package_access;
  assert.equal(projected?.visibility, 'authorized_only');
  assert.equal(projected?.status, 'revoked');
  assert.equal(projected?.source_id, 'github-packages:gaofeng21cn');
  assert.equal(projected?.download_allowed, false);
  assert.equal(Object.hasOwn(projected!, 'credential_handle'), false);
  assert.equal(Object.hasOwn(projected!, 'token'), false);
  assert.equal(Object.hasOwn(projected!, 'provider_debug'), false);
});

test('fast directory fallback does not contact a connected private registry', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-private-fast-read-'));
  const env = {
    OPL_STATE_DIR: path.join(root, 'state'),
    OPL_GITHUB_PACKAGES_TOKEN: 'fixture-token-not-used',
    PATH: `${root}${path.delimiter}${process.env.PATH ?? ''}`,
  };
  const previous = new Map(Object.keys(env).map(key => [key, process.env[key]]));
  const calls = path.join(root, 'registry-calls');
  fs.writeFileSync(path.join(root, 'curl'), `#!/bin/sh\necho called >> '${calls}'\nexit 1\n`, { mode: 0o755 });
  try {
    Object.assign(process.env, env);
    configureOplSoftwareSource({ source_id: 'github-packages:gaofeng21cn', credential_handle: 'env:OPL_GITHUB_PACKAGES_TOKEN' });
    const local = snapshot([descriptor('opl-flow', true)], [access('unknown')]);
    local.access.clear();
    const result = directoryFrom(local, 'fast');
    assert.equal(result.entries[0].package_access.status, 'unknown');
    assert.equal(result.entries[0].readiness.launch_allowed, true);
    assert.equal(fs.existsSync(calls), false);
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});
