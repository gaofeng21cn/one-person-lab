import { buildCurrentOwnerDeltaTopline } from '../ledger/index.ts';
import { buildTaskRunProjectionV2 } from './app-state-task-run-projection.ts';
import { buildNavigation, buildSections } from './app-state-parts/view-model-sections.ts';

type JsonRecord = Record<string, unknown>;

type OplAppOperatorViewModelInput = {
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
  brandSystemProfile: JsonRecord;
  targetOperatingArchitecture: JsonRecord;
  currentOwnerDeltaReadModel?: JsonRecord;
  agentLabFeedbackSelfEvolution?: JsonRecord;
  feedbackOps?: JsonRecord;
};

const FORBIDDEN_FAST_PROFILE_FIELDS = [
  'runtime_tray_snapshot',
  'raw_evidence_envelope',
  'raw_evidence_browser',
  'raw_ledger_browser',
  'ledger_browser',
  'stage_replay_packet_body',
  'private_residue_inventory_body',
  'provider_internal_ledger_body',
  'provider_internal_trace',
  'route_variant_menu',
] as const;

const ORDINARY_COCKPIT_DISPLAY_FIELDS = [
  'purpose',
  'task',
  'current_owner',
  'next_action',
  'artifact_or_blocker',
] as const;

const ORDINARY_COCKPIT_DEVELOPER_FULL_ONLY = [
  'provider',
  'ledger',
  'worklist',
  'mcp_tool_catalog',
  'raw_receipts',
  'release_evidence',
] as const;

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

function statusTone(status: string | null) {
  if (!status) return 'neutral';
  return ['ready', 'healthy', 'ok', 'installed', 'enabled', 'stable'].includes(status)
    ? 'ready'
    : 'attention';
}

function actionPayloadFields(action: JsonRecord) {
  return Array.isArray(action.payload_fields)
    ? action.payload_fields.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function actionIsPayloadFree(action: JsonRecord) {
  return actionPayloadFields(action).length === 0;
}

function projectLineKey(task: JsonRecord) {
  return asString(task.task_id)
    ?? asString(task.project_scope_id)
    ?? asString(task.workspace_scope_id)
    ?? asString(task.study_id)
    ?? 'runtime-project-line';
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
  const ownerConsumedLatest = asBoolean(task.mas_owner_consumption_matches_runtime_closeout);
  const automationFailed = ['failed', 'dead_lettered'].includes(status ?? '');
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
  const resultPendingTerminalization = runtimeCloseoutObserved && !ownerConsumedLatest;

  const automationState = lane === 'running'
    ? 'automation_running'
    : automationFailed
      ? 'automation_failed'
      : resultPendingTerminalization
        ? 'result_pending_terminalization'
        : 'automation_idle';
  const automationStateLabel = automationState === 'automation_running'
    ? '自动运行中'
    : automationState === 'automation_failed'
      ? '自动流程异常'
      : automationState === 'result_pending_terminalization'
        ? '最近一次自动结果待收口'
        : '当前无自动任务';
  const automationStateReason = automationState === 'automation_running'
    ? 'active_runtime_run_observed'
    : automationState === 'automation_failed'
      ? 'runtime_failure_observed'
      : automationState === 'result_pending_terminalization'
        ? 'latest_runtime_result_not_yet_owner_consumed'
        : 'no_active_runtime_automation';

  const primaryState = lane === 'running'
    ? 'in_progress'
    : pausedWaiting
      ? 'paused_waiting_for_direction'
      : ownerDecisionRequired
        ? 'owner_decision_required'
        : automationFailed || lane === 'attention'
          ? 'system_attention_required'
          : runtimeCloseoutObserved || status === 'completed' || ownerConsumedLatest
            ? 'delivered_auto_paused'
            : 'paused_waiting_for_direction';
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

function buildRuntimeScope(tasks: ReadonlyArray<JsonRecord>) {
  const options = new Map<string, JsonRecord>();
  const addOption = (option: JsonRecord) => {
    const key = `${asString(option.scope_kind) ?? 'scope'}:${asString(option.scope_id) ?? 'default'}`;
    if (!options.has(key)) {
      options.set(key, option);
    }
  };

  const allProjects = scopeOption('all_projects', 'all_projects', '全部项目');
  addOption(allProjects);
  for (const task of tasks) {
    const domainId = asString(task.domain_id) ?? 'opl';
    const domainLabel = asString(task.agent_display_name) ?? asString(task.domain_label) ?? domainId;
    addOption(scopeOption('agent', asString(task.agent_scope_id) ?? `agent:${domainId}`, domainLabel, {
      domain_id: domainId,
    }));

    const workspaceScopeId = asString(task.workspace_scope_id);
    const workspaceLabel = asString(task.workspace_label);
    if (workspaceScopeId && workspaceLabel) {
      addOption(scopeOption('workspace', workspaceScopeId, workspaceLabel, {
        workspace_binding_id: asString(task.workspace_binding_id),
        workspace_path: asString(task.workspace_path),
        project_id: domainId,
      }));
    }

    const projectScopeId = asString(task.project_scope_id);
    const projectLabel = asString(task.project_display_name) ?? workspaceLabel ?? domainLabel;
    if (projectScopeId) {
      addOption(scopeOption('project', projectScopeId, projectLabel, {
        project_id: domainId,
        workspace_binding_id: asString(task.workspace_binding_id),
      }));
    }

    const taskId = asString(task.task_id);
    if (taskId) {
      addOption(scopeOption('task', asString(task.task_scope_id) ?? `task:${taskId}`, asString(task.title) ?? taskId, {
        task_id: taskId,
        project_id: domainId,
        study_id: asString(task.study_id),
      }));
    }
  }

  const inferredWorkspace = tasks.find((task) => asBoolean(task.workspace_binding_active) && Boolean(asString(task.workspace_scope_id)));
  return {
    scope_options: [...options.values()],
    current_scope: allProjects,
    scope_source: 'default_global',
    inferred_scope_hint: inferredWorkspace
      ? scopeOption(
          'workspace',
          asString(inferredWorkspace.workspace_scope_id) ?? 'workspace:inferred',
          asString(inferredWorkspace.workspace_label) ?? '当前工作区',
          {
            workspace_binding_id: asString(inferredWorkspace.workspace_binding_id),
            workspace_path: asString(inferredWorkspace.workspace_path),
            project_id: asString(inferredWorkspace.domain_id),
            hint_source: 'workspace_registry_active_binding',
          },
        )
      : null,
  };
}

function buildSummaryCards(input: OplAppOperatorViewModelInput) {
  const codex = asRecord(asRecord(input.core.core).codex ?? asRecord(input.core).codex);
  const temporal = asRecord(asRecord(input.provider).temporal);
  const moduleSummary = asRecord(asRecord(input.modules).summary);
  const runtimeTasks = runtimeActivityDrilldowns(input);
  const runtimeSummary = summarizeUserTaskStates(runtimeTasks);
  const releaseChannel = asString(input.release.channel) ?? 'unknown';
  const codexVersion = asString(codex.parsed_version) ?? asString(codex.version) ?? 'missing';
  const codexModel = [asString(codex.default_model), asString(codex.default_reasoning_effort)]
    .filter(Boolean)
    .join(' ');
  const temporalStatus = asString(temporal.status) ?? asString(temporal.health_status) ?? 'unknown';
  const defaultModuleCount = asNumber(moduleSummary.default_modules_count);
  const healthyModuleCount = asNumber(moduleSummary.healthy_default_modules_count);
  const moduleValue = defaultModuleCount === null || healthyModuleCount === null
    ? 'unknown'
    : `${healthyModuleCount}/${defaultModuleCount}`;

  return [
    {
      card_id: 'in_progress_count',
      label: '进行中',
      value: runtimeSummary.in_progress_count,
      tone: runtimeSummary.in_progress_count > 0 ? 'running' : 'idle',
      source_ref: 'app_state.operator.workbench.user_task_status_summary',
    },
    {
      card_id: 'delivered_auto_paused_count',
      label: '已交付，自动暂停',
      value: runtimeSummary.delivered_auto_paused_count,
      tone: runtimeSummary.delivered_auto_paused_count > 0 ? 'ready' : 'neutral',
      source_ref: 'app_state.operator.workbench.user_task_status_summary',
    },
    {
      card_id: 'paused_count',
      label: '已暂停',
      value: runtimeSummary.paused_count,
      tone: runtimeSummary.paused_count > 0 ? 'idle' : 'neutral',
      source_ref: 'app_state.operator.workbench.user_task_status_summary',
    },
    {
      card_id: 'owner_decision_count',
      label: '需要你决定',
      value: runtimeSummary.owner_decision_count,
      tone: runtimeSummary.owner_decision_count > 0 ? 'attention' : 'neutral',
      source_ref: 'app_state.operator.workbench.user_task_status_summary',
    },
    {
      card_id: 'system_attention_count',
      label: '需要系统处理',
      value: runtimeSummary.system_attention_count,
      tone: runtimeSummary.system_attention_count > 0 ? 'attention' : 'neutral',
      source_ref: 'app_state.operator.workbench.user_task_status_summary',
    },
    {
      card_id: 'automation_running_count',
      label: '自动运行中',
      value: runtimeSummary.automation_running_count,
      tone: runtimeSummary.automation_running_count > 0 ? 'running' : 'neutral',
      source_ref: 'app_state.operator.workbench.user_task_status_summary',
    },
    {
      card_id: 'runtime_status',
      label: 'Runtime status',
      value: temporal.ready === true ? 'ready' : 'attention_needed',
      tone: temporal.ready === true ? 'ready' : 'attention',
      source_ref: 'app_state.provider.temporal',
    },
    {
      card_id: 'codex_cli',
      label: 'Codex CLI',
      value: [codexVersion, codexModel].filter(Boolean).join(' / '),
      tone: codexVersion === 'missing' ? 'attention' : 'ready',
      source_ref: 'app_state.core.codex',
    },
    {
      card_id: 'temporal_provider',
      label: 'Temporal provider',
      value: temporalStatus,
      tone: statusTone(temporalStatus),
      source_ref: 'app_state.provider.temporal',
    },
    {
      card_id: 'runtime_modules',
      label: 'Runtime modules',
      value: moduleValue,
      tone: defaultModuleCount !== null && healthyModuleCount === defaultModuleCount ? 'ready' : 'attention',
      source_ref: 'app_state.modules.summary',
    },
    {
      card_id: 'release_channel',
      label: 'Release channel',
      value: releaseChannel,
      tone: statusTone(releaseChannel),
      source_ref: 'app_state.release',
    },
  ];
}

function buildActionQueue(input: OplAppOperatorViewModelInput) {
  const limit = input.profile === 'fast' ? 16 : 48;
  const feedbackItems = [
    ...feedbackWorkOrderQueueItems(input),
    ...feedbackOpsQueueItems(input),
  ];
  const actionLimit = Math.max(0, limit - feedbackItems.length);
  return {
    items: [
      ...input.actions.slice(0, actionLimit).map((action, index) => {
        const actionId = asString(action.action_id) ?? `app-action-${index + 1}`;
        const payloadFree = actionIsPayloadFree(action);
        return {
          item_id: `action:${actionId}`,
          task_id: actionId,
          title: asString(action.label) ?? actionId,
          subtitle: asString(action.delegated_surface) ?? 'opl app action execute',
          domain_id: asString(action.module_id) ?? 'opl',
          domain_label: 'OPL',
          state: payloadFree ? 'ready' : 'payload_required',
          priority_bucket: payloadFree ? 'can_dry_run' : 'needs_payload',
          safe_action_ref_count: payloadFree ? 1 : 0,
          blocker_ref_count: payloadFree ? 0 : 1,
          paper_route_lens_ref_count: 0,
        };
      }),
      ...feedbackItems,
    ],
    item_limit: limit,
    source_ref: 'app_state.actions + app_state.operator.workbench.agent_lab_feedback_self_evolution + app_state.operator.workbench.feedbackops',
  };
}

function feedbackWorkOrderStatusItems(input: OplAppOperatorViewModelInput) {
  return asRecordArray(asRecord(input.agentLabFeedbackSelfEvolution).work_order_status_items);
}

function feedbackOpsStatusItems(input: OplAppOperatorViewModelInput) {
  return asRecordArray(asRecord(input.feedbackOps).work_order_status_items);
}

function feedbackWorkOrderQueueItems(input: OplAppOperatorViewModelInput) {
  return feedbackWorkOrderStatusItems(input).map((item, index) => {
    const workOrderRef = asString(item.work_order_ref) ?? `agent-lab-feedback-work-order-${index + 1}`;
    const status = asString(item.status) ?? 'queued';
    const runnable = item.runnable === true;
    const blockerRef = asString(item.blocker_ref);
    return {
      item_id: `agent_lab_feedback:${encodeURIComponent(workOrderRef)}`,
      task_id: workOrderRef,
      title: workOrderRef,
      subtitle: 'Agent Lab feedback work-order projection',
      domain_id: asString(item.domain_id) ?? 'opl',
      domain_label: asString(item.domain_id) ?? 'OPL',
      state: status,
      priority_bucket: status === 'runnable'
        ? 'can_execute_work_order'
        : status === 'completed_or_blocker'
          ? 'terminal_or_blocked'
          : 'queued',
      safe_action_ref_count: runnable ? 1 : 0,
      blocker_ref_count: blockerRef ? 1 : 0,
      paper_route_lens_ref_count: 0,
      trigger_ref: asString(item.trigger_ref),
      external_suite_ref: asString(item.external_suite_ref),
      developer_work_order_candidate_ref: asString(item.developer_work_order_candidate_ref),
      completion_ref: asString(item.completion_ref),
      blocker_ref: blockerRef,
      action_route_ref: asString(item.action_route_ref),
      execution_surface: asString(item.execution_surface),
      authority_boundary: asRecord(item.authority_boundary),
    };
  });
}

function feedbackOpsQueueItems(input: OplAppOperatorViewModelInput) {
  return feedbackOpsStatusItems(input).map((item, index) => {
    const workOrderRef = asString(item.work_order_ref) ?? `feedbackops-work-order-${index + 1}`;
    const status = asString(item.status) ?? 'suite_ready';
    const runnable = item.runnable === true;
    const blockerRef = asString(item.blocker_ref);
    return {
      item_id: `feedbackops:${encodeURIComponent(workOrderRef)}`,
      task_id: workOrderRef,
      title: workOrderRef,
      subtitle: 'FeedbackOps delivery feedback projection',
      domain_id: asString(item.domain_id) ?? 'opl',
      domain_label: asString(item.domain_id) ?? 'OPL',
      state: status,
      priority_bucket: status === 'executable'
        ? 'can_execute_work_order'
        : status === 'queued_requires_developer_mode'
          ? 'requires_developer_mode'
          : status === 'completed_or_blocker'
            ? 'terminal_or_blocked'
            : 'suite_ready',
      safe_action_ref_count: runnable ? 1 : 0,
      blocker_ref_count: blockerRef ? 1 : 0,
      paper_route_lens_ref_count: 0,
      trigger_ref: asString(item.trigger_ref),
      external_suite_ref: asString(item.external_suite_ref),
      developer_work_order_candidate_ref: asString(item.developer_work_order_candidate_ref),
      completion_ref: asString(item.completion_ref),
      blocker_ref: blockerRef,
      action_route_ref: asString(item.action_route_ref),
      execution_surface: asString(item.execution_surface),
      authority_boundary: asRecord(item.authority_boundary),
    };
  });
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

function activityPriorityBucket(item: JsonRecord) {
  const lane = asString(item.lane);
  if (lane === 'running') {
    return 'running';
  }
  if (lane === 'attention') {
    return 'needs_attention';
  }
  return 'recent';
}

function normalizeRuntimeActivityItem(item: JsonRecord, index: number) {
  const studyId = asString(item.study_id);
  const taskId = asString(item.item_id)
    ?? (studyId ? `medautoscience:study:${studyId}` : `runtime-activity-${index + 1}`);
  const title = asString(item.title) ?? studyId ?? taskId;
  const encodedTaskId = encodeURIComponent(taskId);
  const sourceRef = `app_state.operator.workbench.task_drilldowns.${encodedTaskId}`;
  const activeRunId = asString(item.active_run_id);
  const nextVisibleStep = asString(item.next_action_summary)
    ?? asString(item.action_summary)
    ?? asString(item.summary);
  const route = commandRoute(item);
  const state = activityState(item);
  const domainId = asString(item.project_id) ?? 'opl';
  const domainLabel = asString(item.project_label) ?? asString(item.domain_owner) ?? 'OPL';
  const stageId = asString(item.active_stage_id)
    ?? asString(item.status)
    ?? asString(item.health_status)
    ?? asString(item.lane)
    ?? 'runtime_activity';
  const blockerRefCount = asRecordArray(item.blockers).length;
  const refs = taskUserProjectionRefs({
    taskId,
    domainId,
    state,
    stageId,
    stageLabel: asString(item.status_label),
    blockerRefCount,
  });
  const currentStageUsage = asRecord(item.current_stage_usage);
  const taskTotalUsage = asRecord(item.task_total_usage);
  const typedBlockerSummary = asString(item.typed_blocker_summary);
  const typedBlockerOwner = asString(item.typed_blocker_owner) ?? domainId ?? 'opl_framework';
  const resolutionRoute = asString(item.resolution_route) ?? nextVisibleStep;
  const userState = deriveUserFacingTaskState(item);
  const agentDisplayName = asString(item.agent_display_name) ?? domainLabel;
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
      work_item_id: studyId ?? taskId,
      label: workItemDisplayName,
      kind: studyId ? 'study' : 'runtime_activity',
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
    priority_bucket: activityPriorityBucket(item),
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
    paper_route_lens_ref_count: 0,
    runtime_readback_source: asString(item.runtime_readback_source),
    runtime_attempt_status: asString(item.runtime_attempt_status),
    runtime_closeout_observed: item.runtime_closeout_observed === true,
    runtime_closeout_ref: asString(item.runtime_closeout_ref),
    mas_owner_consumption_status: asString(item.mas_owner_consumption_status),
    mas_owner_consumption_ref: asString(item.mas_owner_consumption_ref),
    mas_owner_consumed_stage_attempt_id: asString(item.mas_owner_consumed_stage_attempt_id),
    mas_owner_consumed_closeout_ref: asString(item.mas_owner_consumed_closeout_ref),
    mas_owner_consumption_matches_runtime_closeout: item.mas_owner_consumption_matches_runtime_closeout === true,
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
        node_kind: studyId ? 'mas_study_runtime_projection' : 'runtime_activity_projection',
        label: title,
        state,
        owner: 'opl_framework',
        ref: route,
      },
    ],
  };
}

function runtimeActivityDrilldowns(input: OplAppOperatorViewModelInput) {
  return input.runtimeActivityItems.map(normalizeRuntimeActivityItem);
}

function moduleTaskDrilldowns(input: OplAppOperatorViewModelInput) {
  return asRecordArray(asRecord(input.modules).items).map((module, index) => {
    const moduleId = asString(module.module_id) ?? `module-${index + 1}`;
    const label = asString(module.label) ?? moduleId;
    const healthStatus = asString(module.health_status) ?? asString(module.status) ?? 'unknown';
    const blockerRefCount = statusTone(healthStatus) === 'ready' ? 0 : 1;
    const primaryState = blockerRefCount > 0 ? 'system_attention_required' : 'delivered_auto_paused';
    const primaryStateLabel = blockerRefCount > 0 ? '需要系统处理' : '已交付，自动暂停';
    const primaryStateReason = blockerRefCount > 0 ? 'module_attention_required' : 'module_ready_idle';
    const refs = taskUserProjectionRefs({
      taskId: moduleId,
      domainId: moduleId,
      state: healthStatus,
      stageId: 'module_runtime',
      stageLabel: null,
      blockerRefCount,
    });
    return {
      task_id: moduleId,
      domain_id: moduleId,
      title: label,
      state: healthStatus,
      task_identity: {
        task_id: moduleId,
        domain_id: moduleId,
        domain_label: label,
        title: label,
        study_id: null,
        task_ref: `app_state.operator.workbench.task_drilldowns.${encodeURIComponent(moduleId)}`,
        agent_display_name: label,
        project_display_name: label,
        work_item_display_name: label,
        execution_run_label: 'module_runtime',
        agent: {
          agent_id: moduleId,
          label,
          scope_id: `agent:${moduleId}`,
        },
        project: {
          project_id: moduleId,
          label,
          scope_id: `project:${moduleId}`,
        },
        work_item: {
          work_item_id: moduleId,
          label,
          kind: 'module_runtime',
          scope_id: `task:${moduleId}`,
        },
        execution_run: {
          run_id: null,
          label: 'module_runtime',
          stage_id: 'module_runtime',
          stage_label: null,
        },
      },
      active_stage_id: 'module_runtime',
      stage_attempt_ids: [],
      safe_action_ref_count: 0,
      blocker_ref_count: blockerRefCount,
      paper_route_lens_ref_count: 0,
      primary_state: primaryState,
      primary_state_label: primaryStateLabel,
      primary_state_reason: primaryStateReason,
      automation_state: 'automation_idle',
      automation_state_label: '当前无自动任务',
      automation_state_reason: 'module_projection_has_no_runtime_automation',
      ...refs,
      active_path: [
        {
          node_id: `module:${moduleId}`,
          node_kind: 'stage_attempt',
          label,
          state: healthStatus,
          owner: 'opl_framework',
          ref: asString(module.checkout_path) ?? asString(module.managed_checkout_path) ?? undefined,
        },
      ],
    };
  });
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
    runtimeTasksByDomain.set(domainId, [...(runtimeTasksByDomain.get(domainId) ?? []), task]);
  }

  return {
    lanes: asRecordArray(asRecord(input.modules).items).map((module, index) => {
      const moduleId = asString(module.module_id) ?? `module-${index + 1}`;
      const label = asString(module.label) ?? moduleId;
      const healthStatus = asString(module.health_status) ?? asString(module.status) ?? 'unknown';
      const runtimeTasks = runtimeTasksByDomain.get(moduleId) ?? [];
      const moduleTask = {
        task_id: moduleId,
        label,
        state: healthStatus,
        active_stage_id: 'module_runtime',
        active_path_node_ids: [`module:${moduleId}`],
        paper_route_lens_ref_count: 0,
      };
      const tasks = runtimeTasks.length > 0
        ? runtimeTasks.map((task) => ({
            task_id: task.task_id,
            label: task.title,
            state: task.state,
            active_stage_id: task.active_stage_id,
            active_path_node_ids: [task.task_id],
            study_id: task.study_id,
            active_run_id: task.active_run_id,
            paper_route_lens_ref_count: task.paper_route_lens_ref_count,
          }))
        : [moduleTask];
      return {
        domain_id: moduleId,
        lane_label: label,
        active_task_count: tasks.filter((task) => task.state === 'running').length,
        blocked_task_count: statusTone(healthStatus) === 'ready'
          ? tasks.filter((task) => task.state === 'attention_needed').length
          : 1,
        paper_route_lens_ref_count: 0,
        tasks,
      };
    }),
    source_ref: 'app_state.modules.items + app_state.operator.workbench.activity_center',
  };
}

function buildTaskDrilldowns(input: OplAppOperatorViewModelInput) {
  return [
    ...runtimeActivityDrilldowns(input),
    ...moduleTaskDrilldowns(input),
  ];
}

function buildSafeActionRoutes(input: OplAppOperatorViewModelInput) {
  return input.actions
    .filter(actionIsPayloadFree)
    .slice(0, input.profile === 'fast' ? 12 : 48)
    .map((action, index) => {
      const actionId = asString(action.action_id) ?? `app-action-${index + 1}`;
      return {
        action_id: actionId,
        label: asString(action.label) ?? actionId,
        owner: 'opl_framework',
        route: `opl app action execute --action ${actionId}`,
        dry_run_required: true,
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

function ownerKey(value: string | null) {
  return value?.toLowerCase().replace(/[^a-z0-9]+/g, '') ?? '';
}

function selectOrdinaryCockpitTaskFallback(
  currentOwner: string,
  runtimeActivityItems: ReadonlyArray<JsonRecord>,
) {
  const currentOwnerKey = ownerKey(currentOwner);
  const matching = runtimeActivityItems.filter((item) => {
    const itemOwnerKey = ownerKey(asString(item.domain_owner));
    const itemProjectKey = ownerKey(asString(item.project_id));
    return currentOwnerKey.length > 0
      && (itemOwnerKey === currentOwnerKey || itemProjectKey === currentOwnerKey);
  });
  return matching.find((item) => asString(item.lane) === 'attention')
    ?? matching.find((item) => asString(item.lane) === 'running')
    ?? matching[0]
    ?? null;
}

function buildOrdinaryCockpit(
  currentOwnerDeltaTopline: JsonRecord,
  input: OplAppOperatorViewModelInput,
) {
  const currentOwnerDelta = asRecord(currentOwnerDeltaTopline.current_owner_delta);
  const currentOwnerDeltaReadModel = asRecord(currentOwnerDeltaTopline.current_owner_delta_read_model);
  const nextAction = asRecord(currentOwnerDeltaTopline.operator_next_action);
  const hardGate = asRecord(currentOwnerDelta.hard_gate);
  const auditRefs = asRecord(currentOwnerDelta.audit_refs);
  const currentOwner = asString(currentOwnerDelta.current_owner)
    ?? asString(currentOwnerDelta.owner)
    ?? 'one-person-lab';
  const taskFallback = selectOrdinaryCockpitTaskFallback(currentOwner, input.runtimeActivityItems);
  const taskRef = asString(currentOwnerDelta.task_or_study_ref)
    ?? asString(currentOwnerDelta.stage_ref)
    ?? asString(currentOwnerDelta.stage_id)
    ?? asString(taskFallback?.item_id)
    ?? asString(taskFallback?.study_id)
    ?? 'opl-current-owner-delta';
  const latestOwnerAnswerRef = asString(currentOwnerDelta.latest_owner_answer_ref)
    ?? asString(hardGate.owner_answer_ref)
    ?? asString(currentOwnerDelta.latest_typed_blocker_ref);
  const artifactScopeRef = asString(auditRefs.artifact_scope_ref)
    ?? asString(currentOwnerDelta.artifact_scope_ref);
  const blockerRef = asString(currentOwnerDelta.latest_typed_blocker_ref)
    ?? asString(hardGate.typed_blocker_ref);
  const actionOwner = asString(currentOwnerDeltaTopline.operator_next_action_owner)
    ?? asString(nextAction.next_required_owner)
    ?? currentOwner;
  const actionKind = asString(currentOwnerDeltaTopline.operator_next_action_kind)
    ?? asString(nextAction.action_kind)
    ?? 'owner_delta_followthrough_required';
  const actionSummary = actionOwner === 'one-person-lab'
    ? 'Continue the current stage handoff.'
    : (asString(currentOwnerDelta.desired_delta_description)
        ?? 'Return an owner receipt, typed blocker, or current stage artifact.');

  return {
    surface_kind: 'opl_app_ordinary_cockpit',
    schema_version: 'ordinary-cockpit.v1',
    display_payload_policy: 'purpose_task_current_owner_next_action_artifact_or_blocker_only',
    ordinary_progress_spine: asRecord(currentOwnerDelta.ordinary_progress_spine),
    progress_delta_receipt: asRecord(currentOwnerDelta.progress_delta_receipt),
    artifact_tier_policy: asRecord(currentOwnerDelta.artifact_tier_policy),
    audit_sidecar_policy: asRecord(currentOwnerDelta.audit_sidecar_policy),
    display_payload_fields: [...ORDINARY_COCKPIT_DISPLAY_FIELDS],
    developer_full_drilldown_only: [...ORDINARY_COCKPIT_DEVELOPER_FULL_ONLY],
    display_payload: {
      purpose: {
        purpose_id: 'continue_current_stage',
        label: 'Continue current stage',
        source_ref: 'app_state.operator.current_owner_delta',
      },
      task: {
        task_ref: taskRef,
        stage_ref: asString(currentOwnerDelta.stage_ref) ?? asString(currentOwnerDelta.stage_id),
        domain_id: asString(currentOwnerDelta.domain_id) ?? asString(currentOwnerDelta.domain),
        title: asString(taskFallback?.title),
        status_label: asString(taskFallback?.status_label),
      },
      current_owner: currentOwner,
      next_action: {
        owner: actionOwner,
        action_kind: actionKind,
        summary: actionSummary,
        source_ref: 'app_state.operator.current_owner_delta',
      },
      artifact_or_blocker: {
        status: blockerRef
          ? 'blocker_available'
          : latestOwnerAnswerRef || artifactScopeRef
            ? 'artifact_or_receipt_available'
            : 'awaiting_owner_answer',
        artifact_ref: artifactScopeRef,
        owner_answer_ref: latestOwnerAnswerRef,
        blocker_ref: blockerRef,
        expected_shape: 'owner_receipt_or_typed_blocker_or_stage_artifact_ref',
        content_policy: 'refs_only_no_artifact_or_receipt_body',
      },
    },
    authority_boundary: {
      default_next_action_derives_from: asString(
        currentOwnerDeltaReadModel.default_next_action_derivation_policy,
      ) ?? 'derive_default_next_action_only_from_current_owner_delta',
      default_planning_root: asString(currentOwnerDelta.default_planning_root)
        ?? 'current_owner_delta',
      can_write_domain_truth: false,
      can_read_artifact_body: false,
      can_read_memory_body: false,
      can_create_owner_receipt: false,
      can_create_typed_blocker: false,
      can_authorize_quality_verdict: false,
      can_claim_app_release_ready: false,
      can_claim_production_ready: false,
    },
  };
}

function buildDefaultReadSurfacePolicy(input: OplAppOperatorViewModelInput) {
  const currentOwnerDeltaReadModel = asRecord(input.currentOwnerDeltaReadModel);
  return {
    surface_kind: 'opl_app_default_read_surface_policy',
    schema_version: 'default-read-surface-policy.v1',
    profile: input.profile,
    default_operator_payload: 'ordinary_cockpit',
    default_planning_root: 'current_owner_delta',
    ordinary_progress_spine: asRecord(currentOwnerDeltaReadModel.ordinary_progress_spine),
    progress_delta_receipt: asRecord(currentOwnerDeltaReadModel.progress_delta_receipt),
    artifact_tier_policy: asRecord(currentOwnerDeltaReadModel.artifact_tier_policy),
    audit_sidecar_policy: asRecord(currentOwnerDeltaReadModel.audit_sidecar_policy),
    normal_state_surface: 'opl app state --profile fast --json',
    full_state_surface: 'opl app state --profile full --json',
    full_runtime_drilldown_surface: 'opl runtime app-operator-drilldown --detail full --json',
    raw_runtime_projection_policy: 'explicit_full_detail_or_lazy_diagnostic_only',
    runtime_tray_projection_policy: 'current_owner_delta_first_runtime_tray_worklist_audit_tail_drilldown',
    worklist_projection_policy: 'secondary_drilldown_never_default_planning_root',
    first_screen_answers: [
      ...ORDINARY_COCKPIT_DISPLAY_FIELDS,
    ],
    diagnostic_only_answers: [
      'current_owner_delta',
      'current_owner_delta_read_model',
      'count_summary',
      'audit_next_safe_action_or_none',
      'full_detail_refs',
      ...ORDINARY_COCKPIT_DEVELOPER_FULL_ONLY,
    ],
    ordinary_cockpit: {
      display_payload_policy: 'purpose_task_current_owner_next_action_artifact_or_blocker_only',
      ordinary_progress_spine_ref: 'app_state.operator.ordinary_cockpit.ordinary_progress_spine',
      progress_delta_receipt_ref: 'app_state.operator.ordinary_cockpit.progress_delta_receipt',
      artifact_tier_policy_ref: 'app_state.operator.ordinary_cockpit.artifact_tier_policy',
      audit_sidecar_policy_ref: 'app_state.operator.ordinary_cockpit.audit_sidecar_policy',
      brand_experience_profile_ref: 'app_state.operator.brand_experience_profile',
      display_payload_fields: [...ORDINARY_COCKPIT_DISPLAY_FIELDS],
      developer_full_drilldown_only: [...ORDINARY_COCKPIT_DEVELOPER_FULL_ONLY],
    },
    fast_profile_excludes: [
      ...FORBIDDEN_FAST_PROFILE_FIELDS,
    ],
    forbidden_fast_profile_fields: [...FORBIDDEN_FAST_PROFILE_FIELDS],
    shell_contract: {
      shell_must_not_use_full_drilldown_as_normal_state: true,
      shell_must_not_derive_layout_from_raw_runtime_projection: true,
      full_detail_auto_poll: false,
    },
    authority_boundary: {
      can_write_domain_truth: false,
      can_read_memory_body: false,
      can_read_artifact_body: false,
      can_create_owner_receipt: false,
      can_close_domain_ready: false,
      can_authorize_quality_verdict: false,
      can_claim_app_release_ready: false,
      can_claim_production_ready: false,
      raw_worklist_can_generate_default_next_action: false,
      raw_evidence_can_generate_default_next_action: false,
      audit_sidecar_can_generate_default_next_action: false,
    },
  };
}

function buildBrandExperienceProfile(input: OplAppOperatorViewModelInput) {
  const ordinaryAppExperience = asRecord(input.brandSystemProfile.ordinary_app_experience);
  return {
    surface_kind: 'opl_app_brand_experience_profile',
    schema_version: 'app-brand-experience-profile.v1',
    source_profile_ref: 'contracts/opl-framework/brand-system-profile.json#ordinary_app_experience',
    default_read_surface_ref: asString(ordinaryAppExperience.default_read_surface_ref)
      ?? 'app_state.operator.ordinary_cockpit',
    contract_refs: [
      'contracts/opl-framework/brand-system-profile.json#ordinary_app_experience',
      'contracts/opl-framework/brand-module-l5-operating-evidence.json#evidence_classes.ordinary_app_experience',
    ],
    experience_axes: asRecordArray(ordinaryAppExperience.experience_axes).map((axis) => ({
      axis_id: asString(axis.axis_id),
      user_visible_goal: asString(axis.user_visible_goal),
      app_projection_ref: asString(axis.app_projection_ref),
      l5_evidence_class_ref: asString(axis.l5_evidence_class_ref),
      must_not_claim: Array.isArray(axis.must_not_claim)
        ? axis.must_not_claim.filter((entry): entry is string => typeof entry === 'string')
        : [],
    })),
    display_language_refs: {
      status_terms_ref: 'contracts/opl-framework/brand-system-profile.json#app_status_language.default_terms',
      visual_patterns_ref: 'contracts/opl-framework/brand-system-profile.json#visual_system.pattern_groups',
      receipt_blocker_language_ref:
        'contracts/opl-framework/brand-system-profile.json#receipt_blocker_language',
    },
    l5_evidence_refs_only: ordinaryAppExperience.l5_evidence_refs_only === true,
    authority_boundary: {
      can_claim_l5: false,
      can_claim_app_release_ready: false,
      can_authorize_quality_verdict: false,
      can_create_owner_receipt: false,
      can_create_typed_blocker: false,
    },
  };
}

function buildOneShotPlanLandingProfile(input: OplAppOperatorViewModelInput) {
  const model = asRecord(input.targetOperatingArchitecture.one_shot_plan_landing_model);
  const summary = asRecord(model.summary);
  const implementationSlices = asRecordArray(model.implementation_slices);
  return {
    surface_kind: 'opl_app_one_shot_plan_landing_profile',
    schema_version: 'one-shot-plan-landing-profile.v1',
    source_contract_ref:
      'contracts/opl-framework/target-operating-architecture-contract.json#one_shot_plan_landing_model',
    model_id: asString(model.model_id) ?? 'opl_family_one_shot_plan_landing.v1',
    status: summary.external_owner_evidence_still_required === true
      ? 'opl_surfaces_landed_external_owner_evidence_required'
      : 'opl_surfaces_landed_no_external_owner_gate_observed',
    summary: {
      total_plan_count: asNumber(summary.total_plan_count) ?? implementationSlices.length,
      opl_landed_count: asNumber(summary.opl_landed_count) ?? 0,
      opl_landed_owner_gated_count: asNumber(summary.opl_landed_owner_gated_count) ?? 0,
      external_owner_gated_count: asNumber(summary.external_owner_gated_count) ?? 0,
      all_opl_controlled_surfaces_landed: summary.all_opl_controlled_surfaces_landed === true,
      external_owner_evidence_still_required: summary.external_owner_evidence_still_required === true,
      ready_claim_authorized: false,
    },
    owner_gated_plan_ids: implementationSlices
      .filter((slice) => asString(slice.status) !== 'opl_landed')
      .map((slice) => asString(slice.plan_id))
      .filter((entry): entry is string => Boolean(entry)),
    visible_completion_message:
      'OPL-controlled contracts, read models, runtime routes, App projection, and evidence routers are landed; domain/App/L5/production readiness still requires owner evidence.',
    remaining_owner_gates: implementationSlices
      .filter((slice) => asString(slice.remaining_owner_gate) !== 'none')
      .map((slice) => ({
        plan_id: asString(slice.plan_id),
        title: asString(slice.title),
        status: asString(slice.status),
        remaining_owner_gate: asString(slice.remaining_owner_gate),
      })),
    validation_commands: [
      ...new Set(implementationSlices.flatMap((slice) =>
        Array.isArray(slice.validation_commands)
          ? slice.validation_commands.filter((entry): entry is string => typeof entry === 'string')
          : []
      )),
    ],
    authority_boundary: {
      can_claim_domain_ready: false,
      can_claim_quality_verdict: false,
      can_claim_artifact_authority: false,
      can_claim_app_release_ready: false,
      can_claim_brand_l5_ready: false,
      can_claim_production_ready: false,
      can_claim_mas_paper_done: false,
      can_write_domain_truth: false,
      can_sign_owner_receipt: false,
      can_create_typed_blocker: false,
      can_authorize_physical_delete: false,
    },
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
  const currentOwnerDeltaReadModel = asRecord(input.currentOwnerDeltaReadModel);
  const currentOwnerDeltaTopline = buildCurrentOwnerDeltaTopline({
    currentOwnerDeltaReadModel,
  });
  const defaultReadSurfacePolicy = buildDefaultReadSurfacePolicy(input);
  const ordinaryCockpit = buildOrdinaryCockpit(currentOwnerDeltaTopline, input);
  const brandExperienceProfile = buildBrandExperienceProfile(input);
  const oneShotPlanLanding = buildOneShotPlanLandingProfile(input);
  const agentLabFeedbackSelfEvolution = asRecord(input.agentLabFeedbackSelfEvolution);
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
      agent_lab_feedback_self_evolution: agentLabFeedbackSelfEvolution,
      feedbackops: input.feedbackOps ?? {},
      settings_control_center: input.settingsControlCenter,
      ...currentOwnerDeltaTopline,
      runtime_scope: runtimeScope,
      user_task_status_summary: userTaskStatusSummary,
      summary_cards: buildSummaryCards(input),
      sections: buildSections(input),
      navigation: buildNavigation(),
      action_queue: buildActionQueue(input),
      activity_center: activityCenter,
      domain_lane_map: domainLaneMap,
      task_drilldowns: taskDrilldowns,
      task_run_projection_v2: buildTaskRunProjectionV2(runtimeTasks),
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
      agent_lab_feedback_work_order_refs: feedbackWorkOrderStatusItems(input).map((item) => ({
        ref: asString(item.work_order_ref),
        label: asString(item.status),
        action_route_ref: asString(item.action_route_ref),
      })),
      feedbackops_work_order_refs: feedbackOpsStatusItems(input).map((item) => ({
        ref: asString(item.work_order_ref),
        label: asString(item.status),
        action_route_ref: asString(item.action_route_ref),
      })),
      lazy_refs: lazyRefs,
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
