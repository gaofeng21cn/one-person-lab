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
