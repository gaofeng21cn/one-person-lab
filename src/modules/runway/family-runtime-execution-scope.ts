import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import {
  assertSameExecutionScope,
  requireWorkItemExecutionScopeSnapshot,
  type WorkItemExecutionScopeSnapshot,
} from '../workspace/public/standard-agent-action-runtime.ts';

export type FamilyRuntimeExecutionScopeKind = 'work_item' | 'domain' | 'system';

function fail(message: string, details: Record<string, unknown> = {}): never {
  throw new FrameworkContractError('contract_shape_invalid', message, details);
}

function normalizedScopeKind(value: unknown, hasExecutionScope: boolean): FamilyRuntimeExecutionScopeKind {
  if (value === undefined || value === null || value === '') {
    return hasExecutionScope ? 'work_item' : 'domain';
  }
  if (value === 'work_item' || value === 'domain' || value === 'system') return value;
  return fail('Family runtime execution scope kind is invalid.', {
    scope_kind: value,
    allowed_scope_kinds: ['work_item', 'domain', 'system'],
  });
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function requireFamilyRuntimeExecutionScope(input: {
  scopeKind?: unknown;
  executionScope?: unknown;
  workspaceLocator?: Record<string, unknown> | null;
  domainId?: string | null;
  operation: string;
  requireWorkspaceTransportCopy?: boolean;
}) {
  const directScope = input.executionScope === undefined || input.executionScope === null
    ? null
    : requireWorkItemExecutionScopeSnapshot(input.executionScope);
  const scopeKind = normalizedScopeKind(input.scopeKind, Boolean(directScope));
  const workspaceLocator = input.workspaceLocator ?? null;
  const transportValue = workspaceLocator?.execution_scope;
  const transportScope = transportValue === undefined || transportValue === null
    ? null
    : requireWorkItemExecutionScopeSnapshot(transportValue);
  if (transportScope && !directScope) {
    fail('Workspace locator execution scope cannot become runtime authority.', {
      failure_code: 'execution_scope_transport_without_authority',
      operation: input.operation,
      scope_digest: transportScope.scope_digest,
    });
  }
  if ((scopeKind === 'work_item' && !directScope) || (scopeKind !== 'work_item' && directScope)) {
    fail('Family runtime execution scope kind conflicts with its canonical snapshot.', {
      failure_code: 'execution_scope_kind_mismatch',
      operation: input.operation,
      scope_kind: scopeKind,
      execution_scope_present: Boolean(directScope),
    });
  }
  if (directScope && !transportScope && input.requireWorkspaceTransportCopy !== false) {
    fail('Work-item execution scope is missing from its workspace transport copy.', {
      failure_code: 'execution_scope_transport_missing',
      operation: input.operation,
      scope_digest: directScope.scope_digest,
    });
  }
  if (directScope && transportScope) {
    assertSameExecutionScope(directScope, transportScope, {
      operation: input.operation,
      transport: 'workspace_locator.execution_scope',
    });
  }
  if (directScope && input.domainId?.trim() && directScope.domain_id !== input.domainId.trim()) {
    fail('Execution scope domain does not match the runtime domain.', {
      failure_code: 'execution_scope_domain_mismatch',
      operation: input.operation,
      scope_domain_id: directScope.domain_id,
      runtime_domain_id: input.domainId.trim(),
    });
  }
  if (directScope && workspaceLocator) {
    const workspaceRoot = typeof workspaceLocator.workspace_root === 'string'
      ? workspaceLocator.workspace_root.trim()
      : typeof workspaceLocator.repo_root === 'string'
        ? workspaceLocator.repo_root.trim()
        : '';
    if (workspaceRoot && workspaceRoot !== directScope.workspace_root) {
      fail('Execution scope workspace does not match the runtime workspace locator.', {
        failure_code: 'execution_scope_workspace_mismatch',
        operation: input.operation,
        scope_workspace_root: directScope.workspace_root,
        workspace_root: workspaceRoot,
      });
    }
  }
  return {
    scopeKind,
    executionScope: directScope,
  } as const;
}

export function requireFamilyRuntimeIngressIdentity(input: {
  runtimeIdentity: Record<string, unknown>;
  ingressIdentity: Record<string, unknown>;
  operation: string;
}) {
  const identityState = optionalString(input.runtimeIdentity.identity_state);
  const persistedScopeKind = optionalString(input.runtimeIdentity.scope_kind);
  if (
    identityState === 'identity_unresolved'
    || identityState === 'quarantined'
    || persistedScopeKind === 'identity_unresolved'
  ) {
    fail('Identity-unresolved runtime rows cannot accept mutating ingress.', {
      failure_code: 'runtime_ingress_identity_unresolved',
      operation: input.operation,
      stage_attempt_id: optionalString(input.runtimeIdentity.stage_attempt_id),
      identity_state: identityState ?? 'identity_unresolved',
      scope_kind: persistedScopeKind ?? 'identity_unresolved',
    });
  }
  const workspaceLocator = input.runtimeIdentity.workspace_locator;
  const expectedScope = requireFamilyRuntimeExecutionScope({
    scopeKind: input.runtimeIdentity.scope_kind,
    executionScope: input.runtimeIdentity.execution_scope,
    workspaceLocator: workspaceLocator && typeof workspaceLocator === 'object' && !Array.isArray(workspaceLocator)
      ? workspaceLocator as Record<string, unknown>
      : undefined,
    domainId: optionalString(input.runtimeIdentity.domain_id),
    operation: input.operation,
  });
  const expectedAttemptId = optionalString(input.runtimeIdentity.stage_attempt_id);
  const expectedStageRunId = optionalString(input.runtimeIdentity.stage_run_id);
  const actualAttemptId = optionalString(input.ingressIdentity.stage_attempt_id);
  const actualStageRunId = optionalString(input.ingressIdentity.stage_run_id);
  const actualScopeKind = optionalString(input.ingressIdentity.scope_kind);
  const requiredIdentityFields = expectedScope.scopeKind === 'work_item'
    ? [
        ...(!actualAttemptId ? ['stage_attempt_id'] : []),
        ...(!actualStageRunId ? ['stage_run_id'] : []),
      ]
    : [];
  if (requiredIdentityFields.length > 0) {
    fail('Work-item runtime ingress is missing its exact Attempt lineage.', {
      failure_code: 'runtime_ingress_identity_missing',
      operation: input.operation,
      missing_fields: requiredIdentityFields,
      expected_stage_attempt_id: expectedAttemptId,
      expected_stage_run_id: expectedStageRunId,
    });
  }
  const identityMismatches = [
    ...(actualAttemptId && expectedAttemptId !== actualAttemptId
      ? [{ field: 'stage_attempt_id', expected: expectedAttemptId, actual: actualAttemptId }]
      : []),
    ...(actualStageRunId && expectedStageRunId !== actualStageRunId
      ? [{ field: 'stage_run_id', expected: expectedStageRunId, actual: actualStageRunId }]
      : []),
    ...(actualScopeKind && expectedScope.scopeKind !== actualScopeKind
      ? [{ field: 'scope_kind', expected: expectedScope.scopeKind, actual: actualScopeKind }]
      : []),
  ];
  if (identityMismatches.length > 0) {
    fail('Runtime ingress targets a different Attempt lineage.', {
      failure_code: 'runtime_ingress_identity_mismatch',
      operation: input.operation,
      mismatches: identityMismatches,
    });
  }
  const ingressScopeValue = input.ingressIdentity.execution_scope;
  const ingressScope = ingressScopeValue === undefined || ingressScopeValue === null
    ? null
    : requireWorkItemExecutionScopeSnapshot(ingressScopeValue);
  const ingressDigest = optionalString(input.ingressIdentity.scope_digest)
    ?? ingressScope?.scope_digest
    ?? null;
  if (expectedScope.executionScope) {
    if (!ingressDigest) {
      fail('Work-item runtime ingress is missing its execution scope binding.', {
        failure_code: 'runtime_ingress_execution_scope_missing',
        operation: input.operation,
        expected_scope_digest: expectedScope.executionScope.scope_digest,
      });
    }
    if (ingressDigest !== expectedScope.executionScope.scope_digest) {
      fail('Runtime ingress execution scope does not match its persisted Attempt.', {
        failure_code: 'runtime_ingress_execution_scope_mismatch',
        operation: input.operation,
        expected_scope_digest: expectedScope.executionScope.scope_digest,
        actual_scope_digest: ingressDigest,
      });
    }
    if (ingressScope) {
      assertSameExecutionScope(expectedScope.executionScope, ingressScope, {
        operation: input.operation,
        transport: 'runtime_mutation_ingress',
      });
    }
  } else if (ingressScope || ingressDigest || input.ingressIdentity.scope_kind === 'work_item') {
    fail('A non-work-item runtime row cannot consume work-item scoped ingress.', {
      failure_code: 'runtime_ingress_execution_scope_mismatch',
      operation: input.operation,
      expected_scope_kind: expectedScope.scopeKind,
      actual_scope_digest: ingressDigest,
    });
  }
  return {
    scopeKind: expectedScope.scopeKind,
    executionScope: expectedScope.executionScope,
    stageAttemptId: expectedAttemptId,
    stageRunId: expectedStageRunId,
  } as const;
}

/**
 * The local CLI has already resolved one exact persisted Attempt row. It may
 * therefore add that row's immutable transport identity to an operator's
 * business payload. Other ingress adapters must supply and validate their own
 * identity transport instead of calling this helper.
 */
export function bindTrustedCliFamilyRuntimeIngressIdentity(input: {
  runtimeIdentity: Record<string, unknown>;
  ingressPayload: Record<string, unknown>;
  operation: string;
}) {
  const runtimeScope = input.runtimeIdentity.execution_scope;
  const runtimeScopeRecord = runtimeScope && typeof runtimeScope === 'object' && !Array.isArray(runtimeScope)
    ? runtimeScope as Record<string, unknown>
    : null;
  const authoritativeIdentity = {
    stage_attempt_id: optionalString(input.runtimeIdentity.stage_attempt_id),
    stage_run_id: optionalString(input.runtimeIdentity.stage_run_id),
    scope_kind: optionalString(input.runtimeIdentity.scope_kind),
    scope_digest: optionalString(input.runtimeIdentity.scope_digest)
      ?? optionalString(runtimeScopeRecord?.scope_digest),
  };
  const candidate = { ...input.ingressPayload };
  for (const [field, value] of Object.entries(authoritativeIdentity)) {
    if (
      value
      && (candidate[field] === undefined || candidate[field] === null || candidate[field] === '')
    ) {
      candidate[field] = value;
    }
  }
  const validated = requireFamilyRuntimeIngressIdentity({
    runtimeIdentity: input.runtimeIdentity,
    ingressIdentity: candidate,
    operation: input.operation,
  });
  return {
    ...input.ingressPayload,
    ...(validated.stageAttemptId ? { stage_attempt_id: validated.stageAttemptId } : {}),
    ...(validated.stageRunId ? { stage_run_id: validated.stageRunId } : {}),
    scope_kind: validated.scopeKind,
    ...(validated.executionScope ? { scope_digest: validated.executionScope.scope_digest } : {}),
  };
}

function resolvedRuntimeExecutionIdentity(input: {
  identity: Record<string, unknown>;
  operation: string;
  side: 'authority' | 'candidate';
}) {
  const identityState = optionalString(input.identity.identity_state);
  const rawScopeKind = optionalString(input.identity.scope_kind);
  if (
    identityState === 'identity_unresolved'
    || identityState === 'quarantined'
    || rawScopeKind === 'identity_unresolved'
  ) {
    fail('Identity-unresolved or quarantined runtime rows cannot cross an execution boundary.', {
      failure_code: 'runtime_execution_identity_unresolved',
      operation: input.operation,
      identity_side: input.side,
      identity_state: identityState ?? 'identity_unresolved',
      scope_kind: rawScopeKind ?? 'identity_unresolved',
      stage_run_id: optionalString(input.identity.stage_run_id),
      stage_attempt_id: optionalString(input.identity.stage_attempt_id),
    });
  }
  const workspaceLocator = input.identity.workspace_locator;
  const scope = requireFamilyRuntimeExecutionScope({
    scopeKind: input.identity.scope_kind,
    executionScope: input.identity.execution_scope,
    workspaceLocator: workspaceLocator && typeof workspaceLocator === 'object' && !Array.isArray(workspaceLocator)
      ? workspaceLocator as Record<string, unknown>
      : undefined,
    domainId: optionalString(input.identity.domain_id),
    operation: input.operation,
    requireWorkspaceTransportCopy: false,
  });
  return {
    identityState: identityState ?? null,
    scopeKind: scope.scopeKind,
    executionScope: scope.executionScope,
    domainId: optionalString(input.identity.domain_id),
    stageRunId: optionalString(input.identity.stage_run_id),
    stageAttemptId: optionalString(input.identity.stage_attempt_id),
    workflowId: optionalString(input.identity.workflow_id),
  } as const;
}

export function requireSameFamilyRuntimeExecutionIdentity(input: {
  authorityIdentity: Record<string, unknown>;
  candidateIdentity: Record<string, unknown>;
  operation: string;
  compareStageAttemptId?: boolean;
  compareWorkflowId?: boolean;
  requireStageRunId?: boolean;
}) {
  const authority = resolvedRuntimeExecutionIdentity({
    identity: input.authorityIdentity,
    operation: input.operation,
    side: 'authority',
  });
  const candidate = resolvedRuntimeExecutionIdentity({
    identity: input.candidateIdentity,
    operation: input.operation,
    side: 'candidate',
  });
  const mismatches = [
    ...(authority.domainId !== candidate.domainId
      ? [{ field: 'domain_id', expected: authority.domainId, actual: candidate.domainId }]
      : []),
    ...(authority.stageRunId !== candidate.stageRunId
      ? [{ field: 'stage_run_id', expected: authority.stageRunId, actual: candidate.stageRunId }]
      : []),
    ...(input.requireStageRunId && (!authority.stageRunId || !candidate.stageRunId)
      ? [{ field: 'stage_run_id', expected: authority.stageRunId ?? 'required', actual: candidate.stageRunId }]
      : []),
    ...(input.compareStageAttemptId && authority.stageAttemptId !== candidate.stageAttemptId
      ? [{ field: 'stage_attempt_id', expected: authority.stageAttemptId, actual: candidate.stageAttemptId }]
      : []),
    ...(input.compareWorkflowId && authority.workflowId !== candidate.workflowId
      ? [{ field: 'workflow_id', expected: authority.workflowId, actual: candidate.workflowId }]
      : []),
    ...(authority.scopeKind !== candidate.scopeKind
      ? [{ field: 'scope_kind', expected: authority.scopeKind, actual: candidate.scopeKind }]
      : []),
  ];
  if (mismatches.length > 0) {
    fail('Runtime identities do not belong to the same execution boundary.', {
      failure_code: 'runtime_execution_identity_mismatch',
      operation: input.operation,
      mismatches,
    });
  }
  if (authority.executionScope && candidate.executionScope) {
    assertSameExecutionScope(authority.executionScope, candidate.executionScope, {
      operation: input.operation,
      transport: 'persisted_runtime_identity_admission',
    });
  }
  return { authority, candidate } as const;
}

export type { WorkItemExecutionScopeSnapshot };
