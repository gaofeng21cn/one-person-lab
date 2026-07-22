import { canonicalJsonText } from '../../../kernel/canonical-json.ts';
import { FrameworkContractError, isRecord } from '../../../kernel/contract-validation.ts';
import { stringValue, type JsonRecord } from '../../../kernel/json-record.ts';
import { resolveStandardAgent } from '../../../kernel/standard-agent-registry.ts';
import {
  requireWorkItemExecutionScopeSnapshot,
  type WorkItemExecutionScopeSnapshot,
} from '../../workspace/public/app-state.ts';

export type AttemptExecutionIdentityInspection = {
  category: 'work_item' | 'not_work_item_scoped' | 'identity_unresolved' | 'identity_conflict';
  reason: string;
  attempt_ref: string;
  scope_kind: string | null;
  identity_state: string | null;
  scope: WorkItemExecutionScopeSnapshot | null;
  details: JsonRecord;
};

const SCOPE_KINDS = new Set(['work_item', 'domain', 'system', 'identity_unresolved']);
const IDENTITY_STATES = new Set(['resolved', 'identity_unresolved', 'quarantined']);

function attemptRef(attempt: JsonRecord) {
  return stringValue(attempt.stage_attempt_id)
    ?? stringValue(attempt.attempt_id)
    ?? stringValue(attempt.task_id)
    ?? 'unknown-stage-attempt';
}

function canonicalDomainId(value: unknown) {
  const domainId = stringValue(value);
  return domainId ? resolveStandardAgent(domainId)?.domain_id ?? domainId : null;
}

function legacyScopeSources(attempt: JsonRecord) {
  const locator = isRecord(attempt.workspace_locator) ? attempt.workspace_locator : {};
  return [
    ['attempt.execution_scope_snapshot', attempt.execution_scope_snapshot],
    ['attempt.workspace_locator.execution_scope', locator.execution_scope],
  ] as const;
}

function inspectCanonicalScope(value: JsonRecord) {
  try {
    return {
      scope: requireWorkItemExecutionScopeSnapshot(value),
      reason: null,
    } as const;
  } catch (error) {
    const failureCode = error instanceof FrameworkContractError
      ? stringValue(error.details?.failure_code)
      : null;
    const reason = failureCode === 'work_item_scope_id_mismatch'
      ? 'stage_attempt_work_item_scope_derivation_conflict'
      : failureCode === 'execution_scope_digest_mismatch'
        ? 'stage_attempt_execution_scope_digest_invalid'
        : 'stage_attempt_execution_scope_snapshot_invalid';
    return { scope: null, reason } as const;
  }
}

function conflict(
  attempt: JsonRecord,
  reason: string,
  input: {
    scopeKind: string | null;
    identityState: string | null;
    scope?: WorkItemExecutionScopeSnapshot | null;
    details?: JsonRecord;
  },
): AttemptExecutionIdentityInspection {
  return {
    category: 'identity_conflict',
    reason,
    attempt_ref: attemptRef(attempt),
    scope_kind: input.scopeKind,
    identity_state: input.identityState,
    scope: input.scope ?? null,
    details: input.details ?? {},
  };
}

function unresolved(
  attempt: JsonRecord,
  reason: string,
  input: {
    scopeKind: string | null;
    identityState: string | null;
    scope?: WorkItemExecutionScopeSnapshot | null;
    details?: JsonRecord;
  },
): AttemptExecutionIdentityInspection {
  return {
    category: 'identity_unresolved',
    reason,
    attempt_ref: attemptRef(attempt),
    scope_kind: input.scopeKind,
    identity_state: input.identityState,
    scope: input.scope ?? null,
    details: input.details ?? {},
  };
}

function inspectStageRunExecutionIdentity(
  attempt: JsonRecord,
  scope: WorkItemExecutionScopeSnapshot,
  declaredScopeKind: string | null,
  identityState: string | null,
): AttemptExecutionIdentityInspection | null {
  const stageRunId = stringValue(attempt.stage_run_id);
  const joinState = stringValue(attempt.stage_run_join_state);
  if (
    !stageRunId
    || !joinState
    || joinState === 'attempt_unbound'
    || joinState === 'identity_schema_unavailable'
  ) {
    return unresolved(attempt, 'stage_attempt_stage_run_identity_unresolved', {
      scopeKind: declaredScopeKind ?? scope.scope_kind,
      identityState,
      scope,
      details: { stage_run_join_state: joinState ?? 'not_projected' },
    });
  }
  if (joinState === 'stage_run_not_found') {
    return conflict(attempt, 'stage_attempt_stage_run_binding_not_found', {
      scopeKind: declaredScopeKind ?? scope.scope_kind,
      identityState,
      scope,
      details: { stage_run_id: stageRunId },
    });
  }
  if (joinState !== 'joined') {
    return conflict(attempt, 'stage_attempt_stage_run_join_invalid', {
      scopeKind: declaredScopeKind ?? scope.scope_kind,
      identityState,
      scope,
      details: { stage_run_id: stageRunId, stage_run_join_state: joinState },
    });
  }

  const registeredStageRunId = stringValue(attempt.stage_run_registered_id);
  const stageRunDomainId = stringValue(attempt.stage_run_domain_id);
  const stageRunStageId = stringValue(attempt.stage_run_stage_id);
  const stageRunScopeKind = stringValue(attempt.stage_run_scope_kind);
  const stageRunIdentityState = stringValue(attempt.stage_run_identity_state);
  if (stageRunScopeKind && !SCOPE_KINDS.has(stageRunScopeKind)) {
    return conflict(attempt, 'stage_run_scope_kind_invalid', {
      scopeKind: declaredScopeKind ?? scope.scope_kind,
      identityState,
      scope,
      details: { stage_run_scope_kind: stageRunScopeKind },
    });
  }
  if (stageRunIdentityState && !IDENTITY_STATES.has(stageRunIdentityState)) {
    return conflict(attempt, 'stage_run_identity_state_invalid', {
      scopeKind: declaredScopeKind ?? scope.scope_kind,
      identityState,
      scope,
      details: { stage_run_identity_state: stageRunIdentityState },
    });
  }
  if (
    stageRunScopeKind === 'identity_unresolved'
    || stageRunIdentityState === 'identity_unresolved'
  ) {
    return unresolved(attempt, 'stage_run_execution_scope_identity_unresolved', {
      scopeKind: declaredScopeKind ?? scope.scope_kind,
      identityState,
      scope,
      details: {
        stage_run_id: stageRunId,
        stage_run_scope_kind: stageRunScopeKind,
        stage_run_identity_state: stageRunIdentityState,
      },
    });
  }
  if (stageRunIdentityState === 'quarantined') {
    return conflict(attempt, 'stage_run_execution_scope_identity_quarantined', {
      scopeKind: declaredScopeKind ?? scope.scope_kind,
      identityState,
      scope,
      details: { stage_run_id: stageRunId },
    });
  }

  const requiredStageRunFields = [
    ['stage_run_registered_id', registeredStageRunId],
    ['stage_run_domain_id', stageRunDomainId],
    ['stage_run_stage_id', stageRunStageId],
    ['stage_run_scope_kind', stageRunScopeKind],
    ['stage_run_identity_state', stageRunIdentityState],
    ['stage_run_project_scope_id', stringValue(attempt.stage_run_project_scope_id)],
    ['stage_run_work_item_scope_id', stringValue(attempt.stage_run_work_item_scope_id)],
    ['stage_run_workspace_binding_id', stringValue(attempt.stage_run_workspace_binding_id)],
    ['stage_run_binding_version_id', stringValue(attempt.stage_run_binding_version_id)],
    ['stage_run_scope_digest', stringValue(attempt.stage_run_scope_digest)],
  ].flatMap(([field, value]) => value ? [] : [field]);
  if (requiredStageRunFields.length > 0) {
    return conflict(attempt, 'stage_run_execution_scope_columns_missing', {
      scopeKind: declaredScopeKind ?? scope.scope_kind,
      identityState,
      scope,
      details: { stage_run_id: stageRunId, missing_fields: requiredStageRunFields },
    });
  }
  if (stageRunScopeKind !== 'work_item' || stageRunIdentityState !== 'resolved') {
    return conflict(attempt, 'stage_run_execution_scope_not_resolved_work_item', {
      scopeKind: declaredScopeKind ?? scope.scope_kind,
      identityState,
      scope,
      details: {
        stage_run_id: stageRunId,
        stage_run_scope_kind: stageRunScopeKind,
        stage_run_identity_state: stageRunIdentityState,
      },
    });
  }

  const snapshotState = stringValue(attempt.stage_run_execution_scope_state);
  const stageRunScopeRecord = isRecord(attempt.stage_run_execution_scope)
    ? attempt.stage_run_execution_scope
    : null;
  if (snapshotState !== 'present' || !stageRunScopeRecord) {
    return conflict(attempt, 'stage_run_execution_scope_snapshot_invalid', {
      scopeKind: declaredScopeKind ?? scope.scope_kind,
      identityState,
      scope,
      details: {
        stage_run_id: stageRunId,
        stage_run_execution_scope_state: snapshotState ?? 'not_projected',
      },
    });
  }
  const inspectedStageRunScope = inspectCanonicalScope(stageRunScopeRecord);
  if (inspectedStageRunScope.reason || !inspectedStageRunScope.scope) {
    return conflict(attempt, 'stage_run_execution_scope_snapshot_invalid', {
      scopeKind: declaredScopeKind ?? scope.scope_kind,
      identityState,
      scope,
      details: {
        stage_run_id: stageRunId,
        snapshot_failure_reason: inspectedStageRunScope.reason,
      },
    });
  }
  const stageRunScope = inspectedStageRunScope.scope;
  const stageRunColumnMismatches = [
    ['scope_kind', stageRunScope.scope_kind, stageRunScopeKind],
    ['project_scope_id', stageRunScope.project_scope_id, stringValue(attempt.stage_run_project_scope_id)],
    ['work_item_scope_id', stageRunScope.work_item_scope_id, stringValue(attempt.stage_run_work_item_scope_id)],
    ['domain_id', stageRunScope.domain_id, stageRunDomainId],
    ['workspace_binding_id', stageRunScope.workspace_binding_id, stringValue(attempt.stage_run_workspace_binding_id)],
    ['binding_version_id', stageRunScope.binding_version_id, stringValue(attempt.stage_run_binding_version_id)],
    ['scope_digest', stageRunScope.scope_digest, stringValue(attempt.stage_run_scope_digest)],
  ].flatMap(([field, expected, actual]) => expected === actual
    ? []
    : [{ field, expected, actual }]);
  if (stageRunColumnMismatches.length > 0) {
    return conflict(attempt, 'stage_run_execution_scope_column_conflict', {
      scopeKind: declaredScopeKind ?? scope.scope_kind,
      identityState,
      scope,
      details: { stage_run_id: stageRunId, mismatches: stageRunColumnMismatches },
    });
  }

  const attemptStageRunMismatches = [
    ['stage_run_id', stageRunId, registeredStageRunId],
    ['domain_id', canonicalDomainId(attempt.domain_id), canonicalDomainId(stageRunDomainId)],
    ['stage_id', stringValue(attempt.stage_id), stageRunStageId],
    ['scope_digest', scope.scope_digest, stageRunScope.scope_digest],
    ['execution_scope', canonicalJsonText(scope), canonicalJsonText(stageRunScope)],
  ].flatMap(([field, attemptValue, stageRunValue]) => attemptValue === stageRunValue
    ? []
    : [{ field, attempt_value: attemptValue, stage_run_value: stageRunValue }]);
  if (attemptStageRunMismatches.length > 0) {
    return conflict(attempt, 'stage_attempt_stage_run_scope_mismatch', {
      scopeKind: declaredScopeKind ?? scope.scope_kind,
      identityState,
      scope,
      details: { stage_run_id: stageRunId, mismatches: attemptStageRunMismatches },
    });
  }
  return null;
}

export function inspectAttemptExecutionIdentity(
  attempt: JsonRecord,
): AttemptExecutionIdentityInspection {
  const declaredScopeKind = stringValue(attempt.scope_kind);
  const identityState = stringValue(attempt.identity_state);
  if (declaredScopeKind && !SCOPE_KINDS.has(declaredScopeKind)) {
    return conflict(attempt, 'stage_attempt_scope_kind_invalid', {
      scopeKind: declaredScopeKind,
      identityState,
    });
  }
  if (identityState && !IDENTITY_STATES.has(identityState)) {
    return conflict(attempt, 'stage_attempt_identity_state_invalid', {
      scopeKind: declaredScopeKind,
      identityState,
    });
  }
  if (identityState === 'quarantined') {
    return conflict(attempt, 'stage_attempt_identity_quarantined', {
      scopeKind: declaredScopeKind,
      identityState,
    });
  }

  const topLevelScopeDeclared = attempt.execution_scope !== undefined
    && attempt.execution_scope !== null;
  if (topLevelScopeDeclared && !isRecord(attempt.execution_scope)) {
    return conflict(attempt, 'stage_attempt_execution_scope_snapshot_invalid', {
      scopeKind: declaredScopeKind,
      identityState,
      details: { scope_source: 'attempt.execution_scope' },
    });
  }
  const primaryRecord = isRecord(attempt.execution_scope) ? attempt.execution_scope : null;
  if (!primaryRecord) {
    const legacySources = legacyScopeSources(attempt)
      .filter(([, value]) => isRecord(value))
      .map(([source]) => source);
    if (legacySources.length > 0) {
      return {
        category: 'identity_unresolved',
        reason: 'stage_attempt_legacy_execution_scope_not_admitted',
        attempt_ref: attemptRef(attempt),
        scope_kind: declaredScopeKind,
        identity_state: identityState,
        scope: null,
        details: { legacy_scope_sources: legacySources },
      };
    }
    if (declaredScopeKind === 'domain' || declaredScopeKind === 'system') {
      return {
        category: 'not_work_item_scoped',
        reason: 'execution_not_work_item_scoped',
        attempt_ref: attemptRef(attempt),
        scope_kind: declaredScopeKind,
        identity_state: identityState ?? 'resolved',
        scope: null,
        details: {},
      };
    }
    if (declaredScopeKind === 'work_item' && identityState === 'resolved') {
      return conflict(attempt, 'work_item_execution_scope_snapshot_missing', {
        scopeKind: declaredScopeKind,
        identityState,
      });
    }
    return {
      category: 'identity_unresolved',
      reason: declaredScopeKind === 'identity_unresolved' || identityState === 'identity_unresolved'
        ? 'stage_attempt_identity_unresolved'
        : 'stage_attempt_execution_scope_missing',
      attempt_ref: attemptRef(attempt),
      scope_kind: declaredScopeKind,
      identity_state: identityState,
      scope: null,
      details: {},
    };
  }

  const inspectedScope = inspectCanonicalScope(primaryRecord);
  if (inspectedScope.reason || !inspectedScope.scope) {
    return conflict(attempt, inspectedScope.reason ?? 'stage_attempt_execution_scope_snapshot_invalid', {
      scopeKind: declaredScopeKind ?? stringValue(primaryRecord.scope_kind),
      identityState,
      details: { scope_source: 'attempt.execution_scope' },
    });
  }
  const scope = inspectedScope.scope;
  const missingColumns = [
    'scope_kind',
    'identity_state',
    'project_scope_id',
    'work_item_scope_id',
    'workspace_binding_id',
    'binding_version_id',
    'scope_digest',
    'domain_id',
  ].filter((field) => !stringValue(attempt[field]));
  if (missingColumns.length > 0) {
    return {
      category: 'identity_unresolved',
      reason: 'stage_attempt_execution_scope_columns_missing',
      attempt_ref: attemptRef(attempt),
      scope_kind: declaredScopeKind ?? scope.scope_kind,
      identity_state: identityState,
      scope,
      details: {
        scope_source: 'attempt.execution_scope',
        missing_fields: missingColumns,
      },
    };
  }
  if (declaredScopeKind && declaredScopeKind !== scope.scope_kind) {
    return conflict(attempt, 'stage_attempt_scope_kind_snapshot_conflict', {
      scopeKind: declaredScopeKind,
      identityState,
      scope,
    });
  }
  if (identityState && identityState !== 'resolved') {
    return conflict(attempt, 'stage_attempt_identity_state_snapshot_conflict', {
      scopeKind: declaredScopeKind ?? scope.scope_kind,
      identityState,
      scope,
    });
  }
  for (const field of [
    'project_scope_id',
    'work_item_scope_id',
    'workspace_binding_id',
    'binding_version_id',
    'scope_digest',
  ] as const) {
    const columnValue = stringValue(attempt[field]);
    if (columnValue && columnValue !== scope[field]) {
      return conflict(attempt, 'stage_attempt_execution_scope_column_conflict', {
        scopeKind: declaredScopeKind ?? scope.scope_kind,
        identityState: identityState ?? 'resolved',
        scope,
        details: {
          field,
          column_value: columnValue,
          snapshot_value: scope[field],
        },
      });
    }
  }
  const attemptDomainId = canonicalDomainId(attempt.domain_id);
  const scopeDomainId = canonicalDomainId(scope.domain_id);
  if (attemptDomainId && attemptDomainId !== scopeDomainId) {
    return conflict(attempt, 'stage_attempt_domain_execution_scope_conflict', {
      scopeKind: declaredScopeKind ?? scope.scope_kind,
      identityState: identityState ?? 'resolved',
      scope,
      details: {
        attempt_domain_id: attemptDomainId,
        scope_domain_id: scopeDomainId,
      },
    });
  }
  const stageRunInspection = inspectStageRunExecutionIdentity(
    attempt,
    scope,
    declaredScopeKind,
    identityState,
  );
  if (stageRunInspection) return stageRunInspection;
  return {
    category: 'work_item',
    reason: 'work_item_execution_scope_resolved',
    attempt_ref: attemptRef(attempt),
    scope_kind: scope.scope_kind,
    identity_state: identityState ?? 'resolved',
    scope,
    details: { scope_source: 'attempt.execution_scope' },
  };
}
