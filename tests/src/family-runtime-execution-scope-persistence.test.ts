import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { FrameworkContractError } from '../../src/kernel/contract-validation.ts';
import {
  executionScopeFromRow,
  normalizeRuntimeExecutionScopeWrite,
  persistRuntimeExecutionScope,
} from '../../src/modules/runway/family-runtime-execution-scope-persistence.ts';
import {
  createWorkItemExecutionScopeSnapshot,
  type WorkItemExecutionScopeSnapshot,
} from '../../src/modules/workspace/execution-scope.ts';

function executionScope(domainWorkItemId = 'study-001') {
  const canonicalWorkItemRoot = `/tmp/opl-scope-persistence-project/studies/${domainWorkItemId}`;
  fs.mkdirSync(canonicalWorkItemRoot, { recursive: true });
  return createWorkItemExecutionScopeSnapshot({
    projectScopeId: 'project:scope-persistence-test',
    workspaceBindingId: 'binding:scope-persistence-test',
    domainId: 'medautoscience',
    workspaceRoot: '/tmp/opl-scope-persistence-project',
    canonicalWorkItemRoot,
    inventoryDigest: `sha256:${'1'.repeat(64)}`,
    payload: { study_id: domainWorkItemId },
    requirement: { kind: 'work_item', alias_fields: ['study_id'] },
  });
}

function invalidSnapshots(scope: WorkItemExecutionScopeSnapshot) {
  const alternateScope = executionScope('study-002');
  return [
    {
      name: 'digest',
      value: { ...scope, scope_digest: `sha256:${'0'.repeat(64)}` },
      failureCode: 'execution_scope_digest_mismatch',
    },
    {
      name: 'derived work-item id',
      value: { ...alternateScope, work_item_scope_id: scope.work_item_scope_id },
      failureCode: 'work_item_scope_id_mismatch',
    },
    {
      name: 'exact shape',
      value: { ...scope, study_id: 'study-002' },
      message: /canonical exact shape/u,
    },
    {
      name: 'normalized workspace path',
      value: { ...scope, workspace_root: '/tmp/opl-scope-persistence-project/../opl-scope-persistence-project' },
      message: /normalized absolute path/u,
    },
    {
      name: 'contained work-item path',
      value: { ...scope, canonical_work_item_root: '/tmp/studies/study-002' },
      failureCode: 'work_item_root_escape',
    },
  ];
}

function matchesInvalidSnapshot(
  error: unknown,
  expected: { failureCode?: string; message?: RegExp },
) {
  assert.ok(error instanceof FrameworkContractError);
  if (expected.failureCode) assert.equal(error.details?.failure_code, expected.failureCode);
  if (expected.message) assert.match(error.message, expected.message);
  return true;
}

test('execution-scope persistence write rejects forged canonical snapshots', () => {
  const scope = executionScope();
  for (const invalid of invalidSnapshots(scope)) {
    assert.throws(
      () => normalizeRuntimeExecutionScopeWrite({
        domainId: 'medautoscience',
        scopeKind: 'work_item',
        executionScope: invalid.value as WorkItemExecutionScopeSnapshot,
      }),
      (error: unknown) => matchesInvalidSnapshot(error, invalid),
      invalid.name,
    );
  }
});

test('execution-scope persistence read revalidates stored snapshots before projection', () => {
  const db = new DatabaseSync(':memory:');
  try {
    const scope = executionScope();
    const normalized = normalizeRuntimeExecutionScopeWrite({
      domainId: 'medautoscience',
      scopeKind: 'work_item',
      executionScope: scope,
    });
    persistRuntimeExecutionScope(db, normalized, 'medautoscience');
    const selectRow = () => db.prepare(
      'SELECT * FROM execution_scopes WHERE scope_digest = ?',
    ).get(scope.scope_digest) as Record<string, unknown>;
    assert.deepEqual(executionScopeFromRow(selectRow()), scope);

    for (const invalid of invalidSnapshots(scope)) {
      db.prepare(
        'UPDATE execution_scopes SET execution_scope_json = ? WHERE scope_digest = ?',
      ).run(JSON.stringify(invalid.value), scope.scope_digest);
      assert.throws(
        () => executionScopeFromRow(selectRow()),
        (error: unknown) => matchesInvalidSnapshot(error, invalid),
        invalid.name,
      );
    }
  } finally {
    db.close();
  }
});
