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

function formatOptionalLine(label: string, value?: string | null) {
  return value ? `- ${label}: ${value}` : null;
}

export function buildFrontDeskLibreChatWelcome(options: FrontDeskWelcomeOptions) {
  const lines = [
    `Welcome to ${OPL_FRONTDOOR_APP_TITLE}.`,
    '',
    'This shell is the family front door for multi-workspace chat, progress checks, runtime triage, and domain handoff.',
    `${OPL_FRONTDOOR_AGENT_LABEL} follows the current Codex operator profile:`,
    '',
    `- Model: ${options.codexDefaults.model}`,
    `- Thinking: ${options.codexDefaults.reasoning_effort ?? 'default'}`,
    `- Public shell: ${options.publicOrigin}/`,
    `- OPL Workspace Console: ${options.frontdeskEntryUrl}`,
    formatOptionalLine('Active workspace', options.workspacePath ?? null),
    formatOptionalLine('Bound project', options.activeProjectLabel ?? null),
    '',
    'Try asking:',
    '- 现在激活的是哪个 workspace？',
    '- 004 论文现在进度如何？',
    '- 切换到另一个项目或 workspace',
  ].filter((line): line is string => line !== null);

  return lines.join('\n');
}

export function buildFrontDeskTitlePrompt() {
  return [
    `Create a short conversation title for ${OPL_FRONTDOOR_APP_TITLE}.`,
    'Prefer the concrete workspace, project, study, or paper identifier when one is present.',
    'Keep the title under 12 Chinese characters or 6 English words.',
    'Do not use punctuation.',
    'Prefer the domain or workspace name over generic phrases.',
    'Conversation:',
    '{convo}',
  ].join('\n');
}
