import fs from 'node:fs';
import path from 'node:path';

import { isRecord } from '../../kernel/contract-validation.ts';
import { readJsonFileOrNull } from '../../kernel/json-file.ts';
import { stringValue as optionalString, type JsonRecord } from '../../kernel/json-record.ts';
import { resolveStandardAgentByDomainId } from '../../kernel/standard-agent-registry.ts';
import {
  actionContext,
  noActionContext,
  runningActionContext,
} from './runtime-tray-action.ts';
import type { RuntimeTrayItem, RuntimeTraySourceRef } from './runtime-tray-snapshot-types.ts';
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
const DOMAIN_BLOCKING_STATUSES = new Set([
  'blocked',
  'failed',
  'repair_required',
  'system_attention_required',
  'typed_blocked',
]);
const DOMAIN_DELIVERED_STATUSES = new Set([
  'completed',
  'delivered',
  'publication_ready',
  'submission_ready',
  'succeeded',
]);
const MAX_ATTEMPT_REFS_PER_WORK_UNIT = 8;
const FAST_ATTEMPT_ONLY_WORK_UNITS_PER_LANE = 1;
const NO_ATTEMPT_TELEMETRY_REASON = 'no_stage_attempt_recorded_for_registered_work_item';
const NO_USAGE_TELEMETRY_REASON = 'no_stage_attempt_usage_telemetry_observed';

type RuntimeActivityItem = RuntimeTrayItem & JsonRecord;

type RegisteredStudyInventoryItem = {
  key: string;
  domainId: string;
  studyId: string;
  binding: WorkspaceBinding;
  item: RuntimeActivityItem;
};

function firstString(...values: unknown[]) {
  for (const value of values) {
    const text = optionalString(value);
    if (text) {
      return text;
    }
  }
  return null;
}

function firstBoolean(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'boolean') {
      return value;
    }
  }
  return null;
}

function recordValue(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function recordList(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
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

function humanizeIdentifier(value: string | null) {
  if (!value) {
    return null;
  }
  const text = value.replace(/[_:/-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return text ? `${text[0]!.toUpperCase()}${text.slice(1)}` : null;
}

function componentLabel(value: string | null, domainId: string) {
  const agent = resolveStandardAgentByDomainId(domainId);
  if (!value) {
    return agent?.label ?? domainId;
  }
  const normalized = value.trim().toLowerCase();
  if ([domainId, agent?.agent_id, agent?.project].filter(Boolean).some((entry) => entry?.toLowerCase() === normalized)) {
    return agent?.label ?? humanizeIdentifier(value) ?? value;
  }
  if (['one-person-lab', 'opl', 'opl_framework'].includes(normalized)) {
    return 'OPL Framework';
  }
  return humanizeIdentifier(value) ?? value;
}

function queueDbPath() {
  return path.join(resolveOplStatePaths().state_dir, 'family-runtime', 'queue.sqlite');
}

function readStageAttempts() {
  const queueDb = queueDbPath();
  if (!fs.existsSync(queueDb)) {
    return { queueDb, attempts: [] as JsonRecord[] };
  }
  const db = openFamilyRuntimeSqlite(queueDb, { readOnly: true });
  try {
    return {
      queueDb,
      attempts: listStageAttempts(db, {
        archived: 'exclude',
      }).filter(isRecord),
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
    locator.study_id,
    attempt.task_id,
    attempt.stage_attempt_id,
  );
}

function attemptStudyId(attempt: JsonRecord) {
  const locator = recordValue(attempt.workspace_locator);
  const taskIntakeRef = recordValue(locator.task_intake_ref);
  return firstString(
    locator.study_id,
    locator.quest_id,
    locator.target_study_id,
    taskIntakeRef.study_id,
    attempt.study_id,
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

function bindingDomainMatches(binding: WorkspaceBinding, domainId: string) {
  const agent = resolveStandardAgentByDomainId(domainId);
  return [domainId, agent?.agent_id, agent?.project].filter(Boolean).includes(binding.project_id);
}

function preferredBinding(bindings: WorkspaceBinding[]) {
  return [...bindings].sort((left, right) => {
    const statusRank = (binding: WorkspaceBinding) => binding.status === 'active' ? 2 : binding.status === 'inactive' ? 1 : 0;
    const rankDelta = statusRank(right) - statusRank(left);
    if (rankDelta !== 0) {
      return rankDelta;
    }
    return Date.parse(right.updated_at) - Date.parse(left.updated_at);
  })[0] ?? null;
}

function bindingForAttempt(attempt: JsonRecord, bindings: WorkspaceBinding[]) {
  const eligible = bindings.filter((binding) => binding.status !== 'archived');
  const root = workspaceRoot(attempt);
  if (root) {
    const resolvedRoot = path.resolve(root);
    return preferredBinding(eligible.filter((binding) => path.resolve(binding.workspace_path) === resolvedRoot));
  }

  const domainId = firstString(attempt.domain_id);
  return domainId
    ? preferredBinding(eligible.filter((binding) => bindingDomainMatches(binding, domainId)))
    : null;
}

function workspaceDisplayLabel(binding: WorkspaceBinding | null, root: string | null) {
  return firstString(
    binding?.label,
    path.basename(binding?.workspace_path ?? root ?? ''),
  );
}

function sourceRef(queueDb: string, attemptId: string): RuntimeTraySourceRef {
  return {
    ref_kind: 'sqlite',
    ref: `${queueDb}#stage_attempts/${attemptId}`,
    role: 'opl_family_runtime_stage_attempt',
    label: 'OPL family-runtime stage attempt',
  };
}

function fileSourceRef(filePath: string, role: string, label: string): RuntimeTraySourceRef {
  return {
    ref_kind: 'file',
    ref: filePath,
    role,
    label,
  };
}

function uniqueSourceRefs(refs: RuntimeTraySourceRef[]) {
  const selected = new Map<string, RuntimeTraySourceRef>();
  for (const ref of refs) {
    selected.set(`${ref.ref_kind}:${ref.ref}`, ref);
  }
  return [...selected.values()];
}

function actionSummary(status: string, lane: 'running' | 'attention' | 'recent', demoted: boolean) {
  if (lane === 'running') {
    return 'OPL stage attempt is running; domain completion remains owned by the domain agent.';
  }
  if (lane === 'attention') {
    return 'A current repair route is blocking progress; the responsible component and repair action are projected below.';
  }
  if (demoted) {
    return 'A historical runtime failure is retained for diagnosis and does not override the current work-item state.';
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
  if (lane === 'attention') {
    return status === 'human_gate'
      ? actionContext('user', 'human_gate', summary)
      : actionContext('opl', 'handoff_review', summary);
  }
  return noActionContext(summary);
}

function nestedRepairRoute(routeImpact: JsonRecord) {
  for (const value of [
    routeImpact.repair_route,
    routeImpact.recovery_route,
    routeImpact.selected_repair_route,
    routeImpact.selected_safe_action,
  ]) {
    if (isRecord(value)) {
      return value;
    }
  }
  return {};
}

function attemptResponsibility(attempt: JsonRecord, domainId: string) {
  const routeImpact = recordValue(attempt.route_impact);
  const providerRun = recordValue(attempt.provider_run);
  const repairRoute = nestedRepairRoute(routeImpact);
  const responsibleComponentRaw = firstString(
    attempt.responsible_component,
    routeImpact.responsible_component,
    repairRoute.responsible_component,
    repairRoute.owner,
    routeImpact.next_owner,
    providerRun.runtime_blocker_owner,
  );
  const issueRaw = firstString(
    attempt.issue_summary,
    routeImpact.issue_summary,
    repairRoute.issue_summary,
    repairRoute.problem_summary,
    attempt.blocked_reason,
  );
  const repairActionRaw = firstString(
    attempt.repair_action_summary,
    routeImpact.repair_action_summary,
    repairRoute.repair_action_summary,
    repairRoute.action_summary,
    repairRoute.action,
    routeImpact.repair_action,
  );
  const explicitlyBlocking = firstBoolean(
    attempt.blocking_current_progress,
    routeImpact.blocking_current_progress,
    repairRoute.blocking_current_progress,
  ) === true;
  const routeIsExplicit = Boolean(responsibleComponentRaw && issueRaw && repairActionRaw && explicitlyBlocking);

  return {
    responsible_component: componentLabel(responsibleComponentRaw, domainId),
    issue_summary: humanizeIdentifier(issueRaw),
    repair_action_summary: humanizeIdentifier(repairActionRaw),
    expected_outcome: routeIsExplicit
      ? humanizeIdentifier(firstString(
          attempt.expected_outcome,
          routeImpact.expected_outcome,
          repairRoute.expected_outcome,
        )) ?? 'The current work item can continue after the repair action succeeds.'
      : null,
    blocking_current_progress: routeIsExplicit,
    route_is_explicit: routeIsExplicit,
    source: 'stage_attempt_route_impact',
  };
}

function missingUsageProjection(reason: string) {
  return {
    telemetry_status: 'missing',
    missing_reason: reason,
    token_status: 'missing',
    token_missing_reason: reason,
    total_tokens_observed: null,
    estimated_cost_usd_observed: null,
    duration_ms_observed: null,
    api_call_count_observed: null,
    source_ref_count: 0,
  };
}

function projectAttemptGroup(input: {
  queueDb: string;
  attempts: JsonRecord[];
  bindings: WorkspaceBinding[];
}): RuntimeActivityItem {
  const latest = input.attempts[0]!;
  const domainId = firstString(latest.domain_id) ?? 'unknown-domain';
  const workUnitId = attemptWorkUnitId(latest) ?? firstString(latest.stage_attempt_id) ?? 'unknown-work-unit';
  const ledgerStatus = normalizeStatus(latest.status);
  const providerRun = recordValue(latest.provider_run);
  const runtimeCurrentness = buildStageAttemptRuntimeCurrentness({
    ledgerStatus,
    providerKind: firstString(latest.provider_kind) ?? 'unknown',
    providerRun,
  });
  const status = firstString(runtimeCurrentness.effective_runtime_status) ?? ledgerStatus;
  const rawLane = attemptLane(status);
  const responsibility = attemptResponsibility(latest, domainId);
  const lane = rawLane === 'attention' && responsibility.blocking_current_progress !== true
    ? 'recent'
    : rawLane;
  const runtimeAttentionDemotedToDiagnostic = rawLane === 'attention' && lane !== 'attention';
  const latestUsage = attemptUsage(latest, 'app_state_runtime_activity');
  const totalUsage = summarizeStageAttemptUsageProjections(
    input.attempts.map((attempt) => attemptUsage(attempt, 'app_state_runtime_activity_total')),
    'app_state_runtime_activity_total',
  );
  const agent = resolveStandardAgentByDomainId(domainId);
  const binding = bindingForAttempt(latest, input.bindings);
  const root = workspaceRoot(latest);
  const workspaceLabel = workspaceDisplayLabel(binding, root);
  const attemptIds = input.attempts
    .map((attempt) => firstString(attempt.stage_attempt_id))
    .filter((entry): entry is string => Boolean(entry))
    .slice(0, MAX_ATTEMPT_REFS_PER_WORK_UNIT);
  const closeoutRefs = stringList(latest.closeout_refs);
  const summary = actionSummary(status, lane, runtimeAttentionDemotedToDiagnostic);
  const action = runtimeActionContext(status, lane, summary);
  const runtimeBlockerSummary = firstString(latest.blocked_reason);
  const usageObserved = totalUsage.resource_usage_observed_attempt_count > 0;
  const latestUsageMissingReason = firstString(latestUsage.missing_usage_telemetry_reason)
    ?? NO_USAGE_TELEMETRY_REASON;
  const projectLabel = workspaceLabel ?? agent?.label ?? domainId;
  const studyId = attemptStudyId(latest);

  return {
    item_id: `${domainId}:work-unit:${workUnitId}`,
    project_id: domainId,
    project_label: projectLabel,
    project_display_name: projectLabel,
    lane,
    title: studyId ?? workUnitId,
    status,
    status_label: `OPL runtime ${status}`,
    summary,
    updated_at: firstString(latest.updated_at, latest.created_at),
    command: null,
    workspace_path: root ?? binding?.workspace_path ?? null,
    workspace_binding_id: binding?.binding_id ?? null,
    workspace_binding_status: binding?.status ?? null,
    workspace_binding_active: binding?.status === 'active',
    workspace_scope_id: binding ? `workspace:${binding.binding_id}` : null,
    project_scope_id: binding ? `project:${binding.binding_id}` : null,
    agent_scope_id: `agent:${domainId}`,
    task_scope_id: `task:${domainId}:${studyId ?? workUnitId}`,
    workspace_label: workspaceLabel,
    runtime_owner: 'provider_backed_family_runtime',
    domain_owner: domainId,
    source_refs: attemptIds.map((attemptId) => sourceRef(input.queueDb, attemptId)),
    ...action,
    next_action_summary: responsibility.blocking_current_progress
      ? responsibility.repair_action_summary
      : summary,
    work_unit_id: workUnitId,
    work_item_id: studyId ?? workUnitId,
    work_item_kind: studyId ? 'registered_study' : 'runtime_activity',
    work_item_display_name: studyId ?? workUnitId,
    study_id: studyId,
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
      missing_reason: latestUsage.telemetry_status === 'observed' ? null : latestUsageMissingReason,
      token_status: latestUsage.token.observed_count > 0 ? 'observed' : 'missing',
      token_missing_reason: latestUsage.token.observed_count > 0 ? null : latestUsageMissingReason,
      total_tokens_observed: numberValue(latestUsage.token.total_tokens_observed),
      estimated_cost_usd_observed: numberValue(latestUsage.cost.estimated_cost_usd_observed),
      duration_ms_observed: numberValue(latestUsage.duration.duration_ms_observed),
      api_call_count_observed: numberValue(latestUsage.api_calls.count_observed),
      source_ref_count: latestUsage.source_refs.length,
    },
    task_total_usage: {
      telemetry_status: usageObserved ? 'observed' : 'missing',
      missing_reason: usageObserved ? null : NO_USAGE_TELEMETRY_REASON,
      token_status: totalUsage.token.observed_count > 0 ? 'observed' : 'missing',
      token_missing_reason: totalUsage.token.observed_count > 0 ? null : NO_USAGE_TELEMETRY_REASON,
      total_tokens_observed: numberValue(totalUsage.token.total_tokens_observed),
      estimated_cost_usd_observed: numberValue(totalUsage.cost.estimated_cost_usd_observed),
      duration_ms_observed: numberValue(totalUsage.duration.duration_ms_observed),
      api_call_count_observed: numberValue(totalUsage.api_calls.count_observed),
      observed_attempt_count: numberValue(totalUsage.resource_usage_observed_attempt_count),
    },
    usage_telemetry_status: usageObserved ? 'observed' : 'missing',
    usage_telemetry_missing_reason: usageObserved ? null : NO_USAGE_TELEMETRY_REASON,
    blockers: responsibility.blocking_current_progress && runtimeBlockerSummary ? [runtimeBlockerSummary] : [],
    runtime_blocker_summary: runtimeBlockerSummary,
    typed_blocker_summary: null,
    typed_blocker_owner: null,
    responsibility,
    responsible_component: responsibility.responsible_component,
    issue_summary: responsibility.issue_summary,
    repair_action_summary: responsibility.repair_action_summary,
    expected_outcome: responsibility.expected_outcome,
    blocking_current_progress: responsibility.blocking_current_progress,
    resolution_route: responsibility.repair_action_summary,
    stage_attempt_ids: attemptIds,
    runtime_readback_source: 'opl_family_runtime_stage_attempt_projection',
    runtime_attempt_status: ledgerStatus,
    runtime_attention_demoted_to_diagnostic: runtimeAttentionDemotedToDiagnostic,
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

function safeDescendant(root: string, ...segments: string[]) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, ...segments);
  return resolved === resolvedRoot || resolved.startsWith(`${resolvedRoot}${path.sep}`) ? resolved : null;
}

function readRecordFile(filePath: string | null) {
  if (!filePath || !fs.existsSync(filePath)) {
    return {};
  }
  const value = readJsonFileOrNull(filePath);
  return recordValue(value);
}

function preferredWorkspaceBindings(bindings: WorkspaceBinding[]) {
  const byWorkspace = new Map<string, WorkspaceBinding[]>();
  for (const binding of bindings) {
    if (binding.status === 'archived' || !fs.existsSync(binding.workspace_path)) {
      continue;
    }
    const key = `${binding.project_id}\u0000${path.resolve(binding.workspace_path)}`;
    byWorkspace.set(key, [...(byWorkspace.get(key) ?? []), binding]);
  }
  return [...byWorkspace.values()]
    .map(preferredBinding)
    .filter((binding): binding is WorkspaceBinding => Boolean(binding));
}

function directStudyInventory(workspacePath: string) {
  const studiesRoot = safeDescendant(workspacePath, 'studies');
  if (!studiesRoot || !fs.existsSync(studiesRoot) || !fs.statSync(studiesRoot).isDirectory()) {
    return [];
  }
  return fs.readdirSync(studiesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !['archive', 'archived'].includes(entry.name.toLowerCase()))
    .filter((entry) => {
      const studyRoot = path.join(studiesRoot, entry.name);
      return ['STUDY_STATUS.md', 'study.yaml', path.join('control', 'stage_index.json')]
        .some((relativePath) => fs.existsSync(path.join(studyRoot, relativePath)));
    })
    .map((entry) => ({
      study_id: entry.name,
      canonical_study_root: path.join('studies', entry.name),
      stage_index_ref: path.join('control', 'stage_index.json'),
      status: 'registered',
    }));
}

function workspaceStudyInventory(binding: WorkspaceBinding) {
  for (const relativePath of ['workspace_index.json', path.join('reports', 'studies_index.json')]) {
    const indexPath = safeDescendant(binding.workspace_path, relativePath);
    const index = readRecordFile(indexPath);
    const declaredRoot = firstString(index.workspace_root);
    if (
      indexPath
      && recordList(index.studies).length > 0
      && (!declaredRoot || path.resolve(declaredRoot) === path.resolve(binding.workspace_path))
    ) {
      return { indexPath, index, studies: recordList(index.studies) };
    }
  }
  return {
    indexPath: null,
    index: {},
    studies: directStudyInventory(binding.workspace_path),
  };
}

function studyIsArchived(study: JsonRecord) {
  return study.archived === true
    || Boolean(firstString(study.archived_at))
    || normalizeStatus(study.status) === 'archived'
    || firstString(study.canonical_study_root)?.split(/[\\/]+/).includes('archive') === true;
}

function currentStudySurfaces(binding: WorkspaceBinding, study: JsonRecord) {
  const studyId = firstString(study.study_id)!;
  const canonicalStudyRoot = firstString(study.canonical_study_root) ?? path.join('studies', studyId);
  const studyRoot = safeDescendant(binding.workspace_path, canonicalStudyRoot);
  const stageIndexRef = firstString(study.stage_index_ref) ?? path.join('control', 'stage_index.json');
  const stageIndexPath = studyRoot ? safeDescendant(studyRoot, stageIndexRef) : null;
  const stageIndex = readRecordFile(stageIndexPath);
  const indexedCurrentStage = recordValue(stageIndex.current_stage);
  const currentStage = Object.keys(indexedCurrentStage).length > 0
    ? indexedCurrentStage
    : {
        stage_id: study.current_stage_id,
        status: study.current_stage_status,
        current_owner_delta_ref: study.current_owner_delta_ref,
        typed_blocker_ref: study.typed_blocker_ref,
      };
  const ownerDeltaRef = firstString(currentStage.current_owner_delta_ref, study.current_owner_delta_ref);
  const ownerDeltaPath = studyRoot && ownerDeltaRef ? safeDescendant(studyRoot, ownerDeltaRef) : null;
  return {
    studyRoot,
    stageIndexPath,
    stageIndex,
    currentStage,
    ownerDeltaPath,
    ownerDelta: readRecordFile(ownerDeltaPath),
  };
}

function currentDomainResponsibility(input: {
  domainId: string;
  study: JsonRecord;
  currentStage: JsonRecord;
  ownerDelta: JsonRecord;
}) {
  const declared = recordValue(input.study.responsibility);
  const stageDeclared = recordValue(input.currentStage.responsibility);
  const deltaDeclared = recordValue(input.ownerDelta.responsibility);
  const stageStatus = normalizeStatus(firstString(input.currentStage.status, input.study.current_stage_status));
  const responsibleComponentRaw = firstString(
    deltaDeclared.responsible_component,
    input.ownerDelta.responsible_component,
    input.ownerDelta.owner,
    stageDeclared.responsible_component,
    declared.responsible_component,
  );
  const issueRaw = firstString(
    deltaDeclared.issue_summary,
    input.ownerDelta.issue_summary,
    input.ownerDelta.reason,
    stageDeclared.issue_summary,
    declared.issue_summary,
    stringList(input.study.blockers)[0],
  );
  const repairActionRaw = firstString(
    deltaDeclared.repair_action_summary,
    input.ownerDelta.repair_action_summary,
    input.ownerDelta.action,
    input.ownerDelta.next_action,
    stageDeclared.repair_action_summary,
    declared.repair_action_summary,
  );
  const blockingCandidate = firstBoolean(
    deltaDeclared.blocking_current_progress,
    input.ownerDelta.blocking_current_progress,
    stageDeclared.blocking_current_progress,
    declared.blocking_current_progress,
  ) ?? DOMAIN_BLOCKING_STATUSES.has(stageStatus);
  const routeIsExplicit = Boolean(
    blockingCandidate
    && responsibleComponentRaw
    && issueRaw
    && repairActionRaw
  );

  return {
    responsible_component: componentLabel(responsibleComponentRaw, input.domainId),
    issue_summary: routeIsExplicit ? humanizeIdentifier(issueRaw) : null,
    repair_action_summary: routeIsExplicit ? humanizeIdentifier(repairActionRaw) : null,
    expected_outcome: routeIsExplicit
      ? humanizeIdentifier(firstString(
          deltaDeclared.expected_outcome,
          input.ownerDelta.expected_outcome,
          stageDeclared.expected_outcome,
          declared.expected_outcome,
        )) ?? 'The current study stage can continue after the repair action succeeds.'
      : null,
    blocking_current_progress: routeIsExplicit,
    route_is_explicit: routeIsExplicit,
    source: routeIsExplicit ? 'domain_current_owner_delta' : 'registered_study_inventory',
  };
}

function registeredStudyItem(input: {
  binding: WorkspaceBinding;
  indexPath: string | null;
  index: JsonRecord;
  study: JsonRecord;
}): RegisteredStudyInventoryItem {
  const domainId = input.binding.project_id;
  const studyId = firstString(input.study.study_id)!;
  const workspaceLabel = workspaceDisplayLabel(input.binding, input.binding.workspace_path)!;
  const agent = resolveStandardAgentByDomainId(domainId);
  const surfaces = currentStudySurfaces(input.binding, input.study);
  const currentStageId = firstString(
    surfaces.currentStage.stage_id,
    surfaces.stageIndex.current_stage_id,
    input.study.current_stage_id,
  );
  const currentStageStatus = normalizeStatus(firstString(
    surfaces.currentStage.status,
    input.study.current_stage_status,
  ));
  const responsibility = currentDomainResponsibility({
    domainId,
    study: input.study,
    currentStage: surfaces.currentStage,
    ownerDelta: surfaces.ownerDelta,
  });
  const declaredStatus = normalizeStatus(input.study.status);
  const businessPrimaryState = responsibility.blocking_current_progress
    ? 'system_attention_required'
    : ['human_gate', 'owner_decision_required'].includes(currentStageStatus)
      ? 'owner_decision_required'
      : DOMAIN_DELIVERED_STATUSES.has(declaredStatus)
        ? 'delivered_auto_paused'
        : ['running', 'in_progress'].includes(currentStageStatus)
          ? 'in_progress'
          : 'paused_waiting_for_direction';
  const lane = businessPrimaryState === 'in_progress'
    ? 'running'
    : ['system_attention_required', 'owner_decision_required'].includes(businessPrimaryState)
      ? 'attention'
      : 'recent';
  const status = responsibility.blocking_current_progress
    ? 'blocked'
    : businessPrimaryState === 'in_progress'
      ? 'running'
      : businessPrimaryState === 'delivered_auto_paused'
        ? 'completed'
        : declaredStatus;
  const summary = responsibility.issue_summary
    ?? `Registered study inventory is current at stage ${currentStageId ?? 'unknown'}.`;
  const nextActionSummary = responsibility.repair_action_summary
    ?? 'No current system repair route is blocking this registered study.';
  const action = responsibility.blocking_current_progress
    ? actionContext('opl', 'handoff_review', nextActionSummary)
    : noActionContext(nextActionSummary);
  const sourceRefs = uniqueSourceRefs([
    ...(input.indexPath ? [fileSourceRef(input.indexPath, 'registered_workspace_study_inventory', 'Workspace study inventory')] : []),
    ...(surfaces.stageIndexPath && fs.existsSync(surfaces.stageIndexPath)
      ? [fileSourceRef(surfaces.stageIndexPath, 'domain_current_stage_index', 'Domain current stage index')]
      : []),
    ...(surfaces.ownerDeltaPath && fs.existsSync(surfaces.ownerDeltaPath)
      ? [fileSourceRef(surfaces.ownerDeltaPath, 'domain_current_owner_delta', 'Domain current owner delta')]
      : []),
  ]);
  const updatedAt = firstString(
    surfaces.ownerDelta.recorded_at,
    surfaces.stageIndex.updated_at,
    input.index.recorded_at,
    input.binding.updated_at,
  );
  const itemId = `${domainId}:binding:${input.binding.binding_id}:study:${studyId}`;
  const missingUsage = missingUsageProjection(NO_ATTEMPT_TELEMETRY_REASON);

  return {
    key: `${input.binding.binding_id}\u0000${studyId}`,
    domainId,
    studyId,
    binding: input.binding,
    item: {
      item_id: itemId,
      project_id: domainId,
      project_label: workspaceLabel,
      project_display_name: workspaceLabel,
      lane,
      title: studyId,
      status,
      status_label: currentStageId
        ? `${humanizeIdentifier(currentStageId)} (${humanizeIdentifier(currentStageStatus)})`
        : humanizeIdentifier(status) ?? status,
      summary,
      updated_at: updatedAt,
      command: null,
      workspace_path: input.binding.workspace_path,
      workspace_binding_id: input.binding.binding_id,
      workspace_binding_status: input.binding.status,
      workspace_binding_active: input.binding.status === 'active',
      workspace_scope_id: `workspace:${input.binding.binding_id}`,
      project_scope_id: `project:${input.binding.binding_id}`,
      agent_scope_id: `agent:${domainId}`,
      task_scope_id: `task:${input.binding.binding_id}:${studyId}`,
      workspace_label: workspaceLabel,
      runtime_owner: 'provider_backed_family_runtime',
      domain_owner: domainId,
      source_refs: sourceRefs,
      ...action,
      next_action_summary: nextActionSummary,
      work_unit_id: studyId,
      work_item_id: studyId,
      work_item_kind: 'registered_study',
      work_item_display_name: studyId,
      study_id: studyId,
      active_run_id: null,
      active_stage_id: currentStageId,
      active_stage_label: humanizeIdentifier(currentStageId),
      health_status: status,
      stage_started_at: null,
      last_heartbeat_at: null,
      running_proof_status: 'not_applicable',
      running_proof_summary: 'no_active_runtime_attempt_projected',
      current_stage_usage: missingUsage,
      task_total_usage: { ...missingUsage, observed_attempt_count: null },
      usage_telemetry_status: 'missing',
      usage_telemetry_missing_reason: NO_ATTEMPT_TELEMETRY_REASON,
      blockers: responsibility.blocking_current_progress && responsibility.issue_summary
        ? [responsibility.issue_summary]
        : [],
      runtime_blocker_summary: null,
      typed_blocker_summary: responsibility.blocking_current_progress ? responsibility.issue_summary : null,
      typed_blocker_owner: responsibility.blocking_current_progress ? responsibility.responsible_component : null,
      responsibility,
      responsible_component: responsibility.responsible_component,
      issue_summary: responsibility.issue_summary,
      repair_action_summary: responsibility.repair_action_summary,
      expected_outcome: responsibility.expected_outcome,
      blocking_current_progress: responsibility.blocking_current_progress,
      resolution_route: responsibility.repair_action_summary,
      stage_attempt_ids: [],
      runtime_readback_source: 'registered_workspace_study_inventory',
      runtime_attempt_status: null,
      runtime_attention_demoted_to_diagnostic: false,
      runtime_closeout_observed: false,
      runtime_closeout_refs: [],
      provider_kind: null,
      workflow_id: null,
      source_fingerprint: null,
      business_status: declaredStatus,
      business_stage_status: currentStageStatus,
      business_primary_state: businessPrimaryState,
      business_state_source: 'registered_workspace_study_inventory',
      inventory_source_ref: input.indexPath,
      authority_boundary: {
        projection_only: true,
        can_read_domain_artifact_body: false,
        can_write_domain_truth: false,
        can_create_owner_receipt: false,
        can_create_typed_blocker: false,
        can_authorize_quality_verdict: false,
        provider_completion_is_domain_ready: false,
      },
    },
  };
}

function registeredStudyInventory(bindings: WorkspaceBinding[]) {
  const entries: RegisteredStudyInventoryItem[] = [];
  for (const binding of preferredWorkspaceBindings(bindings)) {
    const inventory = workspaceStudyInventory(binding);
    for (const study of inventory.studies) {
      if (!firstString(study.study_id) || studyIsArchived(study)) {
        continue;
      }
      entries.push(registeredStudyItem({
        binding,
        indexPath: inventory.indexPath,
        index: inventory.index,
        study,
      }));
    }
  }
  return entries;
}

function mergeInventoryAndAttempt(inventory: RuntimeActivityItem, attempt: RuntimeActivityItem): RuntimeActivityItem {
  const attemptResponsibilityProjection = recordValue(attempt.responsibility);
  const inventoryResponsibility = recordValue(inventory.responsibility);
  const attemptBlocks = attemptResponsibilityProjection.route_is_explicit === true
    && attemptResponsibilityProjection.blocking_current_progress === true;
  const inventoryBlocks = inventoryResponsibility.route_is_explicit === true
    && inventoryResponsibility.blocking_current_progress === true;
  const running = attempt.runtime_attempt_status === 'running'
    && attempt.running_proof_status === 'running_confirmed';
  const responsibility = inventoryBlocks
    ? inventoryResponsibility
    : attemptBlocks
      ? attemptResponsibilityProjection
      : inventoryResponsibility;
  const blockingCurrentProgress = !running && responsibility.blocking_current_progress === true;
  const runtimeAttentionDemotedToDiagnostic = ATTENTION_STATUSES.has(String(attempt.runtime_attempt_status))
    && !blockingCurrentProgress;
  const lane = running ? 'running' : blockingCurrentProgress ? 'attention' : inventory.lane;
  const status = running || blockingCurrentProgress ? attempt.status : inventory.status;
  const useAttemptStage = running || (attemptBlocks && !inventoryBlocks);
  const summary = running
    ? attempt.summary
    : blockingCurrentProgress
      ? firstString(responsibility.issue_summary) ?? attempt.summary
      : inventory.summary;
  const nextActionSummary = blockingCurrentProgress
    ? firstString(responsibility.repair_action_summary) ?? inventory.next_action_summary
    : running
      ? attempt.next_action_summary
      : inventory.next_action_summary;
  const action = runtimeActionContext(String(status ?? 'unknown'), lane, nextActionSummary ?? summary ?? 'No action required.');

  return {
    ...inventory,
    lane,
    status,
    status_label: running || blockingCurrentProgress ? attempt.status_label : inventory.status_label,
    summary,
    updated_at: attempt.updated_at ?? inventory.updated_at,
    source_refs: uniqueSourceRefs([
      ...(inventory.source_refs as RuntimeTraySourceRef[]),
      ...(attempt.source_refs as RuntimeTraySourceRef[]),
    ]),
    ...action,
    next_action_summary: nextActionSummary,
    active_run_id: attempt.active_run_id,
    active_stage_id: useAttemptStage ? attempt.active_stage_id : inventory.active_stage_id,
    active_stage_label: useAttemptStage ? attempt.active_stage_label : inventory.active_stage_label,
    health_status: running || blockingCurrentProgress ? attempt.health_status : inventory.health_status,
    stage_started_at: attempt.stage_started_at,
    last_heartbeat_at: attempt.last_heartbeat_at,
    running_proof_status: attempt.running_proof_status,
    running_proof_summary: attempt.running_proof_summary,
    current_stage_usage: attempt.current_stage_usage,
    task_total_usage: attempt.task_total_usage,
    usage_telemetry_status: attempt.usage_telemetry_status,
    usage_telemetry_missing_reason: attempt.usage_telemetry_missing_reason,
    blockers: blockingCurrentProgress
      ? [firstString(responsibility.issue_summary, attempt.runtime_blocker_summary)].filter((entry): entry is string => Boolean(entry))
      : inventory.blockers,
    runtime_blocker_summary: attempt.runtime_blocker_summary,
    typed_blocker_summary: inventoryBlocks ? inventory.typed_blocker_summary : null,
    typed_blocker_owner: inventoryBlocks ? inventory.typed_blocker_owner : null,
    responsibility,
    responsible_component: responsibility.responsible_component,
    issue_summary: responsibility.issue_summary,
    repair_action_summary: responsibility.repair_action_summary,
    expected_outcome: responsibility.expected_outcome,
    blocking_current_progress: blockingCurrentProgress,
    resolution_route: blockingCurrentProgress ? responsibility.repair_action_summary : inventory.resolution_route,
    stage_attempt_ids: attempt.stage_attempt_ids,
    runtime_attempt_status: attempt.runtime_attempt_status,
    runtime_attention_demoted_to_diagnostic: runtimeAttentionDemotedToDiagnostic,
    runtime_closeout_observed: attempt.runtime_closeout_observed,
    runtime_closeout_refs: attempt.runtime_closeout_refs,
    provider_kind: attempt.provider_kind,
    workflow_id: attempt.workflow_id,
    source_fingerprint: attempt.source_fingerprint,
  };
}

function boundedAttemptOnlyItems(items: RuntimeActivityItem[], profile: 'fast' | 'full') {
  if (profile === 'full') {
    return items;
  }
  const laneCounts = new Map<string, number>();
  return items.filter((item) => {
    const count = laneCounts.get(item.lane) ?? 0;
    if (count >= FAST_ATTEMPT_ONLY_WORK_UNITS_PER_LANE) {
      return false;
    }
    laneCounts.set(item.lane, count + 1);
    return true;
  });
}

export function buildAppStateRuntimeActivityItems(profile: 'fast' | 'full' = 'full') {
  const { queueDb, attempts } = readStageAttempts();
  const bindings = listWorkspaceBindings();
  const inventory = registeredStudyInventory(bindings);
  const inventoryByKey = new Map(inventory.map((entry) => [entry.key, entry]));
  const inventoryByDomainStudy = new Map<string, RegisteredStudyInventoryItem[]>();
  for (const entry of inventory) {
    const key = `${entry.domainId}\u0000${entry.studyId}`;
    inventoryByDomainStudy.set(key, [...(inventoryByDomainStudy.get(key) ?? []), entry]);
  }

  const inventoryAttempts = new Map<string, JsonRecord[]>();
  const attemptOnlyGroups = new Map<string, JsonRecord[]>();
  for (const attempt of attempts) {
    const domainId = firstString(attempt.domain_id);
    const workUnitId = attemptWorkUnitId(attempt);
    if (!domainId || !workUnitId) {
      continue;
    }
    const studyId = attemptStudyId(attempt);
    const root = workspaceRoot(attempt);
    const uniqueDomainStudy = studyId ? inventoryByDomainStudy.get(`${domainId}\u0000${studyId}`) ?? [] : [];
    const binding = !root && uniqueDomainStudy.length === 1
      ? uniqueDomainStudy[0]!.binding
      : bindingForAttempt(attempt, bindings);
    const inventoryKey = binding && studyId ? `${binding.binding_id}\u0000${studyId}` : null;
    if (inventoryKey && inventoryByKey.has(inventoryKey)) {
      const grouped = inventoryAttempts.get(inventoryKey) ?? [];
      if (grouped.length < MAX_ATTEMPT_REFS_PER_WORK_UNIT) {
        grouped.push(attempt);
        inventoryAttempts.set(inventoryKey, grouped);
      }
      continue;
    }

    const identityRoot = binding?.binding_id ?? (root ? path.resolve(root) : 'domain-fallback');
    const key = `${domainId}\u0000${identityRoot}\u0000${workUnitId}`;
    const grouped = attemptOnlyGroups.get(key) ?? [];
    if (grouped.length < MAX_ATTEMPT_REFS_PER_WORK_UNIT) {
      grouped.push(attempt);
      attemptOnlyGroups.set(key, grouped);
    }
  }

  const registeredItems = inventory.map((entry) => {
    const groupedAttempts = inventoryAttempts.get(entry.key);
    return groupedAttempts?.length
      ? mergeInventoryAndAttempt(
          entry.item,
          projectAttemptGroup({ queueDb, attempts: groupedAttempts, bindings }),
        )
      : entry.item;
  });
  const attemptOnlyItems = [...attemptOnlyGroups.values()].map((groupedAttempts) => projectAttemptGroup({
    queueDb,
    attempts: groupedAttempts,
    bindings,
  }));

  return [...registeredItems, ...boundedAttemptOnlyItems(attemptOnlyItems, profile)];
}
