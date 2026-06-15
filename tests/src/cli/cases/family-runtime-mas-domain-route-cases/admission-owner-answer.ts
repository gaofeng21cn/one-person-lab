import { assert, fs, os, path, runCli, shellSingleQuote, test } from '../../helpers.ts';
import { createDispatchFixture, familyRuntimeEnv } from '../family-runtime-mas-domain-route-helpers.ts';

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

test('family-runtime does not reopen MAS domain route typed blockers as provider admission', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-mas-domain-route-typed-blocker-'));
  const typedBlockerRef = 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_execution/sat_67e10efde628859185249aa0.closeout.json#typed_blocker';
  const dispatch = createDispatchFixture(`
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
        required_output_contract: {
          typed_blocker_ref: typedBlockerRef,
        },
        state: {
          owner_answer_binding: {
            answer_kind: 'typed_blocker_ref',
            typed_blocker_ref: typedBlockerRef,
          },
        },
      }),
      '--dedupe-key',
      'mas:test:DM002:domain-route:typed-blocker-not-admission',
    ], env);
    const taskId = enqueue.family_runtime_enqueue.task.task_id;
    const tick = runCli(['family-runtime', 'tick', '--source', 'test-domain-route-typed-blocker'], env);
    const task = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const queue = runCli(['family-runtime', 'queue', 'list', '--status', 'running'], env);
    const inspectedTask = task.family_runtime_task.task;
    const control = inspectedTask.current_control_state;
    const attempt = task.family_runtime_task.stage_attempts[0];

    assert.equal(tick.family_runtime_tick.dispatches[0].status, 'blocked');
    assert.equal(tick.family_runtime_tick.dispatches[0].reason, 'mas_owner_answer_typed_blocker_observed');
    assert.equal(inspectedTask.status, 'blocked');
    assert.equal(inspectedTask.dead_letter_reason, 'mas_owner_answer_typed_blocker_observed');
    assert.equal(queue.family_runtime_queue.queue.by_status.running ?? 0, 0);
    assert.equal(attempt.status, 'blocked');
    assert.equal(attempt.blocked_reason, 'mas_owner_answer_typed_blocker_observed');
    assert.equal(control.running_provider_attempt, false);
    assert.equal(control.reconciliation_status, 'domain_owner_answer_observed');
    assert.equal(control.current_attempt_state, 'blocked');
    assert.equal(control.blocker_reason, 'mas_owner_answer_typed_blocker_observed');
    assert.deepEqual(control.typed_blocker_refs, [typedBlockerRef]);
    assert.equal(control.domain_owner_answer_observation.answer_kind, 'typed_blocker_ref');
    assert.deepEqual(control.domain_owner_answer_observation.refs, [typedBlockerRef]);
    assert.equal(control.authority_boundary.refs_only_checkpoint_is_running_proof, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(dispatch.fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime requires MAS owner-answer refs before blocking domain route admission', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-mas-domain-route-ref-required-'));
  const dispatch = createDispatchFixture(`
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
        },
        state: {
          owner_answer_binding: {
            answer_kind: 'typed_blocker_ref',
          },
        },
      }),
      '--dedupe-key',
      'mas:test:DM002:domain-route:typed-blocker-ref-required',
    ], env);
    const taskId = enqueue.family_runtime_enqueue.task.task_id;
    const tick = runCli(['family-runtime', 'tick', '--source', 'test-domain-route-ref-required'], env);
    const task = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const inspectedTask = task.family_runtime_task.task;
    const control = inspectedTask.current_control_state;
    const attempt = task.family_runtime_task.stage_attempts[0];

    assert.equal(tick.family_runtime_tick.dispatches[0].status, 'running');
    assert.equal(inspectedTask.status, 'running');
    assert.equal(inspectedTask.last_error, 'opl_attempt_admission_requested');
    assert.equal(inspectedTask.dead_letter_reason, null);
    assert.equal(attempt.status, 'queued');
    assert.equal(control.reconciliation_status, 'provider_admission_requested');
    assert.equal(control.current_attempt_state, 'queued');
    assert.equal(control.blocker_reason, 'provider_attempt_start_pending');
    assert.deepEqual(control.typed_blocker_refs, []);
    assert.equal(control.domain_owner_answer_observation, undefined);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(dispatch.fixtureRoot, { recursive: true, force: true });
  }
});
