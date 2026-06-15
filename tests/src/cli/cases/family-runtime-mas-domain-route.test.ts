import { DatabaseSync } from 'node:sqlite';

import { assert, fs, os, path, runCli, runCliFailure, shellSingleQuote, test } from '../helpers.ts';
import { createDispatchFixture, familyRuntimeEnv } from './family-runtime-mas-domain-route-helpers.ts';

test('family-runtime tick hydrates MAS domain route pending tasks before dispatch', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-hydrate-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-mas-export-'));
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
      "domain_id": "medautoscience",
      "task_kind": "domain_route/reconcile-apply",
      "priority": 50,
      "source": "mas-domain-handler-export",
      "dedupe_key": "mas:test:DM002:autonomy-continuation:slo_breach",
      "payload": {
        "profile": "/tmp/profile.toml",
        "study_id": "DM002",
        "continuation_reason": "slo_breach"
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
{"accepted":true,"surface_kind":"mas_family_domain_handler_dispatch_receipt","will_start_llm_worker":true}
JSON
`,
    { mode: 0o755 },
  );
  try {
    const tick = runCli(['family-runtime', 'tick', '--source', 'test', '--hydrate'], familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_EXPORT: exportPath,
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH: dispatchPath,
    }));
    const queue = runCli(['family-runtime', 'queue', 'list'], familyRuntimeEnv(stateRoot));
    const notifications = runCli(['family-runtime', 'notify', 'list'], familyRuntimeEnv(stateRoot));
    const dispatchedTask = JSON.parse(fs.readFileSync(fs.readFileSync(dispatchedTaskPath, 'utf8').trim(), 'utf8'));

    assert.equal(tick.family_runtime_tick.hydration.enqueued_count, 1);
    assert.equal(tick.family_runtime_tick.selected_count, 1);
    assert.equal(tick.family_runtime_tick.dispatches[0].status, 'succeeded');
    assert.equal(queue.family_runtime_queue.queue.by_status.succeeded, 1);
    assert.equal(queue.family_runtime_queue.tasks[0].dedupe_key, 'mas:test:DM002:autonomy-continuation:slo_breach');
    assert.equal(dispatchedTask.task_kind, 'domain_route/reconcile-apply');
    assert.equal(dispatchedTask.domain_route.route_ref, 'domain_route/reconcile-apply');
    assert.equal(dispatchedTask.domain_route.action_ref, 'domain_route_reconcile_apply');
    assert.equal(dispatchedTask.payload.study_id, 'DM002');
    assert.equal(notifications.family_runtime_notifications.notifications.length, 2);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime projects active MAS domain route refs without legacy aliasing', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-mas-domain-route-'));
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
      '{"study_id":"DM002","source_refs":[{"role":"mas_owner_status","ref":"studies/DM002/status.json"}],"source_fingerprint":"sha256:domain-route"}',
      '--dedupe-key',
      'mas:test:DM002:domain-route',
    ], env);
    const taskId = enqueue.family_runtime_enqueue.task.task_id;
    const tick = runCli(['family-runtime', 'tick', '--source', 'test'], env);
    const task = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const dispatchedTask = JSON.parse(fs.readFileSync(dispatchedTaskPath, 'utf8'));
    const attempt = task.family_runtime_task.stage_attempts[0];

    assert.equal(enqueue.family_runtime_enqueue.task.task_kind, 'domain_route/reconcile-apply');
    assert.equal(enqueue.family_runtime_enqueue.task.domain_route.route_ref, 'domain_route/reconcile-apply');
    assert.equal(enqueue.family_runtime_enqueue.task.domain_route.action_ref, 'domain_route_reconcile_apply');
    assert.equal(tick.family_runtime_tick.dispatches[0].status, 'succeeded');
    assert.equal(task.family_runtime_task.task.task_kind, 'domain_route/reconcile-apply');
    assert.equal(task.family_runtime_task.task.domain_route.domain_truth_owner, 'med-autoscience');
    assert.equal(task.family_runtime_task.task.domain_route.authority_boundary.writes_mas_truth, false);
    assert.equal(
      task.family_runtime_task.task.domain_route.authority_boundary.opl_owns_generic_runtime_queue_attempt_liveness_redrive,
      true,
    );
    assert.equal(task.family_runtime_task.task.domain_route.owner_route_handoff.handoff_ref, 'mas_runtime_owner_route_handoff');
    assert.equal(task.family_runtime_task.task.domain_route.owner_route_handoff.accepted_by, 'opl_runtime_owner_route');
    assert.deepEqual(task.family_runtime_task.task.domain_route.owner_route_handoff.accepted_runtime_responsibilities, [
      'generic_runtime_queue',
      'stage_attempt_ledger',
      'liveness_projection',
      'provider_wakeup',
      'redrive_retry_dead_letter',
    ]);
    assert.equal(task.family_runtime_task.task.domain_route.owner_route_handoff.authority_boundary.writes_domain_truth, false);
    assert.equal(attempt.stage_id, 'domain_route/reconcile-apply');
    assert.equal(attempt.workspace_locator.route_ref, 'domain_route/reconcile-apply');
    assert.equal(attempt.workspace_locator.provider_attempt_ref, `temporal://attempt/${attempt.stage_attempt_id}`);
    assert.equal(
      attempt.workspace_locator.attempt_lease_ref,
      `opl://stage-attempts/${attempt.stage_attempt_id}/leases/${taskId}/active`,
    );
    assert.equal(
      attempt.workspace_locator.execution_authorization_decision_ref,
      `opl://stage-attempts/${attempt.stage_attempt_id}/execution-authorizations/${taskId}/${attempt.workflow_id}`,
    );
    assert.equal(typeof attempt.workspace_locator.execution_authorization_receipt_ref, 'string');
    assert.equal(
      attempt.workspace_locator.execution_authorization_receipt_ref.startsWith(
        'opl://stage-run-execution-authorization/',
      ),
      true,
    );
    assert.equal(dispatchedTask.task_kind, 'domain_route/reconcile-apply');
    assert.equal(dispatchedTask.domain_route.route_ref, 'domain_route/reconcile-apply');
    assert.equal(dispatchedTask.domain_route.action_ref, 'domain_route_reconcile_apply');
    assert.equal(dispatchedTask.paper_autonomy, null);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(dispatch.fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime keeps MAS domain route admission requests open until provider follow-through', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-mas-domain-route-admission-'));
  const dispatchedTaskPath = path.join(stateRoot, 'dispatched-task.json');
  const dispatch = createDispatchFixture(`
cp "$TASK_PATH" ${shellSingleQuote(dispatchedTaskPath)}
cat <<'JSON'
{
  "accepted": true,
  "surface_kind": "mas_family_domain_handler_dispatch_receipt",
  "opl_attempt_admission_requested": true,
  "opl_attempt_admission_status": "requested",
  "dispatch": {
    "action_type": "domain_route_owner_handoff",
    "study_id": "002-dm-china-us-mortality-attribution",
    "execution_policy": "opl_route_hydration_stage_attempt_admission",
    "result": {
      "surface": "domain_route_owner_handoff_admission",
      "status": "opl_attempt_admission_requested",
      "study_id": "002-dm-china-us-mortality-attribution",
      "continuation_reason": "current_work_unit_typed_blocker_owner_resolution",
      "mas_executes_reconcile_apply": false,
      "provider_completion_is_domain_completion": false
    }
  },
  "receipt_ref": "runtime/artifacts/opl_family_domain_handler/dispatch_receipts/unit.json"
}
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
      '{"profile":"/tmp/profile.toml","study_id":"002-dm-china-us-mortality-attribution","reason":"current_work_unit_typed_blocker_owner_resolution","source_fingerprint":"4ed3699bda5e3842","queue_owner":"one-person-lab","domain_truth_owner":"med-autoscience"}',
      '--dedupe-key',
      'mas:test:DM002:domain-route:admission-requested',
    ], env);
    const taskId = enqueue.family_runtime_enqueue.task.task_id;
    const tick = runCli(['family-runtime', 'tick', '--source', 'test-domain-route-admission-requested'], env);
    const task = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const queue = runCli(['family-runtime', 'queue', 'list', '--status', 'running'], env);
    const dispatchedTask = JSON.parse(fs.readFileSync(dispatchedTaskPath, 'utf8'));
    const inspectedTask = task.family_runtime_task.task;
    const control = inspectedTask.current_control_state;
    const attempt = task.family_runtime_task.stage_attempts[0];

    assert.equal(tick.family_runtime_tick.dispatches[0].status, 'running');
    assert.equal(inspectedTask.status, 'running');
    assert.equal(inspectedTask.last_error, 'opl_attempt_admission_requested');
    assert.equal(inspectedTask.dead_letter_reason, null);
    assert.equal(queue.family_runtime_queue.queue.by_status.running, 1);
    assert.equal(attempt.status, 'queued');
    assert.equal(attempt.closeout_receipt_status, 'domain_handler_receipt_ref_only');
    assert.deepEqual(attempt.closeout_refs, [
      'runtime/artifacts/opl_family_domain_handler/dispatch_receipts/unit.json',
    ]);
    assert.equal(control.running_provider_attempt, false);
    assert.equal(control.reconciliation_status, 'provider_admission_requested');
    assert.equal(control.current_attempt_state, 'queued');
    assert.equal(control.blocker_reason, 'provider_attempt_start_pending');
    assert.equal(control.authority_boundary.refs_only_checkpoint_is_running_proof, false);
    assert.equal(dispatchedTask.task_kind, 'domain_route/reconcile-apply');
    assert.equal(dispatchedTask.domain_route.runtime_owner_route_reason, 'current_work_unit_typed_blocker_owner_resolution');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(dispatch.fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime repairs historical MAS domain route admission requests and hydrates provider follow-through', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-mas-domain-route-admission-repair-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-mas-domain-route-admission-repair-export-'));
  const workspaceRoot = path.join(fixtureRoot, 'workspace');
  const exportPath = path.join(fixtureRoot, 'export');
  const dispatchPath = path.join(fixtureRoot, 'dispatch');
  const currentControlPath = path.join(
    workspaceRoot,
    'runtime',
    'artifacts',
    'supervision',
    'opl_current_control_state',
    'latest.json',
  );
  const profilePath = path.join(workspaceRoot, 'ops', 'medautoscience', 'profiles', 'dm-cvd.local.toml');
  fs.mkdirSync(path.dirname(currentControlPath), { recursive: true });
  fs.mkdirSync(path.dirname(profilePath), { recursive: true });
  fs.writeFileSync(profilePath, '[workspace]\nname = "dm-cvd"\n', 'utf8');
  fs.writeFileSync(currentControlPath, JSON.stringify({
    surface: 'opl_current_control_state',
    schema_version: 1,
    generated_at: '2026-06-15T00:00:00.000Z',
    provider_admission_candidates: [
      {
        status: 'provider_admission_pending',
        owner_route_current: true,
        study_id: '002-dm-china-us-mortality-attribution',
        quest_id: '002-dm-china-us-mortality-attribution',
        action_type: 'run_gate_clearing_batch',
        work_unit_id: 'ai_reviewer_record_gate_consumption',
        work_unit_fingerprint: 'domain-transition::route_back_same_line::ai_reviewer_record_gate_consumption',
        source_fingerprint: 'owner-route-source::bd7a56d808fc043a60e185b0',
        dispatch_authority: 'opl_current_control_state_handoff',
        next_executable_owner: 'medautoscience',
        executor_kind: 'codex_cli_default',
        dispatch_ref: 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/immutable/run_gate_clearing_batch/c791014796a9bc31f41c3809.json',
        route_identity_key: 'owner-route::002::gate-clearing',
        attempt_idempotency_key: 'attempt::002::gate-clearing',
        stage_transition_authority_boundary: {
          producer_kind: 'runtime_provider',
          intent_kind: 'provider_observation',
          stage_transition_authority: 'one-person-lab',
          intent_can_write_stage_current_pointer: false,
          intent_can_write_stage_run_terminal_state: false,
          intent_can_publish_current_owner_delta: false,
          intent_can_write_domain_truth: false,
          intent_can_create_owner_receipt: false,
          intent_can_create_typed_blocker: false,
          provider_completion_counts_as_stage_transition: false,
          read_model_update_counts_as_stage_transition: false,
          worklist_update_counts_as_stage_transition: false,
          evidence_event_counts_as_stage_transition: false,
          agent_lab_output_counts_as_stage_transition: false,
        },
        stage_packet_refs: [
          'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/immutable/run_gate_clearing_batch/c791014796a9bc31f41c3809.json',
        ],
        currentness_basis: {
          work_unit_id: 'ai_reviewer_record_gate_consumption',
          work_unit_fingerprint: 'domain-transition::route_back_same_line::ai_reviewer_record_gate_consumption',
          source_eval_id: 'publication-eval::002::2026-06-15',
          truth_epoch: 'truth-event-000040-1a4d1f9cfed66d87',
          runtime_health_epoch: 'runtime-health-event-006968-4c760b17f33796ee',
        },
      },
    ],
  }), 'utf8');
  fs.writeFileSync(
    exportPath,
    `#!/usr/bin/env bash
set -euo pipefail
cat <<'JSON'
{
  "surface_kind": "mas_family_domain_handler_export",
  "workspace": {
    "workspace_root": ${JSON.stringify(workspaceRoot)},
    "workspace_exists": true
  },
  "profile": {
    "profile_name": "dm-cvd",
    "profile_ref": ${JSON.stringify(profilePath)}
  }
}
JSON
`,
    { mode: 0o755 },
  );
  fs.writeFileSync(
    dispatchPath,
    `#!/usr/bin/env bash
set -euo pipefail
cat <<'JSON'
{"accepted":true,"surface_kind":"mas_family_domain_handler_dispatch_receipt"}
JSON
`,
    { mode: 0o755 },
  );
  try {
    const env = familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_PROVIDER: 'local_sqlite',
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_EXPORT: `/bin/bash ${exportPath}`,
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH: `/bin/bash ${dispatchPath}`,
    });
    const enqueue = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'domain_route/reconcile-apply',
      '--payload',
      '{"profile":"/tmp/profile.toml","study_id":"002-dm-china-us-mortality-attribution","reason":"current_work_unit_typed_blocker_owner_resolution","source_fingerprint":"4ed3699bda5e3842","queue_owner":"one-person-lab","domain_truth_owner":"med-autoscience"}',
      '--dedupe-key',
      'mas:test:DM002:domain-route:historical-admission-requested',
    ], env);
    const routeTaskId = enqueue.family_runtime_enqueue.task.task_id;
    const oldAttempt = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'domain_route/reconcile-apply',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      '{"route_ref":"domain_route/reconcile-apply","action_ref":"domain_route_reconcile_apply","study_id":"002-dm-china-us-mortality-attribution","opl_writes_domain_truth":false}',
      '--source-fingerprint',
      '4ed3699bda5e3842',
      '--executor-kind',
      'domain_handler',
      '--task',
      routeTaskId,
    ], env).family_runtime_stage_attempt.attempt;
    const queueDb = new DatabaseSync(path.join(stateRoot, 'family-runtime', 'queue.sqlite'));
    try {
      queueDb.prepare(`
        UPDATE tasks
        SET status = 'succeeded', attempts = 1, last_error = NULL, dead_letter_reason = NULL
        WHERE task_id = ?
      `).run(routeTaskId);
      queueDb.prepare(`
        UPDATE stage_attempts
        SET status = 'checkpointed',
          closeout_refs_json = '["runtime/artifacts/opl_family_domain_handler/dispatch_receipts/unit.json"]',
          closeout_receipt_status = 'domain_handler_receipt_ref_only',
          provider_run_json = json_set(provider_run_json, '$.provider_status', 'checkpointed')
        WHERE stage_attempt_id = ?
      `).run(oldAttempt.stage_attempt_id);
      queueDb.prepare(`
        INSERT INTO events(event_id, task_id, domain_id, event_type, source, payload_json, created_at)
        VALUES ('evt_historical_admission_requested', ?, 'medautoscience', 'task_dispatch_succeeded', 'test-legacy-dispatch', ?, ?)
      `).run(
        routeTaskId,
        JSON.stringify({
          output: {
            accepted: true,
            surface_kind: 'mas_family_domain_handler_dispatch_receipt',
            opl_attempt_admission_requested: true,
            opl_attempt_admission_status: 'requested',
            dispatch: {
              execution_policy: 'opl_route_hydration_stage_attempt_admission',
              result: { status: 'opl_attempt_admission_requested' },
            },
            receipt_ref: 'runtime/artifacts/opl_family_domain_handler/dispatch_receipts/unit.json',
          },
        }),
        new Date().toISOString(),
      );
    } finally {
      queueDb.close();
    }

    const before = runCli(['family-runtime', 'queue', 'inspect', routeTaskId], env);
    const repairTick = runCli(['family-runtime', 'tick', '--source', 'test-domain-route-admission-repair'], env);
    const repaired = runCli(['family-runtime', 'queue', 'inspect', routeTaskId], env);
    const followThroughTick = runCli(['family-runtime', 'tick', '--source', 'test-domain-route-admission-repair-followthrough', '--hydrate'], env);
    const queue = runCli(['family-runtime', 'queue', 'list'], env);
    const defaultExecutorTask = queue.family_runtime_queue.tasks.find((task: { task_kind: string }) =>
      task.task_kind === 'domain_owner/default-executor-dispatch'
    );
    const inspectedDefaultExecutorTask = defaultExecutorTask
      ? runCli(['family-runtime', 'queue', 'inspect', defaultExecutorTask.task_id], env).family_runtime_task.task
      : null;

    assert.equal(before.family_runtime_task.task.status, 'succeeded');
    assert.equal(before.family_runtime_task.task.current_control_state.reconciliation_status, 'checkpointed_refs_only_domain_handler_receipt');
    assert.equal(repairTick.family_runtime_tick.selected_count, 0);
    assert.equal(repairTick.family_runtime_tick.repaired_mas_domain_route_admission_requested_count, 1);
    assert.equal(repaired.family_runtime_task.task.status, 'running');
    assert.equal(repaired.family_runtime_task.task.last_error, 'opl_attempt_admission_requested');
    assert.equal(repaired.family_runtime_task.stage_attempts[0].status, 'queued');
    assert.equal(repaired.family_runtime_task.task.current_control_state.reconciliation_status, 'provider_admission_requested');
    assert.equal(followThroughTick.family_runtime_tick.hydration.enqueued_count, 1);
    assert.equal(followThroughTick.family_runtime_tick.selected_count, 1);
    assert.equal(followThroughTick.family_runtime_tick.dispatches[0].status, 'blocked');
    assert.equal(followThroughTick.family_runtime_tick.dispatches[0].reason, 'temporal_stage_attempt_start_failed');
    assert.equal(
      followThroughTick.family_runtime_tick.dispatches[0].admitted_stage_attempt.stage_id,
      'domain_owner/default-executor-dispatch',
    );
    assert.ok(defaultExecutorTask);
    assert.equal(defaultExecutorTask.payload.action_type, 'run_gate_clearing_batch');
    assert.equal(inspectedDefaultExecutorTask.current_control_state.reconciliation_status, 'blocked');
    assert.equal(inspectedDefaultExecutorTask.current_control_state.blocker_reason, 'Temporal start requires a temporal stage attempt.');
    assert.equal(inspectedDefaultExecutorTask.current_control_state.running_provider_attempt, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

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
        && (event.payload.authority_boundary as Record<string, unknown>).domain_truth_mutation === false
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
    const dispatchedTask = JSON.parse(fs.readFileSync(fs.readFileSync(dispatchedTaskPath, 'utf8').trim(), 'utf8'));

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

test('family-runtime hydrates MAS publication aftercare owner route refs without MAS runtime ownership', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-mas-aftercare-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-mas-aftercare-export-'));
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
      "domain_id": "medautoscience",
      "task_kind": "publication_aftercare/analysis-queue-progress",
      "priority": 45,
      "source": "mas-publication-aftercare",
      "dedupe_key": "mas:dm-cvd:DM002:publication-aftercare:analysis:sha256-unit",
      "dispatch_owner": "med-autoscience",
      "profile_name": "dm-cvd",
      "source_fingerprint": "sha256-unit",
      "source_refs": [
        {"role": "publication_eval", "ref": "studies/DM002/artifacts/publication_eval/latest.json"}
      ],
      "owner_route_refs": ["owner-route:mas/DM002/unit_harmonized_validation_uncertainty_and_grouped_calibration"],
      "typed_blocker_refs": ["typed-blocker:mas/DM002/current-package-stale"],
      "payload": {
        "profile": "/tmp/dm-cvd.local.toml",
        "study_id": "DM002",
        "publication_aftercare_reason": "analysis_queue_owner_route_ref",
        "authority_boundary": "mas_owner_route_task_ref_only"
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
{
  "accepted": true,
  "surface_kind": "mas_family_domain_handler_dispatch_receipt",
  "closeout_packet": {
    "surface_kind": "stage_attempt_closeout_packet",
    "closeout_refs": ["mas-receipt:DM002/aftercare-analysis-queued"],
    "next_owner": "med-autoscience",
    "domain_ready_verdict": "domain_gate_pending",
    "route_impact": {
      "study_id": "DM002",
      "decision": "publication_aftercare_analysis_queue_progress_dispatched"
    }
  }
}
JSON
`,
    { mode: 0o755 },
  );
  try {
    const tick = runCli(['family-runtime', 'tick', '--source', 'test-hydrate', '--hydrate'], familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_EXPORT: `/bin/bash ${exportPath}`,
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH: `/bin/bash ${dispatchPath}`,
    }));
    const queue = runCli(['family-runtime', 'queue', 'list'], familyRuntimeEnv(stateRoot));
    const task = queue.family_runtime_queue.tasks[0];
    const inspected = runCli(['family-runtime', 'queue', 'inspect', task.task_id], familyRuntimeEnv(stateRoot));
    const attempt = inspected.family_runtime_task.stage_attempts[0];
    const dispatchedTask = JSON.parse(fs.readFileSync(fs.readFileSync(dispatchedTaskPath, 'utf8').trim(), 'utf8'));

    assert.equal(tick.family_runtime_tick.hydration.enqueued_count, 1);
    assert.equal(tick.family_runtime_tick.dispatches[0].status, 'succeeded');
    assert.equal(tick.family_runtime_tick.dispatches[0].stage_attempts[0].stage_id, 'publication_aftercare/analysis-queue-progress');
    assert.equal(task.task_kind, 'publication_aftercare/analysis-queue-progress');
    assert.equal(task.domain_route.route_ref, 'publication_aftercare/analysis-queue-progress');
    assert.equal(task.domain_route.action_ref, 'domain_route_reconcile_apply');
    assert.equal(task.domain_route.study_id, 'DM002');
    assert.equal(task.domain_route.publication_aftercare_reason, 'analysis_queue_owner_route_ref');
    assert.deepEqual(task.domain_route.owner_route_refs, [
      'owner-route:mas/DM002/unit_harmonized_validation_uncertainty_and_grouped_calibration',
    ]);
    assert.deepEqual(task.domain_route.typed_blocker_refs, ['typed-blocker:mas/DM002/current-package-stale']);
    assert.equal(task.domain_route.authority_boundary.writes_mas_truth, false);
    assert.equal(task.domain_route.authority_boundary.queue_owns_attempts_retry_and_dead_letter, true);
    assert.equal(task.domain_route.owner_route_handoff.handoff_ref, 'mas_runtime_owner_route_handoff');
    assert.equal(task.domain_route.owner_route_handoff.accepted_by, 'opl_runtime_owner_route');
    assert.equal(dispatchedTask.domain_route.route_ref, 'publication_aftercare/analysis-queue-progress');
    assert.deepEqual(dispatchedTask.domain_route.owner_route_refs, [
      'owner-route:mas/DM002/unit_harmonized_validation_uncertainty_and_grouped_calibration',
    ]);
    assert.equal(dispatchedTask.authority_boundary.opl, 'typed_queue_and_dispatch_only');
    assert.equal(dispatchedTask.authority_boundary.domain, 'truth_quality_artifact_gate_owner');
    assert.equal(attempt.provider_kind, 'local_sqlite');
    assert.equal(attempt.stage_id, 'publication_aftercare/analysis-queue-progress');
    assert.equal(attempt.task_id, task.task_id);
    assert.equal(attempt.status, 'completed');
    assert.deepEqual(attempt.closeout_refs, ['mas-receipt:DM002/aftercare-analysis-queued']);
    assert.equal(attempt.workspace_locator.route_ref, 'publication_aftercare/analysis-queue-progress');
    assert.equal(attempt.workspace_locator.action_ref, 'domain_route_reconcile_apply');
    assert.equal(attempt.workspace_locator.opl_writes_domain_truth, false);
    assert.equal(attempt.workspace_locator.opl_writes_current_package, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime hydrates MAS publication aftercare reviewer refresh refs without MAS truth writes', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-mas-reviewer-refresh-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-mas-reviewer-refresh-export-'));
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
      "domain_id": "medautoscience",
      "task_kind": "publication_aftercare/reviewer-refresh",
      "priority": 40,
      "source": "mas-publication-aftercare",
      "dedupe_key": "mas:dm-cvd:DM002:publication-aftercare:reviewer-refresh:sha256-reviewer",
      "dispatch_owner": "med-autoscience",
      "profile_name": "dm-cvd",
      "source_fingerprint": "sha256-reviewer",
      "source_refs": [
        {"role": "reviewer_feedback", "ref": "studies/DM002/reviewer_feedback/latest.json"}
      ],
      "owner_route_refs": ["owner-route:mas/DM002/ai-reviewer-refresh"],
      "owner_receipt_refs": ["owner-receipt:mas/DM002/reviewer-feedback-intake"],
      "typed_blocker_refs": ["typed-blocker:mas/DM002/reviewer-refresh-required"],
      "payload": {
        "profile": "/tmp/dm-cvd.local.toml",
        "study_id": "DM002",
        "publication_aftercare_reason": "reviewer_refresh_owner_route_ref",
        "authority_boundary": "mas_owner_route_task_ref_only"
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
{
  "accepted": true,
  "surface_kind": "mas_family_domain_handler_dispatch_receipt",
  "closeout_packet": {
    "surface_kind": "stage_attempt_closeout_packet",
    "closeout_refs": ["mas-receipt:DM002/aftercare-reviewer-refresh-queued"],
    "next_owner": "med-autoscience",
    "domain_ready_verdict": "domain_gate_pending",
    "route_impact": {
      "study_id": "DM002",
      "decision": "publication_aftercare_reviewer_refresh_dispatched"
    }
  }
}
JSON
`,
    { mode: 0o755 },
  );
  try {
    const tick = runCli(['family-runtime', 'tick', '--source', 'test-hydrate', '--hydrate'], familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_EXPORT: `/bin/bash ${exportPath}`,
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH: `/bin/bash ${dispatchPath}`,
    }));
    const queue = runCli(['family-runtime', 'queue', 'list'], familyRuntimeEnv(stateRoot));
    const task = queue.family_runtime_queue.tasks[0];
    const inspected = runCli(['family-runtime', 'queue', 'inspect', task.task_id], familyRuntimeEnv(stateRoot));
    const attempt = inspected.family_runtime_task.stage_attempts[0];
    const dispatchedTask = JSON.parse(fs.readFileSync(fs.readFileSync(dispatchedTaskPath, 'utf8').trim(), 'utf8'));

    assert.equal(tick.family_runtime_tick.hydration.enqueued_count, 1);
    assert.equal(tick.family_runtime_tick.dispatches[0].status, 'succeeded');
    assert.equal(tick.family_runtime_tick.dispatches[0].stage_attempts[0].stage_id, 'publication_aftercare/reviewer-refresh');
    assert.equal(task.task_kind, 'publication_aftercare/reviewer-refresh');
    assert.equal(task.domain_route.route_ref, 'publication_aftercare/reviewer-refresh');
    assert.equal(task.domain_route.action_ref, 'ai_reviewer_recheck_execute_dispatch');
    assert.equal(task.domain_route.study_id, 'DM002');
    assert.equal(task.domain_route.publication_aftercare_reason, 'reviewer_refresh_owner_route_ref');
    assert.deepEqual(task.domain_route.owner_route_refs, ['owner-route:mas/DM002/ai-reviewer-refresh']);
    assert.deepEqual(task.domain_route.owner_receipt_refs, ['owner-receipt:mas/DM002/reviewer-feedback-intake']);
    assert.deepEqual(task.domain_route.typed_blocker_refs, ['typed-blocker:mas/DM002/reviewer-refresh-required']);
    assert.equal(task.domain_route.authority_boundary.writes_mas_truth, false);
    assert.equal(task.domain_route.authority_boundary.writes_publication_quality, false);
    assert.equal(task.domain_route.authority_boundary.queue_owns_attempts_retry_and_dead_letter, true);
    assert.equal(dispatchedTask.domain_route.route_ref, 'publication_aftercare/reviewer-refresh');
    assert.equal(dispatchedTask.domain_route.action_ref, 'ai_reviewer_recheck_execute_dispatch');
    assert.deepEqual(dispatchedTask.domain_route.owner_route_refs, ['owner-route:mas/DM002/ai-reviewer-refresh']);
    assert.equal(dispatchedTask.authority_boundary.opl, 'typed_queue_and_dispatch_only');
    assert.equal(dispatchedTask.authority_boundary.domain, 'truth_quality_artifact_gate_owner');
    assert.equal(attempt.provider_kind, 'local_sqlite');
    assert.equal(attempt.stage_id, 'publication_aftercare/reviewer-refresh');
    assert.equal(attempt.task_id, task.task_id);
    assert.equal(attempt.status, 'completed');
    assert.deepEqual(attempt.closeout_refs, ['mas-receipt:DM002/aftercare-reviewer-refresh-queued']);
    assert.equal(attempt.workspace_locator.route_ref, 'publication_aftercare/reviewer-refresh');
    assert.equal(attempt.workspace_locator.action_ref, 'ai_reviewer_recheck_execute_dispatch');
    assert.equal(attempt.workspace_locator.opl_writes_domain_truth, false);
    assert.equal(attempt.workspace_locator.opl_writes_publication_quality, false);
    assert.equal(attempt.workspace_locator.opl_writes_current_package, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime preserves MAS paper autonomy task projection through hydrate and dispatch', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-mas-paper-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-mas-paper-export-'));
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
      "domain_id": "medautoscience",
      "task_kind": "paper_autonomy/repair-recheck",
      "priority": 80,
      "source": "mas-domain-handler-export",
      "dedupe_key": "reviewer_refinement_loop:unit-1:sha256:abc",
      "dispatch_owner": "med-autoscience",
      "profile_name": "dm-cvd",
      "source_refs": ["studies/DM002/artifacts/publication_eval/latest.json"],
      "payload": {
        "profile": "/tmp/profile.toml",
        "study_id": "DM002",
        "repair_work_unit": {
          "unit_id": "unit-1",
          "work_unit_type": "text_repair",
          "owner": "quality_repair_batch",
          "callable_surface": "run_quality_repair_batch",
          "source_fingerprint": "sha256:abc",
          "source_refs": ["studies/DM002/paper/manuscript.md"]
        }
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
{"accepted":true,"surface_kind":"mas_family_domain_handler_dispatch_receipt","paper_autonomy_receipt":true}
JSON
`,
    { mode: 0o755 },
  );
  try {
    const tick = runCli(['family-runtime', 'tick', '--source', 'test-hydrate', '--hydrate'], familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_EXPORT: `/bin/bash ${exportPath}`,
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH: `/bin/bash ${dispatchPath}`,
    }));
    const queue = runCli(['family-runtime', 'queue', 'list'], familyRuntimeEnv(stateRoot));
    const task = queue.family_runtime_queue.tasks[0];
    const inspected = runCli(['family-runtime', 'queue', 'inspect', task.task_id], familyRuntimeEnv(stateRoot));
    const attempt = inspected.family_runtime_task.stage_attempts[0];
    const dispatchedTask = JSON.parse(fs.readFileSync(fs.readFileSync(dispatchedTaskPath, 'utf8').trim(), 'utf8'));

    assert.equal(tick.family_runtime_tick.hydration.enqueued_count, 1);
    assert.equal(tick.family_runtime_tick.dispatches[0].status, 'blocked');
    assert.equal(tick.family_runtime_tick.dispatches[0].reason, 'domain_handler_closeout_required');
    assert.equal(tick.family_runtime_tick.dispatches[0].stage_attempts[0].stage_id, 'paper_autonomy/repair-recheck');
    assert.equal(tick.family_runtime_tick.dispatches[0].stage_attempts[0].status, 'blocked');
    assert.equal(task.task_kind, 'paper_autonomy/repair-recheck');
    assert.equal(task.paper_autonomy.study_id, 'DM002');
    assert.equal(task.paper_autonomy.next_owner, 'quality_repair_batch');
    assert.equal(task.paper_autonomy.callable_surface, 'run_quality_repair_batch');
    assert.equal(task.paper_autonomy.repair_command, 'medautosci domain-handler dispatch --task <task.json> --format json');
    assert.equal(task.paper_autonomy.authority_boundary.writes_mas_truth, false);
    assert.deepEqual(task.payload.source_refs, ['studies/DM002/artifacts/publication_eval/latest.json']);
    assert.equal(attempt.provider_kind, 'local_sqlite');
    assert.equal(attempt.stage_id, 'paper_autonomy/repair-recheck');
    assert.equal(attempt.task_id, task.task_id);
    assert.equal(attempt.status, 'blocked');
    assert.equal(attempt.blocked_reason, 'domain_handler_closeout_required');
    assert.equal(inspected.family_runtime_task.task.status, 'blocked');
    assert.equal(inspected.family_runtime_task.task.last_error, 'domain_handler_closeout_required');
    assert.equal(inspected.family_runtime_task.task.dead_letter_reason, 'domain_handler_closeout_required');
    assert.equal(inspected.family_runtime_task.task.current_control_state.reconciliation_status, 'blocked');
    assert.equal(inspected.family_runtime_task.task.current_control_state.blocker_reason, 'domain_handler_closeout_required');
    assert.equal(dispatchedTask.paper_autonomy.next_owner, 'quality_repair_batch');
    assert.equal(dispatchedTask.paper_autonomy.idempotency_key, 'reviewer_refinement_loop:unit-1:sha256:abc');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime blocks stale MAS owner-route failures instead of retrying them', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-mas-owner-route-stale-'));
  const dispatch = createDispatchFixture(`
cat <<'JSON'
{"reason":"owner_route_stale","detail":"current owner route already moved to a newer work unit"}
JSON
exit 1
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
      'paper_autonomy/repair-recheck',
      '--payload',
      '{"profile":"/tmp/profile.toml","study_id":"DM003","repair_work_unit":{"unit_id":"unit-stale","work_unit_type":"text_repair","owner":"quality_repair_batch","callable_surface":"run_quality_repair_batch","source_fingerprint":"sha256:stale-route","source_refs":["studies/DM003/paper/manuscript.md"]}}',
      '--dedupe-key',
      'reviewer_refinement_loop:unit-stale:sha256:stale-route',
    ], env);
    const taskId = enqueue.family_runtime_enqueue.task.task_id;
    const firstTick = runCli(['family-runtime', 'tick', '--source', 'test-owner-route-stale'], env);
    const afterFirstTick = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const secondTick = runCli(['family-runtime', 'tick', '--source', 'test-owner-route-stale'], env);
    const afterSecondTick = runCli(['family-runtime', 'queue', 'inspect', taskId], env);

    assert.equal(firstTick.family_runtime_tick.selected_count, 1);
    assert.equal(firstTick.family_runtime_tick.dispatches[0].status, 'blocked');
    assert.equal(firstTick.family_runtime_tick.dispatches[0].reason, 'progress_first_owner_delta_required');
    assert.equal(firstTick.family_runtime_tick.dispatches[0].domain_handler_blocked_reason, 'owner_route_stale');
    assert.equal(afterFirstTick.family_runtime_task.task.status, 'blocked');
    assert.equal(afterFirstTick.family_runtime_task.task.last_error, 'progress_first_owner_delta_required');
    assert.equal(afterFirstTick.family_runtime_task.task.dead_letter_reason, 'progress_first_owner_delta_required');
    assert.equal(afterFirstTick.family_runtime_task.stage_attempts[0].status, 'blocked');
    assert.equal(afterFirstTick.family_runtime_task.stage_attempts[0].blocked_reason, 'progress_first_owner_delta_required');
    assert.equal(secondTick.family_runtime_tick.selected_count, 0);
    assert.equal(afterSecondTick.family_runtime_task.task.attempts, 1);
    assert.equal(afterSecondTick.family_runtime_task.task.status, 'blocked');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(dispatch.fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime repairs stale running MAS paper autonomy tasks that lack stage attempt identity', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-mas-paper-stale-running-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-mas-paper-stale-running-export-'));
  const exportPath = path.join(fixtureRoot, 'export');
  const dispatchPath = path.join(fixtureRoot, 'dispatch');
  fs.writeFileSync(
    exportPath,
    `#!/usr/bin/env bash
set -euo pipefail
cat <<'JSON'
{
  "surface_kind": "mas_family_domain_handler_export",
  "pending_family_tasks": [
    {
      "domain_id": "medautoscience",
      "task_kind": "paper_autonomy/repair-recheck",
      "priority": 80,
      "source": "mas-domain-handler-export",
      "dedupe_key": "reviewer_refinement_loop:unit-1:sha256:stale",
      "dispatch_owner": "med-autoscience",
      "profile_name": "dm-cvd",
      "source_refs": ["studies/DM002/artifacts/publication_eval/latest.json"],
      "payload": {
        "profile": "/tmp/profile.toml",
        "study_id": "DM002",
        "repair_work_unit": {
          "unit_id": "unit-1",
          "work_unit_type": "text_repair",
          "owner": "quality_repair_batch",
          "callable_surface": "run_quality_repair_batch",
          "source_fingerprint": "sha256:stale",
          "source_refs": ["studies/DM002/paper/manuscript.md"]
        }
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
cat <<'JSON'
{"accepted":true,"surface_kind":"mas_family_domain_handler_dispatch_receipt","paper_autonomy_receipt":true}
JSON
`,
    { mode: 0o755 },
  );
  try {
    const env = familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_EXPORT: `/bin/bash ${exportPath}`,
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH: `/bin/bash ${dispatchPath}`,
    });
    const enqueue = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'paper_autonomy/repair-recheck',
      '--payload',
      '{"profile":"/tmp/profile.toml","study_id":"DM002","repair_work_unit":{"unit_id":"unit-1","work_unit_type":"text_repair","owner":"quality_repair_batch","callable_surface":"run_quality_repair_batch","source_fingerprint":"sha256:stale","source_refs":["studies/DM002/paper/manuscript.md"]}}',
      '--dedupe-key',
      'reviewer_refinement_loop:unit-1:sha256:stale',
    ], env);
    const taskId = enqueue.family_runtime_enqueue.task.task_id;
    const queueDb = path.join(stateRoot, 'family-runtime', 'queue.sqlite');
    const db = new DatabaseSync(queueDb);
    db.prepare(`
      UPDATE tasks
      SET status = 'running',
        attempts = 1,
        lease_owner = 'stale-worker',
        lease_expires_at = '2026-05-27T00:00:00.000Z'
      WHERE task_id = ?
    `).run(taskId);
    db.close();

    const before = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const tick = runCli(['family-runtime', 'tick', '--source', 'test-repair'], env);
    const after = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const secondTick = runCli(['family-runtime', 'tick', '--source', 'test-repair'], env);
    const finalTask = runCli(['family-runtime', 'queue', 'inspect', taskId], env);

    assert.equal(before.family_runtime_task.task.current_control_state.reconciliation_status, 'blocked_missing_identity');
    assert.equal(tick.family_runtime_tick.repaired_missing_identity_running_count, 1);
    assert.equal(tick.family_runtime_tick.selected_count, 0);
    assert.equal(after.family_runtime_task.task.status, 'retry_waiting');
    assert.equal(after.family_runtime_task.task.lease, null);
    assert.equal(after.family_runtime_task.task.last_error, 'missing_stage_attempt_identity');
    assert.equal(after.family_runtime_task.task.dead_letter_reason, null);
    assert.equal(after.family_runtime_task.stage_attempts[0].stage_id, 'paper_autonomy/repair-recheck');
    assert.equal(after.family_runtime_task.stage_attempts[0].status, 'queued');
    assert.equal(after.family_runtime_task.task.current_control_state.reconciliation_status, 'queued');
    assert.equal(secondTick.family_runtime_tick.repaired_missing_identity_running_count, 0);
    assert.equal(secondTick.family_runtime_tick.selected_count, 1);
    assert.equal(secondTick.family_runtime_tick.dispatches[0].status, 'blocked');
    assert.equal(secondTick.family_runtime_tick.dispatches[0].reason, 'domain_handler_closeout_required');
    assert.equal(finalTask.family_runtime_task.task.status, 'blocked');
    assert.equal(finalTask.family_runtime_task.task.last_error, 'domain_handler_closeout_required');
    assert.equal(finalTask.family_runtime_task.stage_attempts[0].status, 'blocked');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime missing identity repair ignores non-provider-hosted running domain handler tasks', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-non-provider-running-'));
  const dispatch = createDispatchFixture(`
cat <<'JSON'
{"accepted":true,"surface_kind":"mas_family_domain_handler_dispatch_receipt"}
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
      'custom/non-provider-task',
      '--payload',
      '{"study_id":"DM002"}',
    ], env);
    const taskId = enqueue.family_runtime_enqueue.task.task_id;
    const queueDb = path.join(stateRoot, 'family-runtime', 'queue.sqlite');
    const db = new DatabaseSync(queueDb);
    db.prepare(`
      UPDATE tasks
      SET status = 'running',
        attempts = 1,
        lease_owner = 'stale-worker',
        lease_expires_at = '2026-05-27T00:00:00.000Z'
      WHERE task_id = ?
    `).run(taskId);
    db.close();

    const before = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const tick = runCli(['family-runtime', 'tick', '--source', 'test-repair-scope'], env);
    const after = runCli(['family-runtime', 'queue', 'inspect', taskId], env);

    assert.equal(before.family_runtime_task.task.current_control_state.reconciliation_status, 'blocked_missing_identity');
    assert.equal(tick.family_runtime_tick.repaired_missing_identity_running_count, 0);
    assert.equal(tick.family_runtime_tick.selected_count, 0);
    assert.equal(after.family_runtime_task.task.status, 'running');
    assert.equal(after.family_runtime_task.stage_attempts.length, 0);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(dispatch.fixtureRoot, { recursive: true, force: true });
  }
});
