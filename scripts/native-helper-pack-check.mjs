#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const requiredFiles = [
  'bin/opl',
  'Cargo.toml',
  'Cargo.lock',
  'native/opl-native-helper/Cargo.toml',
  'native/opl-native-helper/src/lib.rs',
  'scripts/native-helper-cache.mjs',
  'scripts/native-helper-doctor.mjs',
  'scripts/native-helper-family-smoke.mjs',
  'scripts/native-helper-pack-check.mjs',
  'scripts/native-helper-prebuild.mjs',
  'scripts/native-helper-repair.mjs',
];

const result = spawnSync(npmCommand, ['pack', '--dry-run', '--json', '--ignore-scripts'], {
  cwd: rootDir,
  encoding: 'utf8',
  maxBuffer: 8 * 1024 * 1024,
});

if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout || 'npm pack --dry-run failed\n');
  process.exit(result.status ?? 1);
}

let entries;
try {
  entries = JSON.parse(result.stdout);
} catch (error) {
  process.stderr.write(`native pack check could not parse npm output: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}

const files = new Set((entries[0]?.files ?? []).map((entry) => entry.path));
const missing = requiredFiles.filter((file) => !files.has(file));
if (missing.length > 0) {
  process.stderr.write(`native pack check missing files:\n${missing.map((file) => `- ${file}`).join('\n')}\n`);
  process.exit(1);
}

process.stdout.write(`${JSON.stringify({
  surface_kind: 'opl_native_helper_pack_check',
  status: 'ok',
  command: 'npm pack --dry-run --json --ignore-scripts',
  package_file_count: files.size,
  required_files: requiredFiles,
}, null, 2)}\n`);
