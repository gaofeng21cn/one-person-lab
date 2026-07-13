import fs from 'node:fs';
import path from 'node:path';

import { isRecord } from '../../kernel/contract-validation.ts';
import { stringValue as optionalString, type JsonRecord } from '../../kernel/json-record.ts';
import { resolveStandardAgentByDomainId } from '../../kernel/standard-agent-registry.ts';
import {
  actionContext,
  noActionContext,
  runningActionContext,
} from './runtime-tray-action.ts';
import type { RuntimeTrayItem } from './runtime-tray-snapshot-types.ts';
import {
  buildStageAttemptRuntimeCurrentness,
  buildStageAttemptUsageProjection,
  listStageAttempts,
  openFamilyRuntimeSqlite,
  summarizeStageAttemptUsageProjections,
} from '../runway/public/app-state.ts';
import { resolveOplStatePaths } from '../../kernel/runtime-state-paths.ts';
import { listWorkspaceBindings, type WorkspaceBinding } from '../workspace/public/app-state.ts';

const RUNNING_STATUSES = new Set(['running']);
const ATTENTION_STATUSES = new Set(['blocked', 'dead_lettered', 'failed', 'human_gate']);
const MAX_ATTEMPT_REFS_PER_WORK_UNIT = 8;
const FAST_WORK_UNITS_PER_LANE = 1;

function firstString(...values: unknown[]) {
  for (const value of values) {
    const text = optionalString(value);
    if (text) {
      return text;
    }
  }
  return null;
}

function recordValue(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeStatus(value: unknown) {
  return optionalString(value)?.trim().toLowerCase().replace(/\s+/g, '_') ?? 'unknown';
}

function queueDbPath() {
  return path.join(resolveOplStatePaths().state_dir, 'family-runtime', 'queue.sqlite');
}

function readStageAttempts(profile: 'fast' | 'full') {
  const queueDb = queueDbPath();
  if (!fs.existsSync(queueDb)) {
    return { queueDb, attempts: [] as JsonRecord[] };
  }
  const db = openFamilyRuntimeSqlite(queueDb, { readOnly: true });
  try {
    return {
      queueDb,
      attempts: listStageAttempts(db, profile === 'fast'
        ? {
            workUnitLimitPerLane: FAST_WORK_UNITS_PER_LANE,
            attemptLimitPerWorkUnit: MAX_ATTEMPT_REFS_PER_WORK_UNIT,
          }
        : undefined).filter(isRecord),
    };
  } catch {
    return { queueDb, attempts: [] as JsonRecord[] };
  } finally {
    db.close();
  }
}

function attemptWorkUnitId(attempt: JsonRecord) {
  const locator = recordValue(attempt.workspace_locator);
  return firstString(
    locator.work_unit_id,
    locator.task_or_work_unit_ref,
    locator.task_ref,
    attempt.task_id,
    attempt.stage_attempt_id,
  );
}

function attemptLane(status: string): 'running' | 'attention' | 'recent' {
  if (RUNNING_STATUSES.has(status)) {
    return 'running';
  }
  if (ATTENTION_STATUSES.has(status)) {
    return 'attention';
  }
  return 'recent';
}

function attemptUsage(attempt: JsonRecord, projectionScope: string) {
  return buildStageAttemptUsageProjection({
    stageAttemptId: firstString(attempt.stage_attempt_id) ?? 'unknown-stage-attempt',
    projectionScope,
    status: normalizeStatus(attempt.status),
    blockedReason: firstString(attempt.blocked_reason),
    executorKind: firstString(attempt.executor_kind),
    retryBudget: recordValue(attempt.retry_budget),
    attemptCount: numberValue(attempt.attempt_count) ?? 1,
    providerRun: recordValue(attempt.provider_run),
    activityEvents: Array.isArray(attempt.activity_events) ? attempt.activity_events : [],
    routeImpact: recordValue(attempt.route_impact),
  });
}

function workspaceRoot(attempt: JsonRecord) {
  const locator = recordValue(attempt.workspace_locator);
  return firstString(locator.workspace_root, locator.command_cwd);
}

function bindingForAttempt(attempt: JsonRecord, bindings: WorkspaceBinding[]) {
  const domainId = firstString(attempt.domain_id);
  const agent = domainId ? resolveStandardAgentByDomainId(domainId) : null;
  const root = workspaceRoot(attempt);
  return bindings.find((binding) => {
    if (binding.status !== 'active') {
      return false;
    }
    if (root && path.resolve(binding.workspace_path) === path.resolve(root)) {
      return true;
    }
    return Boolean(domainId && [domainId, agent?.agent_id, agent?.project].includes(binding.project_id));
  }) ?? null;
}

function sourceRef(queueDb: string, attemptId: string) {
  return {
    ref_kind: 'sqlite',
    ref: `${queueDb}#stage_attempts/${attemptId}`,
    role: 'opl_family_runtime_stage_attempt',
    label: 'OPL family-runtime stage attempt',
  };
}

function actionSummary(status: string, lane: 'running' | 'attention' | 'recent') {
  if (lane === 'running') {
    return 'OPL stage attempt is running; domain completion remains owned by the domain agent.';
  }
  if (lane === 'attention') {
    return 'OPL stage attempt requires operator attention; inspect its provider receipt or typed blocker refs.';
  }
  if (status === 'completed') {
    return 'OPL stage attempt has terminal metadata; domain readiness still requires domain-owner evidence.';
  }
  return `OPL stage attempt is ${status}; no domain completion claim is implied.`;
}

function runtimeActionContext(
  status: string,
  lane: 'running' | 'attention' | 'recent',
  summary: string,
) {
  if (lane === 'running') {
    return runningActionContext(summary);
  }
  if (status === 'human_gate') {
    return actionContext('user', 'human_gate', summary);
  }
  if (status === 'failed' || status === 'dead_lettered') {
    return actionContext('infrastructure', 'infrastructure_recovery', summary);
  }
  if (lane === 'attention') {
    return actionContext('opl', 'handoff_review', summary);
  }
  return noActionContext(summary);
}

function projectAttemptGroup(input: {
  queueDb: string;
  attempts: JsonRecord[];
  bindings: WorkspaceBinding[];
}): RuntimeTrayItem & JsonRecord {
  const latest = input.attempts[0];
  const domainId = firstString(latest.domain_id) ?? 'unknown-domain';
  const workUnitId = attemptWorkUnitId(latest) ?? firstString(latest.stage_attempt_id) ?? 'unknown-work-unit';
  const status = normalizeStatus(latest.status);
  const lane = attemptLane(status);
  const providerRun = recordValue(latest.provider_run);
  const latestUsage = attemptUsage(latest, 'app_state_runtime_activity');
  const totalUsage = summarizeStageAttemptUsageProjections(
    input.attempts.map((attempt) => attemptUsage(attempt, 'app_state_runtime_activity_total')),
    'app_state_runtime_activity_total',
  );
  const runtimeCurrentness = buildStageAttemptRuntimeCurrentness({
    ledgerStatus: status,
    providerKind: firstString(latest.provider_kind) ?? 'unknown',
    providerRun,
  });
  const agent = resolveStandardAgentByDomainId(domainId);
  const binding = bindingForAttempt(latest, input.bindings);
  const attemptIds = input.attempts
    .map((attempt) => firstString(attempt.stage_attempt_id))
    .filter((entry): entry is string => Boolean(entry))
    .slice(0, MAX_ATTEMPT_REFS_PER_WORK_UNIT);
  const closeoutRefs = stringList(latest.closeout_refs);
  const summary = actionSummary(status, lane);
  const action = runtimeActionContext(status, lane, summary);
  const runtimeBlockerSummary = firstString(latest.blocked_reason);
  const projectLabel = agent?.label ?? binding?.label ?? domainId;

  return {
    item_id: `${domainId}:work-unit:${workUnitId}`,
    project_id: domainId,
    project_label: projectLabel,
    lane,
    title: workUnitId,
    status,
    status_label: `OPL runtime ${status}`,
    summary,
    updated_at: firstString(latest.updated_at, latest.created_at),
    command: null,
    workspace_path: workspaceRoot(latest) ?? binding?.workspace_path ?? null,
    workspace_binding_id: binding?.binding_id ?? null,
    workspace_label: binding?.label ?? null,
    runtime_owner: 'provider_backed_family_runtime',
    domain_owner: domainId,
    source_refs: attemptIds.map((attemptId) => sourceRef(input.queueDb, attemptId)),
    ...action,
    next_action_summary: summary,
    work_unit_id: workUnitId,
    active_run_id: firstString(latest.workflow_id, latest.stage_attempt_id),
    active_stage_id: firstString(latest.stage_id),
    active_stage_label: firstString(latest.stage_id),
    health_status: status,
    stage_started_at: firstString(providerRun.started_at, latest.created_at),
    last_heartbeat_at: firstString(providerRun.last_heartbeat_at, latest.updated_at),
    running_proof_status: firstString(runtimeCurrentness.running_proof_status) ?? 'not_applicable',
    running_proof_summary: firstString(runtimeCurrentness.reason)
      ?? (lane === 'running' ? 'running_confirmed' : 'not_running'),
    current_stage_usage: {
      telemetry_status: firstString(latestUsage.telemetry_status) ?? 'missing',
      total_tokens_observed: numberValue(latestUsage.token.total_tokens_observed),
      estimated_cost_usd_observed: numberValue(latestUsage.cost.estimated_cost_usd_observed),
      duration_ms_observed: numberValue(latestUsage.duration.duration_ms_observed),
      api_call_count_observed: numberValue(latestUsage.api_calls.count_observed),
      source_ref_count: latestUsage.source_refs.length,
    },
    task_total_usage: {
      telemetry_status: totalUsage.resource_usage_observed_attempt_count > 0 ? 'observed' : 'missing',
      total_tokens_observed: numberValue(totalUsage.token.total_tokens_observed),
      estimated_cost_usd_observed: numberValue(totalUsage.cost.estimated_cost_usd_observed),
      duration_ms_observed: numberValue(totalUsage.duration.duration_ms_observed),
      api_call_count_observed: numberValue(totalUsage.api_calls.count_observed),
      observed_attempt_count: numberValue(totalUsage.resource_usage_observed_attempt_count),
    },
    usage_telemetry_status: totalUsage.resource_usage_observed_attempt_count > 0 ? 'observed' : 'missing',
    blockers: runtimeBlockerSummary ? [runtimeBlockerSummary] : [],
    runtime_blocker_summary: runtimeBlockerSummary,
    typed_blocker_summary: null,
    typed_blocker_owner: null,
    resolution_route: summary,
    stage_attempt_ids: attemptIds,
    runtime_readback_source: 'opl_family_runtime_stage_attempt_projection',
    runtime_attempt_status: status,
    runtime_closeout_observed: closeoutRefs.length > 0 || Boolean(latest.closeout_receipt_status),
    runtime_closeout_refs: closeoutRefs,
    provider_kind: firstString(latest.provider_kind),
    workflow_id: firstString(latest.workflow_id),
    source_fingerprint: firstString(latest.source_fingerprint),
    authority_boundary: {
      projection_only: true,
      can_read_domain_artifact_body: false,
      can_read_domain_progress_body: false,
      can_write_domain_truth: false,
      can_create_owner_receipt: false,
      can_create_typed_blocker: false,
      can_authorize_quality_verdict: false,
      provider_completion_is_domain_ready: false,
    },
  };
}

export function buildAppStateRuntimeActivityItems(profile: 'fast' | 'full' = 'full') {
  const { queueDb, attempts } = readStageAttempts(profile);
  if (attempts.length === 0) {
    return [];
  }
  const groups = new Map<string, JsonRecord[]>();
  for (const attempt of attempts) {
    const domainId = firstString(attempt.domain_id);
    const workUnitId = attemptWorkUnitId(attempt);
    if (!domainId || !workUnitId) {
      continue;
    }
    const key = `${domainId}\u0000${workUnitId}`;
    const grouped = groups.get(key) ?? [];
    if (grouped.length < MAX_ATTEMPT_REFS_PER_WORK_UNIT) {
      grouped.push(attempt);
      groups.set(key, grouped);
    }
  }
  const bindings = listWorkspaceBindings();
  return [...groups.values()].map((groupedAttempts) => projectAttemptGroup({
    queueDb,
    attempts: groupedAttempts,
    bindings,
  }));
}
