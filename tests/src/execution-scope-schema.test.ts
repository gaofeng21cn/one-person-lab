import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { assertRepoJsonSchemaPayload } from '../../src/kernel/repo-json-schema.ts';
import { createWorkItemExecutionScopeSnapshot } from '../../src/modules/workspace/execution-scope.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const schemaRef = 'contracts/opl-framework/execution-scope-snapshot.schema.json';

function snapshot() {
  return createWorkItemExecutionScopeSnapshot({
    projectScopeId: 'project:019f87d3-f53e-7aa4-a1b8-a672730ea4b5',
    workspaceBindingId: 'binding-v1',
    domainId: 'medautoscience',
    workspaceRoot: '/tmp/dm-project',
    payload: { study_id: '001-dm-cvd-mortality-risk' },
    requirement: { kind: 'work_item', alias_fields: ['study_id'] },
  });
}

test('execution scope snapshot validates against the OPL-owned machine contract', () => {
  const validation = assertRepoJsonSchemaPayload({
    repoRoot,
    schemaRef,
    payload: snapshot(),
    label: 'execution scope snapshot',
  });
  assert.equal(validation.status, 'valid');
});

test('execution scope schema rejects partial or transport-extended snapshots', () => {
  const valid = snapshot();
  const { scope_digest: _scopeDigest, ...partial } = valid;
  assert.throws(
    () => assertRepoJsonSchemaPayload({
      repoRoot,
      schemaRef,
      payload: partial,
      label: 'partial execution scope snapshot',
    }),
    /failed JSON Schema validation/,
  );
  assert.throws(
    () => assertRepoJsonSchemaPayload({
      repoRoot,
      schemaRef,
      payload: { ...valid, workflow_id: 'wf-not-part-of-scope' },
      label: 'transport-extended execution scope snapshot',
    }),
    /failed JSON Schema validation/,
  );
});

test('execution scope schema binds a physical root to its exact attestation shape', () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-scope-schema-root-'));
  const canonicalWorkItemRoot = path.join(workspaceRoot, 'studies', 'study-001');
  fs.mkdirSync(canonicalWorkItemRoot, { recursive: true });
  try {
    const rooted = createWorkItemExecutionScopeSnapshot({
      projectScopeId: 'project:schema-root',
      workspaceBindingId: 'binding:schema-root',
      domainId: 'medautoscience',
      workspaceRoot,
      canonicalWorkItemRoot,
      payload: { study_id: 'study-001' },
      requirement: { kind: 'work_item', alias_fields: ['study_id'] },
    });
    assert.equal(assertRepoJsonSchemaPayload({
      repoRoot,
      schemaRef,
      payload: rooted,
      label: 'rooted execution scope snapshot',
    }).status, 'valid');
    assert.throws(
      () => assertRepoJsonSchemaPayload({
        repoRoot,
        schemaRef,
        payload: { ...rooted, canonical_work_item_root_identity: null },
        label: 'rooted execution scope without attestation',
      }),
      /failed JSON Schema validation/u,
    );
  } finally {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});
