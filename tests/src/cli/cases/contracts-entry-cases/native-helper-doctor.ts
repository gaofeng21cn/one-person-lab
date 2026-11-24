import { spawnSync } from 'node:child_process';

import { parseJsonText } from '../../../../../src/kernel/json-file.ts';
import { assert, fs, os, path, repoRoot, test } from '../../helpers.ts';
import { writeNativeHelperFixtureScripts } from '../native-helper-fixtures.ts';

test('native helper doctor script emits lifecycle JSON without mutating domain truth', () => {
  const helperBinDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-native-helper-bin-'));
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-manager-state-'));

  writeNativeHelperFixtureScripts(helperBinDir, { artifactTotalFilesCount: 0 });

  try {
    const result = spawnSync(process.execPath, [path.join(repoRoot, 'scripts/native-helper-doctor.mjs')], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        OPL_NATIVE_HELPER_BIN_DIR: helperBinDir,
        OPL_STATE_DIR: stateRoot,
      },
    });
    assert.equal(result.status, 0, result.stderr);
    const output = parseJsonText(result.stdout) as any;
    assert.equal(output.surface_kind, 'opl_native_helper_lifecycle_doctor');
    assert.equal(output.lifecycle.commands.repair, 'npm run native:repair');
    assert.equal(output.runtime.status, 'available');
    assert.equal(fs.existsSync(path.join(stateRoot, 'runtime-manager', 'native-state-index.json')), false);
  } finally {
    fs.rmSync(helperBinDir, { recursive: true, force: true });
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
