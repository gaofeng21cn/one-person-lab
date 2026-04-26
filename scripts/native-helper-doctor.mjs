#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');
const sourceEntry = path.join(rootDir, 'src', 'native-helper-doctor.ts');
const builtEntry = path.join(rootDir, 'dist', 'native-helper-doctor.js');
const hasSource = fs.existsSync(sourceEntry);
const entry = hasSource ? sourceEntry : builtEntry;
const args = hasSource ? ['--experimental-strip-types', entry] : [entry];

const result = spawnSync(process.execPath, args, {
  cwd: rootDir,
  env: process.env,
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
