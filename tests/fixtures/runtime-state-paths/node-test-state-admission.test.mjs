import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { openQueueDb } from '../../../src/modules/runway/family-runtime-store.ts';

test('Node test state admission probe', () => {
  assert.ok(process.env.NODE_TEST_CONTEXT, 'probe must execute in a real Node test context');

  if (process.env.OPL_TEST_EXPECT_STATE_ADMISSION === 'blocked') {
    assert.throws(
      () => openQueueDb(),
      {
        name: 'OplStateAdmissionError',
        message: /OPL_STATE_DIR is required when NODE_TEST_CONTEXT is present/,
      },
    );
    return;
  }

  if (process.env.OPL_TEST_EXPECT_STATE_ADMISSION === 'repo-temp-allowed') {
    assert.equal(process.env.OPL_REPO_TEMP_ENV_ACTIVE, '1');
    assert.ok(process.env.OPL_REPO_TEMP_ROOT, 'repo temp probe requires a declared temp root');
    assert.equal(process.env.OPL_STATE_DIR, undefined);
    const { db, paths } = openQueueDb();
    try {
      assert.equal(paths.state_dir.startsWith(path.resolve(process.env.OPL_REPO_TEMP_ROOT)), true);
    } finally {
      db.close();
    }
    return;
  }

  assert.ok(process.env.OPL_STATE_DIR, 'allowed probe requires an explicit state directory');
  const { db, paths } = openQueueDb();
  try {
    assert.equal(paths.state_dir, path.resolve(process.env.OPL_STATE_DIR));
  } finally {
    db.close();
  }
});
