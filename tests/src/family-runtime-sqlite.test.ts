import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FAMILY_RUNTIME_SQLITE_BUSY_TIMEOUT_MS,
  openFamilyRuntimeSqlite,
} from '../../src/family-runtime-sqlite.ts';

test('family runtime SQLite connections set a busy timeout', () => {
  const db = openFamilyRuntimeSqlite(':memory:');
  try {
    const row = db.prepare('PRAGMA busy_timeout').get() as { timeout: number };
    assert.equal(row.timeout, FAMILY_RUNTIME_SQLITE_BUSY_TIMEOUT_MS);
  } finally {
    db.close();
  }
});

test('family runtime read-only SQLite connections set a busy timeout', () => {
  const db = openFamilyRuntimeSqlite(':memory:', { readOnly: true });
  try {
    const row = db.prepare('PRAGMA busy_timeout').get() as { timeout: number };
    assert.equal(row.timeout, FAMILY_RUNTIME_SQLITE_BUSY_TIMEOUT_MS);
  } finally {
    db.close();
  }
});
