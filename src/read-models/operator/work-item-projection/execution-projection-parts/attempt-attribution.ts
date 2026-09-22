import { record, stringValue, type JsonRecord } from '../../../../kernel/json-record.ts';
import { withProjectedWorkItemPrimaryState } from '../primary-state.ts';
import {
  isStageRunWithoutAttemptProjection,
  MAX_DIAGNOSTIC_ATTEMPTS,
  newestStageRunDiagnosticFirst,
  STAGE_RUN_DIAGNOSTIC_ONLY_RECORD_KIND,
  STAGE_RUN_WITHOUT_ATTEMPT_REASON,
} from '../execution-ledger.ts';
import {
  inspectAttemptExecutionIdentity,
  type AttemptExecutionIdentityInspection,
} from '../execution-identity.ts';
import type {
  WorkItemProjectionDiagnostic,
  WorkItemProjectionItem,
  WorkItemUnresolvedExecution,
} from '../types.ts';
import { condition } from './execution-summary.ts';

function inspectStageRunWithoutAttemptIdentity(value: JsonRecord) {
  return inspectAttemptExecutionIdentity({
    ...value,
    stage_run_join_state: 'joined',
  });
}

function stageRunWithoutAttemptDiagnosticInspection(
  stageRun: JsonRecord,
  identityInspection: AttemptExecutionIdentityInspection,
): AttemptExecutionIdentityInspection {
  const stageRunId = stringValue(stageRun.stage_run_id) ?? 'unknown-stage-run';
  const identityState = stringValue(stageRun.stage_run_identity_state)
    ?? stringValue(stageRun.identity_state);
  const scopeKind = stringValue(stageRun.stage_run_scope_kind)
    ?? stringValue(stageRun.scope_kind);
  const quarantined = identityState === 'quarantined';
  const unresolved = identityState === 'identity_unresolved'
    || scopeKind === 'identity_unresolved'
    || identityInspection.category === 'identity_unresolved';
  const reason = quarantined
    ? 'stage_run_without_attempt_identity_quarantined'
    : identityInspection.category === 'identity_conflict'
      ? 'stage_run_without_attempt_identity_conflict'
      : unresolved
        ? 'stage_run_without_attempt_identity_unresolved'
        : STAGE_RUN_WITHOUT_ATTEMPT_REASON;
  return {
    ...identityInspection,
    category: quarantined || identityInspection.category === 'identity_conflict'
      ? 'identity_conflict'
      : 'identity_unresolved',
    reason,
    attempt_ref: `stage-run:${stageRunId}`,
    details: {
      ...identityInspection.details,
      projection_record_kind: STAGE_RUN_DIAGNOSTIC_ONLY_RECORD_KIND,
      stage_run_identity_reason: identityInspection.reason,
      stage_run_launch_status: stringValue(stageRun.stage_run_launch_status),
      stage_run_terminal_status: stringValue(stageRun.stage_run_terminal_status),
      stage_run_last_start_error: stringValue(stageRun.stage_run_last_start_error),
    },
  };
}

export type AttemptAttribution = {
  grouped: Map<string, JsonRecord[]>;
  diagnosticStageRunsByItem: Map<string, JsonRecord[]>;
  diagnostics: WorkItemProjectionDiagnostic[];
  unresolvedExecutions: WorkItemUnresolvedExecution[];
  reasonCounts: Map<string, number>;
  resolvedExecutionCount: number;
  unresolvedExecutionCount: number;
  conflictExecutionCount: number;
  notInInventoryExecutionCount: number;
  nonWorkItemExecutionCount: number;
};

export function attributeAttempts(input: {
  items: WorkItemProjectionItem[];
  attempts: JsonRecord[];
}): AttemptAttribution {
  const diagnostics: WorkItemProjectionDiagnostic[] = [];
  const itemByScope = new Map(input.items.map((item) => [item.identity.work_item_scope_id, item]));
  const grouped = new Map<string, JsonRecord[]>();
  const diagnosticStageRunsByItem = new Map<string, JsonRecord[]>();
  const unresolvedExecutions: WorkItemUnresolvedExecution[] = [];
  const reasonCounts = new Map<string, number>();
  let resolvedExecutionCount = 0;
  let unresolvedExecutionCount = 0;
  let conflictExecutionCount = 0;
  let notInInventoryExecutionCount = 0;
  let nonWorkItemExecutionCount = 0;

  const recordIdentityProblem = (
    attempt: JsonRecord,
    inspection: AttemptExecutionIdentityInspection,
    reason: string,
    details: JsonRecord = {},
    scopeAttribution: 'trusted' | 'untrusted_claim' = 'trusted',
  ) => {
    reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
    const scope = scopeAttribution === 'trusted' ? inspection.scope : null;
    const claimedScope = scopeAttribution === 'untrusted_claim'
      ? {
          scope_kind: inspection.scope?.scope_kind ?? stringValue(attempt.scope_kind),
          project_scope_id: inspection.scope?.project_scope_id ?? stringValue(attempt.project_scope_id),
          work_item_scope_id: inspection.scope?.work_item_scope_id ?? stringValue(attempt.work_item_scope_id),
          domain_id: inspection.scope?.domain_id ?? stringValue(attempt.domain_id),
          domain_work_item_id: inspection.scope?.domain_work_item_id ?? null,
          workspace_binding_id: inspection.scope?.workspace_binding_id
            ?? stringValue(attempt.workspace_binding_id),
          binding_version_id: inspection.scope?.binding_version_id
            ?? stringValue(attempt.binding_version_id),
          scope_digest: inspection.scope?.scope_digest ?? stringValue(attempt.scope_digest),
        }
      : null;
    if (unresolvedExecutions.length < MAX_DIAGNOSTIC_ATTEMPTS) {
      const locator = record(attempt.workspace_locator);
      const legacyIdentityHints = Object.fromEntries([
        'work_item_id',
        'study_id',
        'quest_id',
        'work_unit_id',
        'task_or_work_unit_ref',
        'task_ref',
      ].flatMap((field) => {
        const value = stringValue(locator[field]);
        return value ? [[field, value]] : [];
      }));
      unresolvedExecutions.push({
        attempt_ref: inspection.attempt_ref,
        stage_run_id: stringValue(attempt.stage_run_id),
        stage_id: stringValue(attempt.stage_id),
        role: stringValue(attempt.attempt_role)
          ?? stringValue(attempt.quality_role)
          ?? stringValue(attempt.role),
        scope_kind: inspection.scope_kind,
        identity_state: inspection.identity_state,
        reason,
        project_scope_id: scope?.project_scope_id
          ?? (scopeAttribution === 'trusted' ? stringValue(attempt.project_scope_id) : null),
        work_item_scope_id: scope?.work_item_scope_id
          ?? (scopeAttribution === 'trusted' ? stringValue(attempt.work_item_scope_id) : null),
        domain_id: scope?.domain_id
          ?? (scopeAttribution === 'trusted' ? stringValue(attempt.domain_id) : null),
        domain_work_item_id: scope?.domain_work_item_id ?? null,
        details: {
          ...inspection.details,
          ...details,
          ...(claimedScope ? { claimed_scope: claimedScope } : {}),
          ...(stringValue(locator.workspace_root)
            ? { workspace_root_hint: stringValue(locator.workspace_root)! }
            : {}),
          ...(Object.keys(legacyIdentityHints).length > 0
            ? { legacy_locator_identity_hints: legacyIdentityHints }
            : {}),
        },
      });
    }
    if (diagnostics.length < MAX_DIAGNOSTIC_ATTEMPTS) {
      diagnostics.push({
        reason,
        project_id: scope?.project_scope_id,
        work_item_id: scope?.domain_work_item_id,
        ref: inspection.attempt_ref,
        details: {
          scope_kind: inspection.scope_kind,
          identity_state: inspection.identity_state,
          work_item_scope_id: scope?.work_item_scope_id ?? null,
          ...inspection.details,
          ...details,
          ...(claimedScope ? { claimed_scope: claimedScope } : {}),
        },
      });
    }
  };

  for (const attempt of input.attempts) {
    const diagnosticStageRun = isStageRunWithoutAttemptProjection(attempt);
    const identityInspection = diagnosticStageRun
      ? inspectStageRunWithoutAttemptIdentity(attempt)
      : inspectAttemptExecutionIdentity(attempt);
    const inspection = diagnosticStageRun
      ? stageRunWithoutAttemptDiagnosticInspection(attempt, identityInspection)
      : identityInspection;
    if (diagnosticStageRun && identityInspection.category !== 'work_item') {
      if (inspection.category === 'identity_conflict') {
        conflictExecutionCount += 1;
      } else {
        unresolvedExecutionCount += 1;
      }
      recordIdentityProblem(attempt, inspection, inspection.reason, {}, 'untrusted_claim');
      continue;
    }
    if (!diagnosticStageRun && inspection.category === 'not_work_item_scoped') {
      nonWorkItemExecutionCount += 1;
      continue;
    }
    if (!diagnosticStageRun && inspection.category === 'identity_unresolved') {
      unresolvedExecutionCount += 1;
      recordIdentityProblem(attempt, inspection, inspection.reason);
      continue;
    }
    if (!diagnosticStageRun && (inspection.category === 'identity_conflict' || !inspection.scope)) {
      conflictExecutionCount += 1;
      recordIdentityProblem(attempt, inspection, inspection.reason);
      continue;
    }
    if (!inspection.scope) {
      conflictExecutionCount += 1;
      recordIdentityProblem(attempt, inspection, 'stage_run_without_attempt_identity_conflict');
      continue;
    }
    const scope = inspection.scope;
    const item = itemByScope.get(scope.work_item_scope_id);
    if (!item) {
      notInInventoryExecutionCount += 1;
      const reason = diagnosticStageRun
        ? 'stage_run_without_attempt_work_item_scope_not_in_domain_inventory'
        : 'stage_attempt_work_item_scope_not_in_domain_inventory';
      recordIdentityProblem(
        attempt,
        inspection,
        reason,
        {},
        diagnosticStageRun ? 'untrusted_claim' : 'trusted',
      );
      continue;
    }
    const inventoryMismatches = [
      ['project_scope_id', item.identity.project_scope_id, scope.project_scope_id],
      ['work_item_scope_id', item.identity.work_item_scope_id, scope.work_item_scope_id],
      ['domain_id', item.identity.domain_id, scope.domain_id],
      ['domain_work_item_id', item.identity.work_item_id, scope.domain_work_item_id],
    ].flatMap(([field, expected, actual]) => expected === actual
      ? []
      : [{ field, expected, actual }]);
    if (inventoryMismatches.length > 0) {
      conflictExecutionCount += 1;
      const reason = diagnosticStageRun
        ? 'stage_run_without_attempt_execution_scope_inventory_conflict'
        : 'stage_attempt_execution_scope_inventory_conflict';
      recordIdentityProblem(
        attempt,
        inspection,
        reason,
        { mismatches: inventoryMismatches },
        diagnosticStageRun ? 'untrusted_claim' : 'trusted',
      );
      continue;
    }
    if (diagnosticStageRun) {
      unresolvedExecutionCount += 1;
      recordIdentityProblem(attempt, inspection, inspection.reason);
      diagnosticStageRunsByItem.set(item.item_id, [
        ...(diagnosticStageRunsByItem.get(item.item_id) ?? []),
        attempt,
      ]);
      continue;
    }
    resolvedExecutionCount += 1;
    grouped.set(item.item_id, [...(grouped.get(item.item_id) ?? []), attempt]);
  }

  return {
    grouped,
    diagnosticStageRunsByItem,
    diagnostics,
    unresolvedExecutions,
    reasonCounts,
    resolvedExecutionCount,
    unresolvedExecutionCount,
    conflictExecutionCount,
    notInInventoryExecutionCount,
    nonWorkItemExecutionCount,
  };
}

export function applyDiagnosticStageRuns(
  item: WorkItemProjectionItem,
  stageRuns: JsonRecord[],
  queueDb: string,
  attemptRefLimit: number,
) {
  const ordered = [...stageRuns].sort(newestStageRunDiagnosticFirst);
  if (ordered.length === 0) return item;
  const latestStageRun = ordered[0]!;
  const latestStageRunId = stringValue(latestStageRun.stage_run_id) ?? 'unknown-stage-run';
  const observedAt = stringValue(latestStageRun.updated_at)
    ?? stringValue(latestStageRun.created_at)
    ?? item.freshness.inventory_observed_at;
  const hasCurrentAttempt = item.execution.attempt_id !== null;
  return withProjectedWorkItemPrimaryState({
    ...item,
    execution: hasCurrentAttempt
      ? item.execution
      : {
          ...item.execution,
          state: 'unknown',
          updated_at: observedAt,
          running_proof_status: 'not_applicable',
          diagnostic_reason: STAGE_RUN_WITHOUT_ATTEMPT_REASON,
        },
    conditions: [
      ...item.conditions,
      condition({
        type: 'StageRunAttemptBindingObserved',
        status: 'Unknown',
        reason: STAGE_RUN_WITHOUT_ATTEMPT_REASON,
        message: 'A persisted StageRun has no StageAttempt, so execution currentness is unresolved.',
        owner: 'opl_framework',
        severity: 'warning',
        last_transition_time: observedAt,
        observed_generation: item.lifecycle.observed_generation,
        ref: `${queueDb}#stage_run_launches/${latestStageRunId}`,
      }),
    ],
    freshness: hasCurrentAttempt
      ? item.freshness
      : {
          ...item.freshness,
          state: 'unknown',
          execution_observed_at: observedAt,
          last_transition_time: observedAt,
          reason: STAGE_RUN_WITHOUT_ATTEMPT_REASON,
        },
    source_refs: [
      ...item.source_refs,
      ...ordered.slice(0, attemptRefLimit).flatMap((stageRun) => {
        const stageRunId = stringValue(stageRun.stage_run_id);
        return stageRunId ? [{
          ref_kind: 'sqlite' as const,
          ref: `${queueDb}#stage_run_launches/${stageRunId}`,
          role: 'stage_run_diagnostic_only',
        }] : [];
      }),
    ],
  });
}
