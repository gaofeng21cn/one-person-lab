import { stringValue, type JsonRecord } from '../../../kernel/json-record.ts';
import type {
  WorkItemProjectionDiagnostic,
  WorkItemProjectionItem,
  WorkItemUnresolvedExecution,
} from './types.ts';
import { attributeAttempts } from './execution-projection-parts/attempt-attribution.ts';
import { projectWorkItemExecution } from './execution-projection-parts/review-actions.ts';

export function joinAttemptsToWorkItems(input: {
  items: WorkItemProjectionItem[];
  attempts: JsonRecord[];
  qualityCycles?: JsonRecord[];
  queueDb: string;
  attemptRefLimit: number;
}) {
  const qualityCycleById = new Map(
    (input.qualityCycles ?? []).map((cycle) => [stringValue(cycle.quality_cycle_id), cycle]),
  );
  const attribution = attributeAttempts(input);
  const items = input.items.map((item): WorkItemProjectionItem =>
    projectWorkItemExecution({
      item,
      attempts: attribution.grouped.get(item.item_id) ?? [],
      diagnosticStageRuns: attribution.diagnosticStageRunsByItem.get(item.item_id) ?? [],
      qualityCycleById,
      queueDb: input.queueDb,
      attemptRefLimit: input.attemptRefLimit,
    }));
  const identityProblemCount = attribution.unresolvedExecutionCount
    + attribution.conflictExecutionCount
    + attribution.notInInventoryExecutionCount;
  return {
    items,
    diagnostics: attribution.diagnostics as WorkItemProjectionDiagnostic[],
    identity_health: {
      status: identityProblemCount === 0 ? 'clear' as const : 'attention_required' as const,
      execution_count: input.attempts.length,
      resolved_execution_count: attribution.resolvedExecutionCount,
      unresolved_execution_count: attribution.unresolvedExecutionCount,
      conflict_execution_count: attribution.conflictExecutionCount,
      not_in_inventory_execution_count: attribution.notInInventoryExecutionCount,
      non_work_item_execution_count: attribution.nonWorkItemExecutionCount,
      reason_counts: [...attribution.reasonCounts.entries()]
        .map(([reason, count]) => ({ reason, count }))
        .sort((left, right) => left.reason.localeCompare(right.reason)),
      sample_attempt_refs: attribution.unresolvedExecutions
        .slice(0, Math.max(1, input.attemptRefLimit))
        .map((execution: WorkItemUnresolvedExecution) => execution.attempt_ref),
    },
    unresolved_executions: attribution.unresolvedExecutions,
  };
}
