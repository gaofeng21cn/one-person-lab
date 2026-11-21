import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FOUNDRY_EVALUATION_ACTIVITY_SCHEDULE_TO_CLOSE_TIMEOUT,
  FOUNDRY_EVALUATION_ACTIVITY_START_TO_CLOSE_TIMEOUT,
  foundryAdvanceOperationRequiresLongBudget,
} from '../../src/adapters/execution/foundry-temporal-workflow.ts';

function hours(value: string) {
  const match = /^(\d+) hours$/.exec(value);
  assert.ok(match, `expected an hour-bounded timeout, got ${value}`);
  return Number(match[1]);
}

test('evaluation and canary receive a bounded long Activity window', () => {
  assert.equal(foundryAdvanceOperationRequiresLongBudget('evaluate'), true);
  assert.equal(foundryAdvanceOperationRequiresLongBudget('canary'), true);
  for (const phase of ['design', 'diagnose', 'materialize', 'activate', 'rollback']) {
    assert.equal(foundryAdvanceOperationRequiresLongBudget(phase), false);
  }
  assert.ok(hours(FOUNDRY_EVALUATION_ACTIVITY_START_TO_CLOSE_TIMEOUT) >= 12);
  assert.ok(hours(FOUNDRY_EVALUATION_ACTIVITY_SCHEDULE_TO_CLOSE_TIMEOUT)
    > hours(FOUNDRY_EVALUATION_ACTIVITY_START_TO_CLOSE_TIMEOUT));
  assert.ok(hours(FOUNDRY_EVALUATION_ACTIVITY_SCHEDULE_TO_CLOSE_TIMEOUT) <= 13);
});
