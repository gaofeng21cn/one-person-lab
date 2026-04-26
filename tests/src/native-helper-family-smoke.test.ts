import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

test('native family smoke indexes MAS and MAG workspaces without touching RCA', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-smoke-'));
  const familyRoot = path.join(fixtureRoot, 'workspace');
  const helperBinDir = path.join(fixtureRoot, 'native-bin');
  fs.mkdirSync(helperBinDir, { recursive: true });

  for (const repoName of ['med-autoscience', 'med-autogrant']) {
    fs.mkdirSync(path.join(familyRoot, repoName, 'docs'), { recursive: true });
    fs.mkdirSync(path.join(familyRoot, repoName, 'contracts'), { recursive: true });
    fs.writeFileSync(path.join(familyRoot, repoName, 'docs', 'status.md'), `# ${repoName}\n`);
    fs.writeFileSync(path.join(familyRoot, repoName, 'contracts', 'surface.json'), '{"ok":true}\n');
  }

  for (const binary of ['opl-artifact-indexer', 'opl-state-indexer']) {
    fs.writeFileSync(
      path.join(helperBinDir, binary),
      `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
const helper = path.basename(process.argv[1]);
const result = helper === 'opl-artifact-indexer'
  ? { surface_kind: 'native_artifact_manifest', workspace_root: input.workspace_root, summary: { total_files_count: 2 }, files: [] }
  : { surface_kind: 'native_state_index', roots: [{ root: input.workspace_root, file_count: 2 }], json_validation: { checked_files_count: 1, invalid_files_count: 0, files: [] } };
process.stdout.write(JSON.stringify({
  protocol_version: 'opl_native_helper.v1',
  helper_id: helper,
  helper_version: '0.1.0',
  crate_name: 'opl-native-helper',
  crate_version: '0.1.0',
  ok: true,
  request_id: input.request_id,
  result,
  errors: [],
}) + '\\n');
`,
      { mode: 0o755 },
    );
  }

  try {
    const result = spawnSync(process.execPath, [path.join(repoRoot, 'scripts/native-helper-family-smoke.mjs'), '--require-real-workspaces'], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        OPL_FAMILY_WORKSPACE_ROOT: familyRoot,
        OPL_NATIVE_HELPER_BIN_DIR: helperBinDir,
      },
    });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.surface_kind, 'opl_native_helper_family_index_smoke');
    assert.deepEqual(Object.keys(output.domains), ['medautoscience', 'medautogrant']);
    assert.equal(output.domains.medautoscience.status, 'indexed');
    assert.equal(output.domains.medautogrant.status, 'indexed');
    assert.equal(output.domains.medautoscience.workspace_path, path.join(familyRoot, 'med-autoscience'));
    assert.equal(output.domains.medautogrant.workspace_path, path.join(familyRoot, 'med-autogrant'));
    assert.equal(JSON.stringify(output).includes('redcube'), false);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

