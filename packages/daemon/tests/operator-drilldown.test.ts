import assert from 'node:assert/strict';
import test from 'node:test';
import { connectTestRpc, createDaemonSandbox } from './helpers/sandbox.ts';
import type { readOperatorDrilldown } from '../src/state/operator-drilldown.ts';

test('full operator diagnostics bound each reference list and preserve totals across tasks', async t => {
  const sb = createDaemonSandbox();
  t.after(() => sb.cleanup());
  await sb.startInProcess();
  const rpc = await connectTestRpc(sb.sessionPath, 'opl_app');
  t.after(() => rpc.close());
  const read = async () => await rpc.call('app.operatorDrilldown.get', {}) as ReturnType<typeof readOperatorDrilldown>;
  assert.equal((await read()).summary?.task_count, 0);

  const ws = await rpc.call('workspace.init', { root_path: sb.workspaceDir }) as { workspace_id: string };
  const taskIds = [];
  for (const name of ['first', 'second']) {
    const { task_id } = await rpc.call('runway.task.create', {
      workspace_id: ws.workspace_id, title: name, goal_prompt: 'private goal',
      stages: [{ stage_id: 'inspect', executor_id: 'codex' }],
    }) as { task_id: string };
    taskIds.push(task_id);
  }
  for (let i = 0; i < 101; i++) {
    await rpc.call('ledger.append', {
      task_id: taskIds[i % 2], entry_kind: 'typed_blocker', owner_id: 'test-owner',
      payload: { code: 'test-blocked', message: 'private details' },
    });
  }
  const detail = await read();
  assert.equal(detail.schema, 'opl.operator_drilldown.v2');
  assert.deepEqual(detail.summary, {
    task_count: 2, stage_run_count: 2, attempt_count: 0, ledger_entry_count: 101, package_operation_count: 0,
  });
  assert.equal(detail.ledger_refs.length, detail.sample_limit);
  assert.deepEqual(new Set(detail.ledger_refs.map(row => row.task_id)), new Set(taskIds));
  assert.equal(detail.ledger_refs.every(row => row.entry_id && row.entry_kind === 'typed_blocker'), true);
  assert.doesNotMatch(JSON.stringify(detail), /private goal|private details|payload_json/);
});
