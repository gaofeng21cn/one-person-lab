import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';

test('an admitted personal task survives a delayed worker without duplicating its Codex turn', { timeout: 60_000 }, async () => {
  const env = await TestWorkflowEnvironment.createTimeSkipping();
  const taskQueue = `opl-delayed-task-${randomUUID()}`;
  const calls = [];
  try {
    const handle = await env.client.workflow.start('OplPersonalTaskWorkflow', {
      workflowId: taskQueue, taskQueue,
      args: [{ id: 'delayed', title: 'Delayed analysis', prompt: 'Fixture only', cwd: '/workspace',
        permissions: ':read-only', timeoutMinutes: 180, revision: 1,
        schedule: { kind: 'daily', time: '08:00', timeZone: 'UTC' } }],
    });
    const worker = await Worker.create({
      connection: env.nativeConnection, taskQueue,
      workflowsPath: fileURLToPath(new URL('../../dist/host/plugins/workbench-services/workflows.js', import.meta.url)),
      interceptors: { workflowModules: [fileURLToPath(new URL('../fixtures/workbench-task-delay.mjs', import.meta.url))] },
      activities: {
        createThread: async task => { calls.push(['create', task.timeoutMinutes]); return { threadId: 'canonical' }; },
        startTask: async (_task, thread) => { calls.push(['start', thread.threadId]); return { ...thread, turnId: 'turn' }; },
        readTask: async ref => ({ ...ref, status: 'completed', summary: 'done' }),
        interruptTask: async () => { throw Error('Completed work must not be interrupted'); },
      },
    });
    const result = await worker.runUntil(handle.result());
    assert.deepEqual(calls, [['create', 180], ['start', 'canonical']]);
    assert.deepEqual(result, { threadId: 'canonical', turnId: 'turn', status: 'completed', summary: 'done' });
  } finally { await env.teardown(); }
});
