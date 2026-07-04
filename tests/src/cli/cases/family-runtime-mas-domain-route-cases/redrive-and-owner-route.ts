import { DatabaseSync } from 'node:sqlite';
import { assert, fs, os, path, runCli, runCliFailure, shellSingleQuote, test, parseJsonText } from '../../helpers.ts';
import { createDispatchFixture, familyRuntimeEnv } from '../family-runtime-mas-domain-route-helpers.ts';

test('family-runtime operator redrive recovers failed MAS domain route provider transport without MAS truth writes', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-mas-domain-route-redrive-'));
  const dispatchedTaskPath = path.join(stateRoot, 'dispatched-task.json');
  const dispatch = createDispatchFixture(`
cp "$TASK_PATH" ${shellSingleQuote(dispatchedTaskPath)}
cat <<'JSON'
{"accepted":true,"surface_kind":"mas_family_domain_handler_dispatch_receipt","will_start_llm_worker":true}
JSON
`);
  try {
    const env = familyRuntimeEnv(stateRoot, {
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
      '{"profile":"/tmp/profile.toml","study_id":"002-dm-china-us-mortality-attribution","reason":"controller_decision_route_back","source_fingerprint":"sha256:domain-route-redrive","queue_owner":"one-person-lab","domain_truth_owner":"med-autoscience"}',
      '--dedupe-key',
      'mas:test:DM002:domain-route:redrive',
    ], env);
    const taskId = enqueue.family_runtime_enqueue.task.task_id;
    runCli(['family-runtime', 'tick', '--source', 'test-domain-route-redrive'], env);
    const providerAttempt = runCli([
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
      'sha256:domain-route-redrive',
      '--executor-kind',
      'domain_handler',
      '--task',
      taskId,
      '--new-attempt',
    ], env).family_runtime_stage_attempt.attempt;
    const queueDb = new DatabaseSync(path.join(stateRoot, 'family-runtime', 'queue.sqlite'));
    try {
      queueDb.prepare(`
        UPDATE stage_attempts
        SET status = 'failed',
          blocked_reason = 'temporal_workflow_not_started_or_not_found',
          provider_run_json = json_set(
            provider_run_json,
            '$.provider_status', 'failed',
            '$.terminal_observation.reason', 'temporal_workflow_not_started_or_not_found'
          ),
          closeout_refs_json = '[]',
          closeout_receipt_status = NULL
        WHERE stage_attempt_id = ?
      `).run(providerAttempt.stage_attempt_id);
    } finally {
      queueDb.close();
    }

    const failedTask = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const redrive = runCli([
      'family-runtime',
      'queue',
      'redrive',
      taskId,
      '--reason',
      'dm002_runtime_recovery_after_temporal_provider_ready_no_closeout',
      '--source',
      'test-domain-route-redrive',
    ], env);
    const redrivenTask = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const attempts = redrivenTask.family_runtime_task.stage_attempts;

    assert.equal(failedTask.family_runtime_task.task.status, 'succeeded');
    assert.equal(failedTask.family_runtime_task.task.current_control_state.current_attempt_state, 'succeeded');
    assert.equal(failedTask.family_runtime_task.task.current_control_state.blocker_reason, null);
    assert.equal(
      failedTask.family_runtime_task.task.current_control_state.terminal_provider_transport_observation_superseded,
      true,
    );
    assert.equal(
      failedTask.family_runtime_task.task.current_control_state.superseded_terminal_observation_reason,
      'temporal_workflow_not_started_or_not_found',
    );
    assert.equal(redrive.family_runtime_redrive.redriven, true);
    assert.equal(redrive.family_runtime_redrive.task.status, 'queued');
    assert.equal(redrive.family_runtime_redrive.redriven_stage_attempt.status, 'queued');
    assert.equal(redrivenTask.family_runtime_task.task.status, 'queued');
    assert.equal(redrivenTask.family_runtime_task.task.domain_route.authority_boundary.writes_mas_truth, false);
    assert.equal(
      redrivenTask.family_runtime_task.task.domain_route.authority_boundary.queue_owns_attempts_retry_and_dead_letter,
      true,
    );
    assert.equal(attempts.length, 3);
    assert.equal(attempts.at(-1).stage_id, 'domain_route/reconcile-apply');
    assert.equal(attempts.at(-1).provider_kind, 'local_sqlite');
    assert.equal(attempts.at(-1).workspace_locator.opl_writes_domain_truth, false);
    assert.equal(attempts.at(-1).workspace_locator.opl_writes_publication_quality, false);
    assert.equal(attempts.at(-1).workspace_locator.opl_writes_current_package, false);
    assert.equal(
      redrivenTask.family_runtime_task.events.some((event: { event_type: string; payload: Record<string, unknown> }) => (
        event.event_type === 'task_operator_redrive_from_terminal_provider_transport'
        && event.payload.previous_status === 'succeeded'
        && event.payload.previous_stage_attempt_state === 'failed'
        && event.payload.previous_stage_attempt_blocked_reason === 'temporal_workflow_not_started_or_not_found'
        && (event.payload.redrive_protocol as Record<string, unknown>).protocol === 'provider_transport_only'
        && (event.payload.redrive_protocol as Record<string, unknown>).redrive_kind === 'provider_transport_terminal'
        && (event.payload.redrive_protocol as Record<string, unknown>).domain_progress_claim === false
        && (event.payload.authority_boundary as Record<string, unknown>).domain_truth_mutation === false
        && (event.payload.authority_boundary as Record<string, unknown>).owner_receipt_created === false
        && (event.payload.authority_boundary as Record<string, unknown>).typed_blocker_created === false
        && (event.payload.authority_boundary as Record<string, unknown>).domain_progress_claim === false
      )),
      true,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(dispatch.fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime hydrates MAS runtime owner-route handoff export shape', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-mas-owner-handoff-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-mas-owner-handoff-export-'));
  const exportPath = path.join(fixtureRoot, 'export');
  const dispatchPath = path.join(fixtureRoot, 'dispatch');
  const dispatchedTaskPath = path.join(fixtureRoot, 'dispatched-task-path');
  fs.writeFileSync(
    exportPath,
    `#!/usr/bin/env bash
set -euo pipefail
cat <<'JSON'
{
  "surface_kind": "mas_family_domain_handler_export",
  "pending_family_tasks": [
    {
      "domain_id": "med-autoscience",
      "queue_owner": "one-person-lab",
      "domain_truth_owner": "med-autoscience",
      "recommended_task_kind": "domain_route/reconcile-apply",
      "priority": 55,
      "source": "mas-runtime-owner-route",
      "dedupe_key": "mas:test:DM002:owner-route:quest_waiting_opl_runtime_owner_route",
      "owner_route_ref": " quest_waiting_opl_runtime_owner_route ",
      "owner_route_refs": ["mas_runtime_owner_route_handoff", " mas_runtime_owner_route_handoff "],
      "owner_route": {"ref": " owner-route:mas/DM002/runtime-platform-repair "},
      "runtime_state_path": "studies/DM002/runtime/state.json",
      "reason": "quest_waiting_opl_runtime_owner_route",
      "opl_runtime_owner_route_handoff": {
        "surface_kind": "mas_runtime_owner_route_handoff",
        "domain_truth_owner": "med-autoscience",
        "queue_owner": "one-person-lab",
        "recommended_task_kind": "domain_route/reconcile-apply",
        "runtime_state_path": "studies/DM002/runtime/state.json",
        "authority_boundary": {
          "mas_writes_generic_runtime_queue": false,
          "mas_submits_runtime_chat": false,
          "mas_resumes_provider_worker": false,
          "opl_writes_mas_truth": false
        }
      },
      "payload": {
        "profile": "/tmp/profile.toml",
        "study_id": "DM002",
        "continuation_reason": "quest_waiting_opl_runtime_owner_route"
      }
    }
  ]
}
JSON
`,
    { mode: 0o755 },
  );
  fs.writeFileSync(
    dispatchPath,
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$1" > ${shellSingleQuote(dispatchedTaskPath)}
cat <<'JSON'
{"accepted":true,"surface_kind":"mas_family_domain_handler_dispatch_receipt","closeout_refs":["mas-receipt:DM002/owner-route-handoff-observed"]}
JSON
`,
    { mode: 0o755 },
  );
  try {
    const env = familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_EXPORT: `/bin/bash ${exportPath}`,
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH: `/bin/bash ${dispatchPath}`,
    });
    const tick = runCli(['family-runtime', 'tick', '--source', 'test-handoff', '--hydrate'], env);
    const queue = runCli(['family-runtime', 'queue', 'list'], env);
    const task = queue.family_runtime_queue.tasks[0];
    const dispatchedTask = parseJsonText(fs.readFileSync(fs.readFileSync(dispatchedTaskPath, 'utf8').trim(), 'utf8'));

    assert.equal(tick.family_runtime_tick.hydration.enqueued_count, 1);
    assert.equal(tick.family_runtime_tick.hydration.blocked_count, 0);
    assert.equal(tick.family_runtime_tick.dispatches[0].status, 'succeeded');
    assert.equal(task.domain_id, 'medautoscience');
    assert.equal(task.task_kind, 'domain_route/reconcile-apply');
    assert.equal(task.payload.queue_owner, 'one-person-lab');
    assert.equal(task.payload.domain_truth_owner, 'med-autoscience');
    assert.equal(task.payload.recommended_task_kind, 'domain_route/reconcile-apply');
    assert.equal(task.payload.reason, 'quest_waiting_opl_runtime_owner_route');
    assert.equal(task.payload.runtime_state_path, 'studies/DM002/runtime/state.json');
    assert.deepEqual(task.payload.owner_route_refs, [
      'mas_runtime_owner_route_handoff',
      'quest_waiting_opl_runtime_owner_route',
      'owner-route:mas/DM002/runtime-platform-repair',
    ]);
    assert.equal(task.domain_route.queue_owner, 'one-person-lab');
    assert.equal(task.domain_route.domain_truth_owner, 'med-autoscience');
    assert.equal(task.domain_route.runtime_owner_route_reason, 'quest_waiting_opl_runtime_owner_route');
    assert.equal(task.domain_route.runtime_state_path, 'studies/DM002/runtime/state.json');
    assert.equal(task.domain_route.exported_queue_owner, 'one-person-lab');
    assert.equal(task.domain_route.exported_domain_truth_owner, 'med-autoscience');
    assert.equal(task.domain_route.exported_recommended_task_kind, 'domain_route/reconcile-apply');
    assert.equal(task.domain_route.owner_route_handoff.handoff_ref, 'mas_runtime_owner_route_handoff');
    assert.equal(task.domain_route.owner_route_handoff.accepted_by, 'opl_runtime_owner_route');
    assert.equal(
      task.domain_route.owner_route_handoff.exported_handoff.authority_boundary.opl_writes_mas_truth,
      false,
    );
    assert.equal(task.domain_route.authority_boundary.writes_mas_truth, false);
    assert.equal(task.domain_route.authority_boundary.queue_owns_attempts_retry_and_dead_letter, true);
    assert.equal(dispatchedTask.domain_id, 'medautoscience');
    assert.equal(dispatchedTask.task_kind, 'domain_route/reconcile-apply');
    assert.equal(dispatchedTask.domain_route.runtime_owner_route_reason, 'quest_waiting_opl_runtime_owner_route');
    assert.deepEqual(dispatchedTask.domain_route.owner_route_refs, [
      'mas_runtime_owner_route_handoff',
      'quest_waiting_opl_runtime_owner_route',
      'owner-route:mas/DM002/runtime-platform-repair',
    ]);
    assert.equal(dispatchedTask.authority_boundary.opl, 'typed_queue_and_dispatch_only');
    assert.equal(dispatchedTask.authority_boundary.domain, 'truth_quality_artifact_gate_owner');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime rejects retired MAS runtime-prefixed task kinds', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-mas-retired-alias-'));
  try {
    const failure = runCliFailure([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'runtime_supervisor/reconcile-apply',
      '--payload',
      '{"study_id":"DM002"}',
    ], familyRuntimeEnv(stateRoot));

    assert.equal(failure.status, 2);
    assert.equal(failure.payload.error.code, 'cli_usage_error');
    assert.match(failure.payload.error.message, /retired/);
    assert.equal(failure.payload.error.details.replacement_task_kind, 'domain_route/reconcile-apply');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
