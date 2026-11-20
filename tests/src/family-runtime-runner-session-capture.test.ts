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
    /if \(summary\.event_kind === 'thread\.started' && summary\.value\) observedThreadId = summary\.value;/g,
  ) ?? [];
  assert.equal(captures.length, 3, 'every runner path must capture thread.started');
});

test('captures the session on the streaming stdout path too', () => {
  // The non-sandbox path streams stdout events instead of a runner-progress callback.
  assert.match(
    SOURCE,
    /onStdoutEvent\(event\) \{\s*const summary = eventSummary\(event\);\s*if \(summary\.event_kind === 'thread\.started' && summary\.value\) observedThreadId = summary\.value;/,
  );
});

test('falls back to the observed session when the parsed output has none', () => {
  assert.match(SOURCE, /threadId: parsed\.threadId \?\? observedThreadId,/);
});
