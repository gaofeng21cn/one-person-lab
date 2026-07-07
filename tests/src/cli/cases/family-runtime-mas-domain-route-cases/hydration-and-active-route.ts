import { assert, fs, os, parseJsonText, path, runCli, shellSingleQuote, test } from '../../helpers.ts';
import { createDispatchFixture, familyRuntimeEnv } from '../family-runtime-mas-domain-route-helpers.ts';

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
    const dispatchedTask = parseJsonText(fs.readFileSync(fs.readFileSync(dispatchedTaskPath, 'utf8').trim(), 'utf8')) as any;

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
    const dispatchedTask = parseJsonText(fs.readFileSync(dispatchedTaskPath, 'utf8')) as any;
    const attempt = task.family_runtime_task.stage_attempts[0];

    assert.equal(enqueue.family_runtime_enqueue.task.task_kind, 'domain_route/reconcile-apply');
    assert.equal(enqueue.family_runtime_enqueue.task.domain_route.route_ref, 'domain_route/reconcile-apply');
    assert.equal(enqueue.family_runtime_enqueue.task.domain_route.action_ref, 'domain_route_reconcile_apply');
    assert.equal(tick.family_runtime_tick.dispatches[0].status, 'succeeded');
    assert.equal(task.family_runtime_task.task.task_kind, 'domain_route/reconcile-apply');
    assert.equal(task.family_runtime_task.task.domain_route.canonical_surface_kind, 'opl_domain_route_task_projection');
    assert.equal(task.family_runtime_task.task.domain_route.projection_kind, 'domain_route');
    assert.equal(
      task.family_runtime_task.task.domain_route.compatibility_profile.surface_kind,
      'opl_domain_route_profile_compatibility',
    );
    assert.equal(task.family_runtime_task.task.domain_route.compatibility_profile.compatibility_only, true);
    assert.equal(task.family_runtime_task.task.domain_route.compatibility_profile.canonical_route_surface, 'domain_route');
    assert.equal(task.family_runtime_task.task.domain_route.compatibility_profile.canonical_progress_surface, 'domain_progress');
    assert.equal(task.family_runtime_task.task.domain_route.domain_route_readback.surface_kind, 'opl_domain_route_readback');
    assert.equal(task.family_runtime_task.task.domain_route.domain_route_readback.profile_compatibility.compatibility_only, true);
    assert.equal(task.family_runtime_task.task.domain_route.domain_route_readback.provider_completion_is_domain_progress, false);
    assert.equal(task.family_runtime_task.task.domain_route.domain_route_readback.provider_completion_is_domain_ready, false);
    assert.equal(task.family_runtime_task.task.domain_route.domain_truth_owner, 'med-autoscience');
    assert.equal(task.family_runtime_task.task.domain_route.authority_boundary.writes_mas_truth, false);
    assert.equal(task.family_runtime_task.task.domain_route.authority_boundary.writes_domain_truth, false);
    assert.equal(
      task.family_runtime_task.task.domain_route.authority_boundary.opl_owns_generic_runtime_queue_attempt_liveness_redrive,
      true,
    );
    assert.equal(task.family_runtime_task.task.domain_route.owner_route_handoff.handoff_ref, 'mas_runtime_owner_route_handoff');
    assert.equal(task.family_runtime_task.task.domain_route.owner_route_handoff.canonical_handoff_ref, 'domain_runtime_owner_route_handoff');
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
