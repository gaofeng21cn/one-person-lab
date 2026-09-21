import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROVIDER_ACTIVITY_SCHEDULE_TO_CLOSE_TIMEOUT,
  PROVIDER_ACTIVITY_START_TO_CLOSE_TIMEOUT,
} from '../../src/adapters/execution/foundry-temporal-workflow.ts';

function parseDuration(value: string): number {
  const match = /^(\d+) (minute|minutes|second|seconds)$/.exec(value);
  assert.ok(match, `unexpected duration format: ${value}`);
  const amount = Number(match[1]);
  return match[2].startsWith('second') ? amount / 60 : amount;
}

test('provider activity schedule-to-close budget stays well above observed launch duration', () => {
  // run 23 (2026-09-21): the launch activity legitimately ran ~108 seconds and
  // a 61-second schedule-to-start delay exhausted the old 2-minute budget,
  // orphaning the already-launched pipeline. The budget must tolerate both.
  const scheduleToCloseMinutes = parseDuration(PROVIDER_ACTIVITY_SCHEDULE_TO_CLOSE_TIMEOUT);
  assert.ok(
    scheduleToCloseMinutes >= 10,
    `provider scheduleToCloseTimeout must be at least 10 minutes, got ${PROVIDER_ACTIVITY_SCHEDULE_TO_CLOSE_TIMEOUT}`,
  );
});

test('provider activity start-to-close budget covers the launch activity real execution time', () => {
  const startToCloseMinutes = parseDuration(PROVIDER_ACTIVITY_START_TO_CLOSE_TIMEOUT);
  assert.ok(
    startToCloseMinutes >= 5,
    `provider startToCloseTimeout must be at least 5 minutes, got ${PROVIDER_ACTIVITY_START_TO_CLOSE_TIMEOUT}`,
  );
});

test('provider activity start-to-close fits inside schedule-to-close with retry room', () => {
  const scheduleToCloseMinutes = parseDuration(PROVIDER_ACTIVITY_SCHEDULE_TO_CLOSE_TIMEOUT);
  const startToCloseMinutes = parseDuration(PROVIDER_ACTIVITY_START_TO_CLOSE_TIMEOUT);
  assert.ok(
    scheduleToCloseMinutes > startToCloseMinutes,
    'scheduleToCloseTimeout must exceed startToCloseTimeout so a retry can be scheduled',
  );
});
