import test from 'node:test';
import assert from 'node:assert/strict';

import {
  familyRuntimeSqliteSidecarPolicy,
  openFamilyRuntimeSqlite,
} from '../../src/modules/runway/family-runtime-sqlite.ts';

const EXPECTED_BUSY_TIMEOUT_MS = 5_000;

test('family runtime SQLite connections set a busy timeout', () => {
  const db = openFamilyRuntimeSqlite(':memory:');
  try {
    const row = db.prepare('PRAGMA busy_timeout').get() as { timeout: number };
    assert.equal(row.timeout, EXPECTED_BUSY_TIMEOUT_MS);
    const foreignKeys = db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number };
    assert.equal(foreignKeys.foreign_keys, 1);
  } finally {
    db.close();
  }
});

test('family runtime read-only SQLite connections set a busy timeout', () => {
  const db = openFamilyRuntimeSqlite(':memory:', { readOnly: true });
  try {
    const row = db.prepare('PRAGMA busy_timeout').get() as { timeout: number };
    assert.equal(row.timeout, EXPECTED_BUSY_TIMEOUT_MS);
    const foreignKeys = db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number };
    assert.equal(foreignKeys.foreign_keys, 1);
  } finally {
    db.close();
  }
});

test('family runtime SQLite sidecar policy is refs-only and rebuildable', () => {
  const policy = familyRuntimeSqliteSidecarPolicy();

  assert.equal(policy.surface_kind, 'opl_family_runtime_sqlite_sidecar_policy');
  assert.equal(policy.contract_ref, 'contracts/opl-framework/state-index-kernel-contract.json');
  assert.equal(policy.storage_role, 'sqlite_sidecar_index');
  assert.equal(policy.journal_mode, 'WAL');
  assert.equal(policy.busy_timeout_ms, EXPECTED_BUSY_TIMEOUT_MS);
  assert.equal(policy.foreign_keys_enabled, true);
  assert.equal(policy.single_writer_assumption, true);
  assert.equal(policy.network_filesystem_multi_writer_supported, false);
  assert.equal(policy.stores_domain_truth, false);
  assert.equal(policy.stores_memory_body, false);
  assert.equal(policy.stores_artifact_body, false);
  assert.equal(policy.stores_quality_or_export_verdict, false);
  assert.equal(policy.rebuildable_from_file_truth_and_refs, true);
});
