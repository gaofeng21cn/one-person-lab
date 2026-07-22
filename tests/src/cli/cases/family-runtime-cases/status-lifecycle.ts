import { spawnSync } from 'node:child_process';

import {
  assert,
  fs,
  os,
  path,
  repoRoot,
  runCli,
  test,
} from '../../helpers.ts';
import { familyRuntimeEnv } from './helpers.ts';

test('family-runtime status exposes Temporal provider runtime and SQLite projection index path', () => {
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
      'temporal',
      'external_sandbox',
    ]);
    assert.equal(output.family_runtime.readiness.provider_ready, false);
    assert.equal(output.family_runtime.readiness.full_online_ready, false);
    assert.equal(output.family_runtime.readiness.default_standard_agent_runtime_path, 'opl_temporal_hosted_autonomous');
    assert.equal(output.family_runtime.readiness.temporal_hosted_autonomy_default_enabled, true);
    assert.equal(output.family_runtime.readiness.codex_app_drives_long_running_tasks, false);
    assert.equal(output.family_runtime.readiness.degraded, true);
    assert.equal(output.family_runtime.readiness.degraded_reason, 'temporal_runtime_not_configured');
    assert.equal(output.family_runtime.readiness.local_sqlite_provider_retired, true);
    assert.equal(output.family_runtime.provider_runtime.default_resolution.fallback, 'temporal');
    assert.equal(output.family_runtime.provider_runtime.default_resolution.local_sqlite_role, 'retired_runtime_provider');
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
    assert.equal(output.family_runtime.state.stage_attempt_index_db, path.join(stateRoot, 'family-runtime', 'queue.sqlite'));
    assert.equal(output.family_runtime.state.stage_attempt_index_schema_version, 4);
    assert.equal(
      output.family_runtime.queue_lifecycle_boundary.surface_kind,
      'opl_family_runtime_sqlite_sidecar_projection_boundary',
    );
    assert.equal(
      output.family_runtime.queue_lifecycle_boundary.sqlite_role,
      'stage_attempt_projection_index_not_runtime_queue_or_provider',
    );
    assert.equal(output.family_runtime.queue_lifecycle_boundary.gate.status, 'pass');
    assert.equal(output.family_runtime.queue_lifecycle_boundary.gate.temporal_migration_required, false);
    assert.equal(
      output.family_runtime.queue_lifecycle_boundary.temporal_durable_lifecycle_handoff.status,
      'not_required',
    );
    assert.equal(
      output.family_runtime.queue_lifecycle_boundary.field_roles.projection_or_audit_when_temporal_selected
        .includes('tasks.dead_letter_reason'),
      true,
    );
    assert.equal(
      output.family_runtime.queue_lifecycle_boundary.field_roles.projection_or_audit_when_temporal_selected
        .includes('tasks.max_attempts'), // reuse-first: allow local max_attempts vocabulary boundary.
      true,
    );
    assert.equal(
      output.family_runtime.queue_lifecycle_boundary.temporal_durable_lifecycle_handoff.readback_surfaces
        .includes('opl family-runtime attempt list --json'),
      true,
    );
    assert.equal(
      output.family_runtime.queue_lifecycle_boundary.temporal_durable_lifecycle_handoff.handoff_claims
        .domain_progress_claim_allowed,
      false,
    );
    assert.equal(fs.existsSync(output.family_runtime.state.stage_attempt_index_db), true);
    assert.equal('domain_adapters' in output.family_runtime, false);
    assert.equal(output.family_runtime.opl_owner.action_execution, 'package_managed_hosted_action_runtime');
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
    const output = JSON.parse(result.stdout); // reuse-first: allow CLI stdout JSON parser in migrated test case.
    assert.equal(output.family_runtime.surface_id, 'opl_family_runtime');
    assert.equal(output.family_runtime.provider_model, 'provider_backed_stage_attempt_runtime');
    assert.equal(output.family_runtime.configured_provider, 'temporal');
    assert.equal(output.family_runtime.readiness.provider_ready, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
