import { DatabaseSync } from 'node:sqlite';

import { assert, fs, os, path, runCli, shellSingleQuote, test } from '../helpers.ts';
import { createDispatchFixture, familyRuntimeEnv } from './family-runtime-mas-domain-route-helpers.ts';

test('family-runtime redrives refs-only MAS domain route checkpoints missing launch authorization', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-mas-domain-route-auth-redrive-'));
  const dispatchedTaskPath = path.join(stateRoot, 'dispatched-task.json');
  const dispatch = createDispatchFixture(`
cp "$TASK_PATH" ${shellSingleQuote(dispatchedTaskPath)}
cat <<'JSON'
{"accepted":true,"surface_kind":"mas_family_domain_handler_dispatch_receipt","will_start_llm_worker":true}
JSON
`);
  try {
    const env = familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH: dispatch.dispatchPath,
    });
    const enqueue = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'domain_route/reconcile-apply',
      '--payload',
      '{"profile":"/tmp/profile.toml","study_id":"002-dm-china-us-mortality-attribution","continuation_reason":"current_work_unit_typed_blocker_owner_resolution","source_fingerprint":"sha256:domain-route-auth-redrive","queue_owner":"one-person-lab","domain_truth_owner":"med-autoscience","opl_writes_domain_truth":false,"opl_writes_publication_quality":false,"opl_writes_current_package":false}',
      '--dedupe-key',
      'mas:test:DM002:domain-route:refs-only-auth-redrive',
    ], env);
    const taskId = enqueue.family_runtime_enqueue.task.task_id;
    runCli(['family-runtime', 'tick', '--source', 'test-domain-route-auth-redrive'], env);
    const oldAttempt = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'domain_route/reconcile-apply',
      '--provider',
      'temporal',
      '--workspace-locator',
      '{"route_ref":"domain_route/reconcile-apply","action_ref":"domain_route_reconcile_apply","study_id":"002-dm-china-us-mortality-attribution","opl_writes_domain_truth":false}',
      '--source-fingerprint',
      'sha256:domain-route-auth-redrive',
      '--executor-kind',
      'domain_handler',
      '--task',
      taskId,
      '--new-attempt',
    ], env).family_runtime_stage_attempt.attempt;

    const queueDb = new DatabaseSync(path.join(stateRoot, 'family-runtime', 'queue.sqlite'));
    try {
      queueDb.prepare(`
        UPDATE tasks
        SET status = 'succeeded', lease_owner = NULL, lease_expires_at = NULL, last_error = NULL,
          dead_letter_reason = NULL
        WHERE task_id = ?
      `).run(taskId);
      queueDb.prepare(`
        UPDATE stage_attempts
        SET status = 'checkpointed',
          closeout_receipt_status = 'domain_handler_receipt_ref_only',
          provider_run_json = json_set(provider_run_json, '$.provider_status', 'checkpointed'),
          workspace_locator_json = json_remove(
            workspace_locator_json,
            '$.provider_attempt_ref',
            '$.attempt_lease_ref',
            '$.attempt_lease_status',
            '$.execution_authorization_decision_ref',
            '$.execution_authorization_receipt_ref'
          )
        WHERE stage_attempt_id = ?
      `).run(oldAttempt.stage_attempt_id);
    } finally {
      queueDb.close();
    }

    const staleTask = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const staleControl = staleTask.family_runtime_task.task.current_control_state;
    assert.equal(staleTask.family_runtime_task.task.status, 'succeeded');
    assert.equal(staleControl.running_provider_attempt, false);
    assert.equal(staleControl.active_stage_attempt_id, null);
    assert.equal(staleControl.reconciliation_status, 'blocked_missing_launch_execution_authorization');
    assert.equal(staleControl.blocker_reason, 'launch_execution_authorization_required_for_refs_only_checkpoint');
    assert.deepEqual(staleControl.missing_launch_authorization_fields, [
      'provider_attempt_ref',
      'attempt_lease_ref',
      'execution_authorization_decision_ref',
      'execution_authorization_receipt_ref',
    ]);

    const redrive = runCli([
      'family-runtime',
      'queue',
      'redrive',
      taskId,
      '--reason',
      'missing_launch_execution_authorization_after_opl_fix',
      '--source',
      'test-domain-route-auth-redrive',
    ], env);
    const redrivenTask = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const attempts = redrivenTask.family_runtime_task.stage_attempts;
    const redrivenAttempt = redrive.family_runtime_redrive.redriven_stage_attempt;

    assert.equal(redrive.family_runtime_redrive.redriven, true);
    assert.equal(redrive.family_runtime_redrive.task.status, 'queued');
    assert.equal(redrivenAttempt.status, 'queued');
    assert.equal(redrivenAttempt.workspace_locator.provider_attempt_ref, `temporal://attempt/${redrivenAttempt.stage_attempt_id}`);
    assert.equal(
      redrivenAttempt.workspace_locator.attempt_lease_ref,
      `opl://stage-attempts/${redrivenAttempt.stage_attempt_id}/leases/${taskId}/active`,
    );
    assert.equal(
      redrivenAttempt.workspace_locator.execution_authorization_decision_ref,
      `opl://stage-attempts/${redrivenAttempt.stage_attempt_id}/execution-authorizations/${taskId}/${redrivenAttempt.workflow_id}`,
    );
    assert.equal(typeof redrivenAttempt.workspace_locator.execution_authorization_receipt_ref, 'string');
    assert.equal(redrivenTask.family_runtime_task.task.status, 'queued');
    assert.equal(attempts.length, 2);
    assert.equal(
      redrivenTask.family_runtime_task.events.some((event: { event_type: string; payload: Record<string, unknown> }) => (
        event.event_type === 'task_operator_redrive_from_refs_only_checkpoint_missing_launch_authorization'
        && event.payload.previous_status === 'succeeded'
        && event.payload.previous_stage_attempt_state === 'checkpointed'
        && event.payload.previous_closeout_receipt_status === 'domain_handler_receipt_ref_only'
        && (event.payload.authority_boundary as Record<string, unknown>).domain_truth_mutation === false
        && (event.payload.authority_boundary as Record<string, unknown>).refs_only_checkpoint_is_running_proof === false
      )),
      true,
    );
    const queueDbAfterRedrive = new DatabaseSync(path.join(stateRoot, 'family-runtime', 'queue.sqlite'));
    try {
      queueDbAfterRedrive.prepare(`
        UPDATE tasks
        SET status = 'succeeded', lease_owner = NULL, lease_expires_at = NULL, last_error = NULL,
          dead_letter_reason = NULL
        WHERE task_id = ?
      `).run(taskId);
      queueDbAfterRedrive.prepare(`
        UPDATE stage_attempts
        SET status = 'checkpointed',
          closeout_receipt_status = 'domain_handler_receipt_ref_only',
          provider_run_json = json_set(provider_run_json, '$.provider_status', 'checkpointed'),
          closeout_refs_json = '["runtime/artifacts/opl_family_domain_handler/dispatch_receipts/current.json"]'
        WHERE stage_attempt_id = ?
      `).run(redrivenAttempt.stage_attempt_id);
    } finally {
      queueDbAfterRedrive.close();
    }
    const refsOnlyTask = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const refsOnlyControl = refsOnlyTask.family_runtime_task.task.current_control_state;
    assert.equal(refsOnlyControl.running_provider_attempt, false);
    assert.equal(refsOnlyControl.active_stage_attempt_id, null);
    assert.equal(refsOnlyControl.reconciliation_status, 'checkpointed_refs_only_domain_handler_receipt');
    assert.equal(refsOnlyControl.blocker_reason, 'domain_handler_receipt_ref_only_not_provider_running_proof');
    assert.equal(refsOnlyControl.authority_boundary.refs_only_checkpoint_is_running_proof, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(dispatch.fixtureRoot, { recursive: true, force: true });
  }
});
