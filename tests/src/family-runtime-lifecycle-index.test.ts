import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  listFamilyRuntimeLifecycleRefs,
  familyRuntimeLifecycleIndexPaths,
  readFamilyRuntimeLifecycleRefs,
  recordFamilyRuntimeLifecycleRef,
  reconcileFamilyRuntimeLifecycleRefs,
  runFamilyRuntimeLifecycleApply,
} from '../../src/family-runtime-lifecycle-index.ts';

function withTempState<T>(fn: () => T) {
  const previous = process.env.OPL_STATE_DIR;
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-lifecycle-index-'));
  process.env.OPL_STATE_DIR = stateRoot;
  try {
    return fn();
  } finally {
    if (previous === undefined) {
      delete process.env.OPL_STATE_DIR;
    } else {
      process.env.OPL_STATE_DIR = previous;
    }
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
}

test('family runtime lifecycle index records refs-only SQLite sidecar entries without domain authority', () => {
  withTempState(() => {
    const recorded = recordFamilyRuntimeLifecycleRef({
      domain_id: 'med-autoscience',
      surface_id: 'runtime_lifecycle_sqlite_reference_adapter',
      surface_role: 'domain_sidecar_index_reference_adapter',
      source_ref: 'mas://runtime-lifecycle/run-1',
      receipt_ref: 'mas://receipt/runtime-lifecycle/run-1',
      checksum: 'sha256:fixture',
      payload: {
        restore_ref: 'mas://restore/run-1',
        artifact_ref: 'mas://artifact/package.zip',
      },
    });

    assert.equal(recorded.surface_kind, 'family_runtime_lifecycle_index_record');
    assert.equal(recorded.owner, 'one-person-lab');
    assert.equal(recorded.authority_boundary.storage_role, 'sqlite_sidecar_index');
    assert.equal(recorded.authority_boundary.opl_can_write_domain_truth, false);
    assert.equal(recorded.authority_boundary.opl_can_write_memory_body, false);

    const listed = listFamilyRuntimeLifecycleRefs({ domain_id: 'med-autoscience' });
    assert.equal(listed.surface_kind, 'family_runtime_lifecycle_index');
    assert.equal(listed.summary.total_ref_count, 1);
    assert.equal(listed.refs[0].surface_role, 'domain_sidecar_index_reference_adapter');
    assert.equal(listed.refs[0].receipt_ref, 'mas://receipt/runtime-lifecycle/run-1');
    assert.equal(listed.refs[0].payload.restore_ref, 'mas://restore/run-1');
    assert.equal(listed.authority_boundary.domain_artifact_authority_preserved, true);
    assert.equal(fs.existsSync(listed.lifecycle_index_db), true);
  });
});

test('family runtime lifecycle index read model does not create missing ledger files', () => {
  withTempState(() => {
    const paths = familyRuntimeLifecycleIndexPaths();
    assert.equal(fs.existsSync(paths.lifecycle_index_db), false);

    const listed = readFamilyRuntimeLifecycleRefs({ domain_id: 'med-autoscience' });

    assert.equal(listed.status, 'missing');
    assert.equal(listed.summary.total_ref_count, 0);
    assert.equal(listed.summary.filtered_domain_id, 'med-autoscience');
    assert.equal(fs.existsSync(paths.lifecycle_index_db), false);
    assert.equal(listed.authority_boundary.opl_can_write_domain_truth, false);
  });
});

test('family runtime lifecycle index is idempotent by domain, surface, and source ref', () => {
  withTempState(() => {
    recordFamilyRuntimeLifecycleRef({
      domain_id: 'med-autogrant',
      surface_id: 'package_lifecycle_shell',
      surface_role: 'package_authority_refs',
      source_ref: 'mag://package/run-1',
      receipt_ref: 'mag://receipt/old',
    });
    recordFamilyRuntimeLifecycleRef({
      domain_id: 'med-autogrant',
      surface_id: 'package_lifecycle_shell',
      surface_role: 'package_authority_refs',
      source_ref: 'mag://package/run-1',
      receipt_ref: 'mag://receipt/new',
      payload: { updated: true },
    });

    const listed = listFamilyRuntimeLifecycleRefs();
    assert.equal(listed.summary.total_ref_count, 1);
    assert.equal(listed.refs[0].receipt_ref, 'mag://receipt/new');
    assert.equal(listed.refs[0].payload.updated, true);
  });
});

test('family runtime lifecycle apply dry-run does not write cleanup ledger receipts', () => {
  withTempState(() => {
    const result = runFamilyRuntimeLifecycleApply({
      mode: 'dry-run',
      target_domain_id: 'med-autogrant',
      source_ref: 'mag://legacy-cleanup/plan-1',
      actions: [
        {
          action_id: 'mark-opl-tombstone',
          action_kind: 'cleanup',
          owner_scope: 'opl_owned_tombstone_ref',
          target_ref: 'opl://history/mag/gateway-tombstone',
          restore_proof_refs: ['restore-proof:mag:gateway-tombstone'],
        },
      ],
    });

    assert.equal(result.surface_kind, 'family_runtime_lifecycle_apply_receipt');
    assert.equal(result.mode, 'dry-run');
    assert.equal(result.status, 'dry_run_ready');
    assert.equal(result.summary.safe_action_count, 1);
    assert.equal(result.summary.writes_performed, false);

    const listed = listFamilyRuntimeLifecycleRefs();
    assert.equal(listed.summary.total_ref_count, 0);
  });
});

test('family runtime lifecycle apply writes safe cleanup receipt and ledger refs', () => {
  withTempState(() => {
    const applied = runFamilyRuntimeLifecycleApply({
      mode: 'apply',
      target_domain_id: 'med-autogrant',
      source_ref: 'mag://legacy-cleanup/plan-1',
      manifest_ref: 'manifest:mag:lifecycle',
      actions: [
        {
          action_id: 'mark-opl-tombstone',
          action_kind: 'cleanup',
          owner_scope: 'opl_owned_tombstone_ref',
          target_ref: 'opl://history/mag/gateway-tombstone',
          restore_proof_refs: ['restore-proof:mag:gateway-tombstone'],
          no_active_caller_refs: ['proof:mag:no-active-caller'],
          replacement_parity_refs: ['proof:mag:replacement-parity'],
        },
        {
          action_id: 'record-domain-artifact-receipt',
          action_kind: 'receipt_ref',
          owner_scope: 'domain_owned_artifact_receipt_ref',
          target_ref: 'mag://artifact/package.zip',
          restore_proof_refs: ['restore-proof:mag:package'],
          domain_artifact_mutation_receipt_refs: ['mag://receipt/artifact-cleanup-1'],
        },
      ],
    });

    assert.equal(applied.mode, 'apply');
    assert.equal(applied.status, 'applied');
    assert.equal(applied.summary.safe_action_count, 2);
    assert.equal(applied.summary.domain_artifact_mutation_receipt_ref_count, 1);
    assert.equal(applied.summary.no_active_caller_ref_count, 1);
    assert.equal(applied.summary.replacement_parity_ref_count, 1);
    assert.equal(applied.summary.writes_performed, true);
    assert.equal(applied.cleanup_receipts.length, 2);

    const listed = listFamilyRuntimeLifecycleRefs({ domain_id: 'med-autogrant' });
    assert.equal(listed.summary.total_ref_count, 2);
    const domainReceiptRef = listed.refs.find((ref) =>
      ref.surface_role === 'domain_artifact_mutation_receipt_ref'
    );
    const cleanupReceipt = listed.refs.find((ref) => ref.surface_role === 'safe_cleanup_receipt');
    assert.equal(domainReceiptRef?.surface_role, 'domain_artifact_mutation_receipt_ref');
    assert.deepEqual(domainReceiptRef?.payload.domain_artifact_mutation_receipt_refs, [
      'mag://receipt/artifact-cleanup-1',
    ]);
    assert.equal(cleanupReceipt?.surface_role, 'safe_cleanup_receipt');
    assert.deepEqual(cleanupReceipt?.payload.restore_proof_refs, ['restore-proof:mag:gateway-tombstone']);
    assert.deepEqual(cleanupReceipt?.payload.no_active_caller_refs, ['proof:mag:no-active-caller']);
    assert.deepEqual(cleanupReceipt?.payload.replacement_parity_refs, ['proof:mag:replacement-parity']);
  });
});

test('family runtime lifecycle apply records domain-owner legacy cleanup handoff receipts only after replacement proof', () => {
  withTempState(() => {
    const blocked = runFamilyRuntimeLifecycleApply({
      mode: 'apply',
      target_domain_id: 'med-autoscience',
      source_ref: 'mas://legacy-cleanup/plan-local-scheduler',
      actions: [
        {
          action_id: 'record-mas-local-scheduler-physical-retirement',
          action_kind: 'record_domain_owner_handoff_receipt',
          owner_scope: 'domain_owner_handoff_receipt_ref',
          target_ref: 'src/med_autoscience/controllers/supervision_scheduler_parts/local_adapter.py',
          restore_proof_refs: ['docs/history/runtime/local-scheduler-tombstone.md'],
          domain_owner_handoff_receipt_refs: ['mas://receipt/local-scheduler-retired'],
        },
      ],
    });

    assert.equal(blocked.status, 'blocked');
    assert.equal(blocked.summary.unsafe_action_count, 1);
    assert.equal(blocked.summary.writes_performed, false);
    assert.equal(
      blocked.actions[0].blocker?.blocker_id,
      'no_active_caller_ref_required_before_legacy_cleanup_apply',
    );

    const applied = runFamilyRuntimeLifecycleApply({
      mode: 'apply',
      target_domain_id: 'med-autoscience',
      source_ref: 'mas://legacy-cleanup/plan-local-scheduler',
      actions: [
        {
          action_id: 'record-mas-local-scheduler-physical-retirement',
          action_kind: 'record_domain_owner_handoff_receipt',
          owner_scope: 'domain_owner_handoff_receipt_ref',
          target_ref: 'src/med_autoscience/controllers/supervision_scheduler_parts/local_adapter.py',
          restore_proof_refs: ['docs/history/runtime/local-scheduler-tombstone.md'],
          domain_owner_handoff_receipt_refs: ['mas://receipt/local-scheduler-retired'],
          no_active_caller_refs: ['proof:mas:local-scheduler-no-active-caller'],
          replacement_parity_refs: ['proof:opl:temporal-scheduler-replacement'],
        },
      ],
    });

    assert.equal(applied.status, 'applied');
    assert.equal(applied.summary.safe_action_count, 1);
    assert.equal(applied.summary.domain_owner_handoff_receipt_ref_count, 1);
    assert.equal(applied.summary.no_active_caller_ref_count, 1);
    assert.equal(applied.summary.replacement_parity_ref_count, 1);
    const cleanupReceipt = applied.cleanup_receipts[0];
    assert.ok(cleanupReceipt);
    const authorityBoundary = cleanupReceipt.authority_boundary as Record<string, unknown>;
    assert.equal(
      authorityBoundary.opl_can_move_or_delete_domain_repo_files,
      false,
    );
    assert.equal(
      authorityBoundary.domain_repo_delete_requires_owner_receipt,
      true,
    );

    const reconciled = reconcileFamilyRuntimeLifecycleRefs({
      target_domain_id: 'med-autoscience',
      expected_domain_artifact_mutation_receipt_refs: ['mas://receipt/local-scheduler-retired'],
      expected_restore_proof_refs: ['docs/history/runtime/local-scheduler-tombstone.md'],
    });

    assert.equal(reconciled.status, 'reconciled');
    assert.equal(reconciled.summary.opl_cleanup_apply_can_execute, true);
    assert.deepEqual(reconciled.actual_refs.domain_artifact_mutation_receipt_refs, [
      'mas://receipt/local-scheduler-retired',
    ]);
  });
});

test('family runtime lifecycle apply fail-closes unsafe domain artifact mutation', () => {
  withTempState(() => {
    const result = runFamilyRuntimeLifecycleApply({
      mode: 'apply',
      target_domain_id: 'redcube',
      source_ref: 'rca://legacy-cleanup/plan-1',
      actions: [
        {
          action_id: 'delete-domain-artifact',
          action_kind: 'cleanup',
          owner_scope: 'domain_owned_artifact',
          target_ref: 'rca://artifact/deck.pptx',
          restore_proof_refs: ['restore-proof:rca:deck'],
        },
      ],
    });

    assert.equal(result.status, 'blocked');
    assert.equal(result.summary.unsafe_action_count, 1);
    assert.equal(result.summary.writes_performed, false);
    assert.equal(result.actions[0].decision, 'blocked');
    assert.equal(result.actions[0].blocker?.blocker_id, 'domain_owned_artifact_mutation_forbidden');

    const listed = listFamilyRuntimeLifecycleRefs();
    assert.equal(listed.summary.total_ref_count, 0);
  });
});

test('family runtime lifecycle verify reads an applied cleanup receipt', () => {
  withTempState(() => {
    const applied = runFamilyRuntimeLifecycleApply({
      mode: 'apply',
      target_domain_id: 'med-autoscience',
      source_ref: 'mas://legacy-cleanup/plan-1',
      actions: [
        {
          action_id: 'mark-opl-index-ref-retired',
          action_kind: 'cleanup',
          owner_scope: 'opl_owned_index_ref',
          target_ref: 'opl://lifecycle-index/mas/runtime-lifecycle',
          restore_proof_refs: ['restore-proof:mas:runtime-lifecycle'],
          no_active_caller_refs: ['proof:mas:index-no-active-caller'],
          replacement_parity_refs: ['proof:mas:index-replacement-parity'],
        },
      ],
    });

    const verified = runFamilyRuntimeLifecycleApply({
      mode: 'verify',
      target_domain_id: 'med-autoscience',
      receipt_ref: applied.receipt_ref,
    });

    assert.equal(verified.mode, 'verify');
    assert.equal(verified.status, 'verified');
    assert.equal(verified.summary.verified_receipt_count, 1);
    assert.equal(verified.verified_receipts[0].receipt_ref, applied.receipt_ref);
    assert.deepEqual(verified.verified_receipts[0].restore_proof_refs, [
      'restore-proof:mas:runtime-lifecycle',
    ]);
  });
});

test('family runtime lifecycle verify folds historical duplicate cleanup receipts by semantic identity', () => {
  withTempState(() => {
    const action = {
      action_id: 'mark-opl-index-ref-retired',
      action_kind: 'cleanup',
      owner_scope: 'opl_owned_index_ref',
      target_ref: 'opl://lifecycle-index/mas/runtime-lifecycle',
      restore_proof_refs: ['restore-proof:mas:runtime-lifecycle'],
      no_active_caller_refs: ['proof:mas:index-no-active-caller'],
      replacement_parity_refs: ['proof:mas:index-replacement-parity'],
    };
    const first = runFamilyRuntimeLifecycleApply({
      mode: 'apply',
      target_domain_id: 'med-autoscience',
      source_ref: 'mas://legacy-cleanup/plan-1',
      actions: [action],
    });

    const legacyDuplicate = runFamilyRuntimeLifecycleApply({
      mode: 'apply',
      target_domain_id: 'med-autoscience',
      source_ref: 'mas://legacy-cleanup/plan-1',
      actions: [
        {
          ...action,
          manifest_ref: 'legacy-generated-duplicate-ref',
        },
      ],
    });
    assert.notEqual(legacyDuplicate.receipt_ref, first.receipt_ref);

    const verified = runFamilyRuntimeLifecycleApply({
      mode: 'verify',
      target_domain_id: 'med-autoscience',
    });

    assert.equal(verified.status, 'verified');
    assert.equal(verified.summary.verified_receipt_count, 2);
    assert.equal(verified.summary.raw_verified_receipt_count, 4);
    assert.equal(verified.summary.folded_duplicate_receipt_count, 2);
    assert.deepEqual(
      verified.verified_receipts.map((receipt) => receipt.receipt.receipt_kind),
      ['opl_lifecycle_apply_batch_receipt', 'opl_safe_cleanup_receipt'],
    );
  });
});

test('family runtime lifecycle reconcile detects missing and stale refs without delete authority', () => {
  withTempState(() => {
    recordFamilyRuntimeLifecycleRef({
      domain_id: 'med-autoscience',
      surface_id: 'artifact_lifecycle_receipt',
      surface_role: 'domain_artifact_mutation_receipt_ref',
      source_ref: 'mas://artifact/current-package',
      receipt_ref: 'mas://receipt/artifact-cleanup',
      payload: {
        restore_proof_refs: ['restore-proof:mas-package'],
        domain_artifact_mutation_receipt_refs: ['mas://receipt/artifact-cleanup'],
      },
    });

    const reconciled = reconcileFamilyRuntimeLifecycleRefs({
      target_domain_id: 'med-autoscience',
      expected_source_refs: ['mas://artifact/current-package'],
      expected_receipt_refs: ['mas://receipt/artifact-cleanup'],
      expected_restore_proof_refs: ['restore-proof:mas-package'],
      expected_domain_artifact_mutation_receipt_refs: ['mas://receipt/artifact-cleanup'],
    });

    assert.equal(reconciled.status, 'reconciled');
    assert.equal(reconciled.summary.drift_detected, false);
    assert.equal(reconciled.summary.can_execute_delete, false);
    assert.equal(reconciled.summary.can_execute_domain_physical_delete, false);
    assert.equal(reconciled.summary.opl_cleanup_apply_can_execute, true);
    assert.equal(reconciled.delete_ready_proof.proof_status, 'domain_owner_receipt_refs_observed');
    assert.equal(reconciled.delete_ready_proof.can_execute_delete, false);
    assert.equal(reconciled.delete_ready_proof.can_execute_domain_physical_delete, false);
    assert.equal(reconciled.delete_ready_proof.opl_cleanup_apply_ready, true);
    assert.equal(
      reconciled.delete_ready_proof.opl_cleanup_apply_surface,
      'opl family-runtime lifecycle apply --mode apply',
    );
    assert.equal(reconciled.authority_boundary.opl_can_delete_domain_repo_files, false);
    assert.equal(reconciled.authority_boundary.opl_can_write_cleanup_ledger_receipts, true);

    const inferred = reconcileFamilyRuntimeLifecycleRefs({
      target_domain_id: 'med-autoscience',
    });

    assert.equal(inferred.summary.expected_ref_count, 0);
    assert.equal(inferred.summary.opl_cleanup_apply_can_execute, true);
    assert.equal(inferred.delete_ready_proof.proof_status, 'domain_owner_receipt_refs_observed');

    const drift = reconcileFamilyRuntimeLifecycleRefs({
      target_domain_id: 'med-autoscience',
      expected_source_refs: ['mas://artifact/current-package', 'mas://artifact/missing'],
      expected_domain_artifact_mutation_receipt_refs: ['mas://receipt/artifact-cleanup', 'mas://receipt/missing'],
      max_age_ms: 0,
      now: '2999-01-01T00:00:00.000Z',
    });

    assert.equal(drift.status, 'drift_detected');
    assert.deepEqual(drift.missing_refs.source_refs, ['mas://artifact/missing']);
    assert.deepEqual(drift.missing_refs.domain_artifact_mutation_receipt_refs, ['mas://receipt/missing']);
    assert.equal(drift.summary.stale_ref_count, 1);
    assert.equal(drift.delete_ready_proof.proof_status, 'blocked_lifecycle_drift_detected');
    assert.equal(drift.summary.can_execute_delete, false);
    assert.equal(drift.summary.opl_cleanup_apply_can_execute, false);
  });
});
