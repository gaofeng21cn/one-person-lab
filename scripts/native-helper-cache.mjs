#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');
const packageToml = fs.readFileSync(path.join(rootDir, 'native/opl-native-helper/Cargo.toml'), 'utf8');
const crateVersion = packageToml.match(/^version\s*=\s*"([^"]+)"/m)?.[1] ?? '0.0.0';
const targetTriple = `${process.platform}-${process.arch}`;
const stateDir = process.env.OPL_STATE_DIR
  ?? path.join(process.env.HOME ?? rootDir, 'Library/Application Support/OPL/state');
const cacheDir = path.join(stateDir, 'native-helper', 'bin', targetTriple, crateVersion);
const sourceDir = path.join(rootDir, 'target', 'debug');
const binaries = [
  'opl-sysprobe',
  'opl-doctor-native',
  'opl-runtime-watch',
  'opl-artifact-indexer',
  'opl-state-indexer',
];

fs.mkdirSync(cacheDir, { recursive: true });

const copied = [];
const missing = [];
for (const binary of binaries) {
  const fileName = binaryFileName(binary);
  const source = path.join(sourceDir, fileName);
  const target = path.join(cacheDir, fileName);
  if (!fs.existsSync(source)) {
    missing.push(source);
    continue;
  }
  fs.copyFileSync(source, target);
  fs.chmodSync(target, 0o755);
  copied.push(target);
}

if (missing.length > 0) {
  process.stderr.write(`native helper cache missing built binaries:\n${missing.map((entry) => `- ${entry}`).join('\n')}\n`);
  process.exit(1);
}

process.stdout.write(`${JSON.stringify({
  surface_kind: 'opl_native_helper_binary_cache',
  status: 'completed',
  cache_dir: cacheDir,
  target_triple: targetTriple,
  crate_version: crateVersion,
  copied_binaries: copied,
}, null, 2)}\n`);

function binaryFileName(binary) {
  return process.platform === 'win32' ? `${binary}.exe` : binary;
}
