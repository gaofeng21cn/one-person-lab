import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { createDaemonSandbox } from './helpers/sandbox.ts';
import type { readLegacyRuns } from '../src/cli/legacy-runs.ts';

test('legacy run inspection reads bounded v1 references without starting either runtime', async t => {
  const sb = createDaemonSandbox();
  t.after(() => sb.cleanup());
  const args = ['daemon', 'doctor', '--legacy-runs', '--limit', '1', '--json'];
  const first = await sb.spawnRootCli(args);
  assert.equal(first.code, 0);
  assert.equal((first.json as ReturnType<typeof readLegacyRuns>).status, 'index_absent');
  const oldDir = path.join(sb.stateDir, 'family-runtime');
  assert.equal(fs.existsSync(oldDir), false);
  fs.mkdirSync(oldDir);
  const index = path.join(oldDir, 'queue.sqlite');
  const db = new DatabaseSync(index);
  db.exec(`
    CREATE TABLE stage_attempts (workflow_id, stage_attempt_id, task_id, domain_id, stage_id, provider_kind, status, updated_at, provider_receipt_json);
    INSERT INTO stage_attempts VALUES
      ('wf-1', 'att-1', 'task-1', 'sample', 'review', 'temporal', 'running', '2026-01-01', 'private'),
      ('wf-2', 'att-2', 'task-2', 'sample', 'review', 'temporal', 'human_gate', '2026-01-02', 'private'),
      ('local', 'att-3', 'task-3', 'sample', 'review', 'local', 'completed', '2026-02-01', 'private');
    CREATE TABLE stage_run_launches (workflow_id, stage_run_id, domain_id, stage_id, launch_status, terminal_status, updated_at);
    INSERT INTO stage_run_launches VALUES ('parent', 'run-1', 'sample', 'review', 'started', NULL, '2026-01-01');
  `);
  db.close();
  const contents = fs.readFileSync(index);
  const result = await sb.spawnRootCli(args);
  assert.equal(result.code, 0);
  const report = result.json as ReturnType<typeof readLegacyRuns>;
  assert.equal(report.live_status_verified, false);
  assert.deepEqual(report.sections.map(({ kind, total, items }) => [kind, total, items.length]), [
    ['stage_run_launches', 1, 1], ['stage_attempts', 2, 1],
  ]);
  assert.equal(report.sections[1]?.items[0]?.workflow_id, 'wf-2');
  assert.equal(report.sections[1]?.items[0]?.last_recorded_status, 'human_gate');
  assert.doesNotMatch(result.stdout, /private|receipt_json/);
  assert.deepEqual(fs.readFileSync(index), contents);
  assert.equal(fs.existsSync(sb.dbPath), false);
  fs.writeFileSync(index, 'corrupt index');
  const corrupt = await sb.spawnRootCli(args);
  assert.notEqual(corrupt.code, 0);
  assert.equal(fs.readFileSync(index, 'utf8'), 'corrupt index');
});
