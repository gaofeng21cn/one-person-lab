import type { LocalCodexDefaults } from './local-codex-defaults.ts';

export const OPL_ENTRY_APP_TITLE = 'OPL';
export const OPL_ENTRY_AGENT_LABEL = 'OPL Agent';
export const OPL_ENTRY_MCP_SERVER_KEY = 'opl_cortex';
export const OPL_ENTRY_MCP_SERVER_LABEL = 'OPL Cortex';

type OplWelcomeOptions = {
  publicOrigin: string;
  entryUrl: string;
  codexDefaults: LocalCodexDefaults;
  workspacePath?: string | null;
  activeProjectLabel?: string | null;
};

export function buildOplShellMcpWiring() {
  return {
    surface_kind: 'opl_hosted_shell_mcp_wiring',
    binding_context: {
      primary_tool_name: 'opl_workspace',
      activate_tool_name: 'opl_workspace',
      binding_contract_surface_id: 'opl_project_workspace_binding_contract',
    },
    session_attribution: {
      primary_tool_name: 'opl_session',
      fallback_tool_name: 'opl_session',
      attribution_surface_id: 'opl_managed_session_ledger',
    },
    execution_context: {
      primary_tool_name: 'opl_execute_request',
      task_status_tool_name: 'opl_task_status',
      sessions_tool_name: 'opl_session',
      resume_tool_name: 'opl_session',
      logs_tool_name: 'opl_session',
    },
    discovery_order: [
      'opl_project_progress',
      'opl_execute_request',
      'opl_task_status',
      'opl_workspace',
      'opl_session',
    ],
  };
}

export function buildOplAionRuntimeConsumptionContract() {
  return {
    surface_kind: 'opl_aion_runtime_consumption_contract',
    shell_adapter: 'aionui',
    consumer: 'one_person_lab_app_runtime_page',
    default_read_model_command: ['runtime', 'app-operator-drilldown'],
    default_detail_level: 'summary',
    default_payload_ref: '/app_operator_drilldown/attention_first_payload',
    default_sections: [
      'owner',
      'blocking',
      'advisory',
      'missing_evidence',
      'next_safe_action',
      'provider_health',
    ],
    full_detail_command: ['runtime', 'app-operator-drilldown', '--detail', 'full'],
    full_detail_policy: 'explicit_drilldown_lazy_load_only',
    action_submission: {
      surface: 'opl runtime action execute',
      action_id_ref: '/app_operator_drilldown/attention_first_payload/next_safe_action/action_id',
      requires_full_detail_payload_before_submit: false,
      domain_actions_are_queued_or_approval_gated: true,
      app_executes_domain_action_directly: false,
    },
    authority_boundary: {
      opl: 'read_model_and_safe_action_shell_owner',
      aionui: 'consumer_shell_only',
      domain: 'truth_memory_artifact_quality_export_owner',
      can_write_domain_truth: false,
      can_read_memory_body: false,
      can_read_artifact_body: false,
      can_authorize_quality_verdict: false,
      can_authorize_export_verdict: false,
      provider_completion_is_domain_ready: false,
    },
  };
}

export function inferOplWorkspaceLabel(options: {
  workspacePath?: string | null;
  fallbackLabel?: string | null;
}) {
  const workspacePath = options.workspacePath?.trim();
  if (!workspacePath) {
    const fallbackLabel = options.fallbackLabel?.trim();
    return fallbackLabel || 'Unbound workspace';
  }

  const normalized = workspacePath.replace(/[\\/]+$/, '');
  const segments = normalized.split(/[\\/]/).filter(Boolean);
  return segments.at(-1) ?? normalized;
}

export function buildOplShellWelcome(options: OplWelcomeOptions) {
  const workspaceLabel = inferOplWorkspaceLabel({
    workspacePath: options.workspacePath,
    fallbackLabel: options.activeProjectLabel,
  });
  const lines = [
    `当前工作区：${workspaceLabel}`,
    '可直接说：论文进度、继续推进、切换项目。',
    '长任务会先受理，再持续返回任务进展。',
  ];

  return lines.join('\n');
}

export function buildOplTitlePrompt() {
  return [
    `Create a short conversation title for ${OPL_ENTRY_APP_TITLE}.`,
    'Prefer the concrete workspace, project, study, or paper identifier when one is present.',
    'If a study identifier such as 004-invasive-architecture appears, start with it.',
    'Prefer titles like 004 invasive architecture over generic summaries.',
    'Never return New Chat or any other generic placeholder.',
    'Keep the title under 12 Chinese characters or 6 English words.',
    'Do not use punctuation.',
    'Prefer the domain or workspace name over generic phrases.',
    'Conversation:',
    '{convo}',
  ].join('\n');
}
