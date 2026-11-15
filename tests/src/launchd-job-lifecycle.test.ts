import assert from 'node:assert/strict';
import test from 'node:test';
import { waitForLaunchdJobUnload } from '../../src/adapters/execution/launchd-job-lifecycle.ts';

test('launchd reload waits for the acknowledged bootout to finish draining', async () => {
  let clock = 0;
  const reads: string[][] = [];
  const unloaded = await waitForLaunchdJobUnload({
    target: 'gui/501/fixture',
    runLaunchctl(args) {
      reads.push(args);
      return clock < 200
        ? { ok: true, status: 0, stdout: 'state = SIGTERMed', stderr: '' }
        : { ok: false, status: 113, stdout: '', stderr: 'Could not find service' };
    },
    monotonicNowMs: () => clock,
    sleep: async (milliseconds) => { clock += milliseconds; },
  });
  assert.equal(unloaded, true);
  assert.equal(clock, 200);
  assert.equal(reads.length, 3);
});

test('launchd reload stays blocked on timeout or a failed observation', async () => {
  let clock = 0;
  assert.equal(await waitForLaunchdJobUnload({
    target: 'gui/501/fixture', timeoutMs: 200,
    runLaunchctl: () => ({ ok: true, status: 0, stdout: 'state = SIGTERMed', stderr: '' }),
    monotonicNowMs: () => clock,
    sleep: async (milliseconds) => { clock += milliseconds; },
  }), false);
  assert.equal(await waitForLaunchdJobUnload({
    target: 'gui/501/fixture',
    runLaunchctl: () => ({ ok: false, status: 1, stdout: '', stderr: 'Operation not permitted' }),
  }), false);
});
