import assert from 'node:assert/strict';
import test from 'node:test';

import { sha256Hex } from '@opl/core';
import {
  type ExecutorAdapter,
  type ExecutorEvent,
  type StageExecutionRequest,
} from '../src/index.ts';
import { createRunwayTestEnv } from './helpers/test-db.ts';

test('an independent reviewer can identify the exact calls observed for the producer Attempt', async (t) => {
  const env = createRunwayTestEnv();
  t.after(() => env.cleanup());
  const first = {
    kind: 'capability_call_receipt',
    call_id_source: 'exec_item',
    call_id: 'call-one',
    server: 'local-evidence',
    tool_name: 'lookup',
    input_digest: sha256Hex('first synthetic input'),
    output_digest: sha256Hex('first synthetic output'),
    binding_digest: sha256Hex('first owner binding'),
  } as const;
  const second = {
    kind: 'capability_call_receipt',
    call_id_source: 'exec_item',
    call_id: 'call-two',
    server: first.server,
    tool_name: first.tool_name,
    input_digest: sha256Hex('second synthetic input'),
    output_digest: sha256Hex('second synthetic output'),
  } as const;
  const conflicting = { ...first, call_id: 'call-conflict' };
  const changed = { ...conflicting, binding_digest: sha256Hex('conflicting owner binding') };
  const reviewRequests: StageExecutionRequest[] = [];
  const adapter: ExecutorAdapter = {
    capabilities: {
      executor_id: 'synthetic-executor',
      display_name: 'Receipt test executor',
      models: [],
      supports_mcp_tools: true,
      supports_streaming: true,
      supports_session_resume: false,
      supports_reconcile_after_restart: false,
      supports_sandbox_modes: ['workspace-write', 'read-only'],
    },
    async healthCheck() { return { available: true }; },
    async reconcile() { return { state: 'lost' }; },
    async execute(req, emit) {
      emit({ kind: 'session_bound', session_ref: 'test://' + req.attempt_id });
      if (req.role === 'reviewer') {
        reviewRequests.push(req);
      } else if (req.stage_id === 'with-calls') {
        for (const observed of [second, first, second, conflicting, changed] satisfies readonly ExecutorEvent[]) {
          emit(observed);
        }
      }
      return { status: 'succeeded', artifact_refs: [] };
    },
  };
  env.registry.register(adapter);
  const task = env.store.createTask({
    title: 'Review independent calls',
    workspace_id: env.workspaceId,
    goal_prompt: 'Compare observed retrieval with its owner binding.',
    stages: ['with-calls', 'without-calls', 'independent-review'].map(stage_id => ({
      stage_id, executor_id: adapter.capabilities.executor_id,
    })),
  });
  let observedAttemptId = '';
  const [withCalls, withoutCalls, independentReview] = task.stage_runs;
  for (const stageRun of [withCalls!, withoutCalls!]) {
    const produced = await env.runtime.executeStage(stageRun.stage_run_id, {
      complete_stage_status: 'awaiting_review',
    });
    assert.equal(produced.stage_run.status, 'awaiting_review');

    env.ledgerStore.append({
      task_id: task.task_id,
      stage_run_id: stageRun.stage_run_id,
      attempt_id: produced.attempt_id,
      owner_id: 'opl.runway',
      entry_kind: 'owner_receipt',
      payload: {
        status: 'completed',
        receipt_id: 'ordinary-owner-note',
        call_id: 'unobserved-call',
        input_digest: sha256Hex('unobserved input'),
        output_digest: sha256Hex('unobserved output'),
        binding_digest: sha256Hex('unobserved binding'),
      },
    });

    const records = env.runtime.getTask(task.task_id).capability_call_receipts
      .filter(row => row.attempt_id === produced.attempt_id);
    if (stageRun.stage_id === 'with-calls') {
      observedAttemptId = produced.attempt_id;
      assert.equal(records.length, 3, 'exact duplicates must produce one durable receipt');
      const observed = records.filter(row => row.status === 'observed')
        .map(({ call_id, call_id_source, server, tool_name, input_digest, output_digest, binding_digest, stage_run_id }) =>
          ({ call_id, call_id_source, server, tool_name, input_digest, output_digest, binding_digest, stage_run_id }))
        .sort((a, b) => a.call_id.localeCompare(b.call_id));
      const expected = [first, second].map(({ kind, ...receipt }) => ({
        ...receipt, binding_digest: 'binding_digest' in receipt ? receipt.binding_digest : null,
        stage_run_id: stageRun.stage_run_id,
      }));
      assert.deepEqual(observed, expected);
      assert.equal(records.find(row => row.call_id === conflicting.call_id)?.status, 'conflict');
    } else {
      assert.deepEqual(records, []);
    }
    await assert.rejects(env.runtime.executeStage(stageRun.stage_run_id, { role: 'producer' }), /awaiting_review/);
    await assert.rejects(env.runtime.executeStage(stageRun.stage_run_id, {
      role: 'reviewer', resume_session_ref: 'test://' + produced.attempt_id,
    }), /separate executor session/);
    const reviewed = await env.runtime.executeStage(stageRun.stage_run_id, { role: 'reviewer' });
    const request = reviewRequests.at(-1)!;
    assert.equal(reviewed.stage_run.status, 'completed');
    assert.equal(request.stage_run_id, stageRun.stage_run_id);
    assert.equal(request.sandbox_mode, 'read-only');
    assert.notEqual(request.attempt_id, produced.attempt_id);
    assert.doesNotMatch(request.prompt, /unobserved-call|synthetic input|synthetic output/);
    if (stageRun.stage_id === 'with-calls') {
      const conflicted = request.prompt.split('\n').map(line => {
        try { return JSON.parse(line); } catch { return null; }
      }).find(row => row?.call_id === conflicting.call_id);
      assert.equal(conflicted?.status, 'conflict');
      assert.equal(conflicted.binding_digest, undefined, 'conflicting evidence cannot support the review');
      for (const id of [first.call_id, second.call_id]) {
        assert.equal(request.prompt.split(id).length - 1, 1);
      }
      for (const value of [produced.attempt_id, first.input_digest, first.output_digest,
        first.binding_digest, second.input_digest, second.output_digest]) {
        assert.ok(request.prompt.includes(value), 'reviewer should receive ' + value);
      }
    } else {
      assert.match(request.prompt, /unavailable/i);
      assert.doesNotMatch(request.prompt, /call-one|call-two/);
      assert.ok(!request.prompt.includes(first.binding_digest));
    }
  }
  const foreign = env.store.createTask({
    title: 'Different task', goal_prompt: 'Owner-specific evidence', workspace_id: env.workspaceId,
    stages: [{ stage_id: 'foreign', executor_id: adapter.capabilities.executor_id }],
  });
  const invalidReview = () => env.runtime.executeStage(foreign.stage_runs[0]!.stage_run_id,
    { role: 'reviewer', reviewed_attempt_id: observedAttemptId });
  await assert.rejects(invalidReview, /successful producer or repairer Attempt in this task/);

  const reviewed = await env.runtime.executeStage(independentReview!.stage_run_id, {
    role: 'reviewer', reviewed_attempt_id: observedAttemptId,
  });
  assert.equal(reviewed.stage_run.status, 'completed');
  assert.ok(reviewRequests.at(-1)!.prompt.includes(observedAttemptId));
  assert.ok(reviewRequests.at(-1)!.prompt.includes(first.binding_digest));
});
