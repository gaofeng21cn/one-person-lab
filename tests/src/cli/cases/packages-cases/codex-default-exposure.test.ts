import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import { parseJsonText } from '../../../../../src/kernel/json-file.ts';
import { buildLock } from '../../../../../src/modules/connect/agent-package-registry-parts/lifecycle-lock.ts';
import { normalizePackageManifest } from '../../../../../src/modules/connect/agent-package-registry-parts/manifest-normalizers.ts';
import { materializePhysicalCodexSurface } from '../../../../../src/modules/connect/agent-package-registry-parts/physical-surface.ts';
import { materializeCapabilityScopeFromLock } from '../../../../../src/modules/connect/agent-package-registry-parts/scope-materialization.ts';
import { writeCapabilityProvider } from './capability-fixtures.ts';

function withEnvironment<T>(values: Record<string, string>, run: () => T) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.assign(process.env, values);
  try {
    return run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('all package manifest normalizers preserve typed Codex default exposure', () => {
  for (const [packageId, expected] of [
    ['mas', true],
    ['mas-scholar-skills', false],
    ['opl-flow', true],
  ] as const) {
    const manifestPath = path.resolve('contracts', 'opl-framework', 'packages', `${packageId}.json`);
    const payload = parseJsonText(fs.readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
    const normalized = normalizePackageManifest(payload, pathToFileURL(manifestPath).href);
    assert.equal(normalized.codex_default_exposure, expected);

    const invalid = structuredClone(payload) as Record<string, any>;
    invalid.codex_surface.codex_default_exposure = 'workspace_only';
    assert.throws(
      () => normalizePackageManifest(invalid, pathToFileURL(manifestPath).href),
      (error: any) => error?.details?.failure_code === 'agent_package_codex_default_exposure_invalid',
    );
  }
});

test('hidden capability packages keep immutable cache but leave global Codex surfaces clean', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-hidden-capability-exposure-'));
  const home = path.join(root, 'home');
  const codexHome = path.join(home, 'Library', 'Application Support', 'OPL', 'codex');
  const stateDir = path.join(home, 'Library', 'Application Support', 'OPL', 'state');
  const providerRoot = path.join(root, 'provider');
  const workspace = path.join(root, 'workspace');
  const manifestPath = writeCapabilityProvider(providerRoot);
  const configPath = path.join(codexHome, 'config.toml');
  const canonicalMarketplaceId = 'mas-scholar-skills-local';
  const legacyMarketplaceId = 'opl-agent-mas-scholar-skills-local';
  const legacyMarketplaceRoot = path.join(stateDir, 'codex-plugin-marketplaces', legacyMarketplaceId);
  const canonicalMarketplaceRoot = path.join(stateDir, 'codex-plugin-marketplaces', canonicalMarketplaceId);
  const legacyCacheRoot = path.join(codexHome, 'plugins', 'cache', legacyMarketplaceId);

  fs.mkdirSync(path.join(legacyMarketplaceRoot, 'plugins', 'mas-scholar-skills'), { recursive: true });
  fs.mkdirSync(path.join(canonicalMarketplaceRoot, 'plugins', 'mas-scholar-skills'), { recursive: true });
  fs.mkdirSync(legacyCacheRoot, { recursive: true });
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, [
    '[features]',
    'fixture = true',
    '',
    `[marketplaces.${legacyMarketplaceId}]`,
    `source = "${legacyMarketplaceRoot}"`,
    '',
    `[plugins."mas-scholar-skills@${legacyMarketplaceId}"]`,
    'enabled = true',
    '',
    `[marketplaces.${canonicalMarketplaceId}]`,
    `source = "${canonicalMarketplaceRoot}"`,
    '',
    `[plugins."mas-scholar-skills@${canonicalMarketplaceId}"]`,
    'enabled = true',
    '',
  ].join('\n'));

  try {
    withEnvironment({ HOME: home, CODEX_HOME: codexHome, OPL_STATE_DIR: stateDir }, () => {
      const manifestJson = fs.readFileSync(manifestPath, 'utf8');
      const manifest = normalizePackageManifest(
        parseJsonText(manifestJson),
        pathToFileURL(manifestPath).href,
      );
      const physicalSurface = materializePhysicalCodexSurface(manifest, false);

      assert.equal(physicalSurface.status, 'materialized');
      assert.equal(physicalSurface.marketplace_id, null);
      assert.equal(physicalSurface.marketplace_root, null);
      assert.equal(physicalSurface.marketplace_path, null);
      assert.equal(physicalSurface.marketplace_plugin_path, null);
      assert.ok(physicalSurface.codex_plugin_cache_path);
      assert.equal(fs.existsSync(physicalSurface.codex_plugin_cache_path), true);
      assert.equal(fs.existsSync(physicalSurface.plugin_manifest_path!), true);
      assert.equal(
        fs.existsSync(path.join(
          physicalSurface.codex_plugin_cache_path,
          'skills',
          'medical-manuscript-writing',
          'SKILL.md',
        )),
        true,
      );
      assert.equal(fs.existsSync(legacyMarketplaceRoot), false);
      assert.equal(fs.existsSync(canonicalMarketplaceRoot), false);
      assert.equal(fs.existsSync(legacyCacheRoot), false);
      const config = fs.readFileSync(configPath, 'utf8');
      assert.match(config, /\[features\]/);
      assert.doesNotMatch(config, /mas-scholar-skills/);

      const manifestSha256 = crypto.createHash('sha256').update(manifestJson).digest('hex');
      const lock = buildLock({
        manifest,
        manifestUrl: pathToFileURL(manifestPath).href,
        manifestSha256,
        sourceKind: 'local_manifest_file',
        trustTier: 'first_party',
        receiptRef: 'opl://test/hidden-capability',
        physicalSurface,
      });
      assert.equal(lock.exposure_state, 'hidden');

      fs.mkdirSync(workspace, { recursive: true });
      const materialization = materializeCapabilityScopeFromLock({
        provider: lock,
        scope: 'workspace',
        targetRoot: workspace,
        transactionId: 'hidden-capability-workspace-projection',
        dryRun: false,
      });
      assert.equal(materialization.scope, 'workspace');
      assert.equal(
        fs.existsSync(path.join(
          workspace,
          '.codex',
          'skills',
          'medical-manuscript-writing',
          'SKILL.md',
        )),
        true,
      );
      assert.equal(fs.existsSync(path.join(codexHome, 'skills')), false);
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
