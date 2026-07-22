import { buildCurrentOwnerDeltaTopline } from '../ledger/public/app-state.ts';
import { resolveStandardAgent } from '../../kernel/standard-agent-registry.ts';
import { buildTaskRunProjectionV2 } from './app-state-task-run-projection.ts';
import {
  buildBrandExperienceProfile,
  buildDefaultReadSurfacePolicy,
  buildOneShotPlanLandingProfile,
  buildOrdinaryCockpit,
} from './app-state-parts/view-model-operator-profiles.ts';
import {
  buildActionQueue,
  buildSummaryCards,
  foundryRunItems,
} from './app-state-parts/view-model-queues-and-cards.ts';
import { buildNavigation, buildSections } from './app-state-parts/view-model-sections.ts';

type JsonRecord = Record<string, unknown>;

export type OplAppOperatorViewModelInput = {
  profile: 'fast' | 'full';
  core: JsonRecord;
  developerMode: JsonRecord;
  modules: JsonRecord;
  provider: JsonRecord;
  release: JsonRecord;
  paths: JsonRecord;
  actions: ReadonlyArray<JsonRecord>;
  settingsControlCenter: JsonRecord;
  uiDefaults: JsonRecord;
  runtimeActivityItems: ReadonlyArray<JsonRecord>;
  workItemProjectionV2?: JsonRecord;
  brandSystemProfile: JsonRecord;
  targetOperatingArchitecture: JsonRecord;
  currentOwnerDeltaReadModel?: JsonRecord;
  foundry?: JsonRecord;
};

function asRecord(value: unknown): JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function asRecordArray(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter((entry): entry is JsonRecord => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry)) : [];
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(asString).filter((entry): entry is string => Boolean(entry))
    : [];
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function lowerText(...values: unknown[]) {
  return values
    .map((value) => asString(value)?.toLowerCase() ?? '')
    .filter(Boolean)
    .join(' ');
}

function includesAny(text: string, candidates: readonly string[]) {
  return candidates.some((candidate) => text.includes(candidate));
}

function actionPayloadFields(action: JsonRecord) {
  return Array.isArray(action.payload_fields)
    ? action.payload_fields.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function actionIsPayloadFree(action: JsonRecord) {
  return actionPayloadFields(action).length === 0;
}

function actionCanUseGenericSafeDryRunRoute(action: JsonRecord) {
  return actionIsPayloadFree(action)
    && action.dry_run_supported === true
    && action.confirmation_required === false
    && asString(action.danger_level) !== null;
}

function projectLineKey(task: JsonRecord) {
  return asString(task.task_id)
    ?? asString(task.project_scope_id)
    ?? asString(task.workspace_scope_id)
    ?? asString(task.study_id)
    ?? 'runtime-project-line';
}

function domainAgentDisplayLabel(domainId: string, label: string | null) {
  return resolveStandardAgent(label ?? '')?.label
    ?? resolveStandardAgent(domainId)?.label
    ?? label
    ?? domainId;
}

function deriveUserFacingTaskState(task: JsonRecord) {
  const lane = asString(task.lane);
  const status = asString(task.status);
  const text = lowerText(
    task.status,
    task.status_label,
    task.summary,
    task.next_action_summary,
    task.action_summary,
  );
  const runtimeCloseoutObserved = asBoolean(task.runtime_closeout_observed);
  const runtimeAttentionDemotedToDiagnostic = asBoolean(task.runtime_attention_demoted_to_diagnostic);
  const automationFailed = ['failed', 'dead_lettered'].includes(status ?? '')
    && !runtimeCloseoutObserved
    && !runtimeAttentionDemotedToDiagnostic;
  const ownerDecisionRequired = includesAny(text, [
    '需要你决定',
    '等待后续决定',
    'waiting for owner',
    'waiting_for_owner',
    'human_gate',
  ]);
  const pausedWaiting = includesAny(text, [
    '用户暂停',
    '手动停驻',
    '已暂停',
    'parked',
    'paused',
    '显式恢复',
    '等待用户显式恢复',
    '给出新方案',
  ]);

  const automationState = lane === 'running'
    ? 'automation_running'
    : automationFailed
      ? 'automation_failed'
      : 'automation_idle';
  const automationStateLabel = automationState === 'automation_running'
    ? '自动运行中'
    : automationState === 'automation_failed'
      ? '自动流程异常'
      : '当前无自动任务';
  const automationStateReason = automationState === 'automation_running'
    ? 'active_runtime_run_observed'
    : automationState === 'automation_failed'
      ? 'runtime_failure_observed'
      : 'no_active_runtime_automation';

  const inferredPrimaryState = lane === 'running'
    ? 'in_progress'
    : pausedWaiting
      ? 'paused_waiting_for_direction'
      : ownerDecisionRequired
        ? 'owner_decision_required'
        : runtimeCloseoutObserved || status === 'completed'
          ? 'delivered_auto_paused'
          : automationFailed || lane === 'attention'
            ? 'system_attention_required'
            : 'paused_waiting_for_direction';
  const declaredPrimaryState = asString(task.business_primary_state);
  const primaryState = [
    'in_progress',
    'delivered_auto_paused',
    'paused_waiting_for_direction',
    'owner_decision_required',
    'system_attention_required',
  ].includes(declaredPrimaryState ?? '')
    ? declaredPrimaryState!
    : inferredPrimaryState;
  const primaryStateLabel = primaryState === 'in_progress'
    ? '进行中'
    : primaryState === 'delivered_auto_paused'
      ? '已交付，自动暂停'
      : primaryState === 'owner_decision_required'
        ? '需要你决定'
        : primaryState === 'system_attention_required'
          ? '需要系统处理'
          : '已暂停，等待后续决定';
  const primaryStateReason = primaryState === 'in_progress'
    ? 'user_visible_progress_advancing'
    : primaryState === 'delivered_auto_paused'
      ? 'latest_runtime_result_delivered'
      : primaryState === 'owner_decision_required'
        ? 'owner_or_user_input_required'
        : primaryState === 'system_attention_required'
          ? 'system_or_runtime_attention_required'
          : 'paused_until_new_direction';

  return {
    primaryState,
    primaryStateLabel,
    primaryStateReason,
    automationState,
    automationStateLabel,
    automationStateReason,
  };
}

function userFacingActivityState(
  rawState: string,
  primaryState: string,
) {
  if (primaryState === 'in_progress') return 'running';
  if (primaryState === 'system_attention_required' || primaryState === 'owner_decision_required') {
    return 'attention_needed';
  }
  if (primaryState === 'delivered_auto_paused') return 'completed';
  if (primaryState === 'paused_waiting_for_direction') return 'waiting_for_direction';
  return rawState;
}

function userFacingActivityPriorityBucket(primaryState: string) {
  if (primaryState === 'in_progress') return 'running';
  if (primaryState === 'system_attention_required' || primaryState === 'owner_decision_required') {
    return 'needs_attention';
  }
  return 'recent';
}

function isAutomatedWorkspaceBindingLabel(value: unknown) {
  const text = lowerText(value);
  return includesAny(text, ['autopush', 'auto-push', 'milestone', 'paper-mission', 'stage-attempt']);
}

function runtimeTaskDedupeKey(task: JsonRecord) {
  const studyId = asString(task.study_id);
  const workspacePath = asString(task.workspace_path);
  if (studyId && workspacePath) {
    return `${asString(task.domain_id) ?? 'opl'}:${workspacePath}:${studyId}`;
  }
  return asString(task.task_id) ?? `${asString(task.domain_id) ?? 'opl'}:${asString(task.title) ?? 'runtime-task'}`;
}

function runtimeTaskRank(task: JsonRecord) {
  const primaryState = asString(task.primary_state);
  const stateRank = primaryState === 'in_progress'
    ? 64
    : primaryState === 'system_attention_required'
      ? 48
      : primaryState === 'delivered_auto_paused'
        ? 32
        : primaryState === 'owner_decision_required'
          ? 24
          : 16;
  const bindingRank = asBoolean(task.workspace_binding_active) ? 8 : 0;
  const labelRank = isAutomatedWorkspaceBindingLabel(task.workspace_label) ? 0 : 4;
  const latest = Date.parse(asString(task.last_progress_at) ?? '');
  return stateRank + bindingRank + labelRank + (Number.isFinite(latest) ? Math.min(latest / 1_000_000_000_000, 1) : 0);
}

function dedupeRuntimeActivityDrilldowns<T extends JsonRecord>(tasks: T[]): T[] {
  const selected = new Map<string, T>();
  for (const task of tasks) {
    const key = runtimeTaskDedupeKey(task);
    const existing = selected.get(key);
    if (!existing || runtimeTaskRank(task) > runtimeTaskRank(existing)) {
      selected.set(key, task);
    }
  }
  return [...selected.values()];
}

function summarizeUserTaskStates(tasks: ReadonlyArray<JsonRecord>) {
  const uniqueProjectLines = new Set(tasks.map(projectLineKey));
  return {
    running_task_count: tasks.filter((task) => asString(task.primary_state) === 'in_progress').length,
    active_project_count: uniqueProjectLines.size,
    queued_project_count: tasks.filter((task) =>
      ['paused_waiting_for_direction', 'owner_decision_required'].includes(asString(task.primary_state) ?? '')
    ).length,
    attention_count: tasks.filter((task) =>
      ['owner_decision_required', 'system_attention_required'].includes(asString(task.primary_state) ?? '')
    ).length,
    in_progress_count: tasks.filter((task) => asString(task.primary_state) === 'in_progress').length,
    delivered_auto_paused_count: tasks.filter((task) => asString(task.primary_state) === 'delivered_auto_paused').length,
    paused_count: tasks.filter((task) => asString(task.primary_state) === 'paused_waiting_for_direction').length,
    owner_decision_count: tasks.filter((task) => asString(task.primary_state) === 'owner_decision_required').length,
    system_attention_count: tasks.filter((task) => asString(task.primary_state) === 'system_attention_required').length,
    automation_running_count: tasks.filter((task) => asString(task.automation_state) === 'automation_running').length,
  };
}

function scopeOption(scopeKind: string, scopeId: string, label: string, extra: JsonRecord = {}) {
  return {
    scope_kind: scopeKind,
    scope_id: scopeId,
    label,
    ...extra,
  };
}

function pathLeaf(value: string | null): string | null {
  const parts = value?.split(/[\\/]+/).filter(Boolean);
  return parts?.at(-1) ?? null;
}

function buildRuntimeScope(tasks: ReadonlyArray<JsonRecord>) {
  const options = new Map<string, JsonRecord>();
  const addOption = (option: JsonRecord) => {
    const kind = asString(option.scope_kind) ?? 'scope';
    const identity = kind === 'workspace'
      ? (asString(option.workspace_path) ?? asString(option.scope_id) ?? 'default')
      : (asString(option.scope_id) ?? 'default');
    const key = `${kind}:${identity}`;
    if (!options.has(key)) {
      options.set(key, option);
    }
  };

  const allProjects = scopeOption('all_projects', 'all_projects', '全部项目');
  addOption(allProjects);
  for (const task of tasks) {
    const domainId = asString(task.domain_id) ?? 'opl';
    const domainLabel = domainAgentDisplayLabel(
      domainId,
      asString(task.agent_display_name) ?? asString(task.domain_label),
    );
    addOption(scopeOption('agent', asString(task.agent_scope_id) ?? `agent:${domainId}`, domainLabel, {
      domain_id: domainId,
    }));

    const workspaceLabel = asString(task.workspace_label);
    const workspacePath = asString(task.workspace_path);
    const projectScopeId = asString(task.project_scope_id);
    const projectLabel = workspaceLabel ?? asString(task.project_display_name) ?? domainLabel;
    if (workspacePath) {
      addOption(scopeOption(
        'workspace',
        asString(task.workspace_scope_id) ?? `workspace:${workspacePath}`,
        pathLeaf(workspacePath) ?? workspaceLabel ?? 'Workspace',
        {
          workspace_binding_id: asString(task.workspace_binding_id),
          workspace_path: workspacePath,
          workspace_label: workspaceLabel,
        },
      ));
    }
    if (projectScopeId) {
      addOption(scopeOption('project', projectScopeId, projectLabel, {
        scope_value: projectLabel,
        project_id: domainId,
        workspace_binding_id: asString(task.workspace_binding_id),
        workspace_path: workspacePath,
        workspace_label: workspaceLabel,
      }));
    }
  }

  const inferredWorkspace = tasks.find((task) => asBoolean(task.workspace_binding_active) && Boolean(asString(task.project_scope_id)));
  return {
    scope_options: [...options.values()],
    current_scope: allProjects,
    scope_source: 'default_global',
    inferred_scope_hint: inferredWorkspace
      ? scopeOption(
          'project',
          asString(inferredWorkspace.project_scope_id) ?? 'project:inferred',
          asString(inferredWorkspace.workspace_label)
            ?? asString(inferredWorkspace.project_display_name)
            ?? pathLeaf(asString(inferredWorkspace.workspace_path))
            ?? '当前项目',
          {
            workspace_binding_id: asString(inferredWorkspace.workspace_binding_id),
            workspace_path: asString(inferredWorkspace.workspace_path),
            workspace_label: asString(inferredWorkspace.workspace_label),
            project_id: asString(inferredWorkspace.domain_id),
            hint_source: 'workspace_registry_active_binding',
          },
        )
      : null,
  };
}
function sourceRefCount(item: JsonRecord) {
  return asRecordArray(item.source_refs).length;
}

function commandRoute(item: JsonRecord) {
  const command = asString(item.command);
  if (command) {
    return command;
  }
  const commands = asRecordArray(item.recommended_commands);
  return asString(commands[0]?.command);
}

function taskUserProjectionRefs(input: {
  taskId: string;
  domainId: string;
  state: string;
  stageId: string;
  stageLabel: string | null;
  blockerRefCount: number;
}) {
  const encodedTaskId = encodeURIComponent(input.taskId);
  const encodedDomainId = encodeURIComponent(input.domainId);
  const encodedStageId = encodeURIComponent(input.stageId);
  return {
    stage: {
      stage_id: input.stageId,
      label: input.stageLabel,
      current_ref: `app_state.operator.workbench.task_drilldowns.${encodedTaskId}`,
      lineage_ref: `opl://domains/${encodedDomainId}/stages/${encodedStageId}/lineage`,
      conformance_ref: 'contracts/opl-framework/stage-run-kernel-contract.json#app_user_task_projection',
    },
    progress: {
      status: input.state,
      label: input.stageLabel ?? input.state,
      source_ref: `app_state.operator.workbench.task_drilldowns.${encodedTaskId}`,
    },
    next_owner: {
      owner: input.domainId,
      source_ref: `app_state.operator.workbench.task_drilldowns.${encodedTaskId}`,
    },
    artifact_or_blocker: {
      current_ref: `app_state.operator.workbench.task_drilldowns.${encodedTaskId}`,
      canonical_ref: `opl://domains/${encodedDomainId}/tasks/${encodedTaskId}/canonical`,
      export_ref: `opl://domains/${encodedDomainId}/tasks/${encodedTaskId}/exports`,
      export_bundle_refs: [
        `opl://domains/${encodedDomainId}/tasks/${encodedTaskId}/export-bundles/latest`,
      ],
      lineage_ref: `opl://domains/${encodedDomainId}/stages/${encodedStageId}/lineage`,
      receipt_ref: `opl://domains/${encodedDomainId}/tasks/${encodedTaskId}/artifact-receipt`,
      conformance_ref: 'contracts/opl-framework/stage-artifact-runtime-contract.json#refs_only_artifact_projection',
      blocker_ref_count: input.blockerRefCount,
      content_policy: 'refs_only_no_artifact_body',
      export_bundle_action_ref: 'app_state.actions#task_export_bundle_preview',
    },
    review_receipt: {
      reviewer_ref: `opl://domains/${encodedDomainId}/reviewers/default`,
      check_ref: `opl://domains/${encodedDomainId}/tasks/${encodedTaskId}/review-check`,
      status: input.blockerRefCount > 0 ? 'attention_needed' : 'refs_available',
      issue_ref_count: input.blockerRefCount,
      issues_ref: `app_state.operator.workbench.task_drilldowns.${encodedTaskId}.blocker_refs`,
      next_action: input.blockerRefCount > 0 ? 'route_to_domain_owner' : 'wait_for_domain_owner_receipt',
      receipt_ref: `opl://domains/${encodedDomainId}/tasks/${encodedTaskId}/reviewer-receipt`,
      authority_policy: 'receipt_summary_refs_only_no_quality_verdict_authority',
    },
    action_receipt: {
      action_id: 'task_action_receipt_preview',
      route: 'opl app action execute --action task_action_receipt_preview --dry-run',
      dry_run_required: true,
      preview_ref: `opl://app-action-previews/${encodedTaskId}/receipt`,
      content_policy: 'refs_only_no_action_receipt_body',
      export_bundle_action_id: 'task_export_bundle_preview',
      export_bundle_route: 'opl app action execute --action task_export_bundle_preview --dry-run',
    },
    workflow_refs: {
      current_workflow_ref: `opl://domains/${encodedDomainId}/tasks/${encodedTaskId}/workflows/current`,
      stage_workflow_ref: `opl://domains/${encodedDomainId}/stages/${encodedStageId}/workflow`,
      content_policy: 'refs_only_no_workflow_body',
    },
  };
}

function activityState(item: JsonRecord) {
  const lane = asString(item.lane);
  if (lane === 'running') {
    return 'running';
  }
  if (lane === 'attention') {
    return 'attention_needed';
  }
  return asString(item.status) ?? 'recent';
}

function normalizeRuntimeActivityItem(item: JsonRecord, index: number) {
  const studyId = asString(item.study_id);
  const taskId = asString(item.item_id)
    ?? asString(item.task_id)
    ?? asString(item.work_item_id)
    ?? `runtime-activity-${index + 1}`;
  const title = asString(item.title) ?? studyId ?? taskId;
  const encodedTaskId = encodeURIComponent(taskId);
  const sourceRef = `app_state.operator.workbench.task_drilldowns.${encodedTaskId}`;
  const activeRunId = asString(item.active_run_id);
  const nextVisibleStep = asString(item.next_action_summary)
    ?? asString(item.action_summary)
    ?? asString(item.summary);
  const route = commandRoute(item);
  const rawState = activityState(item);
  const domainId = asString(item.project_id) ?? 'opl';
  const domainLabel = asString(item.project_label) ?? asString(item.domain_owner) ?? 'OPL';
  const stageId = asString(item.active_stage_id)
    ?? asString(item.status)
    ?? asString(item.health_status)
    ?? asString(item.lane)
    ?? 'runtime_activity';
  const blockerRefCount = asRecordArray(item.blockers).length;
  const currentStageUsage = asRecord(item.current_stage_usage);
  const taskTotalUsage = asRecord(item.task_total_usage);
  const typedBlockerSummary = asString(item.typed_blocker_summary);
  const typedBlockerOwner = asString(item.typed_blocker_owner) ?? domainId ?? 'opl_framework';
  const runtimeBlockerSummary = asString(item.runtime_blocker_summary);
  const resolutionRoute = asString(item.resolution_route) ?? nextVisibleStep;
  const userState = deriveUserFacingTaskState(item);
  const state = userFacingActivityState(rawState, userState.primaryState);
  const priorityBucket = userFacingActivityPriorityBucket(userState.primaryState);
  const refs = taskUserProjectionRefs({
    taskId,
    domainId,
    state,
    stageId,
    stageLabel: asString(item.status_label),
    blockerRefCount,
  });
  const agentDisplayName = domainAgentDisplayLabel(domainId, asString(item.agent_display_name) ?? domainLabel);
  const projectDisplayName = asString(item.project_display_name)
    ?? asString(item.workspace_label)
    ?? domainLabel;
  const workItemDisplayName = asString(item.work_item_display_name) ?? title;
  const executionRunLabel = asString(item.execution_run_label)
    ?? activeRunId
    ?? asString(item.active_stage_id)
    ?? asString(item.status_label);
  const taskIdentity = {
    task_id: taskId,
    domain_id: domainId,
    domain_label: domainLabel,
    title,
    study_id: studyId,
    task_ref: sourceRef,
    agent_display_name: agentDisplayName,
    project_display_name: projectDisplayName,
    work_item_display_name: workItemDisplayName,
    execution_run_label: executionRunLabel,
    agent: {
      agent_id: domainId,
      label: agentDisplayName,
      scope_id: asString(item.agent_scope_id) ?? `agent:${domainId}`,
    },
    project: {
      project_id: domainId,
      label: projectDisplayName,
      scope_id: asString(item.project_scope_id) ?? `project:${domainId}`,
      workspace_binding_id: asString(item.workspace_binding_id),
      workspace_path: asString(item.workspace_path),
      workspace_label: asString(item.workspace_label),
    },
    work_item: {
      work_item_id: asString(item.work_item_id) ?? taskId,
      label: workItemDisplayName,
      kind: asString(item.work_item_kind) ?? 'runtime_activity',
      scope_id: asString(item.task_scope_id) ?? `task:${taskId}`,
    },
    execution_run: {
      run_id: activeRunId,
      label: executionRunLabel,
      stage_id: stageId,
      stage_label: asString(item.active_stage_label) ?? asString(item.status_label),
    },
  };
  const stageRunCockpit = {
    surface_kind: 'opl_stage_run_cockpit_refs',
    source_ref: `${sourceRef}.stage_run_cockpit`,
    derived_from: 'current_owner_delta',
    task_id: taskId,
    stage_id: stageId,
    owner: domainId,
    next_visible_step: nextVisibleStep,
    accepted_return_shapes: ['owner_receipt_ref', 'typed_blocker_ref'],
    readiness_false_flag_refs: [],
    artifact_or_blocker_refs: [refs.artifact_or_blocker.current_ref],
    refs_only: true,
    elapsed_seconds: item.elapsed_seconds,
    last_heartbeat_at: asString(item.last_heartbeat_at),
    running_proof_ref: `${sourceRef}.running_proof_summary`,
    stage_usage: currentStageUsage,
    task_total_usage: taskTotalUsage,
    typed_blocker_summary: typedBlockerSummary,
    typed_blocker_owner: typedBlockerOwner,
    runtime_blocker_summary: runtimeBlockerSummary,
    typed_blocker_resolution_ref: `${sourceRef}.resolution_route`,
  };
  const stageRunCockpitSummary = {
    current_owner: domainId,
    required_delta: typedBlockerSummary
      ? 'owner_attention_or_typed_blocker_resolution_required'
      : 'next_visible_step_available',
    next_safe_action_ref: route ? 'app_state.actions#task_action_receipt_preview' : null,
    artifact_or_blocker_refs: [refs.artifact_or_blocker.current_ref],
    current_stage: stageId,
    elapsed_seconds: item.elapsed_seconds,
    last_heartbeat_at: asString(item.last_heartbeat_at),
    running_proof_status: asString(item.running_proof_status),
    running_proof_summary: asString(item.running_proof_summary),
    stage_usage: currentStageUsage,
    task_total_usage: taskTotalUsage,
    typed_blocker_summary: typedBlockerSummary,
    typed_blocker_owner: typedBlockerOwner,
    runtime_blocker_summary: runtimeBlockerSummary,
    resolution_route: resolutionRoute,
  };
  const connectorReadinessRefs = [
    {
      id: 'temporal_provider',
      title: 'Temporal provider',
      status: asString(item.running_proof_status) ?? 'unknown',
      ref: 'app_state.provider.temporal',
      owner: 'one-person-lab',
      next_action: 'opl_runtime_app_operator_drilldown',
    },
  ];
  const diagnosticSubstrateRefs = [
    {
      id: 'runtime_activity_projection',
      title: 'Runtime activity projection',
      status: asString(item.runtime_attempt_status) ?? state,
      ref: sourceRef,
      owner: 'opl_framework',
      next_action: 'inspect_refs_only_projection',
    },
  ];

  return {
    task_id: taskId,
    domain_id: domainId,
    domain_label: domainLabel,
    title,
    task_identity: taskIdentity,
    state,
    status: asString(item.status),
    status_label: asString(item.status_label),
    priority_bucket: priorityBucket,
    active_stage_id: stageId,
    active_stage_label: asString(item.active_stage_label) ?? asString(item.status_label),
    active_run_id: activeRunId,
    stage_attempt_ids: asStringArray(item.stage_attempt_ids),
    next_visible_step: nextVisibleStep,
    last_progress_at: asString(item.updated_at),
    workspace_path: asString(item.workspace_path),
    study_id: studyId,
    source_ref_count: sourceRefCount(item),
    blocker_ref_count: blockerRefCount,
    safe_action_ref_count: route ? 1 : 0,
    runtime_readback_source: asString(item.runtime_readback_source),
    runtime_attempt_status: asString(item.runtime_attempt_status),
    runtime_attention_demoted_to_diagnostic: asBoolean(item.runtime_attention_demoted_to_diagnostic),
    runtime_closeout_observed: item.runtime_closeout_observed === true,
    runtime_closeout_ref: asString(item.runtime_closeout_ref),
    primary_state: userState.primaryState,
    primary_state_label: userState.primaryStateLabel,
    primary_state_reason: userState.primaryStateReason,
    automation_state: userState.automationState,
    automation_state_label: userState.automationStateLabel,
    automation_state_reason: userState.automationStateReason,
    agent_display_name: agentDisplayName,
    project_display_name: projectDisplayName,
    work_item_display_name: workItemDisplayName,
    execution_run_label: executionRunLabel,
    workspace_binding_id: asString(item.workspace_binding_id),
    workspace_binding_status: asString(item.workspace_binding_status),
    workspace_binding_active: asBoolean(item.workspace_binding_active),
    workspace_scope_id: asString(item.workspace_scope_id),
    project_scope_id: asString(item.project_scope_id),
    agent_scope_id: asString(item.agent_scope_id),
    task_scope_id: asString(item.task_scope_id),
    workspace_label: asString(item.workspace_label),
    stage_started_at: asString(item.stage_started_at),
    elapsed_seconds: item.elapsed_seconds,
    last_heartbeat_at: asString(item.last_heartbeat_at),
    running_proof_status: asString(item.running_proof_status),
    running_proof_summary: asString(item.running_proof_summary),
    current_stage_usage: currentStageUsage,
    task_total_usage: taskTotalUsage,
    usage_telemetry_status: asString(item.usage_telemetry_status),
    typed_blocker_summary: typedBlockerSummary,
    typed_blocker_owner: typedBlockerOwner,
    runtime_blocker_summary: runtimeBlockerSummary,
    resolution_route: resolutionRoute,
    gateway_status_ref: 'app_state.provider.temporal',
    connector_readiness_refs: connectorReadinessRefs,
    diagnostic_substrate_refs: diagnosticSubstrateRefs,
    stage_run_cockpit: stageRunCockpit,
    stage_run_cockpit_summary: stageRunCockpitSummary,
    stage_run_current_owner_delta: stageRunCockpit,
    ...refs,
    active_path: [
      {
        node_id: taskId,
        node_kind: 'runtime_activity_projection',
        label: title,
        state,
        owner: 'opl_framework',
        ref: route,
      },
    ],
  };
}

function runtimeActivityDrilldowns(input: OplAppOperatorViewModelInput) {
  return dedupeRuntimeActivityDrilldowns(input.runtimeActivityItems.map(normalizeRuntimeActivityItem));
}

function buildActivityCenter(input: OplAppOperatorViewModelInput) {
  const activityDrilldowns = runtimeActivityDrilldowns(input);
  return {
    source_ref: 'runtime_tray_snapshot.running_items + attention_items + recent_items refs-only projection',
    needs_attention: activityDrilldowns.filter((item) => item.priority_bucket === 'needs_attention'),
    active_projects: activityDrilldowns.filter((item) => item.priority_bucket === 'running'),
    recent_projects: activityDrilldowns.filter((item) => item.priority_bucket === 'recent'),
  };
}

function buildDomainLaneMap(input: OplAppOperatorViewModelInput) {
  const runtimeTasksByDomain = new Map<string, ReturnType<typeof normalizeRuntimeActivityItem>[]>();
  for (const task of runtimeActivityDrilldowns(input)) {
    const domainId = asString(task.domain_id) ?? 'opl';
    const agentId = resolveStandardAgent(domainId)?.agent_id ?? domainId;
    runtimeTasksByDomain.set(agentId, [...(runtimeTasksByDomain.get(agentId) ?? []), task]);
  }
  const availability = asRecordArray(asRecord(input.workItemProjectionV2).agent_availability);

  return {
    lanes: availability.map((agent, index) => {
      const moduleId = asString(agent.agent_id) ?? `agent-${index + 1}`;
      const label = asString(agent.display_name) ?? moduleId;
      const healthStatus = asString(agent.availability) ?? 'unknown';
      const runtimeTasks = runtimeTasksByDomain.get(moduleId) ?? [];
      const tasks = runtimeTasks.map((task) => ({
        task_id: task.task_id,
        label: task.title,
        state: task.state,
        active_stage_id: task.active_stage_id,
        active_path_node_ids: [task.task_id],
        study_id: task.study_id,
        active_run_id: task.active_run_id,
      }));
      return {
        domain_id: moduleId,
        lane_label: label,
        agent_availability: healthStatus,
        availability_reason: asString(agent.reason),
        active_task_count: tasks.filter((task) => task.state === 'running').length,
        blocked_task_count: tasks.filter((task) => task.state === 'attention_needed').length,
        tasks,
      };
    }),
    source_ref: 'app_state.operator.workbench.work_item_projection_v2.agent_availability + activity_center',
  };
}

function buildTaskDrilldowns(input: OplAppOperatorViewModelInput) {
  return runtimeActivityDrilldowns(input);
}

function buildSafeActionRoutes(input: OplAppOperatorViewModelInput) {
  return input.actions
    .filter(actionCanUseGenericSafeDryRunRoute)
    .slice(0, input.profile === 'fast' ? 12 : 48)
    .map((action, index) => {
      const actionId = asString(action.action_id) ?? `app-action-${index + 1}`;
      return {
        action_id: actionId,
        label: asString(action.label) ?? actionId,
        owner: asString(action.owner) ?? 'opl_framework',
        route: asString(action.route) ?? `opl app action execute --action ${actionId}`,
        dry_run_supported: asBoolean(action.dry_run_supported),
        dry_run_required: true,
        confirmation_required: asBoolean(action.confirmation_required),
        danger_level: asString(action.danger_level) ?? 'unknown',
        source_ref: 'app_state.actions',
      };
    });
}

function buildDynamicVerticalMap(input: OplAppOperatorViewModelInput) {
  const safeActions = buildSafeActionRoutes(input);
  const rootNode = {
    node_id: 'route_graph:opl_app_state',
    node_kind: 'route_graph',
    label: 'OPL App state',
    state: 'ready',
    owner: 'opl_framework',
    ref: 'opl app state --profile fast --json',
  };
  const actionNodes = safeActions.slice(0, 8).map((action) => ({
    node_id: `safe_action:${action.action_id}`,
    node_kind: 'safe_action',
    label: action.label,
    state: 'ready',
    owner: action.owner,
    ref: action.route,
  }));
  return {
    nodes: [rootNode, ...actionNodes],
    edges: actionNodes.map((node) => ({
      from_node_id: rootNode.node_id,
      to_node_id: node.node_id,
      edge_kind: 'attempt_has_safe_action_route',
      label: 'safe action',
    })),
    node_limit: input.profile === 'fast' ? 9 : 49,
    source_ref: 'app_state.operator.workbench.safe_action_routes',
  };
}
export function buildOplAppOperatorViewModel(input: OplAppOperatorViewModelInput) {
  const temporal = asRecord(asRecord(input.provider).temporal);
  const status = temporal.ready === true ? 'ready' : 'attention_needed';
  const safeActionRoutes = buildSafeActionRoutes(input);
  const runtimeTasks = runtimeActivityDrilldowns(input);
  const runtimeScope = buildRuntimeScope(runtimeTasks);
  const userTaskStatusSummary = summarizeUserTaskStates(runtimeTasks);
  const activityCenter = buildActivityCenter(input);
  const domainLaneMap = buildDomainLaneMap(input);
  const taskDrilldowns = buildTaskDrilldowns(input);
  const taskRunProjection = buildTaskRunProjectionV2(runtimeTasks);
  const currentOwnerDeltaReadModel = asRecord(input.currentOwnerDeltaReadModel);
  const currentOwnerDeltaTopline = buildCurrentOwnerDeltaTopline({
    currentOwnerDeltaReadModel,
  });
  const defaultReadSurfacePolicy = buildDefaultReadSurfacePolicy(input);
  const ordinaryCockpit = buildOrdinaryCockpit(currentOwnerDeltaTopline, input);
  const brandExperienceProfile = buildBrandExperienceProfile(input);
  const oneShotPlanLanding = buildOneShotPlanLandingProfile(input);
  const foundry = asRecord(input.foundry);
  const lazyRefs = [
    {
      ref_id: 'full_app_state_refresh',
      surface: 'opl app state --profile full --json',
      policy: 'manual_refresh_or_section_level_refresh',
    },
    {
      ref_id: 'full_runtime_drilldown',
      surface: 'opl runtime app-operator-drilldown --detail full --json',
      policy: 'on_demand_diagnostic_only',
    },
  ];

  return {
    status,
    summary: {
      runtime_status: status,
      provider_status: asString(temporal.status) ?? asString(temporal.health_status) ?? 'unknown',
      visible_action_count: input.actions.length,
      profile: input.profile,
    },
    full_detail_surface: 'opl runtime app-operator-drilldown --detail full --json',
    default_read_surface_policy: defaultReadSurfacePolicy,
    ordinary_cockpit: ordinaryCockpit,
    brand_experience_profile: brandExperienceProfile,
    one_shot_plan_landing: oneShotPlanLanding,
    ...currentOwnerDeltaTopline,
    workbench: {
      view_model_schema: 'opl_app_operator_workbench.v1',
      default_read_surface_policy: defaultReadSurfacePolicy,
      ordinary_cockpit: ordinaryCockpit,
      brand_experience_profile: brandExperienceProfile,
      one_shot_plan_landing: oneShotPlanLanding,
      foundry,
      settings_control_center: {
        surface_kind: 'opl_settings_control_center_workbench_ref.v1',
        source_ref: 'app_state.settings_control_center',
        settings_projection_ref: 'app_state.settings_control_center.settings_projection',
        read_model_ref: 'app_state.settings_control_center.app_settings_read_model',
      },
      ...currentOwnerDeltaTopline,
      runtime_scope: runtimeScope,
      user_task_status_summary: userTaskStatusSummary,
      summary_cards: buildSummaryCards(input, userTaskStatusSummary),
      sections: buildSections(input),
      navigation: buildNavigation(),
      action_queue: buildActionQueue(input),
      activity_center: activityCenter,
      domain_lane_map: domainLaneMap,
      task_drilldowns: taskDrilldowns,
      task_run_projection_v2: taskRunProjection,
      work_item_projection_v1: taskRunProjection.work_item_projection_v1,
      work_item_projection_v2: input.workItemProjectionV2,
      agent_availability: asRecordArray(asRecord(input.workItemProjectionV2).agent_availability),
      safe_action_routes: safeActionRoutes,
      refresh_policy: {
        summary_poll_interval_seconds: 10,
        full_detail_auto_poll: false,
        per_token_streaming: false,
        failure_policy: 'section_level_status_with_last_good_display_cache_allowed',
      },
      performance_policy: {
        fast_json_target_bytes: 200000,
        fast_json_max_bytes: 500000,
        first_screen_action_limit: input.profile === 'fast' ? 16 : 48,
        global_map_renderer: 'bounded_typed_view_model',
        graph_layout_recompute: 'on_input_hash_change',
        shell_must_not_derive_layout_from_raw_runtime_projection: true,
        shell_must_not_use_full_drilldown_as_normal_state: true,
      },
      lazy_refs: lazyRefs,
    },
    dynamic_vertical_map: buildDynamicVerticalMap(input),
    visual_ref_groups: {
      needs_attention_refs: activityCenter.needs_attention,
      active_project_refs: activityCenter.active_projects,
      recent_project_refs: activityCenter.recent_projects,
      safe_action_refs: safeActionRoutes.map((action) => ({
        ref: action.route,
        label: action.label,
        action_id: action.action_id,
      })),
      foundry_run_refs: foundryRunItems(input).map((item) => ({
        ref: asString(item.run_id),
        label: asString(item.state),
        status_ref: asString(item.status_ref),
      })),
    },
    owner_boundary: {
      app_repo: 'gui_product_truth_and_release_gate_owner',
      opl_framework: 'app_state_action_and_runtime_projection_owner',
      shell: 'thin_renderer_and_ipc_adapter',
      can_write_domain_truth: false,
      can_read_memory_body: false,
      can_read_artifact_body: false,
      can_authorize_quality_verdict: false,
    },
    refs: lazyRefs.map((entry) => ({
      ref: entry.surface,
      label: entry.ref_id,
      node_kind: 'lazy_ref',
    })),
  };
}
