import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { defaultPayloadConverter } from '@temporalio/common';
import { PersonalTasks, validateTask } from '../../src/host/plugins/workbench-services/tasks.ts';
import type { TaskDefinition, WorkbenchTaskExecutor } from '../../src/host/plugins/workbench-services/types.ts';

test('task updates preserve elapsed one-shot timing but reject a new past schedule and stale revisions', async () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'opl-task-policy-')));
  const previous: TaskDefinition = { id: 'elapsed', title: 'Previous title', prompt: 'Review the report', cwd: root,
    permissions: ':read-only', timeoutMinutes: 30, revision: 3,
    schedule: { kind: 'once', at: '2020-01-01T08:00:00Z', timeZone: 'UTC' } };
  const executor = {} as WorkbenchTaskExecutor;
  const tasks = new PersonalTasks(executor, root, {}, root);
  // Exercise the public action path with a fresh owner definition; no Temporal
  // mutation or real task execution is needed to verify this validation rule.
  Object.defineProperty(tasks, 'use', { value: async (fn: (client: unknown) => unknown) => fn({
    options: { namespace: 'default' }, schedule: { getHandle: () => ({}) },
    workflowService: { describeSchedule: async () => ({ schedule: { action: { startWorkflow: {
      input: { payloads: [defaultPayloadConverter.toPayload(previous)] },
    } } } }) },
  }) });
  try {
    const updated = { ...previous, title: 'Corrected title', timeoutMinutes: 180 };
    const preview = await tasks.action('task_update', updated, true);
    const updatedTask = preview.task as TaskDefinition;
    assert.equal(preview.status, 'preview');
    assert.equal(updatedTask.title, 'Corrected title');
    assert.equal(updatedTask.schedule.at, previous.schedule.at);
    assert.equal(updatedTask.timeoutMinutes, 180);
    await assert.rejects(tasks.action('task_update', { ...updated, revision: 2 }, true), /Task changed/);
    await assert.rejects(tasks.action('task_update', { ...updated,
      schedule: { ...updated.schedule, at: '2020-01-02T08:00:00Z' } }, true), /future/);
    await assert.rejects(validateTask({ ...updated, revision: 0 }), /future/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('task duration accepts longer user budgets and rejects values the runtime cannot represent', async () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'opl-task-duration-')));
  const task = { id: 'long', title: 'Long analysis', prompt: 'Analyze the data', cwd: root,
    permissions: ':workspace', timeoutMinutes: 240, revision: 0,
    schedule: { kind: 'daily', time: '08:00', timeZone: 'UTC' } };
  try {
    assert.equal((await validateTask(task)).timeoutMinutes, 240);
    for (const timeoutMinutes of [0, -1, 0.5, Number.NaN, Number.MAX_SAFE_INTEGER]) {
      await assert.rejects(validateTask({ ...task, timeoutMinutes }), /Timeout/);
    }
    await assert.rejects(validateTask({ ...task, permissions: ':danger-full-access' }), /permissions/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
