import assert from 'node:assert/strict';
import test from 'node:test';
import { executionSessionRefFromAttemptState } from '../../src/adapters/execution/family-runtime-temporal-workflow-artifacts.ts';

const state = (events: unknown[]) => ({ activity_events: events } as any);

test('reads the session identity a runner progress heartbeat records at the event level', () => {
  // The final receipt can report a null session while every runner heartbeat carries the thread,
  // so a completed Attempt must not be treated as session-less.
  const ref = executionSessionRefFromAttemptState(state([{
    activity_kind: 'codex_stage_activity',
    heartbeat_kind: 'codex_stage_activity_runner_progress',
    runner_event_kind: 'thread.started',
    execution_session_ref: 'codex://threads/01a1ea76-9e6c-7ed3-8d92-60b42083de90',
    progress_summary: { progress_status: 'running', execution_session_ref: null },
  }]));
  assert.equal(ref, 'codex://threads/01a1ea76-9e6c-7ed3-8d92-60b42083de90');
});

test('prefers the receipt progress summary when it carries the session', () => {
  const ref = executionSessionRefFromAttemptState(state([{
    activity_kind: 'codex_stage_activity',
    progress_summary: { execution_session_ref: 'codex://threads/receipt-session' },
  }]));
  assert.equal(ref, 'codex://threads/receipt-session');
});

test('still returns null when no event carries any session identity', () => {
  const ref = executionSessionRefFromAttemptState(state([{
    activity_kind: 'codex_stage_activity',
    progress_summary: { progress_status: 'running' },
  }]));
  assert.equal(ref, null);
});
