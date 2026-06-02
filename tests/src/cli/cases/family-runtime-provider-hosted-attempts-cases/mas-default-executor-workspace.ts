import {
  assert,
  familyRuntimeEnv,
  fs,
  os,
  path,
  runCli,
  test,
} from './helpers.ts';
import { DatabaseSync } from 'node:sqlite';

import { enqueueTask } from '../../../../../src/family-runtime-enqueue.ts';
import { ensureProviderHostedStageAttempt } from '../../../../../src/family-runtime-provider-hosted-attempts.ts';
import { createFamilyRuntimeQueueTables } from '../../../../../src/family-runtime-store.ts';

function withTemporalProviderEnv<T>(fn: () => T) {
  const previous = process.env.OPL_FAMILY_RUNTIME_PROVIDER;
  process.env.OPL_FAMILY_RUNTIME_PROVIDER = 'temporal';
  try {
    return fn();
  } finally {
    if (previous === undefined) {
      delete process.env.OPL_FAMILY_RUNTIME_PROVIDER;
    } else {
      process.env.OPL_FAMILY_RUNTIME_PROVIDER = previous;
    }
  }
}

test('family-runtime preflight blocks MAS default executor dispatch when Temporal lacks local lifecycle proof', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-default-executor-'));
  try {
    const env = familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
    });
    const enqueue = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'domain_owner/default-executor-dispatch',
      '--payload',
      JSON.stringify({
        profile: '/tmp/dm-cvd.profile.toml',
        study_id: '002-dm-china-us-mortality-attribution',
        quest_id: '002-dm-china-us-mortality-attribution',
        action_type: 'run_quality_repair_batch',
        dispatch_authority: 'quality_repair_batch_writer_handoff',
        next_executable_owner: 'write',
        executor_kind: 'codex_cli_default',
        dispatch_ref: 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/run_quality_repair_batch.json',
        authority_boundary: 'mas_default_executor_dispatch_request_only',
        source_refs: [
          {
            role: 'default_executor_dispatch_request',
            ref: 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/run_quality_repair_batch.json',
            exists: true,
            body_included: false,
          },
        ],
        workspace_root: '/tmp/explicit-workspace-root',
      }),
      '--dedupe-key',
      'mas:dm-cvd:002:default-executor:run_quality_repair_batch:writer',
    ], env);
    const taskId = enqueue.family_runtime_enqueue.task.task_id;
    const tick = runCli(['family-runtime', 'tick', '--source', 'test'], env);
    const task = runCli(['family-runtime', 'queue', 'inspect', taskId], env);

    assert.equal(tick.family_runtime_tick.provider_preflight.status, 'blocked_provider_not_ready');
    assert.equal(tick.family_runtime_tick.selected_count, 0);
    assert.equal(tick.family_runtime_tick.dispatches.length, 0);
    assert.equal(tick.family_runtime_tick.provider_blocker.blocker_id, 'temporal_runtime_not_configured');
    assert.equal(task.family_runtime_task.task.status, 'queued');
    assert.equal(task.family_runtime_task.task.dead_letter_reason, null);
    assert.equal(task.family_runtime_task.stage_attempts.length, 0);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime derives MAS default executor workspace root from profile when payload omits workspace_root', () => {
  const db = new DatabaseSync(':memory:');
  try {
    createFamilyRuntimeQueueTables(db);
    const dispatchRef = 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/run_quality_repair_batch.json';
    const enqueued = enqueueTask(db, {
      domainId: 'medautoscience',
      taskKind: 'domain_owner/default-executor-dispatch',
      payload: {
        profile: '/tmp/dm-cvd/ops/medautoscience/profiles/dm-cvd.local.toml',
        study_id: '002-dm-china-us-mortality-attribution',
        quest_id: '002-dm-china-us-mortality-attribution',
        action_type: 'run_quality_repair_batch',
        dispatch_authority: 'quality_repair_batch_writer_handoff',
        next_executable_owner: 'write',
        executor_kind: 'codex_cli_default',
        dispatch_ref: dispatchRef,
        authority_boundary: 'mas_default_executor_dispatch_request_only',
      },
      dedupeKey: 'mas:dm-cvd:002:default-executor:run_quality_repair_batch:profile-root',
    });
    assert.ok(enqueued.task);
    const row = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(enqueued.task.task_id);
    assert.ok(row);
    const attempt = withTemporalProviderEnv(() => ensureProviderHostedStageAttempt(
      db,
      row as Parameters<typeof ensureProviderHostedStageAttempt>[1],
      enqueued.task?.payload as Record<string, unknown>,
      { eventSource: 'test' },
    ));
    assert.ok(attempt);

    assert.equal(attempt.workspace_locator.workspace_root, '/tmp/dm-cvd');
    assert.equal(attempt.workspace_locator.domain_truth_owner, 'med-autoscience');
    assert.equal(attempt.workspace_locator.opl_writes_domain_truth, false);
    assert.equal(attempt.executor_kind, 'codex_cli');
    assert.deepEqual(attempt.checkpoint_refs, [dispatchRef]);
  } finally {
    db.close();
  }
});
