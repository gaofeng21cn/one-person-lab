import { spawnSync } from 'node:child_process';

import { assert, fs, os, path, repoRoot, runCli, shellSingleQuote, test } from '../helpers.ts';

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

function createExportFixture(body: string) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-export-'));
  const exportPath = path.join(fixtureRoot, 'export');
  fs.writeFileSync(
    exportPath,
    `#!/usr/bin/env bash
set -euo pipefail
${body}
`,
    { mode: 0o755 },
  );
  return { fixtureRoot, exportPath };
}

function familyRuntimeEnv(stateRoot: string, extra: Record<string, string> = {}) {
  return {
    OPL_STATE_DIR: stateRoot,
    ...extra,
  };
}

test('family-runtime status exposes provider-backed stage attempt runtime and SQLite queue path', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-state-'));
  try {
    const output = runCli(['family-runtime', 'status'], familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_PROVIDER: '',
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
    }));
    assert.equal(output.family_runtime.provider_model, 'provider_backed_stage_attempt_runtime');
    assert.equal(output.family_runtime.configured_provider, 'temporal');
    assert.deepEqual(output.family_runtime.provider_runtime.allowed_providers, [
      'local_sqlite',
      'temporal',
    ]);
    assert.equal(output.family_runtime.readiness.provider_ready, false);
    assert.equal(output.family_runtime.readiness.full_online_ready, false);
    assert.equal(output.family_runtime.readiness.degraded, true);
    assert.equal(output.family_runtime.readiness.degraded_reason, 'temporal_runtime_not_configured');
    assert.equal(output.family_runtime.provider_runtime.default_resolution.fallback, 'temporal');
    assert.equal(output.family_runtime.provider_runtime.default_resolution.fail_closed_when_temporal_not_ready, true);
    assert.equal(output.family_runtime.periodic_execution.surface_kind, 'opl_family_runtime_periodic_execution_summary');
    assert.equal(output.family_runtime.periodic_execution.status, 'blocked_provider_not_ready');
    assert.equal(output.family_runtime.periodic_execution.scheduler_owner, 'opl_provider_runtime_manager');
    assert.equal(output.family_runtime.periodic_execution.cadence_owner, 'provider_backed_family_runtime');
    assert.equal(output.family_runtime.periodic_execution.selected_provider_can_replace_domain_daemons, false);
    assert.equal(output.family_runtime.periodic_execution.status_command, 'opl family-runtime scheduler status --provider temporal');
    assert.equal(output.family_runtime.periodic_execution.authority_boundary.can_install_domain_daemon, false);
    assert.equal(output.family_runtime.state.queue_db, path.join(stateRoot, 'family-runtime', 'queue.sqlite'));
    assert.equal(output.family_runtime.state.queue_schema_version, 2);
    assert.equal(fs.existsSync(output.family_runtime.state.queue_db), true);
    assert.equal(output.family_runtime.domain_adapters.medautogrant.truth_owner, 'med-autogrant');
    assert.equal(output.family_runtime.stage_attempts.total, 0);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime lifecycle apply exposes dry-run apply and verify modes', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-lifecycle-apply-'));
  try {
    const dryRun = runCli([
      'family-runtime',
      'lifecycle',
      'apply',
      '--mode',
      'dry-run',
      '--domain',
      'medautogrant',
      '--source-ref',
      'mag://legacy-cleanup/plan-1',
      '--action',
      JSON.stringify({
        action_id: 'mark-opl-tombstone',
        action_kind: 'cleanup',
        owner_scope: 'opl_owned_tombstone_ref',
        target_ref: 'opl://history/mag/gateway-tombstone',
        restore_proof_refs: ['restore-proof:mag:gateway-tombstone'],
      }),
    ], familyRuntimeEnv(stateRoot));

    assert.equal(dryRun.family_runtime_lifecycle_apply.mode, 'dry-run');
    assert.equal(dryRun.family_runtime_lifecycle_apply.status, 'dry_run_ready');
    assert.equal(dryRun.family_runtime_lifecycle_apply.summary.writes_performed, false);

    const applied = runCli([
      'family-runtime',
      'lifecycle',
      'apply',
      '--mode',
      'apply',
      '--domain',
      'medautogrant',
      '--source-ref',
      'mag://legacy-cleanup/plan-1',
      '--manifest-ref',
      'manifest:mag:lifecycle',
      '--action',
      JSON.stringify({
        action_id: 'mark-opl-tombstone',
        action_kind: 'cleanup',
        owner_scope: 'opl_owned_tombstone_ref',
        target_ref: 'opl://history/mag/gateway-tombstone',
        restore_proof_refs: ['restore-proof:mag:gateway-tombstone'],
      }),
    ], familyRuntimeEnv(stateRoot));

    assert.equal(applied.family_runtime_lifecycle_apply.status, 'applied');
    assert.equal(applied.family_runtime_lifecycle_apply.cleanup_receipts.length, 1);

    const verified = runCli([
      'family-runtime',
      'lifecycle',
      'apply',
      '--mode',
      'verify',
      '--domain',
      'medautogrant',
      '--receipt-ref',
      applied.family_runtime_lifecycle_apply.receipt_ref,
    ], familyRuntimeEnv(stateRoot));

    assert.equal(verified.family_runtime_lifecycle_apply.status, 'verified');
    assert.equal(verified.family_runtime_lifecycle_apply.summary.verified_receipt_count, 1);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime lifecycle reconcile exposes refs-only drift and delete-ready proof', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-lifecycle-reconcile-'));
  try {
    runCli([
      'family-runtime',
      'lifecycle',
      'apply',
      '--mode',
      'apply',
      '--domain',
      'medautogrant',
      '--source-ref',
      'mag://package/run-1',
      '--action',
      JSON.stringify({
        action_id: 'record-domain-package-receipt',
        action_kind: 'artifact_receipt_index',
        owner_scope: 'domain_artifact_mutation_receipt_ref',
        target_ref: 'mag://package/submission.zip',
        restore_proof_refs: ['restore-proof:mag-package'],
        domain_artifact_mutation_receipt_refs: ['mag://receipt/package-cleanup'],
      }),
    ], familyRuntimeEnv(stateRoot));

    const reconciled = runCli([
      'family-runtime',
      'lifecycle',
      'reconcile',
      '--domain',
      'medautogrant',
      '--expected-source-ref',
      'mag://package/run-1',
      '--expected-domain-artifact-mutation-receipt-ref',
      'mag://receipt/package-cleanup',
      '--expected-restore-proof-ref',
      'restore-proof:mag-package',
    ], familyRuntimeEnv(stateRoot));

    assert.equal(reconciled.family_runtime_lifecycle_reconcile.status, 'reconciled');
    assert.equal(reconciled.family_runtime_lifecycle_reconcile.summary.drift_detected, false);
    assert.equal(reconciled.family_runtime_lifecycle_reconcile.summary.can_execute_delete, false);
    assert.equal(
      reconciled.family_runtime_lifecycle_reconcile.summary.can_execute_domain_physical_delete,
      false,
    );
    assert.equal(reconciled.family_runtime_lifecycle_reconcile.summary.opl_cleanup_apply_can_execute, true);
    assert.equal(
      reconciled.family_runtime_lifecycle_reconcile.delete_ready_proof.proof_status,
      'domain_owner_receipt_refs_observed',
    );
    assert.equal(
      reconciled.family_runtime_lifecycle_reconcile.delete_ready_proof.opl_cleanup_apply_ready,
      true,
    );
    assert.equal(
      reconciled.family_runtime_lifecycle_reconcile.authority_boundary.opl_can_delete_domain_repo_files,
      false,
    );

    const drift = runCli([
      'family-runtime',
      'lifecycle',
      'reconcile',
      '--domain',
      'medautogrant',
      '--expected-source-ref',
      'mag://package/missing',
    ], familyRuntimeEnv(stateRoot));

    assert.equal(drift.family_runtime_lifecycle_reconcile.status, 'drift_detected');
    assert.deepEqual(
      drift.family_runtime_lifecycle_reconcile.missing_refs.source_refs,
      ['mag://package/missing'],
    );
    assert.equal(
      drift.family_runtime_lifecycle_reconcile.delete_ready_proof.proof_status,
      'blocked_lifecycle_drift_detected',
    );
    assert.equal(drift.family_runtime_lifecycle_reconcile.summary.opl_cleanup_apply_can_execute, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime local provider status does not inspect a bad Hermes binary path', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-local-provider-'));
  try {
    const output = runCli(
      ['family-runtime', 'status', '--provider', 'local_sqlite'],
      familyRuntimeEnv(stateRoot, {
        OPL_HERMES_BIN: path.join(stateRoot, 'missing-hermes'),
      }),
    );

    assert.equal(output.family_runtime.configured_provider, 'local_sqlite');
    assert.equal(output.family_runtime.readiness.provider_ready, true);
    assert.equal(output.family_runtime.readiness.full_online_ready, false);
    assert.equal(output.family_runtime.readiness.durable_online_ready, false);
    assert.equal(output.family_runtime.readiness.local_sqlite_is_dev_ci_offline_only, true);
    assert.equal(output.family_runtime.readiness.selected_provider_can_replace_domain_daemons, false);
    assert.equal(output.family_runtime.periodic_execution.status, 'dev_offline_provider_cannot_replace_domain_daemons');
    assert.equal(output.family_runtime.periodic_execution.local_sqlite_role, 'dev_ci_offline_diagnostic_baseline_only');
    assert.equal(output.family_runtime.periodic_execution.blocker.blocker_id, 'local_sqlite_is_dev_ci_offline_only');
    assert.equal(output.family_runtime.provider_runtime.providers.local_sqlite.ready, true);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime doctor degrades explicit local sqlite because it cannot replace domain daemons', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-local-doctor-'));
  try {
    const output = runCli(
      ['family-runtime', 'doctor', '--provider', 'local_sqlite'],
      familyRuntimeEnv(stateRoot),
    );

    assert.equal(output.family_runtime_doctor.doctor_status, 'degraded');
    assert.deepEqual(output.family_runtime_doctor.blockers, ['local_sqlite_is_dev_ci_offline_only']);
    assert.equal(output.family_runtime_doctor.status.readiness.provider_ready, true);
    assert.equal(output.family_runtime_doctor.status.readiness.full_online_ready, false);
    assert.equal(
      output.family_runtime_doctor.status.readiness.selected_provider_can_replace_domain_daemons,
      false,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime temporal provider reports landed code separately from live runtime readiness', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-temporal-provider-'));
  try {
    const output = runCli(
      ['family-runtime', 'status', '--provider', 'temporal'],
      familyRuntimeEnv(stateRoot, {
        OPL_TEMPORAL_ADDRESS: '',
        TEMPORAL_ADDRESS: '',
      }),
    );
    const provider = output.family_runtime.provider_runtime.providers.temporal;

    assert.equal(output.family_runtime.configured_provider, 'temporal');
    assert.equal(output.family_runtime.readiness.provider_ready, false);
    assert.equal(provider.status, 'provider_code_landed_unconfigured');
    assert.equal(provider.ready, false);
    assert.equal(provider.degraded_reason, 'temporal_runtime_not_configured');
    assert.equal(provider.details.adapter_mode, 'provider_code_landed_unconfigured');
    assert.equal(provider.capabilities.includes('stage_attempt_workflow_provider_code'), true);
    assert.equal(provider.details.worker_readiness.surface_kind, 'temporal_worker_lifecycle_status');
    assert.equal(provider.details.worker_readiness.readiness_status, 'not_configured');
    assert.deepEqual(provider.details.worker_readiness.blockers, ['temporal_runtime_not_configured']);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('bin/opl routes family-runtime commands into the OPL CLI instead of Codex passthrough', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-entry-'));
  try {
    const result = spawnSync(
      path.join(repoRoot, 'bin', 'opl'),
      ['family-runtime', 'status'],
      {
        cwd: repoRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          NODE_NO_WARNINGS: '1',
          OPL_SKIP_SKILL_SYNC: '1',
          ...familyRuntimeEnv(stateRoot, {
            OPL_FAMILY_RUNTIME_PROVIDER: '',
            OPL_TEMPORAL_ADDRESS: '',
            TEMPORAL_ADDRESS: '',
          }),
        },
      },
    );

    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.family_runtime.surface_id, 'opl_family_runtime');
    assert.equal(output.family_runtime.provider_model, 'provider_backed_stage_attempt_runtime');
    assert.equal(output.family_runtime.configured_provider, 'temporal');
    assert.equal(output.family_runtime.readiness.provider_ready, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime dispatch override can place the task path in a domain CLI option', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-dispatch-placeholder-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-dispatch-option-'));
  const dispatchPath = path.join(fixtureRoot, 'dispatch');
  fs.writeFileSync(
    dispatchPath,
    `#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" != "--task" || ! -f "$2" || "$3" != "--format" || "$4" != "json" || "$#" -ne 4 ]]; then
  printf '{"ok":false,"error":"bad argv","argv":%s}\\n' "$(python3 -c 'import json,sys; print(json.dumps(sys.argv[1:]))' "$@")"
  exit 2
fi
python3 - "$2" <<'PY'
import json
import sys
from pathlib import Path

task = json.loads(Path(sys.argv[1]).read_text())
print(json.dumps({
    "ok": True,
    "closeout_packet": {
        "surface_kind": "stage_attempt_closeout_packet",
        "closeout_refs": ["mag-dispatch:task-option"],
        "next_owner": "med-autogrant",
        "domain_ready_verdict": "domain_gate_pending",
        "route_impact": {"decision": "task_option_override"}
    },
    "task_id": task["task_id"]
}))
PY
`,
    { mode: 0o755 },
  );

  try {
    const env = familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOGRANT_DISPATCH: `${dispatchPath} --task {task} --format json`,
    });
    const enqueue = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautogrant',
      '--task-kind',
      'stage-attempt/closeout',
      '--payload',
      '{"action":"stage-attempt/closeout","input_path":"/tmp/mag/input.json","stage_id":"review_and_rebuttal","provider_hosted_stage_attempt":true}',
      '--dedupe-key',
      'mag:test:dispatch-placeholder',
    ], env);
    const taskId = enqueue.family_runtime_enqueue.task.task_id;
    const tick = runCli(['family-runtime', 'tick', '--source', 'test'], env);
    const task = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const attempt = task.family_runtime_task.stage_attempts[0];

    assert.equal(tick.family_runtime_tick.dispatches[0].status, 'succeeded');
    assert.equal(attempt.status, 'completed');
    assert.equal(attempt.closeout_refs.includes('mag-dispatch:task-option'), true);
    assert.equal(attempt.route_impact.decision, 'task_option_override');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime enqueue is idempotent by dedupe key and writes local inbox notification', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-dedupe-'));
  try {
    const first = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautogrant',
      '--task-kind',
      'user-loop/wakeup',
      '--payload',
      '{"workspace":"/tmp/mag"}',
      '--dedupe-key',
      'mag:wakeup:1',
    ], familyRuntimeEnv(stateRoot));
    const second = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautogrant',
      '--task-kind',
      'user-loop/wakeup',
      '--payload',
      '{"workspace":"/tmp/mag"}',
      '--dedupe-key',
      'mag:wakeup:1',
    ], familyRuntimeEnv(stateRoot));
    const queue = runCli(['family-runtime', 'queue', 'list'], familyRuntimeEnv(stateRoot));
    const notifications = runCli(['family-runtime', 'notify', 'list'], familyRuntimeEnv(stateRoot));

    assert.equal(first.family_runtime_enqueue.accepted, true);
    assert.equal(second.family_runtime_enqueue.accepted, false);
    assert.equal(second.family_runtime_enqueue.idempotent_noop, true);
    assert.equal(second.family_runtime_enqueue.task.task_id, first.family_runtime_enqueue.task.task_id);
    assert.equal(queue.family_runtime_queue.queue.total, 1);
    assert.equal(notifications.family_runtime_notifications.notifications.length, 1);
    assert.equal(notifications.family_runtime_notifications.notifications[0].channel, 'local_inbox');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime approval pauses dispatch until approved', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-approval-'));
  const dispatch = createDispatchFixture(`
cat <<'JSON'
{"accepted":true,"surface_kind":"test_dispatch"}
JSON
`);
  try {
    const enqueue = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'redcube',
      '--task-kind',
      'runtime_watch',
      '--payload',
      '{"workspace_root":"/tmp/rca"}',
      '--requires-approval',
    ], familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_REDCUBE_DISPATCH: dispatch.dispatchPath,
    }));
    const taskId = enqueue.family_runtime_enqueue.task.task_id;
    const firstTick = runCli(['family-runtime', 'tick', '--source', 'test'], familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_REDCUBE_DISPATCH: dispatch.dispatchPath,
    }));
    const approval = runCli([
      'family-runtime',
      'approve',
      '--task',
      taskId,
      '--decision',
      'approve',
    ], familyRuntimeEnv(stateRoot));
    const secondTick = runCli(['family-runtime', 'tick', '--source', 'test'], familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_REDCUBE_DISPATCH: dispatch.dispatchPath,
    }));

    assert.equal(enqueue.family_runtime_enqueue.task.status, 'waiting_approval');
    assert.equal(firstTick.family_runtime_tick.selected_count, 0);
    assert.equal(approval.family_runtime_approval.task.status, 'queued');
    assert.equal(secondTick.family_runtime_tick.dispatches[0].status, 'succeeded');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(dispatch.fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime stage attempt ledger keeps provider dispatch separate until typed closeout', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-attempt-'));
  const dispatch = createDispatchFixture(`
cat <<'JSON'
{"accepted":true,"closeout_refs":["studies/DM002/stage_closeout/latest.json"]}
JSON
`);
  try {
    const enqueue = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'stage/scout',
      '--payload',
      '{"study_id":"DM002"}',
      '--dedupe-key',
      'mas:DM002:stage:scout',
    ], familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH: dispatch.dispatchPath,
    }));
    const taskId = enqueue.family_runtime_enqueue.task.task_id;
    const created = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'legacy_scout',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mas"}',
      '--source-fingerprint',
      'sha256:scout',
      '--task',
      taskId,
    ], familyRuntimeEnv(stateRoot));
    const tick = runCli(['family-runtime', 'tick', '--source', 'test'], familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH: dispatch.dispatchPath,
    }));
    const inspected = runCli([
      'family-runtime',
      'attempt',
      'inspect',
      created.family_runtime_stage_attempt.attempt.stage_attempt_id,
    ], familyRuntimeEnv(stateRoot));
    const task = runCli(['family-runtime', 'queue', 'inspect', taskId], familyRuntimeEnv(stateRoot));

    assert.equal(created.family_runtime_stage_attempt.attempt.status, 'queued');
    assert.equal(tick.family_runtime_tick.dispatches[0].stage_attempts[0].status, 'checkpointed');
    assert.equal(inspected.family_runtime_stage_attempt.attempt.status, 'checkpointed');
    assert.equal(inspected.family_runtime_stage_attempt.attempt.attempt_count, 1);
    assert.deepEqual(inspected.family_runtime_stage_attempt.attempt.closeout_refs, [
      'studies/DM002/stage_closeout/latest.json',
    ]);
    assert.equal(inspected.family_runtime_stage_attempt.attempt.closeout_receipt_status, 'domain_sidecar_receipt_ref_only');
    assert.equal(inspected.family_runtime_stage_attempt.attempt.provider_run.provider_status, 'checkpointed');
    assert.equal(
      inspected.family_runtime_stage_attempt.attempt.activity_events.at(-1).activity_status,
      'checkpointed',
    );
    assert.equal(task.family_runtime_task.stage_attempts.length, 1);
    assert.equal(task.family_runtime_task.stage_attempts[0].stage_id, 'legacy_scout');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(dispatch.fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime attempt create blocks executor launch when stage admission is required but unavailable', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-admission-create-'));
  try {
    const created = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'scout',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mas"}',
      '--source-fingerprint',
      'sha256:admission-required',
      '--require-stage-admission',
      '--start',
    ], familyRuntimeEnv(stateRoot));

    assert.equal(created.family_runtime_stage_attempt.attempt.status, 'blocked');
    assert.equal(
      created.family_runtime_stage_attempt.attempt.blocked_reason,
      'stage_admission_manifest_missing',
    );
    assert.equal(created.family_runtime_stage_attempt.temporal_start, null);
    assert.equal(created.family_runtime_stage_attempt.stage_launch_admission_gate.status, 'blocked');
    assert.equal(
      created.family_runtime_stage_attempt.stage_launch_admission_gate.authority_boundary.can_execute_stage,
      false,
    );
    assert.equal(
      created.family_runtime_stage_attempt.conflict_or_blocker_envelopes[0].reason,
      'stage_admission_manifest_missing',
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime tick blocks provider-hosted tasks at admission gate before domain dispatch', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-admission-dispatch-'));
  const dispatch = createDispatchFixture(`
touch ${shellSingleQuote(path.join(stateRoot, 'dispatch-ran'))}
echo '{"accepted":true,"surface_kind":"should_not_run"}'
`);
  try {
    const enqueue = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'stage/scout',
      '--payload',
      '{"provider_hosted_stage_attempt":true,"stage_id":"scout","workspace_root":"/tmp/mas"}',
      '--dedupe-key',
      'mas:admission:scout',
      '--require-stage-admission',
    ], familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH: dispatch.dispatchPath,
    }));
    const tick = runCli(['family-runtime', 'tick', '--source', 'test'], familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH: dispatch.dispatchPath,
    }));
    const task = runCli([
      'family-runtime',
      'queue',
      'inspect',
      enqueue.family_runtime_enqueue.task.task_id,
    ], familyRuntimeEnv(stateRoot));

    assert.equal(enqueue.family_runtime_enqueue.accepted, true);
    assert.equal(tick.family_runtime_tick.dispatches[0].status, 'blocked');
    assert.equal(tick.family_runtime_tick.dispatches[0].reason, 'stage_admission_manifest_missing');
    assert.equal(tick.family_runtime_tick.dispatches[0].stage_attempts[0].status, 'blocked');
    assert.equal(
      tick.family_runtime_tick.dispatches[0].stage_attempts[0].blocked_reason,
      'stage_admission_manifest_missing',
    );
    assert.equal(task.family_runtime_task.task.status, 'blocked');
    assert.equal(fs.existsSync(path.join(stateRoot, 'dispatch-ran')), false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(dispatch.fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime dispatch ingests typed closeout packet before marking attempt completed', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-typed-dispatch-'));
  const dispatch = createDispatchFixture(`
cat <<'JSON'
{
  "accepted": true,
  "closeout_packet": {
    "surface_kind": "stage_attempt_closeout_packet",
    "closeout_refs": ["receipt:typed-dispatch-closeout"],
    "consumed_refs": ["evidence:dispatch"],
    "consumed_memory_refs": ["memory:route-policy"],
    "writeback_receipt_refs": ["memory-writeback:receipt-typed"],
    "rejected_writes": [{"reason": "domain_truth_write_forbidden"}],
    "next_owner": "med-autoscience",
    "domain_ready_verdict": "domain_gate_pending",
    "route_impact": {"decision": "continue_review"}
  }
}
JSON
`);
  try {
    const enqueue = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'stage/write',
      '--payload',
      '{"study_id":"DM002"}',
    ], familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH: dispatch.dispatchPath,
    }));
    const taskId = enqueue.family_runtime_enqueue.task.task_id;
    const created = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'write',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mas"}',
      '--task',
      taskId,
    ], familyRuntimeEnv(stateRoot));
    const tick = runCli(['family-runtime', 'tick', '--source', 'test'], familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH: dispatch.dispatchPath,
    }));
    const query = runCli([
      'family-runtime',
      'attempt',
      'query',
      created.family_runtime_stage_attempt.attempt.stage_attempt_id,
    ], familyRuntimeEnv(stateRoot));
    const visibility = query.family_runtime_stage_attempt_query.stage_attempt_query.operator_visibility;

    assert.equal(tick.family_runtime_tick.dispatches[0].stage_attempts[0].status, 'completed');
    assert.equal(visibility.closeout_receipt_status, 'accepted_typed_closeout');
    assert.equal(visibility.provider_run.provider_status, 'completed');
    assert.deepEqual(visibility.consumed_memory_refs, ['memory:route-policy']);
    assert.deepEqual(visibility.writeback_receipt_refs, ['memory-writeback:receipt-typed']);
    assert.equal(visibility.route_impact.decision, 'continue_review');
    assert.equal(query.family_runtime_stage_attempt_query.stage_attempt_query.completion_boundary.provider_completion, 'completed');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(dispatch.fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime attempt create requires explicit workspace locator', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-attempt-locator-'));
  try {
    const result = spawnSync(process.execPath, [
      '--experimental-strip-types',
      path.join(repoRoot, 'src', 'cli.ts'),
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'scout',
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
        ...familyRuntimeEnv(stateRoot),
      },
    });
    const output = JSON.parse(result.stdout || result.stderr);

    assert.equal(result.status, 2);
    assert.equal(output.error.code, 'cli_usage_error');
    assert.match(output.error.message, /workspace-locator/);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime retries failed domain dispatch and then dead-letters', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-dead-letter-'));
  const dispatch = createDispatchFixture('echo "planned failure" >&2\nexit 17');
  try {
    runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'domain_route/recover',
      '--payload',
      '{"profile":"/tmp/profile.toml"}',
    ], familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH: dispatch.dispatchPath,
    }));
    for (let index = 0; index < 3; index += 1) {
      runCli(['family-runtime', 'tick', '--source', `test-${index}`], familyRuntimeEnv(stateRoot, {
        OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH: dispatch.dispatchPath,
      }));
    }
    const queue = runCli(['family-runtime', 'queue', 'list'], familyRuntimeEnv(stateRoot));
    const task = queue.family_runtime_queue.tasks[0];

    assert.equal(task.status, 'dead_letter');
    assert.equal(task.attempts, 3);
    assert.equal(task.dead_letter_reason, 'retry_budget_exhausted');
    assert.match(task.last_error, /planned failure/);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(dispatch.fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime hydration is idempotent and blocks exported forbidden writes', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-hydrate-idempotent-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-mas-export-idempotent-'));
  const exportPath = path.join(fixtureRoot, 'export');
  fs.writeFileSync(
    exportPath,
    `#!/usr/bin/env bash
set -euo pipefail
cat <<'JSON'
{
  "pending_family_tasks": [
    {
      "domain_id": "medautoscience",
      "task_kind": "domain_route/reconcile-apply",
      "dedupe_key": "mas:test:DM003:autonomy-continuation:slo_breach",
      "payload": {"profile": "/tmp/profile.toml", "study_id": "DM003"}
    },
    {
      "domain_id": "medautoscience",
      "task_kind": "artifact/override",
      "dedupe_key": "mas:test:bad-write",
      "payload": {"domain_truth_write": true}
    }
  ]
}
JSON
`,
    { mode: 0o755 },
  );
  try {
    const first = runCli(['family-runtime', 'intake', '--domain', 'medautoscience'], familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_EXPORT: exportPath,
    }));
    const second = runCli(['family-runtime', 'intake', '--domain', 'medautoscience'], familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_EXPORT: exportPath,
    }));
    const queue = runCli(['family-runtime', 'queue', 'list'], familyRuntimeEnv(stateRoot));

    assert.equal(first.family_runtime_intake.enqueued_count, 1);
    assert.equal(first.family_runtime_intake.blocked_count, 1);
    assert.equal(second.family_runtime_intake.enqueued_count, 0);
    assert.equal(second.family_runtime_intake.idempotent_noop_count, 1);
    assert.equal(queue.family_runtime_queue.queue.total, 1);
    assert.equal(queue.family_runtime_queue.tasks[0].dedupe_key, 'mas:test:DM003:autonomy-continuation:slo_breach');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime blocks domain truth writes before dispatch', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-forbidden-'));
  try {
    runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautogrant',
      '--task-kind',
      'artifact/override',
      '--payload',
      '{"domain_truth_write":true}',
    ], familyRuntimeEnv(stateRoot));
    const tick = runCli(['family-runtime', 'tick', '--source', 'test'], familyRuntimeEnv(stateRoot));
    const queue = runCli(['family-runtime', 'queue', 'list'], familyRuntimeEnv(stateRoot));

    assert.equal(tick.family_runtime_tick.dispatches[0].status, 'blocked');
    assert.equal(tick.family_runtime_tick.dispatches[0].reason, 'domain_forbidden_write');
    assert.equal(queue.family_runtime_queue.tasks[0].status, 'blocked');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
