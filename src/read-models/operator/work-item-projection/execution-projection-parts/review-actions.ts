import { record, stringValue, type JsonRecord } from '../../../../kernel/json-record.ts';
import {
  attemptObservedAt,
  attemptStageRunLaunch,
  attemptWorkflowId,
  effectiveAttemptStatus,
  newestFirst,
  normalizedStatus,
  numberValue,
} from '../execution-ledger.ts';
import { systemRepairAction } from '../inventory-presentation.ts';
import { withProjectedWorkItemPrimaryState } from '../primary-state.ts';
import type { WorkItemProjectionItem } from '../types.ts';
import { applyDiagnosticStageRuns } from './attempt-attribution.ts';
import {
  condition,
  CURRENT_QUALITY_CYCLE_STATUSES,
  currentRepairRoute,
  currentRuntimeWakeAttempt,
  executionState,
  humanGateAction,
  missingToken,
  reviewChainSummary,
  tokenObservation,
  usageProjection,
} from './execution-summary.ts';

export function projectWorkItemExecution(input: {
  item: WorkItemProjectionItem;
  attempts: JsonRecord[];
  diagnosticStageRuns: JsonRecord[];
  qualityCycleById: Map<string | null, JsonRecord>;
  queueDb: string;
  attemptRefLimit: number;
}): WorkItemProjectionItem {
  const { item, diagnosticStageRuns, queueDb, attemptRefLimit, qualityCycleById } = input;
  const attempts = [...input.attempts].sort(newestFirst);
  if (attempts.length === 0) {
    return applyDiagnosticStageRuns(withProjectedWorkItemPrimaryState({
      ...item,
      conditions: [
        condition({
          type: 'InventoryResolved',
          status: 'True',
          reason: 'domain_inventory_item_resolved',
          message: 'The work item exists independently of runtime execution history.',
          owner: item.identity.agent_id,
          severity: 'none',
          last_transition_time: item.freshness.inventory_observed_at,
          observed_generation: item.lifecycle.observed_generation,
        }),
        condition({
          type: 'TelemetryObserved',
          status: 'Unknown',
          reason: 'no_stage_attempt_usage_telemetry_observed',
          message: 'No token usage has been observed for this work item.',
          owner: 'opl_framework',
          severity: 'info',
          last_transition_time: item.freshness.inventory_observed_at,
          observed_generation: item.lifecycle.observed_generation,
        }),
      ],
    }), diagnosticStageRuns, queueDb, attemptRefLimit);
  }

  const latest = attempts[0]!;
  const latestExecution = executionState(latest);
  const runtimeWakeAttempt = ['paused', 'delivered_paused'].includes(item.lifecycle.business_state)
    ? currentRuntimeWakeAttempt(attempts, item.lifecycle.last_transition_at)
    : null;
  const currentStageId = item.lifecycle.business_state === 'active'
    ? item.lifecycle.current_stage_id
    : stringValue(runtimeWakeAttempt?.stage_id);
  const currentStageAttempts = currentStageId
    ? attempts.filter((attempt) => stringValue(attempt.stage_id) === currentStageId)
    : [];
  const currentAttempt = item.lifecycle.business_state === 'active'
    ? currentStageAttempts[0] ?? null
    : runtimeWakeAttempt;
  const currentExecution = currentAttempt ? executionState(currentAttempt) : null;
  const stale = currentExecution?.currentness.projection_status === 'stale_projection';
  const attemptProjections = attempts.map((attempt) => ({
    attempt,
    projection: usageProjection(attempt, 'work_item_projection_v2'),
  }));
  const currentStageTokens = currentStageId
    ? tokenObservation({
        projections: attemptProjections
          .filter(({ attempt }) => stringValue(attempt.stage_id) === currentStageId)
          .map(({ projection }) => projection),
        observedAt: stringValue(currentStageAttempts[0]?.updated_at),
        stale,
      })
    : missingToken('current_stage_not_applicable');
  const cumulativeTokens = tokenObservation({
    projections: attemptProjections.map(({ projection }) => projection),
    observedAt: stringValue(latest.updated_at),
  });
  const reviewChain = reviewChainSummary({ attempts, cumulativeTokens });
  const telemetryState: WorkItemProjectionItem['telemetry']['state'] = stale
    ? 'stale'
    : currentStageTokens.state === 'observed' && cumulativeTokens.state === 'observed'
      ? 'observed'
      : currentStageTokens.state === 'observed' || cumulativeTokens.state === 'observed'
        ? 'partial'
        : 'missing';
  const cumulativeTelemetryObservedWithNoApplicableCurrentStage = cumulativeTokens.state === 'observed'
    && currentStageTokens.state === 'missing'
    && currentStageTokens.missing_reason === 'current_stage_not_applicable';
  const telemetryConditionObserved = telemetryState === 'observed'
    || cumulativeTelemetryObservedWithNoApplicableCurrentStage;
  const repairRoute = currentAttempt
    ? currentRepairRoute(item, currentAttempt)
    : {
        declared: false,
        complete: false,
        responsible_component: null,
        issue: null,
        impact: null,
        repair_action: null,
        expected_outcome: null,
      };
  const runtimeHumanGate = currentAttempt !== null
    && effectiveAttemptStatus(currentAttempt) === 'human_gate';
  const systemAttention = !runtimeHumanGate
    && item.lifecycle.business_state === 'active'
    && repairRoute.complete
    && item.attention.kind !== 'user';
  const attention = runtimeHumanGate
    ? {
        kind: 'user' as const,
        reason: 'runtime_human_gate_requires_owner_decision',
        owner: 'user',
        responsible_component: null,
        issue: null,
        impact: null,
        repair_action: null,
        expected_outcome: null,
      }
    : systemAttention
      ? {
          kind: 'system' as const,
          reason: 'current_repair_route_blocks_work_item',
          owner: repairRoute.responsible_component,
          responsible_component: repairRoute.responsible_component,
          issue: repairRoute.issue,
          impact: repairRoute.impact,
          repair_action: repairRoute.repair_action,
          expected_outcome: repairRoute.expected_outcome,
        }
      : item.attention;
  const attemptIds = attempts
    .map((attempt) => stringValue(attempt.stage_attempt_id))
    .filter((attemptId): attemptId is string => Boolean(attemptId));
  const executionObservedAt = attemptObservedAt(latest);
  const currentExecutionObservedAt = currentAttempt
    ? attemptObservedAt(currentAttempt)
    : null;
  const currentExecutionState = currentExecution?.state ?? 'idle';
  const currentQualityCycleId = currentAttempt ? stringValue(currentAttempt.quality_cycle_id) : null;
  const currentQualityCycle = currentQualityCycleId
    ? qualityCycleById.get(currentQualityCycleId) ?? null
    : null;
  const currentQualityCycleState = record(currentQualityCycle?.state);
  const currentQualityCycleStatus = normalizedStatus(currentQualityCycleState.status);
  const currentQualityCyclePolicy = record(currentQualityCycle?.policy);
  const policyScopeBudget = record(record(currentQualityCyclePolicy.formal_review).scope_budget);
  const retryScopeBudget = record(record(currentAttempt?.retry_budget).quality_scope_budget);
  const scopeBudget = Object.keys(policyScopeBudget).length > 0 ? policyScopeBudget : retryScopeBudget;
  const budgetUsage = record(currentQualityCycleState.quality_scope_budget_usage);
  const maxAttempts = numberValue(scopeBudget.max_attempts);
  const attemptsUsed = numberValue(budgetUsage.attempts_used)
    ?? (currentQualityCycleId
      ? Math.max(0, ...attempts
          .filter((attempt) => stringValue(attempt.quality_cycle_id) === currentQualityCycleId)
          .map((attempt) => numberValue(attempt.quality_round_index) ?? 0))
      : 0);
  const budgetStopReason = stringValue(currentQualityCycleState.quality_scope_budget_stop_reason);
  const managedQualityBudget = currentQualityCycleId !== null
    && CURRENT_QUALITY_CYCLE_STATUSES.has(currentQualityCycleStatus)
    && Object.keys(scopeBudget).length > 0;
  const conditions = [
    condition({
      type: 'InventoryResolved',
      status: 'True',
      reason: 'domain_inventory_item_resolved',
      message: 'The work item is present in the domain inventory.',
      owner: item.identity.agent_id,
      severity: 'none',
      last_transition_time: item.freshness.inventory_observed_at,
      observed_generation: item.lifecycle.observed_generation,
    }),
    condition({
      type: 'ExecutionRunning',
      status: currentExecutionState === 'running' ? 'True' : 'False',
      reason: currentExecutionState === 'running' ? 'running_proof_observed' : 'no_current_running_proof',
      message: currentExecutionState === 'running'
        ? 'A current runtime attempt has running evidence.'
        : 'No current running execution is projected.',
      owner: 'opl_framework',
      severity: currentExecutionState === 'running' ? 'info' : 'none',
      last_transition_time: currentExecutionObservedAt ?? executionObservedAt,
      observed_generation: item.lifecycle.observed_generation,
    }),
    condition({
      type: 'OwnerDecisionRequired',
      status: runtimeHumanGate ? 'True' : 'False',
      reason: runtimeHumanGate
        ? 'runtime_human_gate_requires_owner_decision'
        : 'no_current_runtime_human_gate',
      message: runtimeHumanGate
        ? 'The current runtime attempt has reached a human gate and requires an owner decision.'
        : 'No current runtime human gate requires an owner decision.',
      owner: runtimeHumanGate ? 'user' : 'opl_framework',
      severity: runtimeHumanGate ? 'warning' : 'none',
      last_transition_time: currentExecutionObservedAt ?? executionObservedAt,
      observed_generation: item.lifecycle.observed_generation,
      ref: runtimeHumanGate
        ? Array.isArray(currentAttempt?.human_gate_refs)
          ? currentAttempt.human_gate_refs.map(stringValue).find(Boolean) ?? null
          : null
        : null,
    }),
    condition({
      type: 'NeedsSystemRepair',
      status: systemAttention ? 'True' : 'False',
      reason: systemAttention
        ? 'complete_current_repair_route_observed'
        : repairRoute.declared
          ? 'repair_route_incomplete_or_not_current'
          : 'no_current_repair_route',
      message: systemAttention
        ? repairRoute.issue!
        : 'Execution history does not provide a complete current repair route.',
      owner: systemAttention ? repairRoute.responsible_component! : 'opl_framework',
      severity: systemAttention ? 'warning' : repairRoute.declared ? 'info' : 'none',
      last_transition_time: executionObservedAt,
      observed_generation: item.lifecycle.observed_generation,
    }),
    condition({
      type: 'TelemetryObserved',
      status: telemetryConditionObserved ? 'True' : telemetryState === 'missing' ? 'Unknown' : 'False',
      reason: telemetryState === 'observed'
        ? 'token_usage_observed'
        : cumulativeTelemetryObservedWithNoApplicableCurrentStage
          ? 'cumulative_token_usage_observed_current_stage_not_applicable'
          : `token_usage_${telemetryState}`,
      message: telemetryState === 'observed'
        ? 'Current-stage and cumulative token usage are observed.'
        : cumulativeTelemetryObservedWithNoApplicableCurrentStage
          ? 'Cumulative token usage is observed; current-stage telemetry is not applicable.'
          : 'Token usage is missing, partial, or stale.',
      owner: 'opl_framework',
      severity: telemetryState === 'stale' ? 'warning' : 'none',
      last_transition_time: executionObservedAt,
      observed_generation: item.lifecycle.observed_generation,
    }),
    ...(latestExecution.state === 'failed' ? [condition({
      type: 'ExecutionFailed',
      status: 'True',
      reason: systemAttention
        ? 'current_failure_has_repair_route'
        : currentAttempt === latest
          ? 'current_failure_without_complete_repair_route'
          : 'historical_failure_is_diagnostic_only',
      message: stringValue(latest.blocked_reason) ?? 'The latest execution attempt failed.',
      owner: 'opl_framework',
      severity: systemAttention ? 'error' : currentAttempt === latest ? 'warning' : 'info',
      last_transition_time: executionObservedAt,
      observed_generation: item.lifecycle.observed_generation,
    })] : []),
  ];

  return applyDiagnosticStageRuns(withProjectedWorkItemPrimaryState({
    ...item,
    execution: {
      state: currentExecutionState,
      stage_id: currentAttempt ? stringValue(currentAttempt.stage_id) : null,
      stage_status: currentExecution?.effectiveRuntimeStatus ?? null,
      current_stage_id: currentStageId,
      current_stage_display_name: currentStageId ? item.lifecycle.current_stage_display_name : null,
      next_stage_id: currentStageId ? item.execution.next_stage_id : null,
      next_stage_display_name: currentStageId ? item.execution.next_stage_display_name : null,
      attempt_id: currentAttempt ? stringValue(currentAttempt.stage_attempt_id) : null,
      attempt_ids: attemptIds.slice(0, attemptRefLimit),
      workflow_id: currentAttempt ? attemptWorkflowId(currentAttempt) : null,
      provider_kind: currentAttempt ? stringValue(currentAttempt.provider_kind) : null,
      started_at: currentAttempt
        ? stringValue(record(currentAttempt.provider_run).started_at) ?? stringValue(currentAttempt.created_at)
        : null,
      last_heartbeat_at: currentAttempt
        ? stringValue(record(currentAttempt.provider_run).last_heartbeat_at)
        : null,
      updated_at: currentExecutionObservedAt,
      running_proof_status: currentExecution?.currentness.running_proof_status ?? 'not_applicable',
      diagnostic_reason: currentExecution?.currentness.reason
        ? currentExecution.currentness.reason
        : currentExecution?.state === 'failed'
          ? stringValue(currentAttempt?.blocked_reason)
          : runtimeHumanGate
            ? 'runtime_human_gate_requires_owner_decision'
            : currentExecution?.state === 'queued' && stringValue(currentAttempt?.provider_kind) === 'temporal'
              ? currentExecution.runtimeObservation.reason
              : attempts.length > 0 && !currentAttempt
                ? 'historical_attempts_not_current_business_execution'
                : null,
      review_chain: reviewChain,
      quality_budget: managedQualityBudget
        ? {
            state: budgetStopReason ? 'exhausted' : 'available',
            scope_id: currentQualityCycleId,
            max_attempts: maxAttempts,
            attempts_used: attemptsUsed,
            attempts_remaining: maxAttempts === null ? null : Math.max(0, maxAttempts - attemptsUsed),
            max_elapsed_ms: numberValue(scopeBudget.max_elapsed_ms),
            elapsed_ms: numberValue(budgetUsage.elapsed_ms),
            max_tokens: numberValue(scopeBudget.max_tokens),
            tokens_used: numberValue(budgetUsage.tokens_used),
            token_observation_status: budgetUsage.token_observation_status === 'observed'
              ? 'observed'
              : 'missing',
            stop_reason: budgetStopReason,
          }
        : item.execution.quality_budget,
    },
    attention,
    action: runtimeHumanGate
      ? humanGateAction(item, currentAttempt!)
      : systemAttention
        ? systemRepairAction({
            itemId: item.item_id,
            responsibleComponent: repairRoute.responsible_component!,
            issue: repairRoute.issue!,
            repairAction: repairRoute.repair_action!,
          })
        : item.action,
    stage_map: item.stage_map.map((stage) => {
      const stageProjection = tokenObservation({
        projections: attemptProjections
          .filter(({ attempt }) => stringValue(attempt.stage_id) === stage.stage_id)
          .map(({ projection }) => projection),
        observedAt: stringValue(attempts.find((attempt) => stringValue(attempt.stage_id) === stage.stage_id)?.updated_at),
      });
      return {
        ...stage,
        state: runtimeHumanGate && stage.stage_id === currentStageId
          ? 'waiting_user'
          : systemAttention && stage.stage_id === currentStageId
            ? 'system_attention'
            : stage.state,
        usage: stageProjection.state === 'observed' ? stageProjection : null,
      };
    }),
    telemetry: {
      state: telemetryState,
      current_stage: currentStageTokens,
      cumulative: cumulativeTokens,
      missing_reason: telemetryState === 'observed'
        ? null
        : currentStageTokens.missing_reason ?? cumulativeTokens.missing_reason,
    },
    conditions,
    freshness: {
      ...item.freshness,
      state: stale ? 'stale' : 'current',
      execution_observed_at: executionObservedAt,
      last_transition_time: item.lifecycle.control_updated_at
        ?? currentExecutionObservedAt
        ?? item.freshness.last_transition_time,
      reason: stale ? 'runtime_running_claim_lacks_current_proof' : item.freshness.reason,
    },
    source_refs: [
      ...item.source_refs,
      ...attemptIds.slice(0, attemptRefLimit).map((attemptId) => ({
        ref_kind: 'sqlite' as const,
        ref: `${queueDb}#stage_attempts/${attemptId}`,
        role: 'stage_attempt_execution_evidence',
      })),
      ...attempts.slice(0, attemptRefLimit).flatMap((attempt) => {
        const launch = attemptStageRunLaunch(attempt);
        const stageRunId = stringValue(launch.stage_run_id);
        return stageRunId ? [{
          ref_kind: 'sqlite' as const,
          ref: `${queueDb}#stage_run_launches/${stageRunId}`,
          role: 'stage_run_terminal_execution_evidence',
        }] : [];
      }),
    ],
  }), diagnosticStageRuns, queueDb, attemptRefLimit);
}
