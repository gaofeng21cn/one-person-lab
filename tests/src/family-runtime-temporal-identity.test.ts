import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { createWorkItemExecutionScopeSnapshot } from '../../src/modules/workspace/execution-scope.ts';
import { requireFamilyRuntimeExecutionScope } from '../../src/modules/runway/family-runtime-execution-scope.ts';
import {
  assertTemporalStageAttemptQueryIdentity,
  assertTemporalWorkflowMemoIdentity,
} from '../../src/modules/runway/family-runtime-temporal-identity.ts';
import {
  buildTemporalStageAttemptMemo,
  buildTemporalStageAttemptSearchAttributes,
} from '../../src/modules/runway/family-runtime-temporal-visibility.ts';
import { codexStageAttemptEnv } from '../../src/modules/runway/family-runtime-codex-stage-runner-parts/provider-env.ts';
import {
  normalizeTypedStageCloseoutPacket,
  validateCloseoutPacketForAttempt,
} from '../../src/modules/runway/family-runtime-codex-stage-runner-parts/closeout-normalization.ts';
import type { TemporalStageAttemptWorkflowInput } from '../../src/modules/runway/family-runtime-temporal.ts';

function scope(workItemId = 'study-001') {
  fs.mkdirSync(`/tmp/dm-runtime-test/studies/${workItemId}`, { recursive: true });
  return createWorkItemExecutionScopeSnapshot({
    projectScopeId: 'project:dm-runtime-test',
    workspaceBindingId: 'binding:dm-runtime-test',
    bindingVersionId: 'binding-version:dm-runtime-test',
    domainId: 'medautoscience',
    workspaceRoot: '/tmp/dm-runtime-test',
    canonicalWorkItemRoot: `/tmp/dm-runtime-test/studies/${workItemId}`,
    inventoryDigest: `sha256:${'a'.repeat(64)}`,
    payload: { study_id: workItemId },
    requirement: { kind: 'work_item', alias_fields: ['study_id'] },
  });
}

function attempt(workItemId = 'study-001') {
  const executionScope = scope(workItemId);
  return {
    stage_attempt_id: `sat-${workItemId}`,
    stage_run_id: `sr-${workItemId}`,
    workflow_id: `wf-${workItemId}`,
    scope_kind: 'work_item',
    execution_scope: executionScope,
    domain_id: 'medautoscience',
    stage_id: 'baseline',
    workspace_locator: {
      workspace_root: executionScope.workspace_root,
      stage_run_id: 'sr-poisoned-locator',
      execution_scope: executionScope,
    },
    source_fingerprint: `sha256:${'b'.repeat(64)}`,
    executor_kind: 'codex_cli',
  } as const;
}

function code(error: unknown) {
  return (error as { details?: Record<string, unknown> }).details?.failure_code;
}

function closeout(stageAttemptId: string, extra: Record<string, unknown> = {}) {
  return normalizeTypedStageCloseoutPacket({
    surface_kind: 'stage_attempt_closeout_packet',
    stage_attempt_id: stageAttemptId,
    closeout_refs: ['artifact:baseline'],
    ...extra,
  });
}

test('Temporal work-item memo and visibility carry the complete execution identity', () => {
  const input = attempt() as unknown as TemporalStageAttemptWorkflowInput;
  const memo = buildTemporalStageAttemptMemo(input);
  const attributes = buildTemporalStageAttemptSearchAttributes(input);

  assert.deepEqual({
    stage_attempt_id: memo.stage_attempt_id,
    stage_run_id: memo.stage_run_id,
    scope_kind: memo.scope_kind,
    project_scope_id: memo.project_scope_id,
    work_item_scope_id: memo.work_item_scope_id,
    workspace_binding_id: memo.workspace_binding_id,
    scope_digest: memo.scope_digest,
    domain_id: memo.domain_id,
    stage_id: memo.stage_id,
    source_fingerprint: memo.source_fingerprint,
  }, {
    stage_attempt_id: input.stage_attempt_id,
    stage_run_id: input.stage_run_id,
    scope_kind: 'work_item',
    project_scope_id: input.execution_scope?.project_scope_id,
    work_item_scope_id: input.execution_scope?.work_item_scope_id,
    workspace_binding_id: input.execution_scope?.workspace_binding_id,
    scope_digest: input.execution_scope?.scope_digest,
    domain_id: input.domain_id,
    stage_id: input.stage_id,
    source_fingerprint: input.source_fingerprint,
  });
  assert.deepEqual(attributes.OplStageRunId, [input.stage_run_id]);
  assert.deepEqual(attributes.OplWorkItemScopeId, [input.execution_scope?.work_item_scope_id]);
  assert.deepEqual(Object.keys(attributes).sort(), [
    'OplStageAttemptId',
    'OplStageRunId',
    'OplWorkItemScopeId',
  ]);
  assertTemporalWorkflowMemoIdentity({
    workflowId: input.workflow_id,
    memo,
    expected: input as unknown as Record<string, unknown> & {
      workflow_id: string;
      domain_id: string;
      stage_id: string;
    },
    operation: 'test_work_item_memo',
  });
});

test('Temporal memo compatibility permits absent legacy domain fields but rejects conflicts', () => {
  const legacyAttempt = {
    stage_attempt_id: 'sat-legacy',
    stage_run_id: null,
    workflow_id: 'wf-legacy',
    scope_kind: 'domain',
    execution_scope: null,
    domain_id: 'redcube',
    stage_id: 'artifact_creation',
    workspace_locator: { workspace_root: '/tmp/redcube' },
  };
  assertTemporalWorkflowMemoIdentity({
    workflowId: legacyAttempt.workflow_id,
    memo: {
      stage_attempt_id: legacyAttempt.stage_attempt_id,
      domain_id: legacyAttempt.domain_id,
      stage_id: legacyAttempt.stage_id,
    },
    expected: legacyAttempt,
    operation: 'test_legacy_attempt',
  });
  assertTemporalWorkflowMemoIdentity({
    workflowId: 'wf-legacy-stage-run',
    memo: undefined,
    expected: {
      workflow_id: 'wf-legacy-stage-run',
      stage_run_id: 'sr-legacy',
      scope_kind: 'domain',
      execution_scope: null,
      domain_id: 'redcube',
      stage_id: 'artifact_creation',
      workspace_locator: { workspace_root: '/tmp/redcube' },
    },
    operation: 'test_legacy_stage_run',
  });
  assert.throws(() => assertTemporalWorkflowMemoIdentity({
    workflowId: legacyAttempt.workflow_id,
    memo: { stage_attempt_id: 'sat-other' },
    expected: legacyAttempt,
    operation: 'test_legacy_conflict',
  }), (error: unknown) => code(error) === 'temporal_workflow_memo_identity_mismatch');
});

test('Temporal work-item memo is mandatory and unresolved identities reject scoped workflows', () => {
  const expected = attempt();
  assert.throws(() => assertTemporalWorkflowMemoIdentity({
    workflowId: expected.workflow_id,
    memo: {},
    expected,
    operation: 'test_missing_work_item_memo',
  }), (error: unknown) => code(error) === 'temporal_workflow_memo_identity_mismatch');
  assert.throws(() => assertTemporalWorkflowMemoIdentity({
    workflowId: 'wf-unresolved',
    memo: { scope_kind: 'work_item' },
    expected: {
      workflow_id: 'wf-unresolved',
      scope_kind: 'identity_unresolved',
      domain_id: 'medautoscience',
      stage_id: 'baseline',
    },
    operation: 'test_unresolved_scope',
  }), (error: unknown) => code(error) === 'identity_unresolved_temporal_scope_present');
});

test('Temporal query identity rejects a different StageRun or work-item scope', () => {
  const expected = attempt();
  const validQuery = {
    ...expected,
    workspace_locator: undefined,
  };
  assertTemporalStageAttemptQueryIdentity({
    expected,
    query: validQuery,
    operation: 'test_query_identity',
  });
  assert.throws(() => assertTemporalStageAttemptQueryIdentity({
    expected,
    query: { ...validQuery, stage_run_id: 'sr-other' },
    operation: 'test_query_stage_run_mismatch',
  }), (error: unknown) => code(error) === 'temporal_stage_attempt_query_identity_mismatch');
  assert.throws(() => assertTemporalStageAttemptQueryIdentity({
    expected,
    query: { ...validQuery, execution_scope: scope('study-002') },
    operation: 'test_query_scope_mismatch',
  }), (error: unknown) => code(error) === 'execution_scope_mismatch');
});

test('Codex environment uses persisted Attempt identity instead of locator guesses', () => {
  const expected = attempt();
  const env = codexStageAttemptEnv({
    attempt: expected,
    workspaceRoot: expected.execution_scope.workspace_root,
  });
  assert.deepEqual({
    OPL_STAGE_ATTEMPT_ID: env.OPL_STAGE_ATTEMPT_ID,
    OPL_STAGE_RUN_ID: env.OPL_STAGE_RUN_ID,
    OPL_PROJECT_SCOPE_ID: env.OPL_PROJECT_SCOPE_ID,
    OPL_WORK_ITEM_SCOPE_ID: env.OPL_WORK_ITEM_SCOPE_ID,
    OPL_WORKSPACE_BINDING_ID: env.OPL_WORKSPACE_BINDING_ID,
    OPL_BINDING_VERSION_ID: env.OPL_BINDING_VERSION_ID,
    OPL_SCOPE_DIGEST: env.OPL_SCOPE_DIGEST,
    OPL_DOMAIN_WORK_ITEM_ID: env.OPL_DOMAIN_WORK_ITEM_ID,
  }, {
    OPL_STAGE_ATTEMPT_ID: expected.stage_attempt_id,
    OPL_STAGE_RUN_ID: expected.stage_run_id,
    OPL_PROJECT_SCOPE_ID: expected.execution_scope.project_scope_id,
    OPL_WORK_ITEM_SCOPE_ID: expected.execution_scope.work_item_scope_id,
    OPL_WORKSPACE_BINDING_ID: expected.execution_scope.workspace_binding_id,
    OPL_BINDING_VERSION_ID: expected.execution_scope.binding_version_id,
    OPL_SCOPE_DIGEST: expected.execution_scope.scope_digest,
    OPL_DOMAIN_WORK_ITEM_ID: expected.execution_scope.domain_work_item_id,
  });
});

test('typed closeout rejects missing, cross-scope, and forged work-item bindings', () => {
  const expected = attempt();
  const missing = validateCloseoutPacketForAttempt({
    closeoutPacket: closeout(expected.stage_attempt_id),
    attempt: expected,
  });
  assert.equal(missing.rejection?.reason, 'execution_identity_missing');

  const crossScope = validateCloseoutPacketForAttempt({
    closeoutPacket: closeout(expected.stage_attempt_id, {
      stage_run_id: expected.stage_run_id,
      scope_digest: scope('study-002').scope_digest,
    }),
    attempt: expected,
  });
  assert.equal(crossScope.rejection?.reason, 'execution_scope_mismatch');

  assert.throws(() => closeout(expected.stage_attempt_id, {
    execution_scope: {
      ...expected.execution_scope,
      canonical_work_item_root: '/tmp/dm-runtime-test/studies/study-002',
    },
  }));

  const accepted = validateCloseoutPacketForAttempt({
    closeoutPacket: closeout(expected.stage_attempt_id, {
      stage_run_id: expected.stage_run_id,
      scope_digest: expected.execution_scope.scope_digest,
    }),
    attempt: expected,
  });
  assert.equal(accepted.rejection, null);
  assert.equal(accepted.closeoutPacket?.scope_digest, expected.execution_scope.scope_digest);
});

test('workspace locator scope cannot replace missing direct runtime authority', () => {
  const executionScope = scope();
  assert.throws(() => requireFamilyRuntimeExecutionScope({
    scopeKind: 'work_item',
    executionScope: null,
    workspaceLocator: {
      workspace_root: executionScope.workspace_root,
      execution_scope: executionScope,
    },
    domainId: executionScope.domain_id,
    operation: 'test_transport_only_scope',
  }), (error: unknown) => code(error) === 'execution_scope_transport_without_authority');
});
