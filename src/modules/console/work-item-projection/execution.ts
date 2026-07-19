import fs from 'node:fs';
import path from 'node:path';

import { isRecord } from '../../../kernel/contract-validation.ts';
import { record, stringValue, type JsonRecord } from '../../../kernel/json-record.ts';
import { resolveOplStatePaths } from '../../../kernel/runtime-state-paths.ts';
import { resolveStandardAgent } from '../../../kernel/standard-agent-registry.ts';
import {
  buildStageAttemptRuntimeCurrentness,
  buildStageAttemptUsageProjection,
  listStageAttempts,
  openFamilyRuntimeSqlite,
} from '../../runway/public/app-state.ts';
import { canonicalWorkspacePath } from './catalog.ts';
import { systemRepairAction } from './inventory-presentation.ts';
import { withProjectedWorkItemPrimaryState } from './primary-state.ts';
import type {
  ProjectCatalogEntry,
  TokenObservation,
  WorkItemCondition,
  WorkItemExecutionState,
  WorkItemProjectionDiagnostic,
  WorkItemProjectionItem,
} from './types.ts';

const MAX_DIAGNOSTIC_ATTEMPTS = 100;
const QUEUED_STATUSES = new Set(['created', 'pending', 'queued', 'scheduled']);
const SUCCEEDED_STATUSES = new Set(['completed', 'succeeded', 'closed']);
const FAILED_STATUSES = new Set(['blocked', 'dead_lettered', 'failed']);

function normalizedStatus(value: unknown) {
  return stringValue(value)?.toLowerCase().replace(/[\s-]+/g, '_') ?? 'unknown';
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function attemptWorkspacePath(attempt: JsonRecord) {
  return stringValue(record(attempt.workspace_locator).workspace_root);
}

function attemptWorkItemId(attempt: JsonRecord) {
  const locator = record(attempt.workspace_locator);
  const taskIntake = record(locator.task_intake_ref);
  return stringValue(locator.work_item_id)
    ?? stringValue(locator.study_id)
    ?? stringValue(locator.work_unit_id)
    ?? stringValue(locator.task_or_work_unit_ref)
    ?? stringValue(locator.task_ref)
    ?? stringValue(taskIntake.work_item_id)
    ?? stringValue(taskIntake.study_id);
}

function attemptAgentId(attempt: JsonRecord) {
  const domainId = stringValue(attempt.domain_id);
  return domainId ? resolveStandardAgent(domainId)?.agent_id ?? domainId : null;
}

function newestFirst(left: JsonRecord, right: JsonRecord) {
  const updated = Date.parse(stringValue(right.updated_at) ?? '') - Date.parse(stringValue(left.updated_at) ?? '');
  if (Number.isFinite(updated) && updated !== 0) return updated;
  return (stringValue(right.stage_attempt_id) ?? '').localeCompare(stringValue(left.stage_attempt_id) ?? '');
}

function usageProjection(attempt: JsonRecord, scope: string) {
  return buildStageAttemptUsageProjection({
    stageAttemptId: stringValue(attempt.stage_attempt_id) ?? 'unknown-stage-attempt',
    projectionScope: scope,
    status: normalizedStatus(attempt.status),
    blockedReason: stringValue(attempt.blocked_reason),
    executorKind: stringValue(attempt.executor_kind),
    retryBudget: record(attempt.retry_budget),
    attemptCount: numberValue(attempt.attempt_count) ?? 1,
    providerRun: record(attempt.provider_run),
    activityEvents: Array.isArray(attempt.activity_events) ? attempt.activity_events : [],
    routeImpact: record(attempt.route_impact),
  });
}

function tokenObservation(input: {
  projections: ReturnType<typeof usageProjection>[];
  observedAt: string | null;
  stale?: boolean;
}): TokenObservation {
  const observed = input.projections.filter((projection) => projection.token.observed_count > 0);
  if (observed.length === 0) {
    return {
      state: input.stale ? 'stale' : 'missing',
      input_tokens: null,
      output_tokens: null,
      total_tokens: null,
      observed_at: null,
      missing_reason: input.stale
        ? 'stage_attempt_projection_is_stale'
        : 'no_stage_attempt_usage_telemetry_observed',
      source_refs: [],
    };
  }
  return {
    state: input.stale ? 'stale' : 'observed',
    input_tokens: observed.reduce((total, projection) => total + (projection.token.input_tokens_observed ?? 0), 0),
    output_tokens: observed.reduce((total, projection) => total + (projection.token.output_tokens_observed ?? 0), 0),
    total_tokens: observed.reduce((total, projection) => total + (projection.token.total_tokens_observed ?? 0), 0),
    observed_at: input.observedAt,
    missing_reason: null,
    source_refs: [...new Set(observed.flatMap((projection) => projection.token.source_refs))],
  };
}

function missingToken(reason: string): TokenObservation {
  return {
    state: 'missing',
    input_tokens: null,
    output_tokens: null,
    total_tokens: null,
    observed_at: null,
    missing_reason: reason,
    source_refs: [],
  };
}

function executionState(latest: JsonRecord) {
  const ledgerStatus = normalizedStatus(latest.status);
  const providerRun = record(latest.provider_run);
  const currentness = buildStageAttemptRuntimeCurrentness({
    ledgerStatus,
    providerKind: stringValue(latest.provider_kind) ?? 'unknown',
    providerRun,
  });
  let state: WorkItemExecutionState = 'unknown';
  if (ledgerStatus === 'running') {
    state = currentness.running_proof_status === 'running_confirmed' ? 'running' : 'unknown';
  } else if (QUEUED_STATUSES.has(ledgerStatus)) {
    state = 'queued';
  } else if (SUCCEEDED_STATUSES.has(ledgerStatus)) {
    state = 'succeeded';
  } else if (FAILED_STATUSES.has(ledgerStatus)) {
    state = 'failed';
  }
  return { state, ledgerStatus, currentness };
}

function firstRecord(...values: unknown[]) {
  return values.find(isRecord) ?? {};
}

function currentRepairRoute(item: WorkItemProjectionItem, latest: JsonRecord) {
  const routeImpact = record(latest.route_impact);
  const route = firstRecord(
    routeImpact.current_repair_route,
    routeImpact.repair_route,
    routeImpact.selected_repair_route,
  );
  const binding = record(route.binding);
  const workspacePath = stringValue(route.workspace_path) ?? stringValue(binding.workspace_path);
  const workItemId = stringValue(route.work_item_id) ?? stringValue(binding.work_item_id);
  const observedGeneration = stringValue(route.observed_generation)
    ?? stringValue(route.work_item_generation)
    ?? stringValue(binding.observed_generation);
  const responsibleComponent = stringValue(route.responsible_component) ?? stringValue(route.owner);
  const issue = stringValue(route.issue) ?? stringValue(route.issue_summary);
  const impact = stringValue(route.impact) ?? stringValue(route.impact_summary);
  const repairAction = stringValue(route.repair_action) ?? stringValue(route.repair_action_summary);
  const expectedOutcome = stringValue(route.expected_outcome);
  const identityMatches = Boolean(
    workspacePath
      && canonicalWorkspacePath(workspacePath) === canonicalWorkspacePath(item.identity.workspace_path)
      && workItemId === item.identity.work_item_id
      && observedGeneration === item.lifecycle.observed_generation
  );
  const complete = Boolean(
    route.blocking_current_progress === true
      && identityMatches
      && responsibleComponent
      && issue
      && impact
      && repairAction
      && expectedOutcome
  );
  return {
    declared: Object.keys(route).length > 0,
    complete,
    responsible_component: responsibleComponent,
    issue,
    impact,
    repair_action: repairAction,
    expected_outcome: expectedOutcome,
  };
}

function condition(input: Omit<WorkItemCondition, 'ref'> & { ref?: string | null }): WorkItemCondition {
  return { ...input, ref: input.ref ?? null };
}

export function readWorkItemStageAttempts() {
  const queueDb = path.join(resolveOplStatePaths().state_dir, 'family-runtime', 'queue.sqlite');
  if (!fs.existsSync(queueDb)) {
    return {
      queue_db: queueDb,
      attempts: [] as JsonRecord[],
      quality_cycles: [] as JsonRecord[],
      diagnostics: [] as WorkItemProjectionDiagnostic[],
    };
  }
  const db = openFamilyRuntimeSqlite(queueDb, { readOnly: true });
  try {
    const qualityCycleTable = db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'stage_quality_cycles'",
    ).get();
    const qualityCycles = qualityCycleTable
      ? (db.prepare('SELECT * FROM stage_quality_cycles').all() as Array<Record<string, unknown>>).map((row) => {
          try {
            return {
              ...row,
              policy: JSON.parse(String(row.policy_json ?? '{}')),
              state: JSON.parse(String(row.state_json ?? '{}')),
            } as JsonRecord;
          } catch {
            return { ...row, policy: {}, state: {} } as JsonRecord;
          }
        })
      : [];
    return {
      queue_db: queueDb,
      attempts: listStageAttempts(db, { archived: 'exclude' }).filter(isRecord),
      quality_cycles: qualityCycles,
      diagnostics: [] as WorkItemProjectionDiagnostic[],
    };
  } catch (error) {
    return {
      queue_db: queueDb,
      attempts: [] as JsonRecord[],
      quality_cycles: [] as JsonRecord[],
      diagnostics: [{
        reason: 'stage_attempt_ledger_read_failed',
        ref: queueDb,
        details: { error: error instanceof Error ? error.message : String(error) },
      }],
    };
  } finally {
    db.close();
  }
}

export function joinAttemptsToWorkItems(input: {
  items: WorkItemProjectionItem[];
  projects: ProjectCatalogEntry[];
  attempts: JsonRecord[];
  qualityCycles?: JsonRecord[];
  queueDb: string;
  attemptRefLimit: number;
}) {
  const diagnostics: WorkItemProjectionDiagnostic[] = [];
  const projectByPath = new Map(input.projects.map((project) => [canonicalWorkspacePath(project.workspace_path), project]));
  const itemByIdentity = new Map(input.items.map((item) => [
    `${item.identity.project_id}\u0000${item.identity.work_item_id}`,
    item,
  ]));
  const grouped = new Map<string, JsonRecord[]>();
  const qualityCycleById = new Map(
    (input.qualityCycles ?? []).map((cycle) => [stringValue(cycle.quality_cycle_id), cycle]),
  );
  for (const attempt of input.attempts) {
    const workspacePath = attemptWorkspacePath(attempt);
    const workItemId = attemptWorkItemId(attempt);
    if (!workspacePath || !workItemId) {
      if (diagnostics.length < MAX_DIAGNOSTIC_ATTEMPTS) {
        diagnostics.push({
          reason: 'stage_attempt_missing_explicit_workspace_or_work_item_identity',
          ref: stringValue(attempt.stage_attempt_id) ?? undefined,
        });
      }
      continue;
    }
    const project = projectByPath.get(canonicalWorkspacePath(workspacePath));
    if (!project) {
      if (diagnostics.length < MAX_DIAGNOSTIC_ATTEMPTS) {
        diagnostics.push({
          reason: 'stage_attempt_workspace_not_in_project_catalog',
          work_item_id: workItemId,
          ref: workspacePath,
        });
      }
      continue;
    }
    if (attemptAgentId(attempt) !== project.agent_id) {
      diagnostics.push({
        reason: 'stage_attempt_agent_project_identity_mismatch',
        agent_id: attemptAgentId(attempt) ?? undefined,
        project_id: project.project_id,
        work_item_id: workItemId,
      });
      continue;
    }
    const item = itemByIdentity.get(`${project.project_id}\u0000${workItemId}`);
    if (!item) {
      if (diagnostics.length < MAX_DIAGNOSTIC_ATTEMPTS) {
        diagnostics.push({
          reason: 'stage_attempt_work_item_not_in_domain_inventory',
          agent_id: project.agent_id,
          project_id: project.project_id,
          work_item_id: workItemId,
        });
      }
      continue;
    }
    grouped.set(item.item_id, [...(grouped.get(item.item_id) ?? []), attempt]);
  }

  const items: WorkItemProjectionItem[] = input.items.map((item): WorkItemProjectionItem => {
    const attempts = [...(grouped.get(item.item_id) ?? [])].sort(newestFirst);
    if (attempts.length === 0) {
      return withProjectedWorkItemPrimaryState({
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
      });
    }
    const latest = attempts[0]!;
    const latestExecution = executionState(latest);
    const currentStageId = item.lifecycle.business_state === 'active'
      ? item.lifecycle.current_stage_id
      : null;
    const currentStageAttempts = currentStageId
      ? attempts.filter((attempt) => stringValue(attempt.stage_id) === currentStageId)
      : [];
    const currentAttempt = currentStageAttempts[0] ?? null;
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
    const systemAttention = item.lifecycle.business_state === 'active'
      && repairRoute.complete
      && item.attention.kind !== 'user';
    const attention = systemAttention
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
    const executionObservedAt = stringValue(latest.updated_at) ?? stringValue(latest.created_at);
    const currentExecutionObservedAt = currentAttempt
      ? stringValue(currentAttempt.updated_at) ?? stringValue(currentAttempt.created_at)
      : null;
    const currentExecutionState = currentExecution?.state ?? 'idle';
    const currentQualityCycleId = currentAttempt ? stringValue(currentAttempt.quality_cycle_id) : null;
    const currentQualityCycle = currentQualityCycleId
      ? qualityCycleById.get(currentQualityCycleId) ?? null
      : null;
    const currentQualityCycleState = record(currentQualityCycle?.state);
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
    const managedQualityBudget = currentQualityCycleId !== null && Object.keys(scopeBudget).length > 0;
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

    return withProjectedWorkItemPrimaryState({
      ...item,
      execution: {
        state: currentExecutionState,
        stage_id: currentAttempt ? stringValue(currentAttempt.stage_id) : null,
        stage_status: currentExecution?.ledgerStatus ?? null,
        current_stage_id: currentStageId,
        current_stage_display_name: currentStageId ? item.lifecycle.current_stage_display_name : null,
        next_stage_id: currentStageId ? item.execution.next_stage_id : null,
        next_stage_display_name: currentStageId ? item.execution.next_stage_display_name : null,
        attempt_id: currentAttempt ? stringValue(currentAttempt.stage_attempt_id) : null,
        attempt_ids: attemptIds.slice(0, input.attemptRefLimit),
        workflow_id: currentAttempt ? stringValue(currentAttempt.workflow_id) : null,
        provider_kind: currentAttempt ? stringValue(currentAttempt.provider_kind) : null,
        started_at: currentAttempt
          ? stringValue(record(currentAttempt.provider_run).started_at) ?? stringValue(currentAttempt.created_at)
          : null,
        last_heartbeat_at: currentAttempt
          ? stringValue(record(currentAttempt.provider_run).last_heartbeat_at)
          : null,
        updated_at: currentExecutionObservedAt,
        running_proof_status: currentExecution?.currentness.running_proof_status ?? 'not_applicable',
        diagnostic_reason: stale
          ? currentExecution!.currentness.reason
          : currentExecution?.state === 'failed'
            ? stringValue(currentAttempt?.blocked_reason)
            : attempts.length > 0 && !currentAttempt
              ? 'historical_attempts_not_current_business_execution'
              : null,
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
      action: systemAttention
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
          state: systemAttention && stage.stage_id === currentStageId ? 'system_attention' : stage.state,
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
        ...attemptIds.slice(0, input.attemptRefLimit).map((attemptId) => ({
          ref_kind: 'sqlite' as const,
          ref: `${input.queueDb}#stage_attempts/${attemptId}`,
          role: 'stage_attempt_execution_evidence',
        })),
      ],
    });
  });
  return { items, diagnostics };
}
