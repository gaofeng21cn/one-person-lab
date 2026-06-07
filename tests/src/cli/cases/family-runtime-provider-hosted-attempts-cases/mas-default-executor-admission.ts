import { DatabaseSync } from 'node:sqlite';

import {
  assert,
  createDispatchFixture,
  familyRuntimeEnv,
  fs,
  os,
  path,
  runCli,
  test,
} from './helpers.ts';

import { ensureProviderHostedStageAttempt } from '../../../../../src/family-runtime-provider-hosted-attempts.ts';
import { listStageAttemptsForTask } from '../../../../../src/family-runtime-stage-attempts.ts';
import {
  createQueueTables,
  defaultExecutorPayload,
  insertSucceededTask,
  withIsolatedFamilyRuntimeEnv,
} from './mas-default-executor-helpers.ts';

test('family-runtime admits MAS AI reviewer default executor dispatch without domain truth authority', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-default-executor-ai-reviewer-'));
  const dispatch = createDispatchFixture(`
python3 - "$TASK_PATH" <<'PY'
import json
import sys
from pathlib import Path

task = json.loads(Path(sys.argv[1]).read_text())
payload = task["payload"]
assert task["task_kind"] == "domain_owner/default-executor-dispatch"
assert payload["action_type"] == "return_to_ai_reviewer_workflow"
assert payload["next_executable_owner"] == "ai_reviewer"
print(json.dumps({
    "accepted": True,
    "surface_kind": "mas_family_domain_handler_dispatch_receipt",
    "task_id": task["task_id"],
    "task_kind": task["task_kind"],
    "will_start_llm_worker": True,
    "dispatch": {
        "execution_policy": "opl_default_executor_stage_attempt_admission",
        "result": {
            "surface": "default_executor_dispatch_request_admission",
            "status": "admitted",
            "next_owner": "ai_reviewer",
            "dispatch_ref": payload["dispatch_ref"]
        }
    }
}))
PY
`);
  try {
    const env = familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH: dispatch.dispatchPath,
      OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
    });
    const dispatchRef = 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/return_to_ai_reviewer_workflow.json';
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
        action_type: 'return_to_ai_reviewer_workflow',
        dispatch_authority: 'ai_reviewer_record_production_handoff',
        next_executable_owner: 'ai_reviewer',
        executor_kind: 'codex_cli_default',
        dispatch_ref: dispatchRef,
        authority_boundary: 'mas_default_executor_dispatch_request_only',
        work_unit_id: 'produce_ai_reviewer_publication_eval_record_against_current_manuscript',
        domain_owner: 'ai_reviewer',
        source_fingerprint: 'truth-snapshot::085b4164f248a2f4c92bf66b',
        workspace_root: '/tmp/explicit-workspace-root',
      }),
      '--dedupe-key',
      'mas:dm-cvd:002:default-executor:return_to_ai_reviewer_workflow:ai-reviewer',
    ], env);
    const taskId = enqueue.family_runtime_enqueue.task.task_id;
    const tick = runCli(['family-runtime', 'tick', '--source', 'test'], env);
    const task = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const attempt = task.family_runtime_task.stage_attempts[0];

    assert.equal(tick.family_runtime_tick.provider_preflight.status, 'blocked_provider_not_ready');
    assert.equal(tick.family_runtime_tick.selected_count, 0);
    assert.equal(tick.family_runtime_tick.dispatches.length, 0);
    assert.equal(tick.family_runtime_tick.provider_blocker.blocker_id, 'temporal_runtime_not_configured');
    assert.equal(tick.family_runtime_tick.provider_runtime_after_slo.providers.temporal.ready, false);
    assert.equal(task.family_runtime_task.task.status, 'queued');
    assert.equal(task.family_runtime_task.task.dead_letter_reason, null);
    assert.equal(task.family_runtime_task.stage_attempts.length, 0);
    assert.equal(attempt, undefined);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(dispatch.fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime admits MAS publication gate owner default executor dispatch as a provider-hosted attempt', () => {
  const db = new DatabaseSync(':memory:');
  try {
    withIsolatedFamilyRuntimeEnv(() => {
      createQueueTables(db);
      const taskId = 'task-mas-default-publication-gate-owner';
      const payload = {
        ...defaultExecutorPayload('publication-gate-owner-source'),
        action_type: 'publication_handoff_owner_gate',
        dispatch_authority: 'consumer_default_executor_dispatch',
        next_executable_owner: 'publication_gate_owner',
        domain_owner: 'publication_gate_owner',
        work_unit_id: 'publication_handoff_owner_gate',
        dispatch_ref: 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/publication_handoff_owner_gate.json',
      };
      insertSucceededTask(db, {
        taskId,
        domainId: 'medautoscience',
        taskKind: 'domain_owner/default-executor-dispatch',
        payload,
        dedupeKey: 'mas:dm-cvd:002:default-executor:publication_handoff_owner_gate:publication-gate-owner',
      });
      db.prepare("UPDATE tasks SET status = 'queued' WHERE task_id = ?").run(taskId);
      const row = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(taskId) as Parameters<
        typeof ensureProviderHostedStageAttempt
      >[1];

      const attempt = ensureProviderHostedStageAttempt(db, row, payload);
      const attempts = listStageAttemptsForTask(db, taskId);

      assert.ok(attempt);
      assert.equal(attempt.stage_id, 'domain_owner/default-executor-dispatch');
      assert.equal(attempt.executor_kind, 'codex_cli');
      assert.equal(attempt.workspace_locator.next_executable_owner, 'publication_gate_owner');
      assert.equal(attempt.workspace_locator.action_type, 'publication_handoff_owner_gate');
      assert.equal(attempts.length, 1);
      assert.equal(attempts[0].stage_attempt_id, attempt.stage_attempt_id);
    });
  } finally {
    db.close();
  }
});
