import { DatabaseSync } from 'node:sqlite';
import { assert, fs, os, path, runCli, test } from '../../helpers.ts';
import { familyRuntimeEnv } from '../family-runtime-mas-domain-route-helpers.ts';

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

test('family-runtime maintenance blocks running MAS domain route admission residue with typed blocker owner answer', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-mas-domain-route-running-residue-'));
  const typedBlockerRef = 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_execution/sat_67e10efde628859185249aa0.closeout.json#typed_blocker';
  try {
    const env = familyRuntimeEnv(stateRoot);
    const enqueue = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'domain_route/reconcile-apply',
      '--payload',
      JSON.stringify({
        profile: '/tmp/profile.toml',
        study_id: '002-dm-china-us-mortality-attribution',
        reason: 'current_work_unit_typed_blocker_owner_resolution',
        source_fingerprint: '4ed3699bda5e3842',
        queue_owner: 'one-person-lab',
        domain_truth_owner: 'med-autoscience',
        current_work_unit: {
          status: 'typed_blocker',
          owner: 'one-person-lab',
          blocker_type: 'anti_loop_budget_exhausted',
          typed_blocker_ref: typedBlockerRef,
        },
      }),
      '--dedupe-key',
      'mas:test:DM002:domain-route:running-typed-blocker-residue',
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
        SET status = 'running', attempts = 1, last_error = 'opl_attempt_admission_requested',
          dead_letter_reason = NULL, lease_owner = NULL, lease_expires_at = NULL
        WHERE task_id = ?
      `).run(routeTaskId);
      queueDb.prepare(`
        UPDATE stage_attempts
        SET status = 'queued',
          closeout_refs_json = '["runtime/artifacts/opl_family_domain_handler/dispatch_receipts/unit.json"]',
          closeout_receipt_status = 'domain_handler_receipt_ref_only',
          provider_run_json = json_set(provider_run_json, '$.provider_status', 'queued')
        WHERE stage_attempt_id = ?
      `).run(oldAttempt.stage_attempt_id);
    } finally {
      queueDb.close();
    }

    const before = runCli(['family-runtime', 'queue', 'inspect', routeTaskId], env);
    const repairTick = runCli(['family-runtime', 'tick', '--source', 'test-domain-route-running-residue'], env);
    const repaired = runCli(['family-runtime', 'queue', 'inspect', routeTaskId], env);
    const running = runCli(['family-runtime', 'queue', 'list', '--status', 'running'], env);

    assert.equal(before.family_runtime_task.task.status, 'running');
    assert.equal(before.family_runtime_task.task.current_control_state.reconciliation_status, 'domain_owner_answer_observed');
    assert.equal(repairTick.family_runtime_tick.selected_count, 0);
    assert.equal(repairTick.family_runtime_tick.blocked_mas_domain_route_owner_answer_observed_count, 1);
    assert.equal(repairTick.family_runtime_tick.repaired_mas_domain_route_admission_requested_count, 0);
    assert.equal(repaired.family_runtime_task.task.status, 'blocked');
    assert.equal(repaired.family_runtime_task.task.dead_letter_reason, 'mas_owner_answer_typed_blocker_observed');
    assert.equal(repaired.family_runtime_task.stage_attempts[0].status, 'blocked');
    assert.equal(repaired.family_runtime_task.task.current_control_state.reconciliation_status, 'domain_owner_answer_observed');
    assert.equal(repaired.family_runtime_task.task.current_control_state.blocker_reason, 'mas_owner_answer_typed_blocker_observed');
    assert.deepEqual(repaired.family_runtime_task.task.current_control_state.typed_blocker_refs, [typedBlockerRef]);
    assert.equal(running.family_runtime_queue.queue.by_status.running ?? 0, 0);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime maintenance blocks running MAS domain dispatch evidence typed-blocker payload residue', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-mas-domain-route-evidence-residue-'));
  const typedBlockerRef = 'mas-domain-dispatch-typed-blocker:medautoscience:domain_route-reconcile-apply:002-dm-china-us-mortality-attribution:controller_decision_route_back:c5af69c6044801af:owner-receipt-or-live-paper-line-closeout-pending';
  try {
    const env = familyRuntimeEnv(stateRoot);
    const enqueue = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'domain_route/reconcile-apply',
      '--payload',
      JSON.stringify({
        profile: '/tmp/profile.toml',
        study_id: '002-dm-china-us-mortality-attribution',
        reason: 'controller_decision_route_back',
        source_fingerprint: 'c5af69c6044801af',
        queue_owner: 'one-person-lab',
        domain_truth_owner: 'med-autoscience',
        domain_dispatch_evidence_record_payload: {
          surface_kind: 'mas_domain_dispatch_evidence_record_payload',
          mode: 'refs_only_domain_owned_typed_blocker_payload',
          closeout_semantics: 'typed_blocker_until_real_owner_receipt_or_live_paper_line_closeout',
          record_payload: {
            domain_owner_receipt_refs: [],
            typed_blocker_refs: [typedBlockerRef],
            no_regression_refs: [
              'mas-no-forbidden-write-proof:medautoscience:domain_route-reconcile-apply:002:refs-only-dispatch-payload',
            ],
          },
          typed_blocker_refs: [typedBlockerRef],
          domain_ready_claimed: false,
          publication_ready_claimed: false,
        },
      }),
      '--dedupe-key',
      'mas:test:DM002:domain-route:evidence-typed-blocker-residue',
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
      'c5af69c6044801af',
      '--executor-kind',
      'domain_handler',
      '--task',
      routeTaskId,
    ], env).family_runtime_stage_attempt.attempt;
    const queueDb = new DatabaseSync(path.join(stateRoot, 'family-runtime', 'queue.sqlite'));
    try {
      queueDb.prepare(`
        UPDATE tasks
        SET status = 'running', attempts = 1, last_error = 'opl_attempt_admission_requested',
          dead_letter_reason = NULL, lease_owner = NULL, lease_expires_at = NULL
        WHERE task_id = ?
      `).run(routeTaskId);
      queueDb.prepare(`
        UPDATE stage_attempts
        SET status = 'queued',
          closeout_refs_json = '["runtime/artifacts/opl_family_domain_handler/dispatch_receipts/unit.json"]',
          closeout_receipt_status = 'domain_handler_receipt_ref_only',
          provider_run_json = json_set(provider_run_json, '$.provider_status', 'queued')
        WHERE stage_attempt_id = ?
      `).run(oldAttempt.stage_attempt_id);
    } finally {
      queueDb.close();
    }

    const repairTick = runCli(['family-runtime', 'tick', '--source', 'test-domain-route-evidence-residue'], env);
    const repaired = runCli(['family-runtime', 'queue', 'inspect', routeTaskId], env);

    assert.equal(repairTick.family_runtime_tick.blocked_mas_domain_route_owner_answer_observed_count, 1);
    assert.equal(repaired.family_runtime_task.task.status, 'blocked');
    assert.equal(repaired.family_runtime_task.task.current_control_state.reconciliation_status, 'domain_owner_answer_observed');
    assert.equal(repaired.family_runtime_task.task.current_control_state.blocker_reason, 'mas_owner_answer_typed_blocker_observed');
    assert.deepEqual(repaired.family_runtime_task.task.current_control_state.typed_blocker_refs, [typedBlockerRef]);
    assert.deepEqual(repaired.family_runtime_task.task.current_control_state.domain_owner_answer_observation.refs, [typedBlockerRef]);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
