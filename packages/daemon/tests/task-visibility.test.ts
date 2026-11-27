import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { openSqliteStore } from '@opl/core';
import {
  defaultTaskVisibility,
  ensureTaskVisibilitySchema,
  listTaskVisibility,
  setTaskVisibility,
  taskVisibilityKey,
} from '../src/state/task-visibility.ts';

test('archive and restore survive a reopen and check the same item generation across clients', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-visibility-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'state.sqlite');
  const db = openSqliteStore(file);
  ensureTaskVisibilitySchema(db);
  const second = openSqliteStore(file);
  t.after(() => second.close());
  const payload = {
    confirmed: true, agent_id: 'agent', project_id: 'project', work_item_id: 'draft',
    expected_generation: 0, visibility_state: 'archived',
  };
  const resolveTask = (agent: string, project: string, item: string) =>
    agent === 'agent' && item === 'draft' && ['project', 'other-project'].includes(project);
  const options = { resolveTask, dryRun: false };
  const key = taskVisibilityKey('agent', 'project', 'draft');
  try {
    assert.equal(setTaskVisibility(db, payload, { ...options, dryRun: true }).status, 'preview');
    assert.equal(listTaskVisibility(db).size, 0);
    assert.throws(() => setTaskVisibility(db, { ...payload, confirmed: false }, options), /Confirm/);
    assert.throws(() => setTaskVisibility(db, { ...payload, agent_id: 'different' }, options), /absent/);
    const archived = setTaskVisibility(db, payload, options);
    assert.equal(archived.status, 'executed');
    assert.equal(archived.visibility.generation, 1);
    assert.equal(archived.visibility.state, 'archived');
    assert.deepEqual(listTaskVisibility(second).get(key), archived.visibility);
    assert.throws(() => setTaskVisibility(second, payload, options), {
      errorCode: 'work_item_control_generation_conflict',
    });
    assert.equal(setTaskVisibility(second, { ...payload, expected_generation: 1 }, options).status, 'no_op');
    assert.deepEqual(listTaskVisibility(second).get(key), archived.visibility);
    assert.equal(setTaskVisibility(second, { ...payload, project_id: 'other-project' }, options).status, 'executed');
    assert.equal(setTaskVisibility(second, {
      ...payload, expected_generation: 1, visibility_state: 'visible',
    }, options).visibility.generation, 2);
  } finally {
    db.close();
  }
  const reopened = openSqliteStore(file);
  try {
    ensureTaskVisibilitySchema(reopened);
    const rows = listTaskVisibility(reopened);
    assert.equal(rows.get(key)?.state, 'visible');
    assert.equal(rows.get(key)?.source, 'work_item_control_ledger');
    assert.equal(rows.get(taskVisibilityKey('agent', 'other-project', 'draft'))?.state, 'archived');
    assert.equal(defaultTaskVisibility().generation, 0);
  } finally {
    reopened.close();
  }
});
