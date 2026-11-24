import { assert, fs, os, path, repoRoot, runCli, test } from '../../helpers.ts';
import { parseJsonText } from '../../../../../src/kernel/json-file.ts';

test('runtime manager reports the native helper package and repair lifecycle', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-manager-state-'));

  try {
    const output = runCli(['runtime', 'manager'], {
      OPL_STATE_DIR: stateRoot,
    });

    assert.equal(output.runtime_manager.native_helper_target.lifecycle.status, 'ready');
    assert.deepEqual(output.runtime_manager.native_helper_target.lifecycle.commands, {
      doctor: 'npm run native:doctor',
      repair: 'npm run native:repair',
    });
    assert.equal(output.runtime_manager.native_helper_target.lifecycle.package.status, 'included');
    assert.equal(
      output.runtime_manager.native_helper_target.lifecycle.package.required_files.includes('scripts/native-helper.mjs'),
      true,
    );
    assert.equal(output.runtime_manager.native_helper_target.lifecycle.implementation.runtime, 'node');
    assert.equal(output.runtime_manager.native_helper_target.lifecycle.implementation.version, 'node-stdlib.v1');

    const packageJson = parseJsonText(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')) as any;
    assert.equal(packageJson.scripts['native:doctor'], 'node ./scripts/native-helper-doctor.mjs');
    assert.equal(packageJson.scripts['native:repair'], 'node ./scripts/native-helper-doctor.mjs');
    assert.equal(packageJson.files.includes('scripts/native-helper.mjs'), true);
    assert.equal(packageJson.files.includes('scripts/native-helper-doctor.mjs'), true);
    assert.equal(packageJson.files.includes('scripts/native-helper-family-smoke.mjs'), true);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
