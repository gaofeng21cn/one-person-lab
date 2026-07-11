import {
  assert,
  createFamilyContractsFixtureRoot,
  fs,
  loadFamilyManifestFixtures,
  os,
  path,
  repoRoot,
  runCli,
  test,
} from '../helpers.ts';
import { loadFrameworkContracts } from '../../../../src/modules/charter/contracts.ts';
import { buildRuntimeTraySnapshot } from '../../../../src/modules/console/runtime-tray-snapshot.ts';

test('runtime tray summary can use a non-authoritative manifest projection cache when live manifest is slow', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-drilldown-cache-state-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const manifest = structuredClone(loadFamilyManifestFixtures().medautoscience);
  const manifestPath = path.join(stateRoot, 'manifest.json');
  const slowCommandPath = path.join(stateRoot, 'slow-manifest.cjs');

  try {
    fs.mkdirSync(stateRoot, { recursive: true });
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`, 'utf8');
    fs.writeFileSync(
      slowCommandPath,
      `const fs = require('node:fs');\n`
        + `if (process.env.OPL_TEST_FORCE_MANIFEST_FAILURE === '1') process.exit(42);\n`
        + `setTimeout(() => process.stdout.write(fs.readFileSync(${JSON.stringify(manifestPath)}, 'utf8')), 200);\n`,
      'utf8',
    );
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      repoRoot,
      '--manifest-command',
      `${process.execPath} ${slowCommandPath}`,
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    runCli(['domain', 'manifests'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_DOMAIN_MANIFEST_COMMAND_TIMEOUT_MS: '1000',
    });

    const previousStateDir = process.env.OPL_STATE_DIR;
    const previousContractsDir = process.env.OPL_CONTRACTS_DIR;
    process.env.OPL_STATE_DIR = stateRoot;
    process.env.OPL_CONTRACTS_DIR = fixtureContractsRoot;
    process.env.OPL_TEST_FORCE_MANIFEST_FAILURE = '1';
    try {
      const snapshot = await buildRuntimeTraySnapshot(loadFrameworkContracts(), {
        appOperatorDrilldownDetailLevel: 'full',
      });
      const tray = snapshot.runtime_tray_snapshot;
      assert.equal(tray.domain_manifest_projection_cache.summary.cache_used_count, 1);
      assert.deepEqual(tray.domain_manifest_projection_cache.summary.live_failed_project_ids, ['medautoscience']);
      assert.equal(
        tray.domain_manifest_projection_cache.authority_boundary.cache_is_domain_truth,
        false,
      );
      assert.equal(
        tray.domain_manifest_projection_cache.authority_boundary.live_manifest_refresh_required_for_operating_maturity,
        true,
      );
    } finally {
      if (previousStateDir === undefined) {
        delete process.env.OPL_STATE_DIR;
      } else {
        process.env.OPL_STATE_DIR = previousStateDir;
      }
      if (previousContractsDir === undefined) {
        delete process.env.OPL_CONTRACTS_DIR;
      } else {
        process.env.OPL_CONTRACTS_DIR = previousContractsDir;
      }
      delete process.env.OPL_TEST_FORCE_MANIFEST_FAILURE;
    }
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
