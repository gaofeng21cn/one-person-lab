import { spawnSync } from 'node:child_process';

import { TestWorkflowEnvironment } from '@temporalio/testing';

import {
  assert,
  buildManifestCommand,
  createFamilyContractsFixtureRoot,
  fs,
  loadFamilyManifestFixtures,
  os,
  path,
  repoRoot,
  runCli,
  runCliFailure,
  shellSingleQuote,
  test,
} from '../helpers.ts';
import { STANDARD_PROGRESS_DELTA_POLICY, STANDARD_TYPED_BLOCKER_LINEAGE_POLICY } from '../../../../src/standard-domain-agent-scaffold-constants.ts';

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
    assert.equal(output.family_runtime.readiness.default_standard_agent_runtime_path, 'opl_temporal_hosted_autonomous');
    assert.equal(output.family_runtime.readiness.temporal_hosted_autonomy_default_enabled, true);
    assert.equal(output.family_runtime.readiness.codex_app_drives_long_running_tasks, false);
    assert.equal(output.family_runtime.readiness.degraded, true);
    assert.equal(output.family_runtime.readiness.degraded_reason, 'temporal_runtime_not_configured');
    assert.equal(output.family_runtime.provider_runtime.default_resolution.fallback, 'temporal');
    assert.equal(output.family_runtime.provider_runtime.default_resolution.fail_closed_when_temporal_not_ready, true);
    assert.equal(output.family_runtime.periodic_execution.surface_kind, 'opl_family_runtime_periodic_execution_summary');
    assert.equal(output.family_runtime.periodic_execution.default_for_standard_agents, true);
    assert.equal(output.family_runtime.periodic_execution.runtime_mode, 'provider_managed_autonomous_execution');
    assert.equal(output.family_runtime.periodic_execution.domain_agent_internal_loop_allowed, false);
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
    assert.equal(provider.details.worker_readiness.visibility_readiness, null);
    assert.deepEqual(provider.details.worker_readiness.blockers, ['temporal_runtime_not_configured']);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime temporal provider repair installs visibility Search Attributes when service is reachable', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-temporal-provider-repair-'));
  const queueDb = path.join(stateRoot, 'family-runtime', 'queue.sqlite');
  const testEnv = await TestWorkflowEnvironment.createLocal({
    server: {
      searchAttributes: [],
    },
  });
  try {
    const result = spawnSync(process.execPath, [
      '--experimental-strip-types',
      path.join(repoRoot, 'src', 'cli.ts'),
      'family-runtime',
      'repair',
      '--provider',
      'temporal',
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
        OPL_STATE_DIR: stateRoot,
        OPL_TEMPORAL_ADDRESS: testEnv.address,
        OPL_TEMPORAL_NAMESPACE: testEnv.namespace ?? 'default',
        OPL_TEMPORAL_WORKER_STATUS: 'ready',
      },
    });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    const repair = output.family_runtime_provider.temporal_visibility_repair;
    const workerRepair = output.family_runtime_provider.temporal_worker_repair;
    assert.equal(repair.surface_kind, 'temporal_visibility_repair_receipt');
    assert.equal(repair.repair_status, 'ready');
    assert.equal(workerRepair.trigger, 'provider_repair');
    assert.equal(workerRepair.repair_status, 'skipped');
    assert.equal(workerRepair.authority_boundary.can_write_domain_truth, false);
    assert.deepEqual(repair.installed_search_attributes, [
      'OplStageAttemptId',
      'OplDomainId',
      'OplStageId',
      'OplAttemptStatus',
      'OplStagePhase',
      'OplBlockedReason',
      'OplTaskId',
      'OplSourceFingerprint',
      'OplExecutorKind',
    ]);
    assert.equal(repair.visibility_readiness.readiness_status, 'ready');
    assert.equal(fs.existsSync(queueDb), true);
  } finally {
    await testEnv.teardown();
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

test('family-runtime queue hold moves scoped queued tasks behind approval', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-queue-hold-'));
  const dispatch = createDispatchFixture(`
cat <<'JSON'
{"accepted":true,"surface_kind":"test_dispatch"}
JSON
`);
  try {
    const env = familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MAS_DISPATCH: dispatch.dispatchPath,
      OPL_FAMILY_RUNTIME_PROVIDER: 'local_sqlite',
    });
    const heldTarget = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'domain_owner/default-executor-dispatch',
      '--payload',
      '{"study_id":"003-dpcc-primary-care-phenotype-treatment-gap","action_type":"return_to_ai_reviewer_workflow","source_fingerprint":"sha256:dm003-hold-target"}',
      '--dedupe-key',
      'mas:dm003:hold-target',
    ], env);
    const otherStudy = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'domain_owner/default-executor-dispatch',
      '--payload',
      '{"study_id":"002-dm-china-us-mortality-attribution","action_type":"return_to_ai_reviewer_workflow","source_fingerprint":"sha256:dm002-not-held"}',
      '--dedupe-key',
      'mas:dm002:not-held',
    ], env);
    const hold = runCli([
      'family-runtime',
      'queue',
      'hold',
      '--study',
      '003-dpcc-primary-care-phenotype-treatment-gap',
      '--reason',
      'manual_pause_for_mas_upgrade',
      '--source',
      'test-supervisor',
    ], env);
    const tick = runCli(['family-runtime', 'tick', '--source', 'test', '--limit', '10'], env);
    const heldInspection = runCli([
      'family-runtime',
      'queue',
      'inspect',
      heldTarget.family_runtime_enqueue.task.task_id,
    ], env);
    const otherInspection = runCli([
      'family-runtime',
      'queue',
      'inspect',
      otherStudy.family_runtime_enqueue.task.task_id,
    ], env);

    assert.equal(hold.family_runtime_queue_hold.held_count, 1);
    assert.equal(hold.family_runtime_queue_hold.held_tasks[0].status, 'waiting_approval');
    assert.equal(hold.family_runtime_queue_hold.held_tasks[0].requires_approval, true);
    assert.equal(tick.family_runtime_tick.selected_count, 1);
    assert.equal(heldInspection.family_runtime_task.task.status, 'waiting_approval');
    assert.equal(heldInspection.family_runtime_task.task.last_error, 'manual_pause_for_mas_upgrade');
    assert.equal(otherInspection.family_runtime_task.task.status, 'succeeded');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(dispatch.fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime stage attempt ledger keeps provider dispatch separate until typed closeout', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-attempt-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const fixtures = loadFamilyManifestFixtures();
  const stageId = 'direction_and_route_selection';
  const masManifest = {
    ...fixtures.medautoscience,
    family_stage_control_plane: {
      surface_kind: 'family_stage_control_plane',
      version: 'family-stage-control-plane.v1',
      plane_id: 'med_autoscience_stage_control_plane',
      target_domain_id: 'med-autoscience',
      owner: 'med-autoscience',
      authority_boundary: { opl_role: 'projection_consumer_only' },
      stages: [{
        stage_id: stageId,
        stage_kind: 'planning',
        title: 'Direction and route selection',
        summary: 'Select the MAS route under domain authority.',
        goal: 'Prepare an admitted MAS direction and route selection attempt.',
        owner: 'med-autoscience',
        domain_stage_refs: [stageId],
        inputs: [],
        knowledge_refs: [],
        skills: [],
        prompt_refs: [],
        allowed_action_refs: [],
        outputs: [],
        evaluation: [],
        handoff: null,
        source_refs: [],
        freshness: null,
        action_parity: null,
        stage_contract: {
          requires: ['study_task_ready'],
          ensures: ['route_selected'],
          boundary_assumptions: ['domain_truth_remains_domain_owned'],
          properties: [],
          progress_delta_policy: STANDARD_PROGRESS_DELTA_POLICY,
          typed_blocker_lineage_policy: STANDARD_TYPED_BLOCKER_LINEAGE_POLICY,
          runtime_assumptions: [],
          monitor_refs: [],
          source_scope_refs: [{ ref_kind: 'json_pointer', ref: '/source_scope/direction_and_route_selection', role: 'launch_source_scope' }],
          artifact_scope_refs: [],
          workspace_scope_refs: [],
        },
        trust_boundary: {
          lane: 'domain_agent',
          static_check_eligible: true,
          effect_boundary: false,
          records_runtime_events: false,
        },
        authority_boundary: { opl_role: 'projection_consumer_only', can_write_domain_truth: false },
      }],
      notes: [],
    },
  };
  const dispatch = createDispatchFixture(`
cat <<'JSON'
{"accepted":true,"closeout_refs":["studies/DM002/stage_closeout/latest.json"]}
JSON
`);
  const env = familyRuntimeEnv(stateRoot, {
    OPL_CONTRACTS_DIR: fixtureContractsRoot,
    OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH: dispatch.dispatchPath,
  });
  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      repoRoot,
      '--manifest-command',
      buildManifestCommand(masManifest),
    ], env);

    const enqueue = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      `stage/${stageId}`,
      '--payload',
      '{"study_id":"DM002"}',
      '--dedupe-key',
      `mas:DM002:stage:${stageId}`,
    ], env);
    const taskId = enqueue.family_runtime_enqueue.task.task_id;
    const created = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      stageId,
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mas"}',
      '--source-fingerprint',
      'sha256:direction-and-route-selection',
      '--task',
      taskId,
    ], env);
    const tick = runCli(['family-runtime', 'tick', '--source', 'test'], env);
    const inspected = runCli([
      'family-runtime',
      'attempt',
      'inspect',
      created.family_runtime_stage_attempt.attempt.stage_attempt_id,
    ], env);
    const task = runCli(['family-runtime', 'queue', 'inspect', taskId], env);

    assert.equal(created.family_runtime_stage_attempt.attempt.status, 'queued');
    assert.equal(tick.family_runtime_tick.dispatches[0].stage_attempts[0].status, 'checkpointed');
    assert.equal(inspected.family_runtime_stage_attempt.attempt.status, 'checkpointed');
    assert.equal(inspected.family_runtime_stage_attempt.attempt.attempt_count, 1);
    assert.deepEqual(inspected.family_runtime_stage_attempt.attempt.closeout_refs, [
      'studies/DM002/stage_closeout/latest.json',
    ]);
    assert.equal(inspected.family_runtime_stage_attempt.attempt.closeout_receipt_status, 'domain_handler_receipt_ref_only');
    assert.equal(inspected.family_runtime_stage_attempt.attempt.provider_run.provider_status, 'checkpointed');
    assert.equal(
      inspected.family_runtime_stage_attempt.attempt.activity_events.at(-1).activity_status,
      'checkpointed',
    );
    assert.equal(task.family_runtime_task.stage_attempts.length, 1);
    assert.equal(task.family_runtime_task.stage_attempts[0].stage_id, stageId);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
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
