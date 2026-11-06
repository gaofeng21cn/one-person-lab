import {
  buildModelRouteCostProjection,
  buildStageAttemptUsageProjection,
} from '../family-runtime-stage-attempt-usage.ts';
import { parseJsonText } from '../../../kernel/json-file.ts';
import { record } from '../../../kernel/json-record.ts';
import {
  executionScopeColumnsFromRow,
  executionScopeFromRow,
} from '../family-runtime-execution-scope-persistence.ts';
import type {
  StageAttemptCloseoutRow,
  StageAttemptRow,
  StageAttemptSignalRow,
} from './types.ts';

export function parseJsonObject(value: string) {
  return record(parseJsonText(value));
}

export function parseJsonList(value: string) {
  const parsed = parseJsonText(value);
  return Array.isArray(parsed) ? parsed : [];
}

export function stageAttemptToPayload(row: StageAttemptRow) {
  const scopeColumns = executionScopeColumnsFromRow(row);
  const retryBudget = parseJsonObject(row.retry_budget_json);
  const providerRun = parseJsonObject(row.provider_run_json);
  const activityEvents = parseJsonList(row.activity_events_json);
  const routeImpact = parseJsonObject(row.route_impact_json);
  const stageAttemptExecutorPolicy = row.stage_attempt_executor_policy_json
    ? parseJsonObject(row.stage_attempt_executor_policy_json)
    : {};
  const hasStageAttemptExecutorPolicy = Object.keys(stageAttemptExecutorPolicy).length > 0;
  const usageObservation = row.usage_observation_json
    ? parseJsonObject(row.usage_observation_json)
    : null;
  const usageProjection = buildStageAttemptUsageProjection({
    stageAttemptId: row.stage_attempt_id,
    status: row.status,
    blockedReason: row.blocked_reason,
    executorKind: row.executor_kind,
    retryBudget,
    attemptCount: row.attempt_count,
    providerRun,
    activityEvents,
    routeImpact,
    usageObservation,
  });
  const modelRouteCostProjection = buildModelRouteCostProjection({
    stageAttemptId: row.stage_attempt_id,
    status: row.status,
    blockedReason: row.blocked_reason,
    executorKind: row.executor_kind,
    retryBudget,
    attemptCount: row.attempt_count,
    providerRun,
    activityEvents,
    routeImpact,
    usageProjection,
  });
  return {
    stage_attempt_id: row.stage_attempt_id,
    idempotency_key: row.idempotency_key,
    provider_kind: row.provider_kind,
    workflow_id: row.workflow_id,
    domain_id: row.domain_id,
    stage_id: row.stage_id,
    workspace_locator: parseJsonObject(row.workspace_locator_json),
    source_fingerprint: row.source_fingerprint,
    executor_kind: row.executor_kind,
    stage_attempt_executor_policy: hasStageAttemptExecutorPolicy ? stageAttemptExecutorPolicy : null,
    stage_run_id: row.stage_run_id ?? null,
    ...scopeColumns,
    execution_scope: executionScopeFromRow(row),
    quality_cycle_id: row.quality_cycle_id ?? null,
    attempt_role: row.attempt_role ?? null,
    quality_round_index: row.quality_round_index ?? null,
    parent_attempt_ref: row.parent_attempt_ref ?? null,
    input_artifact_refs: row.input_artifact_refs_json ? parseJsonList(row.input_artifact_refs_json) : [],
    reviewed_artifact_hashes: row.reviewed_artifact_hashes_json ? parseJsonList(row.reviewed_artifact_hashes_json) : [],
    quality_source_refs: row.quality_source_refs_json ? parseJsonList(row.quality_source_refs_json) : [],
    quality_knowledge_refs: row.quality_knowledge_refs_json ? parseJsonList(row.quality_knowledge_refs_json) : [],
    quality_skill_refs: row.quality_skill_refs_json ? parseJsonList(row.quality_skill_refs_json) : [],
    quality_policy_refs: row.quality_policy_refs_json ? parseJsonList(row.quality_policy_refs_json) : [],
    knowledge_refs: row.quality_knowledge_refs_json ? parseJsonList(row.quality_knowledge_refs_json) : [],
    skill_refs: row.quality_skill_refs_json ? parseJsonList(row.quality_skill_refs_json) : [],
    policy_refs: row.quality_policy_refs_json ? parseJsonList(row.quality_policy_refs_json) : [],
    quality_stage_goal_refs: row.quality_stage_goal_refs_json ? parseJsonList(row.quality_stage_goal_refs_json) : [],
    quality_lineage_refs: row.quality_lineage_refs_json ? parseJsonList(row.quality_lineage_refs_json) : [],
    quality_rubric_refs: row.quality_rubric_refs_json ? parseJsonList(row.quality_rubric_refs_json) : [],
    prior_finding_refs: row.prior_finding_refs_json ? parseJsonList(row.prior_finding_refs_json) : [],
    repair_map_refs: row.repair_map_refs_json ? parseJsonList(row.repair_map_refs_json) : [],
    quality_context: row.quality_context_json ? parseJsonObject(row.quality_context_json) : {},
    quality_role_prompt_ref: row.quality_role_prompt_ref ?? null,
    execution_session_ref: row.execution_session_ref ?? null,
    usage_observation: usageObservation,
    context_manifest_ref: row.context_manifest_ref ?? null,
    context_manifest: row.context_manifest_json ? parseJsonObject(row.context_manifest_json) : null,
    no_context_inheritance: row.no_context_inheritance === null || row.no_context_inheritance === undefined
      ? null
      : row.no_context_inheritance === 1,
    status: row.status,
    checkpoint_refs: parseJsonList(row.checkpoint_refs_json),
    closeout_refs: parseJsonList(row.closeout_refs_json),
    human_gate_refs: parseJsonList(row.human_gate_refs_json),
    retry_budget: retryBudget,
    attempt_count: row.attempt_count,
    task_id: row.task_id,
    blocked_reason: row.blocked_reason,
    provider_receipt: parseJsonObject(row.provider_receipt_json),
    provider_run: providerRun,
    activity_events: activityEvents,
    route_impact: routeImpact,
    usage_projection: usageProjection,
    model_route_cost_projection: modelRouteCostProjection,
    closeout_receipt_status: row.closeout_receipt_status,
    archived: row.archived_at !== null,
    archived_at: row.archived_at,
    archived_reason: row.archived_reason,
    archived_source: row.archived_source,
    authority_boundary: {
      opl: 'attempt_control_metadata_and_projection_only',
      domain: 'truth_quality_artifact_gate_owner',
      executor: 'codex_cli_or_domain_selected_executor',
    },
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function stageAttemptSignalToPayload(row: StageAttemptSignalRow) {
  return {
    signal_id: row.signal_id,
    stage_attempt_id: row.stage_attempt_id,
    signal_kind: row.signal_kind,
    payload: parseJsonObject(row.payload_json),
    source: row.source,
    created_at: row.created_at,
  };
}

export function stageAttemptCloseoutToPayload(row: StageAttemptCloseoutRow) {
  return {
    closeout_id: row.closeout_id,
    stage_attempt_id: row.stage_attempt_id,
    packet: parseJsonObject(row.packet_json),
    created_at: row.created_at,
  };
}

export function parseStageAttemptJsonObject(value: string) {
  return parseJsonObject(value);
}

export function parseStageAttemptJsonList(value: string) {
  return parseJsonList(value);
}
