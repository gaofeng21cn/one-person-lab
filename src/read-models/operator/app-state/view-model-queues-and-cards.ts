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

export function foundryRunItems(input: OplAppOperatorViewModelInput) {
  return asRecordArray(asRecord(input.foundry).runs);
}

function foundryQueueItems(input: OplAppOperatorViewModelInput) {
  return foundryRunItems(input).flatMap((run, index) => {
    const state = asString(run.state) ?? 'unknown';
    const terminal = run.terminal === true;
    const ownerDecisionRequired = run.owner_decision_required === true;
    const attention = ['failed', 'quarantined', 'completed_unqualified'].includes(state);
    if (terminal && !attention) return [];
    const runId = asString(run.run_id) ?? `foundry-run-${index + 1}`;
    const targetAgentId = asString(run.target_agent_id) ?? 'unknown-agent';
    const targetDomainId = asString(run.target_domain_id) ?? 'unknown-domain';
    return [{
      item_id: `foundry:${encodeURIComponent(runId)}`,
      task_id: runId,
      title: targetAgentId,
      subtitle: `FoundryRun ${state}`,
      domain_id: targetDomainId,
      domain_label: targetDomainId,
      state,
      priority_bucket: ownerDecisionRequired
        ? 'needs_owner_decision'
        : attention
          ? 'foundry_attention'
          : 'automation_running',
      safe_action_ref_count: 0,
      blocker_ref_count: ownerDecisionRequired || attention ? 1 : 0,
      status_ref: asString(run.status_ref),
      expected_revision: asNumber(run.revision),
      authority_boundary: {
        owner_decision_requires_authority_receipt: ownerDecisionRequired,
        app_can_write_foundry_state: false,
      },
    }];
  });
}

export function buildActionQueue(input: OplAppOperatorViewModelInput) {
  const limit = input.profile === 'fast' ? 16 : 48;
  const foundryItems = foundryQueueItems(input);
  const actionLimit = Math.max(0, limit - foundryItems.length);
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
      ...foundryItems,
    ],
    item_limit: limit,
    source_ref: 'app_state.actions + app_state.foundry',
  };
}
