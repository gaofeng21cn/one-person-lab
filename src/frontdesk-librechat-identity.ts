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
      primary_tool_name: 'opl_workspace_catalog',
      activate_tool_name: 'opl_activate_workspace',
      binding_contract_surface_id: 'opl_project_workspace_binding_contract',
    },
    session_attribution: {
      primary_tool_name: 'opl_session_ledger',
      fallback_tool_name: 'opl_runtime_status',
      attribution_surface_id: 'opl_managed_session_ledger',
    },
    discovery_order: [
      'opl_frontdesk_entry_guide',
      'opl_frontdesk_readiness',
      'opl_workspace_catalog',
      'opl_session_ledger',
      'opl_project_progress',
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
    '可直接问：论文进度、切换项目、下一步。',
    '切换项目或确认 direct entry 时，我会先检查 workspace binding。',
    '恢复长跑上下文或解释最近运行时，我会先检查 session attribution。',
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
