import { assert, fs, os, path, repoRoot, runCli, test } from '../../helpers.ts';
import { parseJsonText } from '../../../../../src/kernel/json-file.ts';

test('runtime manager reports the native helper package and repair lifecycle', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-manager-state-'));

  try {
    const output = runCli(['runtime', 'manager'], {
      OPL_STATE_DIR: stateRoot,
    });

    assert.equal(output.runtime_manager.native_helper_target.lifecycle.status, 'ready_to_build');
    assert.deepEqual(output.runtime_manager.native_helper_target.lifecycle.commands, {
      build: 'npm run native:build',
      cache: 'npm run native:cache',
      doctor: 'npm run native:doctor',
      prebuild: 'npm run native:prebuild',
      prebuild_pack: 'npm run native:prebuild-pack',
      prebuild_check: 'npm run native:prebuild-check',
      repair: 'npm run native:repair',
      test: 'npm run native:test',
    });
    assert.equal(
      output.runtime_manager.native_helper_target.lifecycle.prebuild.install_command,
      'npm run native:prebuild',
    );
    assert.deepEqual(
      output.runtime_manager.native_helper_target.lifecycle.prebuild.restore_order,
      [
        'OPL_NATIVE_HELPER_PREBUILD_ROOT',
        'package native-helper-prebuilds',
        'GHCR one-person-lab-native-helper OCI archive',
        'local Cargo build fallback',
      ],
    );
    assert.match(
      output.runtime_manager.native_helper_target.lifecycle.cache.cache_dir,
      /native-helper\/bin\/.+\/0\.1\.0$/,
    );
    assert.equal(output.runtime_manager.native_helper_target.lifecycle.cache.target_triple, `${process.platform}-${process.arch}`);
    assert.equal(output.runtime_manager.native_helper_target.lifecycle.package.status, 'included');
    assert.equal(
      output.runtime_manager.native_helper_target.lifecycle.package.required_files.includes('native/opl-native-helper/src/lib.rs'),
      true,
    );

    const packageJson = parseJsonText(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')) as any;
    assert.equal(packageJson.scripts['native:cache'], 'node ./scripts/native-helper-cache.mjs');
    assert.equal(packageJson.scripts['native:doctor'], 'node ./scripts/native-helper-doctor.mjs');
    assert.equal(packageJson.scripts['native:prebuild'], 'node ./scripts/native-helper-prebuild.mjs install');
    assert.equal(packageJson.scripts['native:repair'], 'node ./scripts/native-helper-repair.mjs');
    assert.equal(packageJson.files.includes('native-helper-prebuilds'), true);
    assert.equal(packageJson.files.includes('native/opl-native-helper/src'), true);
    assert.equal(packageJson.files.includes('scripts/native-helper-doctor.mjs'), true);
    assert.equal(packageJson.files.includes('scripts/native-helper-prebuild.mjs'), true);
    assert.equal(packageJson.files.includes('scripts/native-helper-repair.mjs'), true);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
