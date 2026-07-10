import {
  assert,
  createFakeCodexFixture,
  fs,
  os,
  path,
  runCli,
  test,
} from '../helpers.ts';
import { runGitFixtureCommand } from '../helpers-parts/family-fixtures.ts';
import {
  createStartupDomainModuleRemotes,
  removeStartupDomainModuleRemotes,
  withCliTimeout,
} from './system-startup-maintenance-cases/shared.ts';

function writeFrameworkFixture(root: string) {
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.mkdirSync(path.join(root, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'opl-framework-fixture' }));
  fs.writeFileSync(path.join(root, 'src', 'cli.ts'), '// framework fixture\n');
  fs.writeFileSync(path.join(root, 'bin', 'opl'), '#!/usr/bin/env bash\n', { mode: 0o755 });
}

test('system update remains an executable public route', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-system-update-route-'));
  const sourceRoot = path.join(homeRoot, 'framework-source');
  const targetRoot = path.join(homeRoot, 'framework-target');
  const codex = createFakeCodexFixture('echo "codex-cli 0.125.0"');
  writeFrameworkFixture(sourceRoot);
  writeFrameworkFixture(targetRoot);
  runGitFixtureCommand(sourceRoot, ['init', '--initial-branch', 'main']);
  runGitFixtureCommand(sourceRoot, ['add', '-A']);
  runGitFixtureCommand(sourceRoot, [
    '-c', 'user.name=OPL Test',
    '-c', 'user.email=opl@example.test',
    'commit', '-m', 'Framework fixture',
  ]);

  try {
    const output = runCli(['system', 'update'], {
      HOME: homeRoot,
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      OPL_MODULES_ROOT: path.join(homeRoot, 'modules'),
      OPL_FRAMEWORK_UPDATE_SOURCE: sourceRoot,
      OPL_FRAMEWORK_UPDATE_TARGET_ROOT: targetRoot,
      OPL_FRAMEWORK_UPDATE_SKIP_DEPENDENCY_INSTALL: '1',
      OPL_CODEX_CLI_LATEST_VERSION: '0.125.0',
      PATH: `${codex.fixtureRoot}:/usr/bin:/bin`,
    }) as any;
    const targets = new Map<string, any>(
      output.system_action.details.targets.map((item: any) => [`${item.target_type}:${item.target_id}`, item]),
    );

    assert.equal(output.system_action.action, 'update');
    assert.equal(output.system_action.status, 'completed');
    assert.equal(targets.get('framework:opl-framework')?.status, 'completed');
    assert.equal(targets.get('engine:codex')?.reason, 'selected_codex_ready');
  } finally {
    fs.rmSync(codex.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('system reconcile-modules executes clean, missing, and dirty module owners', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-system-reconcile-'));
  const modulesRoot = path.join(homeRoot, 'modules');
  const remotes = createStartupDomainModuleRemotes({
    logPath: path.join(homeRoot, 'module-actions.log'),
  });
  const env = {
    HOME: homeRoot,
    CODEX_HOME: path.join(homeRoot, 'codex-home'),
    OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
    OPL_MODULES_ROOT: modulesRoot,
    OPL_MODULE_REPO_URL_MEDAUTOSCIENCE: remotes.masRemote.remoteRoot,
    OPL_MODULE_REPO_URL_MEDAUTOGRANT: remotes.magRemote.remoteRoot,
    OPL_MODULE_REPO_URL_REDCUBE: remotes.rcaRemote.remoteRoot,
    OPL_MODULE_REPO_URL_OPLMETAAGENT: remotes.metaRemote.remoteRoot,
    OPL_MODULE_REPO_URL_OPLBOOKFORGE: remotes.bookForgeRemote.remoteRoot,
    OPL_GIT_RETRY_ATTEMPTS: '1',
  };

  try {
    withCliTimeout('120000', () => runCli(['connect', 'install', '--module', 'medautoscience'], env));
    withCliTimeout('120000', () => runCli(['connect', 'install', '--module', 'medautogrant'], env));
    fs.writeFileSync(path.join(modulesRoot, 'med-autogrant', 'LOCAL-CHANGE.md'), 'dirty\n');
    const nextMasSha = remotes.masRemote.advance(
      'CHANGELOG.md',
      'available through reconcile\n',
      'Advance MAS fixture',
    );

    const output = withCliTimeout(
      '120000',
      () => runCli(['system', 'reconcile-modules'], env),
    ) as any;
    const targets = new Map<string, any>(
      output.system_action.details.targets.map((item: any) => [item.target_id, item]),
    );

    assert.equal(output.system_action.action, 'reconcile_modules');
    assert.equal(output.system_action.status, 'manual_required');
    assert.equal(targets.get('medautoscience')?.status, 'completed');
    assert.equal(targets.get('medautoscience')?.reason, 'module_update_available');
    assert.equal(targets.get('oplmetaagent')?.status, 'completed');
    assert.equal(targets.get('oplmetaagent')?.reason, 'module_missing');
    assert.equal(targets.get('medautogrant')?.status, 'manual_required');
    assert.equal(targets.get('medautogrant')?.reason, 'dirty_checkout');

    const modules = runCli(['connect', 'modules'], env) as any;
    const mas = modules.modules.items.find((item: any) => item.module_id === 'medautoscience');
    assert.equal(mas.git?.head_sha, nextMasSha);
  } finally {
    removeStartupDomainModuleRemotes(remotes);
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});
