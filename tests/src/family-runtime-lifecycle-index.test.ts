import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  listFamilyRuntimeLifecycleRefs,
  recordFamilyRuntimeLifecycleRef,
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
