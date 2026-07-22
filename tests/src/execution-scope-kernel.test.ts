import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { FrameworkContractError } from '../../src/kernel/contract-validation.ts';
import {
  assertSameExecutionScope,
  createWorkItemExecutionScopeSnapshot,
  deriveLegacyProjectScopeId,
  deriveWorkItemScopeId,
  executionScopeEnvironment,
  requireWorkItemExecutionScopeSnapshot,
  resolveWorkItemIdentity,
} from '../../src/modules/workspace/execution-scope.ts';

test('work-item identity resolves equal aliases once and rejects conflicting aliases', () => {
  assert.deepEqual(
    resolveWorkItemIdentity({
      payload: {
        study_id: '001-dm-cvd-mortality-risk',
        work_item_id: '001-dm-cvd-mortality-risk',
      },
      aliasFields: ['study_id', 'work_item_id'],
    }),
    {
      domain_work_item_id: '001-dm-cvd-mortality-risk',
      source_alias_fields: ['study_id', 'work_item_id'],
      alias_values: {
        study_id: '001-dm-cvd-mortality-risk',
        work_item_id: '001-dm-cvd-mortality-risk',
      },
    },
  );

  assert.throws(
    () => resolveWorkItemIdentity({
      payload: { study_id: 'study-a', work_item_id: 'study-b' },
      aliasFields: ['study_id', 'work_item_id'],
    }),
    (error: unknown) => {
      assert.ok(error instanceof FrameworkContractError);
      assert.equal(error.details?.failure_code, 'work_item_identity_conflict');
      return true;
    },
  );
});

test('work-item identity is mandatory and can be compared with a host binding', () => {
  assert.throws(
    () => resolveWorkItemIdentity({ payload: {}, aliasFields: ['study_id'] }),
    (error: unknown) => {
      assert.ok(error instanceof FrameworkContractError);
      assert.equal(error.details?.failure_code, 'work_item_identity_missing');
      return true;
    },
  );
  assert.throws(
    () => resolveWorkItemIdentity({
      payload: { mission: { study_id: 'study-a' } },
      aliasFields: ['mission.study_id'],
      expectedDomainWorkItemId: 'study-b',
    }),
    (error: unknown) => {
      assert.ok(error instanceof FrameworkContractError);
      assert.equal(error.details?.failure_code, 'work_item_host_binding_conflict');
      return true;
    },
  );
});

test('work-item scope identity is stable across workspace binding versions', () => {
  const identity = {
    projectScopeId: 'project:019f87d3-f53e-7aa4-a1b8-a672730ea4b5',
    domainId: 'medautoscience',
    domainWorkItemId: '001-dm-cvd-mortality-risk',
  };
  assert.equal(deriveWorkItemScopeId(identity), deriveWorkItemScopeId(identity));
  assert.notEqual(
    deriveWorkItemScopeId(identity),
    deriveWorkItemScopeId({ ...identity, domainWorkItemId: '002-dm-china-us-mortality-attribution' }),
  );

  const first = createWorkItemExecutionScopeSnapshot({
    ...identity,
    workspaceBindingId: 'binding-v1',
    workspaceRoot: '/tmp/dm-project-before-move',
    payload: { study_id: identity.domainWorkItemId },
    requirement: { kind: 'work_item', alias_fields: ['study_id'] },
  });
  const moved = createWorkItemExecutionScopeSnapshot({
    ...identity,
    workspaceBindingId: 'binding-v2',
    workspaceRoot: '/tmp/dm-project-after-move',
    payload: { study_id: identity.domainWorkItemId },
    requirement: { kind: 'work_item', alias_fields: ['study_id'] },
  });
  assert.equal(first.work_item_scope_id, moved.work_item_scope_id);
  assert.notEqual(first.scope_digest, moved.scope_digest);
});

test('work-item scope canonicalizes Standard Agent domain aliases', () => {
  const fromAgentAlias = createWorkItemExecutionScopeSnapshot({
    projectScopeId: 'project:019f87d3-f53e-7aa4-a1b8-a672730ea4b5',
    workspaceBindingId: 'binding-v1',
    domainId: 'mas',
    workspaceRoot: '/tmp/dm-project',
    payload: { study_id: 'study-a' },
    requirement: { kind: 'work_item', alias_fields: ['study_id'] },
  });
  const fromRuntimeDomain = createWorkItemExecutionScopeSnapshot({
    projectScopeId: 'project:019f87d3-f53e-7aa4-a1b8-a672730ea4b5',
    workspaceBindingId: 'binding-v1',
    domainId: 'medautoscience',
    workspaceRoot: '/tmp/dm-project',
    payload: { study_id: 'study-a' },
    requirement: { kind: 'work_item', alias_fields: ['study_id'] },
  });

  assert.equal(fromAgentAlias.domain_id, 'medautoscience');
  assert.equal(fromAgentAlias.work_item_scope_id, fromRuntimeDomain.work_item_scope_id);
  assert.equal(fromAgentAlias.scope_digest, fromRuntimeDomain.scope_digest);
  assert.throws(
    () => requireWorkItemExecutionScopeSnapshot({
      ...fromRuntimeDomain,
      domain_id: 'mas',
    }),
    (error: unknown) => {
      assert.ok(error instanceof FrameworkContractError);
      assert.equal(error.details?.failure_code, 'execution_scope_domain_not_canonical');
      return true;
    },
  );
});

test('scope snapshots reject root escape and cross-scope consumption', () => {
  const common = {
    projectScopeId: 'project:019f87d3-f53e-7aa4-a1b8-a672730ea4b5',
    workspaceBindingId: 'binding-v1',
    domainId: 'medautoscience',
    workspaceRoot: '/tmp/dm-project',
    requirement: { kind: 'work_item', alias_fields: ['study_id'] } as const,
  };
  assert.throws(
    () => createWorkItemExecutionScopeSnapshot({
      ...common,
      payload: { study_id: 'study-a' },
      canonicalWorkItemRoot: '../other-project',
    }),
    (error: unknown) => {
      assert.ok(error instanceof FrameworkContractError);
      assert.equal(error.details?.failure_code, 'work_item_root_escape');
      return true;
    },
  );

  const studyA = createWorkItemExecutionScopeSnapshot({
    ...common,
    payload: { study_id: 'study-a' },
  });
  const studyB = createWorkItemExecutionScopeSnapshot({
    ...common,
    payload: { study_id: 'study-b' },
  });
  assert.throws(
    () => assertSameExecutionScope(studyA, studyB, { operation: 'artifact_closeout' }),
    (error: unknown) => {
      assert.ok(error instanceof FrameworkContractError);
      assert.equal(error.details?.failure_code, 'execution_scope_mismatch');
      return true;
    },
  );
});

test('scope digest freezes the physical workspace and work-item root identity', () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-execution-scope-root-'));
  const canonicalWorkItemRoot = path.join(workspaceRoot, 'studies', 'study-a');
  fs.mkdirSync(canonicalWorkItemRoot, { recursive: true });
  try {
    const scope = createWorkItemExecutionScopeSnapshot({
      projectScopeId: 'project:root-attestation',
      workspaceBindingId: 'binding:root-attestation',
      domainId: 'medautoscience',
      workspaceRoot,
      canonicalWorkItemRoot,
      payload: { study_id: 'study-a' },
      requirement: { kind: 'work_item', alias_fields: ['study_id'] },
    });
    assert.equal(scope.canonical_work_item_root_identity?.surface_kind, 'opl_work_item_root_identity');
    assert.match(scope.canonical_work_item_root_identity?.work_item_inode ?? '', /^[0-9]+$/u);

    const forgedIdentity = structuredClone(scope);
    forgedIdentity.canonical_work_item_root_identity!.work_item_inode = String(
      BigInt(forgedIdentity.canonical_work_item_root_identity!.work_item_inode) + 1n,
    );
    assert.throws(
      () => requireWorkItemExecutionScopeSnapshot(forgedIdentity),
      (error: unknown) => error instanceof FrameworkContractError
        && error.details?.failure_code === 'execution_scope_digest_mismatch',
    );

    const missingIdentity = structuredClone(scope) as Record<string, unknown>;
    delete missingIdentity.canonical_work_item_root_identity;
    assert.throws(
      () => requireWorkItemExecutionScopeSnapshot(missingIdentity),
      /canonical exact shape/u,
    );

    const rootless = createWorkItemExecutionScopeSnapshot({
      projectScopeId: 'project:root-attestation',
      workspaceBindingId: 'binding:root-attestation',
      domainId: 'medautoscience',
      workspaceRoot,
      payload: { study_id: 'study-rootless' },
      requirement: { kind: 'work_item', alias_fields: ['study_id'] },
    });
    assert.equal(rootless.canonical_work_item_root_identity, null);
    assert.throws(
      () => requireWorkItemExecutionScopeSnapshot({
        ...rootless,
        canonical_work_item_root_identity: scope.canonical_work_item_root_identity,
      }),
      (error: unknown) => error instanceof FrameworkContractError
        && error.details?.failure_code === 'execution_scope_root_identity_without_root',
    );
  } finally {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('scope environment exports only the canonical host-resolved identity', () => {
  const scope = createWorkItemExecutionScopeSnapshot({
    projectScopeId: 'project:019f87d3-f53e-7aa4-a1b8-a672730ea4b5',
    workspaceBindingId: 'binding-v1',
    domainId: 'medautoscience',
    workspaceRoot: '/tmp/dm-project',
    payload: { study_id: 'study-a' },
    requirement: { kind: 'work_item', alias_fields: ['study_id'] },
  });
  assert.deepEqual(executionScopeEnvironment(scope), {
    OPL_DOMAIN_ID: scope.domain_id,
    OPL_PROJECT_SCOPE_ID: scope.project_scope_id,
    OPL_WORK_ITEM_SCOPE_ID: scope.work_item_scope_id,
    OPL_WORK_ITEM_ID: scope.domain_work_item_id,
    OPL_WORKSPACE_BINDING_ID: scope.workspace_binding_id,
    OPL_BINDING_VERSION_ID: scope.binding_version_id,
    OPL_SCOPE_DIGEST: scope.scope_digest,
    OPL_DOMAIN_WORK_ITEM_ID: scope.domain_work_item_id,
  });
});

test('scope snapshots are revalidated from their immutable identity and exact digest', () => {
  const scope = createWorkItemExecutionScopeSnapshot({
    projectScopeId: 'project:019f87d3-f53e-7aa4-a1b8-a672730ea4b5',
    workspaceBindingId: 'binding-v1',
    domainId: 'medautoscience',
    workspaceRoot: '/tmp/dm-project',
    payload: { study_id: 'study-a' },
    requirement: { kind: 'work_item', alias_fields: ['study_id'] },
  });
  assert.deepEqual(requireWorkItemExecutionScopeSnapshot(scope), scope);
  assert.throws(
    () => requireWorkItemExecutionScopeSnapshot({ ...scope, domain_work_item_id: 'study-b' }),
    (error: unknown) => {
      assert.ok(error instanceof FrameworkContractError);
      assert.equal(error.details?.failure_code, 'work_item_scope_id_mismatch');
      return true;
    },
  );
  assert.throws(
    () => requireWorkItemExecutionScopeSnapshot({ ...scope, unexpected: true }),
    /canonical exact shape/u,
  );
});

test('legacy workspace bindings receive a stable path-independent project scope', () => {
  const first = deriveLegacyProjectScopeId({ bindingId: 'binding-legacy', projectId: 'medautoscience' });
  const second = deriveLegacyProjectScopeId({ bindingId: 'binding-legacy', projectId: 'medautoscience' });
  assert.equal(first, second);
  assert.match(first, /^project:[a-f0-9]{64}$/u);
});
