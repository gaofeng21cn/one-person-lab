import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const targetTriple = `${process.platform}-${process.arch}`;
const crateVersion = fs.readFileSync(path.join(repoRoot, 'native/opl-native-helper/Cargo.toml'), 'utf8')
  .match(/^version\s*=\s*"([^"]+)"/m)?.[1] ?? '0.0.0';

const helperBinaries = [
  'opl-sysprobe',
  'opl-doctor-native',
  'opl-runtime-watch',
  'opl-artifact-indexer',
  'opl-state-indexer',
];

test('native helper prebuild script packs and installs platform binaries into the state cache', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-native-prebuild-'));
  const sourceDir = path.join(fixtureRoot, 'source');
  const prebuildRoot = path.join(fixtureRoot, 'prebuilds');
  const stateDir = path.join(fixtureRoot, 'state');
  fs.mkdirSync(sourceDir, { recursive: true });

  for (const binary of helperBinaries) {
    fs.writeFileSync(path.join(sourceDir, binary), `#!/bin/sh\necho ${binary}\n`, { mode: 0o755 });
  }

  try {
    const pack = spawnSync(process.execPath, [
      path.join(repoRoot, 'scripts/native-helper-prebuild.mjs'),
      'pack',
      '--source-dir',
      sourceDir,
      '--prebuild-root',
      prebuildRoot,
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    assert.equal(pack.status, 0, pack.stderr);
    const packOutput = JSON.parse(pack.stdout);
    assert.equal(packOutput.status, 'packed');
    assert.equal(packOutput.target_triple, targetTriple);
    assert.equal(packOutput.crate_version, crateVersion);
    assert.equal(packOutput.binaries.length, helperBinaries.length);

    const install = spawnSync(process.execPath, [
      path.join(repoRoot, 'scripts/native-helper-prebuild.mjs'),
      'install',
      '--prebuild-root',
      prebuildRoot,
      '--state-dir',
      stateDir,
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    assert.equal(install.status, 0, install.stderr);
    const installOutput = JSON.parse(install.stdout);
    assert.equal(installOutput.status, 'installed');
    assert.equal(
      installOutput.cache_dir,
      path.join(stateDir, 'native-helper', 'bin', targetTriple, crateVersion),
    );
    assert.equal(fs.existsSync(path.join(installOutput.cache_dir, 'opl-artifact-indexer')), true);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('native helper prebuild script restores release archive assets before installing', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-native-prebuild-release-'));
  const sourceDir = path.join(fixtureRoot, 'source');
  const packRoot = path.join(fixtureRoot, 'pack-root');
  const installRoot = path.join(fixtureRoot, 'install-root');
  const stateDir = path.join(fixtureRoot, 'state');
  fs.mkdirSync(sourceDir, { recursive: true });

  for (const binary of helperBinaries) {
    fs.writeFileSync(path.join(sourceDir, binary), `#!/bin/sh\necho ${binary}\n`, { mode: 0o755 });
  }

  try {
    const pack = spawnSync(process.execPath, [
      path.join(repoRoot, 'scripts/native-helper-prebuild.mjs'),
      'pack',
      '--source-dir',
      sourceDir,
      '--prebuild-root',
      packRoot,
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    assert.equal(pack.status, 0, pack.stderr);

    const archive = spawnSync(process.execPath, [
      path.join(repoRoot, 'scripts/native-helper-prebuild.mjs'),
      'archive',
      '--prebuild-root',
      packRoot,
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    assert.equal(archive.status, 0, archive.stderr);
    const archiveOutput = JSON.parse(archive.stdout);
    assert.equal(archiveOutput.status, 'archived');
    assert.match(archiveOutput.archive_name, /^opl-native-helper-.+\.tar\.gz$/);

    const install = spawnSync(process.execPath, [
      path.join(repoRoot, 'scripts/native-helper-prebuild.mjs'),
      'install',
      '--prebuild-root',
      installRoot,
      '--state-dir',
      stateDir,
      '--release-archive-url',
      `file://${archiveOutput.archive_file}`,
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    assert.equal(install.status, 0, install.stderr);
    const installOutput = JSON.parse(install.stdout);
    assert.equal(installOutput.status, 'installed');
    assert.equal(installOutput.restore_attempts[0].status, 'restored_release_archive');
    assert.equal(fs.existsSync(path.join(installOutput.cache_dir, 'opl-state-indexer')), true);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('native helper prebuild script rejects binaries that do not match the manifest', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-native-prebuild-invalid-'));
  const sourceDir = path.join(fixtureRoot, 'source');
  const prebuildRoot = path.join(fixtureRoot, 'prebuilds');
  fs.mkdirSync(sourceDir, { recursive: true });

  for (const binary of helperBinaries) {
    fs.writeFileSync(path.join(sourceDir, binary), `#!/bin/sh\necho ${binary}\n`, { mode: 0o755 });
  }

  try {
    const pack = spawnSync(process.execPath, [
      path.join(repoRoot, 'scripts/native-helper-prebuild.mjs'),
      'pack',
      '--source-dir',
      sourceDir,
      '--prebuild-root',
      prebuildRoot,
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    assert.equal(pack.status, 0, pack.stderr);

    fs.appendFileSync(path.join(prebuildRoot, targetTriple, crateVersion, 'opl-state-indexer'), '\nmodified\n');

    const check = spawnSync(process.execPath, [
      path.join(repoRoot, 'scripts/native-helper-prebuild.mjs'),
      'check',
      '--prebuild-root',
      prebuildRoot,
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    assert.equal(check.status, 1);
    const checkOutput = JSON.parse(check.stdout);
    assert.equal(checkOutput.status, 'invalid_prebuild');
    assert.equal(
      checkOutput.errors.some((entry: { code?: string }) => entry.code === 'prebuild_binary_checksum_mismatch'),
      true,
    );
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('native helper prebuild script preserves Windows executable names for release artifacts', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-native-prebuild-win-'));
  const sourceDir = path.join(fixtureRoot, 'source');
  const prebuildRoot = path.join(fixtureRoot, 'prebuilds');
  const stateDir = path.join(fixtureRoot, 'state');
  const windowsTarget = 'win32-x64';
  fs.mkdirSync(sourceDir, { recursive: true });

  for (const binary of helperBinaries) {
    fs.writeFileSync(path.join(sourceDir, `${binary}.exe`), `@echo off\necho ${binary}\n`);
  }

  try {
    const pack = spawnSync(process.execPath, [
      path.join(repoRoot, 'scripts/native-helper-prebuild.mjs'),
      'pack',
      '--source-dir',
      sourceDir,
      '--prebuild-root',
      prebuildRoot,
      '--target',
      windowsTarget,
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    assert.equal(pack.status, 0, pack.stderr);
    const packOutput = JSON.parse(pack.stdout);
    assert.equal(packOutput.target_triple, windowsTarget);
    assert.equal(packOutput.binaries[0].binary, 'opl-sysprobe');
    assert.equal(packOutput.binaries[0].file_name, 'opl-sysprobe.exe');
    assert.equal(
      fs.existsSync(path.join(prebuildRoot, windowsTarget, crateVersion, 'opl-state-indexer.exe')),
      true,
    );

    const install = spawnSync(process.execPath, [
      path.join(repoRoot, 'scripts/native-helper-prebuild.mjs'),
      'install',
      '--prebuild-root',
      prebuildRoot,
      '--state-dir',
      stateDir,
      '--target',
      windowsTarget,
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    assert.equal(install.status, 0, install.stderr);
    const installOutput = JSON.parse(install.stdout);
    assert.equal(fs.existsSync(path.join(installOutput.cache_dir, 'opl-state-indexer.exe')), true);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('native helper repair consumes a valid prebuild before falling back to Cargo build', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-native-repair-prebuild-'));
  const sourceDir = path.join(fixtureRoot, 'source');
  const prebuildRoot = path.join(fixtureRoot, 'prebuilds');
  const stateDir = path.join(fixtureRoot, 'state');
  fs.mkdirSync(sourceDir, { recursive: true });

  for (const binary of helperBinaries) {
    fs.writeFileSync(
      path.join(sourceDir, binary),
      `#!/bin/sh
cat >/dev/null
case "$(basename "$0")" in
  opl-doctor-native)
    printf '%s\\n' '{"protocol_version":"opl_native_helper.v1","helper_id":"opl-doctor-native","helper_version":"0.1.0","binary_version":"0.1.0","crate_name":"opl-native-helper","crate_version":"0.1.0","ok":true,"request_id":"runtime-manager-doctor","result":{"surface_kind":"native_doctor_snapshot"},"errors":[]}'
    ;;
  opl-runtime-watch)
    printf '%s\\n' '{"protocol_version":"opl_native_helper.v1","helper_id":"opl-runtime-watch","helper_version":"0.1.0","binary_version":"0.1.0","crate_name":"opl-native-helper","crate_version":"0.1.0","ok":true,"request_id":"runtime-manager-runtime-watch","result":{"surface_kind":"runtime_health_snapshot_index","roots":[]},"errors":[]}'
    ;;
  opl-artifact-indexer)
    printf '%s\\n' '{"protocol_version":"opl_native_helper.v1","helper_id":"opl-artifact-indexer","helper_version":"0.1.0","binary_version":"0.1.0","crate_name":"opl-native-helper","crate_version":"0.1.0","ok":true,"request_id":"runtime-manager-artifact-index","result":{"surface_kind":"native_artifact_manifest","summary":{"total_files_count":0},"files":[]},"errors":[]}'
    ;;
  opl-state-indexer)
    printf '%s\\n' '{"protocol_version":"opl_native_helper.v1","helper_id":"opl-state-indexer","helper_version":"0.1.0","binary_version":"0.1.0","crate_name":"opl-native-helper","crate_version":"0.1.0","ok":true,"request_id":"runtime-manager-state-index","result":{"surface_kind":"native_state_index","roots":[],"json_validation":{"checked_files_count":0,"invalid_files_count":0,"files":[]}},"errors":[]}'
    ;;
  *)
    printf '%s\\n' '{"protocol_version":"opl_native_helper.v1","helper_id":"opl-sysprobe","helper_version":"0.1.0","binary_version":"0.1.0","crate_name":"opl-native-helper","crate_version":"0.1.0","ok":true,"request_id":null,"result":{"surface_kind":"native_system_probe"},"errors":[]}'
    ;;
esac
`,
      { mode: 0o755 },
    );
  }

  try {
    const pack = spawnSync(process.execPath, [
      path.join(repoRoot, 'scripts/native-helper-prebuild.mjs'),
      'pack',
      '--source-dir',
      sourceDir,
      '--prebuild-root',
      prebuildRoot,
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    assert.equal(pack.status, 0, pack.stderr);

    const repair = spawnSync(process.execPath, [path.join(repoRoot, 'scripts/native-helper-repair.mjs')], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        OPL_NATIVE_HELPER_PREBUILD_ROOT: prebuildRoot,
        OPL_STATE_DIR: stateDir,
        OPL_NATIVE_HELPER_BIN_DIR: '',
      },
    });
    assert.equal(repair.status, 0, repair.stderr);
    assert.equal(repair.stdout.includes('"status": "packed"'), false);
    assert.match(repair.stdout, /"surface_kind": "opl_native_helper_lifecycle_doctor"/);
    assert.match(repair.stdout, /"source": "state_cache"/);
    assert.equal(fs.existsSync(path.join(stateDir, 'native-helper', 'bin', targetTriple, crateVersion, 'opl-state-indexer')), true);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
