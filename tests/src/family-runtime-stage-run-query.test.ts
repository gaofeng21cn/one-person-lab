import assert from 'node:assert/strict';
import test from 'node:test';
import { runController } from './family-runtime-temporal-stage-run-controller-cases/fixture.ts';

test('completed StageRun can be queried after its worker has stopped', async () => {
  const { state, terminalReadback } = await runController({
    id: 'query-completed-without-worker',
    closeFindingAfterRound: null,
    formalReviewRequired: false,
    queryAfterWorkerStopped: true,
  });
  assert.equal(state.status, 'completed');
  assert.deepEqual(terminalReadback, state);
});
