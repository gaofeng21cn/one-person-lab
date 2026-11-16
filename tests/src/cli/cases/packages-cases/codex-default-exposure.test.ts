import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import { parseJsonText } from '../../../../../src/kernel/json-file.ts';
import { normalizePackageManifest } from '../../../../../src/adapters/integration/agent-package-registry-parts/manifest-normalizers.ts';

test('all package manifest normalizers preserve typed Codex default exposure', () => {
  for (const [packageId, expected] of [
    ['mas', true],
    ['mas-scholar-skills', false],
    ['opl-flow', true],
  ] as const) {
    const manifestPath = path.resolve('contracts', 'opl-framework', 'packages', `${packageId}.json`);
    const payload = parseJsonText(fs.readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
    payload.rollback_ref = `rollback-ref:${packageId}/legacy`;
    const normalized = normalizePackageManifest(payload, pathToFileURL(manifestPath).href);
    assert.equal(normalized.codex_default_exposure, expected);
    assert.equal(Object.hasOwn(normalized, 'rollback_ref'), false);

    const invalid = structuredClone(payload) as Record<string, any>;
    invalid.codex_surface.codex_default_exposure = 'workspace_only';
    assert.throws(
      () => normalizePackageManifest(invalid, pathToFileURL(manifestPath).href),
      (error: any) => error?.details?.failure_code === 'agent_package_codex_default_exposure_invalid',
    );
  }
});

test('only capability Packages may declare headless internal Codex interaction', () => {
  const manifestPath = path.resolve(
    'contracts',
    'opl-framework',
    'packages',
    'opl-fleet-agent.json',
  );
  const payload = parseJsonText(fs.readFileSync(manifestPath, 'utf8')) as Record<string, any>;
  payload.codex_surface.interaction_mode = 'headless_internal';
  const normalized = normalizePackageManifest(payload, pathToFileURL(manifestPath).href);
  assert.equal(normalized.codex_interaction_mode, 'headless_internal');
  assert.equal(normalized.configured_codex_plugin_carrier?.interactionMode, 'headless_internal');

  const invalidValue = structuredClone(payload);
  invalidValue.codex_surface.interaction_mode = 'hidden';
  assert.throws(
    () => normalizePackageManifest(invalidValue, pathToFileURL(manifestPath).href),
    (error: any) => error?.details?.failure_code === 'agent_package_codex_interaction_mode_invalid',
  );

  const agentPath = path.resolve('contracts', 'opl-framework', 'packages', 'mas.json');
  const agentPayload = parseJsonText(fs.readFileSync(agentPath, 'utf8')) as Record<string, any>;
  agentPayload.codex_surface.interaction_mode = 'headless_internal';
  assert.throws(
    () => normalizePackageManifest(agentPayload, pathToFileURL(agentPath).href),
    (error: any) => error?.details?.failure_code === 'agent_package_codex_interaction_mode_role_invalid',
  );
});

test('internal OPL carriers stay headless while interactive Packages remain selectable', () => {
  for (const [packageId, expectedMode] of [
    ['opl-channel-weixin', 'headless_internal'],
    ['opl-fleet-agent', 'headless_internal'],
    ['opl-flow', 'interactive'],
  ] as const) {
    const manifestPath = path.resolve('contracts', 'opl-framework', 'packages', `${packageId}.json`);
    const normalized = normalizePackageManifest(
      parseJsonText(fs.readFileSync(manifestPath, 'utf8')),
      pathToFileURL(manifestPath).href,
    );
    assert.equal(normalized.codex_interaction_mode, expectedMode, packageId);
  }
});

test('non-admitted Packages retain metadata without default registration or publication', async (t) => {
  const { buildCodexFamilyPluginSpecs } = await import('../../../../../src/adapters/integration/system-installation/codex-plugin-registry.ts');
  const { getOplPackageSpecs, getPublicationAdmittedOplPackageSpecs } = await import('../../../../../src/adapters/integration/package-distribution.ts');
  const packageDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-development-package-projection-'));
  t.after(() => fs.rmSync(packageDirectory, { recursive: true, force: true }));
  const packageId = 'fixture-development-agent';
  const descriptor = {
    surface_kind: 'opl_agent_package_manifest.v1',
    package_id: packageId,
    agent_id: packageId,
    display_name: 'Fixture Development Agent',
    publisher: 'example',
    version: '1.0.0',
    source: 'first_party',
    source_repo: `https://example.test/${packageId}.git`,
    carrier_source_role: 'codex_plugin_default_carrier_not_package_truth',
    publication_channel_admission: 'development_only',
    publication_source: {
      owner_package_manifest_ref: 'opl-package.json',
      owner_plugin_manifest_ref: '.codex-plugin/plugin.json',
    },
    runtime_source_carrier: { module_id: packageId },
    standard_agent_descriptor_projection: {
      surface_kind: 'opl_standard_agent_descriptor_projection.v1',
      source_ref: 'contracts/domain_descriptor.json',
      interface_source_ref: 'contracts/domain_descriptor.json#/standard_agent_interface',
      domain_id: packageId,
      runtime_domain_id: packageId,
      explicit_aliases: [],
      compatibility: { registry_domain_id: packageId, owner_aliases: [] },
    },
    codex_surface: {
      plugin_id: packageId,
      standalone_distribution: 'repo_carrier_source',
      required_skill_ids: [packageId],
      configured_codex_plugin_carrier: {
        kind: 'codex_plugin_manager',
        plugin_selector: `${packageId}@${packageId}`,
        executor_route: 'codex_cli',
        marketplace_source: `example/${packageId}`,
        publication_ref: `ghcr.io/example/packages/${packageId}:latest-stable`,
      },
    },
    capability_dependencies: [],
  };
  const manifestPath = path.join(packageDirectory, `${packageId}.json`);
  const writeDescriptor = () => fs.writeFileSync(manifestPath, JSON.stringify(descriptor));
  for (const admission of ['development_only', 'retired']) {
    descriptor.publication_channel_admission = admission;
    writeDescriptor();
    assert.deepEqual(getOplPackageSpecs(packageDirectory).map(spec => ({
      package_id: spec.package_id,
      admission: spec.publication_channel_admission,
    })), [{ package_id: packageId, admission }]);
    assert.deepEqual(buildCodexFamilyPluginSpecs(packageDirectory), []);
    assert.deepEqual(getPublicationAdmittedOplPackageSpecs(packageDirectory), []);
  }

  descriptor.publication_channel_admission = 'admitted';
  writeDescriptor();
  assert.deepEqual(buildCodexFamilyPluginSpecs(packageDirectory).map(spec => spec.pack_id), [packageId]);
  assert.deepEqual(getPublicationAdmittedOplPackageSpecs(packageDirectory).map(spec => spec.package_id), [packageId]);
});
