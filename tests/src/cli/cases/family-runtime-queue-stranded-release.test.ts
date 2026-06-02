import { DatabaseSync } from 'node:sqlite';

import { assert, fs, os, path, runCli, test } from '../helpers.ts';

function familyRuntimeEnv(stateRoot: string, extra: Record<string, string> = {}) {
  return {
    OPL_STATE_DIR: stateRoot,
    ...extra,
  };
}

test('family-runtime queue release requires explicit stranded repair before releasing hold residue without active ledger', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-stranded-release-'));
  try {
    const env = familyRuntimeEnv(stateRoot);
    const strandedTarget = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'domain_owner/default-executor-dispatch',
      '--payload',
      '{"study_id":"003-dpcc-primary-care-phenotype-treatment-gap","action_type":"return_to_ai_reviewer_workflow"}',
      '--dedupe-key',
      'mas:dm003:stranded-release-target',
    ], env).family_runtime_enqueue.task.task_id;
    const otherStudy = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'domain_owner/default-executor-dispatch',
      '--payload',
      '{"study_id":"002-dm-china-us-mortality-attribution","action_type":"return_to_ai_reviewer_workflow"}',
      '--dedupe-key',
      'mas:dm002:stranded-release-control',
    ], env).family_runtime_enqueue.task.task_id;
    const humanGateTask = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'domain_owner/default-executor-dispatch',
      '--payload',
      '{"study_id":"003-dpcc-primary-care-phenotype-treatment-gap","action_type":"manual-review"}',
      '--dedupe-key',
      'mas:dm003:human-gate-control',
      '--requires-approval',
    ], env).family_runtime_enqueue.task.task_id;

    const db = new DatabaseSync(path.join(stateRoot, 'family-runtime', 'queue.sqlite'));
    try {
      const now = new Date().toISOString();
      db.prepare(`
        UPDATE tasks
        SET status = 'waiting_approval',
          requires_approval = 1,
          last_error = 'manual_pause_for_mas_upgrade',
          updated_at = ?
        WHERE task_id = ?
      `).run(now, strandedTarget);
    } finally {
      db.close();
    }

    const defaultRelease = runCli([
      'family-runtime',
      'queue',
      'release',
      '--study',
      '003-dpcc-primary-care-phenotype-treatment-gap',
      '--reason',
      'manual_pause_for_mas_upgrade',
      '--source',
      'test-supervisor',
    ], env);
    const stillHeld = runCli(['family-runtime', 'queue', 'inspect', strandedTarget], env);

    assert.equal(defaultRelease.family_runtime_queue_release.released_hold_count, 0);
    assert.equal(defaultRelease.family_runtime_queue_release.idempotent_noop, true);
    assert.equal(defaultRelease.family_runtime_queue_release.released_count, 0);
    assert.equal(stillHeld.family_runtime_task.task.status, 'waiting_approval');
    assert.equal(stillHeld.family_runtime_task.task.last_error, 'manual_pause_for_mas_upgrade');

    const repairRelease = runCli([
      'family-runtime',
      'queue',
      'release',
      '--study',
      '003-dpcc-primary-care-phenotype-treatment-gap',
      '--reason',
      'manual_pause_for_mas_upgrade',
      '--source',
      'test-supervisor',
      '--repair-stranded-hold',
    ], env);
    const repaired = runCli(['family-runtime', 'queue', 'inspect', strandedTarget], env);
    const other = runCli(['family-runtime', 'queue', 'inspect', otherStudy], env);
    const humanGate = runCli(['family-runtime', 'queue', 'inspect', humanGateTask], env);

    assert.equal(repairRelease.family_runtime_queue_release.released_hold_count, 0);
    assert.equal(repairRelease.family_runtime_queue_release.repair_stranded_hold_requested, true);
    assert.equal(repairRelease.family_runtime_queue_release.stranded_hold_repair_applied, true);
    assert.equal(repairRelease.family_runtime_queue_release.released_count, 1);
    assert.equal(repairRelease.family_runtime_queue_release.released_tasks[0].task_id, strandedTarget);
    assert.equal(repaired.family_runtime_task.task.status, 'queued');
    assert.equal(repaired.family_runtime_task.task.requires_approval, false);
    assert.equal(repaired.family_runtime_task.task.last_error, null);
    assert.equal(other.family_runtime_task.task.status, 'queued');
    assert.equal(humanGate.family_runtime_task.task.status, 'waiting_approval');
    assert.equal(humanGate.family_runtime_task.task.requires_approval, true);
    assert.equal(humanGate.family_runtime_task.task.last_error, null);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
