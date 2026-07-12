import type { OplAppOperatorViewModelInput } from '../app-state-view-model.ts';

type JsonRecord = Record<string, unknown>;

type RuntimeSummary = {
  active_project_count: number;
  in_progress_count: number;
  delivered_auto_paused_count: number;
  paused_count: number;
  owner_decision_count: number;
  system_attention_count: number;
  automation_running_count: number;
};

function asRecord(value: unknown): JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function asRecordArray(value: unknown): JsonRecord[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is JsonRecord => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))
    : [];
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
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

export function buildSummaryCards(input: OplAppOperatorViewModelInput, runtimeSummary: RuntimeSummary) {
  const codex = asRecord(asRecord(input.core.core).codex ?? asRecord(input.core).codex);
  const temporal = asRecord(asRecord(input.provider).temporal);
  const moduleSummary = asRecord(asRecord(input.modules).summary);
  const releaseChannel = asString(input.release.channel) ?? 'unknown';
  const codexVersion = asString(codex.parsed_version) ?? asString(codex.version) ?? 'missing';
  const codexModel = [asString(codex.default_model), asString(codex.default_reasoning_effort)]
    .filter(Boolean)
    .join(' ');
  const temporalStatus = asString(temporal.status) ?? asString(temporal.health_status) ?? 'unknown';
  const defaultModuleCount = asNumber(moduleSummary.default_carriers_count);
  const healthyModuleCount = asNumber(moduleSummary.healthy_default_carriers_count);
  const moduleValue = defaultModuleCount === null || healthyModuleCount === null
    ? 'unknown'
    : `${healthyModuleCount}/${defaultModuleCount}`;

  return [
    {
      card_id: 'active_projects',
      label: '活跃项目',
      value: runtimeSummary.in_progress_count,
      tone: runtimeSummary.in_progress_count > 0 ? 'running' : 'idle',
      source_ref: 'app_state.operator.workbench.user_task_status_summary',
    },
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
      card_id: 'runtime_source_carriers',
      label: 'Runtime source carriers',
      value: moduleValue,
      tone: defaultModuleCount !== null && healthyModuleCount === defaultModuleCount ? 'ready' : 'attention',
      source_ref: 'app_state.runtime_source_carriers.summary',
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

export function feedbackWorkOrderStatusItems(input: OplAppOperatorViewModelInput) {
  return asRecordArray(asRecord(input.agentLabFeedbackSelfEvolution).work_order_status_items);
}

export function feedbackOpsStatusItems(input: OplAppOperatorViewModelInput) {
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

export function buildActionQueue(input: OplAppOperatorViewModelInput) {
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
        };
      }),
      ...feedbackItems,
    ],
    item_limit: limit,
    source_ref: 'app_state.actions + app_state.operator.workbench.agent_lab_feedback_self_evolution + app_state.operator.workbench.feedbackops',
  };
}
