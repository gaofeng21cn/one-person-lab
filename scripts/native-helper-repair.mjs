#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const prebuildResult = spawnSync(process.execPath, [path.join(scriptDir, 'native-helper-prebuild.mjs'), 'install'], {
  cwd: rootDir,
  env: process.env,
  encoding: 'utf8',
  maxBuffer: 8 * 1024 * 1024,
});

if (prebuildResult.stdout) {
  process.stdout.write(prebuildResult.stdout);
}
if (prebuildResult.stderr) {
  process.stderr.write(prebuildResult.stderr);
}
if (prebuildResult.status === 0) {
  try {
    const payload = JSON.parse(prebuildResult.stdout);
    if (payload.status === 'installed') {
      const doctorResult = spawnSync(process.execPath, [path.join(scriptDir, 'native-helper-doctor.mjs')], {
        cwd: rootDir,
        env: process.env,
        stdio: 'inherit',
      });
      if (doctorResult.status === 0) {
        process.exit(0);
      }
    }
  } catch {
    // Invalid prebuild telemetry should not block the source-build repair path.
  }
}

const buildResult = spawnSync(npmCommand, ['run', 'native:build'], {
  cwd: rootDir,
  env: process.env,
  stdio: 'inherit',
});

if (buildResult.status !== 0) {
  process.exit(buildResult.status ?? 1);
}

const cacheResult = spawnSync(npmCommand, ['run', 'native:cache'], {
  cwd: rootDir,
  env: process.env,
  stdio: 'inherit',
});

if (cacheResult.status !== 0) {
  process.exit(cacheResult.status ?? 1);
}

const doctorResult = spawnSync(process.execPath, [path.join(scriptDir, 'native-helper-doctor.mjs')], {
  cwd: rootDir,
  env: process.env,
  stdio: 'inherit',
});

process.exit(doctorResult.status ?? 1);
