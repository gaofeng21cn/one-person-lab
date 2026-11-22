import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FOUNDRY_EVALUATION_ACTIVITY_SCHEDULE_TO_CLOSE_TIMEOUT,
  FOUNDRY_EVALUATION_ACTIVITY_START_TO_CLOSE_TIMEOUT,
  foundryAdvanceOperationRequiresLongBudget,
} from '../../src/adapters/execution/foundry-temporal-workflow.ts';

function minutes(value: string) {
  const match = /^(\d+) minutes$/.exec(value);
  assert.ok(match, `expected a minute-bounded timeout, got ${value}`);
  return Number(match[1]);
}

// Sizing evidence: run dev-orchestrator-create-20261122-r18 (2026-11-22) executed
// 25 public cases + 4 protected aggregates in one evaluating advance of 107
// minutes with ten concurrent case executions. The window below is ~2.2x that
// measurement; the default 30-minute lifecycle budget would have declared the
// run timed out while it was making healthy progress.
test('evaluation and canary receive a bounded long Activity window sized from measured runs', () => {
  assert.equal(foundryAdvanceOperationRequiresLongBudget('evaluate'), true);
  assert.equal(foundryAdvanceOperationRequiresLongBudget('canary'), true);
  for (const phase of ['design', 'diagnose', 'materialize', 'activate', 'rollback']) {
    assert.equal(foundryAdvanceOperationRequiresLongBudget(phase), false);
  }
  const startToClose = minutes(FOUNDRY_EVALUATION_ACTIVITY_START_TO_CLOSE_TIMEOUT);
  const scheduleToClose = minutes(FOUNDRY_EVALUATION_ACTIVITY_SCHEDULE_TO_CLOSE_TIMEOUT);
  // Above the measured 107-minute evaluation with about 2.2x headroom,
  // and still a bounded window rather than an open-ended wait.
  assert.ok(startToClose >= 180);
  assert.ok(startToClose <= 240);
  assert.ok(scheduleToClose > startToClose);
  assert.ok(scheduleToClose <= 300);
});
