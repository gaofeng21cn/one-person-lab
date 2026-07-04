import { assert, fs, os, parseJsonText, path, runCli, shellSingleQuote, test } from '../../helpers.ts';
import { familyRuntimeEnv } from '../family-runtime-mas-domain-route-helpers.ts';

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
    "surface_kind": "domain_stage_closeout_packet",
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
    const dispatchedTask = parseJsonText(fs.readFileSync(fs.readFileSync(dispatchedTaskPath, 'utf8').trim(), 'utf8')) as any;

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
    "surface_kind": "domain_stage_closeout_packet",
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
    const dispatchedTask = parseJsonText(fs.readFileSync(fs.readFileSync(dispatchedTaskPath, 'utf8').trim(), 'utf8')) as any;

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
    const dispatchedTask = parseJsonText(fs.readFileSync(fs.readFileSync(dispatchedTaskPath, 'utf8').trim(), 'utf8')) as any;

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
