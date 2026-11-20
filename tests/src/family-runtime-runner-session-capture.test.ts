import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const SOURCE = fs.readFileSync(
  new URL('../../src/adapters/execution/family-runtime-codex-stage-runner.ts', import.meta.url),
  'utf8',
);

test('captures the session the CLI reports on thread.started', () => {
  // The parsed stdout can carry no thread id while the runner event stream does, and the
  // StageRun refuses a completed Attempt with no execution session identity.
  const captures = SOURCE.match(
    /onRunnerProgress\(summary\) \{\s*if \(summary\.event_kind === 'thread\.started' && summary\.value\) observedThreadId = summary\.value;/g,
  ) ?? [];
  assert.equal(captures.length, 2, 'every runner path must capture thread.started');
});

test('falls back to the observed session when the parsed output has none', () => {
  assert.match(SOURCE, /threadId: parsed\.threadId \?\? observedThreadId,/);
});
