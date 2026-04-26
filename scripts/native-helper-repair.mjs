#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const buildResult = spawnSync(npmCommand, ['run', 'native:build'], {
  cwd: rootDir,
  env: process.env,
  stdio: 'inherit',
});

if (buildResult.status !== 0) {
  process.exit(buildResult.status ?? 1);
}

const doctorResult = spawnSync(process.execPath, [path.join(scriptDir, 'native-helper-doctor.mjs')], {
  cwd: rootDir,
  env: process.env,
  stdio: 'inherit',
});

process.exit(doctorResult.status ?? 1);
