import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { FrameworkContractError } from '../../src/kernel/contract-validation.ts';
import {
  bindTrustedCliFamilyRuntimeIngressIdentity,
} from '../../src/modules/runway/family-runtime-execution-scope.ts';
import { createWorkItemExecutionScopeSnapshot } from '../../src/modules/workspace/execution-scope.ts';

function scope(workItemId = 'study-001') {
  fs.mkdirSync(`/tmp/trusted-cli-test/studies/${workItemId}`, { recursive: true });
  return createWorkItemExecutionScopeSnapshot({
    projectScopeId: 'project:trusted-cli-test',
    workspaceBindingId: 'binding:trusted-cli-test',
    bindingVersionId: 'binding-version:trusted-cli-test',
    domainId: 'medautoscience',
    workspaceRoot: '/tmp/trusted-cli-test',
    canonicalWorkItemRoot: `/tmp/trusted-cli-test/studies/${workItemId}`,
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
    scope_kind: 'work_item',
    scope_digest: executionScope.scope_digest,
    execution_scope: executionScope,
    identity_state: 'resolved',
    domain_id: executionScope.domain_id,
    workspace_locator: {
      workspace_root: executionScope.workspace_root,
      execution_scope: executionScope,
    },
  };
}

function failureCode(error: unknown) {
  return error instanceof FrameworkContractError ? error.details?.failure_code : null;
}

test('trusted CLI binds an exact persisted Attempt to resume without manual identity fields', () => {
  const currentAttempt = attempt();
  const payload = bindTrustedCliFamilyRuntimeIngressIdentity({
    runtimeIdentity: currentAttempt,
    ingressPayload: { reason: 'operator_retry' },
    operation: 'test_trusted_cli_resume',
  });

  assert.deepEqual(payload, {
    reason: 'operator_retry',
    stage_attempt_id: currentAttempt.stage_attempt_id,
    stage_run_id: currentAttempt.stage_run_id,
    scope_kind: 'work_item',
    scope_digest: currentAttempt.execution_scope.scope_digest,
  });
});

test('trusted CLI refuses user identity conflicts instead of overwriting them', () => {
  const currentAttempt = attempt();
  const conflicts = [
    { stage_attempt_id: 'sat-study-002' },
    { stage_run_id: 'sr-study-002' },
    { scope_kind: 'domain' },
    { scope_digest: scope('study-002').scope_digest },
    { execution_scope: scope('study-002') },
  ];

  for (const conflict of conflicts) {
    assert.throws(() => bindTrustedCliFamilyRuntimeIngressIdentity({
      runtimeIdentity: currentAttempt,
      ingressPayload: { reason: 'operator_retry', ...conflict },
      operation: 'test_trusted_cli_conflict',
    }), (error: unknown) => {
      assert.ok([
        'runtime_ingress_identity_mismatch',
        'runtime_ingress_execution_scope_mismatch',
        'execution_scope_mismatch',
      ].includes(String(failureCode(error))));
      return true;
    });
  }
});

test('trusted CLI cannot resume an identity-unresolved persisted Attempt', () => {
  const currentAttempt = {
    ...attempt(),
    identity_state: 'identity_unresolved',
  };
  assert.throws(() => bindTrustedCliFamilyRuntimeIngressIdentity({
    runtimeIdentity: currentAttempt,
    ingressPayload: { reason: 'operator_retry' },
    operation: 'test_trusted_cli_unresolved',
  }), (error: unknown) => failureCode(error) === 'runtime_ingress_identity_unresolved');
});
