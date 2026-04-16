import type { LocalCodexDefaults } from './local-codex-defaults.ts';

export const OPL_FRONTDOOR_APP_TITLE = 'OPL Atlas';
export const OPL_FRONTDOOR_AGENT_LABEL = 'OPL Agent';
export const OPL_FRONTDOOR_MCP_SERVER_KEY = 'opl_cortex';
export const OPL_FRONTDOOR_MCP_SERVER_LABEL = 'OPL Cortex';

type FrontDeskWelcomeOptions = {
  publicOrigin: string;
  frontdeskEntryUrl: string;
  codexDefaults: LocalCodexDefaults;
  workspacePath?: string | null;
  activeProjectLabel?: string | null;
};

export function buildFrontDeskHostedShellMcpWiring() {
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
      auto_title_sync_surface_id: 'opl_frontdesk_librechat_title_sync',
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

export function inferFrontDeskWorkspaceLabel(options: {
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

export function buildFrontDeskLibreChatWelcome(options: FrontDeskWelcomeOptions) {
  const workspaceLabel = inferFrontDeskWorkspaceLabel({
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

export function buildFrontDeskTitlePrompt() {
  return [
    `Create a short conversation title for ${OPL_FRONTDOOR_APP_TITLE}.`,
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
