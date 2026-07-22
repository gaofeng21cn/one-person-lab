import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import {
  assertSameExecutionScope,
  requireWorkItemExecutionScopeSnapshot,
} from '../workspace/public/standard-agent-action-runtime.ts';
import { requireFamilyRuntimeExecutionScope } from './family-runtime-execution-scope.ts';

type TemporalIdentityRecord = Record<string, unknown> & {
  workflow_id: string;
  domain_id: string;
  stage_id: string;
};

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function fail(message: string, details: Record<string, unknown>): never {
  throw new FrameworkContractError('contract_shape_invalid', message, details);
}

function memoIdentityFields(expected: TemporalIdentityRecord) {
  const stageAttemptId = optionalString(expected.stage_attempt_id);
  const stageRunId = optionalString(expected.stage_run_id);
  return {
    ...(stageAttemptId ? { stage_attempt_id: stageAttemptId } : {}),
    stage_run_id: stageRunId,
    domain_id: expected.domain_id,
    stage_id: expected.stage_id,
  };
}

const WORK_ITEM_MEMO_SCOPE_FIELDS = [
  'project_scope_id',
  'work_item_scope_id',
  'workspace_binding_id',
  'scope_digest',
] as const;

function memoHasWorkItemScope(memo: Record<string, unknown>) {
  return memo.scope_kind === 'work_item'
    || WORK_ITEM_MEMO_SCOPE_FIELDS.some((field) => memo[field] != null);
}

function memoMismatches(input: {
  memo: Record<string, unknown>;
  expectedFields: Record<string, unknown>;
  requirePresence: boolean;
}) {
  return Object.entries(input.expectedFields).flatMap(([field, expected]) => {
    const present = Object.prototype.hasOwnProperty.call(input.memo, field);
    if (!present && !input.requirePresence) return [];
    return present && input.memo[field] === expected
      ? []
      : [{ field, expected, actual: present ? input.memo[field] : null }];
  });
}

export function assertTemporalWorkflowMemoIdentity(input: {
  workflowId: string;
  memo?: Record<string, unknown>;
  expected: TemporalIdentityRecord;
  operation: string;
}) {
  if (input.workflowId !== input.expected.workflow_id) {
    fail('Temporal workflow identity does not match its runtime identity.', {
      failure_code: 'temporal_workflow_identity_mismatch',
      operation: input.operation,
      expected_workflow_id: input.expected.workflow_id,
      actual_workflow_id: input.workflowId,
    });
  }
  const memo = input.memo ?? {};
  if (input.expected.scope_kind === 'identity_unresolved' && memoHasWorkItemScope(memo)) {
    fail('Identity-unresolved runtime rows cannot consume a scoped Temporal workflow.', {
      failure_code: 'identity_unresolved_temporal_scope_present',
      operation: input.operation,
      workflow_id: input.workflowId,
    });
  }
  const requiresCompleteMemo = input.expected.scope_kind === 'work_item';
  const baseMismatches = memoMismatches({
    memo,
    expectedFields: memoIdentityFields(input.expected),
    requirePresence: requiresCompleteMemo,
  });
  if (baseMismatches.length > 0) {
    fail('Temporal workflow memo conflicts with its runtime identity.', {
      failure_code: 'temporal_workflow_memo_identity_mismatch',
      operation: input.operation,
      workflow_id: input.workflowId,
      mismatches: baseMismatches,
    });
  }
  if (input.expected.scope_kind === 'identity_unresolved') {
    return;
  }
  const expectedScope = requireFamilyRuntimeExecutionScope({
    scopeKind: input.expected.scope_kind,
    executionScope: input.expected.execution_scope,
    workspaceLocator: input.expected.workspace_locator as Record<string, unknown> | undefined,
    domainId: input.expected.domain_id,
    operation: input.operation,
  });
  const scopeFields = {
    scope_kind: expectedScope.scopeKind,
    project_scope_id: expectedScope.executionScope?.project_scope_id ?? null,
    work_item_scope_id: expectedScope.executionScope?.work_item_scope_id ?? null,
    workspace_binding_id: expectedScope.executionScope?.workspace_binding_id ?? null,
    scope_digest: expectedScope.executionScope?.scope_digest ?? null,
  };
  const scopeMismatches = memoMismatches({
    memo,
    expectedFields: scopeFields,
    requirePresence: expectedScope.scopeKind === 'work_item',
  });
  if (scopeMismatches.length > 0) {
    fail('Temporal workflow memo conflicts with its execution scope.', {
      failure_code: 'temporal_workflow_scope_mismatch',
      operation: input.operation,
      workflow_id: input.workflowId,
      mismatches: scopeMismatches,
    });
  }
}

export function assertTemporalStageAttemptQueryIdentity(input: {
  expected: TemporalIdentityRecord;
  query: Record<string, unknown>;
  operation: string;
}) {
  const mismatches = [
    ['stage_attempt_id', input.expected.stage_attempt_id, input.query.stage_attempt_id],
    ['stage_run_id', optionalString(input.expected.stage_run_id), optionalString(input.query.stage_run_id)],
    ['workflow_id', input.expected.workflow_id, input.query.workflow_id],
    ['domain_id', input.expected.domain_id, input.query.domain_id],
    ['stage_id', input.expected.stage_id, input.query.stage_id],
  ].flatMap(([field, expected, actual]) => expected === actual
    ? []
    : [{ field, expected: expected ?? null, actual: actual ?? null }]);
  if (mismatches.length > 0) {
    fail('Temporal StageAttempt query returned a different runtime identity.', {
      failure_code: 'temporal_stage_attempt_query_identity_mismatch',
      operation: input.operation,
      mismatches,
    });
  }
  if (input.expected.scope_kind === 'identity_unresolved') {
    if (input.query.execution_scope != null) {
      fail('Identity-unresolved StageAttempt cannot consume a scoped workflow result.', {
        failure_code: 'identity_unresolved_temporal_scope_present',
        operation: input.operation,
      });
    }
    return;
  }
  const expectedScope = requireFamilyRuntimeExecutionScope({
    scopeKind: input.expected.scope_kind,
    executionScope: input.expected.execution_scope,
    workspaceLocator: input.expected.workspace_locator as Record<string, unknown> | undefined,
    domainId: input.expected.domain_id,
    operation: input.operation,
  });
  const actualScope = requireFamilyRuntimeExecutionScope({
    scopeKind: input.query.scope_kind,
    executionScope: input.query.execution_scope,
    domainId: input.expected.domain_id,
    operation: input.operation,
    requireWorkspaceTransportCopy: false,
  });
  if (expectedScope.scopeKind !== actualScope.scopeKind) {
    fail('Temporal StageAttempt query returned a different scope kind.', {
      failure_code: 'temporal_stage_attempt_query_scope_mismatch',
      operation: input.operation,
      expected_scope_kind: expectedScope.scopeKind,
      actual_scope_kind: actualScope.scopeKind,
    });
  }
  if (expectedScope.executionScope && actualScope.executionScope) {
    assertSameExecutionScope(expectedScope.executionScope, actualScope.executionScope, {
      operation: input.operation,
      transport: 'temporal_stage_attempt_query',
    });
  } else if (expectedScope.executionScope || actualScope.executionScope) {
    fail('Temporal StageAttempt query execution scope presence is inconsistent.', {
      failure_code: 'temporal_stage_attempt_query_scope_mismatch',
      operation: input.operation,
    });
  }
}

export function requireTemporalCloseoutScopeDigest(input: {
  expectedScope: unknown;
  scopeDigest: unknown;
  operation: string;
}) {
  const scope = requireWorkItemExecutionScopeSnapshot(input.expectedScope);
  const scopeDigest = optionalString(input.scopeDigest);
  if (scopeDigest !== scope.scope_digest) {
    fail('Typed closeout execution scope does not match its StageAttempt.', {
      failure_code: scopeDigest ? 'typed_closeout_execution_scope_mismatch' : 'typed_closeout_execution_scope_missing',
      operation: input.operation,
      expected_scope_digest: scope.scope_digest,
      actual_scope_digest: scopeDigest,
    });
  }
  return scope.scope_digest;
}
