import { DatabaseSync } from 'node:sqlite';

import { assert, fs, os, path, runCli, runCliFailure, shellSingleQuote, test } from '../helpers.ts';

function createDispatchFixture(body: string) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-dispatch-'));
  const dispatchPath = path.join(fixtureRoot, 'dispatch');
  fs.writeFileSync(
    dispatchPath,
    `#!/usr/bin/env bash
set -euo pipefail
TASK_PATH="$1"
${body}
`,
    { mode: 0o755 },
  );
  return { fixtureRoot, dispatchPath };
}

function familyRuntimeEnv(stateRoot: string, extra: Record<string, string> = {}) {
  return {
    OPL_STATE_DIR: stateRoot,
    ...extra,
  };
}

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
    assert.equal(dispatchedTask.task_kind, 'domain_route/reconcile-apply');
    assert.equal(dispatchedTask.domain_route.route_ref, 'domain_route/reconcile-apply');
    assert.equal(dispatchedTask.domain_route.action_ref, 'domain_route_reconcile_apply');
    assert.equal(dispatchedTask.paper_autonomy, null);
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
      OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
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
    assert.equal(attempt.provider_kind, 'temporal');
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
      OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
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
    assert.equal(attempt.provider_kind, 'temporal');
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
    assert.equal(tick.family_runtime_tick.dispatches[0].status, 'succeeded');
    assert.equal(tick.family_runtime_tick.dispatches[0].stage_attempts[0].stage_id, 'paper_autonomy/repair-recheck');
    assert.equal(task.task_kind, 'paper_autonomy/repair-recheck');
    assert.equal(task.paper_autonomy.study_id, 'DM002');
    assert.equal(task.paper_autonomy.next_owner, 'quality_repair_batch');
    assert.equal(task.paper_autonomy.callable_surface, 'run_quality_repair_batch');
    assert.equal(task.paper_autonomy.repair_command, 'medautosci domain-handler dispatch --task <task.json> --format json');
    assert.equal(task.paper_autonomy.authority_boundary.writes_mas_truth, false);
    assert.deepEqual(task.payload.source_refs, ['studies/DM002/artifacts/publication_eval/latest.json']);
    assert.equal(attempt.provider_kind, 'temporal');
    assert.equal(attempt.stage_id, 'paper_autonomy/repair-recheck');
    assert.equal(attempt.task_id, task.task_id);
    assert.equal(attempt.status, 'checkpointed');
    assert.equal(dispatchedTask.paper_autonomy.next_owner, 'quality_repair_batch');
    assert.equal(dispatchedTask.paper_autonomy.idempotency_key, 'reviewer_refinement_loop:unit-1:sha256:abc');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
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
    assert.equal(secondTick.family_runtime_tick.dispatches[0].status, 'succeeded');
    assert.equal(finalTask.family_runtime_task.task.status, 'succeeded');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
