import { assert, fs, os, path, repoRoot, contractsDir, runCli, runCliFailure, test } from '../helpers.ts';

function withTempHome<T>(callback: (paths: {
  homeRoot: string;
  pathRoot: string;
  stateDir: string;
  modulesRoot: string;
}) => T) {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-framework-locator-home-'));
  const pathRoot = path.join(homeRoot, 'bin');
  fs.mkdirSync(pathRoot, { recursive: true });
  try {
    return callback({
      homeRoot,
      pathRoot,
      stateDir: path.join(homeRoot, 'opl-state'),
      modulesRoot: path.join(homeRoot, 'opl-modules'),
    });
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
}

test('framework locate returns the current OPL Framework dependency environment', () => {
  withTempHome(({ homeRoot, pathRoot, stateDir, modulesRoot }) => {
    const output = runCli(['framework', 'locate'], {
      HOME: homeRoot,
      PATH: pathRoot,
      OPL_STATE_DIR: stateDir,
      OPL_MODULES_ROOT: modulesRoot,
    });

    assert.equal(output.version, 'g2');
    assert.equal(output.framework_locator.surface_id, 'opl_framework_locator');
    assert.equal(output.framework_locator.framework, 'OPL Framework');
    assert.equal(output.framework_locator.status, 'resolved');
    assert.equal(output.framework_locator.resolved.root, fs.realpathSync.native(repoRoot));
    assert.equal(output.framework_locator.resolved.bin, path.join(fs.realpathSync.native(repoRoot), 'bin', 'opl'));
    assert.equal(output.framework_locator.resolved.contracts_dir, contractsDir);
    assert.equal(output.framework_locator.resolved.state_dir, stateDir);
    assert.equal(output.framework_locator.resolved.modules_root, modulesRoot);
    assert.equal(output.framework_locator.agent_contract.embeds_opl_runtime, false);
    assert.equal(output.framework_locator.agent_contract.app_required, false);
    assert.deepEqual(
      output.framework_locator.resolution_order.map((entry: { source: string }) => entry.source),
      [
        'OPL_FRAMEWORK_ROOT',
        'OPL_CLI_BIN',
        'OPL_BIN',
        'PATH:opl',
        'current_cli_entry',
        'sibling_checkout',
      ],
    );
  });
});

test('framework locate honors OPL_FRAMEWORK_ROOT before other locator candidates', () => {
  withTempHome(({ homeRoot, stateDir }) => {
    const output = runCli(['framework', 'locate'], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
      OPL_FRAMEWORK_ROOT: repoRoot,
      OPL_CLI_BIN: path.join(repoRoot, 'bin', 'opl'),
    });

    assert.equal(output.framework_locator.resolved.source, 'OPL_FRAMEWORK_ROOT');
    assert.equal(output.framework_locator.resolved.root, fs.realpathSync.native(repoRoot));
  });
});

test('framework locate fails closed when OPL_FRAMEWORK_ROOT points outside an OPL Framework root', () => {
  const invalidRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-framework-invalid-root-'));
  try {
    const { status, payload } = runCliFailure(['framework', 'locate'], {
      OPL_FRAMEWORK_ROOT: invalidRoot,
    });

    assert.equal(status, 4);
    assert.equal(payload.version, 'g2');
    assert.equal(payload.error.code, 'framework_locator_invalid_root');
    assert.match(payload.error.message, /OPL_FRAMEWORK_ROOT/);
    assert.equal(payload.error.details.candidate, invalidRoot);
  } finally {
    fs.rmSync(invalidRoot, { recursive: true, force: true });
  }
});

test('framework locate is visible in the public help surface', () => {
  const output = runCli(['help', 'framework', 'locate']);

  assert.equal(output.help.command, 'framework locate');
  assert.equal(output.help.usage, 'opl framework locate');
  assert.match(output.help.summary, /Locate the OPL Framework runtime dependency/);
});
