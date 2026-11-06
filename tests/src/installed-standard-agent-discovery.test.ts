import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { readAgentPackageReadinessPort, registerAgentPackageReadinessPort } from '../../src/kernel/agent-package-readiness-port.ts';
import { listStandardAgentRegistry, resolveStandardAgent } from '../../src/kernel/standard-agent-registry.ts';
import { readStandardAgentDescriptorInterface } from '../../src/kernel/standard-agent-interface.ts';
import { listInstalledStandardAgentEntries } from '../../src/adapters/integration/installed-standard-agent-registry.ts';
import type { InstalledPackageDescriptor } from '../../src/adapters/integration/agent-package-registry-parts/installed-codex-plugin-directory.ts';
import { findWorkspaceAgentProfile } from '../../src/authority/workspace/workspace-agent-defaults.ts';
import { resolveFamilyRuntimeDomainId } from '../../src/adapters/execution/family-runtime-types.ts';
import { resolveStandardAgentContractCheckout } from '../../src/adapters/integration/standard-agent-interface-discovery.ts';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-installed-agent-'));
  fs.mkdirSync(path.join(root, 'contracts'));
  const raw = {
    kind: 'agent', agent_id: 'novel-agent', package_id: 'novel-agent', domain_id: 'novel-domain',
    domain_label: 'Novel Agent',
    standard_agent_interface: {
      version: 'opl_standard_agent_interface.v1',
      workspace_binding: {
        locator_surface_kind: 'novel_workspace', default_profile_id: 'one_off',
        workspace_kind: 'novel_workspace', project_kind: 'decision',
        project_collection_label: 'projects', default_workspace_id: 'novel-workspace', default_project_id: 'novel-001',
        required_locator_fields: ['workspace_root'], optional_locator_fields: [],
      },
      runtime: { runtime_domain_id: 'novel-domain', registration_ref: 'contracts/domain_descriptor.json' },
      progress: { deliverable_delta_aliases: [], platform_delta_aliases: [] },
      routing: { explicit_aliases: ['novel-alias'], workstream_ids: [], intent_signals: [], ambiguity_policy: 'require_explicit_intent' },
    },
  };
  const write = () => fs.writeFileSync(path.join(root, 'contracts/domain_descriptor.json'), JSON.stringify(raw));
  write();
  const installed = {
    manifest: { agent_id: 'novel-agent', package_id: 'novel-agent', package_role: 'standard_agent', display_name: 'Novel Agent' },
    sourcePath: root, pluginId: 'novel-agent@local', marketplaceSource: null,
    readiness: { installed: true, physical_status: 'available', callability: 'callable' },
  } as InstalledPackageDescriptor;
  return { root, raw, write, installed, discover: () => new Map([['novel-agent', installed]]) };
}

test('an installed Agent joins workspace and runtime by descriptor, and removal is observed without restart', () => {
  const f = fixture();
  const original = readAgentPackageReadinessPort();
  try {
    registerAgentPackageReadinessPort({
      readStatus: () => null,
      listInstalledStandardAgentEntries: () => listInstalledStandardAgentEntries(f.discover),
      readStandardAgentDescriptorForDomain: () => readStandardAgentDescriptorInterface(f.root),
    });
    assert.equal(resolveStandardAgent('novel-alias')?.agent_id, 'novel-agent');
    assert.equal(resolveFamilyRuntimeDomainId('novel-alias'), 'novel-domain');
    assert.equal(findWorkspaceAgentProfile('novel-alias').workspace_kind, 'novel_workspace');
    assert.equal(listStandardAgentRegistry().filter((x) => x.agent_id === 'novel-agent').length, 1);
    f.installed.readiness.installed = false;
    assert.equal(resolveFamilyRuntimeDomainId('novel-alias'), null);
  } finally {
    registerAgentPackageReadinessPort(original ?? { readStatus: () => null });
    fs.rmSync(f.root, { recursive: true, force: true });
  }
});

test('discovery rejects conflicting identities and cannot grant disabled carriers launch readiness', () => {
  const f = fixture();
  const original = readAgentPackageReadinessPort();
  try {
    registerAgentPackageReadinessPort({ readStatus: () => null,
      listInstalledStandardAgentEntries: () => listInstalledStandardAgentEntries(f.discover) });
    const result = resolveStandardAgentContractCheckout('novel-agent', () => ({ opl_agent_package_status: {
      installed_carrier_readback: { lifecycle_authority: 'carrier_owned', source_ref: f.root },
      installed_readiness: { installed: true, physical_status: 'available', callability: 'disabled' },
      launch_allowed: false,
    } }) as any, () => null, { result: 'typed_resolution' });
    assert.equal(result.launch_allowed, false);
    f.raw.standard_agent_interface.routing.explicit_aliases = ['mas'];
    f.write();
    assert.throws(() => listStandardAgentRegistry(), /namespace collision/);
    f.raw.agent_id = 'another-owner';
    f.write();
    assert.throws(() => listInstalledStandardAgentEntries(f.discover), /identity does not match/);
  } finally {
    registerAgentPackageReadinessPort(original ?? { readStatus: () => null });
    fs.rmSync(f.root, { recursive: true, force: true });
  }
});

test('carrier compatibility normalization does not recursively rediscover the carrier', () => {
  const original = readAgentPackageReadinessPort();
  let reads = 0;
  try {
    registerAgentPackageReadinessPort({ readStatus: () => null,
      listInstalledStandardAgentEntries() {
        reads += 1;
        assert.equal(resolveStandardAgent('not-an-agent'), null);
        return [];
      } });
    assert.equal(resolveStandardAgent('not-an-agent'), null);
    assert.equal(reads, 1);
  } finally {
    registerAgentPackageReadinessPort(original ?? { readStatus: () => null });
  }
});
