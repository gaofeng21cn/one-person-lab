import { spawnSync } from 'node:child_process';

import { parseJsonText } from '../../../../../src/kernel/json-file.ts';
import { assert, fs, os, path, repoRoot, test } from '../../helpers.ts';

test('native helper doctor script emits lifecycle JSON without mutating domain truth', () => {
  const helperBinDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-native-helper-bin-'));
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-manager-state-'));

  for (const binary of ['opl-doctor-native', 'opl-runtime-watch', 'opl-artifact-indexer', 'opl-state-indexer']) {
    const helperPath = path.join(helperBinDir, binary);
    fs.writeFileSync(
      helperPath,
      `#!/bin/sh
cat >/dev/null
case "$(basename "$0")" in
  opl-doctor-native)
    printf '%s\\n' '{"protocol_version":"opl_native_helper.v1","helper_id":"opl-doctor-native","ok":true,"request_id":"runtime-manager-doctor","result":{"surface_kind":"native_doctor_snapshot"},"errors":[]}'
    ;;
  opl-runtime-watch)
    printf '%s\\n' '{"protocol_version":"opl_native_helper.v1","helper_id":"opl-runtime-watch","ok":true,"request_id":"runtime-manager-runtime-watch","result":{"surface_kind":"runtime_health_snapshot_index","roots":[]},"errors":[]}'
    ;;
  opl-artifact-indexer)
    printf '%s\\n' '{"protocol_version":"opl_native_helper.v1","helper_id":"opl-artifact-indexer","ok":true,"request_id":"runtime-manager-artifact-index","result":{"surface_kind":"native_artifact_manifest","summary":{"total_files_count":0},"files":[]},"errors":[]}'
    ;;
  opl-state-indexer)
    printf '%s\\n' '{"protocol_version":"opl_native_helper.v1","helper_id":"opl-state-indexer","ok":true,"request_id":"runtime-manager-state-index","result":{"surface_kind":"native_state_index","roots":[],"json_validation":{"checked_files_count":0,"invalid_files_count":0,"files":[]}},"errors":[]}'
    ;;
esac
`,
      { mode: 0o755 },
    );
  }

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
