#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const [timeoutRaw, compareRef = 'origin/main', limitRaw = '30'] = process.argv.slice(2);
const timeoutSeconds = Number(timeoutRaw);
if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) {
  console.error(`Invalid OPL_QUALITY_DETAILS_TIMEOUT_SECONDS: ${timeoutRaw}`);
  process.exit(64);
}
const limit = Number(limitRaw);
const maxFiles = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 30;

const diffRes = spawnSync('git', ['diff', '--stat', `${compareRef}...HEAD`], {
  encoding: 'utf8',
  timeout: timeoutSeconds * 1000,
  killSignal: 'SIGKILL',
});

if (diffRes.error?.code === 'ETIMEDOUT') {
  process.exit(124);
}
if (diffRes.status === 0 && diffRes.stdout) {
  const lines = diffRes.stdout.trim().split('\n');
  const shown = lines.slice(0, maxFiles);
  process.stdout.write(`${shown.join('\n')}\n`);
  if (lines.length > maxFiles) {
    process.stdout.write(`... (${lines.length - maxFiles} more lines)\n`);
  }
}

const guardRes = spawnSync(
  process.execPath,
  ['./scripts/check-v2-import-guard.mjs', '--strict-m4'],
  {
    stdio: 'inherit',
    timeout: timeoutSeconds * 1000,
    killSignal: 'SIGKILL',
  },
);
if (guardRes.error?.code === 'ETIMEDOUT') {
  process.exit(124);
}
process.exit(guardRes.status ?? 0);
