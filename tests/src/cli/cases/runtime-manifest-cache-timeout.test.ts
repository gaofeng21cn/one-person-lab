import {
  assert,
  createFamilyContractsFixtureRoot,
  fs,
  loadFrameworkContracts,
  os,
  path,
  runCli,
  test,
} from '../helpers.ts';
import { buildFrameworkReadinessSummary } from '../../../../src/modules/foundry-lab/framework-readiness.ts';
import { buildRuntimeTraySnapshot } from '../../../../src/modules/console/runtime-tray-snapshot.ts';
import { buildManyStageManifest } from './runtime-app-operator-drilldown-summary-fixtures.ts';
import { createFamilyWorkspaceFixture } from './runtime-app-operator-drilldown-helpers.ts';
import { createAdmittedStagePackFixture } from './workspace-domain-test-helper.ts';

test('framework readiness keeps domain manifest live refresh bounded and uses projection cache on slow manifests', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-framework-readiness-cache-state-'));
  const familyWorkspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-framework-readiness-cache-family-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const { omaRepoDir, workspaceRoot } = createFamilyWorkspaceFixture(familyWorkspaceRoot);
  const manifest = buildManyStageManifest(2);
  const masPack = createAdmittedStagePackFixture(manifest, 'med-autoscience', 'MedAutoScience', {
    stageCount: 2,
  });
  const manifestPath = path.join(stateRoot, 'manifest.json');
  const invocationPath = path.join(stateRoot, 'manifest-invocations.log');
  const slowCommandPath = path.join(stateRoot, 'slow-readiness-manifest.cjs');

  try {
    fs.mkdirSync(stateRoot, { recursive: true });
    fs.writeFileSync(manifestPath, `${JSON.stringify(masPack.manifest)}\n`, 'utf8');
    fs.writeFileSync(
      slowCommandPath,
      `const fs = require('node:fs');\n`
        + `fs.appendFileSync(${JSON.stringify(invocationPath)}, '1\\n');\n`
        + `setTimeout(() => process.stdout.write(fs.readFileSync(${JSON.stringify(manifestPath)}, 'utf8')), 6500);\n`,
      'utf8',
    );
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      masPack.repoDir,
      '--manifest-command',
      `${process.execPath} ${slowCommandPath}`,
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    runCli(['domain', 'manifests'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_DOMAIN_MANIFEST_COMMAND_TIMEOUT_MS: '9000',
    });
    assert.equal(fs.readFileSync(invocationPath, 'utf8').trim().split('\n').length, 1);

    const previousStateDir = process.env.OPL_STATE_DIR;
    const previousContractsDir = process.env.OPL_CONTRACTS_DIR;
    const previousFamilyWorkspaceRoot = process.env.OPL_FAMILY_WORKSPACE_ROOT;
    const previousOmaRepoDir = process.env.OPL_META_AGENT_REPO_DIR;
    process.env.OPL_STATE_DIR = stateRoot;
    process.env.OPL_CONTRACTS_DIR = fixtureContractsRoot;
    process.env.OPL_FAMILY_WORKSPACE_ROOT = workspaceRoot;
    process.env.OPL_META_AGENT_REPO_DIR = omaRepoDir;
    try {
      const readiness = (await buildFrameworkReadinessSummary(loadFrameworkContracts(), {
        familyDefaults: true,
      }, { runtimeSnapshotProvider: buildRuntimeTraySnapshot })).framework_readiness;
      assert.equal(readiness.surface_kind, 'opl_framework_readiness_summary');
      assert.equal(readiness.summary.domain_manifest_projection_cache_used_count, 1);
      assert.deepEqual(readiness.summary.domain_manifest_live_failed_project_ids, ['medautoscience']);
      assert.deepEqual(readiness.summary.domain_manifest_live_failure_timeout_ms_values, [5000]);
      assert.equal(
        fs.readFileSync(invocationPath, 'utf8').trim().split('\n').length,
        2,
      );
    } finally {
      restoreEnvVar('OPL_STATE_DIR', previousStateDir);
      restoreEnvVar('OPL_CONTRACTS_DIR', previousContractsDir);
      restoreEnvVar('OPL_FAMILY_WORKSPACE_ROOT', previousFamilyWorkspaceRoot);
      restoreEnvVar('OPL_META_AGENT_REPO_DIR', previousOmaRepoDir);
    }
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(familyWorkspaceRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
    fs.rmSync(masPack.repoDir, { recursive: true, force: true });
  }
});

test('runtime tray full detail keeps manifest live refresh bounded and uses projection cache on slow manifests', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-drilldown-full-cache-state-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const manifest = buildManyStageManifest(3);
  const masPack = createAdmittedStagePackFixture(manifest, 'med-autoscience', 'MedAutoScience', {
    stageCount: 3,
  });
  const manifestPath = path.join(stateRoot, 'manifest.json');
  const slowCommandPath = path.join(stateRoot, 'slow-full-manifest.cjs');

  try {
    fs.mkdirSync(stateRoot, { recursive: true });
    fs.writeFileSync(manifestPath, `${JSON.stringify(masPack.manifest)}\n`, 'utf8');
    fs.writeFileSync(
      slowCommandPath,
      `const fs = require('node:fs');\n`
        + `setTimeout(() => process.stdout.write(fs.readFileSync(${JSON.stringify(manifestPath)}, 'utf8')), 6500);\n`,
      'utf8',
    );
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      masPack.repoDir,
      '--manifest-command',
      `${process.execPath} ${slowCommandPath}`,
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    runCli(['domain', 'manifests'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_DOMAIN_MANIFEST_COMMAND_TIMEOUT_MS: '9000',
    });

    const previousStateDir = process.env.OPL_STATE_DIR;
    const previousContractsDir = process.env.OPL_CONTRACTS_DIR;
    process.env.OPL_STATE_DIR = stateRoot;
    process.env.OPL_CONTRACTS_DIR = fixtureContractsRoot;
    try {
      const snapshot = await buildRuntimeTraySnapshot(loadFrameworkContracts(), {
        appOperatorDrilldownDetailLevel: 'full',
      });
      const tray = snapshot.runtime_tray_snapshot;
      assert.equal(tray.app_operator_drilldown.stage_production_evidence.summary.stage_count, 3);
      assert.equal(tray.domain_manifest_projection_cache.summary.cache_used_count, 1);
      assert.deepEqual(tray.domain_manifest_projection_cache.summary.live_failed_project_ids, ['medautoscience']);
      const cachedProject = tray.domain_manifest_projection_cache.projects[0];
      assert.ok(cachedProject.cache);
      assert.ok(
        typeof cachedProject.cache.source_error === 'object'
          && cachedProject.cache.source_error !== null
          && 'timeout_ms' in cachedProject.cache.source_error,
      );
      assert.equal(cachedProject.cache.source_status, 'command_timeout');
      assert.ok(cachedProject.cache.source_error && typeof cachedProject.cache.source_error === 'object');
      assert.equal((cachedProject.cache.source_error as { timeout_ms?: number }).timeout_ms, 5000);
    } finally {
      restoreEnvVar('OPL_STATE_DIR', previousStateDir);
      restoreEnvVar('OPL_CONTRACTS_DIR', previousContractsDir);
    }
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(masPack.repoDir, { recursive: true, force: true });
  }
});

function restoreEnvVar(name: string, previousValue: string | undefined): void {
  if (previousValue === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = previousValue;
  }
}
