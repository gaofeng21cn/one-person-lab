import { assert, fs, os, path, runCli, test } from '../helpers.ts';

test('runtime lifecycle operator commands reuse the family-runtime lifecycle ledger', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-lifecycle-operator-'));
  try {
    const dryRun = runCli([
      'runtime',
      'lifecycle',
      'apply',
      '--mode',
      'dry-run',
      '--domain',
      'medautogrant',
      '--source-ref',
      'mag://cleanup/operator-plan',
      '--action',
      JSON.stringify({
        action_id: 'record-operator-tombstone-ref',
        action_kind: 'cleanup',
        owner_scope: 'opl_owned_tombstone_ref',
        target_ref: 'opl://history/mag/operator-tombstone',
        restore_proof_refs: ['restore-proof:mag:operator-tombstone'],
      }),
    ], { OPL_STATE_DIR: stateRoot });

    assert.equal(dryRun.runtime_lifecycle_apply.mode, 'dry-run');
    assert.equal(dryRun.runtime_lifecycle_apply.status, 'dry_run_ready');
    assert.equal(dryRun.family_runtime_lifecycle_apply, undefined);
    assert.equal(dryRun.runtime_lifecycle_apply.summary.writes_performed, false);
    assert.equal(
      dryRun.runtime_lifecycle_apply.authority_boundary.opl_can_write_domain_truth,
      false,
    );

    const applied = runCli([
      'runtime',
      'lifecycle',
      'apply',
      '--mode',
      'apply',
      '--domain',
      'medautogrant',
      '--source-ref',
      'mag://cleanup/operator-plan',
      '--manifest-ref',
      'manifest:mag:operator-lifecycle',
      '--action',
      JSON.stringify({
        action_id: 'record-operator-tombstone-ref',
        action_kind: 'cleanup',
        owner_scope: 'opl_owned_tombstone_ref',
        target_ref: 'opl://history/mag/operator-tombstone',
        restore_proof_refs: ['restore-proof:mag:operator-tombstone'],
      }),
    ], { OPL_STATE_DIR: stateRoot });

    assert.equal(applied.runtime_lifecycle_apply.status, 'applied');
    assert.equal(applied.runtime_lifecycle_apply.summary.writes_performed, true);

    const verified = runCli([
      'runtime',
      'lifecycle',
      'apply',
      '--mode',
      'verify',
      '--domain',
      'medautogrant',
      '--receipt-ref',
      applied.runtime_lifecycle_apply.receipt_ref,
    ], { OPL_STATE_DIR: stateRoot });

    assert.equal(verified.runtime_lifecycle_apply.status, 'verified');
    assert.equal(verified.runtime_lifecycle_apply.summary.verified_receipt_count, 1);

    const reconciled = runCli([
      'runtime',
      'lifecycle',
      'reconcile',
      '--domain',
      'medautogrant',
      '--expected-source-ref',
      'mag://cleanup/operator-plan',
      '--expected-restore-proof-ref',
      'restore-proof:mag:operator-tombstone',
    ], { OPL_STATE_DIR: stateRoot });

    assert.equal(reconciled.runtime_lifecycle_reconcile.status, 'reconciled');
    assert.equal(reconciled.runtime_lifecycle_reconcile.summary.drift_detected, false);
    assert.equal(reconciled.runtime_lifecycle_reconcile.summary.opl_cleanup_apply_can_execute, false);
    assert.equal(
      reconciled.runtime_lifecycle_reconcile.summary.can_execute_domain_physical_delete,
      false,
    );
    assert.equal(
      reconciled.runtime_lifecycle_reconcile.authority_boundary.opl_can_delete_domain_repo_files,
      false,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

