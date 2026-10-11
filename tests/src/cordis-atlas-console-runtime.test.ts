import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { Context } from '@deepseek-ai/cordis';

import { loadFrameworkContracts } from '../../src/authority/contracts/contracts.ts';
import {
  CORDIS_ATLAS_CATALOG_PLUGIN_DESCRIPTOR,
  CORDIS_ATLAS_CATALOG_SERVICE,
  cordisAtlasCatalogPlugin,
} from '../../src/host/plugins/cordis-domain-manifest-catalog.ts';
import {
  buildCordisCompositionSnapshot,
  buildCordisPluginDescriptor,
  CordisCompositionContractError,
} from '../../src/authority/packages/index.ts';
import {
  buildCordisFrameworkReadinessCompositionSnapshot,
  CORDIS_CONSOLE_READINESS_PLUGIN_DESCRIPTOR,
  CORDIS_CONSOLE_READINESS_SERVICE,
  cordisFrameworkReadinessPlugin,
  createCordisFrameworkReadinessComposition,
} from '../../src/host/plugins/cordis-framework-readiness.ts';
import { buildRuntimeTraySnapshot } from '../../src/read-models/operator/runtime-tray-snapshot.ts';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');

test('Atlas and Console descriptors are Pack-contract-backed and compose deterministically', () => {
  const atlasDescriptor = JSON.parse(fs.readFileSync(path.join(
    repoRoot,
    'contracts/opl-framework/cordis-plugins/opl-atlas-catalog.json',
  ), 'utf8'));
  const consoleDescriptor = JSON.parse(fs.readFileSync(path.join(
    repoRoot,
    'contracts/opl-framework/cordis-plugins/opl-console-readiness-projection.json',
  ), 'utf8'));
  assert.deepEqual(CORDIS_ATLAS_CATALOG_PLUGIN_DESCRIPTOR, atlasDescriptor);
  assert.deepEqual(CORDIS_CONSOLE_READINESS_PLUGIN_DESCRIPTOR, consoleDescriptor);
  const snapshot = buildCordisFrameworkReadinessCompositionSnapshot();
  assert.deepEqual(snapshot, buildCordisFrameworkReadinessCompositionSnapshot());
  assert.match(snapshot.snapshot_digest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(snapshot.binding.executor_route, CORDIS_CONSOLE_READINESS_SERVICE);
  assert.deepEqual(
    snapshot.plugins.map((plugin) => plugin.plugin_id),
    [
      'opl-atlas-catalog',
      'opl-console-readiness-projection',
      'opl-ledger-owner-delta-observer',
    ],
  );
});

test('Atlas catalog has no mount effect, runs only on service calls, and disposes cleanly', async () => {
  let catalogCalls = 0;
  const ctx = new Context();
  const fiber = await ctx.plugin(cordisAtlasCatalogPlugin, {
    buildCatalog: ((contracts: unknown, options: Record<string, unknown>) => {
      catalogCalls += 1;
      assert.equal(options.manifestCommandTimeoutMs, 5_000);
      return {
        version: 'g2',
        contracts_context: {},
        domain_manifests: { summary: { total_projects_count: 0, resolved_count: 0 }, projects: [], notes: [] },
      };
    }) as never,
  });
  assert.equal(catalogCalls, 0);
  const service = ctx.get(CORDIS_ATLAS_CATALOG_SERVICE);
  assert.ok(service);
  service({} as never, {
    manifestCommandTimeoutMs: 5_000,
    manifestCommandTimeoutPolicy: 'fixed',
  });
  assert.equal(catalogCalls, 1);
  await fiber.dispose();
  await ctx.fiber.dispose();
  assert.equal(ctx.get(CORDIS_ATLAS_CATALOG_SERVICE), undefined);
});

test('Console readiness requires Atlas and reports typed missing and API compatibility failures', async () => {
  const ctx = new Context();
  const pendingFiber = ctx.plugin(cordisFrameworkReadinessPlugin, {
    runtimeSnapshotProvider: buildRuntimeTraySnapshot,
  });
  assert.equal(ctx.get(CORDIS_CONSOLE_READINESS_SERVICE), undefined);
  await pendingFiber.dispose();
  await ctx.fiber.dispose();

  await assert.rejects(
    createCordisFrameworkReadinessComposition({
      runtimeSnapshotProvider: buildRuntimeTraySnapshot,
      mountAtlas: false,
    }),
    (error: unknown) => {
      assert.ok(error instanceof CordisCompositionContractError);
      assert.equal(error.code, 'missing_required_provider');
      return true;
    },
  );

  const incompatibleAtlas = buildCordisPluginDescriptor({
    ...CORDIS_ATLAS_CATALOG_PLUGIN_DESCRIPTOR,
    plugin_api_version: '2.0.0',
    plugin_ref: 'cordis:plugin:opl-atlas-catalog@2.0.0',
  });
  assert.throws(() => buildCordisCompositionSnapshot({
    framework: {
      package: '@deepseek-ai/cordis',
      version: '4.0.1',
      integrity: 'fixture-integrity',
    },
    binding: {
      executor_adapter_id: CORDIS_ATLAS_CATALOG_SERVICE,
      executor_route: CORDIS_CONSOLE_READINESS_SERVICE,
    },
    foundry_evidence_ref: null,
    plugins: [incompatibleAtlas, CORDIS_CONSOLE_READINESS_PLUGIN_DESCRIPTOR],
  }), (error: unknown) => {
    assert.ok(error instanceof CordisCompositionContractError);
    assert.equal(error.code, 'plugin_api_incompatible');
    return true;
  });
});

test('Atlas and Console session composition exposes both services and tears them down', async () => {
  const composition = await createCordisFrameworkReadinessComposition({
    runtimeSnapshotProvider: buildRuntimeTraySnapshot,
  });
  assert.ok(composition.ctx.get(CORDIS_ATLAS_CATALOG_SERVICE));
  assert.ok(composition.ctx.get(CORDIS_CONSOLE_READINESS_SERVICE));
  assert.equal(composition.readiness, composition.ctx.get(CORDIS_CONSOLE_READINESS_SERVICE));
  assert.deepEqual(composition.snapshot, buildCordisFrameworkReadinessCompositionSnapshot());
  await composition.dispose();
  assert.equal(composition.ctx.get(CORDIS_ATLAS_CATALOG_SERVICE), undefined);
  assert.equal(composition.ctx.get(CORDIS_CONSOLE_READINESS_SERVICE), undefined);
});

test('framework readiness CLI source routes full and compact through the Cordis successor', () => {
  const source = fs.readFileSync(path.join(
    repoRoot,
    'src/entrypoints/cli/cases/public-command-specs-parts/framework.ts',
  ), 'utf8');
  assert.match(source, /runCordisFrameworkReadiness\(/);
  assert.doesNotMatch(source, /buildFrameworkReadinessSummary\(/);
  assert.doesNotMatch(source, /buildFrameworkReadinessCompactReadback\(/);
  const fullSource = fs.readFileSync(path.join(
    repoRoot,
    'src/read-models/operator/framework-readiness.ts',
  ), 'utf8');
  const compactSource = fs.readFileSync(path.join(
    repoRoot,
    'src/read-models/operator/framework-readiness-compact-readback.ts',
  ), 'utf8');
  assert.doesNotMatch(fullSource, /buildDomainManifestCatalog\(/);
  assert.doesNotMatch(compactSource, /buildDomainManifestCatalog\(/);
  assert.ok(loadFrameworkContracts());
});
