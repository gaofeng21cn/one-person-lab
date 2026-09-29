import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runnerPromptFor } from '../../src/adapters/execution/family-runtime-codex-stage-runner-parts/input-prompt.ts';
import { codexActivityEventForTemporalHistory } from '../../src/adapters/execution/family-runtime-temporal-history-summary.ts';
import { createWorkItemExecutionScopeSnapshot } from '../../src/authority/workspace/execution-scope.ts';

test('first Attempt prompt supplies typed closeout surface and exact Attempt identity', () => {
  const prompt = runnerPromptFor({attempt:{stage_attempt_id:'sat-contract',stage_id:'design',stage_run_id:'sr-contract'}});
  assert.match(prompt,/surface_kind "stage_attempt_closeout_packet"/);
  assert.match(prompt,/stage_attempt_id "sat-contract" exactly/);
  assert.match(prompt,/stage_run_id "sr-contract" exactly/);
});

test('work-item reviewer prompt includes the exact execution scope required by closeout validation', () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-review-scope-'));
  const canonicalWorkItemRoot = path.join(workspaceRoot, 'studies', 'study-1');
  fs.mkdirSync(canonicalWorkItemRoot, { recursive: true });
  const scope = createWorkItemExecutionScopeSnapshot({
    projectScopeId: 'project:review-scope',
    workspaceBindingId: 'binding:review-scope',
    domainId: 'mas',
    workspaceRoot,
    canonicalWorkItemRoot,
    payload: { study_id: 'study-1' },
    requirement: { kind: 'work_item', alias_fields: ['study_id'] },
  });
  const prompt = runnerPromptFor({ attempt: {
    stage_attempt_id: 'sat-review', stage_run_id: 'sr-review', stage_id: 'analysis',
    attempt_role: 'reviewer', execution_scope: scope,
    workspace_locator: { workspace_root: workspaceRoot, execution_scope: scope },
  } });
  assert.ok(prompt.includes(`Exact execution_scope snapshot for typed closeout: ${JSON.stringify(scope)}`));
  fs.rmSync(workspaceRoot, { recursive: true, force: true });
});

test('Temporal history preserves protocol resume failure separately from successful initial execution', () => {
  const protocol = {status:'failed',same_thread:true,thread_id:'thread-contract',timeout_ms:120000,
    exit_code:124,timeout_reason:'timeout',packet_observed:false,closeout_rejection_reason:null};
  const history = codexActivityEventForTemporalHistory({process_output_summary:{exit_code:0,
    protocol_closeout_resume:{...protocol,stdout:'private body must not enter compact history'}}});
  assert.equal(history.process_output_summary?.exit_code,0);
  assert.deepEqual(history.process_output_summary?.protocol_closeout_resume,protocol);
});
