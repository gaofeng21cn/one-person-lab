import test from 'node:test';
import assert from 'node:assert/strict';
import { runnerPromptFor } from '../../src/adapters/execution/family-runtime-codex-stage-runner-parts/input-prompt.ts';
import { codexActivityEventForTemporalHistory } from '../../src/adapters/execution/family-runtime-temporal-history-summary.ts';

test('first Attempt prompt supplies typed closeout surface and exact Attempt identity', () => {
  const prompt = runnerPromptFor({attempt:{stage_attempt_id:'sat-contract',stage_id:'design',stage_run_id:'sr-contract'}});
  assert.match(prompt,/surface_kind "stage_attempt_closeout_packet"/);
  assert.match(prompt,/stage_attempt_id "sat-contract" exactly/);
  assert.match(prompt,/stage_run_id "sr-contract" exactly/);
});

test('Temporal history preserves protocol resume failure separately from successful initial execution', () => {
  const protocol = {status:'failed',same_thread:true,thread_id:'thread-contract',timeout_ms:120000,
    exit_code:124,timeout_reason:'timeout',packet_observed:false,closeout_rejection_reason:null};
  const history = codexActivityEventForTemporalHistory({process_output_summary:{exit_code:0,
    protocol_closeout_resume:{...protocol,stdout:'private body must not enter compact history'}}});
  assert.equal(history.process_output_summary?.exit_code,0);
  assert.deepEqual(history.process_output_summary?.protocol_closeout_resume,protocol);
});
