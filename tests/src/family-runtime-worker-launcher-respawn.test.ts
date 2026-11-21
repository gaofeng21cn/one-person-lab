import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const SOURCE = fs.readFileSync(
  new URL('../../src/adapters/execution/family-runtime-provider-worker-launcher.ts', import.meta.url),
  'utf8',
);

test('respawns the worker instead of exiting when it dies', () => {
  // A worker killed by an uncaught exception leaves every in-flight StageRun stranded.
  // The launcher used to resolve and exit, so only an external operator could recover.
  assert.match(SOURCE, /for \(;;\) \{/);
  assert.match(SOURCE, /event: 'provider_worker_exited'/);
  assert.match(SOURCE, /respawn_attempt: respawnAttempt/);
});

test('stops respawning once shutdown is requested', () => {
  assert.match(SOURCE, /if \(shutdownRequested \|\| exitCode === 0\) return exitCode;/);
  assert.match(SOURCE, /if \(shutdownRequested\) return 0;/);
});
